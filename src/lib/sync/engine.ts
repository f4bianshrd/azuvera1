/**
 * Sync-Engine: sendet die outbox, holt Änderungen der eigenen Daten und hält Dexie aktuell.
 * Läuft nur bei geöffneter App (Start, online, sichtbar, 1 s nach lokaler Änderung, alle 60 s).
 */
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getNetworkStatus, isVisible, onNetworkChange, onVisibilityChange, readDevicePref, requestPersistentStorage } from "@/lib/platform";
import { openUserDb, currentDb, currentUserId, type AzuveraDB, type OutboxEntry, type LocalReport } from "./db";
import { classifyError, coalesce, friendlyError, mayUseNetworkFor, readyHeads, backoffDelayMs, type ErrorKind } from "./rules";
import { getSyncStatus, setSyncStatus } from "./status";
import { PlanSyncError, executePlanOp, pullPlanData } from "./plan-sync";
import { executeInstructionOp, pullInstructionData } from "./instruction-sync";
import { executeExperienceOp, pullExperienceData } from "./experience-sync";
import { executeLeittextOp, pullLeittextData } from "./leittext-sync";

export const PREF_WIFI_ONLY = "azuvera-sync-wifi-only";
export const PREF_PHOTOS_WIFI = "azuvera-sync-photos-wifi";
export const ABSENCE_DECIDED_MESSAGE = "Die Abwesenheit wurde inzwischen entschieden. Deine Änderung wurde nicht übernommen.";
const OVERLAP_MS = 5 * 60_000;
const RECONCILE_MS = 10 * 60_000;
const FILE_CACHE_LIMIT = 50 * 1024 * 1024;
const LOG_LIMIT = 200;
const LOCAL_QUERY_KEYS = ["reports", "absences", "absent-days", "grades", "review", "my-profile", "plan", "report-links", "instructions", "experience", "leittexte"];

class SyncError extends Error {
  constructor(public kind: ErrorKind, message: string) { super(message); }
}

let queryClient: QueryClient | null = null;
let cleanup: (() => void)[] = [];
let debounce: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> | null = null;
let again = false;
let lastReconcile = 0;
let wasOffline = false;
let onAllSynced: (() => void) | null = null;

export function setAllSyncedHandler(cb: (() => void) | null): void { onAllSynced = cb; }

export function prefs() {
  return { wifiOnly: readDevicePref(PREF_WIFI_ONLY, false), photosWifiOnly: readDevicePref(PREF_PHOTOS_WIFI, true) };
}

export function requireDb(): AzuveraDB {
  const db = currentDb();
  if (!db) throw new Error("Lokaler Speicher ist nicht bereit.");
  return db;
}

export async function log(level: "info" | "warn" | "error", message: string): Promise<void> {
  const db = currentDb();
  if (!db) return;
  await db.sync_log.add({ at: Date.now(), level, message });
  const count = await db.sync_log.count();
  if (count > LOG_LIMIT) {
    const old = await db.sync_log.orderBy("at").limit(count - LOG_LIMIT).primaryKeys();
    await db.sync_log.bulkDelete(old);
  }
}

/** Oberfläche benachrichtigen (TanStack-Queries der eigenen Daten neu lesen). */
export function notifyLocalChange(): void {
  void queryClient?.invalidateQueries({ predicate: (q) => LOCAL_QUERY_KEYS.includes(String(q.queryKey[0])) });
  void refreshCounts();
}

export async function refreshCounts(): Promise<void> {
  const db = currentDb();
  if (!db) return;
  const all = await db.outbox.toArray();
  const lastSyncAt = ((await db.meta.get("lastSyncAt"))?.value as number | undefined) ?? null;
  const net = getNetworkStatus();
  const p = prefs();
  setSyncStatus({
    pending: all.length,
    failed: all.filter((e) => e.status === "failed").length,
    conflicts: all.filter((e) => e.status === "conflict").length,
    lastSyncAt,
    online: net.online,
    wifiWait: all.some((e) => e.status === "waiting" && !mayUseNetworkFor(e.op, net, p)),
  });
}

/** Eintrag in die outbox legen (mit Zusammenfassung) und Sync in 1 s anstoßen. */
export async function enqueue(entry: Pick<OutboxEntry, "record" | "op" | "payload" | "title"> & { size?: number }): Promise<void> {
  const db = requireDb();
  await db.transaction("rw", db.outbox, async () => {
    const existing = await db.outbox.where("record").equals(entry.record).toArray();
    const r = coalesce(existing, { ...entry, status: "waiting", attempts: 0, next_at: 0, created_at: Date.now() });
    if (r.update) await db.outbox.put(r.update);
    if (r.insert) await db.outbox.add(r.insert as OutboxEntry);
  });
  notifyLocalChange();
  scheduleSync();
}

export function scheduleSync(delay = 1000): void {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => void syncNow(), delay);
}

export function startSync(userId: string, qc: QueryClient): void {
  queryClient = qc;
  const db = openUserDb(userId);
  stopListeners();
  void (async () => {
    // Nach der ersten Anmeldung: dauerhaften Speicher anfragen (nur zur Anzeige).
    if (!(await db.meta.get("persistAsked"))) {
      await db.meta.put({ key: "persistAsked", value: await requestPersistentStorage() });
    }
  })();
  cleanup.push(onNetworkChange((n) => {
    setSyncStatus({ online: n.online });
    if (!n.online) wasOffline = true;
    else void syncNow();
  }));
  cleanup.push(onVisibilityChange((v) => { if (v) void syncNow(); }));
  const interval = setInterval(() => { if (isVisible() && getNetworkStatus().online) void syncNow(); }, 60_000);
  cleanup.push(() => clearInterval(interval));
  const channel = supabase
    .channel(`own-comments-${userId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "report_comments", filter: `azubi_id=eq.${userId}` }, (payload) => {
      void (async () => {
        const row = payload.new as Record<string, unknown>;
        await currentDb()?.report_comments.put({ ...(row as object), _sync: "synced", _base_version: 0 } as never);
        notifyLocalChange();
        scheduleSync(200); // Kommentar kommt oft mit Statuswechsel – Bericht nachladen
      })();
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "experience_comments", filter: `azubi_id=eq.${userId}` }, (payload) => {
      void (async () => {
        const row = payload.new as Record<string, unknown>;
        await currentDb()?.experience_comments.put({ ...(row as object), _sync: "synced", _base_version: 1 } as never);
        notifyLocalChange();
        scheduleSync(200);
      })();
    })
    .subscribe();
  cleanup.push(() => void supabase.removeChannel(channel));
  lastReconcile = 0;
  setSyncStatus({ online: getNetworkStatus().online });
  void refreshCounts();
  void syncNow();
}

function stopListeners() {
  for (const c of cleanup) c();
  cleanup = [];
}

export function stopSync(): void {
  stopListeners();
  if (debounce) clearTimeout(debounce);
  queryClient = null;
}

/** Einmal vollständig synchronisieren. force = WLAN-Bedingung ignorieren. */
export function syncNow(opts: { force?: boolean } = {}): Promise<void> {
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      do {
        again = false;
        await runOnce(!!opts.force);
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function runOnce(force: boolean): Promise<void> {
  const db = currentDb();
  const userId = currentUserId();
  if (!db || !userId) return;
  const net = getNetworkStatus();
  setSyncStatus({ online: net.online });
  if (!net.online) { wasOffline = true; await refreshCounts(); return; }
  setSyncStatus({ syncing: true });
  try {
    await push(db, userId, force);
    await pull(db, userId);
    if (Date.now() - lastReconcile > RECONCILE_MS) {
      await reconcile(db, userId);
      lastReconcile = Date.now();
    }
    await db.meta.put({ key: "lastSyncAt", value: Date.now() });
    await pruneFiles(db);
  } catch (e) {
    await log("warn", `Synchronisation unterbrochen: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    setSyncStatus({ syncing: false });
    notifyLocalChange();
    await refreshCounts();
    const s = getSyncStatus();
    if (wasOffline && s.online && s.pending === 0) {
      wasOffline = false;
      onAllSynced?.();
    }
  }
}

// ---------------- Senden ----------------
async function push(db: AzuveraDB, userId: string, force: boolean): Promise<void> {
  const p = prefs();
  for (;;) {
    if (!getNetworkStatus().online) return;
    const entries = await db.outbox.toArray();
    const heads = readyHeads(entries, Date.now(), (e) => mayUseNetworkFor(e.op, getNetworkStatus(), p, force));
    if (heads.length === 0) return;
    // Verschiedene Datensätze bis zu 2 parallel.
    for (let i = 0; i < heads.length; i += 2) {
      await Promise.all(heads.slice(i, i + 2).map((e) => runEntry(db, userId, e)));
    }
  }
}

async function runEntry(db: AzuveraDB, userId: string, e: OutboxEntry): Promise<void> {
  await db.outbox.update(e.id!, { status: "sending" });
  setSyncStatus({ syncing: true });
  try {
    await execute(db, userId, e);
    await db.outbox.delete(e.id!);
    await markRecordSynced(db, e.record);
    await log("info", `${e.title}: gesendet`);
  } catch (err) {
    const kind = err instanceof SyncError || err instanceof PlanSyncError ? err.kind : "network";
    const message = err instanceof Error ? err.message : String(err);
    if (kind === "network") {
      const online = getNetworkStatus().online;
      const attempts = online ? e.attempts + 1 : e.attempts; // offline zählt kein Versuch
      await db.outbox.update(e.id!, { status: "waiting", attempts, next_at: Date.now() + (online ? backoffDelayMs(attempts) : 0), error: null });
      await log("warn", `${e.title}: Netzwerkfehler, neuer Versuch folgt`);
    } else if (kind === "conflict") {
      await db.outbox.update(e.id!, { status: "conflict", error: message });
      await log("warn", `${e.title}: Konflikt`);
    } else if (kind === "auth") {
      await db.outbox.update(e.id!, { status: "waiting", error: message });
      throw err;
    } else {
      await db.outbox.update(e.id!, { status: "failed", error: message });
      await setRecordSync(db, e.record, "failed", message);
      await log("error", `${e.title}: ${message}`);
    }
  }
}

function tableFor(record: string) {
  const [kind] = record.split(":");
  return ({ report: "reports", attachment: "report_attachments", absence: "absences", grade: "school_grades", comment: "report_comments", instruction: "instruction_records", experience: "experience_reports", exp_attachment: "experience_attachments", exp_comment: "experience_comments", leittext: "leittext_works", lt_attachment: "leittext_attachments" } as const)[kind as "report"];
}

async function setRecordSync(db: AzuveraDB, record: string, state: "failed" | "conflict" | "pending", error?: string): Promise<void> {
  const t = tableFor(record);
  const id = record.split(":")[1]!;
  if (t) await (db[t] as AzuveraDB["reports"]).update(id, { _sync: state, _error: error ?? null });
}

async function markRecordSynced(db: AzuveraDB, record: string): Promise<void> {
  const more = await db.outbox.where("record").equals(record).count();
  if (more > 0) return;
  const t = tableFor(record);
  const id = record.split(":")[1]!;
  if (t) await (db[t] as AzuveraDB["reports"]).update(id, { _sync: "synced", _error: null });
}

type Resp<T> = { data: T; error: { code?: string | undefined; message?: string | undefined } | null; status?: number | undefined };
function check<T>(r: Resp<T>, allowDuplicate = false): T | null {
  if (!r.error) return r.data;
  const kind = classifyError({ ...r.error, status: r.status });
  if (kind === "duplicate" && allowDuplicate) return null;
  throw new SyncError(kind === "duplicate" ? "permanent" : kind, kind === "network" ? "Keine Verbindung zum Server." : friendlyError(r.error));
}

const REPORT_CONTENT = ["weekly_mode", "report_date", "activities", "school_content", "instructions", "summary"] as const;

async function execute(db: AzuveraDB, userId: string, e: OutboxEntry): Promise<void> {
  const id = String(e.payload.id ?? "");
  if (await executePlanOp(db, userId, e)) return;
  if (await executeInstructionOp(db, userId, e)) return;
  if (await executeExperienceOp(db, userId, e)) return;
  if (await executeLeittextOp(db, userId, e)) return;
  switch (e.op) {
    case "report.upsert": {
      const row = await db.reports.get(id);
      if (!row) return;
      const content = Object.fromEntries(REPORT_CONTENT.map((k) => [k, row[k]]));
      let base = row._base_version;
      if (base === null) {
        const ins = await supabase.from("reports").insert({ id, azubi_id: row.azubi_id, report_type: row.report_type, ...content } as never).select().maybeSingle();
        const created = check(ins as unknown as Resp<LocalReport | null>, true);
        if (created) { await storeServerReport(db, created, row); return; }
        // 23505: existiert schon (Wiederholung nach Netzabbruch) → laden und als vorhanden behandeln
        const { data: server } = await supabase.from("reports").select("*").eq("id", id).maybeSingle();
        if (!server) throw new SyncError("permanent", "Für diesen Zeitraum gibt es schon einen Bericht.");
        base = server.version;
        await db.reports.update(id, { _base_version: base });
      }
      const upd = await supabase.from("reports").update(content as never).eq("id", id).eq("version", base).select();
      const rows = check(upd as unknown as Resp<LocalReport[]>) ?? [];
      if (rows.length === 0) {
        const { data: server } = await supabase.from("reports").select("*").eq("id", id).maybeSingle();
        if (!server) throw new SyncError("permanent", "Der Bericht existiert auf dem Server nicht mehr.");
        await db.reports.update(id, { _sync: "conflict", _server: server });
        throw new SyncError("conflict", "Der Bericht wurde auf einem anderen Gerät geändert.");
      }
      await storeServerReport(db, rows[0]!, row);
      return;
    }
    case "report.delete": {
      check(await supabase.from("reports").delete().eq("id", id) as Resp<null>);
      return;
    }
    case "report.submit": {
      const row = await db.reports.get(id);
      if (!row) return;
      let imagePath: string | undefined;
      const sigId = e.payload.signatureId as string | undefined;
      if (sigId) {
        const sig = await db.local_signatures.get(sigId);
        imagePath = `${userId}/${sigId}.png`;
        if (sig) {
          const up = await supabase.storage.from("signatures").upload(imagePath, sig.blob, { contentType: "image/png", upsert: false });
          if (up.error && !/exists|duplicate/i.test(up.error.message)) throw new SyncError(classifyError({ message: up.error.message, status: Number((up.error as { statusCode?: string }).statusCode) || undefined }) === "network" ? "network" : "permanent", up.error.message);
        }
      }
      const args: { _report_id: string; _expected_version: number | null; _method: string | undefined; _image_path?: string; _client_signed_at?: string } = { _report_id: id, _expected_version: row._base_version, _method: e.payload.method };
      if (imagePath) args._image_path = imagePath;
      if (e.payload.clientSignedAt) args._client_signed_at = e.payload.clientSignedAt;
      const res = await supabase.rpc("submit_report", args as never);
      if (res.error) {
        const kind = classifyError({ ...res.error, status: res.status });
        if (kind === "conflict") {
          const { data: server } = await supabase.from("reports").select("*").eq("id", id).maybeSingle();
          await db.reports.update(id, { _sync: "conflict", _server: server ?? null });
          throw new SyncError("conflict", "Der Bericht wurde auf einem anderen Gerät geändert.");
        }
        throw new SyncError(kind === "duplicate" ? "permanent" : kind, kind === "network" ? "Keine Verbindung zum Server." : friendlyError(res.error));
      }
      const { data: server } = await supabase.from("reports").select("*").eq("id", id).maybeSingle();
      if (server) await db.reports.put({ ...server, _sync: "synced", _base_version: server.version, _submit_pending: false, _server: null });
      if (sigId) await db.local_signatures.delete(sigId);
      return;
    }
    case "attachment.upload": {
      const row = await db.report_attachments.get(id);
      if (!row) return;
      const original = await db.files.get(`att:${id}:original`);
      const thumb = await db.files.get(`att:${id}:thumb`);
      for (const [path, file] of [[row.storage_path, original], [row.thumb_path, thumb]] as const) {
        if (!path || !file || file.synced) continue;
        const up = await supabase.storage.from("report-files").upload(path, file.blob, { contentType: file.kind === "thumb" ? "image/jpeg" : row.mime_type, upsert: false });
        if (up.error && !/exists|duplicate/i.test(up.error.message)) {
          const status = Number((up.error as { statusCode?: string }).statusCode) || undefined;
          const kind = classifyError({ message: up.error.message, status }) === "network" ? "network" : "permanent";
          throw new SyncError(kind, kind === "network" ? "Keine Verbindung zum Server." : storageUploadMessage(up.error.message, status));
        }
        await db.files.update(file.key, { synced: true });
      }
      const { _sync, _base_version, _error, ...server } = row;
      void _sync; void _base_version; void _error;
      check(await supabase.from("report_attachments").insert({ ...server, azubi_id: userId } as never) as Resp<null>, true);
      await db.report_attachments.update(id, { _base_version: 1 });
      return;
    }
    case "attachment.update": {
      const patch = { ...(e.payload.patch as Record<string, unknown>) };
      check(await supabase.from("report_attachments").update(patch as never).eq("id", id) as Resp<null>);
      return;
    }
    case "attachment.delete": {
      check(await supabase.from("report_attachments").delete().eq("id", id) as Resp<null>);
      const paths = [e.payload.storage_path, e.payload.thumb_path].filter(Boolean) as string[];
      if (paths.length) await supabase.storage.from("report-files").remove(paths);
      return;
    }
    case "absence.upsert":
    case "grade.upsert": {
      const table = e.op === "absence.upsert" ? "absences" : "school_grades";
      const row = await (db[table] as AzuveraDB["absences"]).get(id);
      if (!row) return;
      const fields = table === "absences"
        ? { type: (row as never as { type: string }).type, date_from: (row as { date_from: string }).date_from, date_to: (row as { date_to: string }).date_to, note: row.note }
        : (({ subject, grade, grade_date, kind, note }) => ({ subject, grade, grade_date, kind, note }))(row as never as { subject: string; grade: number; grade_date: string; kind: string; note: string | null });
      if (row._base_version === null) {
        const ins = await supabase.from(table).insert({ id, azubi_id: row.azubi_id, ...fields } as never);
        if (!ins.error) { await (db[table] as AzuveraDB["absences"]).update(id, { _base_version: 1 }); return; }
        // 23505: existiert schon (Wiederholung) → als Änderung weitersenden
        if (classifyError({ ...ins.error, status: ins.status }) !== "duplicate") check(ins as Resp<null>);
      }
      const upd = await supabase.from(table).update(fields as never).eq("id", id).select();
      if (upd.error && table === "absences" && classifyError({ ...upd.error, status: upd.status }) === "permanent") {
        const { data: server } = await supabase.from("absences").select("status").eq("id", id).maybeSingle();
        if (server && server.status !== "pending") throw new SyncError("permanent", ABSENCE_DECIDED_MESSAGE);
      }
      const rows = check(upd as Resp<unknown[]>) ?? [];
      if (rows.length === 0 && table === "absences") {
        const { data: server } = await supabase.from("absences").select("status").eq("id", id).maybeSingle();
        if (server && server.status !== "pending") throw new SyncError("permanent", ABSENCE_DECIDED_MESSAGE);
      }
      await (db[table] as AzuveraDB["absences"]).update(id, { _base_version: 1 });
      return;
    }
    case "absence.delete":
    case "grade.delete": {
      check(await supabase.from(e.op === "absence.delete" ? "absences" : "school_grades").delete().eq("id", id) as Resp<null>);
      return;
    }
    case "comment.insert": {
      const row = await db.report_comments.get(id);
      if (!row) return;
      check(await supabase.from("report_comments").insert({ id, report_id: row.report_id, section: row.section, body: row.body } as never) as Resp<null>, true);
      return;
    }
    case "profile.update": {
      check(await supabase.from("profiles").update(e.payload.patch as never).eq("id", userId) as Resp<null>);
      return;
    }
  }
}

async function storeServerReport(db: AzuveraDB, server: LocalReport, sent: LocalReport): Promise<void> {
  const current = await db.reports.get(server.id);
  const changedMeanwhile = current && REPORT_CONTENT.some((k) => current[k] !== sent[k]);
  const content = changedMeanwhile ? Object.fromEntries(REPORT_CONTENT.map((k) => [k, current![k]])) : {};
  await db.reports.put({ ...server, ...content, _sync: changedMeanwhile ? "pending" : "synced", _base_version: server.version, _submit_pending: current?._submit_pending ?? false, _server: null });
}

// ---------------- Holen ----------------
async function pullTable(db: AzuveraDB, userId: string, table: "reports" | "absences" | "school_grades" | "report_comments", column: "updated_at" | "created_at"): Promise<void> {
  const key = `lastPulledAt:${table}`;
  const last = (await db.meta.get(key))?.value as string | undefined;
  const started = new Date().toISOString();
  let q = supabase.from(table).select("*").eq("azubi_id", userId);
  if (last) q = q.gt(column, new Date(new Date(last).getTime() - OVERLAP_MS).toISOString());
  const { data, error, status } = await q.limit(5000);
  if (error) throw new SyncError(classifyError({ ...error, status }), friendlyError(error));
  const store = db[table] as AzuveraDB["reports"];
  await db.transaction("rw", store, async () => {
    for (const server of (data ?? []) as LocalReport[]) {
      const local = await store.get(server.id);
      if (local && local._sync !== "synced") {
        // Lokale Änderung wartet: Serverstand nur merken (Konflikt erkennt das Senden).
        if (table === "reports" && server.status !== "draft" && server.status !== "rejected" && !local._submit_pending) {
          await store.update(server.id, { _server: server });
        }
        continue;
      }
      await store.put({ ...server, _sync: "synced", _base_version: table === "reports" ? server.version : 1, _error: null } as LocalReport);
    }
  });
  await db.meta.put({ key, value: started });
}

async function pull(db: AzuveraDB, userId: string): Promise<void> {
  await pullTable(db, userId, "reports", "updated_at");
  await pullTable(db, userId, "absences", "updated_at");
  await pullTable(db, userId, "school_grades", "updated_at");
  await pullTable(db, userId, "report_comments", "created_at");
  // Anhänge haben kein updated_at: vollständig abgleichen (wenige je Person).
  const att = await supabase.from("report_attachments").select("*").eq("azubi_id", userId);
  if (att.error) throw new SyncError(classifyError({ ...att.error, status: att.status }), friendlyError(att.error));
  await db.transaction("rw", db.report_attachments, async () => {
    for (const server of att.data ?? []) {
      const local = await db.report_attachments.get(server.id);
      if (local && local._sync !== "synced") continue;
      await db.report_attachments.put({ ...server, _sync: "synced", _base_version: 1 });
    }
  });
  // Lookups: Profil, Rolle, Beruf, Betrieb
  const [{ data: profile }, { data: role }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
  ]);
  const now = new Date().toISOString();
  if (profile) {
    await db.lookups.put({ key: "profile", value: { ...profile, role: role?.role ?? "azubi" }, updated_at: now });
    if (profile.profession_id) {
      const { data } = await supabase.from("professions").select("*").eq("id", profile.profession_id).maybeSingle();
      if (data) await db.lookups.put({ key: "profession", value: data, updated_at: now });
    }
    if (profile.company_id) {
      const { data } = await supabase.from("companies").select("*").eq("id", profile.company_id).maybeSingle();
      if (data) await db.lookups.put({ key: "company", value: data, updated_at: now });
    }
  }
  await pullPlanData(db, userId);
  await pullInstructionData(db, userId);
  await pullExperienceData(db, userId);
  await pullLeittextData(db, userId);
}

/** ID-Listen abgleichen: lokal entfernen, was auf dem Server nicht mehr existiert (sofern nichts wartet). */
async function reconcile(db: AzuveraDB, userId: string): Promise<void> {
  for (const table of ["reports", "report_attachments", "absences", "school_grades"] as const) {
    const { data, error } = await supabase.from(table).select("id").eq("azubi_id", userId);
    if (error) return;
    const ids = new Set((data ?? []).map((r) => r.id));
    const store = db[table] as AzuveraDB["reports"];
    const gone = (await store.where("_sync").equals("synced").toArray()).filter((r) => !ids.has(r.id)).map((r) => r.id);
    if (gone.length) await store.bulkDelete(gone);
  }
}

// ---------------- Datei-Zwischenspeicher ----------------
export async function pruneFiles(db: AzuveraDB): Promise<void> {
  const all = await db.files.toArray();
  let total = all.reduce((s, f) => s + f.size, 0);
  if (total <= FILE_CACHE_LIMIT) return;
  for (const f of all.filter((x) => x.synced).sort((a, b) => a.last_used_at - b.last_used_at)) {
    if (total <= FILE_CACHE_LIMIT) break;
    await db.files.delete(f.key);
    total -= f.size;
  }
}

export async function clearFileCache(): Promise<void> {
  const db = currentDb();
  if (!db) return;
  const all = await db.files.toArray();
  await db.files.bulkDelete(all.filter((f) => f.synced).map((f) => f.key));
}

/** Verständliche Meldung für abgelehnte Datei-Uploads (statt technischer Server-Texte). */
function storageUploadMessage(message: string, status: number | undefined): string {
  const m = message.toLowerCase();
  if (status === 413 || m.includes("too large") || m.includes("size")) return "Die Datei ist zu groß (höchstens 10 MB).";
  if (status === 403 || m.includes("row-level security") || m.includes("unauthorized")) return "Anhänge können nur zu Entwürfen oder zurückgewiesenen Berichten hinzugefügt werden.";
  if (m.includes("mime") || m.includes("content type")) return "Dieser Dateityp ist nicht erlaubt.";
  return "Die Datei wurde vom Server abgelehnt. Bitte versuche es erneut.";
}

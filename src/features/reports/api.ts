import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { currentDb, type LocalAttachment, type LocalReport, type SyncState } from "@/lib/sync/db";
import { changed, dropWaiting, enqueue, formatMb, hasOutbox, myId, nowIso, ownScope } from "@/lib/sync/local";
import { getNetworkStatus, openExternal } from "@/lib/platform";

export type Report = Database["public"]["Tables"]["reports"]["Row"] & {
  /** Nur bei Daten aus dem Gerätespeicher gesetzt. */
  _sync?: SyncState;
  _submit_pending?: boolean;
  _server?: Database["public"]["Tables"]["reports"]["Row"] | null;
  _error?: string | null;
};
export type ReportAttachment = Database["public"]["Tables"]["report_attachments"]["Row"] & { _sync?: SyncState; _base_version?: number | null };
export type ReportSignature = Database["public"]["Tables"]["report_signatures"]["Row"];
export type ReportVersion = Database["public"]["Tables"]["report_versions"]["Row"];
export type ReportStatus = Database["public"]["Enums"]["report_status"];
export type ReportType = Database["public"]["Enums"]["report_type"];
export type WeeklyMode = "activities" | "topics";

export const STATUS_LABELS: Record<ReportStatus, string> = {
  draft: "Entwurf",
  submitted: "Eingereicht",
  approved: "Freigegeben",
  rejected: "Zurückgewiesen",
};

export const CONFLICT_MESSAGE = "Der Bericht wurde inzwischen geändert.";

export class ReportConflictError extends Error {
  constructor() {
    super(CONFLICT_MESSAGE);
    this.name = "ReportConflictError";
  }
}

export function reportTitle(r: Pick<Report, "report_type" | "weekly_mode" | "week_number" | "year">): string {
  if (r.report_type === "weekly") {
    const mode = r.weekly_mode === "topics" ? "Themenbericht" : "Tätigkeitsbericht";
    return `Wochenbericht KW ${r.week_number}/${r.year} – ${mode}`;
  }
  return "Tagesbericht";
}

/** Inhaltsspalten, die der Client schreiben darf. */
export interface ReportDraftPatch {
  weekly_mode?: WeeklyMode;
  report_date?: string;
  activities?: string;
  school_content?: string;
  instructions?: string;
  summary?: string;
}

export interface ReportFilters {
  azubiId?: string | undefined;
  status?: ReportStatus | "all";
  type?: ReportType | "all";
  search?: string;
  limit?: number;
  offset?: number;
}

function isoWeek(dateStr: string): { year: number; week: number } {
  const date = new Date(dateStr + "T00:00:00");
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { year: d.getUTCFullYear(), week: Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7) };
}

function matchesSearch(r: Report, s: string): boolean {
  return [reportTitle(r), r.report_date, r.week_number != null ? `kw ${r.week_number}` : ""].join(" ").toLowerCase().includes(s);
}

export async function listReports(filters: ReportFilters = {}): Promise<Report[]> {
  const db = await ownScope(filters.azubiId);
  if (db) {
    let rows: Report[] = await db.reports.where("azubi_id").equals(myId()!).toArray();
    if (filters.status && filters.status !== "all") rows = rows.filter((r) => r.status === filters.status);
    if (filters.type && filters.type !== "all") rows = rows.filter((r) => r.report_type === filters.type);
    const s = filters.search?.trim().toLowerCase();
    if (s) rows = rows.filter((r) => matchesSearch(r, s));
    rows.sort((a, b) => b.report_date.localeCompare(a.report_date));
    const off = filters.offset ?? 0;
    return rows.slice(off, off + (filters.limit ?? 50));
  }
  let q = supabase.from("reports").select("*").order("report_date", { ascending: false });
  if (filters.azubiId) q = q.eq("azubi_id", filters.azubiId);
  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.type && filters.type !== "all") q = q.eq("report_type", filters.type);
  q = q.range(filters.offset ?? 0, (filters.offset ?? 0) + (filters.limit ?? 50) - 1);
  const { data, error } = await q;
  if (error) throw error;
  let rows = data ?? [];
  const s = filters.search?.trim().toLowerCase();
  if (s) {
    rows = rows.filter((r) => {
      const hay = [reportTitle(r), r.report_date, r.week_number != null ? `kw ${r.week_number}` : ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }
  return rows;
}

/** Alle Berichte eines Azubis in einem Datumsbereich (für die Abdeckung). */
export async function listReportsInRange(azubiId: string, from: string, to: string): Promise<Report[]> {
  const db = await ownScope(azubiId);
  if (db) {
    const rows = await db.reports.where("azubi_id").equals(azubiId).toArray();
    return rows.filter((r) => r.report_date >= from && r.report_date <= to).sort((a, b) => a.report_date.localeCompare(b.report_date));
  }
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("azubi_id", azubiId)
    .gte("report_date", from)
    .lte("report_date", to)
    .order("report_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface ReportDetail {
  report: Report;
  attachments: ReportAttachment[];
  signatures: ReportSignature[];
}

export async function getReport(id: string): Promise<ReportDetail | null> {
  const db = currentDb();
  const local = db ? await db.reports.get(id) : undefined;
  if (db && local) {
    const attachments = (await db.report_attachments.where("report_id").equals(id).toArray()).sort((a, b) => a.sort_order - b.sort_order);
    let signatures: ReportSignature[] = [];
    if (getNetworkStatus().online && local._base_version !== null) {
      const { data } = await supabase.from("report_signatures").select("*").eq("report_id", id).order("signed_at");
      signatures = data ?? [];
      await db.lookups.put({ key: `signatures:${id}`, value: signatures, updated_at: nowIso() });
    } else {
      signatures = ((await db.lookups.get(`signatures:${id}`))?.value as ReportSignature[] | undefined) ?? [];
    }
    return { report: local, attachments, signatures };
  }
  const [{ data: report, error }, { data: attachments }, { data: signatures }] = await Promise.all([
    supabase.from("reports").select("*").eq("id", id).maybeSingle(),
    supabase.from("report_attachments").select("*").eq("report_id", id).order("sort_order"),
    supabase.from("report_signatures").select("*").eq("report_id", id).order("signed_at"),
  ]);
  if (error) throw error;
  if (!report) return null;
  return { report, attachments: attachments ?? [], signatures: signatures ?? [] };
}

/** Vorhandenen Bericht für eine Woche/einen Tag finden (Duplikat-Prüfung). */
export async function findExistingReport(
  azubiId: string,
  type: ReportType,
  date: string,
  week?: { year: number; weekNumber: number },
): Promise<Report | null> {
  const db = await ownScope(azubiId);
  if (db) {
    const rows = await db.reports.where("azubi_id").equals(azubiId).toArray();
    return rows.find((r) => r.report_type === type && (type === "daily" ? r.report_date === date : r.year === week?.year && r.week_number === week?.weekNumber)) ?? null;
  }
  let q = supabase.from("reports").select("*").eq("azubi_id", azubiId).eq("report_type", type);
  if (type === "daily") q = q.eq("report_date", date);
  else if (week) q = q.eq("year", week.year).eq("week_number", week.weekNumber);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data;
}

function saveTitle(r: Pick<Report, "report_type" | "week_number" | "report_date">): string {
  return r.report_type === "weekly" ? `Bericht KW ${r.week_number} speichern` : `Tagesbericht ${r.report_date.split("-").reverse().join(".")} speichern`;
}

/** Entwurf anlegen – lokal mit Geräte-UUID; die outbox legt ihn später idempotent an. */
export async function createDraft(input: {
  id: string;
  azubiId: string;
  reportType: ReportType;
  weeklyMode: WeeklyMode;
  reportDate: string;
}): Promise<Report> {
  const db = currentDb();
  if (!db) throw new Error("Lokaler Speicher ist nicht bereit.");
  const w = isoWeek(input.reportDate);
  const now = nowIso();
  const row: LocalReport = {
    id: input.id, azubi_id: input.azubiId, report_type: input.reportType, weekly_mode: input.weeklyMode, report_date: input.reportDate,
    activities: "", school_content: "", instructions: "", summary: "", status: "draft", version: 0,
    week_number: input.reportType === "weekly" ? w.week : null, year: input.reportType === "weekly" ? w.year : null,
    content_hash: null, review_note: null, reviewed_at: null, reviewer_id: null, submitted_at: null, created_at: now, updated_at: now,
    _sync: "pending", _base_version: null, _submit_pending: false, _server: null,
  };
  await db.reports.put(row);
  await enqueue({ record: `report:${row.id}`, op: "report.upsert", payload: { id: row.id }, title: saveTitle(row) });
  return row;
}

/** Entwurf lokal speichern; die outbox sendet ihn mit der zuletzt bekannten version. */
export async function saveReportDraft(id: string, _expectedVersion: number, patch: ReportDraftPatch): Promise<Report> {
  void _expectedVersion;
  const db = currentDb();
  const row = db ? await db.reports.get(id) : undefined;
  if (!db || !row) throw new Error("Bericht nicht gefunden.");
  if (row._submit_pending) throw new Error("Wird eingereicht, sobald du online bist.");
  const next: LocalReport = { ...row, ...patch, updated_at: nowIso(), _sync: row._sync === "conflict" ? "conflict" : "pending" };
  if (patch.report_date && row.report_type === "weekly") {
    const w = isoWeek(patch.report_date);
    next.week_number = w.week;
    next.year = w.year;
  }
  await db.reports.put(next);
  if (row._sync !== "conflict") await enqueue({ record: `report:${id}`, op: "report.upsert", payload: { id }, title: saveTitle(next) });
  else changed();
  return next;
}

export async function deleteReport(id: string): Promise<void> {
  const db = currentDb();
  const row = db ? await db.reports.get(id) : undefined;
  if (!db || !row) {
    const { error } = await supabase.from("reports").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  const atts = await db.report_attachments.where("report_id").equals(id).toArray();
  for (const a of atts) {
    await dropWaiting(db, `attachment:${a.id}`);
    await db.files.bulkDelete([`att:${a.id}:original`, `att:${a.id}:thumb`]);
  }
  await db.report_attachments.bulkDelete(atts.map((a) => a.id));
  await dropWaiting(db, `report:${id}`);
  await db.reports.delete(id);
  if (row._base_version !== null || (await hasOutbox(db, `report:${id}`))) {
    await enqueue({ record: `report:${id}`, op: "report.delete", payload: { id }, title: "Bericht löschen" });
  } else changed();
}

/**
 * Einreichen: lokal sperren und in die outbox legen. expected_version setzt die
 * Sync-Engine erst beim Senden aus dem vorherigen Schritt; Zeitpunkt und Prüfsumme setzt der Server.
 */
export async function submitReport(input: {
  reportId: string;
  expectedVersion: number;
  method: "draw" | "click";
  signature?: Blob | null | undefined;
  clientSignedAt?: string | undefined;
}): Promise<void> {
  const db = currentDb();
  const row = db ? await db.reports.get(input.reportId) : undefined;
  if (!db || !row) throw new Error("Bericht nicht gefunden.");
  let signatureId: string | undefined;
  if (input.signature) {
    signatureId = crypto.randomUUID();
    await db.local_signatures.put({ id: signatureId, report_id: row.id, blob: input.signature, created_at: nowIso() });
  }
  await db.reports.update(row.id, { _submit_pending: true, _sync: "pending" });
  await enqueue({
    record: `report:${row.id}`, op: "report.submit",
    payload: { id: row.id, method: input.method, signatureId, clientSignedAt: input.clientSignedAt ?? nowIso() },
    title: row.report_type === "weekly" ? `Bericht KW ${row.week_number} einreichen` : "Tagesbericht einreichen",
  });
}

// ---------- Konflikte ----------
/** „Meine Version behalten“: Basis auf die Serverversion setzen und erneut senden. */
export async function keepMyVersion(id: string, merged?: ReportDraftPatch): Promise<void> {
  const db = currentDb();
  const row = db ? await db.reports.get(id) : undefined;
  if (!db || !row?._server) return;
  await db.outbox.where("record").equals(`report:${id}`).modify({ status: "waiting", attempts: 0, next_at: 0, error: null });
  await db.reports.put({ ...row, ...(merged ?? {}), _base_version: row._server.version, _sync: "pending", _server: null });
  if (!(await hasOutbox(db, `report:${id}`)) || merged) await enqueue({ record: `report:${id}`, op: "report.upsert", payload: { id }, title: saveTitle(row) });
  else changed();
}

/** „Serverversion übernehmen“: lokale Änderungen verwerfen (lokale Kopie bleibt erhalten). */
export async function takeServerVersion(id: string): Promise<void> {
  const db = currentDb();
  const row = db ? await db.reports.get(id) : undefined;
  if (!db || !row) return;
  const server = row._server;
  await dropWaiting(db, `report:${id}`);
  await db.lookups.put({ key: `local-copy:${id}`, value: { activities: row.activities, school_content: row.school_content, instructions: row.instructions, summary: row.summary }, updated_at: nowIso() });
  if (server) await db.reports.put({ ...server, _sync: "synced", _base_version: server.version, _submit_pending: false, _server: null });
  else await db.reports.delete(id);
  changed();
}

export async function localCopy(id: string): Promise<Pick<Report, "activities" | "school_content" | "instructions" | "summary"> | null> {
  return ((await currentDb()?.lookups.get(`local-copy:${id}`))?.value as never) ?? null;
}

// ---------- Anhänge ----------

/** Anhang lokal ablegen (sofort sichtbar, Status „Wartet auf Upload“) und später hochladen. */
export async function addAttachment(input: {
  report: Pick<Report, "id" | "azubi_id">;
  blob: Blob;
  thumb?: Blob | undefined;
  fileName: string;
  mimeType: string;
  width?: number | undefined;
  height?: number | undefined;
  sha256?: string | undefined;
  sortOrder: number;
}): Promise<void> {
  const db = currentDb();
  if (!db) throw new Error("Lokaler Speicher ist nicht bereit.");
  const id = crypto.randomUUID();
  const isPdf = input.mimeType === "application/pdf";
  const base = `${input.report.azubi_id}/${input.report.id}/${id}`;
  const row: LocalAttachment = {
    id, report_id: input.report.id, azubi_id: input.report.azubi_id, storage_path: `${base}.${isPdf ? "pdf" : "jpg"}`,
    thumb_path: input.thumb ? `${base}_thumb.jpg` : null, file_name: input.fileName, mime_type: input.mimeType, size_bytes: input.blob.size,
    width: input.width ?? null, height: input.height ?? null, sha256: input.sha256 ?? null, sort_order: input.sortOrder, caption: null,
    created_at: nowIso(), _sync: "pending", _base_version: null,
  };
  const now = Date.now();
  await db.transaction("rw", db.files, db.report_attachments, async () => {
    await db.files.put({ key: `att:${id}:original`, blob: input.blob, kind: "original", synced: false, size: input.blob.size, last_used_at: now });
    if (input.thumb) await db.files.put({ key: `att:${id}:thumb`, blob: input.thumb, kind: "thumb", synced: false, size: input.thumb.size, last_used_at: now });
    await db.report_attachments.put(row);
  });
  await enqueue({ record: `attachment:${id}`, op: "attachment.upload", payload: { id }, title: `${isPdf ? "PDF" : "Foto"} hochladen (${formatMb(input.blob.size)})`, size: input.blob.size });
}

export async function updateAttachment(id: string, patch: { caption?: string; sort_order?: number }): Promise<void> {
  const db = currentDb();
  const row = db ? await db.report_attachments.get(id) : undefined;
  if (!db || !row) {
    const { error } = await supabase.from("report_attachments").update(patch).eq("id", id);
    if (error) throw error;
    return;
  }
  await db.report_attachments.update(id, { ...patch, _sync: "pending" });
  if (row._base_version === null && (await hasOutbox(db, `attachment:${id}`))) { changed(); return; } // geht mit dem Upload mit
  await enqueue({ record: `attachment:${id}`, op: "attachment.update", payload: { id, patch }, title: "Anhang ändern" });
}

export async function deleteAttachment(a: ReportAttachment): Promise<void> {
  const db = currentDb();
  if (!db) throw new Error("Lokaler Speicher ist nicht bereit.");
  const row = await db.report_attachments.get(a.id);
  await dropWaiting(db, `attachment:${a.id}`);
  await db.report_attachments.delete(a.id);
  await db.files.bulkDelete([`att:${a.id}:original`, `att:${a.id}:thumb`]);
  if (row?._base_version === null && !(await hasOutbox(db, `attachment:${a.id}`))) { changed(); return; }
  await enqueue({ record: `attachment:${a.id}`, op: "attachment.delete", payload: { id: a.id, storage_path: a.storage_path, thumb_path: a.thumb_path }, title: "Anhang löschen" });
}

/** Bild-URL für Vorschau oder Original: lokal aus dem Zwischenspeicher, sonst vom Server nachladen. */
export async function attachmentUrl(a: ReportAttachment, kind: "thumb" | "original"): Promise<string> {
  const db = currentDb();
  const useKind = kind === "thumb" && !a.thumb_path ? "original" : kind;
  const key = `att:${a.id}:${useKind}`;
  const hit = db ? await db.files.get(key) : undefined;
  if (db && hit) {
    await db.files.update(key, { last_used_at: Date.now() });
    return URL.createObjectURL(hit.blob);
  }
  const path = useKind === "thumb" ? a.thumb_path! : a.storage_path;
  const url = await signedUrl("report-files", path);
  if (!db) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Datei konnte nicht geladen werden.");
  const blob = await res.blob();
  await db.files.put({ key, blob, kind: useKind, synced: true, size: blob.size, last_used_at: Date.now() }).catch(() => undefined);
  return URL.createObjectURL(blob);
}

export async function openAttachmentExternally(a: ReportAttachment): Promise<void> {
  openExternal(await attachmentUrl(a, "original"));
}

/** Signierte URL mit 5 Minuten Gültigkeit – erst beim Öffnen erzeugen. */
export async function signedUrl(bucket: string, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

/** Anzeigenamen für eine Liste von Profil-IDs (über die geschützte Funktion). */
export async function displayNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();
  if (!getNetworkStatus().online) {
    const p = (await currentDb()?.lookups.get("profile"))?.value as { id: string; full_name: string } | undefined;
    return new Map(p ? [[p.id, p.full_name]] : []);
  }
  const { data, error } = await supabase.rpc("display_names", { _ids: unique });
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.id, r.full_name]));
}

export async function reportAzubiProfile(id: string) {
  const db = await ownScope(id);
  if (db) {
    const p = (await db.lookups.get("profile"))?.value as { ausbildungsbeginn: string | null; ausbildungsende: string | null } | undefined;
    if (p) return { ausbildungsbeginn: p.ausbildungsbeginn, ausbildungsende: p.ausbildungsende };
  }
  const { data, error } = await supabase.from("profiles").select("ausbildungsbeginn, ausbildungsende").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Unterschrifts-PNG direkt hochladen (Online-Prüfungen); gibt den Pfad zurück. */
export async function uploadSignature(userId: string, png: Blob): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.png`;
  const { error } = await supabase.storage.from("signatures").upload(path, png, { contentType: "image/png", upsert: false });
  if (error) throw error;
  return path;
}

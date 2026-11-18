/**
 * Leittexte im Gerätespeicher: Katalog (für Offline-Nutzung), eigene Bearbeitungen und Fotos.
 * Wird ausschließlich von der Sync-Engine aufgerufen (outbox = einziger Schreibweg für eigene Daten).
 */
import { supabase } from "@/integrations/supabase/client";
import type { AzuveraDB, LocalLeittextWork, OutboxEntry } from "./db";
import { PlanSyncError } from "./plan-sync";
import { classifyError, friendlyError } from "./rules";

type Err = { code?: string | undefined; message?: string | undefined } | null;
function fail(error: Err, status?: number): never {
  const kind = classifyError({ ...error, status });
  throw new PlanSyncError(kind === "duplicate" ? "permanent" : kind, kind === "network" ? "Keine Verbindung zum Server." : friendlyError(error));
}
function storageFail(message: string, statusCode?: string): never {
  const status = Number(statusCode) || undefined;
  const kind = classifyError({ message, status }) === "network" ? "network" : "permanent";
  throw new PlanSyncError(kind, kind === "network" ? "Keine Verbindung zum Server." : "Das Bild konnte nicht hochgeladen werden.");
}

export const LEITTEXT_CONFLICT = "Der Leittext wurde auf einem anderen Gerät geändert.";
const FIELDS = ["header", "answers"] as const;

/** Katalog für den eigenen Beruf (Azubis) bzw. alle (andere Rollen) und eigene Bearbeitungen. */
export async function pullLeittextData(db: AzuveraDB, userId: string): Promise<void> {
  const profile = (await db.lookups.get("profile"))?.value as { role?: string } | undefined;
  const cat = await supabase.from("leittexts").select("*").eq("published", true).order("sort_order").limit(500);
  if (cat.error) fail(cat.error, cat.status);
  await db.lookups.put({ key: "leittexts", value: cat.data ?? [], updated_at: new Date().toISOString() });
  if (profile?.role !== "azubi") return;
  const [works, atts] = await Promise.all([
    supabase.from("leittext_works").select("*").eq("azubi_id", userId).limit(2000),
    supabase.from("leittext_attachments").select("*").eq("azubi_id", userId).limit(10000),
  ]);
  if (works.error) fail(works.error, works.status);
  if (atts.error) fail(atts.error, atts.status);
  await db.transaction("rw", db.leittext_works, db.leittext_attachments, async () => {
    const ids = new Set((works.data ?? []).map((r) => r.id));
    for (const l of await db.leittext_works.where("azubi_id").equals(userId).toArray()) {
      if (l._sync === "synced" && !ids.has(l.id)) await db.leittext_works.delete(l.id);
    }
    for (const server of works.data ?? []) {
      const local = await db.leittext_works.get(server.id);
      if (local && local._sync !== "synced") {
        if (server.status !== "draft" && server.status !== "rejected" && !local._submit_pending) await db.leittext_works.update(server.id, { _server: server });
        continue;
      }
      await db.leittext_works.put({ ...server, _sync: "synced", _base_version: server.version, _error: null, _submit_pending: false, _server: null });
    }
    const attIds = new Set((atts.data ?? []).map((a) => a.id));
    for (const l of await db.leittext_attachments.where("azubi_id").equals(userId).toArray()) {
      if (l._sync === "synced" && !attIds.has(l.id)) await db.leittext_attachments.delete(l.id);
    }
    for (const server of atts.data ?? []) {
      const local = await db.leittext_attachments.get(server.id);
      if (local && local._sync !== "synced") continue;
      await db.leittext_attachments.put({ ...server, _sync: "synced", _base_version: 1 });
    }
  });
}

async function storeServer(db: AzuveraDB, server: LocalLeittextWork, sent: LocalLeittextWork): Promise<void> {
  const current = await db.leittext_works.get(server.id);
  const changedMeanwhile = current && FIELDS.some((k) => JSON.stringify(current[k]) !== JSON.stringify(sent[k]));
  const content = changedMeanwhile ? { header: current!.header, answers: current!.answers } : {};
  await db.leittext_works.put({ ...server, ...content, _sync: changedMeanwhile ? "pending" : "synced", _base_version: server.version, _submit_pending: current?._submit_pending ?? false, _server: null, _error: null });
}

export async function executeLeittextOp(db: AzuveraDB, userId: string, e: OutboxEntry): Promise<boolean> {
  const id = String(e.payload.id ?? "");
  switch (e.op) {
    case "leittext.upsert": {
      const row = await db.leittext_works.get(id);
      if (!row) return true;
      const content = { header: row.header, answers: row.answers };
      let base = row._base_version;
      if (base === null) {
        const ins = await supabase.from("leittext_works").insert({ id, azubi_id: userId, leittext_id: row.leittext_id, ...content } as never).select().maybeSingle();
        if (!ins.error && ins.data) { await storeServer(db, ins.data as LocalLeittextWork, row); return true; }
        if (ins.error && classifyError({ ...ins.error, status: ins.status }) !== "duplicate") fail(ins.error, ins.status);
        const { data: server } = await supabase.from("leittext_works").select("*").eq("id", id).maybeSingle();
        if (!server) throw new PlanSyncError("permanent", "Diesen Leittext hast du schon auf einem anderen Gerät begonnen. Bitte synchronisiere.");
        base = server.version;
        await db.leittext_works.update(id, { _base_version: base });
      }
      const upd = await supabase.from("leittext_works").update(content as never).eq("id", id).eq("version", base).select();
      if (upd.error) fail(upd.error, upd.status);
      if ((upd.data ?? []).length === 0) {
        const { data: server } = await supabase.from("leittext_works").select("*").eq("id", id).maybeSingle();
        if (!server) throw new PlanSyncError("permanent", "Der Leittext existiert auf dem Server nicht mehr.");
        await db.leittext_works.update(id, { _sync: "conflict", _server: server });
        throw new PlanSyncError("conflict", LEITTEXT_CONFLICT);
      }
      await storeServer(db, upd.data![0] as LocalLeittextWork, row);
      return true;
    }
    case "leittext.delete": {
      const r = await supabase.from("leittext_works").delete().eq("id", id);
      if (r.error) fail(r.error, r.status);
      return true;
    }
    case "leittext.submit": {
      const row = await db.leittext_works.get(id);
      if (!row) return true;
      const res = await supabase.rpc("submit_leittext", { p_id: id, p_expected_version: row._base_version ?? 1 });
      if (res.error) {
        if (classifyError({ ...res.error, status: res.status }) === "conflict") {
          const { data: server } = await supabase.from("leittext_works").select("*").eq("id", id).maybeSingle();
          await db.leittext_works.update(id, { _sync: "conflict", _server: server ?? null });
          throw new PlanSyncError("conflict", LEITTEXT_CONFLICT);
        }
        fail(res.error, res.status);
      }
      const { data: server } = await supabase.from("leittext_works").select("*").eq("id", id).maybeSingle();
      if (server) await db.leittext_works.put({ ...server, _sync: "synced", _base_version: server.version, _submit_pending: false, _server: null, _error: null });
      return true;
    }
    case "leittext_attachment.upload": {
      const row = await db.leittext_attachments.get(id);
      if (!row) return true;
      for (const kind of ["original", "thumb"] as const) {
        const path = kind === "original" ? row.storage_path : row.thumb_path;
        const file = await db.files.get(`ltatt:${id}:${kind}`);
        if (!path || !file || file.synced) continue;
        const up = await supabase.storage.from("leittext-files").upload(path, file.blob, { contentType: "image/jpeg", upsert: false });
        if (up.error && !/exists|duplicate/i.test(up.error.message)) storageFail(up.error.message, (up.error as { statusCode?: string }).statusCode);
        await db.files.update(file.key, { synced: true });
      }
      const { _sync, _base_version, _error, ...server } = row;
      void _sync; void _base_version; void _error;
      const ins = await supabase.from("leittext_attachments").insert({ ...server, azubi_id: userId } as never);
      if (ins.error && classifyError({ ...ins.error, status: ins.status }) !== "duplicate") fail(ins.error, ins.status);
      await db.leittext_attachments.update(id, { _base_version: 1 });
      return true;
    }
    case "leittext_attachment.delete": {
      const r = await supabase.from("leittext_attachments").delete().eq("id", id);
      if (r.error) fail(r.error, r.status);
      const paths = [e.payload.storage_path, e.payload.thumb_path].filter(Boolean) as string[];
      if (paths.length) await supabase.storage.from("leittext-files").remove(paths);
      return true;
    }
    default:
      return false;
  }
}

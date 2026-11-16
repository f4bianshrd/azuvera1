/**
 * Erfahrungsberichte im Gerätespeicher: eigene Berichte, Anhänge und Kommentare holen und senden.
 * Wird ausschließlich von der Sync-Engine aufgerufen (outbox = einziger Schreibweg für eigene Daten).
 * Konflikte wie bei Berichten: Änderung mit id und version = _base_version, sonst Konflikt.
 */
import { supabase } from "@/integrations/supabase/client";
import type { AzuveraDB, LocalExperience, OutboxEntry } from "./db";
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
  throw new PlanSyncError(kind, kind === "network" ? "Keine Verbindung zum Server." : "Die Datei konnte nicht hochgeladen werden.");
}

export const EXPERIENCE_FIELDS = ["kind", "title", "area", "written_on", "body", "reasoning"] as const;
export const EXPERIENCE_CONFLICT = "Der Erfahrungsbericht wurde auf einem anderen Gerät geändert.";

/** Bundesländer und Vorgaben für alle; eigene Erfahrungsberichte nur für Azubis. */
export async function pullExperienceData(db: AzuveraDB, userId: string): Promise<void> {
  const now = new Date().toISOString();
  const [bl, req] = await Promise.all([
    supabase.from("bundeslaender").select("*").order("sort_order"),
    supabase.from("experience_requirements").select("*").eq("is_active", true),
  ]);
  if (bl.error) fail(bl.error, bl.status);
  if (req.error) fail(req.error, req.status);
  await db.lookups.bulkPut([
    { key: "bundeslaender", value: bl.data ?? [], updated_at: now },
    { key: "experience_requirements", value: req.data ?? [], updated_at: now },
  ]);
  const profile = (await db.lookups.get("profile"))?.value as { role?: string } | undefined;
  if (profile?.role !== "azubi") return;

  const [reps, atts, coms] = await Promise.all([
    supabase.from("experience_reports").select("*").eq("azubi_id", userId).limit(5000),
    supabase.from("experience_attachments").select("*").eq("azubi_id", userId).limit(10000),
    supabase.from("experience_comments").select("*").eq("azubi_id", userId).limit(10000),
  ]);
  if (reps.error) fail(reps.error, reps.status);
  if (atts.error) fail(atts.error, atts.status);
  if (coms.error) fail(coms.error, coms.status);
  await db.transaction("rw", db.experience_reports, db.experience_attachments, db.experience_comments, async () => {
    const ids = new Set((reps.data ?? []).map((r) => r.id));
    for (const l of await db.experience_reports.where("azubi_id").equals(userId).toArray()) {
      if (l._sync === "synced" && !ids.has(l.id)) await db.experience_reports.delete(l.id);
    }
    for (const server of reps.data ?? []) {
      const local = await db.experience_reports.get(server.id);
      if (local && local._sync !== "synced") {
        if (server.status !== "draft" && server.status !== "rejected" && !local._submit_pending) await db.experience_reports.update(server.id, { _server: server });
        continue;
      }
      await db.experience_reports.put({ ...server, _sync: "synced", _base_version: server.version, _error: null, _submit_pending: false, _server: null });
    }
    const attIds = new Set((atts.data ?? []).map((a) => a.id));
    for (const l of await db.experience_attachments.where("azubi_id").equals(userId).toArray()) {
      if (l._sync === "synced" && !attIds.has(l.id)) await db.experience_attachments.delete(l.id);
    }
    for (const server of atts.data ?? []) {
      const local = await db.experience_attachments.get(server.id);
      if (local && local._sync !== "synced") continue;
      await db.experience_attachments.put({ ...server, _sync: "synced", _base_version: 1 });
    }
    for (const server of coms.data ?? []) {
      const local = await db.experience_comments.get(server.id);
      if (local && local._sync !== "synced") continue;
      await db.experience_comments.put({ ...server, _sync: "synced", _base_version: 1 });
    }
  });
}

async function storeServer(db: AzuveraDB, server: LocalExperience, sent: LocalExperience): Promise<void> {
  const current = await db.experience_reports.get(server.id);
  const changedMeanwhile = current && EXPERIENCE_FIELDS.some((k) => current[k] !== sent[k]);
  const content = changedMeanwhile ? Object.fromEntries(EXPERIENCE_FIELDS.map((k) => [k, current![k]])) : {};
  await db.experience_reports.put({ ...server, ...content, _sync: changedMeanwhile ? "pending" : "synced", _base_version: server.version, _submit_pending: current?._submit_pending ?? false, _server: null, _error: null });
}

/** Outbox-Einträge der Erfahrungsberichte senden. Gibt false zurück, wenn die Op nicht hierher gehört. */
export async function executeExperienceOp(db: AzuveraDB, userId: string, e: OutboxEntry): Promise<boolean> {
  const id = String(e.payload.id ?? "");
  switch (e.op) {
    case "experience.upsert": {
      const row = await db.experience_reports.get(id);
      if (!row) return true;
      const content = Object.fromEntries(EXPERIENCE_FIELDS.map((k) => [k, row[k]]));
      let base = row._base_version;
      if (base === null) {
        const ins = await supabase.from("experience_reports").insert({ id, azubi_id: userId, ...content } as never).select().maybeSingle();
        if (!ins.error && ins.data) { await storeServer(db, ins.data as LocalExperience, row); return true; }
        if (ins.error && classifyError({ ...ins.error, status: ins.status }) !== "duplicate") fail(ins.error, ins.status);
        const { data: server } = await supabase.from("experience_reports").select("*").eq("id", id).maybeSingle();
        if (!server) throw new PlanSyncError("permanent", "Der Erfahrungsbericht konnte nicht angelegt werden.");
        base = server.version;
        await db.experience_reports.update(id, { _base_version: base });
      }
      const upd = await supabase.from("experience_reports").update(content as never).eq("id", id).eq("version", base).select();
      if (upd.error) fail(upd.error, upd.status);
      if ((upd.data ?? []).length === 0) {
        const { data: server } = await supabase.from("experience_reports").select("*").eq("id", id).maybeSingle();
        if (!server) throw new PlanSyncError("permanent", "Der Erfahrungsbericht existiert auf dem Server nicht mehr.");
        await db.experience_reports.update(id, { _sync: "conflict", _server: server });
        throw new PlanSyncError("conflict", EXPERIENCE_CONFLICT);
      }
      await storeServer(db, upd.data![0] as LocalExperience, row);
      return true;
    }
    case "experience.delete": {
      const r = await supabase.from("experience_reports").delete().eq("id", id);
      if (r.error) fail(r.error, r.status);
      return true;
    }
    case "experience.submit": {
      const row = await db.experience_reports.get(id);
      if (!row) return true;
      let imagePath: string | undefined;
      const sigId = e.payload.signatureId;
      if (sigId) {
        imagePath = `${userId}/${sigId}.png`;
        const sig = await db.local_signatures.get(sigId);
        if (sig) {
          const up = await supabase.storage.from("signatures").upload(imagePath, sig.blob, { contentType: "image/png", upsert: false });
          if (up.error && !/exists|duplicate/i.test(up.error.message)) storageFail(up.error.message, (up.error as { statusCode?: string }).statusCode);
        }
      }
      const args: Record<string, unknown> = { p_id: id, p_expected_version: row._base_version, p_method: e.payload.method };
      if (imagePath) args.p_image_path = imagePath;
      if (e.payload.clientSignedAt) args.p_client_signed_at = e.payload.clientSignedAt;
      const res = await supabase.rpc("submit_experience", args as never);
      if (res.error) {
        if (classifyError({ ...res.error, status: res.status }) === "conflict") {
          const { data: server } = await supabase.from("experience_reports").select("*").eq("id", id).maybeSingle();
          await db.experience_reports.update(id, { _sync: "conflict", _server: server ?? null });
          throw new PlanSyncError("conflict", EXPERIENCE_CONFLICT);
        }
        fail(res.error, res.status);
      }
      const { data: server } = await supabase.from("experience_reports").select("*").eq("id", id).maybeSingle();
      if (server) await db.experience_reports.put({ ...server, _sync: "synced", _base_version: server.version, _submit_pending: false, _server: null, _error: null });
      if (sigId) await db.local_signatures.delete(sigId);
      return true;
    }
    case "experience_attachment.upload": {
      const row = await db.experience_attachments.get(id);
      if (!row) return true;
      for (const kind of ["original", "thumb"] as const) {
        const path = kind === "original" ? row.storage_path : row.thumb_path;
        const file = await db.files.get(`expatt:${id}:${kind}`);
        if (!path || !file || file.synced) continue;
        const up = await supabase.storage.from("experience-files").upload(path, file.blob, { contentType: kind === "thumb" ? "image/jpeg" : row.mime_type, upsert: false });
        if (up.error && !/exists|duplicate/i.test(up.error.message)) storageFail(up.error.message, (up.error as { statusCode?: string }).statusCode);
        await db.files.update(file.key, { synced: true });
      }
      const { _sync, _base_version, _error, ...server } = row;
      void _sync; void _base_version; void _error;
      const ins = await supabase.from("experience_attachments").insert({ ...server, azubi_id: userId } as never);
      if (ins.error && classifyError({ ...ins.error, status: ins.status }) !== "duplicate") fail(ins.error, ins.status);
      await db.experience_attachments.update(id, { _base_version: 1 });
      return true;
    }
    case "experience_attachment.update": {
      const r = await supabase.from("experience_attachments").update({ ...(e.payload.patch ?? {}) } as never).eq("id", id);
      if (r.error) fail(r.error, r.status);
      return true;
    }
    case "experience_attachment.delete": {
      const r = await supabase.from("experience_attachments").delete().eq("id", id);
      if (r.error) fail(r.error, r.status);
      const paths = [e.payload.storage_path, e.payload.thumb_path].filter(Boolean) as string[];
      if (paths.length) await supabase.storage.from("experience-files").remove(paths);
      return true;
    }
    case "experience_comment.insert": {
      const row = await db.experience_comments.get(id);
      if (!row) return true;
      const r = await supabase.from("experience_comments").insert({ id, experience_id: row.experience_id, section: row.section, body: row.body } as never);
      if (r.error && classifyError({ ...r.error, status: r.status }) !== "duplicate") fail(r.error, r.status);
      return true;
    }
    default:
      return false;
  }
}

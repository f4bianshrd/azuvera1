/**
 * Unterweisungen im Gerätespeicher: Kataloge und eigene Nachweise holen, Entwürfe senden.
 * Wird ausschließlich von der Sync-Engine aufgerufen (outbox = einziger Schreibweg für eigene Entwürfe).
 * Konflikte: je Zeile gewinnt die jüngere Änderung (updated_at).
 */
import { supabase } from "@/integrations/supabase/client";
import type { AzuveraDB, InstructionCatalogTree, LocalInstructionRecord, OutboxEntry } from "./db";
import { PlanSyncError } from "./plan-sync";
import { classifyError, friendlyError } from "./rules";

type Err = { code?: string | undefined; message?: string | undefined } | null;
function fail(error: Err, status?: number): never {
  const kind = classifyError({ ...error, status });
  throw new PlanSyncError(kind === "duplicate" ? "permanent" : kind, kind === "network" ? "Keine Verbindung zum Server." : friendlyError(error));
}
const bySort = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;

export const RECORD_FIELDS = ["topic_id", "title", "given_on", "duration_minutes", "instructor_name", "notes"] as const;

/** Kataloge mit Themen und Punkten laden (RLS: veröffentlichte bzw. alle für die Leitung). */
export async function fetchInstructionCatalogs(ids: string[]): Promise<InstructionCatalogTree[]> {
  if (!ids.length) return [];
  const { data, error, status } = await supabase
    .from("instruction_catalogs")
    .select("*, instruction_topics(*, instruction_points(*))")
    .in("id", ids);
  if (error) fail(error, status);
  return (data ?? []).map(({ instruction_topics, ...catalog }) => ({
    catalog,
    topics: [...(instruction_topics ?? [])].sort(bySort).map(({ instruction_points, ...t }) => ({ ...t, points: [...(instruction_points ?? [])].sort(bySort) })),
  })).sort((a, b) => a.catalog.sort_order - b.catalog.sort_order || a.catalog.title.localeCompare(b.catalog.title, "de"));
}

/** Eigene Kataloge, Nachweise und besprochene Inhalte in Dexie aktualisieren (nur Azubis). */
export async function pullInstructionData(db: AzuveraDB, userId: string): Promise<void> {
  const profile = (await db.lookups.get("profile"))?.value as { role?: string } | undefined;
  if (profile?.role !== "azubi") return;
  const now = new Date().toISOString();
  const resolved = await supabase.rpc("resolve_instruction_catalogs", { p_azubi: userId });
  if (resolved.error) fail(resolved.error, resolved.status);
  const ids = (resolved.data ?? []).map((c) => c.id);
  const trees = await fetchInstructionCatalogs(ids);
  await db.transaction("rw", db.instruction_catalogs, async () => {
    await db.instruction_catalogs.clear();
    await db.instruction_catalogs.bulkPut(trees.map((tree) => ({ id: tree.catalog.id, tree, fetched_at: now })));
  });
  await db.lookups.put({ key: "instructions:resolved", value: ids, updated_at: now });

  const recs = await supabase.from("instruction_records").select("*").eq("azubi_id", userId).limit(5000);
  if (recs.error) fail(recs.error, recs.status);
  const serverIds = new Set((recs.data ?? []).map((r) => r.id));
  const pts = serverIds.size
    ? await supabase.from("instruction_record_points").select("record_id, point_id").in("record_id", [...serverIds]).limit(20000)
    : { data: [] as { record_id: string; point_id: string }[], error: null, status: 200 };
  if (pts.error) fail(pts.error, pts.status);
  await db.transaction("rw", db.instruction_records, db.instruction_record_points, async () => {
    const local = await db.instruction_records.where("azubi_id").equals(userId).toArray();
    const pending = new Set(local.filter((l) => l._sync !== "synced").map((l) => l.id));
    for (const l of local) if (l._sync === "synced" && !serverIds.has(l.id)) {
      await db.instruction_records.delete(l.id);
      await db.instruction_record_points.where("record_id").equals(l.id).delete();
    }
    for (const r of recs.data ?? []) {
      if (pending.has(r.id)) {
        const l = local.find((x) => x.id === r.id)!;
        // Serverstand jünger (z. B. bestätigt oder auf anderem Gerät geändert): Server gewinnt.
        if (r.status !== "draft" && r.status !== "rejected" || r.updated_at > l.updated_at) {
          await db.instruction_records.put({ ...r, _sync: "synced", _base_version: r.version, _error: null });
          pending.delete(r.id);
        }
        continue;
      }
      await db.instruction_records.put({ ...r, _sync: "synced", _base_version: r.version, _error: null });
    }
    const byRecord = new Map<string, string[]>();
    for (const p of pts.data ?? []) byRecord.set(p.record_id, [...(byRecord.get(p.record_id) ?? []), p.point_id]);
    for (const id of serverIds) {
      if (pending.has(id)) continue;
      await db.instruction_record_points.where("record_id").equals(id).delete();
      await db.instruction_record_points.bulkPut((byRecord.get(id) ?? []).map((point_id) => ({ record_id: id, point_id })));
    }
  });
}

/** Outbox-Einträge der Unterweisungen senden. Gibt false zurück, wenn die Op nicht hierher gehört. */
export async function executeInstructionOp(db: AzuveraDB, userId: string, e: OutboxEntry): Promise<boolean> {
  const id = String(e.payload.id ?? "");
  if (e.op === "instruction.delete") {
    const r = await supabase.from("instruction_records").delete().eq("id", id);
    if (r.error) fail(r.error, r.status);
    return true;
  }
  if (e.op !== "instruction.upsert") return false;
  const row = await db.instruction_records.get(id);
  if (!row) return true;
  const fields = Object.fromEntries(RECORD_FIELDS.map((k) => [k, row[k]])) as Partial<LocalInstructionRecord>;
  let exists = row._base_version !== null;
  if (!exists) {
    const ins = await supabase.from("instruction_records").insert({ id, azubi_id: userId, ...fields } as never);
    if (ins.error) {
      if (classifyError({ ...ins.error, status: ins.status }) !== "duplicate") fail(ins.error, ins.status);
      exists = true;
    }
  }
  if (exists) {
    const upd = await supabase.from("instruction_records").update(fields as never).eq("id", id).select("id");
    if (upd.error) fail(upd.error, upd.status);
    if ((upd.data ?? []).length === 0) throw new PlanSyncError("permanent", "Der Nachweis kann nicht mehr geändert werden.");
  }
  // Besprochene Inhalte abgleichen
  const [local, server] = await Promise.all([
    db.instruction_record_points.where("record_id").equals(id).toArray(),
    supabase.from("instruction_record_points").select("point_id").eq("record_id", id),
  ]);
  if (server.error) fail(server.error, server.status);
  const want = new Set(local.map((p) => p.point_id));
  const have = new Set((server.data ?? []).map((p) => p.point_id));
  const del = [...have].filter((x) => !want.has(x));
  const add = [...want].filter((x) => !have.has(x)).map((point_id) => ({ record_id: id, point_id }));
  if (del.length) { const r = await supabase.from("instruction_record_points").delete().eq("record_id", id).in("point_id", del); if (r.error) fail(r.error, r.status); }
  if (add.length) { const r = await supabase.from("instruction_record_points").insert(add); if (r.error && classifyError({ ...r.error, status: r.status }) !== "duplicate") fail(r.error, r.status); }
  const { data: fresh } = await supabase.from("instruction_records").select("*").eq("id", id).maybeSingle();
  const cur = await db.instruction_records.get(id);
  if (fresh && cur && cur.updated_at === row.updated_at) await db.instruction_records.put({ ...fresh, _sync: "synced", _base_version: fresh.version, _error: null });
  else if (fresh) await db.instruction_records.update(id, { _base_version: fresh.version });
  return true;
}

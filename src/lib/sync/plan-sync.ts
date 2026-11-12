/**
 * Ausbildungsplan im Gerätespeicher: Plan holen, Fortschritt und Berichtsverknüpfungen senden.
 * Wird ausschließlich von der Sync-Engine aufgerufen (outbox = einziger Schreibweg).
 */
import { supabase } from "@/integrations/supabase/client";
import type { AzuveraDB, LocalProgress, OutboxEntry, PlanTree } from "./db";
import { classifyError, friendlyError, type ErrorKind } from "./rules";

export class PlanSyncError extends Error {
  constructor(public kind: ErrorKind, message: string) { super(message); }
}

type Err = { code?: string | undefined; message?: string | undefined } | null;
function fail(error: Err, status?: number): never {
  const kind = classifyError({ ...error, status });
  throw new PlanSyncError(kind === "duplicate" ? "permanent" : kind, kind === "network" ? "Keine Verbindung zum Server." : friendlyError(error));
}

const bySort = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;

/** Plan mit allen Abschnitten, Gruppen und Punkten laden (RLS: nur sichtbare Pläne). */
export async function fetchPlanTree(planId: string): Promise<PlanTree | null> {
  const { data, error, status } = await supabase
    .from("training_plans")
    .select("*, plan_sections(*, plan_groups(*, plan_items(*)))")
    .eq("id", planId)
    .maybeSingle();
  if (error) fail(error, status);
  if (!data) return null;
  const { plan_sections, ...plan } = data;
  return {
    plan,
    sections: [...(plan_sections ?? [])].sort(bySort).map(({ plan_groups, ...s }) => ({
      ...s,
      groups: [...(plan_groups ?? [])].sort(bySort).map(({ plan_items, ...g }) => ({ ...g, items: [...(plan_items ?? [])].sort(bySort) })),
    })),
  };
}

/** Plan, Fortschritt, Themen und Verknüpfungen der eigenen Person in Dexie aktualisieren (nur Azubis). */
export async function pullPlanData(db: AzuveraDB, userId: string): Promise<void> {
  const profile = (await db.lookups.get("profile"))?.value as { role?: string; profession_id?: string | null } | undefined;
  if (profile?.role !== "azubi") return;
  const now = new Date().toISOString();
  const [resolved, selectable] = await Promise.all([
    supabase.rpc("resolve_plan", { p_azubi: userId }),
    supabase.rpc("list_selectable_plans", { p_azubi: userId }),
  ]);
  if (resolved.error) fail(resolved.error, resolved.status);
  if (selectable.error) fail(selectable.error, selectable.status);
  const planId = (resolved.data as string | null) ?? null;
  await db.lookups.put({ key: "plan:resolved", value: planId, updated_at: now });
  await db.lookups.put({ key: "plan:selectable", value: selectable.data ?? [], updated_at: now });
  if (planId) {
    const tree = await fetchPlanTree(planId);
    if (tree) await db.plans.put({ id: planId, tree, fetched_at: now });
  }
  await db.plans.where("id").notEqual(planId ?? "").delete();

  // Fortschritt: alle eigenen Zeilen; wartende lokale Änderungen bleiben unangetastet.
  const prog = await supabase.from("plan_progress").select("azubi_id, item_id, year, planned, mastered, updated_at").eq("azubi_id", userId).limit(20000);
  if (prog.error) fail(prog.error, prog.status);
  await db.transaction("rw", db.plan_progress, async () => {
    const local = await db.plan_progress.where("azubi_id").equals(userId).toArray();
    const server = new Map((prog.data ?? []).map((r) => [`${r.item_id}:${r.year}`, r]));
    for (const l of local) {
      if (l._sync !== "synced") continue;
      if (!server.has(`${l.item_id}:${l.year}`)) await db.plan_progress.delete([l.azubi_id, l.item_id, l.year]);
    }
    for (const r of prog.data ?? []) {
      const l = await db.plan_progress.get([userId, r.item_id, r.year]);
      if (l && l._sync !== "synced") continue;
      await db.plan_progress.put({ ...r, mastered: r.mastered as LocalProgress["mastered"], _sync: "synced" });
    }
  });

  // Themen des eigenen Berufs
  if (profile.profession_id) {
    const t = await supabase.from("training_topics").select("*").eq("profession_id", profile.profession_id).limit(2000);
    if (t.error) fail(t.error, t.status);
    await db.transaction("rw", db.training_topics, async () => {
      await db.training_topics.clear();
      await db.training_topics.bulkPut(t.data ?? []);
    });
  }

  // Berichtsverknüpfungen (RLS: nur eigene Berichte); Berichte mit wartender Änderung bleiben lokal.
  const [rt, ri, waiting] = await Promise.all([
    supabase.from("report_topics").select("*").limit(20000),
    supabase.from("report_plan_items").select("*").limit(20000),
    db.outbox.where("op").equals("report.links").toArray().catch(async () => (await db.outbox.toArray()).filter((e) => e.op === "report.links")),
  ]);
  if (rt.error) fail(rt.error, rt.status);
  if (ri.error) fail(ri.error, ri.status);
  const pending = new Set(waiting.map((e) => String(e.payload.id)));
  await db.transaction("rw", db.report_topics, db.report_plan_items, async () => {
    for (const t of (await db.report_topics.toArray()).filter((x) => !pending.has(x.report_id))) await db.report_topics.delete([t.report_id, t.topic_id]);
    for (const t of (await db.report_plan_items.toArray()).filter((x) => !pending.has(x.report_id))) await db.report_plan_items.delete([t.report_id, t.item_id]);
    await db.report_topics.bulkPut((rt.data ?? []).filter((x) => !pending.has(x.report_id)));
    await db.report_plan_items.bulkPut((ri.data ?? []).filter((x) => !pending.has(x.report_id)));
  });
}

/** Outbox-Einträge des Ausbildungsplans senden. Gibt false zurück, wenn die Op nicht hierher gehört. */
export async function executePlanOp(db: AzuveraDB, userId: string, e: OutboxEntry): Promise<boolean> {
  if (e.op === "progress.upsert") {
    const [itemId, yearStr] = String(e.payload.id ?? "").split(":");
    const key: [string, string, number] = [userId, itemId!, Number(yearStr)];
    const row = await db.plan_progress.get(key);
    if (!row) return true;
    const { _sync, ...data } = row;
    void _sync;
    const res = await supabase.from("plan_progress").upsert(data, { onConflict: "azubi_id,item_id,year" });
    if (res.error) fail(res.error, res.status);
    const now = await db.plan_progress.get(key);
    if (now && now.updated_at === row.updated_at) {
      if (!now.planned && !now.mastered) await db.plan_progress.delete(key);
      else await db.plan_progress.update(key, { _sync: "synced" });
    }
    return true;
  }
  if (e.op === "report.links") {
    const reportId = String(e.payload.id ?? "");
    const [localTopics, localItems, st, si] = await Promise.all([
      db.report_topics.where("report_id").equals(reportId).toArray(),
      db.report_plan_items.where("report_id").equals(reportId).toArray(),
      supabase.from("report_topics").select("topic_id").eq("report_id", reportId),
      supabase.from("report_plan_items").select("item_id").eq("report_id", reportId),
    ]);
    if (st.error) fail(st.error, st.status);
    if (si.error) fail(si.error, si.status);
    const wantT = new Set(localTopics.map((t) => t.topic_id));
    const wantI = new Set(localItems.map((t) => t.item_id));
    const haveT = new Set((st.data ?? []).map((t) => t.topic_id));
    const haveI = new Set((si.data ?? []).map((t) => t.item_id));
    const delT = [...haveT].filter((x) => !wantT.has(x));
    const delI = [...haveI].filter((x) => !wantI.has(x));
    if (delT.length) { const r = await supabase.from("report_topics").delete().eq("report_id", reportId).in("topic_id", delT); if (r.error) fail(r.error, r.status); }
    if (delI.length) { const r = await supabase.from("report_plan_items").delete().eq("report_id", reportId).in("item_id", delI); if (r.error) fail(r.error, r.status); }
    const addT = [...wantT].filter((x) => !haveT.has(x)).map((topic_id) => ({ report_id: reportId, topic_id }));
    const addI = [...wantI].filter((x) => !haveI.has(x)).map((item_id) => ({ report_id: reportId, item_id }));
    if (addT.length) { const r = await supabase.from("report_topics").insert(addT); if (r.error && classifyError({ ...r.error, status: r.status }) !== "duplicate") fail(r.error, r.status); }
    if (addI.length) { const r = await supabase.from("report_plan_items").insert(addI); if (r.error && classifyError({ ...r.error, status: r.status }) !== "duplicate") fail(r.error, r.status); }
    return true;
  }
  return false;
}

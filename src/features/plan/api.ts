/**
 * Datenzugriff des Ausbildungsplans. Eigene Daten (Azubis) kommen aus dem Gerätespeicher (Dexie) und
 * gehen über die outbox; fremde Pläne (Prüfende, Leitung) werden online gelesen und nur zwischengespeichert.
 */
import { format, startOfISOWeek } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import type { LocalProgress, PlanTree } from "@/lib/sync/db";
import { currentDb } from "@/lib/sync/db";
import { syncNow } from "@/lib/sync/engine";
import { cachedOnline } from "@/lib/sync/online-cache";
import { fetchPlanTree } from "@/lib/sync/plan-sync";
import { changed, enqueue, myId, nowIso, ownScope } from "@/lib/sync/local";
import { getNetworkStatus } from "@/lib/platform";
import type { Mastered } from "./stats";

type T = Database["public"]["Tables"];
type F = Database["public"]["Functions"];
export type { PlanTree };
export type TrainingPlan = T["training_plans"]["Row"];
export type PlanItem = T["plan_items"]["Row"];
export type Topic = T["training_topics"]["Row"];
export type SelectablePlan = F["list_selectable_plans"]["Returns"][number];
export type ProgressRow = Pick<LocalProgress, "azubi_id" | "item_id" | "year" | "planned" | "mastered" | "updated_at"> & { _sync?: LocalProgress["_sync"] };
export interface ReportLite { id: string; report_type: string; report_date: string; status: string; week_number: number | null; year: number | null }

export const MAX_LINKS = 30;
export const OFFLINE_MESSAGE = "Dafür brauchst du eine Internetverbindung.";

export interface AzubiInfo {
  id: string;
  full_name: string;
  profession_id: string | null;
  profession_name: string | null;
  company_name: string | null;
  company_address: string | null;
  ausbildungsbeginn: string | null;
  ausbildungsende: string | null;
}

export interface PlanData {
  azubi: AzubiInfo;
  own: boolean;
  planId: string | null;
  selectable: SelectablePlan[];
  tree: PlanTree | null;
  progress: ProgressRow[];
  topics: Topic[];
  itemLinks: { report_id: string; item_id: string }[];
  topicLinks: { report_id: string; topic_id: string }[];
  reports: ReportLite[];
}

export interface PersonOption { id: string; full_name: string; profession_id: string | null }

function online(): boolean {
  return getNetworkStatus().online;
}
function requireOnline(): void {
  if (!online()) throw new Error(OFFLINE_MESSAGE);
}

const lite = (r: ReportLite): ReportLite => ({ id: r.id, report_type: r.report_type, report_date: r.report_date, status: r.status, week_number: r.week_number, year: r.year });

/** Personen, die die angemeldete Person sehen darf (für „Person wählen“). */
export async function listViewablePersons(): Promise<PersonOption[]> {
  return cachedOnline("plan:persons", async () => {
    const week = format(startOfISOWeek(new Date()), "yyyy-MM-dd");
    const { data: overview, error } = await supabase.rpc("team_week_overview", { week_start: week });
    if (error) throw error;
    const ids = [...new Set((overview ?? []).map((r) => r.azubi_id))];
    if (!ids.length) return [];
    const { data, error: e2 } = await supabase.from("profiles").select("id, full_name, profession_id").in("id", ids).order("nachname");
    if (e2) throw e2;
    return data ?? [];
  });
}

/** Alles, was die Seite /ausbildungsplan für eine Person braucht. */
export async function loadPlanData(azubiId: string): Promise<PlanData> {
  const db = await ownScope(azubiId);
  if (db) {
    if ((await db.lookups.get("plan:resolved")) === undefined && online()) await syncNow();
    const [profile, profession, company, resolved, selectable] = await Promise.all([
      db.lookups.get("profile"), db.lookups.get("profession"), db.lookups.get("company"),
      db.lookups.get("plan:resolved"), db.lookups.get("plan:selectable"),
    ]);
    const p = (profile?.value ?? {}) as Partial<T["profiles"]["Row"]>;
    const prof = profession?.value as { id: string; name: string } | undefined;
    const comp = company?.value as { name: string; address: string | null } | undefined;
    const planId = (resolved?.value as string | null | undefined) ?? null;
    const plan = planId ? await db.plans.get(planId) : undefined;
    const [progress, topics, itemLinks, topicLinks, reports] = await Promise.all([
      db.plan_progress.where("azubi_id").equals(azubiId).toArray(),
      db.training_topics.toArray(),
      db.report_plan_items.toArray(),
      db.report_topics.toArray(),
      db.reports.where("azubi_id").equals(azubiId).toArray(),
    ]);
    return {
      own: true,
      azubi: {
        id: azubiId, full_name: p.full_name ?? "", profession_id: p.profession_id ?? null,
        profession_name: p.profession_id && prof?.id === p.profession_id ? prof.name : null,
        company_name: comp?.name ?? null, company_address: comp?.address ?? null,
        ausbildungsbeginn: p.ausbildungsbeginn ?? null, ausbildungsende: p.ausbildungsende ?? null,
      },
      planId, selectable: (selectable?.value as SelectablePlan[] | undefined) ?? [],
      tree: plan?.tree ?? null,
      progress: progress.filter((r) => r.planned || r.mastered),
      topics: topics.filter((t) => t.profession_id === p.profession_id),
      itemLinks: itemLinks.map(({ report_id, item_id }) => ({ report_id, item_id })),
      topicLinks: topicLinks.map(({ report_id, topic_id }) => ({ report_id, topic_id })),
      reports: reports.map(lite),
    };
  }
  return cachedOnline(`plan:${azubiId}`, () => fetchPlanDataOnline(azubiId));
}

async function fetchPlanDataOnline(azubiId: string): Promise<PlanData> {
  const [profile, header, resolved, selectable, reports] = await Promise.all([
    supabase.from("profiles").select("id, full_name, profession_id, ausbildungsbeginn, ausbildungsende").eq("id", azubiId).maybeSingle(),
    supabase.rpc("export_header", { p_azubi: azubiId }),
    supabase.rpc("resolve_plan", { p_azubi: azubiId }),
    supabase.rpc("list_selectable_plans", { p_azubi: azubiId }),
    supabase.from("reports").select("id, report_type, report_date, status, week_number, year").eq("azubi_id", azubiId).limit(5000),
  ]);
  if (profile.error) throw profile.error;
  if (!profile.data) throw new Error("Diese Person ist nicht sichtbar.");
  if (resolved.error) throw resolved.error;
  const h = header.data?.[0];
  const planId = (resolved.data as string | null) ?? null;
  const [tree, progress, topics] = await Promise.all([
    planId ? fetchPlanTree(planId) : Promise.resolve(null),
    supabase.from("plan_progress").select("azubi_id, item_id, year, planned, mastered, updated_at").eq("azubi_id", azubiId).limit(20000),
    profile.data.profession_id ? supabase.from("training_topics").select("*").eq("profession_id", profile.data.profession_id) : Promise.resolve({ data: [] as Topic[], error: null }),
  ]);
  if (progress.error) throw progress.error;
  const reportIds = (reports.data ?? []).map((r) => r.id);
  const itemLinks: PlanData["itemLinks"] = [];
  const topicLinks: PlanData["topicLinks"] = [];
  for (let i = 0; i < reportIds.length; i += 200) {
    const ids = reportIds.slice(i, i + 200);
    const [a, b] = await Promise.all([
      supabase.from("report_plan_items").select("report_id, item_id").in("report_id", ids),
      supabase.from("report_topics").select("report_id, topic_id").in("report_id", ids),
    ]);
    itemLinks.push(...(a.data ?? []));
    topicLinks.push(...(b.data ?? []));
  }
  return {
    own: false,
    azubi: {
      id: azubiId, full_name: profile.data.full_name, profession_id: profile.data.profession_id,
      profession_name: h?.profession_name ?? null, company_name: h?.company_name ?? null, company_address: h?.company_address ?? null,
      ausbildungsbeginn: profile.data.ausbildungsbeginn, ausbildungsende: profile.data.ausbildungsende,
    },
    planId, selectable: selectable.data ?? [], tree,
    progress: (progress.data ?? []).map((r) => ({ ...r, mastered: r.mastered as Mastered })),
    topics: topics.data ?? [], itemLinks, topicLinks, reports: (reports.data ?? []).map(lite),
  };
}

/** Fortschritt einer Zelle lokal speichern und über die outbox senden (nur eigene Zeilen). */
export async function setProgress(itemId: string, year: number, patch: { planned?: boolean; mastered?: Mastered }): Promise<void> {
  const uid = myId();
  const db = await ownScope(uid ?? undefined);
  if (!db || !uid) throw new Error("Nur-Lese-Ansicht: fremder Ausbildungsplan.");
  const key: [string, string, number] = [uid, itemId, year];
  const cur = await db.plan_progress.get(key);
  await db.plan_progress.put({
    azubi_id: uid, item_id: itemId, year,
    planned: patch.planned ?? cur?.planned ?? false,
    mastered: patch.mastered ?? cur?.mastered ?? "",
    updated_at: nowIso(), _sync: "pending",
  });
  await enqueue({ record: `progress:${itemId}:${year}`, op: "progress.upsert", payload: { id: `${itemId}:${year}` }, title: "Ausbildungsplan: Fortschritt speichern" });
}

/** Plan zuordnen (null = automatisch). Online-Aktion. */
export async function setAzubiPlan(azubiId: string, planId: string | null): Promise<void> {
  requireOnline();
  const { error } = await supabase.rpc("set_azubi_plan", { p_azubi: azubiId, p_plan: planId as string });
  if (error) throw error;
  if (azubiId === myId()) await syncNow();
}

// ---------- Themen (Ausbildungsleitung) ----------
export interface TopicInput { id?: string; profession_id: string; code: string; title: string; description: string; target_year: number | null; sort_order: number }

export async function saveTopic(t: TopicInput): Promise<void> {
  requireOnline();
  const row = {
    profession_id: t.profession_id, code: t.code.trim() || null, title: t.title.trim(),
    description: t.description.trim() || null, target_year: t.target_year, sort_order: t.sort_order,
  };
  const res = t.id ? await supabase.from("training_topics").update(row).eq("id", t.id) : await supabase.from("training_topics").insert({ id: crypto.randomUUID(), ...row });
  if (res.error) throw res.error;
  if (currentDb()) void syncNow();
}

export async function deleteTopic(id: string): Promise<void> {
  requireOnline();
  const { error } = await supabase.from("training_topics").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Berichtsverknüpfungen ----------
export interface LinkChip { id: string; kind: "item" | "topic"; label: string; group?: string }
export interface ReportLinks { items: LinkChip[]; topics: LinkChip[] }

function itemIndex(tree: PlanTree | null): Map<string, { label: string; reference: string | null; group: string }> {
  const m = new Map<string, { label: string; reference: string | null; group: string }>();
  for (const s of tree?.sections ?? []) for (const g of s.groups) for (const i of g.items) m.set(i.id, { label: i.label, reference: i.reference, group: g.title });
  return m;
}
const itemLabel = (i: { label: string; reference: string | null }) => (i.reference ? `${i.reference} ${i.label}` : i.label);
const topicLabel = (t: { code: string | null; title: string }) => (t.code ? `${t.code} ${t.title}` : t.title);

/** Verknüpfte Inhalte eines Berichts (eigene aus dem Gerät, fremde online). */
export async function getReportLinks(reportId: string, azubiId: string): Promise<ReportLinks> {
  const db = await ownScope(azubiId);
  if (db) {
    const [items, topics, resolved] = await Promise.all([
      db.report_plan_items.where("report_id").equals(reportId).toArray(),
      db.report_topics.where("report_id").equals(reportId).toArray(),
      db.lookups.get("plan:resolved"),
    ]);
    const plan = resolved?.value ? await db.plans.get(resolved.value as string) : undefined;
    const idx = itemIndex(plan?.tree ?? null);
    const allTopics = new Map((await db.training_topics.toArray()).map((t) => [t.id, t]));
    const missing = items.some((i) => !idx.has(i.item_id)) || topics.some((t) => !allTopics.has(t.topic_id));
    if (!missing || !online()) {
      return {
        items: items.map((i) => { const x = idx.get(i.item_id); return { id: i.item_id, kind: "item" as const, label: x ? itemLabel(x) : "Inhalt aus einem früheren Plan", group: x?.group ?? "" }; }),
        topics: topics.map((t) => { const x = allTopics.get(t.topic_id); return { id: t.topic_id, kind: "topic" as const, label: x ? topicLabel(x) : "Thema" }; }),
      };
    }
  }
  const [a, b] = await Promise.all([
    supabase.from("report_plan_items").select("item_id, plan_items(label, reference, plan_groups(title))").eq("report_id", reportId),
    supabase.from("report_topics").select("topic_id, training_topics(code, title)").eq("report_id", reportId),
  ]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
  return {
    items: (a.data ?? []).map((r) => ({ id: r.item_id, kind: "item" as const, label: r.plan_items ? itemLabel(r.plan_items) : "Inhalt", group: r.plan_items?.plan_groups?.title ?? "" })),
    topics: (b.data ?? []).map((r) => ({ id: r.topic_id, kind: "topic" as const, label: r.training_topics ? topicLabel(r.training_topics) : "Thema" })),
  };
}

/** Auswahl für den Dialog „Inhalte zuordnen“ (eigener Plan und Themen des Berufs). */
export async function linkOptions(): Promise<{ tree: PlanTree | null; topics: Topic[] }> {
  const db = await ownScope(myId() ?? undefined);
  if (!db) return { tree: null, topics: [] };
  const resolved = await db.lookups.get("plan:resolved");
  if (resolved === undefined && online()) await syncNow();
  const planId = (await db.lookups.get("plan:resolved"))?.value as string | null | undefined;
  const plan = planId ? await db.plans.get(planId) : undefined;
  const profession = ((await db.lookups.get("profile"))?.value as { profession_id?: string | null } | undefined)?.profession_id;
  const topics = (await db.training_topics.toArray()).filter((t) => t.profession_id === profession);
  return { tree: plan?.tree ?? null, topics };
}

/** Verknüpfungen eines eigenen Berichts ersetzen (lokal, dann über die outbox). */
export async function setReportLinks(reportId: string, itemIds: string[], topicIds: string[]): Promise<void> {
  const db = await ownScope(myId() ?? undefined);
  if (!db) throw new Error("Nur eigene Berichte lassen sich verknüpfen.");
  if (itemIds.length + topicIds.length > MAX_LINKS) throw new Error(`Höchstens ${MAX_LINKS} Inhalte je Bericht.`);
  const report = await db.reports.get(reportId);
  if (!report || !(report.status === "draft" || report.status === "rejected") || report._submit_pending) throw new Error("Der Bericht ist eingereicht und lässt sich nicht mehr ändern.");
  const now = nowIso();
  await db.transaction("rw", db.report_plan_items, db.report_topics, async () => {
    await db.report_plan_items.where("report_id").equals(reportId).delete();
    await db.report_topics.where("report_id").equals(reportId).delete();
    await db.report_plan_items.bulkPut([...new Set(itemIds)].map((item_id) => ({ report_id: reportId, item_id, created_at: now })));
    await db.report_topics.bulkPut([...new Set(topicIds)].map((topic_id) => ({ report_id: reportId, topic_id, created_at: now })));
  });
  await enqueue({ record: `report:${reportId}`, op: "report.links", payload: { id: reportId }, title: "Ausbildungsinhalte zuordnen" });
}

/** Lokale Verknüpfungen eines gelöschten Berichts entfernen. */
export async function dropLocalLinks(reportId: string): Promise<void> {
  const db = currentDb();
  if (!db) return;
  await db.report_plan_items.where("report_id").equals(reportId).delete();
  await db.report_topics.where("report_id").equals(reportId).delete();
  changed();
}

/** Verknüpfungen für das Berichts-PDF (online, RLS). */
export async function reportLinksForPdf(reportId: string): Promise<{ items: { group: string; label: string }[]; topics: { code: string | null; title: string }[] }> {
  const [a, b] = await Promise.all([
    supabase.from("report_plan_items").select("plan_items(label, reference, sort_order, plan_groups(title, sort_order))").eq("report_id", reportId),
    supabase.from("report_topics").select("training_topics(code, title, sort_order)").eq("report_id", reportId),
  ]);
  const items = (a.data ?? []).flatMap((r) => (r.plan_items ? [r.plan_items] : []))
    .sort((x, y) => (x.plan_groups?.sort_order ?? 0) - (y.plan_groups?.sort_order ?? 0) || x.sort_order - y.sort_order)
    .map((i) => ({ group: i.plan_groups?.title ?? "", label: itemLabel(i) }));
  const topics = (b.data ?? []).flatMap((r) => (r.training_topics ? [r.training_topics] : []))
    .sort((x, y) => x.sort_order - y.sort_order).map((t) => ({ code: t.code, title: t.title }));
  return { items, topics };
}

// ---------- Plan-Verwaltung (Ausbildungsleitung, online) ----------
export interface PlanSummary extends TrainingPlan {
  profession_name: string;
  profession_code: string | null;
  sections: number;
  groups: number;
  items: number;
}

export async function listPlansAdmin(): Promise<PlanSummary[]> {
  requireOnline();
  const { data, error } = await supabase
    .from("training_plans")
    .select("*, professions(name, code), plan_sections(id, plan_groups(id, plan_items(id, is_active)))")
    .order("sort_order").order("title");
  if (error) throw error;
  return (data ?? []).map(({ professions, plan_sections, ...p }) => {
    const groups = (plan_sections ?? []).flatMap((s) => s.plan_groups ?? []);
    return {
      ...p, profession_name: professions?.name ?? "–", profession_code: professions?.code ?? null,
      sections: (plan_sections ?? []).length, groups: groups.length,
      items: groups.flatMap((g) => g.plan_items ?? []).filter((i) => i.is_active).length,
    };
  });
}

export async function exportPlanJson(planId: string): Promise<PlanJson> {
  requireOnline();
  const { data, error } = await supabase.rpc("export_plan_json", { p_plan: planId });
  if (error) throw error;
  return data as unknown as PlanJson;
}

export async function savePlanJson(json: PlanJson): Promise<string> {
  requireOnline();
  const { data, error } = await supabase.rpc("admin_save_plan", { p_plan: json as unknown as Json });
  if (error) throw error;
  return data as string;
}

export async function setPlanStatus(planId: string, status: "draft" | "published"): Promise<void> {
  requireOnline();
  const { error } = await supabase.rpc("admin_set_plan_status", { p_plan: planId, p_status: status });
  if (error) throw error;
}

export async function duplicatePlan(planId: string, code: string, title: string): Promise<string> {
  requireOnline();
  const { data, error } = await supabase.rpc("admin_duplicate_plan", { p_plan: planId, p_code: code, p_title: title });
  if (error) throw error;
  return data as string;
}

export async function planItemUsage(planId: string): Promise<Map<string, boolean>> {
  requireOnline();
  const { data, error } = await supabase.rpc("admin_plan_item_usage", { p_plan: planId });
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.item_key, r.used]));
}

export async function plansForProfession(professionId: string | null): Promise<TrainingPlan[]> {
  if (!professionId) return [];
  const { data, error } = await supabase.from("training_plans").select("*").eq("profession_id", professionId).eq("status", "published").eq("is_template", false).order("title");
  if (error) throw error;
  return data ?? [];
}

export async function assignedPlans(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("azubi_plans").select("azubi_id, plan_id");
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.azubi_id, r.plan_id]));
}

// ---------- JSON-Format ----------
export interface PlanJsonItem { key: string; label: string; reference?: string | null }
export interface PlanJsonGroup { key: string; title: string; reference?: string | null; weeks_text?: string | null; hint?: string | null; items: PlanJsonItem[] }
export interface PlanJsonSection { key: string; title: string; kind?: "content" | "checklist"; hint?: string | null; groups: PlanJsonGroup[] }
export interface PlanJson {
  plan: { code: string; profession_code: string; title: string; subtitle?: string | null; source?: string | null; valid_from?: string | null; valid_until?: string | null; duration_years?: number; is_template?: boolean; status?: "draft" | "published" };
  sections: PlanJsonSection[];
}

/** Themen eines Berufs (online, z. B. für die Leitung ohne gewählte Person). */
export async function listTopics(professionId: string): Promise<Topic[]> {
  return cachedOnline(`plan:topics:${professionId}`, async () => {
    const { data, error } = await supabase.from("training_topics").select("*").eq("profession_id", professionId).order("sort_order");
    if (error) throw error;
    return data ?? [];
  });
}

/** Export im Änderungsprotokoll vermerken (offline ohne Eintrag). */
export async function logPlanExport(azubiId: string, kind: "plan_pdf" | "plan_odt"): Promise<void> {
  if (!online()) return;
  await supabase.rpc("log_export", { p_azubi: azubiId, p_kind: kind, p_count: 1, p_from: null as unknown as string, p_to: null as unknown as string });
}

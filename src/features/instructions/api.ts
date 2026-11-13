/**
 * Datenzugriff der Unterweisungen. Eigene Daten (Azubis) kommen aus dem Gerätespeicher (Dexie) und gehen über
 * die outbox; fremde Nachweise werden online gelesen und nur zwischengespeichert. Einreichen, Bestätigen,
 * Zurückweisen, Wieder öffnen, Katalog-Editor und Export sind Online-Aktionen.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { InstructionCatalogTree, LocalInstructionRecord } from "@/lib/sync/db";
import { syncNow } from "@/lib/sync/engine";
import { cachedOnline } from "@/lib/sync/online-cache";
import { fetchInstructionCatalogs } from "@/lib/sync/instruction-sync";
import { changed, dropWaiting, enqueue, hasOutbox, myId, nowIso, ownScope } from "@/lib/sync/local";
import { getNetworkStatus } from "@/lib/platform";
import type { CatalogJson } from "./json";

type T = Database["public"]["Tables"];
export type { InstructionCatalogTree };
export type InstructionRecord = T["instruction_records"]["Row"] & { _sync?: LocalInstructionRecord["_sync"] };
export type InstructionTopic = InstructionCatalogTree["topics"][number];
export type InstructionPoint = InstructionTopic["points"][number];
export type PendingInstruction = Database["public"]["Functions"]["instruction_pending"]["Returns"][number];

export const OFFLINE_MESSAGE = "Dafür brauchst du eine Internetverbindung.";
export const READ_ONLY_TOAST = "Nur-Lese-Ansicht: fremde Unterweisungen.";
export const CHANGED_MESSAGE = "Der Nachweis wurde inzwischen geändert.";

export interface InstructionPerson {
  id: string; full_name: string; vorname: string; nachname: string;
  profession_id: string | null; geburtsdatum: string | null; role: string | null;
}
export interface InstructionData {
  own: boolean;
  person: InstructionPerson;
  catalogs: InstructionCatalogTree[];
  records: InstructionRecord[];
  recordPoints: { record_id: string; point_id: string }[];
}

const online = () => getNetworkStatus().online;
function requireOnline(): void { if (!online()) throw new Error(OFFLINE_MESSAGE); }
function rpcError(e: { message?: string } | null): never {
  throw new Error(e?.message && !/fetch|network/i.test(e.message) ? e.message : OFFLINE_MESSAGE);
}

/** Alles, was /unterweisungen für eine Person braucht. */
export async function loadInstructionData(azubiId: string): Promise<InstructionData> {
  const db = await ownScope(azubiId);
  if (db) {
    if ((await db.lookups.get("instructions:resolved")) === undefined && online()) await syncNow();
    const [profile, catalogs, records, points] = await Promise.all([
      db.lookups.get("profile"), db.instruction_catalogs.toArray(),
      db.instruction_records.where("azubi_id").equals(azubiId).toArray(), db.instruction_record_points.toArray(),
    ]);
    const p = (profile?.value ?? {}) as Partial<T["profiles"]["Row"]> & { role?: string };
    return {
      own: true,
      person: { id: azubiId, full_name: p.full_name ?? "", vorname: p.vorname ?? "", nachname: p.nachname ?? "", profession_id: p.profession_id ?? null, geburtsdatum: p.geburtsdatum ?? null, role: p.role ?? "azubi" },
      catalogs: catalogs.map((c) => c.tree).sort((a, b) => a.catalog.sort_order - b.catalog.sort_order),
      records, recordPoints: points.map(({ record_id, point_id }) => ({ record_id, point_id })),
    };
  }
  return cachedOnline(`instructions:${azubiId}`, () => fetchOnline(azubiId));
}

async function fetchOnline(azubiId: string): Promise<InstructionData> {
  const [profile, role, resolved, records] = await Promise.all([
    supabase.from("profiles").select("id, full_name, vorname, nachname, profession_id, geburtsdatum").eq("id", azubiId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", azubiId).maybeSingle(),
    supabase.rpc("resolve_instruction_catalogs", { p_azubi: azubiId }),
    supabase.from("instruction_records").select("*").eq("azubi_id", azubiId).limit(5000),
  ]);
  if (profile.error) throw profile.error;
  if (!profile.data) throw new Error("Diese Person ist nicht sichtbar.");
  if (resolved.error) rpcError(resolved.error);
  if (records.error) throw records.error;
  const ids = (records.data ?? []).map((r) => r.id);
  const recordPoints: InstructionData["recordPoints"] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("instruction_record_points").select("record_id, point_id").in("record_id", ids.slice(i, i + 200));
    recordPoints.push(...(data ?? []));
  }
  return {
    own: false,
    person: { ...profile.data, role: role.data?.role ?? null },
    catalogs: await fetchInstructionCatalogs((resolved.data ?? []).map((c) => c.id)),
    records: records.data ?? [], recordPoints,
  };
}

export interface DraftInput {
  id?: string | undefined;
  topic_id: string | null;
  title: string;
  given_on: string;
  duration_minutes: number | null;
  instructor_name: string;
  notes: string | null;
  point_ids: string[];
}

/** Entwurf lokal speichern und über die outbox senden (auch offline). */
export async function saveDraft(input: DraftInput): Promise<string> {
  const uid = myId();
  const db = await ownScope(uid ?? undefined);
  if (!db || !uid) throw new Error(READ_ONLY_TOAST);
  const id = input.id ?? crypto.randomUUID();
  const cur = await db.instruction_records.get(id);
  if (cur && cur.status !== "draft" && cur.status !== "rejected") throw new Error("Eingereichte oder bestätigte Nachweise lassen sich nicht bearbeiten.");
  const now = nowIso();
  await db.transaction("rw", db.instruction_records, db.instruction_record_points, async () => {
    await db.instruction_records.put({
      id, azubi_id: uid, topic_id: input.topic_id, title: input.title.trim(), given_on: input.given_on,
      duration_minutes: input.duration_minutes, instructor_name: input.instructor_name.trim() || null, notes: input.notes?.trim() || null,
      status: cur?.status ?? "draft", version: cur?.version ?? 0, content_hash: cur?.content_hash ?? null, submitted_at: cur?.submitted_at ?? null,
      reviewed_at: cur?.reviewed_at ?? null, reviewer_id: cur?.reviewer_id ?? null, review_note: cur?.review_note ?? null,
      confirmed_by_name: null, confirmed_role_label: null, on_behalf_of: null,
      created_at: cur?.created_at ?? now, updated_at: now, _sync: "pending", _base_version: cur?._base_version ?? null, _error: null,
    });
    await db.instruction_record_points.where("record_id").equals(id).delete();
    await db.instruction_record_points.bulkPut(input.point_ids.slice(0, 40).map((point_id) => ({ record_id: id, point_id })));
  });
  await enqueue({ record: `instruction:${id}`, op: "instruction.upsert", payload: { id }, title: `Unterweisung „${input.title.trim().slice(0, 60)}“` });
  return id;
}

export async function deleteDraft(id: string): Promise<void> {
  const uid = myId();
  const db = await ownScope(uid ?? undefined);
  if (!db) throw new Error(READ_ONLY_TOAST);
  const cur = await db.instruction_records.get(id);
  if (!cur || cur.status !== "draft") throw new Error("Nur Entwürfe können gelöscht werden.");
  await dropWaiting(db, `instruction:${id}`);
  await db.instruction_records.delete(id);
  await db.instruction_record_points.where("record_id").equals(id).delete();
  if (cur._base_version !== null) await enqueue({ record: `instruction:${id}`, op: "instruction.delete", payload: { id }, title: "Unterweisung löschen" });
  else changed();
}

/** Zur Bestätigung einreichen: erst den Entwurf senden, dann mit der Serverversion einreichen. */
export async function submitInstruction(id: string): Promise<void> {
  requireOnline();
  const db = await ownScope(myId() ?? undefined);
  if (!db) throw new Error(READ_ONLY_TOAST);
  await syncNow({ force: true });
  if (await hasOutbox(db, `instruction:${id}`)) throw new Error("Der Entwurf ist noch nicht synchronisiert. Bitte versuche es gleich noch einmal.");
  const { data: server, error: e1 } = await supabase.from("instruction_records").select("version").eq("id", id).maybeSingle();
  if (e1 || !server) rpcError(e1);
  const { error } = await supabase.rpc("submit_instruction", { p_id: id, p_expected_version: server.version });
  if (error) rpcError(error);
  await syncNow();
}

export async function confirmInstruction(r: InstructionRecord, note: string): Promise<void> {
  requireOnline();
  const { error } = await supabase.rpc("confirm_instruction", { p_id: r.id, p_expected_version: r.version, p_note: note.trim() });
  if (error) rpcError(error);
}
export async function rejectInstruction(r: InstructionRecord, note: string): Promise<void> {
  requireOnline();
  const { error } = await supabase.rpc("reject_instruction", { p_id: r.id, p_expected_version: r.version, p_note: note.trim() });
  if (error) rpcError(error);
}
export async function reopenInstruction(r: InstructionRecord, note: string): Promise<void> {
  requireOnline();
  const { error } = await supabase.rpc("reopen_instruction", { p_id: r.id, p_note: note.trim() });
  if (error) rpcError(error);
}

export async function listPendingInstructions(): Promise<PendingInstruction[]> {
  return cachedOnline("instructions:pending", async () => {
    const { data, error } = await supabase.rpc("instruction_pending");
    if (error) rpcError(error);
    return data ?? [];
  });
}

/** Prüfrecht für eine Person (Bestätigen, Zurückweisen, Wieder öffnen). */
export async function canReviewFor(azubiId: string): Promise<boolean> {
  const uid = myId();
  if (!uid || uid === azubiId || !online()) return false;
  const { data } = await supabase.rpc("can_review_for", { _user_id: uid, _azubi_id: azubiId } as never);
  return data === true;
}

export async function logInstructionExport(azubiId: string, count: number, from: string | null, to: string | null): Promise<void> {
  try { await supabase.rpc("log_instruction_export", { p_azubi: azubiId, p_count: count, p_from: from as string, p_to: to as string }); } catch { /* Datei trotzdem liefern */ }
}

// ---------------- Katalog-Editor (Ausbildungsleitung) ----------------
export interface CatalogListRow { id: string; code: string; title: string; status: string; profession_id: string | null; topics: number; points: number }

export async function listCatalogsAdmin(): Promise<CatalogListRow[]> {
  requireOnline();
  const { data, error } = await supabase.from("instruction_catalogs")
    .select("id, code, title, status, profession_id, sort_order, instruction_topics(id, is_active, instruction_points(id, is_active))")
    .order("sort_order").order("title");
  if (error) throw error;
  return (data ?? []).map((c) => {
    const active = (c.instruction_topics ?? []).filter((t) => t.is_active);
    return { id: c.id, code: c.code, title: c.title, status: c.status, profession_id: c.profession_id, topics: active.length, points: active.reduce((s, t) => s + (t.instruction_points ?? []).filter((p) => p.is_active).length, 0) };
  });
}

export async function exportCatalogJson(id: string): Promise<CatalogJson> {
  requireOnline();
  const { data, error } = await supabase.rpc("export_catalog_json", { p_catalog: id });
  if (error) rpcError(error);
  return data as unknown as CatalogJson;
}

export async function saveCatalogJson(json: CatalogJson): Promise<string> {
  requireOnline();
  const { data, error } = await supabase.rpc("admin_save_instruction_catalog", { p_catalog: json as never });
  if (error) rpcError(error);
  return data as string;
}

export async function setCatalogStatus(id: string, status: "draft" | "published"): Promise<void> {
  requireOnline();
  const { error } = await supabase.rpc("admin_set_catalog_status", { p_catalog: id, p_status: status });
  if (error) rpcError(error);
}

export async function duplicateCatalog(id: string, code: string, title: string): Promise<string> {
  requireOnline();
  const { data, error } = await supabase.rpc("admin_duplicate_catalog", { p_catalog: id, p_code: code, p_title: title });
  if (error) rpcError(error);
  return data as string;
}

/** Themen-IDs eines Katalogs, zu denen Nachweise existieren (dann nur Ausblenden statt Löschen). */
export async function topicsWithRecords(catalogId: string): Promise<{ topicKeys: Set<string>; pointKeys: Set<string> }> {
  requireOnline();
  const { data: topics } = await supabase.from("instruction_topics").select("id, key, instruction_points(id, key)").eq("catalog_id", catalogId);
  const tIds = (topics ?? []).map((t) => t.id);
  const used = tIds.length ? await supabase.from("instruction_records").select("topic_id").in("topic_id", tIds).limit(10000) : { data: [] };
  const usedTopics = new Set((used.data ?? []).map((r) => r.topic_id));
  const pIds = (topics ?? []).flatMap((t) => (t.instruction_points ?? []).map((p) => p.id));
  const usedP = pIds.length ? await supabase.from("instruction_record_points").select("point_id").in("point_id", pIds).limit(20000) : { data: [] };
  const usedPoints = new Set((usedP.data ?? []).map((r) => r.point_id));
  return {
    topicKeys: new Set((topics ?? []).filter((t) => usedTopics.has(t.id)).map((t) => t.key)),
    pointKeys: new Set((topics ?? []).flatMap((t) => (t.instruction_points ?? []).filter((p) => usedPoints.has(p.id)).map((p) => p.key))),
  };
}

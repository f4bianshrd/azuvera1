import { addDays, format, isAfter, min } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { LocalAbsence, SyncState } from "@/lib/sync/db";
import { changed, dropWaiting, enqueue, hasOutbox, nowIso, ownScope } from "@/lib/sync/local";

export type Absence = Database["public"]["Tables"]["absences"]["Row"] & { _sync?: SyncState; _error?: string | null };
export type AbsenceType = Database["public"]["Enums"]["absence_type"];
export type AbsenceStatus = Database["public"]["Enums"]["absence_status"];
export type AccessibleAzubi = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "full_name" | "ausbildungsbeginn" | "ausbildungsende">;

export const ABSENCE_TYPE_LABELS: Record<AbsenceType, string> = {
  urlaub: "Urlaub",
  krank: "Krankheit",
  berufsschule: "Berufsschule",
  sonstiges: "Sonstiges",
};
export const ABSENCE_STATUS_LABELS: Record<AbsenceStatus, string> = {
  pending: "Offen",
  approved: "Genehmigt",
  rejected: "Abgelehnt",
};

export interface AbsenceInput {
  type: AbsenceType;
  dateFrom: string;
  dateTo: string;
  note: string;
}

export async function listAccessibleAzubis(): Promise<AccessibleAzubi[]> {
  const { data, error } = await supabase.from("profiles").select("id, full_name, ausbildungsbeginn, ausbildungsende").order("full_name");
  if (error) throw error;
  return data ?? [];
}

export async function listAbsences(azubiId: string): Promise<Absence[]> {
  const db = await ownScope(azubiId);
  if (db) return (await db.absences.where("azubi_id").equals(azubiId).toArray()).sort((a, b) => b.date_from.localeCompare(a.date_from));
  const { data, error } = await supabase.from("absences").select("*").eq("azubi_id", azubiId).order("date_from", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createAbsence(azubiId: string, input: AbsenceInput): Promise<void> {
  const db = await ownScope(azubiId);
  if (!db) {
    const { error } = await supabase.from("absences").insert({
      id: crypto.randomUUID(), azubi_id: azubiId, type: input.type, date_from: input.dateFrom, date_to: input.dateTo, note: input.note || null,
    });
    if (error) throw error;
    return;
  }
  const now = nowIso();
  const row: LocalAbsence = {
    id: crypto.randomUUID(), azubi_id: azubiId, type: input.type, date_from: input.dateFrom, date_to: input.dateTo, note: input.note || null,
    status: "pending", review_note: null, reviewed_at: null, reviewer_id: null, created_at: now, updated_at: now, _sync: "pending", _base_version: null,
  };
  await db.absences.put(row);
  await enqueue({ record: `absence:${row.id}`, op: "absence.upsert", payload: { id: row.id }, title: "Abwesenheit speichern" });
}

export async function updateAbsence(id: string, input: AbsenceInput): Promise<void> {
  const db = await ownScope(undefined);
  const row = db ? await db.absences.get(id) : undefined;
  if (!db || !row) {
    const { error } = await supabase.from("absences").update({ type: input.type, date_from: input.dateFrom, date_to: input.dateTo, note: input.note || null }).eq("id", id);
    if (error) throw error;
    return;
  }
  await db.absences.put({ ...row, type: input.type, date_from: input.dateFrom, date_to: input.dateTo, note: input.note || null, updated_at: nowIso(), _sync: "pending", _error: null });
  await enqueue({ record: `absence:${id}`, op: "absence.upsert", payload: { id }, title: "Abwesenheit speichern" });
}

export async function deleteAbsence(id: string): Promise<void> {
  const db = await ownScope(undefined);
  const row = db ? await db.absences.get(id) : undefined;
  if (!db || !row) {
    const { error } = await supabase.from("absences").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  await dropWaiting(db, `absence:${id}`);
  await db.absences.delete(id);
  if (row._base_version === null && !(await hasOutbox(db, `absence:${id}`))) { changed(); return; }
  await enqueue({ record: `absence:${id}`, op: "absence.delete", payload: { id }, title: "Abwesenheit löschen" });
}

/** „Verwerfen“: abgelehnte lokale Änderung entfernen; der Serverstand kommt mit der nächsten Synchronisation. */
export async function discardAbsenceChange(id: string): Promise<void> {
  const db = await ownScope(undefined);
  if (!db) return;
  await dropWaiting(db, `absence:${id}`);
  const row = await db.absences.get(id);
  if (row?._base_version === null) await db.absences.delete(id);
  else {
    await db.absences.update(id, { _sync: "synced", _error: null });
    await db.meta.delete("lastPulledAt:absences");
  }
  changed();
}

export async function reviewAbsence(id: string, decision: AbsenceStatus, note: string): Promise<void> {
  const args: { _absence_id: string; _decision: AbsenceStatus; _note?: string } = { _absence_id: id, _decision: decision };
  if (note) args._note = note;
  const { error } = await supabase.rpc("review_absence", args);
  if (error) throw error;
}

export async function canReviewAbsences(azubiId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase.rpc("can_review_for", { _reviewer: user.id, _azubi: azubiId });
  if (error) throw error;
  return data;
}

export async function listOverlappingAbsences(azubiId: string, from: string, to: string, excludeId?: string): Promise<Absence[]> {
  const db = await ownScope(azubiId);
  if (db) return (await db.absences.where("azubi_id").equals(azubiId).toArray()).filter((a) => a.status !== "rejected" && a.date_from <= to && a.date_to >= from && a.id !== excludeId);
  let query = supabase.from("absences").select("*").eq("azubi_id", azubiId).neq("status", "rejected").lte("date_from", to).gte("date_to", from);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listAbsentDays(azubiId: string, from: string, to: string): Promise<Set<string>> {
  const result = new Set<string>();
  const db = await ownScope(azubiId);
  if (db) {
    for (const a of await db.absences.where("azubi_id").equals(azubiId).toArray()) {
      if (a.status === "rejected") continue;
      let d = new Date(`${a.date_from > from ? a.date_from : from}T00:00:00`);
      const end = new Date(`${a.date_to < to ? a.date_to : to}T00:00:00`);
      while (!isAfter(d, end)) { result.add(format(d, "yyyy-MM-dd")); d = addDays(d, 1); }
    }
    return result;
  }
  let cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (!isAfter(cursor, end)) {
    const chunkEnd = min([addDays(cursor, 799), end]);
    const { data, error } = await supabase.rpc("absent_days", {
      _azubi: azubiId,
      _from_date: format(cursor, "yyyy-MM-dd"),
      _to_date: format(chunkEnd, "yyyy-MM-dd"),
    });
    if (error) throw error;
    for (const day of data ?? []) result.add(day);
    cursor = addDays(chunkEnd, 1);
  }
  return result;
}

export async function absenceDisplayNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return new Map();
  const { data, error } = await supabase.rpc("display_names", { _ids: unique });
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row.full_name]));
}

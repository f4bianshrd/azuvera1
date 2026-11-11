import { addDays, format, isAfter, min } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Absence = Database["public"]["Tables"]["absences"]["Row"];
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
  const { data, error } = await supabase.from("absences").select("*").eq("azubi_id", azubiId).order("date_from", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createAbsence(azubiId: string, input: AbsenceInput): Promise<void> {
  const { error } = await supabase.from("absences").insert({
    id: crypto.randomUUID(), azubi_id: azubiId, type: input.type, date_from: input.dateFrom, date_to: input.dateTo, note: input.note || null,
  });
  if (error) throw error;
}

export async function updateAbsence(id: string, input: AbsenceInput): Promise<void> {
  const { error } = await supabase.from("absences").update({ type: input.type, date_from: input.dateFrom, date_to: input.dateTo, note: input.note || null }).eq("id", id);
  if (error) throw error;
}

export async function deleteAbsence(id: string): Promise<void> {
  const { error } = await supabase.from("absences").delete().eq("id", id);
  if (error) throw error;
}

export async function reviewAbsence(id: string, decision: AbsenceStatus, note: string): Promise<void> {
  const { error } = await supabase.rpc("review_absence", { _absence_id: id, _decision: decision, _note: note || undefined });
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
  let query = supabase.from("absences").select("*").eq("azubi_id", azubiId).neq("status", "rejected").lte("date_from", to).gte("date_to", from);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listAbsentDays(azubiId: string, from: string, to: string): Promise<Set<string>> {
  const result = new Set<string>();
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

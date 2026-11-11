import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Grade = Database["public"]["Tables"]["school_grades"]["Row"];
export type GradeKind = Database["public"]["Enums"]["grade_kind"];
export type GradeAzubi = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "full_name" | "ausbildungsbeginn" | "ausbildungsende">;

export const GRADE_KIND_LABELS: Record<GradeKind, string> = {
  klausur: "Klausur",
  muendlich: "Mündlich",
  test: "Test",
  sonstige: "Sonstige",
};

export interface GradeInput {
  subject: string;
  grade: number;
  gradeDate: string;
  kind: GradeKind;
  note: string;
}

export async function listGradeAzubis(): Promise<GradeAzubi[]> {
  const { data, error } = await supabase.from("profiles").select("id, full_name, ausbildungsbeginn, ausbildungsende").order("full_name");
  if (error) throw error;
  return data ?? [];
}

export async function listGrades(azubiId: string): Promise<Grade[]> {
  const { data, error } = await supabase.from("school_grades").select("*").eq("azubi_id", azubiId).order("grade_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createGrade(azubiId: string, input: GradeInput): Promise<void> {
  const { error } = await supabase.from("school_grades").insert({
    id: crypto.randomUUID(), azubi_id: azubiId, subject: input.subject, grade: input.grade, grade_date: input.gradeDate, kind: input.kind, note: input.note || null,
  });
  if (error) throw error;
}

export async function updateGrade(id: string, input: GradeInput): Promise<void> {
  const { error } = await supabase.from("school_grades").update({ subject: input.subject, grade: input.grade, grade_date: input.gradeDate, kind: input.kind, note: input.note || null }).eq("id", id);
  if (error) throw error;
}

export async function deleteGrade(id: string): Promise<void> {
  const { error } = await supabase.from("school_grades").delete().eq("id", id);
  if (error) throw error;
}

export async function gradeDisplayNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return new Map();
  const { data, error } = await supabase.rpc("display_names", { _ids: unique });
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row.full_name]));
}

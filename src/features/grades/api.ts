import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { LocalGrade, SyncState } from "@/lib/sync/db";
import { changed, dropWaiting, enqueue, hasOutbox, nowIso, ownScope } from "@/lib/sync/local";

export type Grade = Database["public"]["Tables"]["school_grades"]["Row"] & { _sync?: SyncState; _error?: string | null };
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
  const db = await ownScope(azubiId);
  if (db) return (await db.school_grades.where("azubi_id").equals(azubiId).toArray()).sort((a, b) => b.grade_date.localeCompare(a.grade_date));
  const { data, error } = await supabase.from("school_grades").select("*").eq("azubi_id", azubiId).order("grade_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createGrade(azubiId: string, input: GradeInput): Promise<void> {
  const db = await ownScope(azubiId);
  const fields = { subject: input.subject, grade: input.grade, grade_date: input.gradeDate, kind: input.kind, note: input.note || null };
  if (!db) {
    const { error } = await supabase.from("school_grades").insert({ id: crypto.randomUUID(), azubi_id: azubiId, ...fields });
    if (error) throw error;
    return;
  }
  const now = nowIso();
  const row: LocalGrade = { id: crypto.randomUUID(), azubi_id: azubiId, ...fields, created_at: now, updated_at: now, _sync: "pending", _base_version: null };
  await db.school_grades.put(row);
  await enqueue({ record: `grade:${row.id}`, op: "grade.upsert", payload: { id: row.id }, title: "Note speichern" });
}

export async function updateGrade(id: string, input: GradeInput): Promise<void> {
  const fields = { subject: input.subject, grade: input.grade, grade_date: input.gradeDate, kind: input.kind, note: input.note || null };
  const db = await ownScope(undefined);
  const row = db ? await db.school_grades.get(id) : undefined;
  if (!db || !row) {
    const { error } = await supabase.from("school_grades").update(fields).eq("id", id);
    if (error) throw error;
    return;
  }
  await db.school_grades.put({ ...row, ...fields, updated_at: nowIso(), _sync: "pending" });
  await enqueue({ record: `grade:${id}`, op: "grade.upsert", payload: { id }, title: "Note speichern" });
}

export async function deleteGrade(id: string): Promise<void> {
  const db = await ownScope(undefined);
  const row = db ? await db.school_grades.get(id) : undefined;
  if (!db || !row) {
    const { error } = await supabase.from("school_grades").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  await dropWaiting(db, `grade:${id}`);
  await db.school_grades.delete(id);
  if (row._base_version === null && !(await hasOutbox(db, `grade:${id}`))) { changed(); return; }
  await enqueue({ record: `grade:${id}`, op: "grade.delete", payload: { id }, title: "Note löschen" });
}

export async function gradeDisplayNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return new Map();
  const { data, error } = await supabase.rpc("display_names", { _ids: unique });
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row.full_name]));
}

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  ReportConflictError,
  signedUrl,
  uploadSignature,
  type Report,
  type ReportStatus,
  type ReportType,
} from "@/features/reports/api";
import type { Absence } from "@/features/absences/api";
import { berlinStartOfDay } from "./review-utils";

export type ReviewQueueItem = {
  report_id: string;
  azubi_id: string;
  status: ReportStatus;
  submitted_at: string | null;
  deputy_for: string | null;
};
export type ReportComment = Database["public"]["Tables"]["report_comments"]["Row"];
export type CommentKind = ReportComment["kind"];
export type CommentSection = NonNullable<ReportComment["section"]>;
export type UserSignature = Database["public"]["Tables"]["user_signatures"]["Row"];
export type ReviewPerson = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "full_name" | "profession_id">;

export async function listReviewQueue(statuses: ReportStatus[] = ["submitted"]): Promise<ReviewQueueItem[]> {
  const { data, error } = await supabase.rpc("review_queue", { _statuses: statuses });
  if (error) throw error;
  return (data ?? []) as ReviewQueueItem[];
}

export async function listReportsByIds(ids: string[]): Promise<Report[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("reports").select("*").in("id", ids);
  if (error) throw error;
  return data ?? [];
}

export async function listVisibleReports(filters: {
  status?: ReportStatus | "all";
  type?: ReportType | "all";
  azubiId?: string | undefined;
  limit?: number;
}): Promise<Report[]> {
  let query = supabase.from("reports").select("*").neq("status", "draft").order("submitted_at", { ascending: false });
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.type && filters.type !== "all") query = query.eq("report_type", filters.type);
  if (filters.azubiId) query = query.eq("azubi_id", filters.azubiId);
  const { data, error } = await query.limit(filters.limit ?? 50);
  if (error) throw error;
  return data ?? [];
}

export async function listReviewPeople(): Promise<ReviewPerson[]> {
  const { data, error } = await supabase.from("profiles").select("id, full_name, profession_id").order("full_name");
  if (error) throw error;
  return data ?? [];
}

export async function listReportMetrics(ids: string[]): Promise<Map<string, { attachments: number; comments: number }>> {
  const result = new Map(ids.map((id) => [id, { attachments: 0, comments: 0 }]));
  if (ids.length === 0) return result;
  const [attachments, comments] = await Promise.all([
    supabase.from("report_attachments").select("report_id").in("report_id", ids),
    supabase.from("report_comments").select("report_id").in("report_id", ids),
  ]);
  if (attachments.error) throw attachments.error;
  if (comments.error) throw comments.error;
  for (const row of attachments.data ?? []) {
    const item = result.get(row.report_id);
    if (item) item.attachments += 1;
  }
  for (const row of comments.data ?? []) {
    const item = result.get(row.report_id);
    if (item) item.comments += 1;
  }
  return result;
}

export async function countTodayApprovals(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const { count, error } = await supabase
    .from("report_signatures")
    .select("id", { count: "exact", head: true })
    .eq("signer_id", user.id)
    .eq("role", "ausbilder")
    .gte("signed_at", berlinStartOfDay(new Date()));
  if (error) throw error;
  return count ?? 0;
}

export async function listPendingReviewAbsences(): Promise<{ absence: Absence; name: string }[]> {
  const { data: people, error: peopleError } = await supabase.from("profiles").select("id, full_name");
  if (peopleError) throw peopleError;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const allowed = await Promise.all((people ?? []).map(async (person) => {
    const { data, error } = await supabase.rpc("can_review_for", { _reviewer: user.id, _azubi: person.id });
    if (error) throw error;
    return data ? person : null;
  }));
  const visible = allowed.filter((p) => p !== null);
  if (visible.length === 0) return [];
  const { data, error } = await supabase.from("absences").select("*").eq("status", "pending").in("azubi_id", visible.map((p) => p.id)).order("created_at");
  if (error) throw error;
  const names = new Map(visible.map((p) => [p.id, p.full_name]));
  return (data ?? []).map((absence) => ({ absence, name: names.get(absence.azubi_id) ?? "" }));
}

export async function canReviewReport(azubiId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase.rpc("can_review_for", { _reviewer: user.id, _azubi: azubiId });
  if (error) throw error;
  return data;
}

export async function actingPrincipal(azubiId: string): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.rpc("acting_principal", { _reviewer: user.id, _azubi: azubiId });
  if (error) throw error;
  return data;
}

export async function approveReport(input: {
  reportId: string;
  expectedVersion: number;
  method: "draw" | "saved" | "click";
  imagePath?: string | undefined;
  note?: string | undefined;
}): Promise<void> {
  const { error } = await supabase.rpc("approve_report", {
    _report_id: input.reportId,
    _expected_version: input.expectedVersion,
    _method: input.method,
    _image_path: input.imagePath,
    _note: input.note,
    _client_signed_at: new Date().toISOString(),
  });
  if (error) {
    if (error.message.includes("inzwischen geändert")) throw new ReportConflictError();
    throw error;
  }
}

export async function rejectReport(reportId: string, expectedVersion: number, note: string): Promise<void> {
  const { error } = await supabase.rpc("reject_report", { _report_id: reportId, _expected_version: expectedVersion, _note: note });
  if (error) {
    if (error.message.includes("inzwischen geändert")) throw new ReportConflictError();
    throw error;
  }
}

export async function reopenReport(reportId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("reopen_report", { _report_id: reportId, _reason: reason });
  if (error) throw error;
}

export async function listComments(reportId: string): Promise<ReportComment[]> {
  const { data, error } = await supabase.from("report_comments").select("*").eq("report_id", reportId).order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function addComment(reportId: string, section: CommentSection | null, body: string): Promise<void> {
  const { error } = await supabase.from("report_comments").insert({ id: crypto.randomUUID(), report_id: reportId, section, body: body.trim() });
  if (error) throw error;
}

export async function commentAuthors(ids: string[]): Promise<{ names: Map<string, string>; roles: Map<string, Database["public"]["Enums"]["app_role"]> }> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return { names: new Map(), roles: new Map() };
  const [names, roles] = await Promise.all([
    supabase.rpc("display_names", { _ids: unique }),
    supabase.rpc("display_roles", { _ids: unique }),
  ]);
  if (names.error) throw names.error;
  if (roles.error) throw roles.error;
  return {
    names: new Map((names.data ?? []).map((r) => [r.id, r.full_name])),
    roles: new Map((roles.data ?? []).map((r) => [r.user_id, r.role])),
  };
}

export function subscribeToComments(reportId: string, onChange: () => void): () => void {
  const channel = supabase.channel(`report-comments-${reportId}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "report_comments", filter: `report_id=eq.${reportId}` }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

export async function getSavedSignature(): Promise<UserSignature | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from("user_signatures").select("*").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveDrawnSignature(userId: string, png: Blob): Promise<UserSignature> {
  const path = await uploadSignature(userId, png);
  const { data, error } = await supabase.from("user_signatures").upsert({ user_id: userId, image_path: path }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteSavedSignature(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht angemeldet.");
  const { error } = await supabase.from("user_signatures").delete().eq("user_id", user.id);
  if (error) throw error;
}

export async function savedSignatureUrl(path: string): Promise<string> {
  return signedUrl("signatures", path);
}

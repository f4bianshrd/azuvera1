import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Report = Database["public"]["Tables"]["reports"]["Row"];
export type ReportAttachment = Database["public"]["Tables"]["report_attachments"]["Row"];
export type ReportSignature = Database["public"]["Tables"]["report_signatures"]["Row"];
export type ReportVersion = Database["public"]["Tables"]["report_versions"]["Row"];
export type ReportStatus = Database["public"]["Enums"]["report_status"];
export type ReportType = Database["public"]["Enums"]["report_type"];
export type WeeklyMode = "activities" | "topics";

export const STATUS_LABELS: Record<ReportStatus, string> = {
  draft: "Entwurf",
  submitted: "Eingereicht",
  approved: "Freigegeben",
  rejected: "Zurückgewiesen",
};

export const CONFLICT_MESSAGE = "Der Bericht wurde inzwischen geändert.";

export class ReportConflictError extends Error {
  constructor() {
    super(CONFLICT_MESSAGE);
    this.name = "ReportConflictError";
  }
}

export function reportTitle(r: Pick<Report, "report_type" | "weekly_mode" | "week_number" | "year">): string {
  if (r.report_type === "weekly") {
    const mode = r.weekly_mode === "topics" ? "Themenbericht" : "Tätigkeitsbericht";
    return `Wochenbericht KW ${r.week_number}/${r.year} – ${mode}`;
  }
  return "Tagesbericht";
}

/** Inhaltsspalten, die der Client schreiben darf. */
export interface ReportDraftPatch {
  weekly_mode?: WeeklyMode;
  report_date?: string;
  activities?: string;
  school_content?: string;
  instructions?: string;
  summary?: string;
}

export interface ReportFilters {
  azubiId?: string;
  status?: ReportStatus | "all";
  type?: ReportType | "all";
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listReports(filters: ReportFilters = {}): Promise<Report[]> {
  let q = supabase.from("reports").select("*").order("report_date", { ascending: false });
  if (filters.azubiId) q = q.eq("azubi_id", filters.azubiId);
  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.type && filters.type !== "all") q = q.eq("report_type", filters.type);
  q = q.range(filters.offset ?? 0, (filters.offset ?? 0) + (filters.limit ?? 50) - 1);
  const { data, error } = await q;
  if (error) throw error;
  let rows = data ?? [];
  const s = filters.search?.trim().toLowerCase();
  if (s) {
    rows = rows.filter((r) => {
      const hay = [reportTitle(r), r.report_date, r.week_number != null ? `kw ${r.week_number}` : ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }
  return rows;
}

/** Alle Berichte eines Azubis in einem Datumsbereich (für die Abdeckung). */
export async function listReportsInRange(azubiId: string, from: string, to: string): Promise<Report[]> {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("azubi_id", azubiId)
    .gte("report_date", from)
    .lte("report_date", to)
    .order("report_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface ReportDetail {
  report: Report;
  attachments: ReportAttachment[];
  signatures: ReportSignature[];
}

export async function getReport(id: string): Promise<ReportDetail | null> {
  const [{ data: report, error }, { data: attachments }, { data: signatures }] = await Promise.all([
    supabase.from("reports").select("*").eq("id", id).maybeSingle(),
    supabase.from("report_attachments").select("*").eq("report_id", id).order("sort_order"),
    supabase.from("report_signatures").select("*").eq("report_id", id).order("signed_at"),
  ]);
  if (error) throw error;
  if (!report) return null;
  return { report, attachments: attachments ?? [], signatures: signatures ?? [] };
}

/** Vorhandenen Bericht für eine Woche/einen Tag finden (Duplikat-Prüfung). */
export async function findExistingReport(
  azubiId: string,
  type: ReportType,
  date: string,
  week?: { year: number; weekNumber: number },
): Promise<Report | null> {
  let q = supabase.from("reports").select("*").eq("azubi_id", azubiId).eq("report_type", type);
  if (type === "daily") q = q.eq("report_date", date);
  else if (week) q = q.eq("year", week.year).eq("week_number", week.weekNumber);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data;
}

/** Entwurf anlegen – die UUID kommt vom Gerät (idempotent). */
export async function createDraft(input: {
  id: string;
  azubiId: string;
  reportType: ReportType;
  weeklyMode: WeeklyMode;
  reportDate: string;
}): Promise<Report> {
  const { data, error } = await supabase
    .from("reports")
    .insert({
      id: input.id,
      azubi_id: input.azubiId,
      report_type: input.reportType,
      weekly_mode: input.weeklyMode,
      report_date: input.reportDate,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Entwurf speichern mit optimistischer Versionskontrolle. */
export async function saveReportDraft(id: string, expectedVersion: number, patch: ReportDraftPatch): Promise<Report> {
  const { data, error } = await supabase
    .from("reports")
    .update(patch)
    .eq("id", id)
    .eq("version", expectedVersion)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) throw new ReportConflictError();
  return data[0];
}

export async function deleteReport(id: string): Promise<void> {
  const { error } = await supabase.from("reports").delete().eq("id", id);
  if (error) throw error;
}

export async function submitReport(input: {
  reportId: string;
  expectedVersion: number;
  method: "draw" | "click";
  imagePath?: string | undefined;
  clientSignedAt?: string | undefined;
}): Promise<void> {
  const { error } = await supabase.rpc("submit_report", {
    _report_id: input.reportId,
    _expected_version: input.expectedVersion,
    _method: input.method,
    _image_path: input.imagePath ?? null,
    _client_signed_at: input.clientSignedAt ?? null,
  });
  if (error) {
    if (error.message.includes("inzwischen geändert")) throw new ReportConflictError();
    throw error;
  }
}

// ---------- Anhänge ----------

export async function insertAttachmentRow(row: {
  id: string;
  reportId: string;
  storagePath: string;
  thumbPath?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  sha256?: string;
  sortOrder: number;
}): Promise<ReportAttachment> {
  const { data, error } = await supabase
    .from("report_attachments")
    .insert({
      id: row.id,
      report_id: row.reportId,
      azubi_id: "", // wird per Trigger aus dem Bericht gesetzt
      storage_path: row.storagePath,
      thumb_path: row.thumbPath ?? null,
      file_name: row.fileName,
      mime_type: row.mimeType,
      size_bytes: row.sizeBytes,
      width: row.width ?? null,
      height: row.height ?? null,
      sha256: row.sha256 ?? null,
      sort_order: row.sortOrder,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAttachment(id: string, patch: { caption?: string; sort_order?: number }): Promise<void> {
  const { error } = await supabase.from("report_attachments").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteAttachmentRow(id: string): Promise<void> {
  const { error } = await supabase.from("report_attachments").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadFile(bucket: string, path: string, blob: Blob, contentType: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType, upsert: false });
  if (error) throw error;
}

export async function removeFile(bucket: string, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

/** Signierte URL mit 5 Minuten Gültigkeit – erst beim Öffnen erzeugen. */
export async function signedUrl(bucket: string, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

/** Unterschrifts-PNG hochladen; gibt den Pfad zurück. */
export async function uploadSignature(userId: string, png: Blob): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.png`;
  await uploadFile("signatures", path, png, "image/png");
  return path;
}

/** Anzeigenamen für eine Liste von Profil-IDs (über die geschützte Funktion). */
export async function displayNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.rpc("display_names", { _ids: unique });
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.id, r.full_name]));
}

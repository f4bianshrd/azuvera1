import { supabase } from "@/integrations/supabase/client";
import type { ExportAttachment, ExportHeader, ExportReport, ExportSignature, ReportBundle } from "./types";

type Status = ExportReport["status"];
type Kind = ExportReport["report_type"];

export async function getExportHeader(azubiId: string): Promise<ExportHeader> {
  const { data, error } = await supabase.rpc("export_header", { p_azubi: azubiId });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("not_found");
  return row;
}

export interface ExportSelection { azubiId: string; from: string | null; to: string | null; statuses: Status[]; types: Kind[] }

/** Berichte der Auswahl (RLS verhindert fremde Berichte und Entwürfe anderer). */
export async function listExportReports(sel: ExportSelection): Promise<{ reports: ExportReport[]; attachmentBytes: number; imageBytes: number }> {
  if (!sel.statuses.length || !sel.types.length) return { reports: [], attachmentBytes: 0, imageBytes: 0 };
  let q = supabase.from("reports").select("*").eq("azubi_id", sel.azubiId).in("status", sel.statuses).in("report_type", sel.types);
  if (sel.from) q = q.gte("report_date", sel.from);
  if (sel.to) q = q.lte("report_date", sel.to);
  const { data, error } = await q.order("report_date").order("report_type", { ascending: false }).limit(2000);
  if (error) throw error;
  const reports = data ?? [];
  let attachmentBytes = 0, imageBytes = 0;
  for (let i = 0; i < reports.length; i += 200) {
    const { data: att } = await supabase.from("report_attachments").select("size_bytes, mime_type").in("report_id", reports.slice(i, i + 200).map((r) => r.id));
    for (const a of att ?? []) { attachmentBytes += a.size_bytes; if (a.mime_type.startsWith("image/")) imageBytes += a.size_bytes; }
  }
  return { reports, attachmentBytes, imageBytes };
}

export async function getExportReport(id: string): Promise<ExportReport> {
  const { data, error } = await supabase.from("reports").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

async function fetchBytes(bucket: string, path: string): Promise<Uint8Array | null> {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 120);
  if (!data?.signedUrl) return null;
  const res = await fetch(data.signedUrl);
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

/** Bild in PNG umwandeln (pdf-lib kennt nur PNG/JPEG; WebP wird über Canvas umgezeichnet). */
async function toPng(bytes: Uint8Array, mime: string): Promise<Uint8Array | null> {
  try {
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }));
    const max = 1600;
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch { return null; }
}

/** Alle Daten eines Berichts für die PDF-Vorlage laden. */
export async function loadBundle(report: ExportReport, opts: { embedImages: boolean; withFiles: boolean; blankSignatures: boolean }): Promise<ReportBundle> {
  const [att, sig, com, ver] = await Promise.all([
    supabase.from("report_attachments").select("*").eq("report_id", report.id).order("sort_order"),
    supabase.from("report_signatures").select("*").eq("report_id", report.id).order("signed_at"),
    report.status === "approved"
      ? supabase.from("report_comments").select("body, created_at").eq("report_id", report.id).eq("kind", "approval").order("created_at", { ascending: false }).limit(1)
      : Promise.resolve({ data: [] as { body: string }[] }),
    supabase.rpc("verify_report", { p_report: report.id }),
  ]);
  const attachments: ExportAttachment[] = att.data ?? [];
  const all: ExportSignature[] = (sig.data ?? []).filter((s) => s.report_version === report.version);
  const signatures = (["azubi", "ausbilder"] as const).map((r) => all.filter((s) => s.role === r).pop()).filter((s): s is ExportSignature => !!s);
  const ids = signatures.map((s) => s.on_behalf_of).filter((x): x is string => !!x);
  const names = new Map<string, string>();
  if (ids.length) {
    const { data } = await supabase.rpc("display_names", { _ids: ids });
    for (const n of data ?? []) names.set(n.id, n.full_name);
  }
  const signatureImages = new Map<string, Uint8Array>();
  if (!opts.blankSignatures) {
    await Promise.all(signatures.filter((s) => s.image_path).map(async (s) => {
      const b = await fetchBytes("signatures", s.image_path!);
      if (b) signatureImages.set(s.id, b);
    }));
  }
  const attachmentPng = new Map<string, Uint8Array>();
  const attachmentFiles = new Map<string, Uint8Array>();
  if (opts.embedImages || opts.withFiles) {
    for (const a of attachments) {
      const b = await fetchBytes("report-files", a.storage_path);
      if (!b) continue;
      if (opts.withFiles) attachmentFiles.set(a.id, b);
      if (opts.embedImages && a.mime_type.startsWith("image/")) {
        const png = a.mime_type === "image/png" ? b : await toPng(b, a.mime_type);
        if (png) attachmentPng.set(a.id, png);
      }
    }
  }
  return {
    report, attachments, signatures, names, signatureImages, attachmentPng, attachmentFiles,
    approvalNote: (com.data?.[0] as { body?: string } | undefined)?.body ?? report.review_note ?? null,
    verify: ver.data?.[0] ?? null,
  };
}

export async function logExport(azubiId: string, kind: "single" | "bulk" | "zip", count: number, from: string | null, to: string | null): Promise<void> {
  const { error } = await supabase.rpc("log_export", { p_azubi: azubiId, p_kind: kind, p_count: count, p_from: from as string, p_to: to as string });
  if (error) throw error;
}

/** Datenzugriff für den Export der Erfahrungsberichte (nur online, RLS begrenzt auf Sichtbares). */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { fetchBytes, toPng } from "./api";
import type { ExportReport, ReportBundle } from "./types";

type T = Database["public"]["Tables"];
export type ExportExperience = T["experience_reports"]["Row"];
export type ExportExperienceAttachment = T["experience_attachments"]["Row"];
type ExpSignature = T["experience_signatures"]["Row"];
type Status = ExportExperience["status"];

export interface ExperienceSelection { azubiId: string; from: string | null; to: string | null; statuses: Status[]; kinds: string[] }

export async function listExportExperiences(sel: ExperienceSelection): Promise<{ items: ExportExperience[]; attachmentBytes: number }> {
  if (!sel.statuses.length || !sel.kinds.length) return { items: [], attachmentBytes: 0 };
  let q = supabase.from("experience_reports").select("*").eq("azubi_id", sel.azubiId).in("status", sel.statuses).in("kind", sel.kinds);
  if (sel.from) q = q.gte("written_on", sel.from);
  if (sel.to) q = q.lte("written_on", sel.to);
  const { data, error } = await q.order("written_on").order("created_at").limit(2000);
  if (error) throw error;
  const items = data ?? [];
  let attachmentBytes = 0;
  for (let i = 0; i < items.length; i += 200) {
    const { data: att } = await supabase.from("experience_attachments").select("size_bytes").in("experience_id", items.slice(i, i + 200).map((r) => r.id));
    for (const a of att ?? []) attachmentBytes += a.size_bytes;
  }
  return { items, attachmentBytes };
}

export async function getExportExperience(id: string): Promise<ExportExperience> {
  const { data, error } = await supabase.from("experience_reports").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export interface ExperienceBundle extends ReportBundle { experience: ExportExperience; experienceAttachments: ExportExperienceAttachment[] }

/** Erfahrungsbericht in die gemeinsame Form der PDF-Vorlage bringen (Unterschriften, Anlagen, Bemerkung, Prüfung). */
export async function loadExperienceBundle(e: ExportExperience, opts: { embedImages: boolean; withFiles: boolean; blankSignatures: boolean }): Promise<ExperienceBundle> {
  const [att, sig, com, ver] = await Promise.all([
    supabase.from("experience_attachments").select("*").eq("experience_id", e.id).order("sort_order"),
    supabase.from("experience_signatures").select("*").eq("experience_id", e.id).order("signed_at"),
    e.status === "approved"
      ? supabase.from("experience_comments").select("body, created_at").eq("experience_id", e.id).eq("kind", "approval").order("created_at", { ascending: false }).limit(1)
      : Promise.resolve({ data: [] as { body: string }[] }),
    supabase.rpc("verify_experience", { p_id: e.id }),
  ]);
  const attachments = att.data ?? [];
  const all = ((sig.data ?? []) as ExpSignature[]).filter((s) => s.experience_version === e.version);
  const latest = (["azubi", "ausbilder"] as const).map((r) => all.filter((s) => s.role === r).pop()).filter((s): s is ExpSignature => !!s);
  const signatures = latest.map((s) => ({ ...s, report_id: s.experience_id, report_version: s.experience_version })) as unknown as ReportBundle["signatures"];
  const ids = latest.map((s) => s.on_behalf_of).filter((x): x is string => !!x);
  const names = new Map<string, string>();
  if (ids.length) {
    const { data } = await supabase.rpc("display_names", { _ids: ids });
    for (const n of data ?? []) names.set(n.id, n.full_name);
  }
  const signatureImages = new Map<string, Uint8Array>();
  if (!opts.blankSignatures) {
    await Promise.all(latest.filter((s) => s.image_path).map(async (s) => {
      const b = await fetchBytes("signatures", s.image_path!);
      if (b) signatureImages.set(s.id, b);
    }));
  }
  const attachmentPng = new Map<string, Uint8Array>();
  const attachmentFiles = new Map<string, Uint8Array>();
  if (opts.embedImages || opts.withFiles) {
    for (const a of attachments) {
      const b = await fetchBytes("experience-files", a.storage_path);
      if (!b) continue;
      if (opts.withFiles) attachmentFiles.set(a.id, b);
      if (opts.embedImages && a.mime_type.startsWith("image/")) {
        const png = a.mime_type === "image/png" ? b : await toPng(b, a.mime_type);
        if (png) attachmentPng.set(a.id, png);
      }
    }
  }
  const v = (Array.isArray(ver.data) ? ver.data[0] : ver.data) as { hash_ok: boolean | null; signatures_ok: boolean | null; version: number } | undefined;
  return {
    experience: e, experienceAttachments: attachments,
    report: { ...e, report_date: e.written_on } as unknown as ExportReport,
    attachments: attachments as unknown as ReportBundle["attachments"],
    signatures, names, signatureImages, attachmentPng, attachmentFiles,
    approvalNote: (com.data?.[0] as { body?: string } | undefined)?.body ?? (e.status === "approved" ? e.review_note : null) ?? null,
    verify: (v ?? null) as ReportBundle["verify"],
    links: { items: [], topics: [] },
  };
}

export async function experienceBundesland(azubiId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("bundesland, companies(bundesland)").eq("id", azubiId).maybeSingle();
  const code = (data?.companies as { bundesland: string | null } | null)?.bundesland ?? data?.bundesland ?? null;
  if (!code) return null;
  const { data: bl } = await supabase.from("bundeslaender").select("name").eq("code", code).maybeSingle();
  return bl?.name ?? null;
}

export async function logExperienceExport(azubiId: string, kind: "single" | "bulk" | "zip", count: number, from: string | null, to: string | null): Promise<void> {
  const { error } = await supabase.rpc("log_experience_export", { p_azubi: azubiId, p_kind: kind, p_count: count, p_from: from as string, p_to: to as string });
  if (error) throw error;
}

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { AuditEntry } from "./labels";

const COLS = "id, created_at, actor_id, actor_role, azubi_id, entity_type, entity_id, action, details, row_hash";
export const PAGE_SIZE = 100;
export const CSV_LIMIT = 5000;

export type ReportVersion = Database["public"]["Tables"]["report_versions"]["Row"];
export interface VersionSnapshot { activities: string; school: string; instructions: string; summary: string }

/** Alle sichtbaren Einträge zu einem Bericht, neueste oben (RLS filtert Entwurfs-Einträge für Dritte). */
export async function listReportHistory(reportId: string): Promise<AuditEntry[]> {
  const { data, error } = await supabase.from("audit_log").select(COLS)
    .eq("entity_type", "report").eq("entity_id", reportId)
    .order("id", { ascending: false }).limit(1000);
  if (error) throw error;
  return data ?? [];
}

export async function listReportVersions(reportId: string): Promise<ReportVersion[]> {
  const { data, error } = await supabase.from("report_versions").select("*").eq("report_id", reportId).order("version", { ascending: true }).order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type HistoryEntity = "report" | "experience";

/** Verlauf für Berichte oder Erfahrungsberichte (entity_type). */
export async function listEntityHistory(entity: HistoryEntity, id: string): Promise<AuditEntry[]> {
  if (entity === "report") return listReportHistory(id);
  const { data, error } = await supabase.from("audit_log").select(COLS)
    .eq("entity_type", "experience").eq("entity_id", id)
    .order("id", { ascending: false }).limit(1000);
  if (error) throw error;
  return data ?? [];
}

/** Gemeinsame Form einer gespeicherten Version (Schnappschuss als Text-Abschnitte). */
export interface EntityVersion { id: string; version: number; status: string; created_at: string; content_hash: string | null; sections: Record<string, string>; attachments: string[] }

export async function listEntityVersions(entity: HistoryEntity, id: string): Promise<EntityVersion[]> {
  if (entity === "report") {
    return (await listReportVersions(id)).map((v) => {
      const s = snapshotOf(v);
      return { id: v.id, version: v.version, status: v.status, created_at: v.created_at, content_hash: v.content_hash, sections: { ...s }, attachments: [] };
    });
  }
  const { data, error } = await supabase.from("experience_versions").select("*").eq("experience_id", id).order("version", { ascending: true }).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((v) => {
    const s = (v.snapshot && typeof v.snapshot === "object" && !Array.isArray(v.snapshot) ? v.snapshot : {}) as Record<string, unknown>;
    const t = (k: string) => (typeof s[k] === "string" ? (s[k] as string) : "");
    const kinds: Record<string, string> = { erfahrungsbericht: "Erfahrungsbericht", projektbericht: "Projektbericht", leittext: "Leittext" };
    const att = Array.isArray(s["attachments"]) ? (s["attachments"] as unknown[]).map((a) => (a && typeof a === "object" && "file_name" in a ? String((a as { file_name: unknown }).file_name) : "")).filter(Boolean) : [];
    const written = t("written_on");
    return {
      id: v.id, version: v.version, status: v.status, created_at: v.created_at, content_hash: v.content_hash, attachments: att,
      sections: { kind: kinds[t("kind")] ?? t("kind"), title: t("title"), area: t("area"), written_on: written ? written.split("-").reverse().join(".") : "", body: t("body"), reasoning: t("reasoning") },
    };
  });
}

export async function verifyEntityIntegrity(entity: HistoryEntity, id: string): Promise<ReportIntegrity> {
  if (entity === "report") return verifyReportIntegrity(id);
  const { data, error } = await supabase.rpc("verify_experience", { p_id: id });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { version: number; hash_ok: boolean | null; signatures_ok: boolean | null } | undefined;
  if (!row) throw new Error("not_found");
  return { version: row.version, hashOk: row.hash_ok, signaturesOk: row.signatures_ok };
}

export function snapshotOf(v: ReportVersion): VersionSnapshot {
  const s = (v.snapshot && typeof v.snapshot === "object" && !Array.isArray(v.snapshot) ? v.snapshot : {}) as Record<string, unknown>;
  const t = (k: string) => (typeof s[k] === "string" ? (s[k] as string) : "");
  return { activities: t("activities"), school: t("school"), instructions: t("instructions"), summary: t("summary") };
}

export interface ReportIntegrity { version: number; hashOk: boolean | null; signaturesOk: boolean | null }
export async function verifyReportIntegrity(reportId: string): Promise<ReportIntegrity> {
  const { data, error } = await supabase.rpc("verify_report", { p_report: reportId });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("not_found");
  return { version: row.version, hashOk: row.hash_ok, signaturesOk: row.signatures_ok };
}

export async function auditNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return new Map();
  const { data, error } = await supabase.rpc("display_names", { _ids: unique });
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.id, r.full_name]));
}

export async function listAzubiOptions(): Promise<{ id: string; full_name: string }[]> {
  const { data, error } = await supabase.rpc("audit_azubi_options");
  if (error) throw error;
  return data ?? [];
}

export interface AuditFilters {
  azubiId: string | null;
  /** JJJJ-MM-TT, inklusive. */
  from: string | null;
  to: string | null;
  actions: string[];
  entityTypes: string[];
}

/** Lokales Datum (Europe/Berlin) als UTC-Grenze: Von = Tagesbeginn, Bis = Ende des Tages. */
function dayStart(day: string): string { return new Date(`${day}T00:00:00`).toISOString(); }
function dayEnd(day: string): string { const d = new Date(`${day}T00:00:00`); d.setDate(d.getDate() + 1); return d.toISOString(); }

/** Keyset-Paginierung nach id absteigend. */
export async function listAudit(f: AuditFilters, before: number | null, limit = PAGE_SIZE): Promise<AuditEntry[]> {
  let q = supabase.from("audit_log").select(COLS);
  if (f.azubiId) q = q.eq("azubi_id", f.azubiId);
  if (f.from) q = q.gte("created_at", dayStart(f.from));
  if (f.to) q = q.lt("created_at", dayEnd(f.to));
  if (f.actions.length) q = q.in("action", f.actions);
  if (f.entityTypes.length) q = q.in("entity_type", f.entityTypes);
  if (before !== null) q = q.lt("id", before);
  const { data, error } = await q.order("id", { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Bis zu 5000 Einträge der Auswahl für den CSV-Export (seitenweise, je 1000). */
export async function listAuditForCsv(f: AuditFilters): Promise<AuditEntry[]> {
  const all: AuditEntry[] = [];
  let before: number | null = null;
  while (all.length < CSV_LIMIT) {
    const size = Math.min(1000, CSV_LIMIT - all.length);
    const page = await listAudit(f, before, size);
    all.push(...page);
    if (page.length < size) break;
    before = page[page.length - 1]!.id;
  }
  return all;
}

/** Welche der Berichte existieren noch und sind sichtbar (für Links in der Tabelle). */
export async function visibleReportIds(ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return new Set();
  const { data, error } = await supabase.from("reports").select("id").in("id", unique);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.id));
}

export async function visibleExperienceIds(ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return new Set();
  const { data, error } = await supabase.from("experience_reports").select("id").in("id", unique);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.id));
}

export interface ChainResult { chain_key: string; entries: number; ok: boolean; first_bad_id: number | null }
export async function verifyAuditChain(chain: string | null): Promise<ChainResult[]> {
  const { data, error } = await supabase.rpc("verify_audit_chain", chain ? { p_chain: chain } : {});
  if (error) throw error;
  return (data ?? []) as ChainResult[];
}

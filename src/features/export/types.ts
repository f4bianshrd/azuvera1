import type { Database } from "@/integrations/supabase/types";

type T = Database["public"]["Tables"];
export type ExportHeader = Database["public"]["Functions"]["export_header"]["Returns"][number];
export type VerifyResult = Database["public"]["Functions"]["verify_report"]["Returns"][number];
export type ExportReport = T["reports"]["Row"];
export type ExportAttachment = T["report_attachments"]["Row"];
export type ExportSignature = T["report_signatures"]["Row"];

export interface ReportBundle {
  report: ExportReport;
  attachments: ExportAttachment[];
  /** Unterschriften der aktuellen Version (je Rolle die letzte). */
  signatures: ExportSignature[];
  approvalNote: string | null;
  verify: VerifyResult | null;
  /** Verknüpfte Ausbildungsinhalte (nicht Teil der Prüfsumme). */
  links: { items: { group: string; label: string }[]; topics: { code: string | null; title: string }[] };
  names: Map<string, string>;
  signatureImages: Map<string, Uint8Array>;
  /** Bild-Anhänge als PNG (nur bei „Bilder einbetten“). */
  attachmentPng: Map<string, Uint8Array>;
  /** Original-Dateien (nur für ZIP). */
  attachmentFiles: Map<string, Uint8Array>;
}

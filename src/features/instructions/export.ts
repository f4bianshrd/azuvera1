/** Auswahl und Aufbereitung für den Unterweisungsnachweis (PDF, Sammelexport, ZIP). */
import { supabase } from "@/integrations/supabase/client";
import { dateDe } from "@/features/export/pdf/text";
import type { ExportHeader } from "@/features/export/types";
import type { InstructionPdfInput, InstructionPdfRecord } from "@/features/export/pdf/instructions";
import type { DueState } from "./due";
import type { InstructionData } from "./api";
import { STATE_SHORT, buildViews, intervalLabel, kpisFor, pointsFor, sortRecords, stateLabel } from "./model";

export interface InstructionExportFilter {
  catalogId: string | "all";
  state: DueState | "all";
  from: string | null;
  to: string | null;
  onlyConfirmed: boolean;
  withOverview: boolean;
}

export function buildInstructionInput(data: InstructionData, header: ExportHeader, f: InstructionExportFilter, today: string): InstructionPdfInput {
  const views = buildViews(data, today).filter((v) => f.catalogId === "all" || v.catalogId === f.catalogId).filter((v) => f.state === "all" || v.status.state === f.state);
  const topicIds = new Set(views.map((v) => v.topic.id));
  const filterTopics = f.catalogId !== "all" || f.state !== "all";
  const k = kpisFor(views);
  const records: InstructionPdfRecord[] = sortRecords(data.records)
    .filter((r) => r.status !== "draft")
    .filter((r) => !f.onlyConfirmed || r.status === "confirmed")
    .filter((r) => (!f.from || (r.given_on ?? "") >= f.from) && (!f.to || (r.given_on ?? "") <= f.to))
    .filter((r) => !filterTopics || (r.topic_id !== null && topicIds.has(r.topic_id)))
    .reverse()
    .map((r) => ({ ...r, points: pointsFor(data, r.id).map((p) => p.label) }));
  const period = f.from || f.to ? `${dateDe(f.from)} – ${dateDe(f.to)}` : "Gesamte Ausbildung";
  return {
    azubiId: data.person.id, header, period, records,
    kpis: [
      { label: "Unterwiesen", value: `${k.done}/${k.total}`, hint: `${k.percent} %` },
      { label: "Noch offen", value: String(k.open), hint: "Pflichtthemen ohne Nachweis" },
      { label: "Bald fällig", value: String(k.dueSoon), hint: "in den nächsten 14 Tagen" },
      { label: "Überfällig", value: String(k.overdue), hint: "Wiederholung nötig" },
    ],
    topics: f.withOverview ? views.map((v) => ({
      title: v.topic.title, interval: intervalLabel(v.topic.interval_months, data.person.geburtsdatum, today),
      last: v.status.last_given_on, due: v.status.due_on, state: v.status.state === "optional" ? STATE_SHORT.optional : stateLabel(v.status),
    })) : null,
  };
}

export async function getHeader(azubiId: string): Promise<ExportHeader> {
  const { data, error } = await supabase.rpc("export_header", { p_azubi: azubiId });
  if (error || !data?.[0]) throw new Error("Export fehlgeschlagen");
  return data[0];
}

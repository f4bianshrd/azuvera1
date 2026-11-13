/** Aufbereitung der Unterweisungsdaten für Seite, Dialoge und PDF (rein, ohne Datenzugriff). */
import { dateDe } from "@/features/export/pdf/text";
import { computeStatuses, effectiveMonths, instructionKpis, type DueState, type TopicStatus } from "./due";
import type { InstructionData, InstructionPoint, InstructionRecord, InstructionTopic } from "./api";

export interface TopicView {
  topic: InstructionTopic;
  catalogId: string;
  catalogTitle: string;
  status: TopicStatus;
}

export const RECORD_STATUS_DE: Record<string, string> = { draft: "Entwurf", submitted: "Eingereicht", confirmed: "Bestätigt", rejected: "Zurückgewiesen" };

export const STATE_FILTER: { value: DueState | "all"; label: string }[] = [
  { value: "all", label: "Alle Zustände" }, { value: "open", label: "Noch offen" }, { value: "due_soon", label: "Bald fällig" },
  { value: "overdue", label: "Überfällig" }, { value: "valid", label: "Aktuell" }, { value: "optional", label: "Je nach Betrieb" },
];

export function stateLabel(s: Pick<TopicStatus, "state" | "due_on">): string {
  switch (s.state) {
    case "valid": return s.due_on ? `Aktuell bis ${dateDe(s.due_on)}` : "Aktuell";
    case "due_soon": return `Bald fällig am ${dateDe(s.due_on)}`;
    case "overdue": return `Überfällig seit ${dateDe(s.due_on)}`;
    case "open": return "Noch nicht unterwiesen";
    case "optional": return "Je nach Betrieb";
  }
}
export const STATE_SHORT: Record<DueState, string> = { valid: "Aktuell", due_soon: "Bald fällig", overdue: "Überfällig", open: "Noch offen", optional: "Je nach Betrieb" };

export function intervalLabel(interval: number | null, birth: string | null, today: string): string {
  if (interval == null) return "einmalig";
  const eff = effectiveMonths(interval, birth, today);
  return eff !== interval ? "alle 6 Monate (unter 18)" : `alle ${interval} Monate`;
}

export function buildViews(data: InstructionData, today: string): TopicView[] {
  const topics = data.catalogs.flatMap((c) => c.topics.map((t) => ({ t, c })));
  const statuses = computeStatuses(topics.map(({ t }) => t), data.records, data.person.geburtsdatum, today);
  const byId = new Map(statuses.map((s) => [s.topic_id, s]));
  return topics.filter(({ t }) => byId.has(t.id)).map(({ t, c }) => ({ topic: t, catalogId: c.catalog.id, catalogTitle: c.catalog.title, status: byId.get(t.id)! }));
}

export const kpisFor = (views: TopicView[]) => instructionKpis(views.map((v) => v.status));

export function pointsFor(data: InstructionData, recordId: string): InstructionPoint[] {
  const ids = new Set(data.recordPoints.filter((p) => p.record_id === recordId).map((p) => p.point_id));
  return data.catalogs.flatMap((c) => c.topics.flatMap((t) => t.points)).filter((p) => ids.has(p.id));
}

export function topicById(data: InstructionData, id: string | null): InstructionTopic | null {
  if (!id) return null;
  for (const c of data.catalogs) for (const t of c.topics) if (t.id === id) return t;
  return null;
}

export const sortRecords = (r: InstructionRecord[]) =>
  [...r].sort((a, b) => (b.given_on ?? "").localeCompare(a.given_on ?? "") || b.created_at.localeCompare(a.created_at));

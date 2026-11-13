/**
 * Fälligkeitsregel der Unterweisungen (Daten-Prompt B1, Abschnitt 2).
 * Dieselbe Regel steht in SQL (instruction_overview_core); beide liefern für die Beispiele aus B1 dasselbe.
 */
export const LEAD_DAYS = 14;
export const MINOR_MAX_MONTHS = 6;

export type DueState = "open" | "optional" | "valid" | "due_soon" | "overdue";
export type RecordStatus = "draft" | "submitted" | "confirmed" | "rejected";

export interface DueTopic { id: string; interval_months: number | null; is_optional: boolean; is_active: boolean }
export interface DueRecord { id: string; topic_id: string | null; given_on: string | null; status: string; submitted_at?: string | null }
export interface TopicStatus {
  topic_id: string;
  state: DueState;
  effective_months: number | null;
  last_record_id: string | null;
  last_given_on: string | null;
  last_confirmed: boolean;
  due_on: string | null;
}

const COUNTED = new Set(["submitted", "confirmed"]);

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return [y!, m!, d!];
}
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Datum plus Monate; fällt der Tag hinter das Monatsende, gilt das Monatsende. */
export function addMonthsClamped(iso: string, months: number): string {
  const [y, m, d] = parts(iso);
  const idx = y * 12 + (m - 1) + months;
  const ny = Math.floor(idx / 12), nm = (idx % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return fmt(ny, nm, Math.min(d, last));
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = parts(iso);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Volle Lebensjahre am Stichtag. */
export function ageOn(birth: string, on: string): number {
  const [by, bm, bd] = parts(birth);
  const [y, m, d] = parts(on);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Intervall unter Beachtung von § 29 JArbSchG (unter 18 höchstens 6 Monate); ohne Geburtsdatum volljährig. */
export function effectiveMonths(interval: number | null, birth: string | null | undefined, refDate: string): number | null {
  if (interval == null) return null;
  if (birth && ageOn(birth, refDate) < 18) return Math.min(interval, MINOR_MAX_MONTHS);
  return interval;
}

/** Heute in Europe/Berlin als YYYY-MM-DD. */
export function berlinToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Zuletzt gezählter Nachweis je Thema (größtes given_on; bei Gleichstand bestätigt vor eingereicht). */
export function lastCounted(records: DueRecord[], topicId: string): DueRecord | null {
  let best: DueRecord | null = null;
  for (const r of records) {
    if (r.topic_id !== topicId || !r.given_on || !COUNTED.has(r.status)) continue;
    if (!best || r.given_on > best.given_on! || (r.given_on === best.given_on && r.status === "confirmed" && best.status !== "confirmed")) best = r;
  }
  return best;
}

export function topicStatus(topic: DueTopic, records: DueRecord[], birth: string | null | undefined, asOf: string): TopicStatus | null {
  const last = lastCounted(records, topic.id);
  if (!topic.is_active && !last) return null;
  const eff = effectiveMonths(topic.interval_months, birth, last?.given_on ?? asOf);
  const due = last && eff != null ? addMonthsClamped(last.given_on!, eff) : null;
  let state: DueState;
  if (!last) state = topic.is_optional ? "optional" : "open";
  else if (!due || due > addDays(asOf, LEAD_DAYS)) state = "valid";
  else if (due < asOf) state = "overdue";
  else state = "due_soon";
  return {
    topic_id: topic.id, state, effective_months: eff, last_record_id: last?.id ?? null,
    last_given_on: last?.given_on ?? null, last_confirmed: last?.status === "confirmed", due_on: due,
  };
}

export function computeStatuses(topics: DueTopic[], records: DueRecord[], birth: string | null | undefined, asOf: string): TopicStatus[] {
  return topics.map((t) => topicStatus(t, records, birth, asOf)).filter((s): s is TopicStatus => s !== null);
}

export interface InstructionKpis { done: number; total: number; percent: number; open: number; dueSoon: number; overdue: number }

/** Kennzahlen (B2, Abschnitt 1.2): y = alle Themen außer 'optional', x = davon mit Nachweis. */
export function instructionKpis(statuses: TopicStatus[]): InstructionKpis {
  const counted = statuses.filter((s) => s.state !== "optional");
  const done = counted.filter((s) => s.state !== "open").length;
  const total = counted.length;
  return {
    done, total, percent: total ? Math.round((done / total) * 100) : 0,
    open: statuses.filter((s) => s.state === "open").length,
    dueSoon: statuses.filter((s) => s.state === "due_soon").length,
    overdue: statuses.filter((s) => s.state === "overdue").length,
  };
}

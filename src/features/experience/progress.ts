/**
 * Reine Rechenlogik für Erfahrungsberichte (ohne Netz und Datenbank).
 * Einzige Stelle für Lehrjahre, Punkte und Status – Komponenten rechnen nie selbst.
 * Dieselben Regeln stehen in experience_year_counts (SQL).
 */
export type ExperienceKind = "erfahrungsbericht" | "projektbericht" | "leittext";
export type ExperienceStatus = "draft" | "submitted" | "approved" | "rejected";
export type YearState = "done" | "waiting" | "open" | "late" | "upcoming";

export interface ProgressReport { id: string; kind: string; status: string; written_on: string }
export interface ProgressRequirement {
  required_per_year: number;
  leittext_weight: number;
  hint_per_year?: number | null;
  hint_total?: number | null;
  hint_until_interim?: number | null;
  hint_kind?: string | null;
}
export interface ProgressYear {
  year: number; label: string; start: string; end: string;
  isCurrent: boolean; isPast: boolean; isFuture: boolean;
  required: number; approved: number; submitted: number; drafts: number; missing: number; extra: number;
  state: YearState;
}
export interface ProgressResult {
  hasYears: boolean;
  years: ProgressYear[];
  total: { required: number; approved: number; submitted: number; extra: number; fulfilled: boolean };
  hint: { perYear: number | null; total: number | null; untilInterim: number | null; kind: string | null; counted: number } | null;
}

function parse(d: string): [number, number, number] {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return [y!, m!, day!];
}
function fmt(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
/** Datum + n Jahre (29.02. → 28.02. wie in PostgreSQL). */
export function addYearsIso(d: string, n: number): string {
  const [y, m, day] = parse(d);
  const ty = y + n;
  const last = new Date(Date.UTC(ty, m, 0)).getUTCDate();
  return fmt(ty, m, Math.min(day, last));
}
export function addDaysIso(d: string, n: number): string {
  const [y, m, day] = parse(d);
  const t = new Date(Date.UTC(y, m - 1, day + n));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Wie training_year_count: ohne Ende 3, sonst die Zahl der begonnenen Lehrjahre bis zum Ende (mindestens 1). */
export function trainingYearCount(start: string, end: string | null): number {
  if (!end) return 3;
  let n = 0;
  while (addYearsIso(start, n) <= end && n <= 20) n++;
  return Math.max(n, 1);
}
/** Wie training_year_bounds. */
export function trainingYearBounds(start: string, end: string | null, n: number): { start: string; end: string } {
  const e = end ?? addDaysIso(addYearsIso(start, 3), -1);
  const ys = addYearsIso(start, n - 1);
  const ye = addDaysIso(addYearsIso(start, n), -1);
  return { start: ys, end: ye < e ? ye : e };
}
/** Wie training_year_clamped: vor Beginn 1, nach dem Ende das letzte Lehrjahr. */
export function trainingYearClamped(start: string | null, end: string | null, date: string): number | null {
  if (!start) return null;
  const total = trainingYearCount(start, end);
  if (date < start) return 1;
  for (let n = 1; n <= total; n++) if (date < addYearsIso(start, n)) return n;
  return total;
}

export function pointsFor(kind: string, leittextWeight: number): number {
  return kind === "leittext" ? leittextWeight : 1;
}

export function computeProgress(input: {
  reports: ProgressReport[];
  requirement: ProgressRequirement;
  beginn: string | null;
  ende: string | null;
  today: string;
}): ProgressResult {
  const { reports, requirement, beginn, ende, today } = input;
  const req = requirement.required_per_year;
  const w = requirement.leittext_weight;
  const hasHint = requirement.hint_per_year != null || requirement.hint_total != null || requirement.hint_until_interim != null;
  let counted = 0;
  for (const r of reports) if (r.status === "approved" || r.status === "submitted") counted += pointsFor(r.kind, w);
  const hint = hasHint ? {
    perYear: requirement.hint_per_year ?? null, total: requirement.hint_total ?? null,
    untilInterim: requirement.hint_until_interim ?? null, kind: requirement.hint_kind ?? null, counted,
  } : null;

  if (!beginn) {
    let approved = 0; let submitted = 0;
    for (const r of reports) {
      if (r.status === "approved") approved += pointsFor(r.kind, w);
      else if (r.status === "submitted") submitted += pointsFor(r.kind, w);
    }
    return { hasYears: false, years: [], total: { required: 0, approved, submitted, extra: 0, fulfilled: false }, hint };
  }

  const count = trainingYearCount(beginn, ende);
  const current = trainingYearClamped(beginn, ende, today);
  const years: ProgressYear[] = [];
  for (let n = 1; n <= count; n++) {
    const b = trainingYearBounds(beginn, ende, n);
    let approved = 0; let submitted = 0; let drafts = 0;
    for (const r of reports) {
      if (trainingYearClamped(beginn, ende, r.written_on) !== n) continue;
      if (r.status === "approved") approved += pointsFor(r.kind, w);
      else if (r.status === "submitted") submitted += pointsFor(r.kind, w);
      else drafts += 1;
    }
    const isFuture = today < b.start;
    const isPast = today > b.end;
    let state: YearState;
    if (isFuture) state = "upcoming";
    else if (approved >= req) state = "done";
    else if (approved + submitted >= req) state = "waiting";
    else if (isPast) state = "late";
    else state = "open";
    years.push({
      year: n, label: `${n}. Lehrjahr`, start: b.start, end: b.end, isCurrent: n === current, isPast, isFuture,
      required: req, approved, submitted, drafts,
      missing: Math.max(0, req - approved - submitted), extra: Math.max(0, approved + submitted - req), state,
    });
  }
  const total = {
    required: req * count,
    approved: years.reduce((s, y) => s + Math.min(y.approved, y.required), 0),
    submitted: years.reduce((s, y) => s + Math.min(y.submitted, Math.max(0, y.required - y.approved)), 0),
    extra: years.reduce((s, y) => s + y.extra, 0),
    fulfilled: years.every((y) => y.state === "done"),
  };
  return { hasYears: true, years, total, hint };
}

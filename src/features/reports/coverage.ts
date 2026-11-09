import { addDays, format, isAfter, isBefore, startOfDay } from "date-fns";
import type { Report, ReportStatus } from "./api";

export type CoverageKind = ReportStatus | "absent" | "missing";

export const COVERAGE_LABELS: Record<CoverageKind, string> = {
  approved: "Freigegeben",
  submitted: "Eingereicht",
  draft: "Entwurf",
  rejected: "Zurückgewiesen",
  absent: "Abwesend",
  missing: "Fehlend",
};

/** Besserer Status gewinnt: Freigegeben > Eingereicht > Entwurf > Zurückgewiesen. */
const RANK: Record<CoverageKind, number> = {
  approved: 5,
  submitted: 4,
  draft: 3,
  rejected: 2,
  absent: 1,
  missing: 0,
};

export interface CoverageDay {
  date: string; // yyyy-MM-dd
  kind: CoverageKind;
  report?: Report;
}

export interface CoverageResult {
  days: CoverageDay[];
  /** Tage je Kategorie, in absteigender Wertigkeit. */
  counts: { kind: CoverageKind; count: number }[];
  documented: number;
  total: number;
}

function isoWeekMonday(d: Date): Date {
  const day = d.getDay() === 0 ? 7 : d.getDay();
  return addDays(startOfDay(d), -(day - 1));
}

/**
 * Tage-Abdeckung berechnen: jeder Kalendertag von `from` bis `to` bekommt genau
 * ein Segment. Ein Wochenbericht deckt Montag bis Sonntag seiner ISO-Woche ab,
 * ein Tagesbericht seinen Tag. Mehrere Berichte auf einem Tag: der beste Status zählt.
 * `absentDates` (Baustein 2B) markiert Tage mit nicht abgelehnter Abwesenheit.
 */
export function computeCoverage(
  reports: Pick<Report, "id" | "report_type" | "report_date" | "status">[],
  from: Date,
  to: Date,
  absentDates: Set<string> = new Set(),
): CoverageResult {
  const byDay = new Map<string, { kind: CoverageKind; report?: Report }>();

  for (const r of reports) {
    const days: Date[] = [];
    if (r.report_type === "weekly") {
      const monday = isoWeekMonday(new Date(r.report_date + "T00:00:00"));
      for (let i = 0; i < 7; i++) days.push(addDays(monday, i));
    } else {
      days.push(new Date(r.report_date + "T00:00:00"));
    }
    for (const d of days) {
      const key = format(d, "yyyy-MM-dd");
      const prev = byDay.get(key);
      if (!prev || RANK[r.status] > RANK[prev.kind]) {
        byDay.set(key, { kind: r.status, report: r as Report });
      }
    }
  }

  const days: CoverageDay[] = [];
  const counts = new Map<CoverageKind, number>();
  let documented = 0;
  for (let d = startOfDay(from); !isAfter(d, to); d = addDays(d, 1)) {
    const key = format(d, "yyyy-MM-dd");
    const hit = byDay.get(key);
    let kind: CoverageKind = hit?.kind ?? "missing";
    let report = hit?.report;
    if (!hit && absentDates.has(key)) kind = "absent";
    // Ein Tag außerhalb des Zeitraums (Wochenbericht reicht über `to` hinaus) zählt trotzdem.
    if (isBefore(d, from)) continue;
    days.push({ date: key, kind, report });
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    if (kind !== "missing") documented++;
  }

  const ordered = (Object.keys(COVERAGE_LABELS) as CoverageKind[])
    .filter((k) => (counts.get(k) ?? 0) > 0)
    .sort((a, b) => RANK[b] - RANK[a])
    .map((kind) => ({ kind, count: counts.get(kind) ?? 0 }));

  return { days, counts: ordered, documented, total: days.length };
}

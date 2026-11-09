import { addDays, addYears, isAfter, isBefore, startOfDay } from "date-fns";

export interface TrainingYear {
  year: number;
  start: Date;
  end: Date;
  label: string;
}

const DEFAULT_TOTAL_YEARS = 3;

/** 1. August des Jahres von ref, wenn ref ab dem 1.8. liegt, sonst 1. August des Vorjahres. */
export function defaultYearStart(ref: Date = new Date()): Date {
  const y = ref.getFullYear();
  const aug1 = new Date(y, 7, 1);
  return startOfDay(ref) >= aug1 ? aug1 : new Date(y - 1, 7, 1);
}

export function defaultPeriodForYear(
  currentYear: number,
  totalYears: number = DEFAULT_TOTAL_YEARS,
  ref: Date = new Date(),
): { start: Date; end: Date } {
  const start = addYears(defaultYearStart(ref), -(currentYear - 1));
  const end = addDays(addYears(start, totalYears), -1);
  return { start, end };
}

export function trainingYears(start: Date, end?: Date): TrainingYear[] {
  const s = startOfDay(start);
  const e = end ? startOfDay(end) : addDays(addYears(s, DEFAULT_TOTAL_YEARS), -1);
  const result: TrainingYear[] = [];
  for (let n = 1; ; n++) {
    const yStart = addYears(s, n - 1);
    if (isAfter(yStart, e)) break;
    let yEnd = addDays(addYears(s, n), -1);
    if (isAfter(yEnd, e)) yEnd = e;
    result.push({ year: n, start: yStart, end: yEnd, label: `${n}. Lehrjahr` });
    if (n > 20) break;
  }
  return result;
}

export function yearOfDate(date: Date, start: Date, end?: Date): number | null {
  const d = startOfDay(date);
  const hit = trainingYears(start, end).find((y) => !isBefore(d, y.start) && !isAfter(d, y.end));
  return hit ? hit.year : null;
}

export function currentTrainingYear(start: Date, end?: Date, today: Date = new Date()): number {
  const years = trainingYears(start, end);
  if (years.length === 0) return 1;
  const d = startOfDay(today);
  if (isBefore(d, years[0].start)) return 1;
  if (isAfter(d, years[years.length - 1].end)) return years[years.length - 1].year;
  return yearOfDate(d, start, end) ?? 1;
}

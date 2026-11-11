import { differenceInCalendarDays, max, min } from "date-fns";
import type { Absence, AbsenceType } from "./api";

export function parseLocalDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

export function inclusiveDays(from: string, to: string): number {
  return differenceInCalendarDays(parseLocalDate(to), parseLocalDate(from)) + 1;
}

export function absenceDaysInPeriod(absence: Pick<Absence, "date_from" | "date_to" | "status">, from: Date, to: Date): number {
  if (absence.status === "rejected") return 0;
  const start = max([parseLocalDate(absence.date_from), from]);
  const end = min([parseLocalDate(absence.date_to), to]);
  return Math.max(0, differenceInCalendarDays(end, start) + 1);
}

export function absenceMetric(absences: Absence[], type: AbsenceType, from: Date, to: Date): number {
  return absences.filter((a) => a.type === type).reduce((sum, absence) => sum + absenceDaysInPeriod(absence, from, to), 0);
}

import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { Grade } from "./api";

export function parseGradeInput(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 10) / 10 : null;
}

export function formatGrade(value: number, digits = 1): string {
  return value.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function averageGrade(grades: Pick<Grade, "grade">[]): number | null {
  if (!grades.length) return null;
  return grades.reduce((sum, grade) => sum + Number(grade.grade), 0) / grades.length;
}

export interface SubjectAverage {
  subject: string;
  average: number;
  count: number;
}

export function subjectAverages(grades: Grade[]): SubjectAverage[] {
  const groups = new Map<string, number[]>();
  for (const grade of grades) groups.set(grade.subject, [...(groups.get(grade.subject) ?? []), Number(grade.grade)]);
  return [...groups.entries()].map(([subject, values]) => ({
    subject,
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    count: values.length,
  })).sort((a, b) => a.average - b.average || a.subject.localeCompare(b.subject, "de"));
}

export interface TrendPoint {
  key: string;
  label: string;
  grade: number;
  count: number;
}

export function gradeTrend(grades: Grade[], subject: string): TrendPoint[] {
  const sorted = [...grades].sort((a, b) => a.grade_date.localeCompare(b.grade_date));
  if (subject !== "all") {
    return sorted.filter((g) => g.subject === subject).map((g) => ({
      key: g.id,
      label: format(new Date(`${g.grade_date}T00:00:00`), "dd.MM.yy", { locale: de }),
      grade: Number(g.grade),
      count: 1,
    }));
  }
  const months = new Map<string, Grade[]>();
  for (const grade of sorted) {
    const month = grade.grade_date.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), grade]);
  }
  return [...months.entries()].map(([month, values]) => ({
    key: month,
    label: format(new Date(`${month}-01T00:00:00`), "MMM yy", { locale: de }),
    grade: averageGrade(values) ?? 0,
    count: values.length,
  }));
}

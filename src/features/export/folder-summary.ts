/** Kennzahlen für die Prüfungsmappe (rein, testbar). */
export interface FolderGrade { subject: string; grade: number; grade_date: string; kind: string; note: string | null }
export interface FolderAbsence { type: string; date_from: string; date_to: string; status: string }

export const GRADE_KIND_DE: Record<string, string> = { klausur: "Klausur", muendlich: "Mündlich", test: "Test", sonstige: "Sonstige" };
export const ABSENCE_TYPE_DE: Record<string, string> = { urlaub: "Urlaub", krank: "Krankheit", berufsschule: "Berufsschule", sonstiges: "Sonstiges" };

const fmt = (n: number) => n.toFixed(2).replace(".", ",");

/** Durchschnitt je Fach (alphabetisch) und gesamt; Noten mit zwei Nachkommastellen. */
export function gradeAverages(grades: FolderGrade[]): { subjects: { subject: string; count: number; average: string; exams: number }[]; overall: string | null } {
  const by = new Map<string, number[]>(), exams = new Map<string, number>();
  for (const g of grades) {
    by.set(g.subject, [...(by.get(g.subject) ?? []), Number(g.grade)]);
    if (g.kind === "klausur" || g.kind === "test") exams.set(g.subject, (exams.get(g.subject) ?? 0) + 1);
  }
  const subjects = [...by.entries()].sort(([a], [b]) => a.localeCompare(b, "de")).map(([subject, list]) => ({
    subject, count: list.length, exams: exams.get(subject) ?? 0, average: fmt(list.reduce((s, x) => s + x, 0) / list.length),
  }));
  const all = grades.map((g) => Number(g.grade));
  return { subjects, overall: all.length ? fmt(all.reduce((s, x) => s + x, 0) / all.length) : null };
}

/** Werktage (Mo–Fr) je Abwesenheitsart, nur genehmigte, begrenzt auf den Zeitraum. */
export function absenceDays(absences: FolderAbsence[], from: string | null, to: string | null): { type: string; days: number }[] {
  const out = new Map<string, number>();
  for (const a of absences) {
    if (a.status !== "approved") continue;
    const start = new Date(`${from && from > a.date_from ? from : a.date_from}T00:00:00Z`);
    const end = new Date(`${to && to < a.date_to ? to : a.date_to}T00:00:00Z`);
    let n = 0;
    for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) { const wd = d.getUTCDay(); if (wd !== 0 && wd !== 6) n++; }
    if (n > 0) out.set(a.type, (out.get(a.type) ?? 0) + n);
  }
  return [...out.entries()].map(([type, days]) => ({ type, days }));
}

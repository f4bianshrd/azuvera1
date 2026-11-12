import { describe, expect, it } from "vitest";
import { absenceDays, gradeAverages } from "./folder-summary";

describe("Prüfungsmappe – Kennzahlen", () => {
  it("rechnet Durchschnitt je Fach und gesamt", () => {
    const r = gradeAverages([
      { subject: "Pflanzenbau", grade: 2, grade_date: "2026-01-10", kind: "klausur", note: null },
      { subject: "Pflanzenbau", grade: 3, grade_date: "2026-02-10", kind: "muendlich", note: null },
      { subject: "Deutsch", grade: 1.5, grade_date: "2026-02-11", kind: "test", note: null },
    ]);
    expect(r.subjects).toEqual([
      { subject: "Deutsch", count: 1, exams: 1, average: "1,50" },
      { subject: "Pflanzenbau", count: 2, exams: 1, average: "2,50" },
    ]);
    expect(r.overall).toBe("2,17");
  });
  it("zählt nur genehmigte Abwesenheiten als Werktage im Zeitraum", () => {
    const r = absenceDays([
      { type: "urlaub", date_from: "2026-03-02", date_to: "2026-03-08", status: "approved" },
      { type: "krank", date_from: "2026-03-09", date_to: "2026-03-10", status: "pending" },
    ], "2026-03-04", null);
    expect(r).toEqual([{ type: "urlaub", days: 3 }]);
  });
});

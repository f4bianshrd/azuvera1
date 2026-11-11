import { describe, expect, it } from "vitest";
import { averageGrade, parseGradeInput, subjectAverages } from "./grade-utils";
import type { Grade } from "./api";

function grade(id: string, subject: string, value: number): Grade {
  return { id, azubi_id: "a", subject, grade: value, grade_date: "2026-11-01", kind: "klausur", note: null, created_at: "", updated_at: "" };
}

describe("Schulnoten", () => {
  it("akzeptiert Komma und Punkt als Dezimaltrennzeichen", () => {
    expect(parseGradeInput("2,5")).toBe(2.5);
    expect(parseGradeInput("2.5")).toBe(2.5);
  });

  it("berechnet den ungewichteten Gesamtschnitt", () => {
    expect(averageGrade([grade("1", "WiSo", 1.5), grade("2", "WiSo", 2.5), grade("3", "Deutsch", 3)])).toBeCloseTo(7 / 3);
  });

  it("berechnet Fachschnitte und sortiert den besten zuerst", () => {
    const result = subjectAverages([grade("1", "WiSo", 1.5), grade("2", "WiSo", 2.5), grade("3", "Deutsch", 3)]);
    expect(result[0]).toEqual({ subject: "WiSo", average: 2, count: 2 });
    expect(result[1]).toEqual({ subject: "Deutsch", average: 3, count: 1 });
  });
});

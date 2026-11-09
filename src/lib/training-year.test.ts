import { describe, expect, it } from "vitest";
import { currentTrainingYear, defaultPeriodForYear, defaultYearStart, trainingYears, yearOfDate } from "./training-year";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe("training-year", () => {
  it("defaultYearStart: ab 1.8. aktuelles Jahr, sonst Vorjahr", () => {
    expect(defaultYearStart(d(2026, 8, 1))).toEqual(d(2026, 8, 1));
    expect(defaultYearStart(d(2026, 7, 31))).toEqual(d(2025, 8, 1));
  });
  it("defaultPeriodForYear: 2. Lehrjahr im Nov 2026 beginnt 1.8.2025, endet 31.7.2028", () => {
    expect(defaultPeriodForYear(2, 3, d(2026, 11, 9))).toEqual({ start: d(2025, 8, 1), end: d(2028, 7, 31) });
  });
  it("trainingYears ohne Ende: genau 3 Jahre", () => {
    const ys = trainingYears(d(2025, 8, 1));
    expect(ys).toHaveLength(3);
    expect(ys[2]).toMatchObject({ year: 3, start: d(2027, 8, 1), end: d(2028, 7, 31), label: "3. Lehrjahr" });
  });
  it("trainingYears kappt am Ende", () => {
    const ys = trainingYears(d(2025, 8, 1), d(2027, 1, 31));
    expect(ys).toHaveLength(2);
    expect(ys[1].end).toEqual(d(2027, 1, 31));
  });
  it("yearOfDate und currentTrainingYear", () => {
    expect(yearOfDate(d(2026, 7, 31), d(2025, 8, 1))).toBe(1);
    expect(yearOfDate(d(2026, 8, 1), d(2025, 8, 1))).toBe(2);
    expect(yearOfDate(d(2030, 1, 1), d(2025, 8, 1))).toBeNull();
    expect(currentTrainingYear(d(2025, 8, 1), undefined, d(2024, 1, 1))).toBe(1);
    expect(currentTrainingYear(d(2025, 8, 1), undefined, d(2030, 1, 1))).toBe(3);
  });
});

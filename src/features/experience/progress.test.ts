import { describe, expect, it } from "vitest";
import { computeProgress, trainingYearBounds, trainingYearClamped, trainingYearCount, type ProgressReport } from "./progress";

const req = { required_per_year: 2, leittext_weight: 0 };
const base = { beginn: "2025-08-01", ende: "2028-07-31", today: "2026-03-01" };
let n = 0;
const rep = (status: string, written_on: string, kind = "erfahrungsbericht"): ProgressReport => ({ id: String(++n), kind, status, written_on });

describe("computeProgress", () => {
  it("(1) keine Berichte, 3 Jahre, Ziel 2", () => {
    const p = computeProgress({ reports: [], requirement: req, ...base });
    expect(p.years).toHaveLength(3);
    expect(p.total).toEqual({ required: 6, approved: 0, submitted: 0, extra: 0, fulfilled: false });
  });
  it("(2) zwei freigegebene im 1. Jahr → done", () => {
    const p = computeProgress({ reports: [rep("approved", "2025-09-01"), rep("approved", "2025-10-01")], requirement: req, ...base });
    expect(p.years[0]!.state).toBe("done");
  });
  it("(3) eins freigegeben, eins eingereicht → waiting", () => {
    const p = computeProgress({ reports: [rep("approved", "2025-09-01"), rep("submitted", "2025-10-01")], requirement: req, ...base });
    expect(p.years[0]!.state).toBe("waiting");
  });
  it("(4) drei freigegeben → extra 1, Gesamt zählt nur 2", () => {
    const p = computeProgress({ reports: [rep("approved", "2025-09-01"), rep("approved", "2025-10-01"), rep("approved", "2025-11-01")], requirement: req, ...base });
    expect(p.years[0]!.extra).toBe(1);
    expect(p.total.approved).toBe(2);
    expect(p.total.extra).toBe(1);
  });
  it("(5) Jahr vorbei mit 1 von 2 → late", () => {
    const p = computeProgress({ reports: [rep("approved", "2025-09-01")], requirement: req, ...base, today: "2026-09-01" });
    expect(p.years[0]!.state).toBe("late");
    expect(p.years[1]!.isCurrent).toBe(true);
  });
  it("(6) Leittext mit Gewicht 2 erfüllt das Jahr, mit 0 nicht", () => {
    const reports = [rep("approved", "2025-09-01", "leittext")];
    expect(computeProgress({ reports, requirement: { required_per_year: 2, leittext_weight: 2 }, ...base }).years[0]!.state).toBe("done");
    expect(computeProgress({ reports, requirement: req, ...base }).years[0]!.approved).toBe(0);
  });
  it("(7) vor Beginn ins 1., nach dem Ende ins letzte Lehrjahr", () => {
    const p = computeProgress({ reports: [rep("approved", "2025-01-01"), rep("submitted", "2029-01-01")], requirement: req, ...base });
    expect(p.years[0]!.approved).toBe(1);
    expect(p.years[2]!.submitted).toBe(1);
  });
  it("(8) ohne Ausbildungsbeginn keine Lehrjahre", () => {
    const p = computeProgress({ reports: [rep("approved", "2025-09-01"), rep("draft", "2025-09-02")], requirement: req, beginn: null, ende: null, today: "2026-01-01" });
    expect(p.hasYears).toBe(false);
    expect(p.years).toEqual([]);
    expect(p.total.approved).toBe(1);
  });
  it("Entwürfe und Zurückgewiesene zählen nie zum Ziel", () => {
    const p = computeProgress({ reports: [rep("draft", "2025-09-01"), rep("rejected", "2025-09-02")], requirement: req, ...base });
    expect(p.years[0]!.drafts).toBe(2);
    expect(p.years[0]!.approved + p.years[0]!.submitted).toBe(0);
    expect(p.years[0]!.missing).toBe(2);
  });
  it("Hinweise zählen alle eingereichten und freigegebenen Punkte ohne Deckelung", () => {
    const p = computeProgress({ reports: [rep("approved", "2025-09-01"), rep("approved", "2025-09-02"), rep("submitted", "2025-09-03")], requirement: { ...req, hint_total: 15, hint_until_interim: 8, hint_kind: "recommended" }, ...base });
    expect(p.hint).toEqual({ perYear: null, total: 15, untilInterim: 8, kind: "recommended", counted: 3 });
    expect(computeProgress({ reports: [], requirement: req, ...base }).hint).toBeNull();
  });
});

describe("Lehrjahre wie in der Datenbank", () => {
  it("liefert dieselben Werte wie training_year_count/bounds/clamped", () => {
    expect(trainingYearCount("2025-08-01", "2028-07-31")).toBe(3);
    expect(trainingYearCount("2025-08-01", null)).toBe(3);
    expect(trainingYearCount("2025-08-01", "2027-01-31")).toBe(2);
    expect(trainingYearBounds("2025-08-01", "2027-01-31", 2)).toEqual({ start: "2026-08-01", end: "2027-01-31" });
    expect(trainingYearClamped("2025-08-01", "2028-07-31", "2025-01-01")).toBe(1);
    expect(trainingYearClamped("2025-08-01", "2028-07-31", "2026-08-01")).toBe(2);
    expect(trainingYearClamped("2025-08-01", "2028-07-31", "2030-01-01")).toBe(3);
    expect(trainingYearClamped(null, null, "2026-01-01")).toBeNull();
  });
});

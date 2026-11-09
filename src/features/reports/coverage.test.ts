import { describe, expect, it } from "vitest";
import { computeCoverage } from "./coverage";

const rep = (id: string, type: "daily" | "weekly", date: string, status: "draft" | "submitted" | "approved" | "rejected") =>
  ({ id, report_type: type, report_date: date, status }) as const;

describe("computeCoverage", () => {
  const from = new Date("2026-11-02T00:00:00"); // Montag KW 45
  const to = new Date("2026-11-09T00:00:00");

  it("zählt jeden Kalendertag genau einmal", () => {
    const r = computeCoverage([], from, to);
    expect(r.total).toBe(8);
    expect(r.documented).toBe(0);
    expect(r.counts).toEqual([{ kind: "missing", count: 8 }]);
  });

  it("ein Wochenbericht deckt 7 Tage ab (Montag bis Sonntag)", () => {
    const r = computeCoverage([rep("a", "weekly", "2026-11-02", "submitted")], from, to);
    expect(r.counts).toEqual([
      { kind: "submitted", count: 7 },
      { kind: "missing", count: 1 },
    ]);
    expect(r.documented).toBe(7);
  });

  it("Wochenbericht am Sonntag deckt dieselbe Woche ab", () => {
    const r = computeCoverage([rep("a", "weekly", "2026-11-08", "approved")], from, to);
    expect(r.counts[0]).toEqual({ kind: "approved", count: 7 });
  });

  it("doppelte Berichte zählen einen Tag nur einmal, bester Status gewinnt", () => {
    const r = computeCoverage(
      [rep("a", "daily", "2026-11-03", "rejected"), rep("b", "daily", "2026-11-03", "approved")],
      from,
      to,
    );
    const day = r.days.find((d) => d.date === "2026-11-03");
    expect(day?.kind).toBe("approved");
    expect(r.counts.find((c) => c.kind === "approved")?.count).toBe(1);
    expect(r.counts.find((c) => c.kind === "rejected")).toBeUndefined();
  });

  it("Entwurf schlägt Zurückgewiesen, Eingereicht schlägt Entwurf", () => {
    const r = computeCoverage(
      [rep("a", "daily", "2026-11-04", "rejected"), rep("b", "daily", "2026-11-04", "draft")],
      from,
      to,
    );
    expect(r.days.find((d) => d.date === "2026-11-04")?.kind).toBe("draft");
  });

  it("Abwesenheit markiert Tage ohne Bericht als Abwesend", () => {
    const r = computeCoverage([], from, to, new Set(["2026-11-05"]));
    expect(r.days.find((d) => d.date === "2026-11-05")?.kind).toBe("absent");
    expect(r.documented).toBe(1);
  });

  it("Bericht schlägt Abwesenheit", () => {
    const r = computeCoverage([rep("a", "daily", "2026-11-05", "draft")], from, to, new Set(["2026-11-05"]));
    expect(r.days.find((d) => d.date === "2026-11-05")?.kind).toBe("draft");
  });
});

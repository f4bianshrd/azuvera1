import { describe, expect, it } from "vitest";
import { absenceDaysInPeriod, inclusiveDays } from "./absence-utils";

const absence = { date_from: "2026-07-30", date_to: "2026-08-03", status: "approved" as const };

describe("Abwesenheitstage", () => {
  it("zählt Start- und Endtag einschließlich", () => {
    expect(inclusiveDays("2026-11-09", "2026-11-13")).toBe(5);
  });

  it("zählt über die Lehrjahresgrenze nur den anteiligen Zeitraum", () => {
    expect(absenceDaysInPeriod(absence, new Date("2026-08-01T00:00:00"), new Date("2027-07-31T00:00:00"))).toBe(3);
  });

  it("ignoriert abgelehnte Abwesenheiten", () => {
    expect(absenceDaysInPeriod({ ...absence, status: "rejected" }, new Date("2026-01-01T00:00:00"), new Date("2026-12-31T00:00:00"))).toBe(0);
  });
});

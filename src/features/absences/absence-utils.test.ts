import { describe, expect, it } from "vitest";
import { absenceDaysInPeriod, inclusiveDays, validateAbsenceDates } from "./absence-utils";

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

  it("erlaubt 366 Tage und blockiert 367 Tage", () => {
    expect(validateAbsenceDates("2026-01-01", "2026-12-31")).toBeNull();
    expect(validateAbsenceDates("2026-01-01", "2027-01-01")).toBe("Eine Abwesenheit darf höchstens 366 Tage umfassen.");
  });

  it("blockiert ein Enddatum vor dem Startdatum", () => {
    expect(validateAbsenceDates("2026-11-13", "2026-11-09")).toBe("Das Enddatum darf nicht vor dem Startdatum liegen.");
  });
});

import { describe, expect, it } from "vitest";
import { berlinStartOfDay, bulkSummary, isOverdue, reviewAgeLabel } from "./review-utils";

describe("Prüf-Warteschlange", () => {
  it("markiert Berichte erst ab sieben vollen Tagen als überfällig", () => {
    const now = new Date("2026-11-11T12:00:00Z");
    expect(isOverdue("2026-11-04T11:59:59Z", now)).toBe(true);
    expect(isOverdue("2026-11-04T12:00:01Z", now)).toBe(false);
  });

  it("beschriftet das Alter in Tagen", () => {
    expect(reviewAgeLabel("2026-11-08T12:00:00Z", new Date("2026-11-11T13:00:00Z"))).toBe("eingereicht vor 3 Tagen");
  });

  it("fasst Sammelfreigaben mit übersprungenen Berichten zusammen", () => {
    expect(bulkSummary(5, [{ message: "Der Bericht wurde inzwischen geändert." }])).toBe("5 freigegeben, 1 übersprungen: Der Bericht wurde inzwischen geändert.");
  });

  it("berücksichtigt Winter- und Sommerzeit für heutige Freigaben", () => {
    expect(berlinStartOfDay(new Date("2026-11-11T12:00:00Z"))).toBe("2026-11-10T23:00:00.000Z");
    expect(berlinStartOfDay(new Date("2026-07-01T12:00:00Z"))).toBe("2026-06-30T22:00:00.000Z");
  });
});

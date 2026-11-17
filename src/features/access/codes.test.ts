import { describe, expect, it } from "vitest";
import { daysLeft, extractCode, formatCode, inviteUrl, isValidCode, normalizeCode, roleCanReview } from "./codes";

describe("Einladungs-Codes", () => {
  it("Ausbilder:innen, Betriebsleitung und Ausbildungsberatung dürfen prüfen", () => {
    expect(roleCanReview("ausbilder")).toBe(true);
    expect(roleCanReview("betriebsleiter")).toBe(true);
    expect(roleCanReview("ausbildungsberater")).toBe(true);
  });
  it("Prüfer:innen und Lehrkräfte lesen nur", () => {
    expect(roleCanReview("pruefer")).toBe(false);
    expect(roleCanReview("lehrer")).toBe(false);
  });
  it("Ein Code hat 12 Zeichen ohne 0, 1, I, L und O", () => {
    expect(isValidCode("K7M2Q9XA4TBN")).toBe(true);
    expect(isValidCode("K7M2Q9XA4TB")).toBe(false);
    expect(isValidCode("K7M2Q9XA4TB0")).toBe(false);
    expect(isValidCode("K7M2Q9XA4TBL")).toBe(false);
  });
  it("Eingaben werden groß geschrieben, Leerzeichen und Bindestriche fallen weg", () => {
    expect(normalizeCode("k7m2-q9xa 4tbn")).toBe("K7M2Q9XA4TBN");
    expect(formatCode("k7m2q9xa4tbn")).toBe("K7M2-Q9XA-4TBN");
  });
  it("Der QR-Code enthält den Einladungslink mit Code und Rolle", () => {
    const url = inviteUrl("https://get.azuvera.de/", "K7M2-Q9XA-4TBN", "pruefer");
    expect(url).toBe("https://get.azuvera.de/einladung?code=K7M2Q9XA4TBN&rolle=pruefer");
    expect(extractCode(url)).toBe("K7M2Q9XA4TBN");
    expect(extractCode("https://example.com/anders?code=K7M2Q9XA4TBN")).toBeNull();
    expect(extractCode("K7M2-Q9XA-4TBN")).toBe("K7M2Q9XA4TBN");
  });
  it("Restlaufzeit in Tagen", () => {
    const now = new Date("2026-11-18T10:00:00Z");
    expect(daysLeft(null, now)).toBeNull();
    expect(daysLeft("2026-11-25T10:00:00Z", now)).toBe(7);
  });
});

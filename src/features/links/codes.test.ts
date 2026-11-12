import { describe, expect, it } from "vitest";
import { canRedeem, expiresInText, extractCode, formatCode, isValidCode, linkUrl, normalizeCode } from "./codes";

describe("Verknüpfungscodes", () => {
  it("Prüfer:innen/Lehrkräfte dürfen nur Lese-Codes einlösen", () => {
    expect(canRedeem("lehrer", "read")).toBe(true);
    expect(canRedeem("lehrer", "feedback")).toBe(false);
    expect(canRedeem("lehrer", "review")).toBe(false);
  });
  it("Ausbildungsberatung darf lesen und rückmelden, aber nicht freigeben", () => {
    expect(canRedeem("ausbildungsberater", "feedback")).toBe(true);
    expect(canRedeem("ausbildungsberater", "review")).toBe(false);
  });
  it("Ausbilder:innen und Betriebsleitung dürfen Prüf-Codes einlösen", () => {
    expect(canRedeem("ausbilder", "review")).toBe(true);
    expect(canRedeem("betriebsleiter", "review")).toBe(true);
  });
  it("Azubis lösen keine Codes ein", () => {
    expect(canRedeem("azubi", "read")).toBe(false);
  });
  it("liest Code aus Link oder Eingabe", () => {
    const url = linkUrl("https://get.azuvera.de/", "ABCD2345");
    expect(url).toBe("https://get.azuvera.de/verknuepfungen?code=ABCD2345");
    expect(extractCode(url)).toBe("ABCD2345");
    expect(extractCode(" abcd-2345 ")).toBe("ABCD2345");
    expect(extractCode("https://example.com/?code=ABCD2345")).toBeNull();
    expect(extractCode("ABCD0123")).toBeNull();
  });
  it("formatiert und prüft Codes", () => {
    expect(formatCode("ABCD2345")).toBe("ABCD-2345");
    expect(normalizeCode("ab cd-23")).toBe("ABCD23");
    expect(isValidCode("ABCD234")).toBe(false);
  });
  it("zeigt die Restlaufzeit", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(expiresInText("2026-01-08T00:00:00Z", now)).toBe("noch 7 Tage");
    expect(expiresInText("2026-01-01T05:30:00Z", now)).toBe("noch 5 Std.");
    expect(expiresInText("2025-12-31T00:00:00Z", now)).toBe("abgelaufen");
  });
});

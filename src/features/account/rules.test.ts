import { describe, expect, it } from "vitest";
import { closedEmail, dataExportFileName, groupStoragePaths, isClosedAccount, sameEmail, uniqueName, validRejectNote, zipSafeName } from "./rules";

describe("Bestätigungs-E-Mail", () => {
  it("ignoriert Groß- und Kleinschreibung", () => expect(sameEmail(" Test@Azuvera.DE ", "test@azuvera.de")).toBe(true));
  it("lehnt eine andere Adresse ab", () => expect(sameEmail("test@azuvera.de", "andere@azuvera.de")).toBe(false));
  it("lehnt ein Konto ohne Adresse ab", () => expect(sameEmail("", "")).toBe(false));
});

describe("Geschlossene Konten", () => {
  it("bekommen geloescht-{id}@azuvera.invalid", () => expect(closedEmail("abc")).toBe("geloescht-abc@azuvera.invalid"));
  it("werden an der Adresse erkannt", () => {
    expect(isClosedAccount("geloescht-abc@azuvera.invalid")).toBe(true);
    expect(isClosedAccount("fabian@azuvera.de")).toBe(false);
  });
});

describe("Ablehnungsbegründung", () => {
  it("verlangt mindestens 3 Zeichen", () => { expect(validRejectNote("  ab ")).toBe(false); expect(validRejectNote("abc")).toBe(true); });
  it("erlaubt höchstens 500 Zeichen", () => { expect(validRejectNote("x".repeat(500))).toBe(true); expect(validRejectNote("x".repeat(501))).toBe(false); });
});

describe("Speicherpfade", () => {
  it("werden nach Bucket gruppiert und doppelte entfernt", () => {
    const g = groupStoragePaths(["report-files/u/r/a.jpg", "signatures/u/s.png", "report-files/u/r/a.jpg", "kaputt", "report-files/"]);
    expect(g.get("report-files")).toEqual(["u/r/a.jpg"]);
    expect(g.get("signatures")).toEqual(["u/s.png"]);
    expect(g.size).toBe(2);
  });
});

describe("Datenexport-Dateien", () => {
  it("heißt Azuvera_Datenexport_JJJJ-MM-TT.zip", () => expect(dataExportFileName(new Date(2026, 10, 3))).toBe("Azuvera_Datenexport_2026-11-03.zip"));
  it("entfernt Pfadtrenner aus Dateinamen", () => expect(zipSafeName("../../etc/passwd")).toBe("_.._etc_passwd".replace(/^\.+/, "")));
  it("vergibt eindeutige Namen", () => {
    const used = new Set<string>();
    expect([uniqueName(used, "a.png"), uniqueName(used, "a.png"), uniqueName(used, "a.png")]).toEqual(["a.png", "a (2).png", "a (3).png"]);
  });
});

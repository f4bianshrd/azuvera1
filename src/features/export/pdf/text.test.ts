import { describe, expect, it } from "vitest";
import { safeFileName, sanitizeForPdf, wrapText } from "./text";

// Jedes Zeichen 5 pt breit bei Größe 10.
const font = { widthOfTextAtSize: (t: string, s: number) => [...t].length * s * 0.5 };

describe("wrapText", () => {
  it("liefert für leeren Text keine Zeilen", () => {
    expect(wrapText("", font, 10, 100)).toEqual([]);
  });
  it("trennt ein sehr langes Wort hart", () => {
    expect(wrapText("a".repeat(45), font, 10, 100)).toEqual(["a".repeat(20), "a".repeat(20), "a".repeat(5)]);
  });
  it("misst Umlaute als einzelne Zeichen", () => {
    expect(wrapText("Übung äöü Größe", font, 10, 50)).toEqual(["Übung äöü", "Größe"]);
  });
  it("erhält Zeilenumbrüche und Leerzeilen", () => {
    expect(wrapText("Eins\n\nZwei", font, 10, 100)).toEqual(["Eins", "", "Zwei"]);
  });
});

describe("sanitizeForPdf", () => {
  it("ersetzt Emojis durch ? und behält Umlaute und Anführungszeichen", () => {
    expect(sanitizeForPdf("Gut 👍 „Größe“ – €")).toBe("Gut ? „Größe“ – €");
  });
  it("entfernt Steuerzeichen außer Zeilenumbruch", () => {
    expect(sanitizeForPdf("a\u0007b\r\nc")).toBe("ab\nc");
  });
});

describe("safeFileName", () => {
  it("ersetzt Umlaute und entfernt Sonderzeichen", () => {
    expect(safeFileName("Berichtsheft_Müller_Jörg_Straße (2026)")).toBe("Berichtsheft_Mueller_Joerg_Strasse_2026");
  });
});

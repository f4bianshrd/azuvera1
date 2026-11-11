import { describe, expect, it } from "vitest";
import { applySpokenPunctuation } from "./punctuation";

describe("applySpokenPunctuation", () => {
  it("ersetzt Satzzeichen und schreibt Satzanfänge groß", () => {
    expect(applySpokenPunctuation("heute Silage gefahren Punkt danach Stall gemistet Komma Tiere kontrolliert Punkt", ""))
      .toBe("Heute Silage gefahren. Danach Stall gemistet, Tiere kontrolliert.");
  });

  it("lässt Treffpunkt unverändert", () => {
    expect(applySpokenPunctuation("Treffpunkt", "")).toBe("Treffpunkt");
  });

  it("erzeugt einen Zeilenumbruch für neue Zeile", () => {
    expect(applySpokenPunctuation("erste Zeile neue Zeile zweite Zeile", "")).toBe("Erste Zeile\nZweite Zeile");
  });
});

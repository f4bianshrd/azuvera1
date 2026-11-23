import { describe, expect, it } from "vitest";
import { csvCell } from "./csv";

describe("csvCell", () => {
  it("entschärft Formeln am Anfang", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+1")).toBe("\"'+1\"");
    expect(csvCell("-2+3")).toBe("\"'-2+3\"");
    expect(csvCell("@SUM(A1)")).toBe("\"'@SUM(A1)\"");
    expect(csvCell("  =1+1")).toBe("\"'  =1+1\"");
  });
  it("lässt normale Texte und Zahlen unverändert", () => {
    expect(csvCell("Max Mustermann")).toBe("\"Max Mustermann\"");
    expect(csvCell(-5)).toBe("\"-5\"");
    expect(csvCell(null)).toBe("\"\"");
  });
  it("setzt bei Semikolon-Trennung nur bei Bedarf Anführungszeichen", () => {
    expect(csvCell("abc", ";")).toBe("abc");
    expect(csvCell("=1", ";")).toBe("'=1");
    expect(csvCell("a;b", ";")).toBe("\"a;b\"");
  });
});

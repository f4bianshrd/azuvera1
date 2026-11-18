import { describe, expect, it } from "vitest";
import { formatKeyInput, maskLicenseKey, normalizeLicenseKey } from "./key";

describe("normalizeLicenseKey", () => {
  it("mit Präfix", () =>
    expect(normalizeLicenseKey("AZV-ABCD-EFGH-JKMN-PQRS")).toBe("AZV-ABCD-EFGH-JKMN-PQRS"));
  it("ohne Präfix", () =>
    expect(normalizeLicenseKey("ABCDEFGHJKMNPQRS")).toBe("AZV-ABCD-EFGH-JKMN-PQRS"));
  it("Kleinbuchstaben", () =>
    expect(normalizeLicenseKey("azv-abcd-efgh-jkmn-pqrs")).toBe("AZV-ABCD-EFGH-JKMN-PQRS"));
  it("eingefügter Text mit Leerzeichen, Punkten und Umbruch", () =>
    expect(normalizeLicenseKey(" AZV ABCD.EFGH\nJKMN  PQRS ")).toBe("AZV-ABCD-EFGH-JKMN-PQRS"));
  it("Fremdzeichen", () => expect(normalizeLicenseKey("AZV-ABCD-EFGH-JKMN-PQR#")).toBeNull());
  it("zu kurz", () => expect(normalizeLicenseKey("AZV-ABCD-EFGH-JKMN-PQR")).toBeNull());
  it("zu lang", () => expect(normalizeLicenseKey("AZV-ABCD-EFGH-JKMN-PQRST")).toBeNull());
  for (const bad of ["0", "O", "1", "I", "L"]) {
    it(`verbotenes Zeichen ${bad}`, () =>
      expect(normalizeLicenseKey(`AZV-ABCD-EFGH-JKMN-PQR${bad}`)).toBeNull());
  }
  it("leer", () => expect(normalizeLicenseKey("")).toBeNull());
});

describe("formatKeyInput", () => {
  it("Gruppen beim Tippen", () => expect(formatKeyInput("abcde")).toBe("ABCD-E"));
  it("Präfix beim Tippen", () => expect(formatKeyInput("azva")).toBe("AZV-A"));
  it("ganzer Schlüssel eingefügt", () =>
    expect(formatKeyInput("azv abcd efgh jkmn pqrs")).toBe("AZV-ABCD-EFGH-JKMN-PQRS"));
  it("Schlüsselteil höchstens 19 Zeichen", () =>
    expect(formatKeyInput("ABCDEFGHJKMNPQRSTUVW")).toBe("ABCD-EFGH-JKMN-PQRS"));
  it("maskiert", () =>
    expect(maskLicenseKey("AZV-ABCD-EFGH-JKMN-PQRS")).toBe("AZV-••••-••••-••••-PQRS"));
});

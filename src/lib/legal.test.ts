import { describe, expect, it } from "vitest";
import { validProviderText } from "./legal";

describe("validProviderText", () => {
  it("lehnt leere und zu kurze Texte ab", () => {
    expect(validProviderText("")).toBe(false);
    expect(validProviderText("  ab  ")).toBe(false);
  });
  it("akzeptiert 3 und 200 Zeichen", () => {
    expect(validProviderText("abc")).toBe(true);
    expect(validProviderText("a".repeat(200))).toBe(true);
  });
  it("lehnt mehr als 200 Zeichen ab", () => {
    expect(validProviderText("a".repeat(201))).toBe(false);
  });
});

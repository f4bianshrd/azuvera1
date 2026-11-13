import { describe, expect, it } from "vitest";
import { previewCatalogJson } from "./json";

const base = { catalog: { code: "test", profession_code: "", title: "Test", subtitle: "", source: "", status: "draft" }, topics: [{ key: "a", title: "A", category: "K", legal_basis: "", interval_months: 12, when_text: "", hint: "", is_optional: false, points: [{ key: "a-1", label: "Punkt" }] }] };

describe("Katalog-JSON (B2, Abschnitt 5)", () => {
  it("liest ein gültiges Format mit Zählern", () => {
    const p = previewCatalogJson(JSON.stringify(base));
    expect(p.ok).toBe(true);
    expect(p.counts).toEqual({ topics: 1, points: 1, optional: 0 });
  });
  it("leeres Intervall bedeutet einmalig", () => {
    const p = previewCatalogJson(JSON.stringify({ ...base, topics: [{ ...base.topics[0], interval_months: null }] }));
    expect(p.data?.topics[0]?.interval_months).toBeNull();
  });
  it("lehnt doppelte Punkt-Schlüssel mit deutscher Meldung ab", () => {
    const t = { ...base.topics[0], points: [{ key: "x", label: "1" }, { key: "x", label: "2" }] };
    expect(previewCatalogJson(JSON.stringify({ ...base, topics: [t] })).error).toBe("Doppelter Punkt-Schlüssel: „x“.");
  });
  it("lehnt kein JSON ab", () => {
    expect(previewCatalogJson("{").error).toBe("Die Datei ist kein gültiges JSON.");
  });
});

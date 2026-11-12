import { describe, expect, it } from "vitest";
import { previewPlanJson } from "./json";

const base = {
  plan: { code: "test.plan", profession_code: "landwirt", title: "Testplan", duration_years: 3, status: "draft" },
  sections: [{ key: "s1", title: "A", kind: "content", groups: [{ key: "g1", title: "G", items: [{ key: "i1", label: "Eins" }, { key: "i2", label: "Zwei", reference: "a)" }] }] }],
};

describe("Plan-JSON-Vorschau", () => {
  it("zählt Abschnitte, Gruppen und Punkte", () => {
    const r = previewPlanJson(JSON.stringify(base), ["landwirt"]);
    expect(r.ok).toBe(true);
    expect(r.counts).toEqual({ sections: 1, groups: 1, items: 2 });
  });
  it("lehnt kaputtes JSON auf Deutsch ab", () => {
    expect(previewPlanJson("{x").error).toBe("Die Datei ist kein gültiges JSON.");
  });
  it("lehnt doppelte Punkt-Schlüssel ab", () => {
    const dup = structuredClone(base);
    dup.sections[0]!.groups[0]!.items[1]!.key = "i1";
    expect(previewPlanJson(JSON.stringify(dup)).error).toBe("Doppelter Punkt-Schlüssel: „i1“.");
  });
  it("lehnt unbekannte Berufe und Dauer über 4 Jahre ab", () => {
    expect(previewPlanJson(JSON.stringify(base), ["gaertner"]).error).toBe("Unbekannter Beruf: „landwirt“.");
    expect(previewPlanJson(JSON.stringify({ ...base, plan: { ...base.plan, duration_years: 5 } })).ok).toBe(false);
  });
  it("warnt bei leeren Gruppen", () => {
    const e = structuredClone(base);
    e.sections[0]!.groups[0]!.items = [];
    expect(previewPlanJson(JSON.stringify(e)).warnings).toContain("Gruppe „G“ hat keine Punkte.");
  });
});

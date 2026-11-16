import { describe, expect, it } from "vitest";
import { resolveRequirement } from "./requirements";
import { effectiveBundesland } from "./scope";

const row = (id: string, bundesland: string | null, profession_code: string | null, is_active = true) => ({ id, bundesland, profession_code, is_active });
const rows = [
  row("Z0", null, null), row("Z1", "NI", "landwirt"), row("Z2", "BY", "landwirt"), row("Z3", "SH", "landwirt"), row("Z4", "SN", "landwirt"),
  row("Z5", "BB", null), row("Z6", "NI", "gaertner"), row("Z7", "NI", "pferdewirt"), row("Z8", "BE", "gaertner"), row("Z9", "SN", "gaertner"),
  row("Z10", "BY", "gaertner"), row("Z11", "NW", "gaertner"),
];
const pick = (b: string | null, p: string | null) => resolveRequirement(rows, b, p)?.id;

describe("resolveRequirement", () => {
  it("wählt die genaueste aktive Zeile", () => {
    expect(pick("NI", "landwirt")).toBe("Z1");
    expect(pick("BY", "landwirt")).toBe("Z2");
    expect(pick("HE", "landwirt")).toBe("Z0");
    expect(pick("BB", "pferdewirt")).toBe("Z5");
    expect(pick("NI", "pferdewirt")).toBe("Z7");
    expect(pick("BE", "gaertner")).toBe("Z8");
    expect(pick("NW", "landwirt")).toBe("Z0");
    expect(pick(null, "landwirt")).toBe("Z0");
  });
  it("übergeht inaktive Zeilen", () => {
    expect(resolveRequirement([row("Z0", null, null), row("X", "NI", "landwirt", false)], "NI", "landwirt")?.id).toBe("Z0");
  });
});

describe("effectiveBundesland", () => {
  it("nimmt zuerst den Betrieb, dann das Profil", () => {
    expect(effectiveBundesland({ bundesland: "BY" }, { bundesland: "NI" })).toEqual({ code: "NI", source: "company" });
    expect(effectiveBundesland({ bundesland: "BY" }, { bundesland: null })).toEqual({ code: "BY", source: "profile" });
    expect(effectiveBundesland({ bundesland: null }, null)).toEqual({ code: null, source: null });
  });
});

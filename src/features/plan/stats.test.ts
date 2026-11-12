import { describe, expect, it } from "vitest";
import type { PlanTree } from "@/lib/sync/db";
import { buildCells, calendarWeeks, cellExportWord, computeKpis, reportedWeeks, selectCells, slugify } from "./stats";

const item = (id: string, label: string, active = true) => ({ id, group_id: "g", plan_id: "p", key: id, label, reference: null, is_active: active, sort_order: 0 });
const tree: PlanTree = {
  plan: { id: "p", profession_id: "x", code: "t", title: "T", subtitle: null, source: null, valid_from: null, valid_until: null, duration_years: 3, is_template: false, status: "published", sort_order: 0, created_at: "", updated_at: "" },
  sections: [{
    id: "s", plan_id: "p", key: "s", title: "Tierhaltung", kind: "content", hint: null, sort_order: 0,
    groups: [{ id: "g", section_id: "s", key: "g", title: "Fütterung", reference: null, weeks_text: null, hint: null, sort_order: 0,
      items: [item("a", "Futter mischen"), item("b", "Wasser prüfen"), item("c", "Alt", false)] }],
  }],
};
const progress = [
  { item_id: "a", year: 1, planned: true, mastered: "yes" },
  { item_id: "a", year: 2, planned: true, mastered: "no" },
  { item_id: "b", year: 1, planned: true, mastered: "" },
  { item_id: "b", year: 3, planned: false, mastered: "no" },
];

describe("Ausbildungsplan-Kennzahlen", () => {
  it("zählt Zellen wie von Hand: 2 aktive Punkte × 3 Jahre", () => {
    const cells = buildCells(tree, progress);
    expect(cells).toHaveLength(6); // inaktiver Punkt ohne Fortschritt fehlt
    const k = computeKpis(cells, [], new Set(), new Set(["a"]));
    expect(k.planned).toBe(3);
    expect(k.plannedPct).toBe(50);
    expect(k.mastered).toBe(1);
    expect(k.masteredPct).toBe(33);
    expect(k.open).toBe(2);
    expect(k.coverage).toEqual({ mode: "items", covered: 1, all: 2, pct: 50 });
  });
  it("zeigt inaktive Punkte nur mit Fortschritt", () => {
    expect(buildCells(tree, [...progress, { item_id: "c", year: 2, planned: true, mastered: "" }])).toHaveLength(9);
  });
  it("filtert nach Jahr, Status und Suche", () => {
    const cells = buildCells(tree, progress);
    expect(selectCells(cells, { years: [1], status: "all", search: "" })).toHaveLength(2);
    expect(selectCells(cells, { years: [], status: "open", search: "" })).toHaveLength(2);
    expect(selectCells(cells, { years: [], status: "unplanned", search: "" })).toHaveLength(3);
    expect(selectCells(cells, { years: [], status: "all", search: "fütter" })).toHaveLength(6);
    expect(selectCells(cells, { years: [], status: "all", search: "wasser" })).toHaveLength(3);
  });
  it("Themen abgedeckt zählt Themen mit verknüpftem Bericht", () => {
    const topics = [{ id: "t1", code: "1.1", title: "A", target_year: 1 }, { id: "t2", code: null, title: "B", target_year: 2 }, { id: "t3", code: null, title: "C", target_year: null }];
    const k = computeKpis([], topics, new Set(["t1", "t3"]), new Set());
    expect(k.coverage).toEqual({ mode: "topics", covered: 2, all: 3, pct: 67 });
  });
  it("Exportwörter", () => {
    expect(cellExportWord({ planned: true, mastered: "" })).toBe("geplant");
    expect(cellExportWord({ planned: true, mastered: "yes" })).toBe("beherrscht");
    expect(cellExportWord({ planned: false, mastered: "no" })).toBe("nicht beherrscht");
    expect(cellExportWord({ planned: false, mastered: "" })).toBe("–");
  });
});

describe("Kalender", () => {
  it("listet Kalenderwochen und den Status des Wochenberichts", () => {
    const weeks = calendarWeeks(new Date(2025, 7, 1), new Date(2025, 7, 31), [
      { id: "r1", report_type: "weekly", status: "approved", week_number: 32, year: 2025 },
      { id: "r2", report_type: "weekly", status: "draft", week_number: 33, year: 2025 },
      { id: "r3", report_type: "daily", status: "approved", week_number: null, year: null },
    ]);
    expect(weeks.map((w) => w.label)).toEqual(["KW 31/25", "KW 32/25", "KW 33/25", "KW 34/25", "KW 35/25"]);
    expect(weeks[1]!.status).toBe("approved");
    expect(reportedWeeks(weeks)).toBe(1);
  });
});

it("Dateiname", () => {
  expect(slugify("Lena Müller")).toBe("lena-mueller");
});

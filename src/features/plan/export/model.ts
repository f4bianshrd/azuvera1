/** Gemeinsames Datenmodell für PDF- und ODT-Export des Ausbildungsplans. */
import type { PlanData } from "../api";
import type { Layout, TemplateId, Branding } from "../prefs";
import {
  STATUS_FILTER_LABELS, WEEK_STATUS_LABELS, calendarWeeks, cellExportWord, dateDe, plannedPerSection, reportedWeeks,
  personTrainingYears, skillsPerYear, topicsPerYear, type Cell, type Kpis, type Selection,
} from "../stats";

export interface ExportRow { label: string; cells: string[] }
export interface ExportGroup { title: string; reference: string | null; weeks_text: string | null; rows: ExportRow[] }
export interface ExportSection { title: string; groups: ExportGroup[] }
export interface ExportWeeks { title: string; summary: string; weeks: { label: string; status: string }[] }
export interface ChartSpec {
  title: string;
  kind: "bar" | "donut";
  labels: string[];
  series: { name: string; color: string; values: number[] }[];
}

export interface ExportModel {
  template: TemplateId;
  layout: Layout;
  branding: Branding;
  personName: string;
  profession: string;
  company: string;
  planTitle: string;
  source: string;
  selection: string;
  createdAt: Date;
  kpis: { label: string; value: string; hint: string }[];
  years: number[];
  weeks: ExportWeeks[];
  sections: ExportSection[];
  charts: ChartSpec[];
}

export function kpiCards(k: Kpis): { label: string; value: string; hint: string }[] {
  return [
    k.coverage.mode === "topics"
      ? { label: "Themen abgedeckt", value: `${k.coverage.covered}/${k.coverage.all}`, hint: `${k.coverage.pct} %` }
      : { label: "Inhalte in Berichten", value: `${k.coverage.covered}/${k.coverage.all}`, hint: `${k.coverage.pct} %` },
    { label: "Geplante Inhalte", value: String(k.planned), hint: `${k.plannedPct} % der Auswahl` },
    { label: "Beherrscht", value: String(k.mastered), hint: `${k.masteredPct} % des Geplanten` },
    { label: "Noch offen", value: String(k.open), hint: "als ‚nicht beherrscht‘ markiert" },
  ];
}

export function selectionText(sel: Selection, allYears: number[]): string {
  const years = sel.years.length ? [...sel.years].sort() : allYears;
  return [
    `Jahre: ${years.map((y) => `${y}.`).join(", ")}`,
    `Status: ${STATUS_FILTER_LABELS[sel.status]}`,
    `Suche: ${sel.search.trim() || "–"}`,
  ].join(" · ");
}

export function buildModel(args: {
  data: PlanData; cells: Cell[]; contentCells: Cell[]; kpis: Kpis; sel: Selection; template: TemplateId; layout: Layout; branding: Branding;
  topics: PlanData["topics"]; linkedTopics: Set<string>; colors: { primary: string; accent: string; success: string; destructive: string; warning: string; muted: string };
}): ExportModel {
  const { data, cells, sel } = args;
  const tree = data.tree!;
  const duration = tree.plan.duration_years;
  const allYears = Array.from({ length: duration }, (_, i) => i + 1);
  const years = sel.years.length ? [...sel.years].sort() : allYears;

  // Inhalte: Zellen der Auswahl, Spalte je gewähltem Jahr (Wert aus allen Zellen des Punkts)
  const byItem = new Map<string, Map<number, Cell>>();
  for (const c of args.contentCells) {
    if (!byItem.has(c.itemId)) byItem.set(c.itemId, new Map());
    byItem.get(c.itemId)!.set(c.year, c);
  }
  const selectedItems = new Set(cells.map((c) => c.itemId));
  const sections: ExportSection[] = [];
  for (const s of tree.sections) {
    const groups: ExportGroup[] = [];
    for (const g of s.groups) {
      const rows = g.items.filter((i) => selectedItems.has(i.id)).map((i) => ({
        label: `${i.reference ? `${i.reference} ` : ""}${i.label}${i.is_active ? "" : " (nicht mehr Teil des Plans)"}`,
        cells: years.map((y) => cellExportWord(byItem.get(i.id)?.get(y))),
      }));
      if (rows.length) groups.push({ title: g.title, reference: g.reference, weeks_text: g.weeks_text, rows });
    }
    if (groups.length) sections.push({ title: s.title, groups });
  }

  // Wochen
  const weeks: ExportWeeks[] = [];
  const start = data.azubi.ausbildungsbeginn;
  if (start) {
    for (const ty of personTrainingYears(start, data.azubi.ausbildungsende, duration)) {
      if (!years.includes(ty.year)) continue;
      const w = calendarWeeks(ty.start, ty.end, data.reports);
      weeks.push({
        title: `${ty.year}. Ausbildungsjahr (${dateDe(ty.start)} – ${dateDe(ty.end)})`,
        summary: `${reportedWeeks(w)} von ${w.length} Wochen berichtet`,
        weeks: w.map((x) => ({ label: x.label, status: WEEK_STATUS_LABELS[x.status] })),
      });
    }
  }

  const c = args.colors;
  const tpy = topicsPerYear(args.topics, args.linkedTopics, allYears);
  const spy = skillsPerYear(cells, years);
  const dist = plannedPerSection(cells);
  const pal = [c.primary, c.accent, c.success, c.warning, c.destructive];
  const charts: ChartSpec[] = [
    { title: "Themen pro Ausbildungsjahr", kind: "bar", labels: tpy.map((x) => x.name), series: [
      { name: "abgedeckt", color: c.primary, values: tpy.map((x) => x.abgedeckt) },
      { name: "offen", color: c.muted, values: tpy.map((x) => x.offen) }] },
    { title: "Gesamt-Fortschritt", kind: "donut", labels: ["abgedeckt", "offen"], series: [
      { name: "", color: "", values: [args.kpis.coverage.covered, args.kpis.coverage.all - args.kpis.coverage.covered] }] },
    { title: "Rahmenplan · Fertigkeiten pro Jahr", kind: "bar", labels: spy.map((x) => x.name), series: [
      { name: "geplant", color: c.primary, values: spy.map((x) => x.geplant) },
      { name: "beherrscht", color: c.success, values: spy.map((x) => x.beherrscht) },
      { name: "offen", color: c.destructive, values: spy.map((x) => x.offen) }] },
    { title: "Rahmenplan-Verteilung", kind: "donut", labels: dist.map((d) => d.name), series: [
      { name: "", color: pal.join(","), values: dist.map((d) => d.value) }] },
  ];
  charts[1]!.series[0]!.color = `${c.primary},${c.muted}`;

  return {
    template: args.template, layout: args.layout, branding: args.branding,
    personName: data.azubi.full_name, profession: data.azubi.profession_name ?? "–", company: data.azubi.company_name ?? "–",
    planTitle: tree.plan.title, source: tree.plan.source ?? "", selection: selectionText(sel, allYears), createdAt: new Date(),
    kpis: kpiCards(args.kpis), years, weeks, sections, charts,
  };
}

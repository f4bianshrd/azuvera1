/** Reine Berechnungen für den Ausbildungsplan (Zellen, Filter, Kennzahlen, Diagramme, Kalender). */
import { addDays, addWeeks, format, getISOWeek, getISOWeekYear, isAfter, startOfISOWeek } from "date-fns";
import type { PlanTree } from "@/lib/sync/db";

export type Mastered = "" | "yes" | "no";
export type StatusFilter = "all" | "planned" | "mastered" | "open" | "unplanned";
export type SectionKind = "content" | "checklist";

export interface ProgressLike { item_id: string; year: number; planned: boolean; mastered: string }
export interface Selection { years: number[]; status: StatusFilter; search: string }

export interface Cell {
  itemId: string;
  year: number;
  planned: boolean;
  mastered: Mastered;
  sectionId: string;
  sectionTitle: string;
  sectionKind: SectionKind;
  groupId: string;
  groupTitle: string;
  label: string;
  reference: string | null;
  inactive: boolean;
}

export const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: "Alle Zustände",
  planned: "Geplant",
  mastered: "Beherrscht",
  open: "Noch offen",
  unplanned: "Nicht geplant",
};

export const progressKey = (itemId: string, year: number) => `${itemId}:${year}`;

export function progressMap(rows: ProgressLike[]): Map<string, ProgressLike> {
  return new Map(rows.map((r) => [progressKey(r.item_id, r.year), r]));
}

/** Punkt sichtbar? Aktiv oder (inaktiv) mit gespeichertem Fortschritt. */
export function itemVisible(item: { id: string; is_active: boolean }, years: number, map: Map<string, ProgressLike>): boolean {
  if (item.is_active) return true;
  for (let y = 1; y <= years; y++) {
    const p = map.get(progressKey(item.id, y));
    if (p && (p.planned || p.mastered)) return true;
  }
  return false;
}

/** Alle Zellen (Punkt × Ausbildungsjahr) des Plans. */
export function buildCells(tree: PlanTree, progress: ProgressLike[], kinds: SectionKind[] = ["content", "checklist"]): Cell[] {
  const map = progressMap(progress);
  const years = tree.plan.duration_years;
  const cells: Cell[] = [];
  for (const s of tree.sections) {
    if (!kinds.includes(s.kind as SectionKind)) continue;
    for (const g of s.groups) {
      for (const it of g.items) {
        if (!itemVisible(it, years, map)) continue;
        for (let y = 1; y <= years; y++) {
          const p = map.get(progressKey(it.id, y));
          cells.push({
            itemId: it.id, year: y, planned: !!p?.planned, mastered: (p?.mastered ?? "") as Mastered,
            sectionId: s.id, sectionTitle: s.title, sectionKind: s.kind as SectionKind, groupId: g.id, groupTitle: g.title,
            label: it.label, reference: it.reference, inactive: !it.is_active,
          });
        }
      }
    }
  }
  return cells;
}

export function matchesSearch(c: Pick<Cell, "label" | "groupTitle" | "sectionTitle" | "reference">, search: string): boolean {
  const s = search.trim().toLocaleLowerCase("de");
  if (!s) return true;
  return [c.label, c.groupTitle, c.sectionTitle, c.reference ?? ""].some((t) => t.toLocaleLowerCase("de").includes(s));
}

export function matchesStatus(c: Pick<Cell, "planned" | "mastered">, status: StatusFilter): boolean {
  switch (status) {
    case "planned": return c.planned;
    case "mastered": return c.mastered === "yes";
    case "open": return c.mastered === "no";
    case "unplanned": return !c.planned;
    default: return true;
  }
}

export function selectCells(cells: Cell[], sel: Selection): Cell[] {
  const years = new Set(sel.years);
  return cells.filter((c) => (years.size === 0 || years.has(c.year)) && matchesStatus(c, sel.status) && matchesSearch(c, sel.search));
}

export function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

export interface TopicLike { id: string; code: string | null; title: string; target_year: number | null }

export function selectTopics<T extends TopicLike>(topics: T[], sel: Pick<Selection, "years" | "search">): T[] {
  const years = new Set(sel.years);
  const s = sel.search.trim().toLocaleLowerCase("de");
  return topics.filter((t) => (years.size === 0 || t.target_year === null || years.has(t.target_year))
    && (!s || t.title.toLocaleLowerCase("de").includes(s) || (t.code ?? "").toLocaleLowerCase("de").includes(s)));
}

export interface Kpis {
  total: number;
  planned: number; plannedPct: number;
  mastered: number; masteredPct: number;
  open: number;
  coverage: { mode: "topics" | "items"; covered: number; all: number; pct: number };
}

/**
 * Kennzahlen der Auswahl. Abgedeckt = Thema (bzw. Punkt) mit mindestens einem verknüpften sichtbaren Bericht.
 * Ohne Themen zählt die Karte die verknüpften Plan-Punkte der Auswahl.
 */
export function computeKpis(cells: Cell[], topics: TopicLike[], linkedTopicIds: Set<string>, linkedItemIds: Set<string>): Kpis {
  const planned = cells.filter((c) => c.planned).length;
  const mastered = cells.filter((c) => c.planned && c.mastered === "yes").length;
  const open = cells.filter((c) => c.mastered === "no").length;
  let coverage: Kpis["coverage"];
  if (topics.length > 0) {
    const covered = topics.filter((t) => linkedTopicIds.has(t.id)).length;
    coverage = { mode: "topics", covered, all: topics.length, pct: pct(covered, topics.length) };
  } else {
    const items = new Set(cells.map((c) => c.itemId));
    const covered = [...items].filter((id) => linkedItemIds.has(id)).length;
    coverage = { mode: "items", covered, all: items.size, pct: pct(covered, items.size) };
  }
  return { total: cells.length, planned, plannedPct: pct(planned, cells.length), mastered, masteredPct: pct(mastered, planned), open, coverage };
}

export function cellStatusLabel(c: Pick<Cell, "planned" | "mastered">): string {
  if (c.mastered === "yes") return "Beherrscht";
  if (c.mastered === "no") return "Nicht beherrscht";
  return c.planned ? "Geplant" : "Nicht geplant";
}

/** Wort für den Export: „geplant“, „beherrscht“, „nicht beherrscht“ oder „–“. */
export function cellExportWord(c: Pick<Cell, "planned" | "mastered"> | undefined): string {
  if (!c) return "–";
  if (c.mastered === "yes") return "beherrscht";
  if (c.mastered === "no") return "nicht beherrscht";
  return c.planned ? "geplant" : "–";
}

// ---------- Diagrammdaten ----------
export function topicsPerYear(topics: TopicLike[], linked: Set<string>, years: number[]): { name: string; abgedeckt: number; offen: number }[] {
  return years.map((y) => {
    const t = topics.filter((x) => x.target_year === y);
    const covered = t.filter((x) => linked.has(x.id)).length;
    return { name: `${y}. Jahr`, abgedeckt: covered, offen: t.length - covered };
  });
}

export function skillsPerYear(cells: Cell[], years: number[]): { year: number; name: string; geplant: number; beherrscht: number; offen: number }[] {
  return years.map((y) => {
    const c = cells.filter((x) => x.year === y);
    return {
      year: y, name: `${y}. Jahr`,
      geplant: c.filter((x) => x.planned).length,
      beherrscht: c.filter((x) => x.planned && x.mastered === "yes").length,
      offen: c.filter((x) => x.mastered === "no").length,
    };
  });
}

export function plannedPerSection(cells: Cell[]): { sectionId: string; name: string; value: number }[] {
  const out = new Map<string, { sectionId: string; name: string; value: number }>();
  for (const c of cells) {
    if (!c.planned) continue;
    const e = out.get(c.sectionId) ?? { sectionId: c.sectionId, name: c.sectionTitle, value: 0 };
    e.value++;
    out.set(c.sectionId, e);
  }
  return [...out.values()];
}

/** Zellen gruppiert nach Abschnitt und Gruppe (Reihenfolge wie im Plan). */
export function groupCells(cells: Cell[]): { sectionId: string; title: string; groups: { groupId: string; title: string; cells: Cell[] }[] }[] {
  const sections: { sectionId: string; title: string; groups: { groupId: string; title: string; cells: Cell[] }[] }[] = [];
  for (const c of cells) {
    let s = sections.find((x) => x.sectionId === c.sectionId);
    if (!s) { s = { sectionId: c.sectionId, title: c.sectionTitle, groups: [] }; sections.push(s); }
    let g = s.groups.find((x) => x.groupId === c.groupId);
    if (!g) { g = { groupId: c.groupId, title: c.groupTitle, cells: [] }; s.groups.push(g); }
    g.cells.push(c);
  }
  return sections;
}

// ---------- Kalender ----------
export type WeekStatus = "none" | "draft" | "submitted" | "approved" | "rejected";
export const WEEK_STATUS_LABELS: Record<WeekStatus, string> = {
  none: "kein Bericht", draft: "Entwurf", submitted: "Eingereicht", approved: "Genehmigt", rejected: "Abgelehnt",
};
export interface WeekReport { id: string; report_type: string; status: string; week_number: number | null; year: number | null }
export interface CalendarWeek { key: string; week: number; isoYear: number; label: string; monday: Date; status: WeekStatus; reportId: string | null }

/** Alle Kalenderwochen eines Zeitraums mit dem Status des Wochenberichts. */
export function calendarWeeks(start: Date, end: Date, reports: WeekReport[]): CalendarWeek[] {
  const weekly = new Map<string, WeekReport>();
  for (const r of reports) if (r.report_type === "weekly" && r.week_number != null && r.year != null) weekly.set(`${r.year}-${r.week_number}`, r);
  const out: CalendarWeek[] = [];
  for (let d = startOfISOWeek(start); !isAfter(d, end); d = addWeeks(d, 1)) {
    const thursday = addDays(d, 3);
    const week = getISOWeek(thursday), isoYear = getISOWeekYear(thursday);
    const r = weekly.get(`${isoYear}-${week}`);
    out.push({
      key: `${isoYear}-${week}`, week, isoYear, monday: d,
      label: `KW ${week}/${String(isoYear).slice(-2)}`,
      status: (r?.status as WeekStatus | undefined) ?? "none", reportId: r?.id ?? null,
    });
  }
  return out;
}

/** „berichtet“ = Woche mit eingereichtem, genehmigtem oder abgelehntem Wochenbericht. */
export function reportedWeeks(weeks: CalendarWeek[]): number {
  return weeks.filter((w) => w.status !== "none" && w.status !== "draft").length;
}

export const dateDe = (d: Date) => format(d, "dd.MM.yyyy");

export function slugify(name: string): string {
  return name.toLocaleLowerCase("de")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "plan";
}

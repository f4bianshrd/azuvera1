/** Geräte-Einstellungen des Ausbildungsplans (localStorage über platform.ts, immer in try/catch). */
import { readDeviceString, writeDeviceString } from "@/lib/platform";
import type { StatusFilter } from "./stats";

export type TemplateId = "letterhead" | "cover" | "compact" | "analysis";
export interface Layout { charts: boolean; weeks: boolean; contents: boolean }
export interface Branding { senderName: string; senderLines: string; primary: string; accent: string; logoDataUrl: string | null; footer: string }

export interface TemplateDef { id: TemplateId; label: string; description: string; defaults: Layout }
export const TEMPLATES: TemplateDef[] = [
  { id: "letterhead", label: "Briefkopf (Standard)", description: "Logo-Briefkopf auf jeder Seite, Kennzahlen, Diagramme, Wochen, Inhalte.", defaults: { charts: true, weeks: true, contents: true } },
  { id: "cover", label: "Mit Deckblatt", description: "Eigenes Deckblatt vorweg, danach Kennzahlen, Inhalte, Wochen und Diagramme.", defaults: { charts: true, weeks: true, contents: true } },
  { id: "compact", label: "Kompakt (nur Inhalte)", description: "Schlanker Kopf, ohne Diagramme und Wochenübersicht – ideal zum Abheften.", defaults: { charts: false, weeks: false, contents: true } },
  { id: "analysis", label: "Auswertung (Diagramme zuerst)", description: "Deckblatt, Kennzahlen und Diagramme im Fokus, Wochenübersicht ohne Detailtabellen.", defaults: { charts: true, weeks: true, contents: false } },
];
export const templateDef = (id: TemplateId) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]!;

/** Standardfarben = Marken-Variablen (hell) als Hex. */
export const DEFAULT_PRIMARY = "#0b5fbf";
export const DEFAULT_ACCENT = "#2fb8a6";

export interface PlanSettings {
  professionId: string | null;
  azubiId: string | null;
  years: number[];
  status: StatusFilter;
  search: string;
  template: TemplateId;
  layouts: Partial<Record<TemplateId, Layout>>;
}
export interface SavedSetting { name: string; settings: PlanSettings; branding: Partial<Record<TemplateId, Branding>> }

export const DEFAULT_SETTINGS: PlanSettings = { professionId: null, azubiId: null, years: [], status: "all", search: "", template: "letterhead", layouts: {} };

const LAST_KEY = "azuvera.plan.last";
const SAVED_KEY = "azuvera.plan.saved";
const BRAND_KEY = (t: TemplateId) => `azuvera.plan.branding.${t}`;

function readJson<T>(key: string): T | null {
  const raw = readDeviceString(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const STATUSES: StatusFilter[] = ["all", "planned", "mastered", "open", "unplanned"];
function cleanSettings(v: Partial<PlanSettings> | null): PlanSettings {
  const s = { ...DEFAULT_SETTINGS, ...(v ?? {}) };
  return {
    professionId: typeof s.professionId === "string" ? s.professionId : null,
    azubiId: typeof s.azubiId === "string" ? s.azubiId : null,
    years: Array.isArray(s.years) ? s.years.filter((y) => Number.isInteger(y) && y >= 1 && y <= 4) : [],
    status: STATUSES.includes(s.status) ? s.status : "all",
    search: typeof s.search === "string" ? s.search.slice(0, 200) : "",
    template: TEMPLATES.some((t) => t.id === s.template) ? s.template : "letterhead",
    layouts: typeof s.layouts === "object" && s.layouts ? s.layouts : {},
  };
}

export function layoutFor(s: PlanSettings, t: TemplateId = s.template): Layout {
  return { ...templateDef(t).defaults, ...(s.layouts[t] ?? {}) };
}

export const loadLastSettings = (): PlanSettings => cleanSettings(readJson<Partial<PlanSettings>>(LAST_KEY));
export const saveLastSettings = (s: PlanSettings) => writeDeviceString(LAST_KEY, JSON.stringify(s));

export function listSaved(): SavedSetting[] {
  const v = readJson<SavedSetting[]>(SAVED_KEY);
  return Array.isArray(v) ? v.filter((x) => x && typeof x.name === "string").map((x) => ({ ...x, settings: cleanSettings(x.settings) })) : [];
}
export function saveSetting(entry: SavedSetting): SavedSetting[] {
  const list = [entry, ...listSaved().filter((x) => x.name !== entry.name)].slice(0, 30);
  writeDeviceString(SAVED_KEY, JSON.stringify(list));
  return list;
}
export function deleteSetting(name: string): SavedSetting[] {
  const list = listSaved().filter((x) => x.name !== name);
  writeDeviceString(SAVED_KEY, JSON.stringify(list));
  return list;
}

export function defaultBranding(company: { name: string | null; address: string | null }): Branding {
  return { senderName: company.name ?? "", senderLines: company.address ?? "", primary: DEFAULT_PRIMARY, accent: DEFAULT_ACCENT, logoDataUrl: null, footer: "" };
}
export function loadBranding(t: TemplateId): Partial<Branding> | null {
  return readJson<Partial<Branding>>(BRAND_KEY(t));
}
export function storeBranding(t: TemplateId, b: Branding | null): void {
  writeDeviceString(BRAND_KEY(t), b ? JSON.stringify(b) : "");
}
export function allBranding(): Partial<Record<TemplateId, Branding>> {
  const out: Partial<Record<TemplateId, Branding>> = {};
  for (const t of TEMPLATES) {
    const b = loadBranding(t.id);
    if (b) out[t.id] = b as Branding;
  }
  return out;
}
export function resolveBranding(t: TemplateId, company: { name: string | null; address: string | null }): Branding {
  return { ...defaultBranding(company), ...(loadBranding(t) ?? {}) };
}

export const isHex = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);

/**
 * Aufbau eines Leittextes (aus dem Original-Heft übertragen) und reine Hilfsfunktionen.
 * Antworten liegen flach unter "<aufgabe>.<feld>"; Fotos/Skizzen sind Anhänge mit demselben Schlüssel.
 */
export type LeittextFieldType = "text" | "longtext" | "number" | "table" | "checkbox" | "image" | "info";

export interface LeittextField {
  key: string;
  type: LeittextFieldType;
  label?: string;
  unit?: string;
  /** longtext: ungefähre Zeilenzahl im Heft */
  lines?: number;
  /** table: Spaltenüberschriften */
  columns?: string[];
  /** table: feste Zeilenbeschriftungen (erste Spalte); ohne = freie Zeilen */
  rows?: string[];
  /** table: Anzahl freier Startzeilen */
  rowCount?: number;
  /** checkbox: Auswahl */
  options?: string[];
  /** checkbox: Freitext „Sonstiges“ erlaubt */
  other?: boolean;
  /** info: reiner Text */
  text?: string;
}
export interface LeittextTask { key: string; number: string; prompt: string; hint?: string; fields: LeittextField[] }
export interface LeittextSection { title: string; tasks: LeittextTask[] }
export interface LeittextIntro { worum?: string; lernen?: string[]; brauchen?: string[]; helfen?: string[]; vorgehen?: string }
export interface LeittextContent { intro?: LeittextIntro; sections: LeittextSection[] }

export type TableValue = string[][];
export interface CheckboxValue { selected: string[]; other?: string }
export type AnswerValue = string | TableValue | CheckboxValue;
export type Answers = Record<string, AnswerValue>;
export interface WorkHeader { zeitraum_von?: string; zeitraum_bis?: string; zusammenarbeit?: string }

export const answerKey = (task: LeittextTask, field: LeittextField) => `${task.key}.${field.key}`;

export function parseContent(raw: unknown): LeittextContent {
  const c = (raw ?? {}) as Partial<LeittextContent>;
  return { intro: c.intro ?? {}, sections: Array.isArray(c.sections) ? c.sections : [] };
}

/** Hat ein Feld einen Inhalt? (Bildfelder zählen über die Zahl der Bilder.) */
export function isFilled(field: LeittextField, value: AnswerValue | undefined, imageCount = 0): boolean {
  if (field.type === "info") return false;
  if (field.type === "image") return imageCount > 0;
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.some((row) => row.some((c) => (c ?? "").trim() !== ""));
  return value.selected.length > 0 || (value.other ?? "").trim() !== "";
}

/** Eine Aufgabe gilt als bearbeitet, sobald eines ihrer Eingabefelder ausgefüllt ist. */
export function taskDone(task: LeittextTask, answers: Answers, images: Record<string, number> = {}): boolean {
  return task.fields.some((f) => isFilled(f, answers[answerKey(task, f)], images[answerKey(task, f)] ?? 0));
}

export function progress(content: LeittextContent, answers: Answers, images: Record<string, number> = {}): { done: number; total: number; percent: number } {
  const tasks = content.sections.flatMap((s) => s.tasks).filter((t) => t.fields.some((f) => f.type !== "info"));
  const done = tasks.filter((t) => taskDone(t, answers, images)).length;
  return { done, total: tasks.length, percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}

/** Tabellenwert auf die Form des Feldes bringen (feste Zeilen, Spaltenzahl). */
export function normalizeTable(field: LeittextField, value: AnswerValue | undefined): TableValue {
  const cols = Math.max(1, (field.columns?.length ?? 1) - (field.rows ? 1 : 0));
  const base: TableValue = Array.isArray(value) ? value : [];
  const rowTotal = field.rows ? field.rows.length : Math.max(base.length, field.rowCount ?? 3);
  return Array.from({ length: rowTotal }, (_, r) => Array.from({ length: cols }, (_, c) => base[r]?.[c] ?? ""));
}

/** Text einer Antwort für Lese-Ansicht und PDF. */
export function answerText(field: LeittextField, value: AnswerValue | undefined): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map((r) => r.join(" | ")).join("\n");
  return [...value.selected, ...((value.other ?? "").trim() ? [value.other!.trim()] : [])].join(", ");
}

export const STATUS_LABEL: Record<string, string> = { none: "Nicht begonnen", draft: "In Bearbeitung", submitted: "Eingereicht", approved: "Freigegeben", rejected: "Zurückgegeben" };

export const PROFESSION_LABEL: Record<string, string> = { landwirt: "Landwirt/in", pferdewirt: "Pferdewirt/in", gaertner: "Gärtner/in" };

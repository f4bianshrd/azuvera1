import type { ExperienceKind } from "./api";
import { effectiveBundesland } from "./scope";
import { resolveRequirement, type ExperienceRequirement } from "./requirements";
import { computeProgress, trainingYearClamped, type ProgressResult } from "./progress";
import type { ProgressContext } from "./api";

export const KIND_LABELS: Record<ExperienceKind, string> = {
  erfahrungsbericht: "Erfahrungsbericht",
  projektbericht: "Projektbericht",
  leittext: "Leittext",
};
export const KIND_HINTS: Record<ExperienceKind, string> = {
  erfahrungsbericht: "Beschreibe, was du im Betrieb gemacht oder erlebt hast.",
  projektbericht: "Ein größeres Vorhaben im Betrieb.",
  leittext: "Ein bearbeiteter Leittext, zum Beispiel vom aid.",
};
export const KINDS: ExperienceKind[] = ["erfahrungsbericht", "projektbericht", "leittext"];

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind as ExperienceKind] ?? "Erfahrungsbericht";
}
export function experienceTitle(r: { kind: string; title: string }): string {
  return r.title.trim() ? r.title.trim() : `${kindLabel(r.kind)} (ohne Titel)`;
}
export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}
export function dateDe(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}
export function berlinToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function leittextCounts(n: number): string {
  return n === 1 ? "1 Erfahrungsbericht" : `${n} Erfahrungsberichte`;
}

export interface ResolvedProgress {
  ctx: ProgressContext;
  bundesland: { code: string | null; source: "company" | "profile" | null; name: string | null };
  requirement: ExperienceRequirement | null;
  progress: ProgressResult;
  yearOf: (date: string) => number | null;
}

/** Vorgabe auflösen und Fortschritt berechnen – die einzige Stelle, aus der Karten und Listen ihre Zahlen beziehen. */
export function resolveProgress(ctx: ProgressContext, today = berlinToday()): ResolvedProgress {
  const bl = effectiveBundesland({ bundesland: ctx.profileBundesland }, { bundesland: ctx.companyBundesland });
  const requirement = resolveRequirement(ctx.requirements, bl.code, ctx.professionCode);
  const progress = computeProgress({
    reports: ctx.reports,
    requirement: requirement ?? { required_per_year: 2, leittext_weight: 0 },
    beginn: ctx.beginn, ende: ctx.ende, today,
  });
  return {
    ctx, requirement, progress,
    bundesland: { ...bl, name: ctx.bundeslaender.find((b) => b.code === bl.code)?.name ?? null },
    yearOf: (date) => trainingYearClamped(ctx.beginn, ctx.ende, date),
  };
}

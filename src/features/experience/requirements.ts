import type { Database } from "@/integrations/supabase/types";

export type ExperienceRequirement = Database["public"]["Tables"]["experience_requirements"]["Row"];
export type RequirementRule = Pick<ExperienceRequirement,
  "is_active" | "bundesland" | "profession_code" | "required_per_year" | "required_basis" | "hint_per_year" | "hint_total"
  | "hint_until_interim" | "hint_kind" | "min_pages" | "page_unit" | "leittext_weight">;

/** Gleiche Auswahl wie experience_requirement_for: Land+Beruf, dann Land, dann Beruf, dann Standard. */
export function resolveRequirement<T extends Pick<RequirementRule, "is_active" | "bundesland" | "profession_code">>(
  rows: T[],
  bundesland: string | null | undefined,
  professionCode: string | null | undefined,
): T | null {
  const candidates = rows.filter((r) => r.is_active
    && (r.bundesland === null || r.bundesland === (bundesland ?? undefined))
    && (r.profession_code === null || r.profession_code === (professionCode ?? undefined)));
  candidates.sort((a, b) => Number(b.bundesland !== null) - Number(a.bundesland !== null)
    || Number(b.profession_code !== null) - Number(a.profession_code !== null));
  return candidates[0] ?? null;
}

/** Ungefähre Wortzahl für den Mindestumfang (A4: 300 je Seite, handschriftlich: 150), auf 10 gerundet. */
export function wordsForPages(minPages: number, unit: "a4" | "handwritten" | string | null): number {
  const per = unit === "handwritten" ? 150 : 300;
  return Math.round((minPages * per) / 10) * 10;
}

export function pageUnitLabel(minPages: number, unit: string | null): string {
  const one = minPages === 1;
  if (unit === "handwritten") return one ? "handschriftliche Seite" : "handschriftliche Seiten";
  return one ? "A4-Seite" : "A4-Seiten";
}

export function formatPages(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString("de-DE");
}

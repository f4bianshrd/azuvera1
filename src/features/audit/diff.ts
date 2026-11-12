import { diffWords } from "diff";

export interface DiffPart { value: string; kind: "same" | "added" | "removed" }

/** Wortvergleich zweier Texte (alt → neu). */
export function wordDiff(before: string, after: string): DiffPart[] {
  return diffWords(before ?? "", after ?? "").map((p) => ({ value: p.value, kind: p.added ? "added" : p.removed ? "removed" : "same" }));
}

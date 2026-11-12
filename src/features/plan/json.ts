/** Prüfung und Vorschau einer Plan-JSON-Datei vor dem Import (der Server prüft noch einmal). */
import type { PlanJson } from "./api";

export interface JsonPreview {
  ok: boolean;
  error: string | null;
  plan: PlanJson | null;
  counts: { sections: number; groups: number; items: number };
  warnings: string[];
}

const CODE_RE = /^[A-Za-z0-9._-]+$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const optStr = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fail(error: string): JsonPreview {
  return { ok: false, error, plan: null, counts: { sections: 0, groups: 0, items: 0 }, warnings: [] };
}

export function previewPlanJson(text: string, knownProfessionCodes?: string[]): JsonPreview {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail("Die Datei ist kein gültiges JSON.");
  }
  if (!isObj(raw) || !isObj(raw["plan"])) return fail("Der Eintrag „plan“ fehlt.");
  const p = raw["plan"];
  const code = str(p["code"]);
  if (!code || !CODE_RE.test(code)) return fail("Plan-Code fehlt oder enthält unzulässige Zeichen (erlaubt: Buchstaben, Ziffern, Punkt, Unterstrich, Bindestrich).");
  const profession = str(p["profession_code"]);
  if (!profession) return fail("Der Beruf („profession_code“) fehlt.");
  const title = str(p["title"]);
  if (!title || title.length > 200) return fail("Der Plantitel fehlt oder ist länger als 200 Zeichen.");
  const duration = p["duration_years"] === undefined ? 3 : Number(p["duration_years"]);
  if (!Number.isInteger(duration) || duration < 1 || duration > 4) return fail("Die Ausbildungsdauer („duration_years“) muss 1 bis 4 Jahre betragen.");
  for (const k of ["valid_from", "valid_until"] as const) {
    if (p[k] != null && !(typeof p[k] === "string" && DATE_RE.test(p[k] as string))) return fail(`„${k}“ muss ein Datum im Format JJJJ-MM-TT sein.`);
  }
  const status = p["status"] === undefined ? "draft" : p["status"];
  if (status !== "draft" && status !== "published") return fail("Der Status muss „draft“ oder „published“ sein.");
  if (!Array.isArray(raw["sections"])) return fail("„sections“ muss eine Liste sein.");

  const warnings: string[] = [];
  if (knownProfessionCodes && !knownProfessionCodes.includes(profession)) return fail(`Unbekannter Beruf: „${profession}“.`);
  const sectionKeys = new Set<string>(), itemKeys = new Set<string>();
  const counts = { sections: 0, groups: 0, items: 0 };
  const sections: PlanJson["sections"] = [];
  for (const [si, s] of (raw["sections"] as unknown[]).entries()) {
    if (!isObj(s)) return fail(`Abschnitt ${si + 1} ist ungültig.`);
    const key = str(s["key"]), stitle = str(s["title"]);
    if (!key) return fail(`Abschnitt ${si + 1}: Schlüssel fehlt.`);
    if (sectionKeys.has(key)) return fail(`Doppelter Abschnitts-Schlüssel: „${key}“.`);
    sectionKeys.add(key);
    if (!stitle) return fail(`Abschnitt „${key}“: Titel fehlt.`);
    const kind = s["kind"] === undefined ? "content" : s["kind"];
    if (kind !== "content" && kind !== "checklist") return fail(`Abschnitt „${key}“: Art muss „content“ oder „checklist“ sein.`);
    if (!Array.isArray(s["groups"])) return fail(`Abschnitt „${key}“: „groups“ muss eine Liste sein.`);
    const groupKeys = new Set<string>();
    const groups: PlanJson["sections"][number]["groups"] = [];
    for (const [gi, g] of (s["groups"] as unknown[]).entries()) {
      if (!isObj(g)) return fail(`Abschnitt „${key}“, Gruppe ${gi + 1} ist ungültig.`);
      const gkey = str(g["key"]), gtitle = str(g["title"]);
      if (!gkey) return fail(`Abschnitt „${key}“, Gruppe ${gi + 1}: Schlüssel fehlt.`);
      if (groupKeys.has(gkey)) return fail(`Doppelter Gruppen-Schlüssel: „${gkey}“.`);
      groupKeys.add(gkey);
      if (!gtitle) return fail(`Gruppe „${gkey}“: Titel fehlt.`);
      if (!Array.isArray(g["items"])) return fail(`Gruppe „${gkey}“: „items“ muss eine Liste sein.`);
      const items: PlanJson["sections"][number]["groups"][number]["items"] = [];
      for (const [ii, it] of (g["items"] as unknown[]).entries()) {
        if (!isObj(it)) return fail(`Gruppe „${gkey}“, Punkt ${ii + 1} ist ungültig.`);
        const ikey = str(it["key"]), label = str(it["label"]);
        if (!ikey) return fail(`Gruppe „${gkey}“, Punkt ${ii + 1}: Schlüssel fehlt.`);
        if (itemKeys.has(ikey)) return fail(`Doppelter Punkt-Schlüssel: „${ikey}“.`);
        itemKeys.add(ikey);
        if (!label || label.length > 800) return fail(`Punkt „${ikey}“: Text fehlt oder ist länger als 800 Zeichen.`);
        items.push({ key: ikey, label, reference: optStr(it["reference"]) });
      }
      if (!items.length) warnings.push(`Gruppe „${gtitle}“ hat keine Punkte.`);
      counts.items += items.length;
      groups.push({ key: gkey, title: gtitle, reference: optStr(g["reference"]), weeks_text: optStr(g["weeks_text"]), hint: optStr(g["hint"]), items });
    }
    if (!groups.length) warnings.push(`Abschnitt „${stitle}“ hat keine Gruppen.`);
    counts.groups += groups.length;
    sections.push({ key, title: stitle, kind, hint: optStr(s["hint"]), groups });
  }
  counts.sections = sections.length;
  if (!sections.length) warnings.push("Der Plan enthält keine Abschnitte.");
  const plan: PlanJson = {
    plan: {
      code, profession_code: profession, title, subtitle: optStr(p["subtitle"]), source: optStr(p["source"]),
      valid_from: optStr(p["valid_from"]), valid_until: optStr(p["valid_until"]), duration_years: duration,
      is_template: p["is_template"] === true, status,
    },
    sections,
  };
  return { ok: true, error: null, plan, counts, warnings };
}

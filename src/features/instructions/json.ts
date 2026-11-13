/** Prüfung und Vorschau einer Katalog-JSON-Datei vor dem Import (B2, Abschnitt 5; der Server prüft noch einmal). */
export interface CatalogJson {
  catalog: { code: string; profession_code: string; title: string; subtitle: string; source: string; status: "draft" | "published" };
  topics: {
    key: string; title: string; category: string; legal_basis: string; interval_months: number | null;
    when_text: string; hint: string; is_optional: boolean; points: { key: string; label: string }[];
  }[];
}
export interface CatalogPreview { ok: boolean; error: string | null; data: CatalogJson | null; counts: { topics: number; points: number; optional: number }; warnings: string[] }

const CODE_RE = /^[A-Za-z0-9._-]+$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const fail = (error: string): CatalogPreview => ({ ok: false, error, data: null, counts: { topics: 0, points: 0, optional: 0 }, warnings: [] });

export function previewCatalogJson(text: string, knownProfessionCodes?: string[]): CatalogPreview {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return fail("Die Datei ist kein gültiges JSON."); }
  if (!isObj(raw) || !isObj(raw["catalog"])) return fail("Der Eintrag „catalog“ fehlt.");
  const c = raw["catalog"];
  const code = str(c["code"]);
  if (!code || code.length > 100 || !CODE_RE.test(code)) return fail("Der Katalog-Code fehlt oder enthält unzulässige Zeichen (erlaubt: Buchstaben, Ziffern, Punkt, Unterstrich, Bindestrich).");
  const profession = str(c["profession_code"]);
  if (profession && knownProfessionCodes && !knownProfessionCodes.includes(profession)) return fail(`Unbekannter Beruf: „${profession}“.`);
  const title = str(c["title"]);
  if (!title || title.length > 200) return fail("Der Katalogtitel fehlt oder ist länger als 200 Zeichen.");
  if (str(c["subtitle"]).length > 300) return fail("Der Untertitel darf höchstens 300 Zeichen lang sein.");
  if (str(c["source"]).length > 2000) return fail("Die Quelle darf höchstens 2000 Zeichen lang sein.");
  const status = c["status"] === undefined || c["status"] === "" ? "draft" : c["status"];
  if (status !== "draft" && status !== "published") return fail("Der Status muss „draft“ oder „published“ sein.");
  if (!Array.isArray(raw["topics"])) return fail("„topics“ muss eine Liste sein.");
  const warnings: string[] = [];
  const topicKeys = new Set<string>(), pointKeys = new Set<string>();
  const topics: CatalogJson["topics"] = [];
  let points = 0, optional = 0;
  for (const [i, t] of (raw["topics"] as unknown[]).entries()) {
    if (!isObj(t)) return fail(`Thema ${i + 1} hat kein gültiges Format.`);
    const key = str(t["key"]);
    if (!key || key.length > 100) return fail(`Thema ${i + 1}: Der Schlüssel fehlt oder ist zu lang.`);
    if (topicKeys.has(key)) return fail(`Doppelter Themen-Schlüssel: „${key}“.`);
    topicKeys.add(key);
    const tt = str(t["title"]), cat = str(t["category"]);
    if (!tt || tt.length > 200) return fail(`Thema „${key}“: Der Titel fehlt oder ist länger als 200 Zeichen.`);
    if (!cat || cat.length > 80) return fail(`Thema „${key}“: Die Kategorie fehlt oder ist länger als 80 Zeichen.`);
    if (str(t["legal_basis"]).length > 300) return fail(`Thema „${key}“: Die Rechtsgrundlage ist zu lang.`);
    if (str(t["when_text"]).length > 200) return fail(`Thema „${key}“: Der Zeitpunkt ist zu lang.`);
    if (str(t["hint"]).length > 600) return fail(`Thema „${key}“: Der Hinweis ist zu lang.`);
    const iv = t["interval_months"];
    let interval: number | null = null;
    if (iv !== undefined && iv !== null && iv !== "") {
      interval = Number(iv);
      if (!Number.isInteger(interval) || interval < 1 || interval > 36) return fail(`Thema „${key}“: Das Intervall muss 1 bis 36 Monate betragen oder leer sein.`);
    }
    const opt = t["is_optional"] === undefined ? false : t["is_optional"];
    if (typeof opt !== "boolean") return fail(`Thema „${key}“: „is_optional“ muss true oder false sein.`);
    if (opt) optional++;
    const rawPoints = t["points"] === undefined ? [] : t["points"];
    if (!Array.isArray(rawPoints)) return fail(`Thema „${key}“: „points“ muss eine Liste sein.`);
    const pts: { key: string; label: string }[] = [];
    for (const [j, p] of rawPoints.entries()) {
      if (!isObj(p)) return fail(`Thema „${key}“, Punkt ${j + 1}: ungültiges Format.`);
      const pk = str(p["key"]), label = str(p["label"]);
      if (!pk || pk.length > 100) return fail(`Thema „${key}“, Punkt ${j + 1}: Der Schlüssel fehlt oder ist zu lang.`);
      if (pointKeys.has(pk)) return fail(`Doppelter Punkt-Schlüssel: „${pk}“.`);
      pointKeys.add(pk);
      if (!label || label.length > 600) return fail(`Punkt „${pk}“: Der Text fehlt oder ist länger als 600 Zeichen.`);
      pts.push({ key: pk, label });
    }
    if (pts.length === 0) warnings.push(`Thema „${tt}“ hat keine Inhaltspunkte.`);
    if (pts.length > 40) warnings.push(`Thema „${tt}“ hat mehr als 40 Punkte; je Nachweis sind höchstens 40 wählbar.`);
    points += pts.length;
    topics.push({ key, title: tt, category: cat, legal_basis: str(t["legal_basis"]), interval_months: interval, when_text: str(t["when_text"]), hint: str(t["hint"]), is_optional: opt, points: pts });
  }
  if (topics.length === 0) warnings.push("Der Katalog enthält keine Themen.");
  return {
    ok: true, error: null, warnings, counts: { topics: topics.length, points, optional },
    data: { catalog: { code, profession_code: profession, title, subtitle: str(c["subtitle"]), source: str(c["source"]), status }, topics },
  };
}

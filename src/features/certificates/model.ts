/**
 * Ausbildungszeugnis (§ 16 BBiG) und Antrag auf Zulassung zur Abschlussprüfung (§ 43 BBiG).
 * Reine Daten und Regeln ohne Datenbankzugriff. Die Pflichtfelder gibt es genauso in den
 * SQL-Funktionen issue_training_certificate und submit_exam_application – beide müssen gleich bleiben.
 */

export type CertificateKind = "einfach" | "qualifiziert";
export type CertificateStatus = "requested" | "draft" | "issued";
export type ApplicationStatus = "draft" | "submitted" | "confirmed" | "returned";

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "date";
  hint?: string;
  /** Nur beim qualifizierten Zeugnis. */
  qualifiedOnly?: boolean;
  group: string;
}

export const CERTIFICATE_KIND_LABEL: Record<CertificateKind, string> = {
  einfach: "Einfaches Zeugnis",
  qualifiziert: "Qualifiziertes Zeugnis",
};
export const CERTIFICATE_KIND_HINT: Record<CertificateKind, string> = {
  einfach: "Art, Dauer und Ziel der Ausbildung sowie die erworbenen Fertigkeiten, Kenntnisse und Fähigkeiten.",
  qualifiziert: "Zusätzlich Angaben zu Verhalten und Leistung (auf Verlangen des Azubis, § 16 Abs. 2 BBiG).",
};
export const CERTIFICATE_STATUS_LABEL: Record<CertificateStatus, string> = {
  requested: "Beantragt",
  draft: "In Bearbeitung",
  issued: "Ausgestellt",
};

export const CERTIFICATE_FIELDS: FieldDef[] = [
  { key: "beruf", label: "Ausbildungsberuf", type: "text", group: "Ausbildung" },
  { key: "fachrichtung", label: "Fachrichtung / Schwerpunkt", type: "text", group: "Ausbildung" },
  { key: "betrieb", label: "Ausbildungsbetrieb", type: "text", group: "Ausbildung" },
  { key: "betrieb_anschrift", label: "Anschrift des Betriebs", type: "text", group: "Ausbildung" },
  { key: "beginn", label: "Beginn der Ausbildung", type: "date", group: "Ausbildung" },
  { key: "ende", label: "Ende der Ausbildung", type: "date", group: "Ausbildung" },
  { key: "art_ziel", label: "Art, Dauer und Ziel der Ausbildung", type: "textarea", group: "Inhalt", hint: "z. B. Ausbildung nach der Ausbildungsordnung, Abschluss, Verkürzung." },
  { key: "fertigkeiten", label: "Erworbene Fertigkeiten, Kenntnisse und Fähigkeiten", type: "textarea", group: "Inhalt" },
  { key: "verhalten", label: "Verhalten", type: "textarea", group: "Inhalt", qualifiedOnly: true },
  { key: "leistung", label: "Leistung", type: "textarea", group: "Inhalt", qualifiedOnly: true },
  { key: "besonderes", label: "Besondere Kenntnisse oder Tätigkeiten (freiwillig)", type: "textarea", group: "Inhalt", qualifiedOnly: true },
  { key: "ort", label: "Ort", type: "text", group: "Ausstellung" },
  { key: "datum", label: "Datum", type: "date", group: "Ausstellung" },
  { key: "aussteller_name", label: "Name der/des Ausbildenden", type: "text", group: "Ausstellung" },
  { key: "aussteller_funktion", label: "Funktion", type: "text", group: "Ausstellung", hint: "z. B. Betriebsleiter:in" },
  { key: "ausbilder_name", label: "Ausbilder:in (falls nicht selbst ausbildend)", type: "text", group: "Ausstellung", hint: "Unterschreibt mit, wenn die/der Ausbildende nicht selbst ausgebildet hat (§ 16 Abs. 1 BBiG)." },
];

/** Pflichtfelder für „Zeugnis ausstellen“ (gleich wie in issue_training_certificate). */
export function certificateRequired(kind: CertificateKind): string[] {
  const base = ["beruf", "betrieb", "beginn", "ende", "art_ziel", "fertigkeiten", "ort", "datum", "aussteller_name"];
  return kind === "qualifiziert" ? [...base, "verhalten", "leistung"] : base;
}

export function certificateFields(kind: CertificateKind): FieldDef[] {
  return CERTIFICATE_FIELDS.filter((f) => !f.qualifiedOnly || kind === "qualifiziert");
}

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  draft: "Entwurf",
  submitted: "Wartet auf Bestätigung",
  confirmed: "Vom Betrieb bestätigt",
  returned: "Zurückgegeben",
};

export const APPLICATION_FIELDS: FieldDef[] = [
  { key: "geburtsdatum", label: "Geburtsdatum", type: "date", group: "Persönliche Angaben" },
  { key: "geburtsort", label: "Geburtsort", type: "text", group: "Persönliche Angaben" },
  { key: "staatsangehoerigkeit", label: "Staatsangehörigkeit", type: "text", group: "Persönliche Angaben" },
  { key: "anschrift", label: "Anschrift", type: "text", group: "Persönliche Angaben" },
  { key: "telefon", label: "Telefon", type: "text", group: "Persönliche Angaben" },
  { key: "email", label: "E-Mail", type: "text", group: "Persönliche Angaben" },
  { key: "beruf", label: "Ausbildungsberuf", type: "text", group: "Ausbildung" },
  { key: "fachrichtung", label: "Fachrichtung / Schwerpunkt", type: "text", group: "Ausbildung" },
  { key: "betrieb", label: "Ausbildungsbetrieb", type: "text", group: "Ausbildung" },
  { key: "betrieb_anschrift", label: "Anschrift des Betriebs", type: "text", group: "Ausbildung" },
  { key: "ausbilder", label: "Ausbilder:in", type: "text", group: "Ausbildung" },
  { key: "beginn", label: "Beginn der Ausbildung", type: "date", group: "Ausbildung" },
  { key: "ende", label: "Ende laut Vertrag", type: "date", group: "Ausbildung" },
  { key: "verkuerzung", label: "Verkürzung oder Verlängerung (falls ja, Grund)", type: "text", group: "Ausbildung" },
  { key: "berufsschule", label: "Berufsschule", type: "text", group: "Ausbildung" },
  { key: "schulabschluss", label: "Höchster Schulabschluss", type: "text", group: "Ausbildung" },
  { key: "zustaendige_stelle", label: "Zuständige Stelle (Kammer)", type: "text", group: "Prüfung", hint: "z. B. Landwirtschaftskammer Niedersachsen" },
  { key: "zwischenpruefung", label: "Zwischenprüfung / Teil 1 abgelegt am", type: "date", group: "Prüfung" },
  { key: "vorzeitig", label: "Vorzeitige Zulassung beantragt? (falls ja, Begründung)", type: "textarea", group: "Prüfung" },
  { key: "wiederholung", label: "Wiederholungsprüfung? (falls ja, wann zuletzt)", type: "text", group: "Prüfung" },
  { key: "nachteilsausgleich", label: "Nachteilsausgleich / besondere Belange (freiwillig)", type: "textarea", group: "Prüfung" },
];

/** Pflichtfelder für „Einreichen“ (gleich wie in submit_exam_application). */
export const APPLICATION_REQUIRED = ["geburtsdatum", "geburtsort", "anschrift", "beruf", "betrieb", "beginn", "ende", "zustaendige_stelle", "berufsschule"];

export type Values = Record<string, string | boolean | undefined>;

const filled = (v: unknown) => (typeof v === "string" ? v.trim() !== "" : v === true);

export function missingCertificateFields(kind: CertificateKind, content: Values): string[] {
  return certificateRequired(kind).filter((k) => !filled(content[k]));
}

/** Fehlende Angaben vor dem Einreichen (Termin, Pflichtfelder, Bestätigung der Richtigkeit). */
export function missingApplicationFields(term: string, data: Values): string[] {
  const out = APPLICATION_REQUIRED.filter((k) => !filled(data[k]));
  if (!term.trim()) out.unshift("exam_term");
  if (data["bestaetigung_richtig"] !== true) out.push("bestaetigung_richtig");
  return out;
}

export function fieldLabel(key: string): string {
  if (key === "exam_term") return "Prüfungstermin";
  if (key === "bestaetigung_richtig") return "Bestätigung der Richtigkeit";
  return [...APPLICATION_FIELDS, ...CERTIFICATE_FIELDS].find((f) => f.key === key)?.label ?? key;
}

/** Prüfungstermine: Sommer/Winter der nächsten Jahre (Kammern prüfen meist zweimal im Jahr). */
export function examTermOptions(today: Date): string[] {
  const y = today.getFullYear();
  const out: string[] = [];
  for (let i = 0; i < 3; i++) out.push(`Sommer ${y + i}`, `Winter ${y + i}/${String((y + i + 1) % 100).padStart(2, "0")}`);
  return out;
}

export const asText = (v: unknown): string => (typeof v === "string" ? v : "");

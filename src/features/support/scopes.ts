/**
 * Support-Freigaben (Scopes) und Ticket-Codes – zentrale Stelle.
 * Die Liste muss mit public.support_all_scopes() in der Datenbank übereinstimmen.
 */

export type SupportScope =
  | "profil_bearbeiten"
  | "berichte_bearbeiten"
  | "berichte_loeschen"
  | "ausbildung_bearbeiten"
  | "anhaenge_verwalten"
  | "team_verwalten"
  | "email_aendern";

export interface ScopeInfo {
  key: SupportScope;
  label: string;
  hint: string;
  /** Tabellen und Felder, die der Scope ändern darf (Dokumentation + Anzeige). */
  covers: string[];
  /** Nur per Ticket möglich, nie über die manuelle Identitätsprüfung. */
  ticketOnly?: boolean;
}

export const SUPPORT_SCOPES: ScopeInfo[] = [
  { key: "profil_bearbeiten", label: "Profil bearbeiten", hint: "Name, Telefon, Geburtsdatum, Anschrift, Notfallkontakt", covers: ["profiles: Stammdaten"] },
  { key: "ausbildung_bearbeiten", label: "Ausbildung bearbeiten", hint: "Beruf, Betrieb, Beginn und Ende, Bundesland", covers: ["profiles: Beruf, Betrieb, Zeitraum, Bundesland", "azubi_plans"] },
  { key: "berichte_bearbeiten", label: "Berichte bearbeiten", hint: "Texte von Entwürfen und zurückgewiesenen Berichten", covers: ["reports: Tätigkeiten, Berufsschule, Unterweisungen, Zusammenfassung"] },
  { key: "berichte_loeschen", label: "Berichte löschen", hint: "Nur Entwürfe und zurückgewiesene Berichte", covers: ["reports", "report_attachments"] },
  { key: "anhaenge_verwalten", label: "Anhänge verwalten", hint: "Fotos und PDFs an Entwürfen löschen", covers: ["report_attachments", "experience_attachments", "leittext_attachments"] },
  { key: "team_verwalten", label: "Zugriffe verwalten", hint: "Zugriffe von Ausbilder:innen und anderen beenden", covers: ["access_grants"] },
  { key: "email_aendern", label: "E-Mail-Adresse ändern", hint: "Mit Bestätigung an alte und neue Adresse", covers: ["auth: E-Mail"], ticketOnly: true },
];

export const ALL_SCOPES: SupportScope[] = SUPPORT_SCOPES.map((s) => s.key);

export const scopeLabel = (k: string) => SUPPORT_SCOPES.find((s) => s.key === k)?.label ?? k;

/** Bereiche, die der Support nie darf – unabhängig von Ticket oder Prüfung. */
export const ALWAYS_BLOCKED = [
  "Passwörter lesen oder setzen (nur Reset-Mail auslösen)",
  "Als die Person anmelden",
  "Konto löschen",
  "Rollen ändern",
  "Lizenz- und Zahlungsdaten ändern",
];

export const TICKET_DURATIONS = [
  { hours: 1, label: "1 Stunde" },
  { hours: 24, label: "24 Stunden" },
  { hours: 168, label: "7 Tage" },
] as const;

/** Alphabet ohne verwechselbare Zeichen: A–Z ohne I und O, Ziffern 2–9. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 16;

/** 16 kryptografisch zufällige Zeichen (32 Zeichen im Alphabet → keine Verzerrung). */
export function generateTicketCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[(bytes[i] ?? 0) % CODE_ALPHABET.length];
  return out;
}

export function normalizeTicketCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function formatTicketCode(code: string): string {
  const n = normalizeTicketCode(code);
  return n.match(/.{1,4}/g)?.join("-") ?? n;
}

export function isValidTicketCode(code: string): boolean {
  const n = normalizeTicketCode(code);
  return n.length === CODE_LENGTH && [...n].every((c) => CODE_ALPHABET.includes(c));
}

/** SHA-256 (hex) des normalisierten Codes – nur dieser Wert verlässt das Gerät. */
export async function hashTicketCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(normalizeTicketCode(code));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Support-ID-Format U-XXXXXXXX. */
export const SUPPORT_REF_RE = /^U-[A-HJ-NP-Z2-9]{8}$/;

export function remainingLabel(untilIso: string, now = Date.now()): string {
  const ms = Math.max(0, new Date(untilIso).getTime() - now);
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const mmss = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
}

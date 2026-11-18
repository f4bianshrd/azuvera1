import type { BlockReason } from "./types";

/** ISO-Text, Sekunden oder Millisekunden → Millisekunden; sonst null. */
export function parseTime(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value < 1e11 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (/^\d+(\.\d+)?$/.test(t)) return parseTime(Number(t));
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/** Höchster bekannter Zeitpunkt (gegen zurückgestellte Geräteuhren). */
export function raiseHighWater(
  previous: number | null | undefined,
  now: number,
  serverTime?: number | null,
): number {
  return Math.max(previous ?? 0, now, serverTime ?? 0);
}

export const BLOCK_REASONS: BlockReason[] = ["ended", "refunded", "revoked", "payment"];

export const NETWORK_TEXT = "Keine Verbindung. Zum Freischalten brauchst du Internet.";
export const GENERIC_TEXT = "Das hat gerade nicht geklappt. Versuche es später noch einmal.";

/** Texte für Fehler der Lizenz-Schnittstelle (Aktivierungsseite). */
export function errorText(code: string, reason?: string | null): string {
  switch (code) {
    case "invalid_key":
      return "Diesen Schlüssel kennen wir nicht. Prüfe die Schreibweise.";
    case "no_access":
      switch (reason) {
        case "ended":
          return "Diese Lizenz ist beendet.";
        case "refunded":
          return "Dieser Kauf wurde erstattet.";
        case "revoked":
          return "Diese Lizenz wurde gesperrt. Schreib uns bitte über das Kontaktformular auf www.azuvera.de.";
        case "payment":
          return "Die Zahlung für diese Lizenz fehlt. Prüfe deine Zahlungsart in deinem Konto.";
        default:
          return GENERIC_TEXT;
      }
    case "removal_limit":
      return "Du hast in den letzten 30 Tagen schon mehrere Geräte entfernt. Bitte schreib uns über das Kontaktformular.";
    case "rate_limited":
      return "Zu viele Versuche. Bitte warte eine Weile.";
    case "network":
      return NETWORK_TEXT;
    default:
      return GENERIC_TEXT;
  }
}

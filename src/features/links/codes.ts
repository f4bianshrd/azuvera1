/** Reine Regeln für Verknüpfungscodes (ohne Datenbank, testbar). Spiegeln die Prüfungen in redeem_link_code. */
import type { AppRole } from "@/features/app/session";

export type LinkAccess = "read" | "feedback" | "review";

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;

export const ACCESS_INFO: Record<LinkAccess, { label: string; who: string; can: string[] }> = {
  read: {
    label: "Nur lesen",
    who: "Prüfer:innen und Lehrkräfte",
    can: ["Berichte, Ausbildungsplan und Noten ansehen"],
  },
  feedback: {
    label: "Lesen & Rückmelden",
    who: "Ausbildungsberatung",
    can: ["Alles ansehen", "Rückmeldungen zu Berichten schreiben"],
  },
  review: {
    label: "Prüfen & Freigeben",
    who: "Ausbilder:innen und Betriebsleitung",
    can: ["Alles ansehen", "Berichte freigeben oder zurückweisen", "Rückmeldungen schreiben"],
  },
};

export const VALIDITY_OPTIONS = [
  { hours: 24, label: "24 Stunden" },
  { hours: 168, label: "7 Tage" },
  { hours: 720, label: "30 Tage" },
] as const;

const RANK: Record<LinkAccess, number> = { read: 1, feedback: 2, review: 3 };
const ROLE_MAX: Record<AppRole, number> = {
  azubi: 0,
  lehrer: 1,
  ausbildungsberater: 2,
  ausbilder: 3,
  betriebsleiter: 3,
  ausbildungsleitung: 3,
};

/** Darf eine Person mit dieser Rolle einen Code dieser Zugriffsart einlösen? */
export function canRedeem(role: AppRole, access: LinkAccess): boolean {
  return ROLE_MAX[role] >= RANK[access];
}

/** Großschreibung, nur gültige Zeichen; Bindestriche und Leerzeichen fallen weg. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0").replace(/[01I]/g, (c) => (c === "1" || c === "I" ? "1" : c));
}

export function isValidCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
}

/** „ABCD-EFGH“ zum Vorlesen und Abtippen. */
export function formatCode(code: string): string {
  const c = code.toUpperCase();
  return c.length === CODE_LENGTH ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

export function linkUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/verknuepfungen?code=${encodeURIComponent(code)}`;
}

/** Aus gescanntem Text den Code holen: Azuvera-Link mit ?code= oder der Code selbst. */
export function extractCode(scanned: string): string | null {
  const t = scanned.trim();
  try {
    const u = new URL(t);
    const c = u.searchParams.get("code");
    if (c && u.pathname.replace(/\/$/, "").endsWith("/verknuepfungen")) {
      const n = normalizeCode(c);
      return isValidCode(n) ? n : null;
    }
    return null;
  } catch {
    const n = normalizeCode(t);
    return isValidCode(n) ? n : null;
  }
}

/** Restlaufzeit kurz und lesbar. */
export function expiresInText(expiresAt: string, now = new Date()): string {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return "abgelaufen";
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `noch ${Math.max(1, Math.round(ms / 60_000))} Min.`;
  if (h < 48) return `noch ${h} Std.`;
  return `noch ${Math.floor(h / 24)} Tage`;
}

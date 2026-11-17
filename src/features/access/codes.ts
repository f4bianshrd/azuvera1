/** Reine Regeln für Einladungs-Codes (ohne Datenbank, testbar). Spiegeln invitations/redeem_invitation_core. */
import type { AppRole } from "@/features/app/session";

/** 31 Zeichen ohne 0, 1, I, L und O – gut abzutippen. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 12;

export type InviteRole = "ausbilder" | "betriebsleiter" | "ausbildungsberater" | "pruefer" | "lehrer";
export const INVITE_ROLE_ORDER: InviteRole[] = ["ausbilder", "betriebsleiter", "ausbildungsberater", "pruefer", "lehrer"];

/** Prüfrecht der eingeladenen Rolle (Ausbilder:in, Betriebsleiter:in, Ausbildungsberater:in). */
export function roleCanReview(role: AppRole): boolean {
  return role === "ausbilder" || role === "betriebsleiter" || role === "ausbildungsberater";
}

/** Erklärung unter der Rollenauswahl im Einladungsdialog. */
export const INVITE_ROLE_HINT: Record<InviteRole, string> = {
  ausbilder: "Prüft und gibt deine Berichte frei.",
  betriebsleiter: "Prüft und gibt deine Berichte frei.",
  ausbildungsberater: "Prüft, kommentiert und gibt deine Berichte frei, zum Beispiel für die Kammer.",
  pruefer: "Liest für eine Zwischen- oder Abschlussprüfung mit. Der Zugriff endet automatisch.",
  lehrer: "Liest mit. Keine Freigabe.",
};

export const CODE_VALID_DAYS = [3, 7, 14, 30, 60] as const;
export const PRUEFER_ACCESS_DAYS = [14, 30, 60, 90, 180] as const;
/** null = „Bis ich ihn beende“. */
export const ACCESS_DAYS: (number | null)[] = [null, 90, 180, 365];

export function isInviteRole(v: unknown): v is InviteRole {
  return typeof v === "string" && (INVITE_ROLE_ORDER as string[]).includes(v);
}

/** Großschreibung, nur gültige Zeichen; Leerzeichen und Bindestriche fallen weg. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "").replace(/[^A-Z0-9]/g, "");
}

export function isValidCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
}

/** „K7M2-Q9XA-4TBN“ zum Vorlesen und Abtippen. */
export function formatCode(code: string): string {
  const c = normalizeCode(code);
  return c.length === CODE_LENGTH ? `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}` : c;
}

export function inviteUrl(origin: string, code: string, role: AppRole): string {
  return `${origin.replace(/\/$/, "")}/einladung?code=${encodeURIComponent(normalizeCode(code))}&rolle=${encodeURIComponent(role)}`;
}

/** Aus gescanntem Text den Code holen: Azuvera-Einladungslink mit ?code= oder der Code selbst. */
export function extractCode(scanned: string): string | null {
  const t = scanned.trim();
  try {
    const u = new URL(t);
    const c = u.searchParams.get("code");
    if (c && u.pathname.replace(/\/$/, "").endsWith("/einladung")) {
      const n = normalizeCode(c);
      return isValidCode(n) ? n : null;
    }
    return null;
  } catch {
    const n = normalizeCode(t);
    return isValidCode(n) ? n : null;
  }
}

/** Tage bis zum Ende (aufgerundet); null bei unbefristet. */
export function daysLeft(validUntil: string | null, now = new Date()): number | null {
  if (!validUntil) return null;
  return Math.ceil((new Date(validUntil).getTime() - now.getTime()) / 86_400_000);
}

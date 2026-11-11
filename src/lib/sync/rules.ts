import type { NetworkStatus } from "@/lib/platform";
import type { OutboxEntry, OutboxOp } from "./db";

/** Wartezeiten nach Netzwerk-/Serverfehlern: 5 s, 15 s, 1 min, 5 min, danach alle 15 min. */
export function backoffDelayMs(attempts: number): number {
  const steps = [5_000, 15_000, 60_000, 300_000];
  return attempts >= 1 && attempts <= steps.length ? steps[attempts - 1]! : attempts < 1 ? 0 : 900_000;
}

export interface NetPrefs { wifiOnly: boolean; photosWifiOnly: boolean }

const isWifi = (n: NetworkStatus) => n.type === "wifi" || n.type === "ethernet";

/** Darf dieser Eintrag unter den aktuellen Netzbedingungen gesendet werden? */
export function mayUseNetworkFor(op: OutboxOp, net: NetworkStatus, prefs: NetPrefs, force = false): boolean {
  if (!net.online) return false;
  if (force) return true;
  const known = net.type !== null;
  if (known && prefs.wifiOnly && !isWifi(net)) return false;
  if (op === "attachment.upload") {
    if (net.saveData) return false;
    if (known && prefs.photosWifiOnly && !isWifi(net)) return false;
  }
  return true;
}

/** Ops, deren wartende Einträge je Datensatz zusammengefasst werden. */
const COALESCE: OutboxOp[] = ["report.upsert", "absence.upsert", "grade.upsert", "attachment.update", "profile.update"];

/**
 * Wartende Änderung zusammenfassen: gibt es für denselben Datensatz schon einen wartenden
 * Eintrag derselben Art, wird dieser aktualisiert (lokal gewinnt der letzte Stand).
 */
export function coalesce(existing: OutboxEntry[], next: Omit<OutboxEntry, "id">): { update?: OutboxEntry; insert?: Omit<OutboxEntry, "id"> } {
  if (COALESCE.includes(next.op)) {
    const hit = existing.find((e) => e.record === next.record && e.op === next.op && e.status === "waiting");
    // Nur zusammenfassen, wenn danach kein anderer Schritt desselben Datensatzes kommt.
    const later = hit && existing.some((e) => e.record === next.record && (e.id ?? 0) > (hit.id ?? 0));
    if (hit && !later) {
      return { update: { ...hit, payload: { ...hit.payload, ...next.payload }, title: next.title, attempts: 0, next_at: 0, error: null } };
    }
  }
  return { insert: next };
}

/** Nächste sendbare Einträge: je Datensatz nur der älteste; blockiert durch Fehler/Konflikt. */
export function readyHeads(entries: OutboxEntry[], now: number, allow: (e: OutboxEntry) => boolean): OutboxEntry[] {
  const heads = new Map<string, OutboxEntry>();
  for (const e of [...entries].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))) if (!heads.has(e.record)) heads.set(e.record, e);
  return [...heads.values()].filter((e) => e.status === "waiting" && e.next_at <= now && allow(e));
}

export type ErrorKind = "network" | "permanent" | "conflict" | "duplicate" | "auth";
export function classifyError(err: { code?: string | undefined; status?: number | undefined; message?: string | undefined } | null | undefined): ErrorKind {
  if (!err) return "network";
  const msg = (err.message ?? "").toLowerCase();
  if (err.code === "23505" || msg.includes("already exists") || msg.includes("duplicate")) return "duplicate";
  if (msg.includes("inzwischen geändert")) return "conflict";
  if (err.status === 401 || err.code === "PGRST301" || msg.includes("jwt expired") || msg.includes("invalid refresh token")) return "auth";
  if (err.status === undefined || err.status === 0 || err.status >= 500 || msg.includes("failed to fetch") || msg.includes("network") || msg.includes("load failed")) return "network";
  return "permanent";
}

export function friendlyError(err: { code?: string | undefined; message?: string | undefined } | null | undefined): string {
  const code = err?.code ?? "";
  if (code === "42501") return "Dazu fehlt dir die Berechtigung.";
  if (code === "23514" || code === "22P02" || code === "22007") return "Die Eingaben sind ungültig.";
  return err?.message || "Die Änderung wurde vom Server abgelehnt.";
}

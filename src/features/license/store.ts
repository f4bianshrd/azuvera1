import { useSyncExternalStore } from "react";
import type { LicensePhase, LicenseWarning, LockReason, StoredLicense } from "./types";

export interface LicenseState {
  phase: LicensePhase;
  reason: LockReason | null;
  warnings: LicenseWarning[];
  stored: StoredLicense | null;
  busy: boolean;
  nextCheckAt: number | null;
  leaseExpiresAt: number | null;
  accessUntil: number | null;
  /** Hinweis für die Aktivierungsseite (z. B. nach Abmeldung durch den Server). */
  notice: string | null;
}

const initial: LicenseState = {
  phase: "loading",
  reason: null,
  warnings: [],
  stored: null,
  busy: false,
  nextCheckAt: null,
  leaseExpiresAt: null,
  accessUntil: null,
  notice: null,
};

let state: LicenseState = initial;
const subs = new Set<() => void>();

export function getLicenseState(): LicenseState {
  return state;
}

export function setLicenseState(patch: Partial<LicenseState>): void {
  state = { ...state, ...patch };
  subs.forEach((s) => s());
}

function subscribe(cb: () => void): () => void {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

const serverSnapshot = () => initial;

export function useLicense(): LicenseState {
  return useSyncExternalStore(subscribe, getLicenseState, serverSnapshot);
}

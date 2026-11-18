import Dexie, { type Table } from "dexie";
import type { StoredLicense } from "./types";

/**
 * Eigene kleine Datenbank nur für die Lizenz (gehört zum Gerät, nicht zum App-Konto):
 * überlebt Abmeldung und Kontowechsel. Fällt IndexedDB aus, dient localStorage als Ersatz.
 * Schlüssel und Lease werden nie geloggt.
 */
const LS_KEY = "azuvera.license";
const ROW = "license";

class LicenseDb extends Dexie {
  kv!: Table<{ key: string; value: unknown }, string>;
  constructor() {
    super("azuvera-license");
    this.version(1).stores({ kv: "key" });
  }
}

let db: LicenseDb | null = null;
function getDb(): LicenseDb {
  if (!db) db = new LicenseDb();
  return db;
}

export async function readStored(): Promise<StoredLicense | null> {
  try {
    const row = await getDb().kv.get(ROW);
    if (row?.value) return row.value as StoredLicense;
  } catch {
    /* IndexedDB nicht verfügbar */
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as StoredLicense) : null;
  } catch {
    return null;
  }
}

export async function writeStored(value: StoredLicense): Promise<void> {
  try {
    await getDb().kv.put({ key: ROW, value });
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* egal */
    }
    return;
  } catch {
    /* IndexedDB nicht verfügbar */
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(value));
  } catch {
    /* privat */
  }
}

/** 32 Hexzeichen, einmal pro Gerät. */
export function newDeviceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function blankLicense(
  deviceId: string,
  deviceName: string | null = null,
  now = Date.now(),
): StoredLicense {
  return {
    licenseKey: null,
    deviceId,
    deviceName,
    lease: null,
    planLabel: null,
    deviceLimit: null,
    devicesUsed: null,
    accessUntil: null,
    status: null,
    lastCheckOkAt: null,
    lastAttemptAt: null,
    blockedReason: null,
    highWater: now,
  };
}

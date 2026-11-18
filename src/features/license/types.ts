export type BlockReason = "ended" | "refunded" | "revoked" | "payment";
export type LockReason = BlockReason | "lease_expired" | "clock" | "invalid" | "setup";
export type LicenseWarning = "lease_soon" | "past_due" | "ends_soon";
export type LicensePhase = "loading" | "none" | "active" | "locked";

/** Gerätegebundene Lizenzdaten (eigene kleine Datenbank, nie im App-Konto). */
export interface StoredLicense {
  licenseKey: string | null;
  deviceId: string;
  deviceName: string | null;
  lease: string | null;
  planLabel: string | null;
  deviceLimit: number | null;
  devicesUsed: number | null;
  /** Millisekunden oder null (unbefristet). Nur Anzeige. */
  accessUntil: number | null;
  status: "active" | "past_due" | null;
  lastCheckOkAt: number | null;
  lastAttemptAt: number | null;
  blockedReason: BlockReason | null;
  highWater: number;
}

export interface LeaseClaims {
  iss: string;
  aud: string | string[];
  sub: string;
  did: string;
  plan: string;
  lim: number;
  st: "active" | "past_due";
  au: number | null;
  iat: number;
  exp: number;
  ver: number;
}

export interface UsedDevice {
  deviceName: string;
  platform: string;
  activated_at: string | number | null;
}

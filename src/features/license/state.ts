import { NATIVE_LICENSE as C, type LicensePublicKeys } from "@/config/native-license";
import { verifyLease } from "./lease";
import type { LicenseWarning, LockReason, StoredLicense } from "./types";

export interface Evaluation {
  phase: "none" | "active" | "locked";
  reason: LockReason | null;
  warnings: LicenseWarning[];
  /** Zeitpunkt der nächsten Online-Prüfung (ms) oder null, wenn nichts zu prüfen ist. */
  nextCheckAt: number | null;
  /** Ablauf des Leases (ms), nur bei gültigem Lease. */
  leaseExpiresAt: number | null;
  /** Zugriff bis (ms) aus dem geprüften Lease. */
  accessUntil: number | null;
}

const HOUR = 3_600_000;
const MIN = 60_000;
const DAY = 24 * HOUR;

export function keysUsable(keys: LicensePublicKeys): boolean {
  const list = Object.values(keys ?? {});
  return (
    list.length > 0 && list.every((k) => k && k.kty === "EC" && k.crv === "P-256" && !!k.x && !!k.y)
  );
}

export function computeNextCheck(stored: StoredLicense, now: number): number {
  const ok = stored.lastCheckOkAt;
  const attempt = stored.lastAttemptAt;
  let next = ok ? ok + C.CHECK_EVERY_HOURS * HOUR : now;
  if (attempt && (!ok || attempt > ok))
    next = Math.max(next, attempt + C.RETRY_AFTER_MINUTES * MIN);
  return next;
}

export async function evaluate(input: {
  stored: StoredLicense | null;
  now: number;
  keys: LicensePublicKeys;
  cryptoOk: boolean;
}): Promise<Evaluation> {
  const { stored, now, keys, cryptoOk } = input;
  const base = { warnings: [] as LicenseWarning[], leaseExpiresAt: null, accessUntil: null };
  if (!keysUsable(keys) || !cryptoOk)
    return { ...base, phase: "locked", reason: "setup", nextCheckAt: null };
  if (!stored || !stored.licenseKey)
    return { ...base, phase: "none", reason: null, nextCheckAt: null };

  const nextCheckAt = computeNextCheck(stored, now);
  const locked = (reason: LockReason): Evaluation => ({
    ...base,
    phase: "locked",
    reason,
    nextCheckAt,
  });

  if (stored.blockedReason) return locked(stored.blockedReason);
  if (now < (stored.highWater ?? 0) - C.CLOCK_TOLERANCE_MINUTES * MIN) return locked("clock");
  if (!stored.lease) return locked("lease_expired");

  const res = await verifyLease(stored.lease, { keys, deviceId: stored.deviceId, now });
  if (!res.ok) {
    if (res.reason === "expired") return locked("lease_expired");
    if (res.reason === "not_yet") return locked("clock");
    return locked("invalid");
  }
  const c = res.claims;
  const au = typeof c.au === "number" ? c.au * 1000 : null;
  if (au !== null && au <= now) return locked(c.st === "past_due" ? "payment" : "ended");

  const warnings: LicenseWarning[] = [];
  const exp = c.exp * 1000;
  if (exp - now < C.LEASE_WARN_HOURS * HOUR) warnings.push("lease_soon");
  if (c.st === "past_due") warnings.push("past_due");
  if (au !== null && au - now <= C.EXPIRY_NOTICE_DAYS * DAY) warnings.push("ends_soon");
  return {
    phase: "active",
    reason: null,
    warnings,
    nextCheckAt,
    leaseExpiresAt: exp,
    accessUntil: au,
  };
}

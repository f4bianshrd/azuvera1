import { NATIVE_LICENSE as C } from "@/config/native-license";
import { currentPlatformId, onNetworkChange, onVisibilityChange } from "@/lib/platform";
import { verifyLease } from "./lease";
import { evaluate } from "./state";
import { blankLicense, newDeviceId, readStored, writeStored } from "./persist";
import { getLicenseState, setLicenseState } from "./store";
import { normalizeLicenseKey } from "./key";
import {
  BLOCK_REASONS,
  errorText,
  GENERIC_TEXT,
  NETWORK_TEXT,
  parseTime,
  raiseHighWater,
} from "./util";
import type { BlockReason, StoredLicense, UsedDevice } from "./types";

/**
 * Einziger Ort mit Aufrufen an die Lizenz-Schnittstelle. Läuft nur in nativen Versionen
 * (der NativeLicenseGate startet ihn). Schlüssel und Lease werden nie geloggt.
 */

export const UNVERIFIABLE_TEXT =
  "Die Antwort des Servers konnte nicht geprüft werden. Aktualisiere die App und versuche es erneut.";
export const REMOVED_TEXT = "Dieses Gerät wurde abgemeldet. Gib deinen Lizenzschlüssel erneut ein.";
export const OFFLINE_DEACTIVATE_TEXT = "Zum Abmelden brauchst du eine Internetverbindung.";
export const FORMAT_TEXT =
  "Der Schlüssel sieht nicht richtig aus. Er hat das Format AZV-XXXX-XXXX-XXXX-XXXX.";

let current: StoredLicense | null = null;
let queue: Promise<unknown> = Promise.resolve();

const cryptoOk = () =>
  typeof crypto !== "undefined" && !!crypto.subtle && typeof crypto.getRandomValues === "function";

/** Höchstens ein Aufruf gleichzeitig. */
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

async function refresh(): Promise<void> {
  const ev = await evaluate({
    stored: current,
    now: Date.now(),
    keys: C.LICENSE_PUBLIC_KEYS,
    cryptoOk: cryptoOk(),
  });
  setLicenseState({
    phase: ev.phase,
    reason: ev.reason,
    warnings: ev.warnings,
    stored: current,
    nextCheckAt: ev.nextCheckAt,
    leaseExpiresAt: ev.leaseExpiresAt,
    accessUntil: ev.accessUntil,
  });
}

async function save(next: StoredLicense): Promise<void> {
  current = next;
  await writeStored(next);
}

async function bumpHighWater(): Promise<void> {
  if (!current) return;
  const hw = raiseHighWater(current.highWater, Date.now());
  if (hw !== current.highWater) await save({ ...current, highWater: hw });
}

// ---------- Schnittstelle ----------
type ApiResult =
  | { kind: "ok"; data: Record<string, unknown> }
  | {
      kind: "error";
      code: string;
      reason: string | null;
      devices: UsedDevice[];
      limit: number | null;
    }
  | { kind: "network" };

async function post(path: string, body: Record<string, unknown>): Promise<ApiResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), C.REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(C.LICENSE_API_BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      credentials: "omit",
      cache: "no-store",
    });
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return { kind: "network" };
    }
    if (!json || typeof json !== "object" || typeof (json as { ok?: unknown }).ok !== "boolean")
      return { kind: "network" };
    const j = json as Record<string, unknown> & { ok: boolean; error?: Record<string, unknown> };
    if (j.ok) return { kind: "ok", data: j };
    const err = (j.error ?? {}) as Record<string, unknown>;
    const pick = (k: string) => j[k] ?? err[k];
    const devicesRaw = pick("devices");
    const devicesList = Array.isArray(devicesRaw)
      ? devicesRaw
      : Array.isArray((devicesRaw as { list?: unknown })?.list)
        ? (devicesRaw as { list: unknown[] }).list
        : [];
    const limitRaw = pick("limit") ?? (devicesRaw as { limit?: unknown })?.limit;
    return {
      kind: "error",
      code: typeof err["code"] === "string" ? err["code"] : "internal",
      reason: typeof pick("reason") === "string" ? (pick("reason") as string) : null,
      devices: devicesList.filter(
        (d): d is UsedDevice => !!d && typeof d === "object",
      ) as UsedDevice[],
      limit: typeof limitRaw === "number" ? limitRaw : null,
    };
  } catch {
    return { kind: "network" };
  } finally {
    clearTimeout(timer);
  }
}

/** Erfolgreiche Antwort von /activate oder /check übernehmen – nur nach geprüftem Lease. */
async function applyOk(
  base: StoredLicense,
  data: Record<string, unknown>,
  now: number,
): Promise<boolean> {
  const lease = typeof data["lease"] === "string" ? data["lease"] : "";
  const res = await verifyLease(lease, {
    keys: C.LICENSE_PUBLIC_KEYS,
    deviceId: base.deviceId,
    now,
  });
  if (!res.ok) return false;
  const plan = (data["plan"] ?? {}) as { label?: unknown; deviceLimit?: unknown };
  const devices = (data["devices"] ?? {}) as { used?: unknown; limit?: unknown };
  const serverTime = parseTime(data["serverTime"]);
  await save({
    ...base,
    lease,
    planLabel: typeof plan.label === "string" ? plan.label : base.planLabel,
    deviceLimit:
      typeof devices.limit === "number"
        ? devices.limit
        : typeof plan.deviceLimit === "number"
          ? plan.deviceLimit
          : res.claims.lim,
    devicesUsed: typeof devices.used === "number" ? devices.used : base.devicesUsed,
    accessUntil: parseTime(data["accessUntil"]),
    status: data["status"] === "past_due" ? "past_due" : "active",
    lastCheckOkAt: now,
    lastAttemptAt: now,
    blockedReason: null,
    // Der Server bestätigt die echte Zeit: so löst sich eine frühere Uhr-Sperre nach dem Richtigstellen.
    highWater: Math.max(now, serverTime ?? now),
  });
  return true;
}

// ---------- öffentliche Funktionen ----------
export async function loadLicense(): Promise<void> {
  const s = await readStored();
  current = s && s.deviceId ? { ...s, highWater: raiseHighWater(s.highWater, Date.now()) } : null;
  if (current) await writeStored(current);
  await refresh();
}

export type ActivateResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      formError?: boolean;
      deviceLimit?: { limit: number; devices: UsedDevice[] };
    };

export function activate(input: { keyInput: string; deviceName: string }): Promise<ActivateResult> {
  return exclusive(async () => {
    const licenseKey = normalizeLicenseKey(input.keyInput);
    if (!licenseKey) return { ok: false, message: FORMAT_TEXT, formError: true };
    const deviceName = input.deviceName.trim().slice(0, 80) || "Gerät";
    setLicenseState({ busy: true, notice: null });
    try {
      if (!current) await save(blankLicense(newDeviceId()));
      const base = current as StoredLicense;
      const now = Date.now();
      const res = await post("/activate", {
        licenseKey,
        deviceId: base.deviceId,
        deviceName,
        platform: currentPlatformId(),
        appVersion: C.APP_VERSION,
      });
      if (res.kind === "network") return { ok: false, message: NETWORK_TEXT };
      if (res.kind === "error") {
        if (res.code === "device_limit") {
          return {
            ok: false,
            message: errorText("device_limit"),
            deviceLimit: { limit: res.limit ?? res.devices.length, devices: res.devices },
          };
        }
        return { ok: false, message: errorText(res.code, res.reason) };
      }
      const ok = await applyOk({ ...base, licenseKey, deviceName }, res.data, now);
      if (!ok) return { ok: false, message: UNVERIFIABLE_TEXT };
      return { ok: true };
    } finally {
      await refresh();
      setLicenseState({ busy: false });
    }
  });
}

export type CheckResult =
  | { status: "ok" }
  | { status: "skipped" }
  | { status: "blocked"; reason: BlockReason }
  | { status: "removed" }
  | { status: "offline" }
  | { status: "error"; message: string };

export function checkNow({ force = false }: { force?: boolean } = {}): Promise<CheckResult> {
  return exclusive(async () => {
    if (!current?.licenseKey) return { status: "skipped" } as const;
    const due = getLicenseState().nextCheckAt;
    if (!force && due !== null && Date.now() < due) return { status: "skipped" } as const;
    setLicenseState({ busy: true });
    try {
      const base = current;
      const now = Date.now();
      const res = await post("/check", {
        licenseKey: base.licenseKey,
        deviceId: base.deviceId,
        appVersion: C.APP_VERSION,
      });
      if (res.kind === "ok") {
        if (await applyOk(base, res.data, now)) return { status: "ok" } as const;
        await save({ ...base, lastAttemptAt: now, highWater: raiseHighWater(base.highWater, now) });
        return { status: "error", message: UNVERIFIABLE_TEXT } as const;
      }
      if (res.kind === "error" && res.code === "no_access") {
        const reason: BlockReason = (BLOCK_REASONS as string[]).includes(res.reason ?? "")
          ? (res.reason as BlockReason)
          : "revoked";
        await save({
          ...base,
          lease: null,
          blockedReason: reason,
          lastAttemptAt: now,
          highWater: raiseHighWater(base.highWater, now),
        });
        return { status: "blocked", reason } as const;
      }
      if (res.kind === "error" && (res.code === "not_activated" || res.code === "invalid_key")) {
        await save({
          ...blankLicense(base.deviceId, base.deviceName, now),
          highWater: raiseHighWater(base.highWater, now),
        });
        setLicenseState({ notice: REMOVED_TEXT });
        return { status: "removed" } as const;
      }
      // Netz, Zeitüberschreitung, rate_limited, internal: nur den Versuch merken; gültiges Lease gilt weiter.
      await save({ ...base, lastAttemptAt: now, highWater: raiseHighWater(base.highWater, now) });
      if (res.kind === "network") return { status: "offline" } as const;
      return { status: "error", message: errorText(res.code, res.reason) } as const;
    } finally {
      await refresh();
      setLicenseState({ busy: false });
    }
  });
}

export function deactivate(): Promise<{ ok: true } | { ok: false; message: string }> {
  return exclusive(async () => {
    if (!current?.licenseKey) return { ok: true } as const;
    setLicenseState({ busy: true });
    try {
      const base = current;
      const res = await post("/deactivate", {
        licenseKey: base.licenseKey,
        deviceId: base.deviceId,
      });
      if (res.kind === "network") return { ok: false, message: OFFLINE_DEACTIVATE_TEXT } as const;
      if (res.kind === "ok" || res.code === "not_activated" || res.code === "invalid_key") {
        await save({
          ...blankLicense(base.deviceId, base.deviceName),
          highWater: raiseHighWater(base.highWater, Date.now()),
        });
        return { ok: true } as const;
      }
      if (res.code === "removal_limit")
        return { ok: false, message: errorText("removal_limit") } as const;
      return { ok: false, message: errorText(res.code, res.reason) || GENERIC_TEXT } as const;
    } finally {
      await refresh();
      setLicenseState({ busy: false });
    }
  });
}

/** Alle Lizenzdaten außer der Geräte-Kennung löschen, ohne Aufruf („Anderen Schlüssel eingeben“). */
export function forgetLicense(): Promise<void> {
  return exclusive(async () => {
    const deviceId = current?.deviceId ?? newDeviceId();
    await save({
      ...blankLicense(deviceId, current?.deviceName ?? null),
      highWater: raiseHighWater(current?.highWater, Date.now()),
    });
    setLicenseState({ notice: null });
    await refresh();
  });
}

/** Zeitplan (nur nativ): sofort aus dem Speicher auswerten, danach prüfen, wenn fällig. */
export function startLicenseScheduler(): () => void {
  let stopped = false;
  const maybeCheck = () => {
    if (stopped) return;
    const next = getLicenseState().nextCheckAt;
    if (next !== null && Date.now() >= next) void checkNow({ force: false });
  };
  void loadLicense().then(maybeCheck);
  const evalTimer = setInterval(() => void refresh(), 60_000);
  const checkTimer = setInterval(maybeCheck, 15 * 60_000);
  const offVisible = onVisibilityChange((visible) => {
    if (visible) void bumpHighWater().then(refresh).then(maybeCheck);
  });
  const offNetwork = onNetworkChange((s) => {
    if (s.online) maybeCheck();
  });
  return () => {
    stopped = true;
    clearInterval(evalTimer);
    clearInterval(checkTimer);
    offVisible();
    offNetwork();
  };
}

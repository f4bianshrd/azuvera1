import { NATIVE_LICENSE as C, type LicensePublicKeys } from "@/config/native-license";
import type { LeaseClaims } from "./types";

export type LeaseFailure =
  | "format"
  | "kid"
  | "signature"
  | "issuer"
  | "audience"
  | "version"
  | "device"
  | "expired"
  | "not_yet";
export type LeaseResult = { ok: true; claims: LeaseClaims } | { ok: false; reason: LeaseFailure };

const B64URL = /^[A-Za-z0-9_-]+$/;

export function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function decodeJson(part: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
}

/**
 * Prüft ein Lease (JWT, ES256, rohe Signatur r||s). Vor der Signaturprüfung wird
 * kein Feld der Nutzlast gelesen.
 */
export async function verifyLease(
  token: string,
  opts: { keys: LicensePublicKeys; deviceId: string; now: number },
): Promise<LeaseResult> {
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3 || !parts.every((p) => p.length > 0 && B64URL.test(p)))
    return { ok: false, reason: "format" };
  const [h, p, s] = parts as [string, string, string];

  let header: { alg?: unknown; kid?: unknown };
  try {
    header = decodeJson(h) as typeof header;
  } catch {
    return { ok: false, reason: "format" };
  }
  if (!header || typeof header !== "object" || header.alg !== "ES256")
    return { ok: false, reason: "format" };
  const kid = typeof header.kid === "string" ? header.kid : "";
  const jwk = Object.prototype.hasOwnProperty.call(opts.keys, kid) ? opts.keys[kid] : undefined;
  if (!jwk) return { ok: false, reason: "kid" };

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
  } catch {
    return { ok: false, reason: "kid" };
  }

  let sig: Uint8Array<ArrayBuffer>;
  try {
    sig = base64UrlToBytes(s);
  } catch {
    return { ok: false, reason: "format" };
  }
  if (sig.length !== 64) return { ok: false, reason: "signature" };
  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      sig,
      new TextEncoder().encode(`${h}.${p}`),
    );
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: "signature" };

  let c: LeaseClaims;
  try {
    c = decodeJson(p) as LeaseClaims;
  } catch {
    return { ok: false, reason: "format" };
  }
  if (!c || typeof c !== "object") return { ok: false, reason: "format" };
  if (c.iss !== C.ISSUER) return { ok: false, reason: "issuer" };
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(C.AUDIENCE)) return { ok: false, reason: "audience" };
  if (c.ver !== 1) return { ok: false, reason: "version" };
  if (typeof c.did !== "string" || c.did !== opts.deviceId) return { ok: false, reason: "device" };
  if (typeof c.exp !== "number" || typeof c.iat !== "number")
    return { ok: false, reason: "format" };
  if (c.exp * 1000 <= opts.now) return { ok: false, reason: "expired" };
  if (c.iat * 1000 > opts.now + C.CLOCK_TOLERANCE_MINUTES * 60_000)
    return { ok: false, reason: "not_yet" };
  return { ok: true, claims: c };
}

// Nur für Tests: erzeugt Leases wie die Website (ES256, rohe Signatur r||s).
import type { LicensePublicKeys } from "@/config/native-license";

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export const b64urlJson = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));

export async function makeKeyPair(kid = "test-1") {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const keys: LicensePublicKeys = { [kid]: { kty: "EC", crv: "P-256", x: jwk.x!, y: jwk.y!, kid } };
  return { privateKey: pair.privateKey, keys, kid };
}

export async function signLease(
  payload: Record<string, unknown>,
  privateKey: CryptoKey,
  kid: string,
  header: Record<string, unknown> = {},
): Promise<string> {
  const h = b64urlJson({ alg: "ES256", typ: "JWT", kid, ...header });
  const p = b64urlJson(payload);
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      new TextEncoder().encode(`${h}.${p}`),
    ),
  );
  return `${h}.${p}.${b64url(sig)}`;
}

export function claims(now: number, over: Record<string, unknown> = {}) {
  const s = Math.floor(now / 1000);
  return {
    iss: "https://www.azuvera.de",
    aud: "azuvera-native",
    sub: "lic_1",
    did: "device-abcdef0123456789",
    plan: "azubi_monthly",
    lim: 2,
    st: "active",
    au: null,
    iat: s - 60,
    exp: s + 7 * 86400,
    ver: 1,
    ...over,
  };
}

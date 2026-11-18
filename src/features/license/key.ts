import { NATIVE_LICENSE as C } from "@/config/native-license";

const BODY_LENGTH = C.KEY_GROUPS * C.KEY_GROUP_LENGTH;

function groups(body: string): string {
  const out: string[] = [];
  for (let i = 0; i < body.length; i += C.KEY_GROUP_LENGTH)
    out.push(body.slice(i, i + C.KEY_GROUP_LENGTH));
  return out.join("-");
}

/** Liefert AZV-XXXX-XXXX-XXXX-XXXX oder null, wenn die Eingabe kein gültiger Schlüssel ist. */
export function normalizeLicenseKey(input: string): string | null {
  let s = String(input ?? "")
    .toUpperCase()
    .replace(/[\s\-.]/g, "");
  if (s.startsWith(C.KEY_PREFIX) && s.length > BODY_LENGTH) s = s.slice(C.KEY_PREFIX.length);
  if (s.length !== BODY_LENGTH) return null;
  for (const ch of s) if (!C.KEY_ALPHABET.includes(ch)) return null;
  return `${C.KEY_PREFIX}-${groups(s)}`;
}

/** Formatiert beim Tippen/Einfügen: Großbuchstaben, Gruppen mit Bindestrich, Schlüsselteil höchstens 19 Zeichen. */
export function formatKeyInput(input: string): string {
  const clean = String(input ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (clean.startsWith(C.KEY_PREFIX) && clean.length !== BODY_LENGTH) {
    const body = clean.slice(C.KEY_PREFIX.length, C.KEY_PREFIX.length + BODY_LENGTH);
    return body ? `${C.KEY_PREFIX}-${groups(body)}` : C.KEY_PREFIX;
  }
  return groups(clean.slice(0, BODY_LENGTH));
}

/** AZV-••••-••••-••••-XXXX */
export function maskLicenseKey(key: string | null): string {
  if (!key) return "–";
  return `${C.KEY_PREFIX}-••••-••••-••••-${key.slice(-4)}`;
}

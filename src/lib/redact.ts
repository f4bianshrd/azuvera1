/**
 * Schwärzt Lizenzschlüssel (AZV-…) und JWT-artige Texte (Leases, Tokens), bevor
 * Fehlertexte geloggt oder an Fehlerberichte gegeben werden.
 */
const LICENSE_KEY =
  /\bAZV[-\s.]?[A-Z0-9]{4}[-\s.]?[A-Z0-9]{4}[-\s.]?[A-Z0-9]{4}[-\s.]?[A-Z0-9]{4}\b/gi;
const JWT_LIKE = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{10,}/g;

export function redactSecrets(text: string): string {
  if (!text) return text;
  return text.replace(JWT_LIKE, "[geschwärzt]").replace(LICENSE_KEY, "AZV-[geschwärzt]");
}

/** Fester Stand der Datenschutzerklärung (bei inhaltlichen Änderungen anpassen). */
export const PRIVACY_UPDATED_AT = "12. November 2026";

/** Startwerte, falls die öffentlichen Einstellungen nicht geladen werden können. */
export const PRIVACY_TEXT_DEFAULTS = {
  hostingLocation: "innerhalb der EU",
  aiProvider: "einen KI-Modellanbieter (über das KI-Gateway von Lovable)",
  emailProvider: "den von Azuvera beauftragten E-Mail-Dienstleister",
} as const;

export interface PrivacyTexts {
  hostingLocation: string;
  aiProvider: string;
  emailProvider: string;
}

export const PROVIDER_TEXT_MIN = 3;
export const PROVIDER_TEXT_MAX = 200;

/** Anbieter-Texte sind Pflicht und 3 bis 200 Zeichen lang (nach Trimmen). */
export function validProviderText(value: string): boolean {
  const len = value.trim().length;
  return len >= PROVIDER_TEXT_MIN && len <= PROVIDER_TEXT_MAX;
}

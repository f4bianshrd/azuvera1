/**
 * Lizenzprüfung der nativen Apps (iPhone, iPad, Mac). Die Web-App nutzt nichts davon.
 * Hier steht nur der ÖFFENTLICHE Schlüssel der Website – nie ein privater Schlüssel oder Secret.
 */
export const NATIVE_LICENSE = {
  // Ohne "www": www.azuvera.de leitet um (307), und Browser/WebViews brechen Vorab-Anfragen (CORS) bei Umleitungen ab.
  LICENSE_API_BASE: "https://azuvera.de/api/public/license",
  /** kid → öffentlicher Schlüssel (JWK, nur kty/crv/x/y/kid). Schlüsselwechsel: alten und neuen gleichzeitig eintragen. */
  LICENSE_PUBLIC_KEYS: {
    "az-lic-1": {
      kty: "EC",
      crv: "P-256",
      x: "i9ajK3260AzetbPI--4bTuD55H8JJAgQs3HAdCfz0bs",
      y: "PMQIdfcmGwcRuGd0g-4YD_22RW9OuoagGXiy_F0_GnQ",
      kid: "az-lic-1",
    },
  } as Record<string, { kty: string; crv: string; x: string; y: string; kid: string }>,
  ISSUER: "https://www.azuvera.de",
  AUDIENCE: "azuvera-native",
  KEY_PREFIX: "AZV",
  KEY_ALPHABET: "ABCDEFGHJKMNPQRSTUVWXYZ23456789",
  KEY_GROUPS: 4,
  KEY_GROUP_LENGTH: 4,
  CHECK_EVERY_HOURS: 12,
  RETRY_AFTER_MINUTES: 10,
  REQUEST_TIMEOUT_MS: 15000,
  LEASE_WARN_HOURS: 24,
  EXPIRY_NOTICE_DAYS: 14,
  CLOCK_TOLERANCE_MINUTES: 10,
  /** Bei jeder nativen Version erhöhen (höchstens 30 Zeichen). */
  APP_VERSION: "1.0.0",
  /** Verlinkt die App auf die Preisseite? Für den App Store ggf. abschalten. */
  SHOW_PURCHASE_LINKS: true,
  ACCOUNT_URL: "https://www.azuvera.de/konto",
  PRICES_URL: "https://www.azuvera.de/preise",
  CONTACT_URL: "https://www.azuvera.de/kontakt",
  WEB_APP_URL: "https://get.azuvera.de",
} as const;

export type LicensePublicKeys = Record<
  string,
  { kty: string; crv: string; x: string; y: string; kid: string }
>;

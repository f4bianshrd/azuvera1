import { supabase } from "@/integrations/supabase/client";
import { PRIVACY_TEXT_DEFAULTS, type PrivacyTexts } from "@/lib/legal";

const KEYS = {
  hostingLocation: "hosting_location_text",
  aiProvider: "ai_provider_text",
  emailProvider: "email_provider_text",
} as const;

const str = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v : fallback);

/** Öffentliche Texte der Datenschutzerklärung (auch ohne Anmeldung lesbar). */
export async function fetchPrivacyTexts(): Promise<PrivacyTexts> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", Object.values(KEYS));
  if (error) throw error;
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  return {
    hostingLocation: str(map.get(KEYS.hostingLocation), PRIVACY_TEXT_DEFAULTS.hostingLocation),
    aiProvider: str(map.get(KEYS.aiProvider), PRIVACY_TEXT_DEFAULTS.aiProvider),
    emailProvider: str(map.get(KEYS.emailProvider), PRIVACY_TEXT_DEFAULTS.emailProvider),
  };
}

/** Speichern nur für die Ausbildungsleitung (RLS auf app_settings). */
export async function savePrivacyTexts(texts: PrivacyTexts, userId: string | null): Promise<void> {
  const rows = (Object.keys(KEYS) as (keyof typeof KEYS)[]).map((k) => ({
    key: KEYS[k],
    value: texts[k].trim(),
    is_public: true,
    updated_by: userId,
  }));
  const { error } = await supabase.from("app_settings").upsert(rows);
  if (error) throw error;
}

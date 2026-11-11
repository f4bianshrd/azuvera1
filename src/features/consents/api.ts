import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ConsentKind = Database["public"]["Enums"]["consent_kind"];
export type Consent = Database["public"]["Tables"]["consents"]["Row"];

export const DICTATION_TEXT_VERSION = "2026-11";
export const AI_TEXT_VERSION = "2026-11";

export function consentVersion(kind: ConsentKind): string {
  return kind === "dictation" ? DICTATION_TEXT_VERSION : AI_TEXT_VERSION;
}

export async function listMyConsents(): Promise<Consent[]> {
  const { data, error } = await supabase.from("consents").select("*").order("granted_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export function activeConsent(consents: Consent[] | undefined, kind: ConsentKind): Consent | undefined {
  return consents?.find((c) => c.kind === kind && c.revoked_at === null && c.text_version === consentVersion(kind));
}

export async function grantConsent(kind: ConsentKind): Promise<void> {
  const { error } = await supabase.rpc("grant_consent", { _kind: kind, _text_version: consentVersion(kind) });
  if (error) throw error;
}

export async function revokeConsent(kind: ConsentKind): Promise<void> {
  const { error } = await supabase.rpc("revoke_consent", { _kind: kind });
  if (error) throw error;
}

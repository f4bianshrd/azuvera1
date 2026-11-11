import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

export type SocialProvider = "google" | "apple" | "microsoft";
const PENDING_KEY = "azuvera-oauth-pending";
const TARGET_KEY = "azuvera-auth-target";

export async function signInWithProvider(provider: SocialProvider): Promise<{ error?: Error | null | undefined; redirected?: boolean | undefined }> {
  try {
    sessionStorage.setItem(PENDING_KEY, "1");
  } catch { /* optionale Zielspeicherung */ }
  return lovable.auth.signInWithOAuth(provider, { redirect_uri: `${window.location.origin}/auth` });
}

export function rememberAuthTarget(target: string): void {
  try { sessionStorage.setItem(TARGET_KEY, target); } catch { /* optionale Zielspeicherung */ }
}

export async function finishProviderSignIn(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return false;
  try { sessionStorage.removeItem(PENDING_KEY); sessionStorage.removeItem(TARGET_KEY); } catch { /* optional */ }
  return true;
}

export function pendingProviderSignIn(): boolean {
  try { return sessionStorage.getItem(PENDING_KEY) === "1"; } catch { return false; }
}

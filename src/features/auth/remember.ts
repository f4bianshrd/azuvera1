/**
 * „Angemeldet bleiben“: Die Sitzung liegt immer im Gerätespeicher. Ohne Haken merken wir uns nur
 * für diesen Browser-Tab, dass die Anmeldung gültig ist – nach dem Schließen des Browsers wird
 * beim nächsten Start lokal abgemeldet. Neuladen behält die Anmeldung in beiden Fällen.
 */
import { supabase } from "@/integrations/supabase/client";

const REMEMBER_KEY = "azuvera-remember";
const TAB_KEY = "azuvera-tab-session";

export function setRememberChoice(remember: boolean): void {
  try {
    localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
    sessionStorage.setItem(TAB_KEY, "1");
  } catch { /* Speicher nicht verfügbar – Standard bleibt „angemeldet bleiben“ */ }
}

export function rememberChoice(): boolean {
  try { return localStorage.getItem(REMEMBER_KEY) !== "0"; } catch { return true; }
}

/** Muss die gespeicherte Sitzung verworfen werden (Haken war aus und der Browser wurde geschlossen)? */
export function sessionExpiredByChoice(): boolean {
  try { return localStorage.getItem(REMEMBER_KEY) === "0" && sessionStorage.getItem(TAB_KEY) !== "1"; } catch { return false; }
}

/** Liest die gespeicherte Sitzung und beachtet dabei „Angemeldet bleiben“. */
export async function currentSession() {
  if (sessionExpiredByChoice()) {
    await supabase.auth.signOut({ scope: "local" });
    try { localStorage.removeItem(REMEMBER_KEY); } catch { /* optional */ }
    return null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session;
}

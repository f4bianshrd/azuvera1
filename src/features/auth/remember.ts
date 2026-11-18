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
  // Ohne Netz nicht auf die Anmeldung warten: getSession würde eine abgelaufene Anmeldung bis zu
  // 30 Sekunden lang erneuern wollen (weißer Bildschirm). Die gespeicherte Anmeldung reicht offline.
  if (deviceOffline()) {
    const stored = await storedSession();
    if (stored) return stored;
  }
  const { data, error } = await supabase.auth.getSession();
  if (data.session) return data.session;
  // Offline mit abgelaufenem Zugangsschlüssel: Die Anmeldung kann gerade nicht erneuert werden,
  // liegt aber noch auf dem Gerät. Dann damit weiterarbeiten – erneuert wird, sobald wieder Netz da ist.
  if (error && isNetworkProblem(error)) return storedSession();
  return null;
}

type StoredSession = NonNullable<Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]>;

function deviceOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function isNetworkProblem(error: { name?: string | undefined; status?: number | undefined; message?: string | undefined }): boolean {
  if (deviceOffline()) return true;
  return error.name === "AuthRetryableFetchError" || error.status === 0 || /fetch|network/i.test(error.message ?? "");
}

/** Liest die zuletzt gespeicherte Sitzung direkt aus dem Gerätespeicher (ohne Netz). */
async function storedSession(): Promise<StoredSession | null> {
  const auth = supabase.auth as unknown as { storageKey?: string; storage?: { getItem: (k: string) => string | null | Promise<string | null> } };
  if (!auth.storageKey || !auth.storage) return null;
  try {
    const raw = await auth.storage.getItem(auth.storageKey);
    return parseStoredSession(raw);
  } catch {
    return null;
  }
}

export function parseStoredSession(raw: string | null): StoredSession | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<StoredSession>;
    if (!s || typeof s.refresh_token !== "string" || !s.refresh_token || !s.user?.id) return null;
    return s as StoredSession;
  } catch {
    return null;
  }
}

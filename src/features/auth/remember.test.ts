import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signOut: vi.fn(), getSession: vi.fn(), storageKey: "sb-test-auth-token", storage: { getItem: (k: string) => store.get(k) ?? null } } },
}));

import { supabase } from "@/integrations/supabase/client";
import { currentSession, rememberChoice, sessionExpiredByChoice, setRememberChoice } from "./remember";

describe("Angemeldet bleiben", () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it("bleibt ohne Auswahl angemeldet (Standard)", () => {
    expect(rememberChoice()).toBe(true);
    expect(sessionExpiredByChoice()).toBe(false);
  });

  it("bleibt mit Haken auch nach Schließen des Browsers angemeldet", () => {
    setRememberChoice(true);
    sessionStorage.clear(); // Browser geschlossen
    expect(sessionExpiredByChoice()).toBe(false);
  });

  it("bleibt ohne Haken beim Neuladen angemeldet", () => {
    setRememberChoice(false);
    expect(sessionExpiredByChoice()).toBe(false);
  });

  it("meldet ohne Haken nach Schließen des Browsers ab", () => {
    setRememberChoice(false);
    sessionStorage.clear();
    expect(sessionExpiredByChoice()).toBe(true);
  });
});

describe("Offline angemeldet bleiben", () => {
  const saved = { access_token: "a", refresh_token: "r", expires_at: 1, user: { id: "u1" } };
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); store.clear(); store.set("sb-test-auth-token", JSON.stringify(saved)); });

  it("nutzt die gespeicherte Anmeldung, wenn sie offline nicht erneuert werden kann", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: { name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" } } as never);
    const s = await currentSession();
    expect(s?.user.id).toBe("u1");
  });

  it("meldet ab, wenn die Anmeldung online abgelehnt wird", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: { name: "AuthApiError", status: 400, message: "Invalid Refresh Token" } } as never);
    expect(await currentSession()).toBeNull();
  });
});

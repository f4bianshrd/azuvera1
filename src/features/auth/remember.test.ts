import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut: vi.fn(), getSession: vi.fn() } } }));

import { rememberChoice, sessionExpiredByChoice, setRememberChoice } from "./remember";

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

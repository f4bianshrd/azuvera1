import { describe, expect, it } from "vitest";
import {
  ALL_SCOPES, CODE_ALPHABET, formatTicketCode, generateTicketCode, hashTicketCode, isValidTicketCode,
  normalizeTicketCode, remainingLabel, SUPPORT_SCOPES,
} from "./scopes";

describe("Support-Ticket-Code", () => {
  it("hat 16 Zeichen ohne I, O, 0 und 1", () => {
    for (let i = 0; i < 200; i++) {
      const c = generateTicketCode();
      expect(c).toHaveLength(16);
      expect(c).not.toMatch(/[IO01]/);
      expect([...c].every((x) => CODE_ALPHABET.includes(x))).toBe(true);
    }
  });

  it("wird in 4er-Gruppen angezeigt", () => {
    expect(formatTicketCode("ABCDEFGHJKLMNPQR")).toBe("ABCD-EFGH-JKLM-NPQR");
  });

  it("ignoriert Bindestriche, Leerzeichen und Kleinschreibung beim Einlösen", () => {
    expect(normalizeTicketCode(" abcd-efgh jklm-npqr ")).toBe("ABCDEFGHJKLMNPQR");
    expect(isValidTicketCode("abcd-efgh-jklm-npqr")).toBe(true);
    expect(isValidTicketCode("ABCD-EFGH-JKLM-NPQ")).toBe(false);
    expect(isValidTicketCode("ABCD-EFGH-JKLM-NPQ0")).toBe(false);
  });

  it("speichert nur den SHA-256 des normalisierten Codes", async () => {
    const a = await hashTicketCode("abcd-efgh-jklm-npqr");
    const b = await hashTicketCode("ABCDEFGHJKLMNPQR");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("ABCD");
  });
});

describe("Support-Freigaben", () => {
  it("enthält genau die sieben Freigaben aus der Datenbank", () => {
    expect(ALL_SCOPES).toEqual(expect.arrayContaining([
      "profil_bearbeiten", "berichte_bearbeiten", "berichte_loeschen", "ausbildung_bearbeiten",
      "anhaenge_verwalten", "team_verwalten", "email_aendern",
    ]));
    expect(ALL_SCOPES).toHaveLength(7);
  });

  it("E-Mail ändern gibt es nur per Ticket", () => {
    expect(SUPPORT_SCOPES.filter((s) => s.ticketOnly).map((s) => s.key)).toEqual(["email_aendern"]);
  });
});

describe("Restzeit-Anzeige", () => {
  it("zeigt mm:ss und nie negative Zeit", () => {
    const now = Date.parse("2026-01-01T10:00:00Z");
    expect(remainingLabel("2026-01-01T10:29:05Z", now)).toBe("29:05");
    expect(remainingLabel("2026-01-01T09:00:00Z", now)).toBe("00:00");
  });
});

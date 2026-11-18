// @vitest-environment node
import { describe, expect, it } from "vitest";
import { evaluate } from "./state";
import { parseTime, raiseHighWater, errorText } from "./util";
import { claims, makeKeyPair, signLease } from "./test-helpers";
import type { StoredLicense } from "./types";

const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
const H = 3_600_000;
const S = Math.floor(NOW / 1000);
const DID = "device-abcdef0123456789";

function stored(over: Partial<StoredLicense> = {}): StoredLicense {
  return {
    licenseKey: "AZV-ABCD-EFGH-JKMN-PQRS",
    deviceId: DID,
    deviceName: "iPhone",
    lease: null,
    planLabel: "Azubi Monat",
    deviceLimit: 2,
    devicesUsed: 1,
    accessUntil: null,
    status: "active",
    lastCheckOkAt: NOW - H,
    lastAttemptAt: NOW - H,
    blockedReason: null,
    highWater: NOW,
    ...over,
  };
}

const { privateKey, keys, kid } = await makeKeyPair();

describe("evaluate", () => {
  const lease = (over: Record<string, unknown> = {}) =>
    signLease(claims(NOW, over), privateKey, kid);
  const ev = (
    s: StoredLicense | null,
    o: { now?: number; cryptoOk?: boolean; keys?: typeof keys } = {},
  ) =>
    evaluate({ stored: s, now: o.now ?? NOW, keys: o.keys ?? keys, cryptoOk: o.cryptoOk ?? true });

  const cases: Array<
    [
      string,
      () => Promise<StoredLicense | null>,
      { now?: number; cryptoOk?: boolean; empty?: boolean },
      string,
      string | null,
    ]
  > = [
    ["nichts gespeichert", async () => null, {}, "none", null],
    ["kein Schlüssel gespeichert", async () => stored({ licenseKey: null }), {}, "none", null],
    ["gültiges Lease", async () => stored({ lease: await lease() }), {}, "active", null],
    ["Server: beendet", async () => stored({ blockedReason: "ended" }), {}, "locked", "ended"],
    [
      "Server: erstattet",
      async () => stored({ blockedReason: "refunded" }),
      {},
      "locked",
      "refunded",
    ],
    ["Server: gesperrt", async () => stored({ blockedReason: "revoked" }), {}, "locked", "revoked"],
    ["Server: Zahlung", async () => stored({ blockedReason: "payment" }), {}, "locked", "payment"],
    [
      "Lease abgelaufen",
      async () => stored({ lease: await lease({ exp: S - 1 }) }),
      {},
      "locked",
      "lease_expired",
    ],
    ["kein Lease", async () => stored({ lease: null }), {}, "locked", "lease_expired"],
    [
      "Uhr 11 min hinter highWater",
      async () => stored({ lease: await lease(), highWater: NOW + 11 * 60_000 }),
      {},
      "locked",
      "clock",
    ],
    [
      "Uhr 9 min hinter highWater ist ok",
      async () => stored({ lease: await lease(), highWater: NOW + 9 * 60_000 }),
      {},
      "active",
      null,
    ],
    [
      "iat in der Zukunft",
      async () => stored({ lease: await lease({ iat: S + 3600 }) }),
      {},
      "locked",
      "clock",
    ],
    [
      "fremdes Gerät",
      async () => stored({ lease: await lease({ did: "anderes-geraet-0000" }) }),
      {},
      "locked",
      "invalid",
    ],
    [
      "Schlüssel leer",
      async () => stored({ lease: await lease() }),
      { empty: true },
      "locked",
      "setup",
    ],
    [
      "crypto fehlt",
      async () => stored({ lease: await lease() }),
      { cryptoOk: false },
      "locked",
      "setup",
    ],
    [
      "Zugriff (au) vorbei",
      async () => stored({ lease: await lease({ au: S - 10 }) }),
      {},
      "locked",
      "ended",
    ],
    [
      "Zugriff (au) vorbei bei Zahlungsverzug",
      async () => stored({ lease: await lease({ au: S - 10, st: "past_due" }) }),
      {},
      "locked",
      "payment",
    ],
  ];
  for (const [name, mk, opt, phase, reason] of cases) {
    it(name, async () => {
      const r = await ev(await mk(), { ...opt, keys: opt.empty ? {} : keys });
      expect(r.phase).toBe(phase);
      expect(r.reason).toBe(reason);
    });
  }

  it("Warnung lease_soon unter 24 h, nicht darüber", async () => {
    expect((await ev(stored({ lease: await lease({ exp: S + 23 * 3600 }) }))).warnings).toContain(
      "lease_soon",
    );
    expect(
      (await ev(stored({ lease: await lease({ exp: S + 25 * 3600 }) }))).warnings,
    ).not.toContain("lease_soon");
  });
  it("Warnung past_due", async () => {
    expect((await ev(stored({ lease: await lease({ st: "past_due" }) }))).warnings).toContain(
      "past_due",
    );
  });
  it("Warnung ends_soon bei höchstens 14 Tagen", async () => {
    expect((await ev(stored({ lease: await lease({ au: S + 14 * 86400 }) }))).warnings).toContain(
      "ends_soon",
    );
    expect(
      (await ev(stored({ lease: await lease({ au: S + 15 * 86400 }) }))).warnings,
    ).not.toContain("ends_soon");
  });
  it("nächste Prüfung 12 h nach letzter erfolgreicher", async () => {
    expect((await ev(stored({ lease: await lease() }))).nextCheckAt).toBe(NOW - H + 12 * H);
  });
  it("nach Fehlversuch frühestens 10 min später", async () => {
    const r = await ev(
      stored({ lease: await lease(), lastCheckOkAt: NOW - 13 * H, lastAttemptAt: NOW - 60_000 }),
    );
    expect(r.nextCheckAt).toBe(NOW - 60_000 + 10 * 60_000);
  });
  it("nie geprüft: sofort", async () => {
    expect(
      (await ev(stored({ lease: await lease(), lastCheckOkAt: null, lastAttemptAt: null })))
        .nextCheckAt,
    ).toBe(NOW);
  });
});

describe("Hilfen", () => {
  it("parseTime", () => {
    expect(parseTime("2026-11-18T12:00:00Z")).toBe(NOW);
    expect(parseTime(S)).toBe(S * 1000);
    expect(parseTime(NOW)).toBe(NOW);
    expect(parseTime(String(S))).toBe(S * 1000);
    expect(parseTime(null)).toBeNull();
    expect(parseTime("kein datum")).toBeNull();
  });
  it("raiseHighWater nimmt das Maximum", () => {
    expect(raiseHighWater(NOW, NOW - 1000, null)).toBe(NOW);
    expect(raiseHighWater(NOW - 5000, NOW, NOW + 3000)).toBe(NOW + 3000);
    expect(raiseHighWater(null, NOW)).toBe(NOW);
  });
  it("errorText", () => {
    expect(errorText("invalid_key")).toBe(
      "Diesen Schlüssel kennen wir nicht. Prüfe die Schreibweise.",
    );
    expect(errorText("no_access", "refunded")).toBe("Dieser Kauf wurde erstattet.");
    expect(errorText("internal")).toBe(
      "Das hat gerade nicht geklappt. Versuche es später noch einmal.",
    );
  });
});

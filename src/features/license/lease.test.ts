// @vitest-environment node
import { describe, expect, it } from "vitest";
import { verifyLease } from "./lease";
import { b64urlJson, claims, makeKeyPair, signLease } from "./test-helpers";

const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
const DID = "device-abcdef0123456789";

const { privateKey, keys, kid } = await makeKeyPair();
const other = await makeKeyPair();

describe("verifyLease", () => {
  const run = (t: string) => verifyLease(t, { keys, deviceId: DID, now: NOW });

  it("gültig", async () => {
    const r = await run(await signLease(claims(NOW), privateKey, kid));
    expect(r.ok).toBe(true);
  });
  it("manipulierte Nutzlast", async () => {
    const [h, , s] = (await signLease(claims(NOW), privateKey, kid)).split(".");
    expect(await run(`${h}.${b64urlJson(claims(NOW, { lim: 99 }))}.${s}`)).toEqual({
      ok: false,
      reason: "signature",
    });
  });
  it("manipulierte Signatur", async () => {
    const t = await signLease(claims(NOW), privateKey, kid);
    const last = t.at(-2) === "A" ? "B" : "A";
    expect(await run(t.slice(0, -2) + last + t.at(-1))).toEqual({ ok: false, reason: "signature" });
  });
  it("falscher Schlüssel", async () => {
    expect(await run(await signLease(claims(NOW), other.privateKey, kid))).toEqual({
      ok: false,
      reason: "signature",
    });
  });
  it("unbekanntes kid", async () => {
    expect(await run(await signLease(claims(NOW), privateKey, "fremd"))).toEqual({
      ok: false,
      reason: "kid",
    });
  });
  it("abgelaufen", async () => {
    const s = Math.floor(NOW / 1000);
    expect(await run(await signLease(claims(NOW, { exp: s - 1 }), privateKey, kid))).toEqual({
      ok: false,
      reason: "expired",
    });
  });
  it("falsche Geräte-Kennung", async () => {
    expect(
      await run(await signLease(claims(NOW, { did: "anderes-geraet-0000" }), privateKey, kid)),
    ).toEqual({ ok: false, reason: "device" });
  });
  it("falsche Zielgruppe", async () => {
    expect(await run(await signLease(claims(NOW, { aud: "andere-app" }), privateKey, kid))).toEqual(
      { ok: false, reason: "audience" },
    );
  });
  it("falscher Aussteller", async () => {
    expect(
      await run(await signLease(claims(NOW, { iss: "https://example.com" }), privateKey, kid)),
    ).toEqual({ ok: false, reason: "issuer" });
  });
  it("falsche Version", async () => {
    expect(await run(await signLease(claims(NOW, { ver: 2 }), privateKey, kid))).toEqual({
      ok: false,
      reason: "version",
    });
  });
  it("iat in der Zukunft", async () => {
    const s = Math.floor(NOW / 1000);
    expect(await run(await signLease(claims(NOW, { iat: s + 11 * 60 }), privateKey, kid))).toEqual({
      ok: false,
      reason: "not_yet",
    });
  });
  it("iat knapp in der Zukunft (innerhalb Toleranz) ist ok", async () => {
    const s = Math.floor(NOW / 1000);
    expect((await run(await signLease(claims(NOW, { iat: s + 9 * 60 }), privateKey, kid))).ok).toBe(
      true,
    );
  });
  it("falscher Algorithmus", async () => {
    expect(await run(await signLease(claims(NOW), privateKey, kid, { alg: "HS256" }))).toEqual({
      ok: false,
      reason: "format",
    });
  });
  it("kaputtes Format", async () => {
    expect(await run("abc.def")).toEqual({ ok: false, reason: "format" });
    expect(await run("a.b.c.d")).toEqual({ ok: false, reason: "format" });
    expect(await run("ab$.cd.ef")).toEqual({ ok: false, reason: "format" });
    expect(await run("")).toEqual({ ok: false, reason: "format" });
  });
});

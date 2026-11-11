import { describe, expect, it } from "vitest";
import { backoffDelayMs, coalesce, mayUseNetworkFor, readyHeads } from "./rules";
import type { OutboxEntry } from "./db";

const entry = (p: Partial<OutboxEntry>): OutboxEntry => ({ id: 1, record: "report:a", op: "report.upsert", payload: {}, title: "", status: "waiting", attempts: 0, next_at: 0, created_at: 0, ...p });

describe("Sync-Regeln", () => {
  it("wartet 5 s, 15 s, 1 min, 5 min und danach alle 15 min", () => {
    expect([1, 2, 3, 4, 5, 9].map(backoffDelayMs)).toEqual([5_000, 15_000, 60_000, 300_000, 900_000, 900_000]);
  });
  it("fasst wartende Änderungen am selben Bericht zusammen", () => {
    const r = coalesce([entry({ id: 1 })], { ...entry({ payload: { x: 2 } }), id: undefined } as never);
    expect(r.update?.id).toBe(1);
    expect(r.insert).toBeUndefined();
  });
  it("hängt nach einem Einreichen keinen Speicherstand an einen früheren Eintrag", () => {
    const r = coalesce([entry({ id: 1 }), entry({ id: 2, op: "report.submit" })], ({ ...entry({}), id: undefined }) as never);
    expect(r.insert).toBeDefined();
  });
  it("sendet je Datensatz strikt der Reihe nach, ein Fehler blockiert nur denselben Datensatz", () => {
    const heads = readyHeads([
      entry({ id: 1, record: "report:a", status: "failed" }),
      entry({ id: 2, record: "report:a", op: "report.submit" }),
      entry({ id: 3, record: "absence:b", op: "absence.upsert" }),
    ], 10, () => true);
    expect(heads.map((h) => h.id)).toEqual([3]);
  });
  it("lädt Fotos nur im WLAN, wenn die Verbindungsart bekannt ist", () => {
    const prefs = { wifiOnly: false, photosWifiOnly: true };
    expect(mayUseNetworkFor("attachment.upload", { online: true, type: "cellular", saveData: false }, prefs)).toBe(false);
    expect(mayUseNetworkFor("attachment.upload", { online: true, type: null, saveData: false }, prefs)).toBe(true);
    expect(mayUseNetworkFor("report.upsert", { online: true, type: "cellular", saveData: false }, prefs)).toBe(true);
  });
  it("„Jetzt synchronisieren“ ignoriert die WLAN-Bedingung, offline wird nie gesendet", () => {
    const prefs = { wifiOnly: true, photosWifiOnly: true };
    expect(mayUseNetworkFor("report.upsert", { online: true, type: "cellular", saveData: false }, prefs)).toBe(false);
    expect(mayUseNetworkFor("report.upsert", { online: true, type: "cellular", saveData: false }, prefs, true)).toBe(true);
    expect(mayUseNetworkFor("report.upsert", { online: false, type: "wifi", saveData: false }, prefs, true)).toBe(false);
  });
});

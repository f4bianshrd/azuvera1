import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: () => undefined } }));

import { openUserDb, deleteUserDb, currentDb } from "./db";
import { enqueue } from "./engine";

describe("Lokaler Speicher und outbox", () => {
  beforeEach(async () => { await deleteUserDb("u1"); await deleteUserDb("u2"); openUserDb("u1"); });

  it("trennt die Datenbanken mehrerer Konten auf einem Gerät", async () => {
    await currentDb()!.meta.put({ key: "x", value: 1 });
    openUserDb("u2");
    expect(await currentDb()!.meta.get("x")).toBeUndefined();
  });

  it("fasst mehrere Speicherstände desselben Berichts zu einem Eintrag zusammen", async () => {
    await enqueue({ record: "report:a", op: "report.upsert", payload: { id: "a" }, title: "Bericht KW 45 speichern" });
    await enqueue({ record: "report:a", op: "report.upsert", payload: { id: "a" }, title: "Bericht KW 45 speichern" });
    expect(await currentDb()!.outbox.count()).toBe(1);
  });

  it("legt Einreichen als eigenen Schritt nach dem Speichern an", async () => {
    await enqueue({ record: "report:a", op: "report.upsert", payload: { id: "a" }, title: "s" });
    await enqueue({ record: "report:a", op: "report.submit", payload: { id: "a" }, title: "e" });
    await enqueue({ record: "report:a", op: "report.upsert", payload: { id: "a" }, title: "s" });
    expect((await currentDb()!.outbox.orderBy("id").toArray()).map((e) => e.op)).toEqual(["report.upsert", "report.submit", "report.upsert"]);
  });

  it("löscht beim Abmelden die lokale Datenbank", async () => {
    await currentDb()!.meta.put({ key: "x", value: 1 });
    await deleteUserDb("u1");
    expect(currentDb()).toBeNull();
    expect(await openUserDb("u1").meta.get("x")).toBeUndefined();
  });
});

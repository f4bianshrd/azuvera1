// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sniffType } from "./attachments";

const bytes = (...parts: (number[] | string)[]) =>
  new Blob(parts.map((p) => (typeof p === "string" ? new TextEncoder().encode(p) : new Uint8Array(p))));

describe("sniffType PDF", () => {
  it("erkennt PDF mit %PDF am Anfang", async () => {
    expect(await sniffType(bytes("%PDF-1.7\n..."))).toBe("application/pdf");
  });
  it("erkennt PDF mit Vorspann vor %PDF (innerhalb 1024 Bytes)", async () => {
    expect(await sniffType(bytes(new Array(300).fill(0x20), "%PDF-1.4\n"))).toBe("application/pdf");
  });
  it("lehnt Dateien ab, deren %PDF erst nach 1024 Bytes kommt", async () => {
    expect(await sniffType(bytes(new Array(1100).fill(0x41), "%PDF-1.4"))).toBeNull();
  });
});

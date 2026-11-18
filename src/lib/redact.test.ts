import { describe, expect, it } from "vitest";
import { redactSecrets } from "./redact";

describe("redactSecrets", () => {
  it("schwärzt Lizenzschlüssel", () => {
    expect(redactSecrets("Fehler bei AZV-ABCD-EFGH-JKMN-PQRS")).toBe("Fehler bei AZV-[geschwärzt]");
  });
  it("schwärzt Leases/JWT", () => {
    const out = redactSecrets(
      "lease=eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJsaWNfMSJ9.abcdefghijklmnopqrstuvwxyz",
    );
    expect(out).toBe("lease=[geschwärzt]");
  });
  it("lässt normale Texte stehen", () =>
    expect(redactSecrets("Netzwerkfehler 500")).toBe("Netzwerkfehler 500"));
});

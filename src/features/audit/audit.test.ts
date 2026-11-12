import { describe, expect, it } from "vitest";
import { buildAuditCsv, csvCell } from "./csv";
import { describeEntry, formatAuditTime, matchesHistoryFilter, type AuditEntry } from "./labels";
import { wordDiff } from "./diff";

const entry = (p: Partial<AuditEntry>): AuditEntry => ({
  id: 1, created_at: "2026-11-09T13:32:00Z", actor_id: null, actor_role: null, azubi_id: null,
  entity_type: "report", entity_id: "r1", action: "submit", details: {}, row_hash: "abc", ...p,
});

describe("Verlauf-Texte", () => {
  it("Einreichen zeigt Version und 12 Zeichen der Prüfsumme", () => {
    const d = describeEntry({ action: "submit", details: { version: 4, content_hash: "86b4e6d892a1a0aeb5499a44" } });
    expect(d.title).toBe("Eingereicht (Version 4)");
    expect(d.details).toEqual(["Prüfsumme 86b4e6d892a1"]);
  });
  it("Bearbeiten nennt die Abschnitte auf Deutsch", () => {
    const d = describeEntry({ action: "edit", details: { version: 2, fields: ["activities", "school_content", "report_date"] } });
    expect(d.details[0]).toBe("Abschnitte: Tätigkeiten, Berufsschule, Datum");
  });
  it("Freigabe in Vertretung nennt die vertretene Person", () => {
    const d = describeEntry({ action: "approve", details: { version: 3, method: "click", on_behalf_of: "p1", content_hash: "004abb4d3cc0891a" } }, new Map([["p1", "Anna Muster"]]));
    expect(d.title).toBe("Freigegeben (Version 3)");
    expect(d.details).toEqual(["Methode: Klick-Bestätigung", "i. V. für Anna Muster", "Prüfsumme 004abb4d3cc0"]);
  });
  it("Anhang zeigt Art und Größe", () => {
    expect(describeEntry({ action: "attachment_add", details: { mime_type: "image/webp", size_bytes: 204800 } }).title).toBe("Anhang hinzugefügt (Bild, 200 KB)");
    expect(describeEntry({ action: "attachment_add", details: { mime_type: "application/pdf", size_bytes: 2_097_152 } }).title).toBe("Anhang hinzugefügt (PDF, 2,0 MB)");
  });
  it("unbekannte Aktionen zeigen den Rohwert", () => {
    expect(describeEntry({ action: "foo_bar", details: {} }).title).toBe("foo_bar");
  });
  it("Zeit in Berliner Zeit", () => {
    expect(formatAuditTime("2026-11-09T13:32:00Z")).toBe("09.11.2026, 14:32 Uhr");
  });
  it("Filter-Chips gruppieren Aktionen", () => {
    expect(matchesHistoryFilter("reopen", "status")).toBe(true);
    expect(matchesHistoryFilter("edit", "status")).toBe(false);
    expect(matchesHistoryFilter("ai_assist", "changes")).toBe(true);
    expect(matchesHistoryFilter("comment", "comments")).toBe(true);
    expect(matchesHistoryFilter("comment", "all")).toBe(true);
  });
});

describe("CSV-Export", () => {
  it("maskiert Formelzeichen mit vorangestelltem Apostroph", () => {
    expect(csvCell("=SUMME(A1)")).toBe("'=SUMME(A1)");
    expect(csvCell("+49")).toBe("'+49");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@x")).toBe("'@x");
    expect(csvCell("a;b")).toBe('"a;b"');
  });
  it("UTF-8 mit BOM, Semikolon, Kopfzeile in vorgegebener Reihenfolge", () => {
    const csv = buildAuditCsv([entry({ actor_id: "u1", actor_role: "ausbilder", details: { version: 2, content_hash: "ffffffffffff00" } })], new Map([["u1", "=Hacker"]]));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [head, row] = csv.slice(1).split("\r\n");
    expect(head).toBe("Zeit (UTC, ISO 8601);Zeit (Europe/Berlin);Wer;Rolle;Aktion;Objekt;Objekt-ID;Einzelheiten;row_hash");
    expect(row).toBe("2026-11-09T13:32:00.000Z;2026-11-09 14:32:00;'=Hacker;Ausbilder:in;Eingereicht (Version 2);Bericht;r1;Prüfsumme ffffffffffff;abc");
  });
});

describe("Wortvergleich", () => {
  it("markiert hinzugefügte und entfernte Wörter", () => {
    const parts = wordDiff("Lager inventarisiert", "Lager gründlich inventarisiert");
    expect(parts.filter((p) => p.kind === "added").map((p) => p.value.trim())).toEqual(["gründlich"]);
    expect(parts.some((p) => p.kind === "removed")).toBe(false);
  });
});

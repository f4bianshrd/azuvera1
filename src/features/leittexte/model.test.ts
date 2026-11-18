import { describe, expect, it } from "vitest";
import { answerText, normalizeTable, progress, type LeittextContent } from "./model";

const content: LeittextContent = {
  sections: [{
    title: "A", tasks: [
      { key: "t1", number: "1", prompt: "Beschreiben", fields: [{ key: "a", type: "longtext" }] },
      { key: "t2", number: "2", prompt: "Skizze", fields: [{ key: "b", type: "image" }] },
      { key: "t3", number: "3", prompt: "Nur Info", fields: [{ key: "c", type: "info", text: "x" }] },
      { key: "t4", number: "4", prompt: "Tabelle", fields: [{ key: "d", type: "table", columns: ["", "Wert"], rows: ["Länge", "Breite"] }] },
    ],
  }],
};

describe("Leittext-Fortschritt", () => {
  it("zählt nur Aufgaben mit Eingabefeldern", () => {
    expect(progress(content, {}).total).toBe(3);
  });
  it("zählt Text, Bild und Tabelle als bearbeitet", () => {
    const p = progress(content, { "t1.a": "Etwas", "t4.d": [["5"], [""]] }, { "t2.b": 1 });
    expect(p).toEqual({ done: 3, total: 3, percent: 100 });
  });
  it("Leerzeichen gelten nicht als Antwort", () => {
    expect(progress(content, { "t1.a": "   " }).done).toBe(0);
  });
});

describe("Tabellen", () => {
  it("feste Zeilen behalten ihre Anzahl, erste Spalte ist die Beschriftung", () => {
    const t = normalizeTable({ key: "d", type: "table", columns: ["", "Wert", "Einheit"], rows: ["Länge", "Breite"] }, undefined);
    expect(t).toEqual([["", ""], ["", ""]]);
  });
  it("Antworttext für Ankreuzfelder enthält Sonstiges", () => {
    expect(answerText({ key: "x", type: "checkbox" }, { selected: ["Stroh"], other: "Sand" })).toBe("Stroh, Sand");
  });
});

import { describe, expect, it } from "vitest";
import { certificateRequired, examTermOptions, missingApplicationFields, missingCertificateFields } from "./model";

describe("Ausbildungszeugnis", () => {
  it("qualifiziertes Zeugnis verlangt zusätzlich Verhalten und Leistung", () => {
    expect(certificateRequired("qualifiziert")).toEqual(expect.arrayContaining(["verhalten", "leistung"]));
    expect(certificateRequired("einfach")).not.toContain("verhalten");
    expect(certificateRequired("einfach")).not.toContain("leistung");
  });

  it("einfaches Zeugnis ist mit den Grundangaben vollständig", () => {
    const content = { beruf: "Landwirt/in", betrieb: "Hof Meyer", beginn: "2024-08-01", ende: "2027-07-31", art_ziel: "x", fertigkeiten: "y", ort: "Melle", datum: "2027-07-31", aussteller_name: "A. Meyer" };
    expect(missingCertificateFields("einfach", content)).toEqual([]);
    expect(missingCertificateFields("qualifiziert", content)).toEqual(["verhalten", "leistung"]);
  });
});

describe("Antrag auf Prüfungszulassung", () => {
  const data = { geburtsdatum: "2006-01-01", geburtsort: "Melle", anschrift: "Weg 1", beruf: "Pferdewirt/in", betrieb: "Gestüt", beginn: "2024-08-01", ende: "2027-07-31", zustaendige_stelle: "LWK", berufsschule: "BBS", bestaetigung_richtig: true };

  it("lässt sich mit allen Pflichtangaben und Bestätigung einreichen", () => {
    expect(missingApplicationFields("Sommer 2027", data)).toEqual([]);
  });

  it("verlangt Prüfungstermin und Bestätigung der Richtigkeit", () => {
    expect(missingApplicationFields("", { ...data, bestaetigung_richtig: false })).toEqual(["exam_term", "bestaetigung_richtig"]);
  });

  it("bietet Sommer- und Wintertermine an", () => {
    expect(examTermOptions(new Date("2026-11-18")).slice(0, 2)).toEqual(["Sommer 2026", "Winter 2026/27"]);
  });
});

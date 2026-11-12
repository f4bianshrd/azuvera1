/** ODT-Datei des Ausbildungsplans (OpenDocument Text, ZIP mit fflate; Kennzahlen und Inhalte als Tabellen, ohne Diagramme). */
import { strToU8, zipSync } from "fflate";
import { berlinDateTime } from "@/features/export/pdf/text";
import type { ExportModel } from "./model";

const esc = (s: string) =>
  s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"';

const p = (t: string, style = "P") => `<text:p text:style-name="${style}">${esc(t)}</text:p>`;
const h = (t: string, level = 1) => `<text:h text:style-name="H${level}" text:outline-level="${level}">${esc(t)}</text:h>`;
const cell = (t: string, style = "Cell") => `<table:table-cell table:style-name="TC" office:value-type="string">${p(t, style)}</table:table-cell>`;

let tableNo = 0;
function table(cols: number, header: string[] | null, rows: string[][]): string {
  tableNo++;
  return `<table:table table:name="Tabelle${tableNo}" table:style-name="Tbl"><table:table-column table:number-columns-repeated="${cols}"/>`
    + (header ? `<table:table-header-rows><table:table-row>${header.map((x) => cell(x, "CellHead")).join("")}</table:table-row></table:table-header-rows>` : "")
    + rows.map((r) => `<table:table-row>${r.map((x) => cell(x)).join("")}</table:table-row>`).join("")
    + "</table:table>";
}

export function buildPlanOdt(m: ExportModel): Uint8Array {
  tableNo = 0;
  const body: string[] = [];
  body.push(h("Ausbildungsplan", 1));
  body.push(p(`${m.planTitle}${m.source ? ` · ${m.source}` : ""}`, "Muted"));
  body.push(table(2, null, [["Name", m.personName], ["Beruf", m.profession], ["Betrieb", m.company], ["Auswahl", m.selection], ["Erstellt", berlinDateTime(m.createdAt)]]));
  body.push(h("Kennzahlen", 2));
  body.push(table(3, ["Kennzahl", "Wert", "Hinweis"], m.kpis.map((k) => [k.label, k.value, k.hint])));
  if (m.layout.weeks) {
    body.push(h("Wochenübersicht", 2));
    if (!m.weeks.length) body.push(p("Kein Ausbildungsbeginn hinterlegt – die Wochenübersicht ist nicht verfügbar.", "Muted"));
    for (const w of m.weeks) {
      body.push(h(w.title, 3));
      body.push(p(w.summary, "Muted"));
      if (m.template !== "analysis") body.push(table(2, ["Woche", "Status"], w.weeks.map((x) => [x.label, x.status])));
    }
  }
  if (m.layout.contents) {
    body.push(h("Inhalte", 2));
    if (!m.sections.length) body.push(p("Keine Inhalte in der aktuellen Auswahl.", "Muted"));
    for (const s of m.sections) {
      body.push(h(s.title, 3));
      for (const g of s.groups) {
        body.push(p(g.title, "GroupTitle"));
        const meta = [g.reference, g.weeks_text].filter(Boolean).join(" · ");
        if (meta) body.push(p(meta, "Muted"));
        body.push(table(1 + m.years.length, ["Fertigkeit", ...m.years.map((y) => `${y}. Jahr`)], g.rows.map((r) => [r.label, ...r.cells])));
      }
    }
  }
  if (m.branding.footer.trim()) body.push(p(m.branding.footer.trim(), "Muted"));

  const content = `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NS} office:version="1.3"><office:automatic-styles>`
    + `<style:style style:name="Tbl" style:family="table"><style:table-properties style:width="17cm" table:align="left" fo:margin-bottom="0.3cm"/></style:style>`
    + `<style:style style:name="TC" style:family="table-cell"><style:table-cell-properties fo:padding="0.08cm" fo:border="0.5pt solid #d9dee6"/></style:style>`
    + `</office:automatic-styles><office:body><office:text>${body.join("")}</office:text></office:body></office:document-content>`;

  const primary = /^#[0-9a-f]{6}$/i.test(m.branding.primary) ? m.branding.primary : "#0056c5";
  const styles = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${NS} office:version="1.3"><office:styles>`
    + `<style:default-style style:family="paragraph"><style:text-properties style:font-name="Liberation Sans" fo:font-family="'Liberation Sans', Arial, sans-serif" fo:font-size="10pt" fo:language="de" fo:country="DE"/></style:default-style>`
    + `<style:style style:name="P" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.15cm"/></style:style>`
    + `<style:style style:name="Muted" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.2cm"/><style:text-properties fo:color="#5b6472" fo:font-size="9pt"/></style:style>`
    + `<style:style style:name="Cell" style:family="paragraph"><style:text-properties fo:font-size="9pt"/></style:style>`
    + `<style:style style:name="CellHead" style:family="paragraph"><style:text-properties fo:font-size="9pt" fo:font-weight="bold"/></style:style>`
    + `<style:style style:name="GroupTitle" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.25cm" fo:margin-bottom="0.1cm"/><style:text-properties fo:font-weight="bold"/></style:style>`
    + `<style:style style:name="H1" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.2cm"/><style:text-properties fo:font-size="20pt" fo:font-weight="bold" fo:color="${primary}"/></style:style>`
    + `<style:style style:name="H2" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.4cm" fo:margin-bottom="0.2cm"/><style:text-properties fo:font-size="14pt" fo:font-weight="bold" fo:color="${primary}"/></style:style>`
    + `<style:style style:name="H3" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.3cm" fo:margin-bottom="0.15cm"/><style:text-properties fo:font-size="11.5pt" fo:font-weight="bold"/></style:style>`
    + `</office:styles><office:automatic-styles><style:page-layout style:name="PL"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin="2cm"/></style:page-layout></office:automatic-styles>`
    + `<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="PL"/></office:master-styles></office:document-styles>`;

  const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">`
    + `<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/>`
    + `<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>`
    + `<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/></manifest:manifest>`;

  // mimetype muss als erste Datei unkomprimiert liegen.
  return zipSync({
    mimetype: [strToU8("application/vnd.oasis.opendocument.text"), { level: 0 }],
    "content.xml": strToU8(content),
    "styles.xml": strToU8(styles),
    "META-INF/manifest.xml": strToU8(manifest),
  });
}

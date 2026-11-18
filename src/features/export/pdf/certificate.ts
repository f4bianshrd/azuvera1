/** PDF für Ausbildungszeugnis und Prüfungsantrag – gleiche Bausteine wie die übrigen Exporte (Doc, Briefkopf, Fuß). */
import type { Certificate, ExamApplication } from "@/features/certificates/api";
import {
  APPLICATION_FIELDS, APPLICATION_STATUS_LABEL, CERTIFICATE_KIND_LABEL, CERTIFICATE_STATUS_LABEL, asText, certificateFields, type FieldDef,
} from "@/features/certificates/model";
import { A4, C, CONTENT_BOTTOM, Doc, MARGIN } from "./doc";
import { logo } from "./build";
import { berlinDateTime, dateDe, safeFileName } from "./text";

const W = A4.w - 2 * MARGIN;

export interface CertificatePdfInput { certificate: Certificate; azubiName: string }
export interface ApplicationPdfInput { application: ExamApplication; azubiName: string; confirmerName: string | null }

const val = (f: FieldDef, v: unknown) => (f.type === "date" ? (asText(v) ? dateDe(asText(v)) : "") : asText(v));

function signatureLines(doc: Doc, labels: string[], brk: () => void) {
  if (doc.y - 80 < CONTENT_BOTTOM) brk();
  doc.y -= 56;
  const w = (W - 30 * (labels.length - 1)) / labels.length;
  labels.forEach((l, i) => {
    const x = MARGIN + i * (w + 30);
    doc.page.drawLine({ start: { x, y: doc.y }, end: { x: x + w, y: doc.y }, thickness: 0.6, color: C.text });
    doc.text(l, x, doc.y - 12, 8, doc.f.reg, C.muted, w);
  });
  doc.y -= 24;
}

/** Ausbildungszeugnis (§ 16 BBiG) – zum Ausdrucken und Unterschreiben. */
export function renderCertificate(doc: Doc, inp: CertificatePdfInput): void {
  const c = inp.certificate;
  const meta = { beleg: "Ausbildungszeugnis", kind: "AUSBILDUNGSZEUGNIS" };
  doc.newPage(meta, c.status === "issued" ? null : "ENTWURF");
  const brk = () => { doc.newPage(meta, c.status === "issued" ? null : "ENTWURF"); };
  const title = "Ausbildungszeugnis";
  doc.text(title, (A4.w - doc.f.bold.widthOfTextAtSize(title, 24)) / 2, doc.y - 10, 24, doc.f.bold, C.brandDark);
  const sub = CERTIFICATE_KIND_LABEL[c.kind];
  doc.text(sub, (A4.w - doc.f.reg.widthOfTextAtSize(sub, 11)) / 2, doc.y - 30, 11, doc.f.reg, C.muted);
  doc.y -= 64;
  const content = c.content;
  doc.text("AUSZUBILDENDE:R", MARGIN, doc.y, 7, doc.f.reg, C.muted); doc.y -= 14;
  doc.text(inp.azubiName || "–", MARGIN, doc.y, 12, doc.f.bold); doc.y -= 22;
  const fields = certificateFields(c.kind);
  const rows = fields.filter((f) => f.group === "Ausbildung" && val(f, content[f.key]));
  for (const f of rows) {
    doc.text(f.label, MARGIN, doc.y, 9, doc.f.reg, C.muted, 170);
    doc.text(val(f, content[f.key]), MARGIN + 180, doc.y, 10, doc.f.reg, C.text, W - 180);
    doc.y -= 16;
  }
  doc.y -= 8;
  for (const f of fields.filter((x) => x.group === "Inhalt" && asText(content[x.key]).trim())) {
    if (doc.y - 40 < CONTENT_BOTTOM) brk();
    doc.y -= 16;
    doc.text(f.label, MARGIN, doc.y, 10.5, doc.f.bold, C.brandDark); doc.y -= 4;
    doc.paragraph(asText(content[f.key]), { size: 10, lead: 14.5, onBreak: brk });
    doc.y -= 8;
  }
  doc.y -= 28;
  const place = [asText(content["ort"]), asText(content["datum"]) ? dateDe(asText(content["datum"])) : ""].filter(Boolean).join(", ");
  if (doc.y - 20 < CONTENT_BOTTOM) brk();
  doc.text(place, MARGIN, doc.y, 10); doc.y -= 4;
  const signers = [`${asText(content["aussteller_name"]) || "Ausbildende:r"}${asText(content["aussteller_funktion"]) ? ` · ${asText(content["aussteller_funktion"])}` : ""}`];
  if (asText(content["ausbilder_name"]).trim() && asText(content["ausbilder_name"]).trim() !== asText(content["aussteller_name"]).trim()) signers.push(`${asText(content["ausbilder_name"])} · Ausbilder:in`);
  signatureLines(doc, signers, brk);
  doc.y -= 6;
  const status = c.status === "issued"
    ? `Ausgestellt in Azuvera am ${c.issued_at ? berlinDateTime(c.issued_at) : "–"}${c.issuer_name ? ` von ${c.issuer_name}` : ""}. Zur Vorlage ausdrucken und eigenhändig unterschreiben.`
    : `Status: ${CERTIFICATE_STATUS_LABEL[c.status]} – noch nicht ausgestellt.`;
  doc.paragraph(status, { size: 8, lead: 11, color: C.muted, onBreak: brk });
}

/** Antrag auf Zulassung zur Abschlussprüfung – Vorbereitung für die zuständige Stelle. */
export function renderApplication(doc: Doc, inp: ApplicationPdfInput): void {
  const a = inp.application;
  const meta = { beleg: `Prüfungsantrag ${a.exam_term}`.trim(), kind: "PRÜFUNGSANTRAG" };
  const wm = a.status === "confirmed" ? null : a.status === "submitted" ? "EINGEREICHT" : "ENTWURF";
  doc.newPage(meta, wm);
  const brk = () => { doc.newPage(meta, wm); };
  doc.text("Antrag auf Zulassung zur Abschlussprüfung", MARGIN, doc.y - 6, 17, doc.f.bold, C.brandDark);
  doc.y -= 26;
  doc.text(`${inp.azubiName || "–"} · Prüfungstermin: ${a.exam_term || "–"} · Status: ${APPLICATION_STATUS_LABEL[a.status]}`, MARGIN, doc.y, 9.5, doc.f.reg, C.muted, W);
  doc.y -= 18;
  let group = "";
  for (const f of APPLICATION_FIELDS) {
    if (f.group !== group) {
      group = f.group;
      if (doc.y - 50 < CONTENT_BOTTOM) brk();
      doc.y -= 24;
      doc.text(group.toUpperCase(), MARGIN, doc.y, 9, doc.f.bold, C.brandDark);
      doc.y -= 6;
      doc.page.drawLine({ start: { x: MARGIN, y: doc.y }, end: { x: A4.w - MARGIN, y: doc.y }, thickness: 0.5, color: C.line });
      doc.y -= 4;
    }
    const v = val(f, a.data[f.key]) || "–";
    if (f.type === "textarea" && v.length > 70) {
      if (doc.y - 30 < CONTENT_BOTTOM) brk();
      doc.y -= 12; doc.text(f.label, MARGIN, doc.y, 9, doc.f.reg, C.muted, W);
      doc.paragraph(v, { size: 9.5, lead: 13, onBreak: brk });
    } else {
      if (doc.y - 16 < CONTENT_BOTTOM) brk();
      doc.y -= 14;
      doc.text(f.label, MARGIN, doc.y, 9, doc.f.reg, C.muted, 200);
      doc.text(v, MARGIN + 210, doc.y, 9.5, doc.f.reg, C.text, W - 210);
    }
  }
  doc.y -= 16;
  if (doc.y - 60 < CONTENT_BOTTOM) brk();
  const yes = (b: unknown) => (b === true ? "[x]" : "[ ]");
  doc.text(`${yes(a.data["bestaetigung_berichtsheft"])} Der Ausbildungsnachweis (Berichtsheft) wurde regelmäßig geführt.`, MARGIN, doc.y, 9.5); doc.y -= 15;
  doc.text(`${yes(a.data["bestaetigung_richtig"])} Ich versichere, dass meine Angaben richtig und vollständig sind.`, MARGIN, doc.y, 9.5); doc.y -= 15;
  const confirmed = a.status === "confirmed" && a.confirmed_at
    ? `Vom Ausbildungsbetrieb in Azuvera bestätigt am ${berlinDateTime(a.confirmed_at)}${inp.confirmerName ? ` von ${inp.confirmerName}` : ""}.`
    : "Noch nicht vom Ausbildungsbetrieb bestätigt.";
  doc.text(confirmed, MARGIN, doc.y, 9.5, a.status === "confirmed" ? doc.f.bold : doc.f.reg); doc.y -= 4;
  signatureLines(doc, ["Ort, Datum, Unterschrift Auszubildende:r", "Ort, Datum, Unterschrift Ausbildende:r"], brk);
  doc.paragraph("Hinweis: Dieser Antrag bereitet die Anmeldung vor. Verlangt die zuständige Stelle ein eigenes Formular oder Online-Portal, übertrage die Angaben dorthin und lege diesen Ausdruck bei Bedarf bei.", { size: 8, lead: 11, color: C.muted, onBreak: brk });
}

export async function buildCertificatePdf(inp: CertificatePdfInput): Promise<Uint8Array> {
  const doc = await Doc.create(await logo(), `Ausbildungszeugnis ${inp.azubiName}`);
  renderCertificate(doc, inp);
  return doc.save();
}

export async function buildApplicationPdf(inp: ApplicationPdfInput): Promise<Uint8Array> {
  const doc = await Doc.create(await logo(), `Prüfungsantrag ${inp.azubiName}`);
  renderApplication(doc, inp);
  return doc.save();
}

export const certificateFileName = (name: string) => `Ausbildungszeugnis_${safeFileName(name) || "Azubi"}.pdf`;
export const applicationFileName = (name: string, term: string) => `Pruefungsantrag_${safeFileName(name) || "Azubi"}_${safeFileName(term)}.pdf`;

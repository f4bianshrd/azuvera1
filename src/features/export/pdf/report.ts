import type { PDFImage } from "pdf-lib";
import { yearOfDate } from "@/lib/training-year";
import { A4, C, CONTENT_BOTTOM, CONTENT_TOP, Doc, MARGIN } from "./doc";
import { berlinDateTime, dateDe, formatSize, sanitizeForPdf, wrapText } from "./text";
import type { ExportHeader, ReportBundle } from "../types";

export const STATUS_DE: Record<string, string> = { draft: "Entwurf", submitted: "Eingereicht", approved: "Freigegeben", rejected: "Zurückgewiesen" };
export const METHOD_DE: Record<string, string> = { draw: "gezeichnet", saved: "gespeicherte Unterschrift", click: "Klick-Bestätigung" };
const ROLE_DE: Record<string, string> = { azubi: "Auszubildende(r)", ausbilder: "Ausbilder(in)" };

/** Abweichende Vorlage (z. B. Erfahrungsbericht): Titel, Kopfzeilen, Tabelle und Abschnitte statt der Berichtsfelder. */
export interface ReportVariant { title: string; rightLabel: string; topic?: string; rows: [string, string][]; sections: { title: string; text: string | null | undefined }[] }

export interface RenderOptions { embedImages: boolean; blankSignatures: boolean; withProtocol: boolean; belegOverride?: string; variant?: ReportVariant }

/** Abschnitt einer Berichtsvorlage – spätere Bausteine können weitere einhängen. */
export interface ReportSectionDef { title: string; text: (b: ReportBundle) => string | null | undefined }
export const REPORT_SECTIONS: ReportSectionDef[] = [
  { title: "Ausgeführte Tätigkeiten", text: (b) => b.report.activities },
  { title: "Berufsschule – Inhalte", text: (b) => b.report.school_content },
  { title: "Unterweisungen", text: (b) => b.report.instructions },
  { title: "Zusammenfassung & Reflexion", text: (b) => b.report.summary },
  {
    title: "Ausbildungsinhalte",
    text: (b) => [
      ...(b.links?.items ?? []).map((i) => `• ${i.group ? `${i.group}: ` : ""}${i.label}`),
      ...(b.links?.topics ?? []).map((t) => `• Thema ${t.code ? `${t.code} ` : ""}${t.title}`),
    ].join("\n") || null,
  },
];

export const belegNr = (id: string) => `Beleg-Nr. AZV-${id.slice(0, 8).toUpperCase()}`;

export function reportPdfTitle(b: ReportBundle): string {
  const r = b.report;
  if (r.report_type === "daily") return "Tagesbericht";
  return r.weekly_mode === "topics" ? "Wochenbericht – Themenbericht" : "Wochenbericht – Tätigkeitsbericht";
}
export function reportPeriodLabel(b: ReportBundle): string {
  const r = b.report;
  return r.report_type === "weekly" ? `Kalenderwoche ${r.week_number} / ${r.year}` : dateDe(r.report_date);
}
function watermarkFor(status: string): string | null {
  if (status === "approved") return null;
  return status === "submitted" ? "NICHT FREIGEGEBEN" : "ENTWURF";
}

/** Zeichnet einen Bericht ab einer neuen Seite. */
export async function renderReport(doc: Doc, b: ReportBundle, h: ExportHeader, o: RenderOptions): Promise<void> {
  const r = b.report;
  const beleg = o.belegOverride ?? belegNr(r.id);
  const title = o.variant?.title ?? reportPdfTitle(b);
  const wm = watermarkFor(r.status);
  const W = A4.w - 2 * MARGIN;
  const cont = () => {
    doc.newPage({ beleg }, wm);
    doc.text(`${title} · Fortsetzung`, MARGIN, doc.y + 4, 9.5, doc.f.reg, C.muted);
    doc.y -= 14;
  };
  const need = (hgt: number) => { if (doc.y - hgt < CONTENT_BOTTOM) cont(); };

  doc.newPage({ beleg }, wm);
  doc.text(title, MARGIN, doc.y, 15, doc.f.bold, C.text);
  doc.textRight(o.variant?.rightLabel ?? reportPeriodLabel(b), A4.w - MARGIN, doc.y + 2, 10.5, doc.f.reg, C.brandDark);
  doc.y -= 26;
  if (o.variant?.topic) {
    doc.paragraph(`Thema: ${o.variant.topic}`, { size: 12, lead: 16, font: doc.f.bold, onBreak: cont });
    doc.y -= 10;
  }

  // Angaben zum Ausbildungsverhältnis
  const rows: [string, string][] = o.variant ? [...o.variant.rows] : [["Auszubildende(r)", h.azubi_name ?? "–"]];
  if (!o.variant) {
  if (h.personalnummer) rows.push(["Personalnummer", h.personalnummer]);
  rows.push(["Ausbildungsberuf", h.profession_name ?? "–"], ["Ausbildungsbetrieb", h.company_name ?? "–"], ["Berichtsdatum", dateDe(r.report_date)]);
  if (r.report_type === "weekly") rows.push(["Kalenderwoche", `${r.week_number} / ${r.year}`], ["Berichtsform", r.weekly_mode === "topics" ? "Themenbericht" : "Tätigkeitsbericht"]);
  const year = h.training_start ? yearOfDate(new Date(`${r.report_date}T00:00:00`), new Date(`${h.training_start}T00:00:00`), h.training_end ? new Date(`${h.training_end}T00:00:00`) : undefined) : null;
  rows.push(["Ausbildungsjahr", year ? `${year}. Lehrjahr` : "–"], ["Status", STATUS_DE[r.status] ?? r.status], ["Version", String(r.version)]);
  }
  const cellH = 28, colW = W / 2;
  const tableH = 18 + Math.ceil(rows.length / 2) * cellH;
  const top = doc.y;
  doc.page.drawRectangle({ x: MARGIN, y: top - 18, width: W, height: 18, color: C.surface, borderColor: C.line, borderWidth: 0.5 });
  doc.text("ANGABEN ZUM AUSBILDUNGSVERHÄLTNIS", MARGIN + 8, top - 12, 7.5, doc.f.bold, C.brandDark);
  rows.forEach(([label, value], i) => {
    const cx = MARGIN + (i % 2) * colW, cy = top - 18 - Math.floor(i / 2) * cellH;
    doc.page.drawRectangle({ x: cx, y: cy - cellH, width: colW, height: cellH, borderColor: C.line, borderWidth: 0.5 });
    doc.text(label.toUpperCase(), cx + 8, cy - 10, 6.5, doc.f.reg, C.muted);
    doc.text(value, cx + 8, cy - 22, 9.5, doc.f.reg, C.text, colW - 16);
  });
  doc.y = top - tableH - 22;

  // Abschnitte
  let n = 0;
  const heading = (t: string) => {
    need(40);
    n++;
    doc.text(`${String(n).padStart(2, "0")}  ${t.toUpperCase()}`, MARGIN, doc.y, 9, doc.f.bold, C.brandDark);
    doc.page.drawLine({ start: { x: MARGIN, y: doc.y - 5 }, end: { x: A4.w - MARGIN, y: doc.y - 5 }, thickness: 0.5, color: C.line });
    doc.y -= 6;
  };
  const sections = o.variant ? o.variant.sections.map((x) => ({ title: x.title, text: () => x.text })) : REPORT_SECTIONS;
  for (const s of sections) {
    const t = s.text(b)?.trim();
    if (!t) continue;
    heading(s.title);
    doc.paragraph(t, { onBreak: cont });
    doc.y -= 16;
  }

  // Anlagen
  if (b.attachments.length) {
    heading("Anlagen");
    b.attachments.forEach((a, i) => {
      const kind = a.mime_type === "application/pdf" ? "PDF" : "Bild";
      const cap = a.caption?.trim() ? ` – ${a.caption.trim()}` : "";
      doc.paragraph(`Anlage ${i + 1}: ${a.file_name} (${kind}, ${formatSize(a.size_bytes)})${cap}`, { size: 9, lead: 13, onBreak: cont });
    });
    doc.y -= 16;
  }

  // Bemerkungen
  const note = b.approvalNote?.trim();
  const noteLines = note ? wrapText(sanitizeForPdf(note), doc.f.reg, 9.5, W - 28) : [];
  const boxH = 30 + Math.max(1, noteLines.length) * 13;
  if (boxH < CONTENT_TOP - CONTENT_BOTTOM - 20) need(boxH + 10);
  {
    const bt = doc.y;
    doc.page.drawRectangle({ x: MARGIN, y: bt - boxH, width: W, height: boxH, color: C.surface });
    doc.page.drawRectangle({ x: MARGIN, y: bt - boxH, width: 3, height: boxH, color: C.brand });
    doc.text("BEMERKUNGEN DER AUSBILDERIN / DES AUSBILDERS", MARGIN + 14, bt - 14, 7.5, doc.f.bold, C.brandDark);
    doc.y = bt - 18;
    if (!note) { doc.y -= 13; doc.text("Keine Bemerkungen", MARGIN + 14, doc.y, 9.5, doc.f.ital, C.muted); }
    else doc.paragraph(note, { size: 9.5, lead: 13, x: MARGIN + 14, width: W - 28, onBreak: cont });
    doc.y = Math.min(doc.y, bt - boxH) - 22;
  }

  // Bestätigung der Richtigkeit
  need(150);
  doc.text("BESTÄTIGUNG DER RICHTIGKEIT", MARGIN, doc.y, 9, doc.f.bold, C.brandDark);
  doc.page.drawLine({ start: { x: MARGIN, y: doc.y - 5 }, end: { x: A4.w - MARGIN, y: doc.y - 5 }, thickness: 0.5, color: C.line });
  doc.y -= 14;
  const fw = (W - 24) / 2;
  const imgs: Record<string, PDFImage | undefined> = {};
  for (const role of ["azubi", "ausbilder"]) {
    const s = b.signatures.find((x) => x.role === role);
    const bytes = s && b.signatureImages.get(s.id);
    if (bytes && !o.blankSignatures) { try { imgs[role] = await doc.pdf.embedPng(bytes); } catch { /* Bild fehlt – Text statt Bild */ } }
  }
  const ft = doc.y;
  (["azubi", "ausbilder"] as const).forEach((role, i) => {
    const x = MARGIN + i * (fw + 24);
    const label = `Unterschrift ${ROLE_DE[role]}`;
    const s = b.signatures.find((z) => z.role === role);
    const lineY = ft - 64;
    if (o.blankSignatures) {
      doc.page.drawLine({ start: { x, y: lineY }, end: { x: x + fw, y: lineY }, thickness: 0.7, color: C.text });
      doc.text(label, x, lineY - 11, 8, doc.f.reg, C.muted);
      doc.page.drawLine({ start: { x, y: lineY - 44 }, end: { x: x + fw * 0.55, y: lineY - 44 }, thickness: 0.7, color: C.text });
      doc.text("Datum", x, lineY - 55, 8, doc.f.reg, C.muted);
      return;
    }
    const img = imgs[role];
    if (s && img) {
      const scale = Math.min((fw - 10) / img.width, 54 / img.height);
      doc.page.drawImage(img, { x: x + 4, y: lineY + 4, width: img.width * scale, height: img.height * scale });
    } else if (s) {
      doc.text(s.method === "click" ? "Klick-Bestätigung" : METHOD_DE[s.method] ?? "", x + 4, lineY + 20, 11, doc.f.ital, C.brandDark);
    } else {
      doc.text(role === "azubi" ? "Noch nicht eingereicht" : "Noch nicht freigegeben", x + 4, lineY + 20, 10, doc.f.ital, C.muted);
    }
    doc.page.drawLine({ start: { x, y: lineY }, end: { x: x + fw, y: lineY }, thickness: 0.7, color: C.text });
    doc.text(label, x, lineY - 11, 7, doc.f.reg, C.muted);
    if (s) {
      const name = s.on_behalf_of ? `${s.signer_name} (i. V. für ${b.names.get(s.on_behalf_of) ?? "–"})` : s.signer_name;
      doc.text(name, x, lineY - 24, 9, doc.f.bold, C.text, fw);
      doc.text(berlinDateTime(s.signed_at), x, lineY - 36, 8.5, doc.f.reg, C.text, fw);
      doc.text(`Elektronisch bestätigt · ${METHOD_DE[s.method] ?? s.method} · Version ${s.report_version}`, x, lineY - 48, 7, doc.f.reg, C.muted, fw);
    }
  });
  doc.y = ft - 130;

  // Bilder als Anlagen
  if (o.embedImages) {
    const images = b.attachments.filter((a) => a.mime_type.startsWith("image/") && b.attachmentPng.get(a.id));
    for (let i = 0; i < images.length; i++) {
      if (i % 2 === 0) { doc.newPage({ beleg }, wm); doc.text(`${title} · Anlagen`, MARGIN, doc.y + 4, 9.5, doc.f.reg, C.muted); doc.y -= 14; }
      const a = images[i]!;
      let img: PDFImage | null = null;
      try { img = await doc.pdf.embedPng(b.attachmentPng.get(a.id)!); } catch { img = null; }
      const slotH = (CONTENT_TOP - CONTENT_BOTTOM - 30) / 2;
      if (img) {
        const s = Math.min(W / img.width, (slotH - 30) / img.height, 1.5);
        const w = img.width * s, hh = img.height * s;
        doc.page.drawImage(img, { x: MARGIN + (W - w) / 2, y: doc.y - hh, width: w, height: hh });
      }
      const idx = b.attachments.indexOf(a) + 1;
      doc.text(`Anlage ${idx}: ${a.caption?.trim() || a.file_name}`, MARGIN, doc.y - slotH + 18, 8.5, doc.f.ital, C.muted, W);
      doc.y -= slotH;
    }
  }

  if (o.withProtocol && b.signatures.length) renderProtocol(doc, b, beleg, wm);
}

function renderProtocol(doc: Doc, b: ReportBundle, beleg: string, wm: string | null) {
  const W = A4.w - 2 * MARGIN;
  doc.newPage({ beleg }, wm);
  doc.text("NACHWEIS DER ELEKTRONISCHEN BESTÄTIGUNG", MARGIN, doc.y, 12, doc.f.bold, C.brandDark);
  doc.y -= 6;
  doc.paragraph("Einfache elektronische Bestätigung mit Zeitstempel und Prüfsumme – keine qualifizierte elektronische Signatur. Zeitpunkte sind Serverzeiten (Europe/Berlin).", { size: 9, lead: 13, color: C.muted, onBreak: () => doc.newPage({ beleg }, wm) });
  doc.y -= 12;
  for (const s of b.signatures) {
    if (doc.y - 90 < CONTENT_BOTTOM) doc.newPage({ beleg }, wm);
    const name = s.on_behalf_of ? `${s.signer_name} (i. V. für ${b.names.get(s.on_behalf_of) ?? "–"})` : s.signer_name;
    const rows: [string, string][] = [["Rolle", ROLE_DE[s.role] ?? s.role], ["Name", name], ["Zeitpunkt", berlinDateTime(s.signed_at)], ["Methode", METHOD_DE[s.method] ?? s.method], ["Version", String(s.report_version)]];
    for (const [k, v] of rows) { doc.y -= 13; doc.text(k, MARGIN, doc.y, 8.5, doc.f.reg, C.muted); doc.text(v, MARGIN + 90, doc.y, 9, doc.f.reg, C.text, W - 90); }
    const hash = s.content_hash ?? "–";
    doc.y -= 13; doc.text("SHA-256", MARGIN, doc.y, 8.5, doc.f.reg, C.muted);
    doc.text(hash.slice(0, 32), MARGIN + 90, doc.y, 7, doc.f.mono, C.text);
    doc.y -= 10; doc.text(hash.slice(32), MARGIN + 90, doc.y, 7, doc.f.mono, C.text);
    doc.y -= 10;
    doc.page.drawLine({ start: { x: MARGIN, y: doc.y }, end: { x: A4.w - MARGIN, y: doc.y }, thickness: 0.5, color: C.line });
    doc.y -= 6;
  }
  if (doc.y - 90 < CONTENT_BOTTOM) doc.newPage({ beleg }, wm);
  doc.y -= 14;
  doc.text("Integritätsprüfung beim Export", MARGIN, doc.y, 10, doc.f.bold, C.text);
  doc.y -= 15;
  const ok = b.verify?.hash_ok === true && b.verify?.signatures_ok === true;
  if (ok) doc.text("Die aktuelle Prüfsumme des Berichts stimmt mit den Unterschriften überein.", MARGIN, doc.y, 9.5, doc.f.reg, C.text);
  else doc.text("ACHTUNG: Die Prüfsumme des Berichts stimmt nicht überein.", MARGIN, doc.y, 9.5, doc.f.bold, C.warn);
  doc.y -= 14; doc.text(`Bericht-ID: ${b.report.id}`, MARGIN, doc.y, 8.5, doc.f.reg, C.muted);
  doc.y -= 12; doc.text(`Version: ${b.report.version}`, MARGIN, doc.y, 8.5, doc.f.reg, C.muted);
  doc.y -= 12; doc.text(`Export: ${berlinDateTime(doc.createdAt)}`, MARGIN, doc.y, 8.5, doc.f.reg, C.muted);
}

export function integrityOk(b: ReportBundle): boolean | null {
  if (!b.verify || b.verify.hash_ok === null || (b.report.status !== "approved" && b.report.status !== "submitted")) return null;
  return b.verify.hash_ok === true && b.verify.signatures_ok === true;
}

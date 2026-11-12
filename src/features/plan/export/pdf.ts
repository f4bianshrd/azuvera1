/** PDF des Ausbildungsplans (pdf-lib, Stil wie das Berichts-PDF aus 5A). */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import logoUrl from "@/assets/azuvera-icon-256.png";
import { A4, C, MARGIN } from "@/features/export/pdf/doc";
import { berlinDateTime, fitText, sanitizeForPdf, wrapText } from "@/features/export/pdf/text";
import { chartPng } from "./charts";
import { hexToRgb01 } from "./color";
import type { ExportModel } from "./model";

const BOTTOM = 70;

class PlanDoc {
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;
  constructor(
    public pdf: PDFDocument, public reg: PDFFont, public bold: PDFFont, public logo: PDFImage,
    public m: ExportModel, public primary: RGB, public accent: RGB,
  ) {}

  t(text: string, x: number, y: number, size: number, font = this.reg, color: RGB = C.text, max?: number) {
    let s = sanitizeForPdf(text).replace(/\n/g, " ");
    if (max) s = fitText(s, font, size, max);
    this.page.drawText(s, { x, y, size, font, color });
  }
  right(text: string, r: number, y: number, size: number, font = this.reg, color: RGB = C.text) {
    const s = sanitizeForPdf(text);
    this.page.drawText(s, { x: r - font.widthOfTextAtSize(s, size), y, size, font, color });
  }

  /** Neue Seite; voller Briefkopf (Standard) oder schlanker Kopf. */
  newPage(full: boolean) {
    this.page = this.pdf.addPage([A4.w, A4.h]);
    this.pages.push(this.page);
    const top = A4.h - 36, b = this.m.branding;
    if (full) {
      const ratio = this.logo.width / this.logo.height;
      const h = 46, w = Math.min(120, h * ratio);
      this.page.drawImage(this.logo, { x: MARGIN, y: top - h, width: w, height: w / ratio });
      this.t(b.senderName || "Azuvera", MARGIN + w + 10, top - 16, 13, this.bold, C.brandDark, 220);
      this.t("Ausbildungsplan", MARGIN + w + 10, top - 30, 8.5, this.reg, C.muted);
      b.senderLines.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 4)
        .forEach((l, i) => this.right(l, A4.w - MARGIN, top - 10 - i * 11, 8, this.reg, C.muted));
      this.page.drawRectangle({ x: MARGIN, y: top - 58, width: A4.w - 2 * MARGIN, height: 2.2, color: this.primary });
      this.y = top - 80;
    } else {
      this.page.drawImage(this.logo, { x: MARGIN, y: top - 18, width: 18 * (this.logo.width / this.logo.height) > 60 ? 60 : 18 * (this.logo.width / this.logo.height), height: 18 });
      this.t(`Ausbildungsplan · ${this.m.personName}`, MARGIN + 66, top - 12, 9, this.bold, C.text, 300);
      this.right(b.senderName || "Azuvera", A4.w - MARGIN, top - 12, 8, this.reg, C.muted);
      this.page.drawRectangle({ x: MARGIN, y: top - 26, width: A4.w - 2 * MARGIN, height: 1.2, color: this.primary });
      this.y = top - 46;
    }
  }
  get full() { return this.m.template === "letterhead"; }
  ensure(h: number) { if (this.y - h < BOTTOM) this.newPage(this.full); }

  heading(text: string) {
    this.ensure(40);
    this.y -= 8;
    this.page.drawRectangle({ x: MARGIN, y: this.y - 4, width: 3, height: 16, color: this.accent });
    this.t(text, MARGIN + 10, this.y, 13, this.bold, C.brandDark);
    this.y -= 20;
  }
  para(text: string, size = 9.5, font = this.reg, color: RGB = C.text, x = MARGIN, width = A4.w - 2 * MARGIN) {
    for (const line of wrapText(sanitizeForPdf(text), font, size, width)) {
      this.ensure(size + 5);
      this.y -= size + 4;
      if (line) this.page.drawText(line, { x, y: this.y, size, font, color });
    }
  }

  finalize() {
    const n = this.pages.length, footer = this.m.branding.footer.trim();
    const created = `Erstellt am ${berlinDateTime(this.m.createdAt)}`;
    this.pages.forEach((p, i) => {
      this.page = p;
      p.drawLine({ start: { x: MARGIN, y: 50 }, end: { x: A4.w - MARGIN, y: 50 }, thickness: 0.5, color: C.line });
      this.t(footer || `Azuvera · Ausbildungsplan · ${this.m.personName}`, MARGIN, 38, 7.5, this.reg, C.muted, 360);
      this.t(created, MARGIN, 27, 7.5, this.reg, C.muted);
      this.right(`Seite ${i + 1} von ${n}`, A4.w - MARGIN, 38, 7.5, this.bold, C.text);
    });
  }
}

async function loadLogo(pdf: PDFDocument, dataUrl: string | null): Promise<PDFImage> {
  if (dataUrl) {
    try {
      const bytes = Uint8Array.from(atob(dataUrl.split(",")[1] ?? ""), (c) => c.charCodeAt(0));
      return dataUrl.startsWith("data:image/png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    } catch { /* Standardlogo */ }
  }
  return pdf.embedPng(new Uint8Array(await (await fetch(logoUrl)).arrayBuffer()));
}

function infoBlock(d: PlanDoc) {
  const m = d.m;
  d.ensure(90);
  d.t("Ausbildungsplan", MARGIN, d.y, 18, d.bold, C.brandDark);
  d.y -= 18;
  d.t(`${m.planTitle}${m.source ? ` · ${m.source}` : ""}`, MARGIN, d.y, 9.5, d.reg, C.muted, A4.w - 2 * MARGIN);
  d.y -= 16;
  const rows: [string, string][] = [["Name", m.personName], ["Beruf", m.profession], ["Betrieb", m.company], ["Auswahl", m.selection]];
  for (const [k, v] of rows) {
    d.ensure(14);
    d.t(k, MARGIN, d.y, 8.5, d.bold, C.muted);
    d.t(v, MARGIN + 70, d.y, 9, d.reg, C.text, A4.w - 2 * MARGIN - 70);
    d.y -= 13;
  }
  d.y -= 6;
}

function kpiBlock(d: PlanDoc, compact: boolean) {
  const cards = d.m.kpis;
  if (compact) {
    d.ensure(16);
    d.t(cards.map((c) => `${c.label}: ${c.value} (${c.hint})`).join(" · "), MARGIN, d.y, 8.5, d.reg, C.text, A4.w - 2 * MARGIN);
    d.y -= 18;
    return;
  }
  d.ensure(70);
  const gap = 8, w = (A4.w - 2 * MARGIN - gap * 3) / 4, h = 56;
  cards.forEach((c, i) => {
    const x = MARGIN + i * (w + gap);
    d.page.drawRectangle({ x, y: d.y - h, width: w, height: h, color: C.surface, borderColor: C.line, borderWidth: 0.6 });
    d.t(c.label, x + 8, d.y - 14, 8, d.reg, C.muted, w - 16);
    d.t(c.value, x + 8, d.y - 33, 16, d.bold, d.primary, w - 16);
    d.t(c.hint, x + 8, d.y - 47, 7, d.reg, C.muted, w - 16);
  });
  d.y -= h + 14;
}

async function chartsBlock(d: PlanDoc) {
  d.heading("Diagramme");
  const w = (A4.w - 2 * MARGIN - 12) / 2, h = w * (420 / 900) + 18;
  let col = 0;
  for (const spec of d.m.charts) {
    if (col === 0) d.ensure(h + 6);
    const x = MARGIN + col * (w + 12);
    d.t(spec.title, x, d.y - 10, 9, d.bold, C.text, w);
    const png = await chartPng(spec);
    if (png) {
      const img = await d.pdf.embedPng(png);
      d.page.drawImage(img, { x, y: d.y - h, width: w, height: w * (420 / 900) });
    } else {
      d.t("Noch keine Daten für dieses Diagramm.", x, d.y - 40, 8.5, d.reg, C.muted, w);
    }
    if (col === 1) d.y -= h + 10;
    col = col === 0 ? 1 : 0;
  }
  if (col === 1) d.y -= h + 10;
}

function weeksBlock(d: PlanDoc, details: boolean) {
  d.heading("Wochenübersicht");
  if (!d.m.weeks.length) { d.para("Kein Ausbildungsbeginn hinterlegt – die Wochenübersicht ist nicht verfügbar.", 9, d.reg, C.muted); d.y -= 6; return; }
  for (const yb of d.m.weeks) {
    d.ensure(34);
    d.t(yb.title, MARGIN, d.y, 10, d.bold, C.text);
    d.y -= 13;
    d.t(yb.summary, MARGIN, d.y, 8.5, d.reg, C.muted);
    d.y -= 14;
    if (!details) { d.y -= 4; continue; }
    const cols = 4, cw = (A4.w - 2 * MARGIN) / cols;
    for (let i = 0; i < yb.weeks.length; i += cols) {
      d.ensure(12);
      yb.weeks.slice(i, i + cols).forEach((w, j) => {
        const col = w.status === "Genehmigt" ? rgb(0.06, 0.5, 0.3) : w.status === "Abgelehnt" ? C.warn : w.status === "kein Bericht" ? C.muted : C.text;
        d.t(`${w.label}  ${w.status}`, MARGIN + j * cw, d.y, 7.5, d.reg, col, cw - 6);
      });
      d.y -= 11;
    }
    d.y -= 8;
  }
}

function contentsBlock(d: PlanDoc) {
  d.heading("Inhalte");
  const years = d.m.years, yw = 64, lw = A4.w - 2 * MARGIN - yw * years.length;
  const head = () => {
    d.ensure(16);
    d.page.drawRectangle({ x: MARGIN, y: d.y - 4, width: A4.w - 2 * MARGIN, height: 14, color: C.surface });
    d.t("Fertigkeit", MARGIN + 4, d.y, 8, d.bold, C.muted);
    years.forEach((y, i) => d.t(`${y}. Jahr`, MARGIN + lw + i * yw + 4, d.y, 8, d.bold, C.muted));
    d.y -= 16;
  };
  if (!d.m.sections.length) { d.para("Keine Inhalte in der aktuellen Auswahl.", 9, d.reg, C.muted); return; }
  for (const s of d.m.sections) {
    d.ensure(40);
    d.t(s.title, MARGIN, d.y, 11, d.bold, d.primary, A4.w - 2 * MARGIN);
    d.y -= 15;
    for (const g of s.groups) {
      d.ensure(44);
      const meta = [g.reference, g.weeks_text].filter(Boolean).join(" · ");
      d.t(g.title, MARGIN, d.y, 9.5, d.bold, C.text, A4.w - 2 * MARGIN);
      d.y -= 11;
      if (meta) { d.t(meta, MARGIN, d.y, 7.5, d.reg, C.muted, A4.w - 2 * MARGIN); d.y -= 11; }
      head();
      for (const r of g.rows) {
        const lines = wrapText(sanitizeForPdf(r.label), d.reg, 8.5, lw - 8);
        const h = lines.length * 11 + 3;
        if (d.y - h < BOTTOM) { d.newPage(d.full); head(); }
        lines.forEach((l, i) => d.page.drawText(l, { x: MARGIN + 4, y: d.y - i * 11, size: 8.5, font: d.reg, color: C.text }));
        r.cells.forEach((c, i) => {
          const col = c === "beherrscht" ? rgb(0.06, 0.5, 0.3) : c === "nicht beherrscht" ? C.warn : c === "geplant" ? d.primary : C.muted;
          d.t(c, MARGIN + lw + i * yw + 4, d.y, 8, c === "–" ? d.reg : d.bold, col, yw - 6);
        });
        d.y -= h;
        d.page.drawLine({ start: { x: MARGIN, y: d.y + 7 }, end: { x: A4.w - MARGIN, y: d.y + 7 }, thickness: 0.3, color: C.line });
      }
      d.y -= 8;
    }
  }
}

function coverPage(d: PlanDoc) {
  d.page = d.pdf.addPage([A4.w, A4.h]);
  d.pages.push(d.page);
  const m = d.m;
  d.page.drawRectangle({ x: 0, y: A4.h - 14, width: A4.w, height: 14, color: d.primary });
  const ratio = d.logo.width / d.logo.height, lh = 90;
  d.page.drawImage(d.logo, { x: MARGIN, y: A4.h - 170, width: Math.min(200, lh * ratio), height: Math.min(200, lh * ratio) / ratio });
  let y = A4.h / 2 + 60;
  d.t("Ausbildungsplan", MARGIN, y, 34, d.bold, C.brandDark); y -= 30;
  d.t(m.planTitle, MARGIN, y, 14, d.reg, C.text, A4.w - 2 * MARGIN); y -= 18;
  if (m.source) { d.t(m.source, MARGIN, y, 10, d.reg, C.muted, A4.w - 2 * MARGIN); y -= 30; } else y -= 12;
  d.page.drawRectangle({ x: MARGIN, y: y + 8, width: 60, height: 3, color: d.accent }); y -= 16;
  for (const [k, v] of [["Name", m.personName], ["Beruf", m.profession], ["Betrieb", m.company], ["Auswahl", m.selection]] as const) {
    d.t(k, MARGIN, y, 9, d.bold, C.muted); d.t(v, MARGIN + 70, y, 11, d.reg, C.text, A4.w - 2 * MARGIN - 70); y -= 18;
  }
  const b = m.branding;
  let by = 120;
  d.t(b.senderName || "Azuvera", MARGIN, by, 11, d.bold, C.text); by -= 13;
  for (const l of b.senderLines.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 4)) { d.t(l, MARGIN, by, 9, d.reg, C.muted); by -= 12; }
}

export async function buildPlanPdf(m: ExportModel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(sanitizeForPdf(`Ausbildungsplan ${m.personName}`));
  pdf.setProducer("Azuvera"); pdf.setCreator("Azuvera");
  const [reg, bold] = await Promise.all([pdf.embedFont(StandardFonts.Helvetica), pdf.embedFont(StandardFonts.HelveticaBold)]);
  const logo = await loadLogo(pdf, m.branding.logoDataUrl);
  const [pr, pg, pb] = hexToRgb01(m.branding.primary), [ar, ag, ab] = hexToRgb01(m.branding.accent);
  const d = new PlanDoc(pdf, reg, bold, logo, m, rgb(pr, pg, pb), rgb(ar, ag, ab));
  const L = m.layout;
  switch (m.template) {
    case "letterhead":
      d.newPage(true); infoBlock(d); kpiBlock(d, false);
      if (L.charts) await chartsBlock(d);
      if (L.weeks) weeksBlock(d, true);
      if (L.contents) contentsBlock(d);
      break;
    case "cover":
      coverPage(d); d.newPage(false); infoBlock(d); kpiBlock(d, false);
      if (L.contents) contentsBlock(d);
      if (L.weeks) weeksBlock(d, true);
      if (L.charts) await chartsBlock(d);
      break;
    case "compact":
      d.newPage(false); infoBlock(d); kpiBlock(d, true);
      if (L.contents) contentsBlock(d);
      if (L.weeks) weeksBlock(d, true);
      if (L.charts) await chartsBlock(d);
      break;
    case "analysis":
      coverPage(d); d.newPage(false); infoBlock(d); kpiBlock(d, false);
      if (L.charts) await chartsBlock(d);
      if (L.weeks) weeksBlock(d, false);
      if (L.contents) contentsBlock(d);
      break;
  }
  d.finalize();
  return pdf.save();
}

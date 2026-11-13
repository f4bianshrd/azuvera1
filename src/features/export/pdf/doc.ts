import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { berlinDateTime, fitText, sanitizeForPdf, wrapText } from "./text";

export const A4 = { w: 595.28, h: 841.89 };
export const MARGIN = 56;
export const CONTENT_TOP = A4.h - 36 - 84;
export const CONTENT_BOTTOM = 72;
export const C = {
  brand: rgb(0.05, 0.42, 0.55),
  brandDark: rgb(0.04, 0.24, 0.36),
  text: rgb(0.11, 0.16, 0.22),
  muted: rgb(0.42, 0.47, 0.55),
  line: rgb(0.85, 0.88, 0.92),
  surface: rgb(0.96, 0.97, 0.99),
  warn: rgb(0.75, 0.15, 0.15),
  watermark: rgb(0.9, 0.91, 0.93),
};

export interface PageMeta { beleg: string; /** Dokumentart rechts im Briefkopf (Standard: AUSBILDUNGSNACHWEIS). */ kind?: string }

/** Ein PDF-Dokument mit Schriften, Logo und Seitenverwaltung (Briefkopf beim Anlegen, Fuß beim Abschluss). */
export class Doc {
  pages: { page: PDFPage; meta: PageMeta }[] = [];
  page!: PDFPage;
  y = CONTENT_TOP;
  private constructor(
    public pdf: PDFDocument,
    public f: { reg: PDFFont; bold: PDFFont; ital: PDFFont; mono: PDFFont },
    public logo: PDFImage,
    public createdAt: Date,
  ) {}

  static async create(logoPng: Uint8Array, title: string): Promise<Doc> {
    const pdf = await PDFDocument.create();
    pdf.setTitle(sanitizeForPdf(title));
    pdf.setProducer("Azuvera");
    pdf.setCreator("Azuvera");
    const [reg, bold, ital, mono] = await Promise.all([
      pdf.embedFont(StandardFonts.Helvetica), pdf.embedFont(StandardFonts.HelveticaBold),
      pdf.embedFont(StandardFonts.HelveticaOblique), pdf.embedFont(StandardFonts.Courier),
    ]);
    const logo = await pdf.embedPng(logoPng); // einmal je Dokument
    return new Doc(pdf, { reg, bold, ital, mono }, logo, new Date());
  }

  /** Neue Seite mit Briefkopf und optionalem Wasserzeichen. */
  newPage(meta: PageMeta, watermark?: string | null): PDFPage {
    const page = this.pdf.addPage([A4.w, A4.h]);
    this.page = page;
    this.pages.push({ page, meta });
    if (watermark) this.watermark(watermark);
    const top = A4.h - 36;
    page.drawImage(this.logo, { x: MARGIN, y: top - 46, width: 46, height: 46 });
    page.drawText("AZUVERA", { x: MARGIN + 56, y: top - 22, size: 17, font: this.f.bold, color: C.brandDark });
    page.drawText("Digitales Berichtsheft · Ausbildungsnachweis", { x: MARGIN + 56, y: top - 36, size: 8.5, font: this.f.reg, color: C.muted });
    this.textRight(meta.kind ?? "AUSBILDUNGSNACHWEIS", A4.w - MARGIN, top - 16, 9, this.f.bold, C.text);
    this.textRight(meta.beleg, A4.w - MARGIN, top - 30, 8.5, this.f.reg, C.muted);
    page.drawRectangle({ x: MARGIN, y: top - 58, width: A4.w - 2 * MARGIN, height: 2.2, color: C.brand });
    page.drawLine({ start: { x: MARGIN, y: top - 62 }, end: { x: A4.w - MARGIN, y: top - 62 }, thickness: 0.5, color: C.line });
    this.y = CONTENT_TOP;
    return page;
  }

  private watermark(text: string) {
    const size = text.length > 10 ? 64 : 96;
    const w = this.f.bold.widthOfTextAtSize(text, size);
    const rad = (35 * Math.PI) / 180;
    const cx = A4.w / 2, cy = A4.h / 2;
    this.page.drawText(text, {
      x: cx - (w / 2) * Math.cos(rad) + (size / 3) * Math.sin(rad),
      y: cy - (w / 2) * Math.sin(rad) - (size / 3) * Math.cos(rad),
      size, font: this.f.bold, color: C.watermark, rotate: degrees(35), opacity: 0.6,
    });
  }

  textRight(t: string, right: number, y: number, size: number, font: PDFFont, color = C.text) {
    const s = sanitizeForPdf(t);
    this.page.drawText(s, { x: right - font.widthOfTextAtSize(s, size), y, size, font, color });
  }

  text(t: string, x: number, y: number, size: number, font: PDFFont = this.f.reg, color = C.text, maxWidth?: number) {
    let s = sanitizeForPdf(t).replace(/\n/g, " ");
    if (maxWidth) s = fitText(s, font, size, maxWidth);
    this.page.drawText(s, { x, y, size, font, color });
  }

  /** Mehrzeiliger Text mit Seitenumbruch. */
  paragraph(t: string, opts: { size?: number; lead?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number; width?: number; onBreak: () => void }) {
    const size = opts.size ?? 10, lead = opts.lead ?? 14.5, font = opts.font ?? this.f.reg;
    const x = opts.x ?? MARGIN, width = opts.width ?? A4.w - 2 * MARGIN;
    for (const line of wrapText(sanitizeForPdf(t), font, size, width)) {
      if (this.y - lead < CONTENT_BOTTOM) opts.onBreak();
      this.y -= lead;
      if (line) this.page.drawText(line, { x, y: this.y, size, font, color: opts.color ?? C.text });
    }
  }

  /** Fuß mit durchlaufender Seitenzahl auf allen Seiten. */
  finalize() {
    const n = this.pages.length;
    const created = `Erstellt am ${berlinDateTime(this.createdAt)}`;
    this.pages.forEach(({ page, meta }, i) => {
      this.page = page;
      page.drawLine({ start: { x: MARGIN, y: 50 }, end: { x: A4.w - MARGIN, y: 50 }, thickness: 0.5, color: C.line });
      this.text(`Azuvera · Ausbildungsnachweis · ${meta.beleg}`, MARGIN, 38, 7.5, this.f.reg, C.muted);
      this.text(created, MARGIN, 27, 7.5, this.f.reg, C.muted);
      this.textRight(`Seite ${i + 1} von ${n}`, A4.w - MARGIN, 38, 7.5, this.f.bold, C.text);
      this.textRight("Dieses Dokument wurde digital erzeugt.", A4.w - MARGIN, 27, 7.5, this.f.reg, C.muted);
    });
  }

  async save(): Promise<Uint8Array> {
    this.finalize();
    return this.pdf.save();
  }
}

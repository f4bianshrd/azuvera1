/** Leittext als PDF: Deckblatt mit Quelle, alle Aufgaben mit Antworten, Fotos und Freigabevermerk. */
import { A4, C, CONTENT_BOTTOM, Doc, MARGIN } from "./doc";
import { berlinDateTime, dateDe, safeFileName, sanitizeForPdf, wrapText } from "./text";
import type { Leittext, PersonHeader, Work } from "@/features/leittexte/api";
import { answerKey, answerText, normalizeTable, STATUS_LABEL, type LeittextField } from "@/features/leittexte/model";

export interface LeittextPdfInput {
  leittext: Leittext;
  work: Work | null;
  person: PersonHeader;
  /** Bilder je Antwort-Schlüssel (JPEG-Bytes). */
  images: Record<string, Uint8Array[]>;
  reviewerName?: string | null;
}

const W = A4.w - 2 * MARGIN;

export function leittextFileName(input: Pick<LeittextPdfInput, "leittext" | "person">): string {
  return `Leittext_${safeFileName(input.leittext.title)}_${safeFileName(input.person.name || "Azubi")}.pdf`;
}

/** Hängt einen Leittext an ein bestehendes Dokument an (auch für die Prüfungsmappe). */
export async function renderLeittext(doc: Doc, input: LeittextPdfInput): Promise<void> {
  const { leittext, work, person } = input;
  const meta = { beleg: `Leittext ${leittext.order_no ?? leittext.code}`, kind: "LEITTEXT" };
  const brk = () => { doc.newPage(meta); };
  const ensure = (h: number) => { if (doc.y - h < CONTENT_BOTTOM) brk(); };
  doc.newPage(meta);

  // Titel und Kopf
  doc.y -= 6;
  doc.paragraph(leittext.title, { size: 18, lead: 22, font: doc.f.bold, color: C.brandDark, onBreak: brk });
  doc.y -= 4;
  doc.paragraph(`Status: ${STATUS_LABEL[work?.status ?? "none"]}${work?.submitted_at ? ` · eingereicht am ${berlinDateTime(work.submitted_at)}` : ""}${work?.reviewed_at && work.status === "approved" ? ` · freigegeben am ${berlinDateTime(work.reviewed_at)}${input.reviewerName ? ` von ${input.reviewerName}` : ""}` : ""}`,
    { size: 9, lead: 13, color: C.muted, onBreak: brk });
  doc.y -= 10;
  const rows: [string, string][] = [
    ["Auszubildende:r", person.name || "–"],
    ["Ausbildungsberuf", person.profession ?? "–"],
    ["Ausbildungsbetrieb", person.company ?? "–"],
    ["Zeitraum der Bearbeitung", [work?.header.zeitraum_von, work?.header.zeitraum_bis].filter(Boolean).map((d) => dateDe(d!)).join(" bis ") || "–"],
    ["Zusammenarbeit mit", work?.header.zusammenarbeit?.trim() || "–"],
  ];
  const boxH = rows.length * 16 + 14;
  ensure(boxH);
  doc.page.drawRectangle({ x: MARGIN, y: doc.y - boxH, width: W, height: boxH, color: C.surface, borderColor: C.line, borderWidth: 0.6 });
  let ry = doc.y - 18;
  for (const [k, v] of rows) {
    doc.text(k, MARGIN + 10, ry, 9, doc.f.bold, C.muted);
    doc.text(v, MARGIN + 150, ry, 10, doc.f.reg, C.text, W - 160);
    ry -= 16;
  }
  doc.y -= boxH + 12;
  // Quelle (Pflicht)
  doc.paragraph(`Quelle: ${leittext.issuer}${leittext.stand ? `, Stand ${leittext.stand}` : ""}${leittext.order_no ? `, Bestell-Nr. ${leittext.order_no}` : ""} – ${leittext.source_url}`, { size: 8, lead: 11, color: C.muted, onBreak: brk });
  doc.y -= 8;

  // Einleitung
  const intro = leittext.content.intro ?? {};
  const introBlock = (title: string, body?: string | string[]) => {
    if (!body || (Array.isArray(body) && !body.length)) return;
    ensure(40);
    doc.y -= 6;
    doc.paragraph(title, { size: 11, lead: 15, font: doc.f.bold, color: C.brandDark, onBreak: brk });
    if (Array.isArray(body)) for (const b of body) doc.paragraph(`•  ${b}`, { size: 9.5, lead: 13, onBreak: brk });
    else doc.paragraph(body, { size: 9.5, lead: 13, onBreak: brk });
  };
  introBlock("Worum geht's?", intro.worum);
  introBlock("Was kann ich hier lernen?", intro.lernen);
  introBlock("Was brauche ich für die Durchführung?", intro.brauchen);

  // Aufgaben
  for (const section of leittext.content.sections) {
    ensure(70);
    doc.y -= 30;
    doc.page.drawRectangle({ x: MARGIN, y: doc.y - 6, width: W, height: 22, color: C.brand });
    doc.text(section.title, MARGIN + 8, doc.y + 1, 11, doc.f.bold, C.surface, W - 16);
    doc.y -= 14;
    for (const task of section.tasks) {
      ensure(50);
      doc.y -= 8;
      doc.paragraph(`${task.number})  ${task.prompt}`, { size: 10, lead: 14, font: doc.f.bold, onBreak: brk });
      if (task.hint) doc.paragraph(task.hint, { size: 8.5, lead: 12, font: doc.f.ital, color: C.muted, onBreak: brk });
      for (const field of task.fields) await renderField(doc, field, input, answerKey(task, field), brk, ensure);
    }
  }
}

async function renderField(doc: Doc, field: LeittextField, input: LeittextPdfInput, key: string, brk: () => void, ensure: (h: number) => void) {
  const value = input.work?.answers[key];
  if (field.type === "info") { doc.paragraph(field.text ?? "", { size: 8.5, lead: 12, font: doc.f.ital, color: C.muted, onBreak: brk }); return; }
  if (field.label && field.type !== "table") { doc.y -= 2; doc.paragraph(field.label, { size: 9, lead: 12, font: doc.f.bold, color: C.muted, onBreak: brk }); }
  if (field.type === "table") {
    const table = normalizeTable(field, value);
    const fixed = !!field.rows;
    const heads = field.columns ?? [];
    const cols = Math.max(heads.length, (table[0]?.length ?? 1) + (fixed ? 1 : 0));
    const colW = W / cols;
    if (field.label) doc.paragraph(field.label, { size: 9, lead: 12, font: doc.f.bold, color: C.muted, onBreak: brk });
    const drawRow = (cells: string[], bold: boolean) => {
      const lines = cells.map((c) => wrapText(sanitizeForPdf(c), doc.f.reg, 8.5, colW - 8).slice(0, 6));
      const h = Math.max(1, ...lines.map((l) => l.length)) * 11 + 6;
      ensure(h);
      cells.forEach((_, i) => doc.page.drawRectangle({ x: MARGIN + i * colW, y: doc.y - h, width: colW, height: h, borderColor: C.line, borderWidth: 0.5, ...(bold ? { color: C.surface } : {}) }));
      lines.forEach((ls, i) => ls.forEach((l, j) => doc.page.drawText(l, { x: MARGIN + i * colW + 4, y: doc.y - 12 - j * 11, size: 8.5, font: bold || (fixed && i === 0) ? doc.f.bold : doc.f.reg, color: C.text })));
      doc.y -= h;
    };
    doc.y -= 4;
    if (heads.length) drawRow(Array.from({ length: cols }, (_, i) => heads[i] ?? ""), true);
    table.forEach((row, r) => drawRow(fixed ? [field.rows![r] ?? "", ...row] : row, false));
    doc.y -= 4;
    return;
  }
  if (field.type === "image") {
    const imgs = input.images[key] ?? [];
    if (!imgs.length) { doc.paragraph("Kein Bild", { size: 9, lead: 13, font: doc.f.ital, color: C.muted, onBreak: brk }); return; }
    let x = MARGIN; const maxH = 150, maxW = 220;
    let rowH = 0;
    for (const bytes of imgs) {
      try {
        const img = await doc.pdf.embedJpg(bytes);
        const s = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = img.width * s, h = img.height * s;
        if (x + w > MARGIN + W) { doc.y -= rowH + 8; x = MARGIN; rowH = 0; }
        if (doc.y - h - 8 < CONTENT_BOTTOM) { brk(); x = MARGIN; rowH = 0; }
        doc.page.drawImage(img, { x, y: doc.y - h - 4, width: w, height: h });
        x += w + 8; rowH = Math.max(rowH, h);
      } catch { /* Bild nicht lesbar: überspringen */ }
    }
    doc.y -= rowH + 10;
    return;
  }
  const text = answerText(field, value);
  const shown = text ? `${text}${field.unit && (field.type === "text" || field.type === "number") ? ` ${field.unit}` : ""}` : "–";
  doc.paragraph(shown, { size: 10, lead: 14, color: text ? C.text : C.muted, onBreak: brk });
}

export async function buildLeittextPdf(logoPng: Uint8Array, input: LeittextPdfInput): Promise<Uint8Array> {
  const doc = await Doc.create(logoPng, `Leittext ${input.leittext.title}`);
  await renderLeittext(doc, input);
  return doc.save();
}

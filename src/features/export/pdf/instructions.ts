/** Unterweisungsnachweis als PDF (B2, Abschnitt 3) – einzeln und als Abschnitt im Sammelexport. */
import type { ExportHeader } from "../types";
import { logo } from "./build";
import { A4, C, CONTENT_BOTTOM, Doc, MARGIN, type PageMeta } from "./doc";
import { dateDe, safeFileName } from "./text";
import { csvCell } from "./csv";

export interface InstructionPdfRecord {
  id: string; given_on: string | null; title: string; instructor_name: string | null; duration_minutes: number | null; status: string;
  confirmed_by_name: string | null; confirmed_role_label: string | null; reviewed_at: string | null; content_hash: string | null; points: string[];
}
export interface InstructionPdfTopic { title: string; interval: string; last: string | null; due: string | null; state: string }
export interface InstructionPdfInput {
  azubiId: string;
  header: ExportHeader;
  period: string;
  kpis: { label: string; value: string; hint: string }[];
  records: InstructionPdfRecord[];
  topics: InstructionPdfTopic[] | null;
}

const STATUS = { draft: "Entwurf", submitted: "Eingereicht", confirmed: "Bestätigt", rejected: "Zurückgewiesen" } as Record<string, string>;
export const INSTRUCTION_NOTE = "Einfache elektronische Bestätigung mit Zeitstempel und Prüfsumme – keine qualifizierte elektronische Signatur. Zeitpunkte sind Serverzeiten (Europe/Berlin).";
const W = A4.w - 2 * MARGIN;
const berlinDay = (iso: string | null) => iso ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso)) : "–";

export const instructionBeleg = (azubiId: string) => `Beleg-Nr. AZV-U-${azubiId.slice(0, 8).toUpperCase()}`;

export function instructionFileName(header: ExportHeader): string {
  const parts = (header.azubi_name ?? "").trim().split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1]! : parts[0] ?? "";
  const first = parts.length > 1 ? parts.slice(0, -1).join("_") : "";
  return `${safeFileName(`Unterweisungsnachweis_${last}_${first}`)}.pdf`;
}

/**
 * Abschnitt in ein bestehendes Dokument schreiben. full = Einzel-PDF (Kopf-Tabelle, Kennzahlen, Themenübersicht);
 * sonst nur die Tabelle der Nachweise (Sammelexport). Gibt die Startseite (1-basiert) zurück.
 */
export function renderInstructions(doc: Doc, inp: InstructionPdfInput, opts: { full: boolean; meta?: PageMeta }): number {
  const meta = opts.meta ?? { beleg: instructionBeleg(inp.azubiId), kind: "UNTERWEISUNGSNACHWEIS" };
  const wm = inp.records.some((r) => r.status !== "confirmed") ? "NICHT BESTÄTIGT" : null;
  const cont = () => { doc.newPage(meta, wm); doc.text("Unterweisungsnachweis · Fortsetzung", MARGIN, doc.y + 4, 9.5, doc.f.reg, C.muted); doc.y -= 14; };
  const need = (h: number) => { if (doc.y - h < CONTENT_BOTTOM) cont(); };
  doc.newPage(meta, wm);
  const start = doc.pages.length;
  doc.text(opts.full ? "Unterweisungsnachweis" : "Unterweisungsnachweise", MARGIN, doc.y, 15, doc.f.bold, C.text);
  doc.textRight(inp.period, A4.w - MARGIN, doc.y + 2, 10.5, doc.f.reg, C.brandDark);
  doc.y -= 26;
  const h = inp.header;
  if (opts.full) {
    const rows: [string, string][] = [["Auszubildende(r)", h.azubi_name ?? "–"]];
    if (h.personalnummer) rows.push(["Personalnummer", h.personalnummer]);
    rows.push(["Ausbildungsberuf", h.profession_name ?? "–"], ["Ausbildungsbetrieb", h.company_name ?? "–"],
      ["Ausbildungszeitraum", `${dateDe(h.training_start)} – ${dateDe(h.training_end)}`], ["Zuständig", h.ausbilder_name ?? "–"]);
    const cellH = 28, colW = W / 2, top = doc.y, tableH = 18 + Math.ceil(rows.length / 2) * cellH;
    doc.page.drawRectangle({ x: MARGIN, y: top - 18, width: W, height: 18, color: C.surface, borderColor: C.line, borderWidth: 0.5 });
    doc.text("ANGABEN ZUM AUSBILDUNGSVERHÄLTNIS", MARGIN + 8, top - 12, 7.5, doc.f.bold, C.brandDark);
    rows.forEach(([label, value], i) => {
      const cx = MARGIN + (i % 2) * colW, cy = top - 18 - Math.floor(i / 2) * cellH;
      doc.page.drawRectangle({ x: cx, y: cy - cellH, width: colW, height: cellH, borderColor: C.line, borderWidth: 0.5 });
      doc.text(label.toUpperCase(), cx + 8, cy - 10, 6.5, doc.f.reg, C.muted);
      doc.text(value, cx + 8, cy - 22, 9.5, doc.f.reg, C.text, colW - 16);
    });
    doc.y = top - tableH - 18;
    const bw = (W - 30) / 4;
    inp.kpis.forEach((k, i) => {
      const x = MARGIN + i * (bw + 10);
      doc.page.drawRectangle({ x, y: doc.y - 58, width: bw, height: 62, color: C.surface, borderColor: C.line, borderWidth: 0.6 });
      doc.text(k.label, x + 10, doc.y - 12, 8, doc.f.reg, C.muted, bw - 20);
      doc.text(k.value, x + 10, doc.y - 34, 18, doc.f.bold, C.brandDark, bw - 20);
      doc.text(k.hint, x + 10, doc.y - 48, 6.8, doc.f.reg, C.muted, bw - 20);
    });
    doc.y -= 80;
  }
  const heading = (t: string) => {
    need(50);
    doc.text(t, MARGIN, doc.y, 9, doc.f.bold, C.brandDark);
    doc.page.drawLine({ start: { x: MARGIN, y: doc.y - 5 }, end: { x: A4.w - MARGIN, y: doc.y - 5 }, thickness: 0.5, color: C.line });
    doc.y -= 18;
  };
  heading("UNTERWEISUNGSNACHWEISE");
  const cx = [MARGIN, MARGIN + 62, MARGIN + 262, MARGIN + 382, MARGIN + 422];
  const head = () => { ["DATUM", "THEMA", "UNTERWEISENDE PERSON", "DAUER", "STATUS"].forEach((t, i) => doc.text(t, cx[i]!, doc.y, 6.5, doc.f.bold, C.muted)); doc.y -= 4; };
  head();
  if (!inp.records.length) { doc.y -= 14; doc.text("Keine Nachweise im gewählten Zeitraum.", MARGIN, doc.y, 9.5, doc.f.reg, C.muted); doc.y -= 6; }
  for (const r of inp.records) {
    if (doc.y - 30 < CONTENT_BOTTOM) { cont(); head(); }
    doc.y -= 14;
    doc.text(dateDe(r.given_on), cx[0]!, doc.y, 8.5);
    doc.text(r.title, cx[1]!, doc.y, 8.5, doc.f.bold, C.text, 195);
    doc.text(r.instructor_name ?? "–", cx[2]!, doc.y, 8.5, doc.f.reg, C.text, 115);
    doc.text(r.duration_minutes ? `${r.duration_minutes} min` : "–", cx[3]!, doc.y, 8.5);
    doc.text(STATUS[r.status] ?? r.status, cx[4]!, doc.y, 8.5, doc.f.reg, r.status === "confirmed" ? C.text : C.warn);
    if (r.status === "confirmed") {
      doc.y -= 11;
      doc.text(`Bestätigt von ${r.confirmed_by_name ?? "–"} (${r.confirmed_role_label ?? "–"}) am ${berlinDay(r.reviewed_at)} · Prüfsumme ${(r.content_hash ?? "–").slice(0, 12)}`, cx[1]!, doc.y, 7.5, doc.f.reg, C.muted, W - 62);
      for (const p of r.points) {
        doc.paragraph(`• ${p}`, { size: 7.5, lead: 10, color: C.text, x: cx[1]! + 6, width: W - 74, onBreak: () => { cont(); } });
      }
    }
    doc.page.drawLine({ start: { x: MARGIN, y: doc.y - 5 }, end: { x: A4.w - MARGIN, y: doc.y - 5 }, thickness: 0.3, color: C.line });
    doc.y -= 4;
  }
  if (opts.full && inp.topics) {
    doc.y -= 20;
    heading("THEMENÜBERSICHT");
    const tx = [MARGIN, MARGIN + 220, MARGIN + 320, MARGIN + 375, MARGIN + 430];
    const th = () => { ["THEMA", "INTERVALL", "ZULETZT", "FÄLLIG AM", "ZUSTAND"].forEach((t, i) => doc.text(t, tx[i]!, doc.y, 6.5, doc.f.bold, C.muted)); doc.y -= 4; };
    th();
    for (const t of inp.topics) {
      if (doc.y - 16 < CONTENT_BOTTOM) { cont(); th(); }
      doc.y -= 13;
      doc.text(t.title, tx[0]!, doc.y, 8, doc.f.reg, C.text, 215);
      doc.text(t.interval, tx[1]!, doc.y, 8, doc.f.reg, C.text, 98);
      doc.text(dateDe(t.last), tx[2]!, doc.y, 8);
      doc.text(dateDe(t.due), tx[3]!, doc.y, 8);
      doc.text(t.state, tx[4]!, doc.y, 8, doc.f.reg, C.text, A4.w - MARGIN - tx[4]!);
    }
  }
  doc.y -= 24;
  need(30);
  doc.paragraph(INSTRUCTION_NOTE, { size: 8.5, lead: 12, color: C.muted, onBreak: cont });
  return start;
}

export async function buildInstructionPdf(inp: InstructionPdfInput): Promise<Uint8Array> {
  const doc = await Doc.create(await logo(), `Unterweisungsnachweis ${inp.header.azubi_name ?? ""}`);
  renderInstructions(doc, inp, { full: true });
  return doc.save();
}

export function instructionCsv(records: InstructionPdfRecord[]): string {
  const rows = ["nachweis_id,datum,thema,unterweisende_person,dauer_minuten,status,bestaetigt_von,bestaetigt_am,sha256"];
  for (const r of records) rows.push([r.id, r.given_on, r.title, r.instructor_name, r.duration_minutes, r.status, r.confirmed_by_name, r.reviewed_at, r.content_hash].map((v) => csvCell(v)).join(","));
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}

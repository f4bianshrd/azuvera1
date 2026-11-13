import { strToU8, zipSync } from "fflate";
import logoUrl from "@/assets/azuvera-icon-256.png";
import { loadBundle } from "../api";
import type { ExportHeader, ExportReport, ReportBundle } from "../types";
import { A4, C, CONTENT_BOTTOM, Doc, MARGIN } from "./doc";
import { METHOD_DE, STATUS_DE, belegNr, integrityOk, renderReport, reportPdfTitle, reportPeriodLabel } from "./report";
import { berlinDateTime, dateDe, safeFileName, safeFileNameWithExt } from "./text";
import { buildInstructionPdf, instructionCsv, renderInstructions, type InstructionPdfInput } from "./instructions";

export class ExportCancelled extends Error { constructor() { super("cancelled"); } }

let logoCache: Uint8Array | null = null;
export async function logo(): Promise<Uint8Array> {
  if (!logoCache) logoCache = new Uint8Array(await (await fetch(logoUrl)).arrayBuffer());
  return logoCache;
}
export const pause = () => new Promise<void>((r) => setTimeout(r, 0));

export interface Progress { done: number; total: number }
export interface BuildOptions { embedImages: boolean; blankSignatures: boolean; signal?: AbortSignal; onProgress?: (p: Progress) => void }

export function check(signal?: AbortSignal) { if (signal?.aborted) throw new ExportCancelled(); }

/** Einzel-PDF mit Signaturprotokoll. */
export async function buildSinglePdf(report: ExportReport, header: ExportHeader, o: { blankSignatures: boolean; embedImages?: boolean }, bundle?: ReportBundle): Promise<Uint8Array> {
  const b = bundle ?? await loadBundle(report, { embedImages: !!o.embedImages, withFiles: false, blankSignatures: o.blankSignatures });
  const doc = await Doc.create(await logo(), reportPdfTitle(b));
  await renderReport(doc, b, header, { embedImages: !!o.embedImages, blankSignatures: o.blankSignatures, withProtocol: true });
  return doc.save();
}

export function singleFileName(r: ExportReport): string {
  return r.report_type === "weekly"
    ? `${r.year}-KW${String(r.week_number).padStart(2, "0")}_Wochenbericht.pdf`
    : `${r.report_date}_Tagesbericht.pdf`;
}

export function exportBaseName(header: ExportHeader, periodLabel: string): string {
  const parts = (header.azubi_name ?? "").trim().split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1]! : parts[0] ?? "";
  const first = parts.length > 1 ? parts.slice(0, -1).join("_") : "";
  return safeFileName(`Berichtsheft_${last}_${first}_${periodLabel}`);
}

const SAMMEL = { beleg: "Sammelexport" };

/** Sammel-PDF: Deckblatt, Verzeichnis, Berichte, Sammelprotokoll. */
async function buildBulkPart(reports: ExportReport[], header: ExportHeader, period: string, o: BuildOptions, part: { i: number; n: number }, progress: { done: number; total: number }, instr?: InstructionPdfInput | null): Promise<Uint8Array> {
  const doc = await Doc.create(await logo(), "Berichtsheft");
  const W = A4.w - 2 * MARGIN;
  // Deckblatt
  doc.newPage(SAMMEL);
  const approved = reports.filter((r) => r.status === "approved").length;
  doc.page.drawImage(doc.logo, { x: (A4.w - 120) / 2, y: 520, width: 120, height: 120 });
  const center = (t: string, y: number, size: number, bold = false, color = C.text) => {
    const f = bold ? doc.f.bold : doc.f.reg;
    doc.text(t, (A4.w - f.widthOfTextAtSize(t, size)) / 2, y, size, f, color);
  };
  center("Berichtsheft", 480, 30, true, C.brandDark);
  center("Ausbildungsnachweis", 456, 13, false, C.muted);
  if (part.n > 1) center(`Teil ${part.i} von ${part.n}`, 436, 11, true, C.brand);
  const lines: [string, string][] = [
    ["Name", header.azubi_name ?? "–"], ["Beruf", header.profession_name ?? "–"],
    ["Betrieb", [header.company_name, header.company_address].filter(Boolean).join(", ") || "–"],
    ["Ausbildungszeitraum", `${dateDe(header.training_start)} – ${dateDe(header.training_end)}`],
    ["Zeitraum des Exports", period], ["Berichte", `${reports.length} (davon ${approved} freigegeben)`],
    ["Erstellt", berlinDateTime(doc.createdAt)],
  ];
  let y = 390;
  for (const [k, v] of lines) { doc.text(k.toUpperCase(), MARGIN + 40, y, 7, doc.f.reg, C.muted); doc.text(v, MARGIN + 40, y - 13, 11, doc.f.reg, C.text, W - 80); y -= 34; }

  // Verzeichnis – Seiten reservieren, Seitenzahlen danach eintragen
  const perPage = 32;
  const tocPages = Math.max(1, Math.ceil((reports.length + (instr ? 1 : 0)) / perPage));
  const tocStart = doc.pages.length;
  for (let i = 0; i < tocPages; i++) doc.newPage(SAMMEL);

  const startPages: number[] = [];
  const bundles: ReportBundle[] = [];
  for (let i = 0; i < reports.length; i++) {
    check(o.signal);
    const b = await loadBundle(reports[i]!, { embedImages: o.embedImages, withFiles: false, blankSignatures: o.blankSignatures });
    check(o.signal);
    startPages.push(doc.pages.length + 1);
    await renderReport(doc, b, header, { embedImages: o.embedImages, blankSignatures: o.blankSignatures, withProtocol: false });
    b.signatureImages.clear(); b.attachmentPng.clear();
    bundles.push(b);
    progress.done++;
    o.onProgress?.({ ...progress });
    if ((i + 1) % 5 === 0) await pause();
  }

  // Unterweisungsnachweise (nach den Berichten, vor dem Sammel-Signaturprotokoll)
  const instrPage = instr ? renderInstructions(doc, instr, { full: false, meta: SAMMEL }) : null;

  // Verzeichnis füllen
  for (let p = 0; p < tocPages; p++) {
    doc.page = doc.pages[tocStart + p]!.page;
    doc.y = 720;
    doc.text(p === 0 ? "INHALTSVERZEICHNIS" : "INHALTSVERZEICHNIS · Fortsetzung", MARGIN, doc.y, 12, doc.f.bold, C.brandDark);
    doc.y -= 22;
    const cols = [MARGIN, MARGIN + 150, MARGIN + 330, A4.w - MARGIN];
    doc.text("ZEITRAUM", cols[0]!, doc.y, 7, doc.f.bold, C.muted); doc.text("ART", cols[1]!, doc.y, 7, doc.f.bold, C.muted);
    doc.text("STATUS", cols[2]!, doc.y, 7, doc.f.bold, C.muted); doc.textRight("SEITE", cols[3]!, doc.y, 7, doc.f.bold, C.muted);
    doc.y -= 6;
    for (let i = p * perPage; i < Math.min(reports.length, (p + 1) * perPage); i++) {
      const b = bundles[i]!;
      doc.y -= 18;
      doc.text(reportPeriodLabel(b), cols[0]!, doc.y, 9.5);
      doc.text(reportPdfTitle(b), cols[1]!, doc.y, 9.5, doc.f.reg, C.text, 175);
      doc.text(STATUS_DE[b.report.status] ?? "", cols[2]!, doc.y, 9.5);
      doc.textRight(String(startPages[i]), cols[3]!, doc.y, 9.5, doc.f.bold);
      doc.page.drawLine({ start: { x: MARGIN, y: doc.y - 5 }, end: { x: A4.w - MARGIN, y: doc.y - 5 }, thickness: 0.3, color: C.line });
    }
    if (instrPage && p === tocPages - 1) {
      doc.y -= 18;
      doc.text("Unterweisungsnachweise", cols[0]!, doc.y, 9.5, doc.f.bold);
      doc.textRight(String(instrPage), cols[3]!, doc.y, 9.5, doc.f.bold);
      doc.page.drawLine({ start: { x: MARGIN, y: doc.y - 5 }, end: { x: A4.w - MARGIN, y: doc.y - 5 }, thickness: 0.3, color: C.line });
    }
  }

  // Sammel-Signaturprotokoll
  doc.newPage(SAMMEL);
  const brk = () => { doc.newPage(SAMMEL); };
  doc.text("NACHWEIS DER ELEKTRONISCHEN BESTÄTIGUNG", MARGIN, doc.y, 12, doc.f.bold, C.brandDark);
  doc.y -= 6;
  doc.paragraph("Einfache elektronische Bestätigung mit Zeitstempel und Prüfsumme – keine qualifizierte elektronische Signatur. Zeitpunkte sind Serverzeiten (Europe/Berlin).", { size: 9, lead: 13, color: C.muted, onBreak: brk });
  doc.y -= 14;
  const cx = [MARGIN, MARGIN + 105, MARGIN + 160, MARGIN + 265, MARGIN + 350, MARGIN + 405, MARGIN + 425];
  const head = () => { ["BERICHT", "ROLLE", "NAME", "ZEITPUNKT", "METHODE", "V.", "PRÜFSUMME"].forEach((t, i) => doc.text(t, cx[i]!, doc.y, 6.5, doc.f.bold, C.muted)); doc.y -= 4; };
  head();
  for (const b of bundles) for (const s of b.signatures) {
    if (doc.y - 14 < CONTENT_BOTTOM) { brk(); head(); }
    doc.y -= 13;
    const name = s.on_behalf_of ? `${s.signer_name} i. V.` : s.signer_name;
    doc.text(reportPeriodLabel(b), cx[0]!, doc.y, 7.5, doc.f.reg, C.text, 100);
    doc.text(s.role === "azubi" ? "Azubi" : "Ausbilder", cx[1]!, doc.y, 7.5);
    doc.text(name, cx[2]!, doc.y, 7.5, doc.f.reg, C.text, 100);
    doc.text(berlinDateTime(s.signed_at).replace(" Uhr", ""), cx[3]!, doc.y, 7.5);
    doc.text(METHOD_DE[s.method] ?? s.method, cx[4]!, doc.y, 7, doc.f.reg, C.text, 52);
    doc.text(String(s.report_version), cx[5]!, doc.y, 7.5);
    doc.text((s.content_hash ?? "–").slice(0, 16), cx[6]!, doc.y, 7, doc.f.mono);
  }
  if (doc.y - 80 < CONTENT_BOTTOM) brk();
  doc.y -= 26;
  doc.text("Integritätsprüfung beim Export", MARGIN, doc.y, 10, doc.f.bold);
  const checked = bundles.filter((b) => integrityOk(b) !== null);
  const bad = checked.filter((b) => integrityOk(b) === false);
  doc.y -= 15;
  if (!bad.length) doc.text(`${checked.length} von ${bundles.length} Berichten geprüft: Alle Prüfsummen stimmen überein.`, MARGIN, doc.y, 9.5);
  else {
    doc.text(`${checked.length} von ${bundles.length} Berichten geprüft. ACHTUNG – Abweichungen:`, MARGIN, doc.y, 9.5, doc.f.bold, C.warn);
    for (const b of bad) { if (doc.y - 14 < CONTENT_BOTTOM) brk(); doc.y -= 13; doc.text(`${reportPeriodLabel(b)} · ${belegNr(b.report.id)} · Bericht-ID ${b.report.id}`, MARGIN + 10, doc.y, 8.5, doc.f.reg, C.warn); }
  }
  return doc.save();
}

/** Sammel-PDF; über 100 Berichte → mehrere Teile im ZIP. */
export async function buildBulk(reports: ExportReport[], header: ExportHeader, period: string, base: string, o: BuildOptions, instr?: InstructionPdfInput | null): Promise<{ blob: Blob; filename: string }> {
  const progress = { done: 0, total: reports.length };
  const chunks: ExportReport[][] = [];
  for (let i = 0; i < reports.length; i += 100) chunks.push(reports.slice(i, i + 100));
  if (chunks.length === 1) {
    const bytes = await buildBulkPart(reports, header, period, o, { i: 1, n: 1 }, progress, instr);
    return { blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), filename: `${base}.pdf` };
  }
  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < chunks.length; i++) {
    files[`${base}_Teil${i + 1}von${chunks.length}.pdf`] = await buildBulkPart(chunks[i]!, header, period, o, { i: i + 1, n: chunks.length }, progress, i === chunks.length - 1 ? instr : null);
    await pause();
  }
  return { blob: new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: "application/zip" }), filename: `${base}.zip` };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const csv = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

/** ZIP mit Einzel-PDFs, Anlagen, Signaturprotokoll, Prüfsummen und LIESMICH. */
export async function buildZip(reports: ExportReport[], header: ExportHeader, period: string, base: string, o: BuildOptions, instr?: InstructionPdfInput | null): Promise<{ blob: Blob; filename: string }> {
  const files: Record<string, Uint8Array> = {};
  const rows = ["report_id,bericht,rolle,name,zeitpunkt,methode,version,sha256"];
  const used = new Set<string>();
  const uniq = (p: string) => { let n = p, i = 2; while (used.has(n)) { const d = p.lastIndexOf("."); n = `${p.slice(0, d)}_${i++}${p.slice(d)}`; } used.add(n); return n; };
  for (let i = 0; i < reports.length; i++) {
    check(o.signal);
    const r = reports[i]!;
    const b = await loadBundle(r, { embedImages: o.embedImages, withFiles: true, blankSignatures: o.blankSignatures });
    check(o.signal);
    files[uniq(`berichte/${singleFileName(r)}`)] = await buildSinglePdf(r, header, o, b);
    b.attachments.forEach((a, n) => { const f = b.attachmentFiles.get(a.id); if (f) files[uniq(`anlagen/${r.report_date}_${n + 1}_${safeFileNameWithExt(a.file_name)}`)] = f; });
    for (const s of b.signatures) rows.push([r.id, reportPeriodLabel(b), s.role, s.signer_name, berlinDateTime(s.signed_at), METHOD_DE[s.method] ?? s.method, s.report_version, s.content_hash ?? ""].map(csv).join(","));
    o.onProgress?.({ done: i + 1, total: reports.length });
    if ((i + 1) % 5 === 0) await pause();
  }
  files["signaturprotokoll.csv"] = strToU8(`\uFEFF${rows.join("\r\n")}\r\n`);
  if (instr) {
    files["unterweisungen/Unterweisungsnachweis.pdf"] = await buildInstructionPdf({ ...instr, topics: null });
    files["unterweisungen/unterweisungen.csv"] = strToU8(instructionCsv(instr.records));
  }
  const now = berlinDateTime(new Date());
  files["LIESMICH.txt"] = strToU8([
    "Azuvera – Berichtsheft (Export)", "",
    `Auszubildende(r): ${header.azubi_name ?? "–"}`, `Zeitraum: ${period}`, `Erstellt: ${now}`, "",
    "Inhalt:", "  berichte/            – je Bericht ein PDF mit Nachweis der elektronischen Bestätigung",
    "  anlagen/             – Original-Anhänge der Berichte", "  signaturprotokoll.csv – alle Unterschriften mit Prüfsumme",
    ...(instr ? ["  unterweisungen/      – Unterweisungsnachweis (PDF) und unterweisungen.csv"] : []),
    "  pruefsummen.txt      – SHA-256 jeder Datei in diesem Archiv", "",
    "Hinweis: Einfache elektronische Bestätigung mit Zeitstempel und Prüfsumme – keine qualifizierte elektronische Signatur.",
    "Zeitpunkte sind Serverzeiten (Europe/Berlin).", "",
  ].join("\r\n"));
  const sums: string[] = [];
  for (const name of Object.keys(files).sort()) sums.push(`${await sha256(files[name]!)}  ${name}`);
  files["pruefsummen.txt"] = strToU8(`${sums.join("\r\n")}\r\n`);
  return { blob: new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: "application/zip" }), filename: `${base}.zip` };
}

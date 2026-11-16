/** Vorlage und Sammelexport für Erfahrungsberichte – nutzt renderReport (Variante), Doc und die Text-Helfer aus 5A. */
import { strToU8, zipSync } from "fflate";
import { loadProgressContext } from "@/features/experience/api";
import { resolveProgress, type ResolvedProgress } from "@/features/experience/model";
import { formatPages, pageUnitLabel } from "@/features/experience/requirements";
import { experienceBundesland, loadExperienceBundle, type ExperienceBundle, type ExportExperience } from "../experience-api";
import type { ExportHeader } from "../types";
import { A4, C, CONTENT_BOTTOM, Doc, MARGIN } from "./doc";
import { check, logo, pause, type BuildOptions } from "./build";
import { METHOD_DE, STATUS_DE, belegNr, integrityOk, renderReport, type ReportVariant } from "./report";
import { berlinDateTime, dateDe, fitText, safeFileName, safeFileNameWithExt } from "./text";

export const EXPERIENCE_KIND_DE: Record<string, string> = { erfahrungsbericht: "Erfahrungsbericht", projektbericht: "Projektbericht", leittext: "Leittext" };

function wordCount(t: string): number { const s = t.trim(); return s ? s.split(/\s+/).length : 0; }

export interface ExperienceContext { header: ExportHeader; bundesland: string | null; progress: ResolvedProgress }

export async function loadExperienceContext(azubiId: string, header: ExportHeader): Promise<ExperienceContext> {
  const [ctx, bundesland] = await Promise.all([loadProgressContext(azubiId), experienceBundesland(azubiId)]);
  return { header, bundesland, progress: resolveProgress(ctx) };
}

export function experienceVariant(e: ExportExperience, c: ExperienceContext): ReportVariant {
  const h = c.header;
  const rows: [string, string][] = [["Auszubildende(r)", h.azubi_name ?? "–"]];
  if (h.personalnummer) rows.push(["Personalnummer", h.personalnummer]);
  rows.push(["Ausbildungsberuf", h.profession_name ?? "–"], ["Ausbildungsbetrieb", h.company_name ?? "–"]);
  if (c.bundesland) rows.push(["Bundesland", c.bundesland]);
  rows.push(["Datum", dateDe(e.written_on)], ["Art", EXPERIENCE_KIND_DE[e.kind] ?? e.kind]);
  if (e.area.trim()) rows.push(["Bereich im Betrieb", e.area]);
  const y = c.progress.yearOf(e.written_on);
  rows.push(["Ausbildungsjahr", y ? `${y}. Lehrjahr` : "–"], ["Status", STATUS_DE[e.status] ?? e.status], ["Version", String(e.version)]);
  return {
    title: EXPERIENCE_KIND_DE[e.kind] ?? "Erfahrungsbericht", rightLabel: dateDe(e.written_on), topic: e.title, rows,
    sections: [{ title: "Bericht", text: e.body }, { title: "Begründung und Bewertung", text: e.reasoning }],
  };
}

/** Einzel-PDF mit Signaturprotokoll. */
export async function buildExperiencePdf(e: ExportExperience, c: ExperienceContext, o: { blankSignatures: boolean }): Promise<Uint8Array> {
  const b = await loadExperienceBundle(e, { embedImages: false, withFiles: false, blankSignatures: o.blankSignatures });
  const doc = await Doc.create(await logo(), EXPERIENCE_KIND_DE[e.kind] ?? "Erfahrungsbericht");
  await renderReport(doc, b, c.header, { embedImages: false, blankSignatures: o.blankSignatures, withProtocol: true, variant: experienceVariant(e, c) });
  return doc.save();
}

export function experienceFileName(e: ExportExperience): string {
  return `${e.written_on}_${EXPERIENCE_KIND_DE[e.kind] ?? "Erfahrungsbericht"}_${safeFileName(e.title).slice(0, 40) || "ohne_Titel"}.pdf`;
}

const RESULT_DE: Record<string, string> = { done: "erfüllt", waiting: "eingereicht, Freigabe offen", open: "offen", late: "offen", upcoming: "folgt" };

/** (3a) Nachweis und (3b) Verzeichnis; liefert die Zeilen-Positionen für die Seitenzahlen. */
function renderProof(doc: Doc, items: ExportExperience[], c: ExperienceContext): { page: number; y: number }[] {
  const meta = { beleg: "Erfahrungsberichte" };
  const W = A4.w - 2 * MARGIN;
  const p = c.progress;
  const r = p.requirement;
  doc.newPage(meta);
  doc.text("NACHWEIS DER ERFAHRUNGSBERICHTE", MARGIN, doc.y, 13, doc.f.bold, C.brandDark);
  doc.y -= 18;
  doc.text([c.header.profession_name ?? "–", c.bundesland].filter(Boolean).join(" · "), MARGIN, doc.y, 10, doc.f.reg, C.text, W);
  doc.y -= 6;
  const n = r?.required_per_year ?? 2;
  const sentence = r?.required_basis === "official"
    ? `Pflicht laut ${r.source_issuer ?? "–"}: ${n} Erfahrungsberichte je Lehrjahr (Quelle: ${r.source_title ?? "–"}${r.source_stand ? `, Stand ${r.source_stand}` : ""})`
    : `Standardvorgabe von Azuvera: ${n} Erfahrungsberichte je Lehrjahr. Für diese Kombination ist keine amtliche Vorgabe hinterlegt.`;
  doc.paragraph(sentence, { size: 9.5, lead: 13, onBreak: () => doc.newPage(meta) });
  if (r && (r.hint_per_year != null || r.hint_total != null)) {
    const kind = r.hint_kind === "official" ? "Vorgabe" : "Empfehlung";
    const parts = [r.hint_per_year != null ? `${r.hint_per_year} je Lehrjahr` : null, r.hint_total != null ? `${r.hint_total} insgesamt` : null].filter(Boolean).join(" bzw. ");
    doc.paragraph(`${kind} der zuständigen Stelle: ${parts}`, { size: 9.5, lead: 13, onBreak: () => doc.newPage(meta) });
  }
  if (r?.min_pages != null) doc.paragraph(`Mindestumfang: ${formatPages(Number(r.min_pages))} ${pageUnitLabel(Number(r.min_pages), r.page_unit)}`, { size: 9.5, lead: 13, onBreak: () => doc.newPage(meta) });
  doc.y -= 14;
  const cols = [{ t: "Lehrjahr", w: 62 }, { t: "Zeitraum", w: 130 }, { t: "Soll", w: 36 }, { t: "freigegeben", w: 62 }, { t: "eingereicht", w: 62 }, { t: "freiwillig", w: 52 }, { t: "Ergebnis", w: W - 404 }];
  const row = (vals: string[], bold = false) => {
    let x = MARGIN;
    vals.forEach((v, i) => { doc.text(fitText(v, bold ? doc.f.bold : doc.f.reg, 8.5, cols[i]!.w - 4), x, doc.y, 8.5, bold ? doc.f.bold : doc.f.reg, C.text); x += cols[i]!.w; });
    doc.y -= 4;
    doc.page.drawLine({ start: { x: MARGIN, y: doc.y }, end: { x: A4.w - MARGIN, y: doc.y }, thickness: 0.4, color: C.line });
    doc.y -= 12;
  };
  doc.page.drawRectangle({ x: MARGIN, y: doc.y - 4, width: W, height: 16, color: C.surface });
  let x = MARGIN;
  for (const col of cols) { doc.text(col.t.toUpperCase(), x, doc.y + 1, 6.5, doc.f.bold, C.brandDark); x += col.w; }
  doc.y -= 16;
  if (!p.progress.hasYears) row(["–", "Ausbildungsbeginn fehlt", "–", "–", "–", "–", "–"]);
  for (const y of p.progress.years) row([`${y.year}. Lehrjahr`, `${dateDe(y.start)} – ${dateDe(y.end)}`, String(y.required), String(y.approved), String(y.submitted), String(y.extra), RESULT_DE[y.state] ?? y.state]);
  const t = p.progress.total;
  row(["Gesamt", "", String(t.required), String(t.approved), String(t.submitted), String(t.extra), t.fulfilled ? "erfüllt" : "offen"], true);
  doc.y -= 4;
  doc.paragraph(`Stand: ${berlinDateTime(doc.createdAt)}. Entwürfe und zurückgewiesene Erfahrungsberichte zählen nicht.`, { size: 8.5, lead: 12, color: C.muted, onBreak: () => doc.newPage(meta) });

  // (3b) Verzeichnis
  doc.newPage(meta);
  doc.text("VERZEICHNIS DER ERFAHRUNGSBERICHTE", MARGIN, doc.y, 12, doc.f.bold, C.brandDark);
  doc.y -= 20;
  const vcols = [{ t: "Nr.", w: 28 }, { t: "Datum", w: 62 }, { t: "Art", w: 86 }, { t: "Thema", w: W - 28 - 62 - 86 - 66 - 80 - 40 }, { t: "Lehrjahr", w: 66 }, { t: "Status", w: 80 }, { t: "Seite", w: 40 }];
  const head = () => { let hx = MARGIN; for (const col of vcols) { doc.text(col.t.toUpperCase(), hx, doc.y, 6.5, doc.f.bold, C.brandDark); hx += col.w; } doc.y -= 14; };
  head();
  const slots: { page: number; y: number }[] = [];
  items.forEach((e, i) => {
    if (doc.y - 14 < CONTENT_BOTTOM) { doc.newPage(meta); head(); }
    const y = c.progress.yearOf(e.written_on);
    const vals = [String(i + 1), dateDe(e.written_on), EXPERIENCE_KIND_DE[e.kind] ?? e.kind, e.title || "Ohne Titel", y ? `${y}. Lehrjahr` : "–", STATUS_DE[e.status] ?? e.status];
    let vx = MARGIN;
    vals.forEach((v, k) => { doc.text(fitText(v, doc.f.reg, 8.5, vcols[k]!.w - 4), vx, doc.y, 8.5, doc.f.reg, C.text); vx += vcols[k]!.w; });
    slots.push({ page: doc.pages.length - 1, y: doc.y });
    doc.y -= 14;
  });
  return slots;
}

function fillPageNumbers(doc: Doc, slots: { page: number; y: number }[], starts: number[]) {
  slots.forEach((s, i) => {
    const pg = doc.pages[s.page]?.page;
    if (pg && starts[i]) pg.drawText(String(starts[i]), { x: A4.w - MARGIN - 30, y: s.y, size: 8.5, font: doc.f.reg, color: C.text });
  });
}

/** Sammel-Signaturprotokoll für Erfahrungsberichte. */
function renderBulkProtocol(doc: Doc, bundles: ExperienceBundle[]) {
  const meta = { beleg: "Erfahrungsberichte" };
  const W = A4.w - 2 * MARGIN;
  doc.newPage(meta);
  doc.text("NACHWEIS DER ELEKTRONISCHEN BESTÄTIGUNG", MARGIN, doc.y, 12, doc.f.bold, C.brandDark);
  doc.y -= 6;
  doc.paragraph("Einfache elektronische Bestätigung mit Zeitstempel und Prüfsumme – keine qualifizierte elektronische Signatur. Zeitpunkte sind Serverzeiten (Europe/Berlin).", { size: 9, lead: 13, color: C.muted, onBreak: () => doc.newPage(meta) });
  doc.y -= 10;
  const cols = [{ t: "Bericht", w: 170 }, { t: "Rolle", w: 60 }, { t: "Name", w: 110 }, { t: "Zeitpunkt", w: 90 }, { t: "Methode", w: W - 430 }];
  const head = () => { let x = MARGIN; for (const c of cols) { doc.text(c.t.toUpperCase(), x, doc.y, 6.5, doc.f.bold, C.brandDark); x += c.w; } doc.y -= 13; };
  head();
  let checked = 0, ok = 0;
  for (const b of bundles) {
    const res = integrityOk(b);
    if (res !== null) { checked++; if (res) ok++; }
    for (const s of b.signatures) {
      if (doc.y - 13 < CONTENT_BOTTOM) { doc.newPage(meta); head(); }
      const vals = [`Erfahrungsbericht: ${b.experience.title.slice(0, 40)}`, s.role === "azubi" ? "Azubi" : "Ausbilder(in)", s.signer_name, berlinDateTime(s.signed_at), METHOD_DE[s.method] ?? s.method];
      let x = MARGIN;
      vals.forEach((v, i) => { doc.text(fitText(v, doc.f.reg, 8, cols[i]!.w - 4), x, doc.y, 8, doc.f.reg, C.text); x += cols[i]!.w; });
      doc.y -= 13;
    }
  }
  if (doc.y - 40 < CONTENT_BOTTOM) doc.newPage(meta);
  doc.y -= 10;
  const allOk = ok === checked;
  doc.text(`${checked} von ${bundles.length} Berichten und Erfahrungsberichten geprüft: ${allOk ? "alle Prüfsummen stimmen" : `${checked - ok} mit ACHTUNG`}`, MARGIN, doc.y, 9.5, allOk ? doc.f.reg : doc.f.bold, allOk ? C.text : C.warn, W);
}

/** Sammel-PDF nur mit Erfahrungsberichten: Deckblatt, Inhalt, Nachweis, Verzeichnis, Berichte, Sammelprotokoll. */
export async function buildExperienceBulk(items: ExportExperience[], c: ExperienceContext, period: string, o: BuildOptions): Promise<Uint8Array> {
  const doc = await Doc.create(await logo(), "Erfahrungsberichte");
  const W = A4.w - 2 * MARGIN;
  const h = c.header;
  const meta = { beleg: "Erfahrungsberichte" };
  doc.newPage(meta);
  const center = (t: string, y: number, size: number, bold = false, color = C.text) => {
    const f = bold ? doc.f.bold : doc.f.reg;
    doc.text(t, (A4.w - f.widthOfTextAtSize(t, size)) / 2, y, size, f, color);
  };
  doc.page.drawImage(doc.logo, { x: (A4.w - 120) / 2, y: 520, width: 120, height: 120 });
  center("Berichtsheft", 480, 30, true, C.brandDark);
  center("Ausbildungsnachweis", 456, 13, false, C.muted);
  const approved = items.filter((e) => e.status === "approved").length;
  const lines: [string, string][] = [
    ["Name", h.azubi_name ?? "–"], ["Beruf", h.profession_name ?? "–"],
    ["Betrieb", [h.company_name, h.company_address].filter(Boolean).join(", ") || "–"],
    ["Ausbildungszeitraum", `${dateDe(h.training_start)} – ${dateDe(h.training_end)}`],
    ["Zeitraum des Exports", period], ["Erfahrungsberichte", `${items.length} (davon ${approved} freigegeben)`],
    ["Erstellt", berlinDateTime(doc.createdAt)],
  ];
  let y = 390;
  for (const [k, v] of lines) { doc.text(k.toUpperCase(), MARGIN + 40, y, 7, doc.f.reg, C.muted); doc.text(v, MARGIN + 40, y - 13, 11, doc.f.reg, C.text, W - 80); y -= 34; }

  // Inhaltsverzeichnis (Gruppe „Erfahrungsberichte“)
  doc.newPage(meta);
  doc.text("INHALTSVERZEICHNIS", MARGIN, doc.y, 12, doc.f.bold, C.brandDark);
  doc.y -= 22;
  const tocPage = doc.pages.length - 1;
  const tocY = { proof: doc.y, list: doc.y - 16, reports: doc.y - 32, protocol: doc.y - 48 };
  doc.text("Erfahrungsberichte", MARGIN, tocY.proof + 16, 9, doc.f.bold, C.text);
  doc.text("Nachweis der Erfahrungsberichte", MARGIN + 12, tocY.proof, 9.5, doc.f.reg, C.text);
  doc.text("Verzeichnis", MARGIN + 12, tocY.list, 9.5, doc.f.reg, C.text);
  doc.text(`Erfahrungsberichte (${items.length})`, MARGIN + 12, tocY.reports, 9.5, doc.f.reg, C.text);
  doc.text("Nachweis der elektronischen Bestätigung", MARGIN + 12, tocY.protocol, 9.5, doc.f.reg, C.text);

  const proofStart = doc.pages.length + 1;
  const slots = renderProof(doc, items, c);
  const listStart = proofStart + 1;
  const starts: number[] = [];
  const bundles: ExperienceBundle[] = [];
  const reportsStart = doc.pages.length + 1;
  for (let i = 0; i < items.length; i++) {
    check(o.signal);
    const b = await loadExperienceBundle(items[i]!, { embedImages: o.embedImages, withFiles: false, blankSignatures: o.blankSignatures });
    check(o.signal);
    starts.push(doc.pages.length + 1);
    await renderReport(doc, b, h, { embedImages: o.embedImages, blankSignatures: o.blankSignatures, withProtocol: false, variant: experienceVariant(items[i]!, c), belegOverride: belegNr(items[i]!.id) });
    b.signatureImages.clear(); b.attachmentPng.clear();
    bundles.push(b);
    o.onProgress?.({ done: i + 1, total: items.length });
    if ((i + 1) % 5 === 0) await pause();
  }
  const protocolStart = doc.pages.length + 1;
  renderBulkProtocol(doc, bundles);
  fillPageNumbers(doc, slots, starts);
  const tp = doc.pages[tocPage]!.page;
  const num = (n: number, yy: number) => tp.drawText(String(n), { x: A4.w - MARGIN - 30, y: yy, size: 9.5, font: doc.f.reg, color: C.text });
  num(proofStart, tocY.proof); num(listStart, tocY.list); if (items.length) num(reportsStart, tocY.reports); num(protocolStart, tocY.protocol);
  return doc.save();
}

/** Nur Nachweis und Verzeichnis (für das ZIP). */
async function buildProofOnly(items: ExportExperience[], c: ExperienceContext): Promise<Uint8Array> {
  const doc = await Doc.create(await logo(), "Nachweis der Erfahrungsberichte");
  renderProof(doc, items, c);
  return doc.save();
}

const csvCell = (v: string | number | null | undefined): string => {
  let s = String(v ?? "");
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function experienceCsv(items: ExportExperience[], c: ExperienceContext, attachmentCounts: Map<string, number>): string {
  const head = ["experience_id", "datum", "art", "titel", "bereich", "lehrjahr", "status", "version", "woerter", "anhaenge", "eingereicht_am", "freigegeben_am"];
  const rows = [head.join(";")];
  for (const e of items) {
    const y = c.progress.yearOf(e.written_on);
    rows.push([e.id, dateDe(e.written_on), EXPERIENCE_KIND_DE[e.kind] ?? e.kind, e.title, e.area, y ?? "", STATUS_DE[e.status] ?? e.status, e.version, wordCount(e.body),
      attachmentCounts.get(e.id) ?? 0, e.submitted_at ? berlinDateTime(e.submitted_at) : "", e.status === "approved" && e.reviewed_at ? berlinDateTime(e.reviewed_at) : ""].map(csvCell).join(";"));
  }
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** ZIP: Einzel-PDFs, Anlagen, Nachweis, Übersicht, Signaturprotokoll, Prüfsummen und LIESMICH. */
export async function buildExperienceZip(items: ExportExperience[], c: ExperienceContext, o: BuildOptions): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  const unique = (name: string) => {
    let n = name, i = 2;
    const dot = name.lastIndexOf(".");
    while (used.has(n)) n = `${name.slice(0, dot)}_${i++}${name.slice(dot)}`;
    used.add(n);
    return n;
  };
  const counts = new Map<string, number>();
  const sigRows = ["report_id;rolle;name;zeitpunkt;methode;version;sha256;art"];
  for (let i = 0; i < items.length; i++) {
    check(o.signal);
    const e = items[i]!;
    const b = await loadExperienceBundle(e, { embedImages: false, withFiles: true, blankSignatures: o.blankSignatures });
    const doc = await Doc.create(await logo(), EXPERIENCE_KIND_DE[e.kind] ?? "Erfahrungsbericht");
    await renderReport(doc, b, c.header, { embedImages: false, blankSignatures: o.blankSignatures, withProtocol: true, variant: experienceVariant(e, c) });
    files[unique(`erfahrungsberichte/${experienceFileName(e)}`)] = await doc.save();
    counts.set(e.id, b.experienceAttachments.length);
    b.experienceAttachments.forEach((a, k) => {
      const bytes = b.attachmentFiles.get(a.id);
      if (bytes) files[unique(`anlagen_erfahrungsberichte/${e.written_on}_${k + 1}_${safeFileNameWithExt(a.file_name)}`)] = bytes;
    });
    for (const s of b.signatures) sigRows.push([e.id, s.role, s.signer_name, berlinDateTime(s.signed_at), s.method, s.report_version, s.content_hash ?? "", "erfahrungsbericht"].map(csvCell).join(";"));
    o.onProgress?.({ done: i + 1, total: items.length });
    if ((i + 1) % 3 === 0) await pause();
  }
  files["nachweis_erfahrungsberichte.pdf"] = await buildProofOnly(items, c);
  files["uebersicht_erfahrungsberichte.csv"] = strToU8(experienceCsv(items, c, counts));
  files["signaturprotokoll.csv"] = strToU8(`\uFEFF${sigRows.join("\r\n")}\r\n`);
  const sums: string[] = [];
  for (const [name, bytes] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) sums.push(`${await sha256Hex(bytes)}  ${name}`);
  files["pruefsummen.txt"] = strToU8(`${sums.join("\n")}\n`);
  files["LIESMICH.txt"] = strToU8([
    "Azuvera – Export der Erfahrungsberichte",
    `Auszubildende(r): ${c.header.azubi_name ?? "–"}`,
    `Erstellt: ${berlinDateTime(new Date())}`,
    `Erfahrungsberichte: ${items.length}`,
    "",
    "erfahrungsberichte/ – je Erfahrungsbericht ein PDF mit Signaturprotokoll",
    "anlagen_erfahrungsberichte/ – angehängte Fotos und PDF-Dateien",
    "nachweis_erfahrungsberichte.pdf – Nachweis je Lehrjahr und Verzeichnis",
    "uebersicht_erfahrungsberichte.csv – Übersicht (Semikolon, UTF-8)",
    "signaturprotokoll.csv – alle Unterschriften",
    "pruefsummen.txt – SHA-256 aller Dateien",
  ].join("\n") + "\n");
  return zipSync(files, { level: 6 });
}

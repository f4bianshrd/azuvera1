/** Prüfungsmappe: Deckblatt, Inhalt, Übersicht, Prüfungsantrag, Zeugnis, Noten, Abwesenheiten, Unterweisungen, Berichte, Erfahrungsberichte, Leittexte – ein PDF. */
import { loadBundle } from "../api";
import { ABSENCE_TYPE_DE, GRADE_KIND_DE, absenceDays, gradeAverages, type FolderAbsence, type FolderGrade } from "../folder-summary";
import type { ExportHeader, ExportReport, ReportBundle } from "../types";
import { check, logo, pause, type BuildOptions } from "./build";
import { A4, C, CONTENT_BOTTOM, Doc, MARGIN } from "./doc";
import { STATUS_DE, belegNr, integrityOk, renderReport, reportPdfTitle, reportPeriodLabel } from "./report";
import { berlinDateTime, dateDe } from "./text";
import { renderLeittext, type LeittextPdfInput } from "./leittext";
import { renderApplication, renderCertificate, type ApplicationPdfInput, type CertificatePdfInput } from "./certificate";
import { renderInstructions, type InstructionPdfInput } from "./instructions";
import { EXPERIENCE_KIND_DE, experienceVariant, type ExperienceContext } from "./experienceReport";
import { loadExperienceBundle, type ExportExperience } from "../experience-api";

export interface FolderInput {
  header: ExportHeader;
  reports: ExportReport[];
  grades: FolderGrade[];
  absences: FolderAbsence[];
  period: string;
  from: string | null;
  to: string | null;
  compiledBy: string;
  include: { grades: boolean; absences: boolean; reports: boolean; leittexte?: boolean; experiences?: boolean; instructions?: boolean; certificate?: boolean; application?: boolean };
  /** Leittexte (bereits mit Bildern geladen), erscheinen nach den Berichten. */
  leittexte?: LeittextPdfInput[];
  /** Erfahrungsberichte mit Kontext (Lehrjahr, Bundesland). */
  experiences?: { items: ExportExperience[]; ctx: ExperienceContext } | null;
  instructions?: InstructionPdfInput | null;
  certificate?: CertificatePdfInput | null;
  application?: ApplicationPdfInput | null;
}

const META = { beleg: "Prüfungsmappe" };
const W = A4.w - 2 * MARGIN;

export async function buildExamFolder(inp: FolderInput, o: BuildOptions): Promise<Uint8Array> {
  const doc = await Doc.create(await logo(), `Prüfungsmappe ${inp.header.azubi_name ?? ""}`);
  const h = inp.header;
  const brk = () => { doc.newPage(META); };
  const need = (n: number, again?: () => void) => { if (doc.y - n < CONTENT_BOTTOM) { brk(); again?.(); } };
  const title = (t: string) => { doc.text(t.toUpperCase(), MARGIN, doc.y, 13, doc.f.bold, C.brandDark); doc.y -= 8; doc.page.drawRectangle({ x: MARGIN, y: doc.y, width: 34, height: 2.5, color: C.brand }); doc.y -= 20; };

  // Deckblatt
  doc.newPage(META);
  const center = (t: string, y: number, size: number, bold = false, color = C.text) => {
    const f = bold ? doc.f.bold : doc.f.reg;
    doc.text(t, (A4.w - f.widthOfTextAtSize(t, size)) / 2, y, size, f, color);
  };
  doc.page.drawImage(doc.logo, { x: (A4.w - 110) / 2, y: 540, width: 110, height: 110 });
  center("Prüfungsmappe", 496, 32, true, C.brandDark);
  center("Berichte und Leistungsnachweise in einem Dokument", 472, 12, false, C.muted);
  const approved = inp.reports.filter((r) => r.status === "approved").length;
  const rows: [string, string][] = [
    ["Name", h.azubi_name ?? "–"], ["Beruf", h.profession_name ?? "–"],
    ["Betrieb", [h.company_name, h.company_address].filter(Boolean).join(", ") || "–"],
    ["Ausbildungszeitraum", `${dateDe(h.training_start)} – ${dateDe(h.training_end)}`],
    ["Zeitraum der Mappe", inp.period],
    ["Zuständig", h.ausbilder_name ?? "–"],
    ["Zusammengestellt von", inp.compiledBy],
    ["Erstellt", berlinDateTime(doc.createdAt)],
  ];
  let y = 410;
  for (const [k, v] of rows) { doc.text(k.toUpperCase(), MARGIN + 40, y, 7, doc.f.reg, C.muted); doc.text(v, MARGIN + 40, y - 13, 11, doc.f.reg, C.text, W - 80); y -= 32; }

  // Inhaltsverzeichnis reservieren
  const perPage = 26;
  const ltCount = inp.include.leittexte ? inp.leittexte?.length ?? 0 : 0;
  const exCount = inp.include.experiences ? inp.experiences?.items.length ?? 0 : 0;
  const tocPages = Math.max(1, Math.ceil(((inp.include.reports ? inp.reports.length : 0) + ltCount + exCount + 13) / perPage));
  const tocStart = doc.pages.length;
  for (let i = 0; i < tocPages; i++) doc.newPage(META);
  const sections: { label: string; page: number }[] = [];

  // Übersicht
  doc.newPage(META); sections.push({ label: "Übersicht", page: doc.pages.length });
  title("Übersicht");
  const avg = gradeAverages(inp.grades);
  const days = absenceDays(inp.absences, inp.from, inp.to);
  const exams = inp.grades.filter((g) => g.kind === "klausur" || g.kind === "test").length;
  const kpis: [string, string, string][] = [
    ["Berichte", String(inp.reports.length), `${approved} freigegeben`],
    ["Prüfungen", String(exams), `${inp.grades.length} Leistungsnachweise`],
    ["Ø Note", avg.overall ?? "–", avg.subjects.length ? `${avg.subjects.length} Fächer` : "keine Noten"],
    ["Abwesenheit", String(days.reduce((s, d) => s + d.days, 0)), "Werktage (genehmigt)"],
  ];
  const bw = (W - 3 * 10) / 4;
  kpis.forEach(([l, v, hint], i) => {
    const x = MARGIN + i * (bw + 10);
    doc.page.drawRectangle({ x, y: doc.y - 62, width: bw, height: 66, color: C.surface, borderColor: C.line, borderWidth: 0.6 });
    doc.text(l, x + 10, doc.y - 12, 8, doc.f.reg, C.muted, bw - 20);
    doc.text(v, x + 10, doc.y - 36, 20, doc.f.bold, C.brandDark, bw - 20);
    doc.text(hint, x + 10, doc.y - 52, 7, doc.f.reg, C.muted, bw - 20);
  });
  doc.y -= 90;
  const statusRows = (["approved", "submitted", "rejected"] as const).map((s) => [STATUS_DE[s] ?? s, inp.reports.filter((r) => r.status === s).length] as const);
  doc.text("Berichte nach Status", MARGIN, doc.y, 10, doc.f.bold); doc.y -= 16;
  for (const [l, n] of statusRows) { doc.text(l, MARGIN + 6, doc.y, 9.5); doc.textRight(String(n), MARGIN + 220, doc.y, 9.5, doc.f.bold); doc.y -= 14; }

  // Antrag auf Prüfungszulassung und Ausbildungszeugnis
  if (inp.include.application && inp.application) {
    sections.push({ label: `Antrag auf Prüfungszulassung (${inp.application.application.exam_term || "ohne Termin"})`, page: doc.pages.length + 1 });
    renderApplication(doc, inp.application);
  }
  if (inp.include.certificate && inp.certificate) {
    sections.push({ label: "Ausbildungszeugnis", page: doc.pages.length + 1 });
    renderCertificate(doc, inp.certificate);
  }

  // Prüfungen und Noten
  if (inp.include.grades) {
    doc.newPage(META); sections.push({ label: "Prüfungen und Noten", page: doc.pages.length });
    title("Prüfungen und Noten");
    if (!inp.grades.length) doc.text("Im gewählten Zeitraum sind keine Noten eingetragen.", MARGIN, doc.y, 10, doc.f.reg, C.muted);
    else {
      const cx = [MARGIN, MARGIN + 70, MARGIN + 230, MARGIN + 300, MARGIN + 345];
      const head = () => {
        doc.page.drawRectangle({ x: MARGIN, y: doc.y - 5, width: W, height: 16, color: C.surface });
        ["DATUM", "FACH", "ART", "NOTE", "BEMERKUNG"].forEach((t, i) => doc.text(t, cx[i]! + 4, doc.y, 7, doc.f.bold, C.muted));
        doc.y -= 18;
      };
      head();
      for (const g of [...inp.grades].sort((a, b) => a.grade_date.localeCompare(b.grade_date))) {
        need(16, head);
        doc.text(dateDe(g.grade_date), cx[0]! + 4, doc.y, 9);
        doc.text(g.subject, cx[1]! + 4, doc.y, 9, doc.f.reg, C.text, 150);
        doc.text(GRADE_KIND_DE[g.kind] ?? g.kind, cx[2]! + 4, doc.y, 9);
        doc.text(Number(g.grade).toFixed(1).replace(".", ","), cx[3]! + 4, doc.y, 9, doc.f.bold);
        doc.text(g.note ?? "", cx[4]! + 4, doc.y, 8.5, doc.f.reg, C.muted, A4.w - MARGIN - cx[4]! - 8);
        doc.page.drawLine({ start: { x: MARGIN, y: doc.y - 5 }, end: { x: A4.w - MARGIN, y: doc.y - 5 }, thickness: 0.3, color: C.line });
        doc.y -= 16;
      }
      need(60); doc.y -= 14;
      doc.text("Durchschnitt je Fach", MARGIN, doc.y, 10, doc.f.bold); doc.y -= 18;
      for (const s of avg.subjects) {
        need(16);
        doc.text(s.subject, MARGIN + 4, doc.y, 9.5, doc.f.reg, C.text, 230);
        doc.text(`${s.count} Noten · ${s.exams} Prüfungen`, MARGIN + 250, doc.y, 8.5, doc.f.reg, C.muted);
        doc.textRight(s.average, A4.w - MARGIN - 4, doc.y, 9.5, doc.f.bold);
        doc.y -= 15;
      }
      need(20); doc.page.drawLine({ start: { x: MARGIN, y: doc.y + 8 }, end: { x: A4.w - MARGIN, y: doc.y + 8 }, thickness: 0.6, color: C.line });
      doc.text("Gesamt", MARGIN + 4, doc.y - 4, 10, doc.f.bold); doc.textRight(avg.overall ?? "–", A4.w - MARGIN - 4, doc.y - 4, 10, doc.f.bold, C.brandDark);
      doc.y -= 20;
    }
  }

  // Abwesenheiten
  if (inp.include.absences) {
    need(140);
    if (!inp.include.grades) brk(); else doc.y -= 24;
    sections.push({ label: "Abwesenheiten", page: doc.pages.length });
    title("Abwesenheiten");
    if (!days.length) doc.text("Keine genehmigten Abwesenheiten im gewählten Zeitraum.", MARGIN, doc.y, 10, doc.f.reg, C.muted);
    for (const d of days) { need(16); doc.text(ABSENCE_TYPE_DE[d.type] ?? d.type, MARGIN + 4, doc.y, 9.5); doc.textRight(`${d.days} Werktage`, MARGIN + 260, doc.y, 9.5, doc.f.bold); doc.y -= 15; }
    doc.y -= 6;
    for (const a of inp.absences.filter((x) => x.status === "approved").sort((x, z) => x.date_from.localeCompare(z.date_from))) {
      need(14);
      doc.text(`${dateDe(a.date_from)} – ${dateDe(a.date_to)}`, MARGIN + 4, doc.y, 8.5, doc.f.reg, C.muted);
      doc.text(ABSENCE_TYPE_DE[a.type] ?? a.type, MARGIN + 160, doc.y, 8.5, doc.f.reg, C.muted);
      doc.y -= 13;
    }
  }

  // Unterweisungen
  if (inp.include.instructions && inp.instructions) {
    const start = renderInstructions(doc, inp.instructions, { full: true, meta: META });
    sections.push({ label: `Unterweisungen (${inp.instructions.records.length})`, page: start });
  }

  // Berichte
  const starts: number[] = [];
  const bundles: ReportBundle[] = [];
  if (inp.include.reports && inp.reports.length) {
    sections.push({ label: `Berichte (${inp.reports.length})`, page: doc.pages.length + 1 });
    for (let i = 0; i < inp.reports.length; i++) {
      check(o.signal);
      const b = await loadBundle(inp.reports[i]!, { embedImages: o.embedImages, withFiles: false, blankSignatures: o.blankSignatures });
      check(o.signal);
      starts.push(doc.pages.length + 1);
      await renderReport(doc, b, inp.header, { embedImages: o.embedImages, blankSignatures: o.blankSignatures, withProtocol: false });
      b.signatureImages.clear(); b.attachmentPng.clear();
      bundles.push(b);
      o.onProgress?.({ done: i + 1, total: inp.reports.length });
      if ((i + 1) % 5 === 0) await pause();
    }
    // Nachweis
    doc.newPage(META); sections.push({ label: "Nachweis der Prüfsummen", page: doc.pages.length });
    title("Nachweis der Prüfsummen");
    doc.paragraph("Einfache elektronische Bestätigung mit Zeitstempel und Prüfsumme – keine qualifizierte elektronische Signatur. Beim Erstellen der Mappe wurde jede Prüfsumme mit den Unterschriften verglichen.", { size: 9, lead: 13, color: C.muted, onBreak: brk });
    doc.y -= 16;
    const checked = bundles.filter((b) => integrityOk(b) !== null);
    const bad = checked.filter((b) => integrityOk(b) === false);
    if (!bad.length) doc.text(`${checked.length} von ${bundles.length} Berichten geprüft: Alle Prüfsummen stimmen überein.`, MARGIN, doc.y, 10, doc.f.bold);
    else {
      doc.text(`${checked.length} von ${bundles.length} Berichten geprüft. ACHTUNG – Abweichungen:`, MARGIN, doc.y, 10, doc.f.bold, C.warn);
      for (const b of bad) { need(14); doc.y -= 13; doc.text(`${reportPeriodLabel(b)} · Bericht-ID ${b.report.id}`, MARGIN + 10, doc.y, 8.5, doc.f.reg, C.warn); }
    }
  }

  // Erfahrungsberichte
  const exStarts: { title: string; sub: string; status: string; page: number }[] = [];
  if (inp.include.experiences && inp.experiences?.items.length) {
    const { items, ctx } = inp.experiences;
    sections.push({ label: `Erfahrungsberichte (${items.length})`, page: doc.pages.length + 1 });
    for (const e of items) {
      check(o.signal);
      const b = await loadExperienceBundle(e, { embedImages: o.embedImages, withFiles: false, blankSignatures: o.blankSignatures });
      check(o.signal);
      exStarts.push({ title: dateDe(e.written_on), sub: `${EXPERIENCE_KIND_DE[e.kind] ?? "Erfahrungsbericht"}: ${e.title}`, status: STATUS_DE[e.status] ?? "", page: doc.pages.length + 1 });
      await renderReport(doc, b, inp.header, { embedImages: o.embedImages, blankSignatures: o.blankSignatures, withProtocol: false, variant: experienceVariant(e, ctx), belegOverride: belegNr(e.id) });
      b.signatureImages.clear(); b.attachmentPng.clear();
      await pause();
    }
  }

  // Leittexte
  const ltStarts: { title: string; status: string; page: number }[] = [];
  if (inp.include.leittexte && inp.leittexte?.length) {
    sections.push({ label: `Leittexte (${inp.leittexte.length})`, page: doc.pages.length + 1 });
    for (const lt of inp.leittexte) {
      check(o.signal);
      ltStarts.push({ title: lt.leittext.title, status: STATUS_DE[lt.work?.status ?? ""] ?? "", page: doc.pages.length + 1 });
      await renderLeittext(doc, lt);
      await pause();
    }
  }

  // Inhaltsverzeichnis füllen
  const entries: { label: string; sub?: string; status?: string; page: number; strong: boolean }[] = [];
  for (const s of sections) {
    entries.push({ label: s.label, page: s.page, strong: true });
    if (s.label.startsWith("Erfahrungsberichte")) exStarts.forEach((x) => entries.push({ label: x.title, sub: x.sub, status: x.status, page: x.page, strong: false }));
    if (s.label.startsWith("Leittexte")) ltStarts.forEach((l) => entries.push({ label: l.title, status: l.status, page: l.page, strong: false }));
    if (s.label.startsWith("Berichte")) bundles.forEach((b, i) => entries.push({ label: reportPeriodLabel(b), sub: reportPdfTitle(b), status: STATUS_DE[b.report.status] ?? "", page: starts[i]!, strong: false }));
  }
  for (let p = 0; p < tocPages; p++) {
    doc.page = doc.pages[tocStart + p]!.page;
    doc.y = 720;
    title(p === 0 ? "Inhalt" : "Inhalt · Fortsetzung");
    for (const e of entries.slice(p * perPage, (p + 1) * perPage)) {
      doc.y -= e.strong ? 20 : 16;
      if (e.strong) doc.text(e.label, MARGIN, doc.y, 10.5, doc.f.bold, C.text, 380);
      else {
        doc.text(e.label, MARGIN + 14, doc.y, 9);
        doc.text(e.sub ?? "", MARGIN + 160, doc.y, 9, doc.f.reg, C.muted, 200);
        doc.text(e.status ?? "", MARGIN + 370, doc.y, 8.5, doc.f.reg, C.muted);
      }
      doc.textRight(String(e.page), A4.w - MARGIN, doc.y, e.strong ? 10.5 : 9, e.strong ? doc.f.bold : doc.f.reg);
      doc.page.drawLine({ start: { x: MARGIN, y: doc.y - 5 }, end: { x: A4.w - MARGIN, y: doc.y - 5 }, thickness: 0.3, color: C.line });
    }
  }
  return doc.save();
}

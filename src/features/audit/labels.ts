/** Reine Texte und Formatierungen für das Änderungsprotokoll (ohne Datenbankzugriff, testbar). */

export interface AuditEntry {
  id: number;
  created_at: string;
  actor_id: string | null;
  actor_role: string | null;
  azubi_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  details: unknown;
  row_hash: string | null;
}

export const FIELD_LABELS: Record<string, string> = {
  activities: "Tätigkeiten",
  school_content: "Berufsschule",
  instructions: "Unterweisungen",
  summary: "Zusammenfassung",
  weekly_mode: "Berichtsform",
  report_date: "Datum",
};

const METHOD_LABELS: Record<string, string> = {
  draw: "Gezeichnet",
  saved: "Gespeicherte Unterschrift",
  click: "Klick-Bestätigung",
};

/** Aktionen der Filter-Auswahl auf /protokoll (Reihenfolge = Anzeige). */
export const ACTION_LABELS: Record<string, string> = {
  create: "Bericht angelegt",
  edit: "Bericht bearbeitet",
  delete: "Entwurf gelöscht",
  attachment_add: "Anhang hinzugefügt",
  attachment_delete: "Anhang entfernt",
  ai_assist: "KI-Textvorschlag übernommen",
  submit: "Eingereicht",
  approve: "Freigegeben",
  reject: "Zurückgewiesen",
  reopen: "Wieder geöffnet",
  comment: "Kommentar geschrieben",
  review: "Abwesenheit entschieden",
  deputy_set: "Vertretung eingetragen",
  deputy_revoke: "Vertretung beendet",
  pdf_export: "PDF exportiert",
  reminder_sent: "Erinnerung gesendet",
  consent_granted: "Einwilligung erteilt",
  consent_revoked: "Einwilligung widerrufen",
  data_export: "Daten exportiert",
  deletion_requested: "Löschantrag gestellt",
  deletion_rejected: "Löschantrag abgelehnt",
  account_deleted: "Konto gelöscht oder geschlossen",
  plan_set: "Ausbildungsplan zugeordnet",
  plan_saved: "Ausbildungsplan gespeichert",
  plan_export: "Ausbildungsplan exportiert",
  link_code_created: "Verknüpfungscode erstellt",
  link_code_revoked: "Verknüpfungscode widerrufen",
  link_created: "Verknüpfung hergestellt",
  link_removed: "Verknüpfung entfernt",
};

/** Ältere Verwaltungs-Ereignisse aus Baustein 1B (nicht im Filter, aber lesbar). */
const LEGACY_LABELS: Record<string, string> = {
  role_changed: "Rolle geändert",
  azubi_assignment_changed: "Zuweisung geändert",
  viewers_changed: "Lesezugriff geändert",
  invite_code_created: "Einladungs-Code erzeugt",
  invite_code_revoked: "Einladungs-Code widerrufen",
  invite_code_redeemed: "Einladungs-Code eingelöst",
  profession_set: "Beruf gesetzt",
};

export const ENTITY_LABELS: Record<string, string> = {
  report: "Bericht",
  plan: "Ausbildungsplan",
  absence: "Abwesenheit",
  deputy: "Vertretung",
  consent: "Einwilligung",
  export: "Export",
  reminder: "Erinnerung",
  account: "Konto",
};

export const HISTORY_FILTERS = {
  all: null,
  status: ["submit", "approve", "reject", "reopen"],
  changes: ["create", "edit", "delete", "attachment_add", "attachment_delete", "ai_assist"],
  comments: ["comment"],
} as const;
export type HistoryFilter = keyof typeof HISTORY_FILTERS;

export function matchesHistoryFilter(action: string, filter: HistoryFilter): boolean {
  const list = HISTORY_FILTERS[filter] as readonly string[] | null;
  return list === null || list.includes(action);
}

export function shortHash(hash: unknown): string | null {
  return typeof hash === "string" && hash.length > 0 ? hash.slice(0, 12) : null;
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function dateDe(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** „09.11.2026, 14:32 Uhr“ in Europe/Berlin. */
export function formatAuditTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")}, ${get("hour")}:${get("minute")} Uhr`;
}

/** „2026-11-09 14:32:05“ in Europe/Berlin (für CSV). */
export function berlinIso(iso: string): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date(iso));
  return parts.replace(",", "");
}

interface Details {
  version?: unknown; content_hash?: unknown; report_type?: unknown; report_date?: unknown; fields?: unknown;
  mime_type?: unknown; size_bytes?: unknown; sha256?: unknown; field?: unknown; method?: unknown;
  on_behalf_of?: unknown; section?: unknown; kind?: unknown; count?: unknown; status?: unknown;
}
function asDetails(d: unknown): Details {
  return d && typeof d === "object" && !Array.isArray(d) ? (d as Details) : {};
}
const sectionLabel = (v: unknown): string | null => (typeof v === "string" ? FIELD_LABELS[v] ?? v : null);

export interface DescribedEntry {
  /** Haupttext, z. B. „Freigegeben (Version 3)“. */
  title: string;
  /** Lesbare Einzelheiten, z. B. „Methode: Klick-Bestätigung“. */
  details: string[];
}

/** Haupttext und Einzelheiten eines Eintrags; `names` löst „i. V. für“ auf. */
export function describeEntry(entry: Pick<AuditEntry, "action" | "details">, names?: Map<string, string>): DescribedEntry {
  const d = asDetails(entry.details);
  const version = typeof d.version === "number" ? d.version : null;
  const v = version !== null ? ` (Version ${version})` : "";
  const hash = shortHash(d.content_hash);
  const hashLine = hash ? [`Prüfsumme ${hash}`] : [];
  switch (entry.action) {
    case "create": {
      const type = d.report_type === "weekly" ? "Wochenbericht" : d.report_type === "daily" ? "Tagesbericht" : null;
      const date = typeof d.report_date === "string" ? dateDe(d.report_date) : null;
      return { title: "Bericht angelegt", details: [[type, date].filter(Boolean).join(" · ")].filter(Boolean) };
    }
    case "edit": {
      const fields = Array.isArray(d.fields) ? d.fields.map((f) => FIELD_LABELS[String(f)] ?? String(f)) : [];
      return { title: "Bericht bearbeitet", details: [fields.length ? `Abschnitte: ${fields.join(", ")}` : "", version !== null ? `Version ${version}` : ""].filter(Boolean) };
    }
    case "delete":
      return { title: "Entwurf gelöscht", details: [] };
    case "attachment_add": {
      const mime = typeof d.mime_type === "string" ? d.mime_type : "";
      const kind = mime.startsWith("image/") ? "Bild" : mime === "application/pdf" ? "PDF" : "Datei";
      const size = typeof d.size_bytes === "number" ? `, ${sizeLabel(d.size_bytes)}` : "";
      const sha = shortHash(d.sha256);
      return { title: `Anhang hinzugefügt (${kind}${size})`, details: sha ? [`Prüfsumme ${sha}`] : [] };
    }
    case "attachment_delete":
      return { title: "Anhang entfernt", details: [] };
    case "ai_assist": {
      const s = sectionLabel(d.field);
      return { title: `KI-Textvorschlag übernommen${s ? ` (Abschnitt ${s})` : ""}`, details: [] };
    }
    case "submit":
      return { title: `Eingereicht${v}`, details: hashLine };
    case "approve": {
      const method = typeof d.method === "string" ? METHOD_LABELS[d.method] ?? d.method : null;
      const behalf = typeof d.on_behalf_of === "string" && d.on_behalf_of ? `i. V. für ${names?.get(d.on_behalf_of) ?? "Unbekannt"}` : null;
      return { title: `Freigegeben${v}`, details: [method ? `Methode: ${method}` : null, behalf, ...hashLine].filter((x): x is string => !!x) };
    }
    case "reject":
      return { title: `Zurückgewiesen${v}`, details: hashLine };
    case "reopen":
      return { title: `Wieder geöffnet${v}`, details: [] };
    case "comment": {
      const s = sectionLabel(d.section);
      return { title: `Kommentar geschrieben${s ? ` (Abschnitt ${s})` : ""}`, details: [] };
    }
    case "pdf_export": {
      const kind = d.kind === "zip" ? "ZIP" : d.kind === "bulk" ? "Sammel-PDF" : d.kind === "single" ? "Einzel-PDF" : null;
      const count = typeof d.count === "number" ? `${d.count} Bericht${d.count === 1 ? "" : "e"}` : null;
      return { title: "PDF exportiert", details: [[kind, count].filter(Boolean).join(" · ")].filter(Boolean) };
    }
    case "plan_export":
      return { title: "Ausbildungsplan exportiert", details: [d.kind === "plan_odt" ? "ODT" : "PDF"] };
    case "account_deleted": {
      const d2 = entry.details as { mode?: unknown } | null;
      return { title: d2 && typeof d2 === "object" && d2.mode === "anonymized" ? "Konto geschlossen" : "Konto gelöscht", details: [] };
    }
    case "review": {
      const st = d.status === "approved" ? "Genehmigt" : d.status === "rejected" ? "Abgelehnt" : null;
      return { title: "Abwesenheit entschieden", details: st ? [st] : [] };
    }
    default:
      return { title: ACTION_LABELS[entry.action] ?? LEGACY_LABELS[entry.action] ?? entry.action, details: [] };
  }
}

/** IDs, deren Namen für die Einzelheiten gebraucht werden (Vertretung). */
export function referencedIds(entries: Pick<AuditEntry, "actor_id" | "azubi_id" | "details">[]): string[] {
  const ids = new Set<string>();
  for (const e of entries) {
    if (e.actor_id) ids.add(e.actor_id);
    if (e.azubi_id) ids.add(e.azubi_id);
    const d = asDetails(e.details);
    if (typeof d.on_behalf_of === "string" && d.on_behalf_of) ids.add(d.on_behalf_of);
  }
  return [...ids];
}

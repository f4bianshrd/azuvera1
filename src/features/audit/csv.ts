import { ROLE_LABELS, type AppRole } from "@/features/app/session";
import { berlinIso, describeEntry, ENTITY_LABELS, type AuditEntry } from "./labels";

export const CSV_HEADER = ["Zeit (UTC, ISO 8601)", "Zeit (Europe/Berlin)", "Wer", "Rolle", "Aktion", "Objekt", "Objekt-ID", "Einzelheiten", "row_hash"];

/** Zelle maskieren: Formel-Einschleusung verhindern, Semikolon/Anführungszeichen/Zeilenumbruch quoten. */
export function csvCell(value: string): string {
  let v = value;
  if (/^[=+\-@]/.test(v)) v = `'${v}`;
  if (/[;"\r\n]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function buildAuditCsv(entries: AuditEntry[], names: Map<string, string>): string {
  const lines = [CSV_HEADER.map(csvCell).join(";")];
  for (const e of entries) {
    const desc = describeEntry(e, names);
    const row = [
      new Date(e.created_at).toISOString(),
      berlinIso(e.created_at),
      e.actor_id ? names.get(e.actor_id) ?? "Unbekannt" : "System",
      e.actor_role ? ROLE_LABELS[e.actor_role as AppRole] ?? e.actor_role : "",
      desc.title,
      ENTITY_LABELS[e.entity_type] ?? e.entity_type,
      e.entity_id ?? "",
      desc.details.join(" · "),
      e.row_hash ?? "",
    ];
    lines.push(row.map(csvCell).join(";"));
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

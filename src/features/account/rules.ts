/** Reine Regeln für Auskunft und Löschung (ohne Datenbankzugriff, testbar). */

export const NOTE_MAX = 500;
export const REJECT_MIN = 3;

/** Bestätigungs-E-Mail: ohne Groß-/Kleinschreibung und Leerzeichen am Rand. */
export function sameEmail(input: string, actual: string | null | undefined): boolean {
  if (!actual) return false;
  return input.trim().toLowerCase() === actual.trim().toLowerCase();
}

export const closedEmail = (userId: string) => `geloescht-${userId}@azuvera.invalid`;
export const isClosedAccount = (email: string | null | undefined) => !!email && email.toLowerCase().endsWith("@azuvera.invalid");

export function validRejectNote(note: string): boolean {
  const n = note.trim().length;
  return n >= REJECT_MIN && n <= NOTE_MAX;
}

/** „bucket/pfad“ nach Bucket gruppieren (Pfade ohne Bucket werden verworfen). */
export function groupStoragePaths(paths: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const p of paths) {
    const i = p.indexOf("/");
    if (i <= 0 || i === p.length - 1) continue;
    const bucket = p.slice(0, i), path = p.slice(i + 1);
    const list = out.get(bucket) ?? [];
    if (!list.includes(path)) list.push(path);
    out.set(bucket, list);
  }
  return out;
}

/** Dateiname des Datenexports: Azuvera_Datenexport_JJJJ-MM-TT.zip (Ortszeit). */
export function dataExportFileName(d = new Date()): string {
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `Azuvera_Datenexport_${iso}.zip`;
}

/** Dateiname im ZIP gefahrlos machen (keine Pfadtrenner, keine Steuerzeichen). */
export function zipSafeName(name: string, fallback = "datei"): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").replace(/^\.+/, "").trim().slice(0, 150);
  return cleaned || fallback;
}

/** Eindeutige Namen innerhalb eines Ordners: „a.png“, „a (2).png“ … */
export function uniqueName(used: Set<string>, name: string): string {
  if (!used.has(name)) { used.add(name); return name; }
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 2; ; i++) {
    const n = `${base} (${i})${ext}`;
    if (!used.has(n)) { used.add(n); return n; }
  }
}

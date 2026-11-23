/**
 * CSV-Zelle für Tabellenprogramme: Inhalte, die mit =, +, -, @, Tab oder
 * Zeilenumbruch beginnen (auch nach Leerzeichen), bekommen ein führendes
 * Apostroph, damit Excel/Numbers/LibreOffice sie nie als Formel ausführen.
 */
export function csvCell(v: string | number | null | undefined, sep = ","): string {
  let s = String(v ?? "");
  if (/^[\s]*[=+\-@\t\r\n]/.test(s) && typeof v !== "number") s = `'${s}`;
  return sep === "," || /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

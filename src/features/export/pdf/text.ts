/** Reine Text-Helfer für die PDF-Erzeugung (Standardschriften, WinAnsi). */

export interface MeasureFont {
  widthOfTextAtSize(text: string, size: number): number;
}

// Zusätzliche WinAnsi-Zeichen im Bereich 0x80–0x9F.
const WIN_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

function isWinAnsi(ch: string): boolean {
  const c = ch.codePointAt(0)!;
  if (c >= 0x20 && c <= 0x7e) return true;
  if (c >= 0xa0 && c <= 0xff) return true;
  return WIN_EXTRA.has(ch);
}

/** Ersetzt nicht darstellbare Zeichen durch „?“, entfernt Steuerzeichen außer Zeilenumbruch. */
export function sanitizeForPdf(text: string | null | undefined): string {
  if (!text) return "";
  const norm = text.normalize("NFC").replace(/\r\n?/g, "\n").replace(/\t/g, " ").replace(/\u00ad/g, "");
  let out = "";
  for (const ch of norm) {
    if (ch === "\n") { out += ch; continue; }
    const c = ch.codePointAt(0)!;
    if (c < 0x20 || (c >= 0x7f && c < 0xa0 && !WIN_EXTRA.has(ch))) continue;
    // Variation selectors / zero-width joiners gehören zu Emojis – still verwerfen.
    if (c === 0x200d || (c >= 0xfe00 && c <= 0xfe0f)) continue;
    if (c === 0x00a0) { out += " "; continue; }
    out += isWinAnsi(ch) ? ch : "?";
  }
  return out;
}

function hardSplit(word: string, font: MeasureFont, size: number, maxWidth: number): string[] {
  const parts: string[] = [];
  let cur = "";
  for (const ch of word) {
    if (cur && font.widthOfTextAtSize(cur + ch, size) > maxWidth) { parts.push(cur); cur = ch; }
    else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

/** Bricht Text in Zeilen um. Leerzeilen (Absätze) bleiben als "" erhalten, zu lange Wörter werden hart getrennt. */
export function wrapText(text: string, font: MeasureFont, size: number, maxWidth: number): string[] {
  if (!text) return [];
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/ +/).filter((w) => w.length > 0);
    if (words.length === 0) { lines.push(""); continue; }
    let cur = "";
    for (const w of words) {
      const pieces = font.widthOfTextAtSize(w, size) > maxWidth ? hardSplit(w, font, size, maxWidth) : [w];
      for (const piece of pieces) {
        const cand = cur ? `${cur} ${piece}` : piece;
        if (cur && font.widthOfTextAtSize(cand, size) > maxWidth) { lines.push(cur); cur = piece; }
        else cur = cand;
      }
    }
    lines.push(cur);
  }
  return lines;
}

/** Kürzt einen Wert auf die Breite und hängt „…“ an. */
export function fitText(text: string, font: MeasureFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && font.widthOfTextAtSize(`${t}…`, size) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Dateinamen bereinigen: Umlaute ersetzen, nur A–Z, a–z, 0–9, _ und -. */
export function safeFileName(name: string): string {
  return name
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_").replace(/[^A-Za-z0-9_-]/g, "").replace(/_+/g, "_");
}

/** Dateiname mit Endung bereinigen (für Anlagen). */
export function safeFileNameWithExt(name: string): string {
  const i = name.lastIndexOf(".");
  if (i <= 0) return safeFileName(name) || "datei";
  return `${safeFileName(name.slice(0, i)) || "datei"}.${safeFileName(name.slice(i + 1)).toLowerCase()}`;
}

const berlinDate = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
const berlinTime = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });

export function berlinDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${berlinDate.format(d)}, ${berlinTime.format(d)} Uhr`;
}

export function dateDe(isoDate: string | null | undefined): string {
  if (!isoDate) return "–";
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

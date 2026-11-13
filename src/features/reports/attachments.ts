/**
 * Datei-Verarbeitung für Berichts-Anhänge: Typprüfung am Dateikopf (Magic Bytes),
 * HEIC-Umwandlung, Verkleinern im Browser (EXIF/Standort gehen dabei verloren –
 * gewollt, Datenschutz), Vorschau und sha256.
 */

/** Fehler mit einer Meldung, die so dem Nutzer gezeigt werden darf. */
export class UserFacingError extends Error {}

export const MAX_ATTACHMENTS = 10;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_EDGE = 2048;
export const THUMB_EDGE = 320;
export const JPEG_QUALITY = 0.8;

export type SniffedType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | "heic" | null;

/** Dateityp am Dateikopf erkennen, nicht an der Endung. */
export async function sniffType(file: Blob): Promise<SniffedType> {
  const buf = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (buf.length < 4) return null;
  // PDF: %PDF – laut Norm irgendwo in den ersten 1024 Bytes (manche Scanner-Apps schreiben vorher Daten)
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  for (let i = 0; i + 3 < head.length; i++) {
    if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46) return "application/pdf";
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  // WebP: RIFF....WEBP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50)
    return "image/webp";
  // HEIC/HEIF: ftyp-Box mit Marke heic/heix/hevc/hevx/mif1/msf1
  if (buf.length >= 12 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = String.fromCharCode(buf[8]!, buf[9]!, buf[10]!, buf[11]!);
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) return "heic";
  }
  return null;
}

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return cleaned.slice(0, 80) || "datei";
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function toJpegBlob(source: Blob, maxEdge: number): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas nicht verfügbar");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("Bild konnte nicht codiert werden");
  return { blob, width, height };
}

export const HEIC_ERROR =
  "Dieses Bildformat kann nicht verarbeitet werden. Bitte als JPEG oder PDF hochladen.";

export interface ProcessedFile {
  /** Hochzuladende Datei (Bilder: JPEG neu codiert, ohne EXIF). */
  blob: Blob;
  thumb?: Blob;
  mimeType: "image/jpeg" | "application/pdf";
  width?: number;
  height?: number;
  sha256: string;
}

/** Datei prüfen und für den Upload vorbereiten. Wirft Error mit Nutzer-Meldung. */
export async function processFile(file: File): Promise<ProcessedFile> {
  if (file.size > MAX_FILE_BYTES) throw new UserFacingError("Dateien dürfen höchstens 10 MB groß sein.");
  const sniffed = await sniffType(file);
  if (!sniffed) throw new UserFacingError("Dieser Dateityp ist nicht erlaubt. Erlaubt sind JPEG, PNG, WebP und PDF.");

  if (sniffed === "application/pdf") {
    // Als frische Kopie im Speicher ablegen: iPhone/iPad (Safari, Home-Bildschirm-App) können
    // eine direkt gewählte Datei nicht im Gerätespeicher sichern („Error preparing Blob/File data…“).
    let blob: Blob;
    try {
      blob = new Blob([await file.arrayBuffer()], { type: "application/pdf" });
    } catch {
      throw new UserFacingError("Die PDF-Datei konnte nicht gelesen werden. Bitte speichere sie zuerst in der Dateien-App und versuche es erneut.");
    }
    return { blob, mimeType: "application/pdf", sha256: await sha256Hex(blob) };
  }

  let source: Blob = file;
  if (sniffed === "heic") {
    try {
      const heic2any = (await import("heic2any")).default;
      const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: JPEG_QUALITY });
      source = Array.isArray(converted) ? converted[0]! : converted;
    } catch {
      throw new UserFacingError(HEIC_ERROR);
    }
  }

  try {
    const full = await toJpegBlob(source, MAX_EDGE);
    const thumb = await toJpegBlob(source, THUMB_EDGE);
    return {
      blob: full.blob,
      thumb: thumb.blob,
      mimeType: "image/jpeg",
      width: full.width,
      height: full.height,
      sha256: await sha256Hex(full.blob),
    };
  } catch {
    throw new UserFacingError(HEIC_ERROR);
  }
}

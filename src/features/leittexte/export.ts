/** Leittext-PDF im Browser erzeugen (Bilder lokal oder vom Server) und im Protokoll vermerken. */
import { logo } from "@/features/export/pdf/build";
import { buildLeittextPdf, leittextFileName, type LeittextPdfInput } from "@/features/export/pdf/leittext";
import { saveFile } from "@/lib/platform";
import { getWork, imageBlob, listWorksFor, logLeittextExport, personHeader, type Leittext, type Work, type WorkImage } from "./api";

export async function leittextPdfInput(leittext: Leittext, work: Work | null, images: WorkImage[], azubiId: string, withImages = true): Promise<LeittextPdfInput> {
  const person = await personHeader(azubiId);
  const grouped: Record<string, Uint8Array[]> = {};
  for (const img of withImages ? images : []) {
    const blob = await imageBlob(img, "original");
    if (!blob) continue;
    (grouped[img.field_key] ??= []).push(new Uint8Array(await blob.arrayBuffer()));
  }
  return { leittext, work, person, images: grouped };
}

export async function downloadLeittextPdf(leittext: Leittext, work: Work | null, images: WorkImage[], azubiId: string): Promise<void> {
  const input = await leittextPdfInput(leittext, work, images, azubiId);
  const bytes = await buildLeittextPdf(await logo(), input);
  saveFile(new Blob([bytes as BlobPart], { type: "application/pdf" }), leittextFileName(input));
  await logLeittextExport(azubiId, 1).catch(() => {});
}

/** Alle Leittexte einer Person für die Prüfungsmappe laden (nur die gewählten Status). */
export async function folderLeittexte(azubiId: string, statuses: string[], withImages: boolean): Promise<LeittextPdfInput[]> {
  const works = (await listWorksFor(azubiId)).filter((w) => statuses.includes(w.status));
  const out: LeittextPdfInput[] = [];
  for (const w of works) {
    const d = await getWork(w.id);
    if (d) out.push(await leittextPdfInput(d.leittext, d.work, d.images, azubiId, withImages));
  }
  return out.sort((a, b) => a.leittext.sort_order - b.leittext.sort_order);
}

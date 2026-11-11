import { currentDb, currentUserId, type AzuveraDB } from "./db";
import { enqueue, notifyLocalChange, scheduleSync } from "./engine";

export { enqueue };

/** Liegt der Datensatz im lokalen Speicher dieses Kontos? (Eigene Daten der Azubis.) */
export async function ownScope(azubiId: string | undefined): Promise<AzuveraDB | null> {
  const db = currentDb();
  const uid = currentUserId();
  if (!db || !uid) return null;
  if (azubiId === uid) return db;
  if (azubiId === undefined) {
    const role = ((await db.lookups.get("profile"))?.value as { role?: string } | undefined)?.role;
    return role === "azubi" ? db : null;
  }
  return null;
}

export function myId(): string | null {
  return currentUserId();
}

/** Wartende Einträge eines Datensatzes entfernen (nicht die gerade gesendeten). */
export async function dropWaiting(db: AzuveraDB, record: string): Promise<void> {
  const ids = (await db.outbox.where("record").equals(record).toArray()).filter((e) => e.status !== "sending").map((e) => e.id!);
  await db.outbox.bulkDelete(ids);
}

export async function hasOutbox(db: AzuveraDB, record: string): Promise<boolean> {
  return (await db.outbox.where("record").equals(record).count()) > 0;
}

export function changed(): void {
  notifyLocalChange();
  scheduleSync();
}

export function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

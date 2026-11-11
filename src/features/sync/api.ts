import { useLiveQuery } from "dexie-react-hooks";
import { currentDb, type OutboxEntry, type SyncLogRow } from "@/lib/sync/db";
import { notifyLocalChange, prefs, refreshCounts, scheduleSync, syncNow, clearFileCache, ABSENCE_DECIDED_MESSAGE } from "@/lib/sync/engine";
import { mayUseNetworkFor } from "@/lib/sync/rules";
import { getNetworkStatus } from "@/lib/platform";

export { syncNow, ABSENCE_DECIDED_MESSAGE };
export type { OutboxEntry, SyncLogRow };

export function useOutbox(): OutboxEntry[] | undefined {
  return useLiveQuery(async () => (await currentDb()?.outbox.orderBy("id").toArray()) ?? [], []);
}
export function useSyncLog(): SyncLogRow[] | undefined {
  return useLiveQuery(async () => (await currentDb()?.sync_log.orderBy("at").reverse().limit(200).toArray()) ?? [], []);
}

/** Wäre ein Senden gerade durch die WLAN-Bedingung blockiert? */
export async function blockedByWifi(): Promise<boolean> {
  const all = (await currentDb()?.outbox.toArray()) ?? [];
  const net = getNetworkStatus();
  return net.online && all.some((e) => !mayUseNetworkFor(e.op, net, prefs()));
}

export async function retryEntry(id: number): Promise<void> {
  const db = currentDb();
  if (!db) return;
  const e = await db.outbox.get(id);
  if (!e) return;
  await db.outbox.update(id, { status: "waiting", attempts: 0, next_at: 0, error: null });
  notifyLocalChange();
  scheduleSync(0);
}

/** Eintrag verwerfen: lokale Änderung entfernen, Serverstand neu laden. */
export async function discardEntry(id: number): Promise<void> {
  const db = currentDb();
  if (!db) return;
  const e = await db.outbox.get(id);
  if (!e) return;
  await db.outbox.delete(id);
  const [kind, recId] = e.record.split(":");
  const table = ({ report: "reports", attachment: "report_attachments", absence: "absences", grade: "school_grades", comment: "report_comments" } as const)[kind as "report"];
  if (table && recId && (await db.outbox.where("record").equals(e.record).count()) === 0) {
    const store = db[table] as typeof db.reports;
    const row = await store.get(recId);
    if (row && row._base_version === null) await store.delete(recId);
    else if (row) await store.update(recId, { _sync: "synced", _error: null, _submit_pending: false });
    await db.meta.delete(`lastPulledAt:${table}`);
  }
  notifyLocalChange();
  scheduleSync(0);
}

export async function clearAttachmentCache(): Promise<void> {
  await clearFileCache();
  await refreshCounts();
}

export async function lastSyncAt(): Promise<number | null> {
  return ((await currentDb()?.meta.get("lastSyncAt"))?.value as number | undefined) ?? null;
}

export function entryStatusLabel(e: OutboxEntry): string {
  return { waiting: "Wartet", sending: "Wird gesendet", failed: "Fehler", conflict: "Konflikt" }[e.status];
}

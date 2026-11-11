import { getNetworkStatus } from "@/lib/platform";
import { currentDb } from "./db";

const MAX_AGE = 24 * 60 * 60_000;

/**
 * Online-Daten (Team, Ausbilderportal) zuletzt geladenen Stand merken.
 * Offline liefert die Funktion diesen Stand (höchstens 24 Stunden alt).
 */
export async function cachedOnline<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const db = currentDb();
  if (getNetworkStatus().online || !db) {
    try {
      const data = await fetcher();
      if (db) await db.meta.put({ key: `qcache:${key}`, value: { at: Date.now(), data } }).catch(() => undefined);
      return data;
    } catch (e) {
      const hit = db ? await readCache<T>(key) : null;
      if (hit) return hit.data;
      throw e;
    }
  }
  const hit = await readCache<T>(key);
  if (hit) return hit.data;
  throw new Error("Dafür brauchst du eine Internetverbindung.");
}

async function readCache<T>(key: string): Promise<{ at: number; data: T } | null> {
  const row = (await currentDb()?.meta.get(`qcache:${key}`))?.value as { at: number; data: T } | undefined;
  return row && Date.now() - row.at <= MAX_AGE ? row : null;
}

/** Zeitpunkt des zuletzt geladenen Stands (für den Hinweis „Stand: …“). */
export async function cachedAt(key: string): Promise<number | null> {
  return (await readCache(key))?.at ?? null;
}

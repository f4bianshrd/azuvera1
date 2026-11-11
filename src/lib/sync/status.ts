import { useSyncExternalStore } from "react";

export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  pending: number;
  failed: number;
  conflicts: number;
  lastSyncAt: number | null;
  wifiWait: boolean;
}

let state: SyncStatus = { online: true, syncing: false, pending: 0, failed: 0, conflicts: 0, lastSyncAt: null, wifiWait: false };
const listeners = new Set<() => void>();

export function setSyncStatus(patch: Partial<SyncStatus>): void {
  const next = { ...state, ...patch };
  if (Object.keys(next).every((k) => next[k as keyof SyncStatus] === state[k as keyof SyncStatus])) return;
  state = next;
  for (const l of listeners) l();
}
export function getSyncStatus(): SyncStatus {
  return state;
}
const SERVER_STATE: SyncStatus = { ...state };
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => state,
    () => SERVER_STATE,
  );
}
/** Online-Status für Online-only-Aktionen. */
export function useOnline(): boolean {
  return useSyncStatus().online;
}
export const OFFLINE_ACTION_HINT = "Dafür brauchst du eine Internetverbindung.";

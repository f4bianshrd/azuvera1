import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { setAllSyncedHandler, startSync, stopSync } from "@/lib/sync/engine";
import { useSyncStatus } from "@/lib/sync/status";
import { InstallBanner, IosDataSafetyBanner } from "./install";
import { registerAppServiceWorker } from "./pwa-update";

/** Startet die Sync-Engine für das angemeldete Konto und zeigt Installations-Hinweise. */
export function SyncRuntime({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const status = useSyncStatus();
  useEffect(() => {
    startSync(userId, queryClient);
    setAllSyncedHandler(() => toast.success("Alles synchronisiert"));
    void registerAppServiceWorker();
    return () => { setAllSyncedHandler(null); stopSync(); };
  }, [userId, queryClient]);
  return <><IosDataSafetyBanner pending={status.pending} /><InstallBanner /></>;
}

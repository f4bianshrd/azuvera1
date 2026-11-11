import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/dialogs";
import { useSyncStatus } from "@/lib/sync/status";
import { blockedByWifi, syncNow } from "./api";

/** „Jetzt synchronisieren“ – ignoriert die WLAN-Bedingung nach Rückfrage. */
export function SyncNowButton() {
  const s = useSyncStatus();
  const [ask, setAsk] = useState(false);
  return (
    <>
      <Button disabled={!s.online || s.syncing} onClick={async () => { if (await blockedByWifi()) setAsk(true); else void syncNow(); }}>
        {s.syncing ? "Synchronisiere…" : "Jetzt synchronisieren"}
      </Button>
      <ConfirmDialog open={ask} onOpenChange={setAsk} title="Nicht im WLAN" description="Du bist nicht im WLAN. Trotzdem senden?" confirmLabel="Trotzdem senden" onConfirm={() => void syncNow({ force: true })} />
    </>
  );
}

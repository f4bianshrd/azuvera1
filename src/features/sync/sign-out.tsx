import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ResponsiveDialog } from "@/components/dialogs";
import { Button } from "@/components/ui/button";
import { pendingChangeCount, signOutAndLeave } from "@/features/app/session";
import { syncNow } from "@/lib/sync/engine";

export const UNSYNCED_WARNING = "Es gibt noch nicht synchronisierte Änderungen. Beim Abmelden gehen sie verloren.";

/** Abmelden mit Rückfrage bei wartenden Änderungen. */
export function useSignOut(global = false) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const leave = () => void signOutAndLeave(queryClient, (opts) => void navigate(opts), global);
  const request = async () => {
    if ((await pendingChangeCount()) > 0) setOpen(true);
    else leave();
  };
  const dialog = (
    <ResponsiveDialog open={open} onOpenChange={setOpen} title="Abmelden" description={UNSYNCED_WARNING}>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await syncNow({ force: true });
            setBusy(false);
            if ((await pendingChangeCount()) === 0) { setOpen(false); leave(); }
          }}
        >
          {busy ? "Synchronisiere…" : "Zuerst synchronisieren"}
        </Button>
        <Button variant="destructive" onClick={() => { setOpen(false); leave(); }}>Trotzdem abmelden</Button>
      </div>
    </ResponsiveDialog>
  );
  return { request: () => void request(), dialog };
}

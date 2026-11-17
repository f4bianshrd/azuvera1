import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";
import { deleteAccount } from "./api";
import { sameEmail } from "./rules";

export interface DeletableUser { id: string; full_name: string; email: string; role: string }

const CONSEQUENCE_AZUBI = "Das Konto, alle Berichte, Anhänge, Kommentare und Unterschriften dieser Person werden unwiderruflich gelöscht.";
const CONSEQUENCE_OTHER = "Das Konto wird gesperrt und anonymisiert. Unterschriften und Kommentare bleiben erhalten. Ihre Zugriffe auf Berichtshefte enden.";

/** Bestätigungsdialog „Konto endgültig löschen?“ – genutzt von Löschanträgen und der Benutzertabelle. */
export function DeleteAccountDialog({ user, onClose }: { user: DeletableUser; onClose: () => void }) {
  const qc = useQueryClient();
  const online = useOnline();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const azubi = user.role === "azubi";
  const match = sameEmail(email, user.email);

  const run = async () => {
    setBusy(true);
    try {
      const res = await deleteAccount(user.id, email);
      toast.success(res.mode === "deleted" ? "Konto gelöscht" : "Konto geschlossen",
        res.filesFailed ? { description: `${res.filesFailed} Datei(en) konnten nicht entfernt werden.` } : undefined);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-users"] }),
        qc.invalidateQueries({ queryKey: ["account", "deletion"] }),
        qc.invalidateQueries({ queryKey: ["azubi-viewers"] }),
      ]);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }} title="Konto endgültig löschen?">
      <div className="space-y-4 text-sm">
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="font-medium">{user.full_name || "—"}</p>
          <p className="text-muted-foreground">{user.email}</p>
        </div>
        <p className="rounded-lg border-l-4 border-destructive bg-destructive/10 p-3">{azubi ? CONSEQUENCE_AZUBI : CONSEQUENCE_OTHER}</p>
        <div className="space-y-1.5">
          <Label htmlFor="del-confirm">Zur Bestätigung die E-Mail-Adresse des Kontos eintippen</Label>
          <Input id="del-confirm" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 text-base" />
        </div>
        {!online && <p className="text-xs text-muted-foreground">{OFFLINE_ACTION_HINT}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="h-11" onClick={onClose} disabled={busy}>Abbrechen</Button>
          <Button variant="destructive" className="h-11" disabled={!match || busy || !online} onClick={() => void run()}>
            {azubi ? "Endgültig löschen" : "Endgültig schließen"}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

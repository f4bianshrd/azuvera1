import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ROLE_LABELS, type AppRole } from "@/features/app/session";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";
import { listOpenDeletionRequests, rejectDeletion, type DeletionRequest } from "./api";
import { DeleteAccountDialog, type DeletableUser } from "./delete-account-dialog";
import { NOTE_MAX, validRejectNote } from "./rules";

const dateDe = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Karte „Löschanträge“ auf /admin (#loeschantraege). */
export function DeletionRequestsCard({ users }: { users: (DeletableUser & { role: AppRole })[] }) {
  const online = useOnline();
  const { data: requests = [], isLoading } = useQuery({ queryKey: ["account", "deletion", "open"], queryFn: listOpenDeletionRequests });
  const [rejecting, setRejecting] = useState<DeletionRequest | null>(null);
  const [deleting, setDeleting] = useState<DeletableUser | null>(null);

  useEffect(() => {
    if (!isLoading && window.location.hash === "#loeschantraege") document.getElementById("loeschantraege")?.scrollIntoView({ block: "start" });
  }, [isLoading]);

  return (
    <section id="loeschantraege" className="scroll-mt-20 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold">Löschanträge</h2>
      {isLoading ? <div className="mt-4 h-20 animate-pulse rounded-xl bg-muted" /> : requests.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Keine offenen Löschanträge.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {requests.map((r) => {
            const u = users.find((x) => x.id === r.user_id);
            const azubi = u?.role === "azubi";
            return (
              <li key={r.id} className="space-y-3 rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{u?.full_name || "—"}</p>
                    <p className="break-all text-sm text-muted-foreground">{u?.email ?? "—"}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {u && <Badge variant="secondary">{ROLE_LABELS[u.role]}</Badge>}
                    <span className="text-xs text-muted-foreground">{dateDe(r.created_at)}</span>
                  </div>
                </div>
                {r.note && <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">{r.note}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button variant="destructive" className="h-10" disabled={!u || !online} onClick={() => u && setDeleting(u)}>
                    {azubi ? "Konto löschen" : "Konto schließen"}
                  </Button>
                  <Button variant="outline" className="h-10" disabled={!online} onClick={() => setRejecting(r)}>Ablehnen</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!online && requests.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{OFFLINE_ACTION_HINT}</p>}
      {rejecting && <RejectDialog request={rejecting} onClose={() => setRejecting(null)} />}
      {deleting && <DeleteAccountDialog user={deleting} onClose={() => setDeleting(null)} />}
    </section>
  );
}

function RejectDialog({ request, onClose }: { request: DeletionRequest; onClose: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await rejectDeletion(request.id, note.trim());
      toast.success("Antrag abgelehnt");
      await qc.invalidateQueries({ queryKey: ["account", "deletion"] });
      onClose();
    } catch (e) { toast.error((e as Error).message); setBusy(false); }
  };
  return (
    <ResponsiveDialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }} title="Löschantrag ablehnen">
      <div className="space-y-4 text-sm">
        <div className="space-y-1.5">
          <Label htmlFor="rej-note">Begründung (erforderlich)</Label>
          <Textarea id="rej-note" value={note} maxLength={NOTE_MAX} rows={4} onChange={(e) => setNote(e.target.value)} className="text-base" />
          <p className="text-right text-xs text-muted-foreground">{note.length}/{NOTE_MAX}</p>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="h-11" onClick={onClose} disabled={busy}>Abbrechen</Button>
          <Button className="h-11" disabled={!validRejectNote(note) || busy} onClick={() => void run()}>Ablehnen</Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

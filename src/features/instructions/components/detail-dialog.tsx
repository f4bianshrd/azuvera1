import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog, ResponsiveDialog } from "@/components/dialogs";
import { supabase } from "@/integrations/supabase/client";
import { berlinDateTime, dateDe } from "@/features/export/pdf/text";
import { useOnline } from "@/lib/sync/status";
import { CHANGED_MESSAGE, OFFLINE_MESSAGE, confirmInstruction, deleteDraft, rejectInstruction, reopenInstruction, submitInstruction, type InstructionData, type InstructionRecord } from "../api";
import { pointsFor } from "../model";
import { RecordStatusBadge } from "./badges";

type NoteAction = "confirm" | "reject" | "reopen";

export function DetailDialog({ record, data, canReview, onOpenChange, onEdit, onChanged }: {
  record: InstructionRecord | null; data: InstructionData; canReview: boolean;
  onOpenChange: (o: boolean) => void; onEdit: (r: InstructionRecord) => void; onChanged: () => void;
}) {
  const online = useOnline();
  const [action, setAction] = useState<NoteAction | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const behalfId = record?.on_behalf_of ?? null;
  const { data: behalfName } = useQuery({
    queryKey: ["instructions", "name", behalfId], enabled: !!behalfId && online,
    queryFn: async () => (await supabase.rpc("display_names", { _ids: [behalfId!] })).data?.[0]?.full_name ?? null,
  });
  if (!record) return null;
  const r = record;
  const pts = pointsFor(data, r.id);
  const own = data.own;
  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); onChanged(); setAction(null); onOpenChange(false); }
    catch (e) {
      const msg = e instanceof Error ? e.message : "Aktion fehlgeschlagen";
      toast.error(msg);
      if (msg === CHANGED_MESSAGE) { onChanged(); onOpenChange(false); }
    } finally { setBusy(false); }
  };
  const openNote = (a: NoteAction) => { setNote(""); setNoteError(null); setAction(a); };
  const submitNote = () => {
    const t = note.trim();
    if (action !== "confirm" && (t.length < 3 || t.length > 500)) { setNoteError("Bitte gib eine Begründung mit 3 bis 500 Zeichen an."); return; }
    if (action === "confirm") void run(() => confirmInstruction(r, t), "Unterweisung bestätigt");
    if (action === "reject") void run(() => rejectInstruction(r, t), "Unterweisung zurückgewiesen");
    if (action === "reopen") void run(() => reopenInstruction(r, t), "Unterweisung wieder geöffnet");
  };
  const offlineHint = !online ? <p className="text-xs text-muted-foreground">{OFFLINE_MESSAGE}</p> : null;

  return (
    <>
      <ResponsiveDialog open={!!record && !action && !delOpen} onOpenChange={onOpenChange} title="Unterweisung">
        <div className="max-h-[72vh] space-y-4 overflow-y-auto pr-1">
          <div className="space-y-2"><RecordStatusBadge status={r.status} /><h3 className="text-lg font-semibold leading-snug">{r.title}</h3></div>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Datum</dt><dd>{dateDe(r.given_on)}</dd></div>
            <div><dt className="text-muted-foreground">Dauer</dt><dd>{r.duration_minutes ? `${r.duration_minutes} Minuten` : "–"}</dd></div>
            <div><dt className="text-muted-foreground">Unterweisende Person</dt><dd>{r.instructor_name ?? "–"}</dd></div>
          </dl>
          {pts.length > 0 && (
            <div><p className="text-sm font-medium">Besprochene Inhalte</p><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{pts.map((p) => <li key={p.id}>{p.label}</li>)}</ul></div>
          )}
          {r.notes && <div><p className="text-sm font-medium">Notiz</p><p className="mt-1 whitespace-pre-wrap text-sm">{r.notes}</p></div>}
          <div className="space-y-1 rounded-xl bg-muted/50 p-3 text-sm">
            {r.submitted_at && <p>Eingereicht am {berlinDateTime(r.submitted_at)}</p>}
            {r.status === "confirmed" && r.reviewed_at && (
              <p>Bestätigt am {berlinDateTime(r.reviewed_at)} von {r.confirmed_by_name ?? "–"} ({r.confirmed_role_label ?? "–"}){behalfId ? ` i. V. für ${behalfName ?? "–"}` : ""}</p>
            )}
            {!r.submitted_at && <p className="text-muted-foreground">Noch nicht eingereicht.</p>}
          </div>
          {r.status === "rejected" && r.review_note && (
            <div className="rounded-xl border-2 border-destructive/60 p-3 text-sm">Zurückgewiesen am {dateDe(r.reviewed_at)}: {r.review_note}</div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {own && (r.status === "draft" || r.status === "rejected") && (
              <>
                {r.status === "draft" && <Button variant="ghost" className="min-h-11 text-destructive" disabled={busy} onClick={() => setDelOpen(true)}>Löschen</Button>}
                <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => onEdit(r)}>Bearbeiten</Button>
                <Button className="min-h-11" disabled={busy || !online} onClick={() => void run(() => submitInstruction(r.id), "Eingereicht")}>Erneut einreichen</Button>
              </>
            )}
            {!own && canReview && r.status === "submitted" && (
              <>
                <Button variant="outline" className="min-h-11" disabled={busy || !online} onClick={() => openNote("reject")}>Zurückweisen</Button>
                <Button className="min-h-11" disabled={busy || !online} onClick={() => openNote("confirm")}>Bestätigen</Button>
              </>
            )}
            {!own && canReview && r.status === "confirmed" && (
              <Button variant="outline" className="min-h-11" disabled={busy || !online} onClick={() => openNote("reopen")}>Wieder öffnen</Button>
            )}
          </div>
          {(own || canReview) && offlineHint}
        </div>
      </ResponsiveDialog>

      <ResponsiveDialog open={!!action} onOpenChange={(o) => { if (!o) setAction(null); }}
        title={action === "confirm" ? "Unterweisung bestätigen?" : action === "reject" ? "Unterweisung zurückweisen" : "Unterweisung wieder öffnen"}
        description={action === "confirm" ? `Du bestätigst, dass ${data.person.full_name} am ${dateDe(r.given_on)} zum Thema „${r.title}“ unterwiesen wurde. Die Bestätigung wird mit Datum und Prüfsumme gespeichert.` : undefined}>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ins-note">{action === "confirm" ? "Notiz" : "Begründung *"}</Label>
            <Textarea id="ins-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={!!noteError} />
            {noteError && <p className="text-sm text-destructive" role="alert">{noteError}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="min-h-11" onClick={() => setAction(null)}>Abbrechen</Button>
            <Button className="min-h-11" disabled={busy || !online} onClick={submitNote}>{action === "confirm" ? "Bestätigen" : action === "reject" ? "Zurückweisen" : "Wieder öffnen"}</Button>
          </div>
          {offlineHint}
        </div>
      </ResponsiveDialog>

      <ConfirmDialog open={delOpen} onOpenChange={setDelOpen} title="Entwurf löschen?" description="Der Entwurf wird endgültig gelöscht." confirmLabel="Löschen" destructive
        onConfirm={() => void run(() => deleteDraft(r.id), "Entwurf gelöscht").finally(() => setDelOpen(false))} />
    </>
  );
}

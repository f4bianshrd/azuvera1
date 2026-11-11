import { useEffect, useRef, useState } from "react";
import { OnlineButton } from "@/features/sync/online-button";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveDialog } from "@/components/dialogs";
import { DictationButton } from "@/features/dictation/dictation-button";
import { readPunctuationPreference } from "@/features/dictation/api";
import { reopenReport } from "./api";

export function ReopenSheet({ reportId, open, onOpenChange, onReopened }: { reportId: string; open: boolean; onOpenChange: (open: boolean) => void; onReopened: () => void | Promise<void> }) {
  const [reason, setReason] = useState("");
  const [interim, setInterim] = useState("");
  const [punctuation, setPunctuation] = useState(true);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (open) setPunctuation(readPunctuationPreference()); }, [open]);
  const submit = async () => {
    if (reason.trim().length < 10) { toast.error("Bitte eine Begründung mit mindestens 10 Zeichen angeben."); return; }
    setBusy(true);
    try {
      await reopenReport(reportId, reason.trim());
      toast.success("Bericht wieder geöffnet");
      onOpenChange(false);
      await onReopened();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Wiederöffnen fehlgeschlagen."); }
    finally { setBusy(false); }
  };
  return <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Bericht wieder öffnen">
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2"><Label htmlFor="reopen-reason">Begründung (erforderlich)</Label><DictationButton textareaRef={ref} getValue={() => reason} onValueChange={setReason} onInterim={setInterim} spokenPunctuation={punctuation} /></div>
        <Textarea id="reopen-reason" ref={ref} rows={4} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />
        {interim && <p className="text-sm italic text-muted-foreground">{interim}</p>}
        <p className="text-right text-xs text-muted-foreground">{reason.length} / 1.000</p>
      </div>
      <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">Der Bericht wird wieder zum Entwurf. Frühere Unterschriften bleiben erhalten. Nach dem erneuten Einreichen ist eine neue Freigabe nötig.</p>
      <OnlineButton className="w-full" disabled={busy} onClick={() => void submit()}>{busy ? "Wird geöffnet…" : "Wieder öffnen"}</OnlineButton>
    </div>
  </ResponsiveDialog>;
}

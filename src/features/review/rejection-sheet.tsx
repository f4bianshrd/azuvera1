import { useEffect, useRef, useState } from "react";
import { OnlineButton } from "@/features/sync/online-button";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveDialog } from "@/components/dialogs";
import { DictationButton } from "@/features/dictation/dictation-button";
import { readPunctuationPreference } from "@/features/dictation/api";
import { reportTitle, ReportConflictError, type Report } from "@/features/reports/api";
import { rejectReport } from "./api";

const QUICK_NOTES = [
  "Bitte die Tätigkeiten genauer beschreiben.",
  "Der Abschnitt Berufsschule fehlt.",
  "Bitte Rechtschreibung und Satzbau prüfen.",
  "Zeitraum oder Datum stimmt nicht.",
  "Bitte Fotos oder Nachweise ergänzen.",
];

export function RejectionSheet({ report, open, onOpenChange, onRejected, onConflict }: {
  report: Report;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRejected: () => void | Promise<void>;
  onConflict: () => void;
}) {
  const [note, setNote] = useState("");
  const [interim, setInterim] = useState("");
  const [punctuation, setPunctuation] = useState(true);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (open) setPunctuation(readPunctuationPreference()); }, [open]);

  const submit = async () => {
    if (note.trim().length < 3) { toast.error("Bitte eine Begründung angeben."); return; }
    setBusy(true);
    try {
      await rejectReport(report.id, report.version, note.trim());
      toast.success("Bericht zurückgewiesen");
      onOpenChange(false);
      await onRejected();
    } catch (error) {
      if (error instanceof ReportConflictError) onConflict();
      toast.error(error instanceof Error ? error.message : "Zurückweisung fehlgeschlagen.");
    } finally { setBusy(false); }
  };

  return <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Bericht zurückweisen" description={reportTitle(report)}>
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">{QUICK_NOTES.map((text) => <button key={text} type="button" className="rounded-full border px-3 py-1.5 text-xs hover:bg-accent" onClick={() => setNote((current) => `${current.trim()}${current.trim() ? " " : ""}${text}`)}>{text}</button>)}</div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2"><Label htmlFor="rejection-note">Korrekturnotiz (erforderlich)</Label><DictationButton textareaRef={ref} getValue={() => note} onValueChange={setNote} onInterim={setInterim} spokenPunctuation={punctuation} /></div>
        <Textarea id="rejection-note" ref={ref} rows={4} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
        {interim && <p className="text-sm italic text-muted-foreground">{interim}</p>}
        <p className="text-right text-xs text-muted-foreground">{note.length} / 2.000</p>
      </div>
      <p className="text-sm text-muted-foreground">Die Notiz wird sofort zugestellt. Der Bericht kann überarbeitet und erneut eingereicht werden.</p>
      <OnlineButton variant="destructive" className="w-full" disabled={busy} onClick={() => void submit()}>{busy ? "Wird zurückgewiesen…" : "Zurückweisen"}</OnlineButton>
    </div>
  </ResponsiveDialog>;
}

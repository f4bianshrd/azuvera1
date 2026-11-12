import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/dialogs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import type { MyProfile } from "@/features/app/session";
import { ExportButton } from "@/features/export/ExportDialog";
import { saveFile } from "@/lib/platform";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";
import {
  DataExportCancelled, buildMyDataZip, fetchMyData, logDataExport, myLatestDeletionRequest, requestDeletion, withdrawDeletion,
  type DataExportProgress,
} from "./api";
import { NOTE_MAX } from "./rules";

const dateDe = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Profil-Karte „Meine Daten“ (#meine-daten, alle Rollen). */
export function MyDataCard({ profile }: { profile: MyProfile }) {
  const online = useOnline();
  const [exportOpen, setExportOpen] = useState(false);
  const azubi = profile.role === "azubi";

  useEffect(() => {
    if (window.location.hash === "#meine-daten") document.getElementById("meine-daten")?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <section id="meine-daten" className="scroll-mt-20 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold">Meine Daten</h2>
      <p className="mt-2 text-sm text-muted-foreground">Hier kannst du die bei Azuvera gespeicherten Daten abrufen oder die Löschung deines Kontos beantragen.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" className="h-11" disabled={!online} onClick={() => setExportOpen(true)}>
          <Download className="size-4" aria-hidden /> Meine Daten exportieren
        </Button>
        {azubi && <ExportButton azubiId={profile.id} isSelf label="Berichtsheft als PDF exportieren" />}
      </div>
      {!online && <p className="mt-2 text-xs text-muted-foreground">{OFFLINE_ACTION_HINT}</p>}
      <DeletionSection profile={profile} />
      {exportOpen && <DataExportDialog onClose={() => setExportOpen(false)} />}
    </section>
  );
}

function DataExportDialog({ onClose }: { onClose: () => void }) {
  const online = useOnline();
  const [withFiles, setWithFiles] = useState(true);
  const [progress, setProgress] = useState<DataExportProgress | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const start = async () => {
    const ctrl = new AbortController(); abort.current = ctrl;
    setProgress({ done: 0, total: 0 });
    try {
      const data = await fetchMyData();
      if (ctrl.signal.aborted) return;
      const out = await buildMyDataZip(data, { withFiles, signal: ctrl.signal, onProgress: setProgress });
      if (ctrl.signal.aborted) return;
      saveFile(out.blob, out.filename);
      void logDataExport().catch(() => undefined);
      toast.success("Export fertig");
      onClose();
    } catch (e) {
      if (!(e instanceof DataExportCancelled)) toast.error("Der Export ist fehlgeschlagen. Bitte versuche es erneut.");
      setProgress(null);
    }
  };
  const cancel = () => { abort.current?.abort(); setProgress(null); };

  return (
    <ResponsiveDialog open onOpenChange={(o) => { if (!o) { cancel(); onClose(); } }} title="Datenexport">
      <div className="space-y-4 text-sm">
        {progress ? (
          <div className="space-y-3 py-2">
            <p className="font-medium">{progress.total ? `Datei ${Math.min(progress.done + 1, progress.total)} von ${progress.total} …` : "Daten werden zusammengestellt …"}</p>
            <Progress value={progress.total ? (progress.done / progress.total) * 100 : 5} />
            <Button variant="outline" onClick={cancel}>Abbrechen</Button>
          </div>
        ) : <>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Checkbox id="dx-files" checked={withFiles} onCheckedChange={(v) => setWithFiles(v === true)} />
              <Label htmlFor="dx-files" className="font-normal">Anhänge und Unterschriften einschließen</Label>
            </div>
            <p className="pl-6 text-xs text-muted-foreground">Kann die Datei deutlich vergrößern.</p>
          </div>
          <Button className="h-11 w-full" disabled={!online} onClick={() => void start()}>Export starten</Button>
          {!online && <p className="text-xs text-muted-foreground">{OFFLINE_ACTION_HINT}</p>}
        </>}
        <p className="rounded-lg border-l-4 border-primary bg-accent p-3">Die Datei enthält persönliche Daten. Bewahre sie sicher auf.</p>
      </div>
    </ResponsiveDialog>
  );
}

function DeletionSection({ profile }: { profile: MyProfile }) {
  const online = useOnline();
  const qc = useQueryClient();
  const { data: req } = useQuery({ queryKey: ["account", "deletion", "me", profile.id], queryFn: () => myLatestDeletionRequest(profile.id), enabled: online });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const azubi = profile.role === "azubi";

  const withdraw = async () => {
    if (!req) return;
    setBusy(true);
    try {
      await withdrawDeletion(req.id);
      toast.success("Antrag zurückgezogen");
      await qc.invalidateQueries({ queryKey: ["account", "deletion"] });
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };

  return (
    <div className="mt-6 border-t pt-5">
      <h3 className="font-semibold">Konto löschen</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {azubi
          ? "Mit einem Löschantrag bittest du die Ausbildungsleitung, dein Konto und alle deine Berichte zu löschen. Freigegebene Berichte sind Teil deines Ausbildungsnachweises. Exportiere sie vorher."
          : "Mit einem Löschantrag bittest du die Ausbildungsleitung, dein Konto zu schließen. Deine bisherigen Unterschriften und Kommentare bleiben als Teil der Nachweise der Auszubildenden erhalten."}
      </p>
      {req?.status === "rejected" && (
        <p className="mt-3 rounded-lg border-l-4 border-destructive bg-destructive/10 p-3 text-sm">Dein Antrag wurde abgelehnt: {req.handled_note}</p>
      )}
      {req?.status === "open" ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium">Antrag gestellt am {dateDe(req.created_at)}</p>
          <Button variant="outline" className="h-11" disabled={busy || !online} onClick={() => void withdraw()}>Antrag zurückziehen</Button>
        </div>
      ) : (
        <Button variant="outline" className="mt-4 h-11 border-destructive/50 text-destructive hover:bg-destructive/10" disabled={!online} onClick={() => setOpen(true)}>
          Löschantrag stellen
        </Button>
      )}
      {open && <RequestDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

function RequestDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await requestDeletion(note.trim());
      toast.success("Antrag gestellt");
      await qc.invalidateQueries({ queryKey: ["account", "deletion"] });
      onClose();
    } catch (e) { toast.error((e as Error).message); setBusy(false); }
  };
  return (
    <ResponsiveDialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }} title="Löschantrag stellen">
      <div className="space-y-4 text-sm">
        <div className="space-y-1.5">
          <Label htmlFor="del-note">Anmerkung (optional)</Label>
          <Textarea id="del-note" value={note} maxLength={NOTE_MAX} rows={4} onChange={(e) => setNote(e.target.value)} className="text-base" />
          <p className="text-right text-xs text-muted-foreground">{note.length}/{NOTE_MAX}</p>
        </div>
        <div className="flex items-start gap-2">
          <Checkbox id="del-ack" checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" />
          <Label htmlFor="del-ack" className="font-normal leading-snug">Ich habe verstanden, dass die Löschung nicht rückgängig gemacht werden kann.</Label>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="h-11" onClick={onClose} disabled={busy}>Abbrechen</Button>
          <Button variant="destructive" className="h-11" disabled={!ack || busy} onClick={() => void run()}>Löschantrag stellen</Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

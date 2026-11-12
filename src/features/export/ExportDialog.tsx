import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookDown } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/dialogs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trainingYears } from "@/lib/training-year";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";
import { saveFile } from "@/lib/platform";
import { getExportHeader, listExportReports, logExport } from "./api";
import { ExportCancelled, buildBulk, buildZip, exportBaseName } from "./pdf/build";
import { dateDe } from "./pdf/text";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function ExportButton({ azubiId, isSelf }: { azubiId: string; isSelf: boolean }) {
  const online = useOnline();
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="outline" onClick={() => setOpen(true)} disabled={!online} title={online ? undefined : OFFLINE_ACTION_HINT}>
      <BookDown className="size-4" aria-hidden /> Berichtsheft exportieren
    </Button>
    {!online && <span className="sr-only">{OFFLINE_ACTION_HINT}</span>}
    {open && <ExportDialog azubiId={azubiId} isSelf={isSelf} onClose={() => setOpen(false)} />}
  </>;
}

function ExportDialog({ azubiId, isSelf, onClose }: { azubiId: string; isSelf: boolean; onClose: () => void }) {
  const online = useOnline();
  const { data: header } = useQuery({ queryKey: ["export", "header", azubiId], queryFn: () => getExportHeader(azubiId) });
  const years = useMemo(() => header?.training_start ? trainingYears(new Date(`${header.training_start}T00:00:00`), header.training_end ? new Date(`${header.training_end}T00:00:00`) : undefined) : [], [header]);
  const [period, setPeriod] = useState("all");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [stApproved, setStApproved] = useState(true); const [stSubmitted, setStSubmitted] = useState(false); const [stDraft, setStDraft] = useState(false);
  const [weekly, setWeekly] = useState(true); const [daily, setDaily] = useState(true);
  const [embed, setEmbed] = useState(false);
  const [sig, setSig] = useState("digital");
  const [fmt, setFmt] = useState("pdf");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const range = useMemo((): { from: string | null; to: string | null; label: string } => {
    if (period === "custom") return { from: from || null, to: to || null, label: from || to ? `${from || "Beginn"}_bis_${to || "heute"}` : "Gesamt" };
    const y = years.find((x) => String(x.year) === period);
    if (y) return { from: iso(y.start), to: iso(y.end), label: `${y.year}_Lehrjahr` };
    return { from: null, to: null, label: "Gesamte_Ausbildung" };
  }, [period, from, to, years]);
  const statuses = [stApproved && "approved", stSubmitted && "submitted", ...(isSelf && stDraft ? ["draft", "rejected"] : [])].filter(Boolean) as ("approved" | "submitted" | "draft" | "rejected")[];
  const types = [weekly && "weekly", daily && "daily"].filter(Boolean) as ("weekly" | "daily")[];
  const sel = { azubiId, from: range.from, to: range.to, statuses, types };
  const { data: list, isFetching } = useQuery({ queryKey: ["export", "list", sel], queryFn: () => listExportReports(sel), enabled: online });
  const n = list?.reports.length ?? 0;
  const mb = list ? (n * 60_000 + (embed ? list.imageBytes : 0) + (fmt === "zip" ? list.attachmentBytes : 0)) / 1024 / 1024 : 0;

  const start = async () => {
    if (!list || !header || !n) return;
    const ctrl = new AbortController(); abort.current = ctrl;
    setProgress({ done: 0, total: n });
    const periodText = range.from || range.to ? `${dateDe(range.from)} – ${dateDe(range.to)}` : "Gesamte Ausbildung";
    const base = exportBaseName(header, range.label);
    const o = { embedImages: embed, blankSignatures: sig === "blank", signal: ctrl.signal, onProgress: setProgress };
    try {
      const out = fmt === "zip" ? await buildZip(list.reports, header, periodText, base, o) : await buildBulk(list.reports, header, periodText, base, o);
      if (ctrl.signal.aborted) return;
      saveFile(out.blob, out.filename);
      toast.success("Export fertig");
      void logExport(azubiId, fmt === "zip" || out.filename.endsWith(".zip") ? "zip" : "bulk", n, range.from, range.to).catch(() => undefined);
      onClose();
    } catch (e) {
      if (!(e instanceof ExportCancelled)) toast.error("Der Export ist fehlgeschlagen. Bitte versuche es erneut.");
      setProgress(null);
    }
  };
  const cancel = () => { abort.current?.abort(); setProgress(null); };

  return (
    <ResponsiveDialog open onOpenChange={(v) => { if (!v) { cancel(); onClose(); } }} title="Berichtsheft exportieren">
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1 text-sm">
        <p className="rounded-lg border-l-4 border-primary bg-accent p-3">Exportiere deine Berichte rechtzeitig vor dem Prüfungstermin und speichere die Dateien zusätzlich auf deinem Gerät.</p>
        {progress ? (
          <div className="space-y-3 py-4">
            <p className="font-medium">Bericht {Math.min(progress.done + 1, progress.total)} von {progress.total} …</p>
            <Progress value={(progress.done / Math.max(1, progress.total)) * 100} />
            <Button variant="outline" onClick={cancel}>Abbrechen</Button>
          </div>
        ) : <>
          <fieldset className="space-y-2"><legend className="font-semibold">Zeitraum</legend>
            <Select value={period} onValueChange={setPeriod}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Gesamte Ausbildung</SelectItem>{years.map((y) => <SelectItem key={y.year} value={String(y.year)}>{y.label}</SelectItem>)}<SelectItem value="custom">Eigener Zeitraum</SelectItem></SelectContent></Select>
            {period === "custom" && <div className="flex gap-3"><div className="flex-1 space-y-1"><Label htmlFor="ex-from">Von</Label><Input id="ex-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div><div className="flex-1 space-y-1"><Label htmlFor="ex-to">Bis</Label><Input id="ex-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div></div>}
          </fieldset>
          <fieldset className="space-y-2"><legend className="font-semibold">Welche Berichte</legend>
            <Check id="ex-ap" label="Freigegeben" checked={stApproved} onChange={setStApproved} />
            <Check id="ex-sub" label="Eingereicht" checked={stSubmitted} onChange={setStSubmitted} />
            {isSelf && <Check id="ex-dr" label="Entwürfe und zurückgewiesene" checked={stDraft} onChange={setStDraft} />}
            <div className="flex gap-6 pt-1"><Check id="ex-w" label="Wochenberichte" checked={weekly} onChange={setWeekly} /><Check id="ex-d" label="Tagesberichte" checked={daily} onChange={setDaily} /></div>
          </fieldset>
          <fieldset className="space-y-1"><legend className="font-semibold">Anhänge</legend>
            <Check id="ex-img" label="Bilder als Anlagen einbetten" checked={embed} onChange={setEmbed} />
            <p className="pl-6 text-xs text-muted-foreground">Vergrößert die Datei deutlich.</p>
          </fieldset>
          <fieldset className="space-y-2"><legend className="font-semibold">Unterschriftsfelder</legend>
            <RadioGroup value={sig} onValueChange={setSig}><Radio id="ex-sd" value="digital" label="Digitale Bestätigung anzeigen" /><Radio id="ex-sb" value="blank" label="Leer lassen zum handschriftlichen Unterschreiben" /></RadioGroup>
          </fieldset>
          <fieldset className="space-y-2"><legend className="font-semibold">Format</legend>
            <RadioGroup value={fmt} onValueChange={setFmt}><Radio id="ex-fp" value="pdf" label="Ein PDF zum Drucken" /><Radio id="ex-fz" value="zip" label="ZIP mit einzelnen PDFs" /></RadioGroup>
          </fieldset>
          <p className="font-medium">{isFetching && !list ? "Berichte werden gezählt …" : n === 0 ? "Für diese Auswahl gibt es keine Berichte." : `${n} Berichte, geschätzt ${mb.toFixed(1).replace(".", ",")} MB`}</p>
          <Button className="h-11 w-full" disabled={!online || !n || !header} onClick={() => void start()}>Export starten</Button>
          {!online && <p className="text-xs text-muted-foreground">{OFFLINE_ACTION_HINT}</p>}
        </>}
      </div>
    </ResponsiveDialog>
  );
}

function Check({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <div className="flex items-center gap-2"><Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} /><Label htmlFor={id} className="font-normal">{label}</Label></div>;
}
function Radio({ id, value, label }: { id: string; value: string; label: string }) {
  return <div className="flex items-center gap-2"><RadioGroupItem id={id} value={value} /><Label htmlFor={id} className="font-normal">{label}</Label></div>;
}

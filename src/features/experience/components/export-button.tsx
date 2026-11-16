import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ResponsiveDialog } from "@/components/dialogs";
import { useMyProfile } from "@/features/app/session";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";
import { saveFile } from "@/lib/platform";
import { getExportHeader } from "@/features/export/api";
import { getExportExperience, listExportExperiences, logExperienceExport } from "@/features/export/experience-api";
import { ExportCancelled } from "@/features/export/pdf/build";
import { buildExperienceBulk, buildExperiencePdf, buildExperienceZip, experienceFileName, loadExperienceContext } from "@/features/export/pdf/experienceReport";
import { safeFileName } from "@/features/export/pdf/text";
import { useExperienceProgress } from "./progress-card";

/** Menü „PDF herunterladen“ auf der Detailseite. */
export function ExperiencePdfMenu({ id, azubiId }: { id: string; azubiId: string }) {
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const run = async (blank: boolean) => {
    setBusy(true);
    try {
      const [e, header] = await Promise.all([getExportExperience(id), getExportHeader(azubiId)]);
      const ctx = await loadExperienceContext(azubiId, header);
      const bytes = await buildExperiencePdf(e, ctx, { blankSignatures: blank });
      saveFile(new Blob([bytes as BlobPart], { type: "application/pdf" }), experienceFileName(e));
      toast.success("Export fertig");
      void logExperienceExport(azubiId, "single", 1, e.written_on, e.written_on).catch(() => undefined);
    } catch {
      toast.error("Der Export ist fehlgeschlagen. Bitte versuche es erneut.");
    } finally { setBusy(false); }
  };
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm" disabled={!online || busy} title={online ? undefined : OFFLINE_ACTION_HINT}>
        <Download className="size-4" aria-hidden /> {busy ? "PDF wird erstellt …" : "PDF herunterladen"}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onSelect={() => void run(false)}>PDF mit digitaler Bestätigung</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => void run(true)}>PDF zum handschriftlichen Unterschreiben</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

type Status = "approved" | "submitted" | "draft" | "rejected";
const KIND_OPTIONS = [{ v: "erfahrungsbericht", l: "Erfahrungsberichte" }, { v: "projektbericht", l: "Projektberichte" }, { v: "leittext", l: "Leittexte" }];

/** Button „Erfahrungsberichte exportieren“ mit dem Export-Dialog (Inhalt: nur Erfahrungsberichte). */
export function ExperienceExportButton({ azubiId }: { azubiId: string }) {
  const online = useOnline();
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="outline" disabled={!online} title={online ? undefined : OFFLINE_ACTION_HINT} onClick={() => setOpen(true)}><FileDown className="size-4" aria-hidden />Erfahrungsberichte exportieren</Button>
    {open && <ExperienceExportDialog azubiId={azubiId} open={open} onOpenChange={setOpen} />}
  </>;
}

function ExperienceExportDialog({ azubiId, open, onOpenChange }: { azubiId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: profile } = useMyProfile();
  const own = profile?.id === azubiId;
  const online = useOnline();
  const { data: progress } = useExperienceProgress(azubiId);
  const [period, setPeriod] = useState("all");
  const [statuses, setStatuses] = useState<Status[]>(["approved", "submitted"]);
  const [kinds, setKinds] = useState<string[]>(KIND_OPTIONS.map((k) => k.v));
  const [blank, setBlank] = useState(false);
  const [embed, setEmbed] = useState(false);
  const [format, setFormat] = useState<"pdf" | "zip">("pdf");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ done: number; total: number } | null>(null);
  const abort = useRef<AbortController | null>(null);

  const range = useMemo(() => {
    if (period === "all") return { from: null as string | null, to: null as string | null, label: "Gesamte Ausbildung" };
    const y = progress?.progress.years.find((x) => String(x.year) === period);
    return y ? { from: y.start, to: y.end, label: `${y.year}. Lehrjahr` } : { from: null, to: null, label: "Gesamte Ausbildung" };
  }, [period, progress]);

  const { data: selection } = useQuery({
    queryKey: ["experience", "export-selection", azubiId, range.from, range.to, statuses.join(","), kinds.join(",")],
    queryFn: () => listExportExperiences({ azubiId, from: range.from, to: range.to, statuses, kinds }),
    enabled: open,
  });
  const m = selection?.items.length ?? 0;
  const mb = ((selection?.attachmentBytes ?? 0) * (format === "zip" || embed ? 1 : 0) + m * 60_000) / 1_048_576;

  const toggle = <V,>(list: V[], v: V, on: boolean) => on ? [...new Set([...list, v])] : list.filter((x) => x !== v);

  const run = async () => {
    if (!selection || !m) return;
    setBusy(true);
    abort.current = new AbortController();
    setDone({ done: 0, total: m });
    try {
      const header = await getExportHeader(azubiId);
      const ctx = await loadExperienceContext(azubiId, header);
      const opts = { embedImages: embed, blankSignatures: blank, signal: abort.current.signal, onProgress: setDone };
      const base = safeFileName(`Erfahrungsberichte_${header.azubi_name ?? ""}_${range.label}`);
      if (format === "zip") {
        const bytes = await buildExperienceZip(selection.items, ctx, opts);
        saveFile(new Blob([bytes as BlobPart], { type: "application/zip" }), `${base}.zip`);
      } else {
        const bytes = await buildExperienceBulk(selection.items, ctx, range.label, opts);
        saveFile(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${base}.pdf`);
      }
      toast.success("Export fertig");
      void logExperienceExport(azubiId, format === "zip" ? "zip" : "bulk", m, range.from, range.to).catch(() => undefined);
      onOpenChange(false);
    } catch (e) {
      if (!(e instanceof ExportCancelled)) toast.error("Der Export ist fehlgeschlagen. Bitte versuche es erneut.");
    } finally { setBusy(false); setDone(null); }
  };

  return <ResponsiveDialog open={open} onOpenChange={(o) => { if (!o) abort.current?.abort(); onOpenChange(o); }} title="Berichtsheft exportieren" description="Inhalt: Nur Erfahrungsberichte">
    <div className="space-y-4">
      <div className="space-y-1.5"><Label>Zeitraum</Label>
        <Select value={period} onValueChange={setPeriod}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Gesamte Ausbildung</SelectItem>{(progress?.progress.years ?? []).map((y) => <SelectItem key={y.year} value={String(y.year)}>{y.year}. Lehrjahr</SelectItem>)}</SelectContent></Select></div>
      <fieldset className="space-y-2"><legend className="text-sm font-medium">Welche Berichte</legend>
        {KIND_OPTIONS.map((k) => <div key={k.v} className="flex min-h-9 items-center gap-2"><Checkbox id={`exp-x-${k.v}`} checked={kinds.includes(k.v)} onCheckedChange={(c) => setKinds((l) => toggle(l, k.v, c === true))} /><Label htmlFor={`exp-x-${k.v}`} className="font-normal">{k.l}</Label></div>)}
      </fieldset>
      <fieldset className="space-y-2"><legend className="text-sm font-medium">Status</legend>
        {([["approved", "Freigegeben"], ["submitted", "Eingereicht"], ["rejected", "Zurückgewiesen"], ...(own ? [["draft", "Entwurf"]] : [])] as [Status, string][]).map(([v, l]) =>
          <div key={v} className="flex min-h-9 items-center gap-2"><Checkbox id={`exp-s-${v}`} checked={statuses.includes(v)} onCheckedChange={(c) => setStatuses((s) => toggle(s, v, c === true))} /><Label htmlFor={`exp-s-${v}`} className="font-normal">{l}</Label></div>)}
      </fieldset>
      <div className="space-y-2">
        <div className="flex min-h-9 items-center gap-2"><Checkbox id="exp-embed" checked={embed} onCheckedChange={(c) => setEmbed(c === true)} /><Label htmlFor="exp-embed" className="font-normal">Bilder als Anlagen einbetten</Label></div>
        <div className="flex min-h-9 items-center gap-2"><Checkbox id="exp-blank" checked={blank} onCheckedChange={(c) => setBlank(c === true)} /><Label htmlFor="exp-blank" className="font-normal">Unterschriftsfelder leer lassen</Label></div>
      </div>
      <RadioGroup value={format} onValueChange={(v) => setFormat(v as "pdf" | "zip")} className="flex gap-4">
        <div className="flex min-h-11 items-center gap-2"><RadioGroupItem value="pdf" id="exp-f-pdf" /><Label htmlFor="exp-f-pdf">Ein PDF</Label></div>
        <div className="flex min-h-11 items-center gap-2"><RadioGroupItem value="zip" id="exp-f-zip" /><Label htmlFor="exp-f-zip">ZIP mit Einzeldateien</Label></div>
      </RadioGroup>
      <p className="text-sm text-muted-foreground" role="status">{m === 0 ? "Für diese Auswahl gibt es keine Berichte." : `0 Berichte, ${m} Erfahrungsberichte, geschätzt ${mb.toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`}</p>
      {done && <Progress value={(done.done / Math.max(1, done.total)) * 100} aria-label={`${done.done} von ${done.total}`} />}
      <Button className="w-full" disabled={busy || m === 0 || !online} onClick={() => void run()}>{busy ? `Wird erstellt … ${done?.done ?? 0} von ${done?.total ?? m}` : "Exportieren"}</Button>
    </div>
  </ResponsiveDialog>;
}

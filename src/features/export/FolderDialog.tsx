import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/dialogs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMyProfile } from "@/features/app/session";
import { trainingYears } from "@/lib/training-year";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";
import { saveFile } from "@/lib/platform";
import { getExportHeader, listExportReports, loadFolderExtras, logExport } from "./api";
import { ExportCancelled, exportBaseName } from "./pdf/build";
import { dateDe } from "./pdf/text";
import { listWorksFor } from "@/features/leittexte/api";
import { listExportExperiences } from "./experience-api";
import { loadInstructionData } from "@/features/instructions/api";
import { getCertificate, listApplications, personName } from "@/features/certificates/api";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Knopf „Prüfungsmappe“: Berichte, Prüfungen/Noten und Abwesenheiten einer Person als ein PDF. */
export function FolderButton({ azubiId }: { azubiId: string }) {
  const online = useOnline();
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="outline" onClick={() => setOpen(true)} disabled={!online} title={online ? undefined : OFFLINE_ACTION_HINT}>
      <FolderOpen className="size-4" aria-hidden /> Prüfungsmappe
    </Button>
    {open && <FolderDialog azubiId={azubiId} onClose={() => setOpen(false)} />}
  </>;
}

function FolderDialog({ azubiId, onClose }: { azubiId: string; onClose: () => void }) {
  const online = useOnline();
  const { data: me } = useMyProfile();
  const { data: header } = useQuery({ queryKey: ["export", "header", azubiId], queryFn: () => getExportHeader(azubiId) });
  const years = useMemo(() => header?.training_start ? trainingYears(new Date(`${header.training_start}T00:00:00`), header.training_end ? new Date(`${header.training_end}T00:00:00`) : undefined) : [], [header]);
  const [period, setPeriod] = useState("all");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [withReports, setWithReports] = useState(true);
  const [onlyApproved, setOnlyApproved] = useState(true);
  const [withGrades, setWithGrades] = useState(true);
  const [withAbsences, setWithAbsences] = useState(true);
  const [embed, setEmbed] = useState(false);
  const [withLt, setWithLt] = useState(true);
  const [ltApproved, setLtApproved] = useState(true);
  const [withEx, setWithEx] = useState(true);
  const [exApproved, setExApproved] = useState(true);
  const [withInstr, setWithInstr] = useState(true);
  const [withCert, setWithCert] = useState(true);
  const [withApp, setWithApp] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const range = useMemo((): { from: string | null; to: string | null; label: string } => {
    if (period === "custom") return { from: from || null, to: to || null, label: from || to ? `${from || "Beginn"}_bis_${to || "heute"}` : "Gesamt" };
    const y = years.find((x) => String(x.year) === period);
    if (y) return { from: iso(y.start), to: iso(y.end), label: `${y.year}_Lehrjahr` };
    return { from: null, to: null, label: "Gesamte_Ausbildung" };
  }, [period, from, to, years]);
  const sel = { azubiId, from: range.from, to: range.to, statuses: (onlyApproved ? ["approved"] : ["approved", "submitted"]) as ("approved" | "submitted")[], types: ["weekly", "daily"] as ("weekly" | "daily")[] };
  const { data: list, isFetching } = useQuery({ queryKey: ["export", "list", sel], queryFn: () => listExportReports(sel), enabled: online && withReports });
  const { data: extras } = useQuery({ queryKey: ["export", "folder-extras", azubiId, range.from, range.to], queryFn: () => loadFolderExtras(azubiId, range.from, range.to), enabled: online });
  const { data: works } = useQuery({ queryKey: ["leittexte", "works", azubiId], queryFn: () => listWorksFor(azubiId), enabled: online });
  const exSel = { azubiId, from: range.from, to: range.to, statuses: (exApproved ? ["approved"] : ["approved", "submitted"]) as ("approved" | "submitted")[], kinds: ["erfahrungsbericht", "projektbericht", "leittext"] };
  const { data: exList } = useQuery({ queryKey: ["export", "folder-experiences", exSel], queryFn: () => listExportExperiences(exSel), enabled: online && withEx });
  const { data: instrData } = useQuery({ queryKey: ["export", "folder-instructions", azubiId], queryFn: () => loadInstructionData(azubiId), enabled: online });
  const { data: cert } = useQuery({ queryKey: ["certificate", azubiId], queryFn: () => getCertificate(azubiId).catch(() => null), enabled: online });
  const { data: apps } = useQuery({ queryKey: ["exam-applications", azubiId], queryFn: () => listApplications(azubiId), enabled: online });
  const issuedCert = cert?.status === "issued" ? cert : null;
  const app = (apps ?? []).find((a) => a.status === "confirmed") ?? (apps ?? []).find((a) => a.status === "submitted") ?? null;
  const instrCount = (instrData?.records ?? []).filter((r) => r.status === "confirmed").length;
  const ltStatuses = ltApproved ? ["approved"] : ["approved", "submitted"];
  const ltCount = (works ?? []).filter((w) => ltStatuses.includes(w.status)).length;
  const n = withReports ? list?.reports.length ?? 0 : 0;
  const nothing = !withReports && !withGrades && !withAbsences && !withLt && !withEx && !withInstr && !(withCert && issuedCert) && !(withApp && app);

  const start = async () => {
    if (!header || !extras || nothing) return;
    const ctrl = new AbortController(); abort.current = ctrl;
    setProgress({ done: 0, total: Math.max(1, n) });
    try {
      const { buildExamFolder } = await import("./pdf/folder");
      const leittexte = withLt && ltCount ? await (await import("@/features/leittexte/export")).folderLeittexte(azubiId, ltStatuses, embed) : [];
      const exItems = withEx ? exList?.items ?? [] : [];
      const experiences = exItems.length ? { items: exItems, ctx: await (await import("./pdf/experienceReport")).loadExperienceContext(azubiId, header) } : null;
      const instructions = withInstr && instrData && instrCount
        ? (await import("@/features/instructions/export")).buildInstructionInput(instrData, header, { catalogId: "all", state: "all", from: range.from, to: range.to, onlyConfirmed: true, withOverview: true }, (await import("@/features/instructions/due")).berlinToday())
        : null;
      const azubiName = header.azubi_name ?? "";
      const certificate = withCert && issuedCert ? { certificate: issuedCert, azubiName } : null;
      const application = withApp && app ? { application: app, azubiName, confirmerName: app.status === "confirmed" ? await personName(app.confirmer_id) : null } : null;
      const bytes = await buildExamFolder({
        header, reports: withReports ? list?.reports ?? [] : [], grades: extras.grades, absences: extras.absences,
        period: range.from || range.to ? `${dateDe(range.from)} – ${dateDe(range.to)}` : "Gesamte Ausbildung",
        from: range.from, to: range.to, compiledBy: me?.full_name || "–",
        include: { grades: withGrades, absences: withAbsences, reports: withReports, leittexte: withLt, experiences: withEx, instructions: withInstr, certificate: withCert, application: withApp },
        leittexte, experiences, instructions, certificate, application,
      }, { embedImages: embed, blankSignatures: false, signal: ctrl.signal, onProgress: setProgress });
      if (ctrl.signal.aborted) return;
      saveFile(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${exportBaseName(header, range.label).replace(/^Berichtsheft_/, "Pruefungsmappe_")}.pdf`);
      toast.success("Prüfungsmappe erstellt");
      void logExport(azubiId, "folder", n, range.from, range.to).catch(() => undefined);
      onClose();
    } catch (e) {
      if (!(e instanceof ExportCancelled)) toast.error("Die Prüfungsmappe konnte nicht erstellt werden. Bitte versuche es erneut.");
      setProgress(null);
    }
  };
  const cancel = () => { abort.current?.abort(); setProgress(null); };
  const exams = extras?.grades.filter((g) => g.kind === "klausur" || g.kind === "test").length ?? 0;

  return (
    <ResponsiveDialog open onOpenChange={(v) => { if (!v) { cancel(); onClose(); } }} title="Prüfungsmappe erstellen" description={header?.azubi_name ?? undefined}>
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1 text-sm">
        <p className="rounded-lg border-l-4 border-primary bg-accent p-3">Ein PDF mit Deckblatt, Inhaltsverzeichnis, Übersicht, Prüfungsantrag, Ausbildungszeugnis, Noten, Abwesenheiten, Unterweisungen, Berichten, Erfahrungsberichten und Leittexten.</p>
        {progress ? (
          <div className="space-y-3 py-4">
            <p className="font-medium">{n ? `Bericht ${Math.min(progress.done + 1, progress.total)} von ${progress.total} …` : "Mappe wird erstellt …"}</p>
            <Progress value={(progress.done / Math.max(1, progress.total)) * 100} />
            <Button variant="outline" onClick={cancel}>Abbrechen</Button>
          </div>
        ) : <>
          <fieldset className="space-y-2"><legend className="font-semibold">Zeitraum</legend>
            <Select value={period} onValueChange={setPeriod}><SelectTrigger className="h-11" aria-label="Zeitraum"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Gesamte Ausbildung</SelectItem>{years.map((y) => <SelectItem key={y.year} value={String(y.year)}>{y.label}</SelectItem>)}<SelectItem value="custom">Eigener Zeitraum</SelectItem></SelectContent></Select>
            {period === "custom" && <div className="flex gap-3"><div className="flex-1 space-y-1"><Label htmlFor="pm-from">Von</Label><Input id="pm-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div><div className="flex-1 space-y-1"><Label htmlFor="pm-to">Bis</Label><Input id="pm-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div></div>}
          </fieldset>
          <fieldset className="space-y-2"><legend className="font-semibold">Inhalt</legend>
            <Check id="pm-app" label={`Antrag auf Prüfungszulassung (${apps ? (app ? `${app.exam_term}, ${app.status === "confirmed" ? "bestätigt" : "eingereicht"}` : "keiner eingereicht") : "…"})`} checked={withApp && !!app} onChange={setWithApp} disabled={!app} />
            <Check id="pm-cert" label={`Ausbildungszeugnis (${cert === undefined ? "…" : issuedCert ? "ausgestellt" : "noch nicht ausgestellt"})`} checked={withCert && !!issuedCert} onChange={setWithCert} disabled={!issuedCert} />
            <Check id="pm-grades" label={`Prüfungen und Noten (${extras ? `${exams} Prüfungen, ${extras.grades.length} Noten` : "…"})`} checked={withGrades} onChange={setWithGrades} />
            <Check id="pm-abs" label={`Abwesenheiten (${extras ? extras.absences.length : "…"} genehmigt)`} checked={withAbsences} onChange={setWithAbsences} />
            <Check id="pm-instr" label={`Unterweisungen (${instrData ? `${instrCount} bestätigt` : "…"})`} checked={withInstr} onChange={setWithInstr} />
            <Check id="pm-rep" label={`Berichte (${withReports ? (isFetching && !list ? "…" : n) : "aus"})`} checked={withReports} onChange={setWithReports} />
            {withReports && <div className="space-y-2 pl-6">
              <Check id="pm-appr" label="Nur freigegebene Berichte" checked={onlyApproved} onChange={setOnlyApproved} />
            </div>}
            <Check id="pm-ex" label={`Erfahrungsberichte (${withEx ? (exList ? exList.items.length : "…") : "aus"})`} checked={withEx} onChange={setWithEx} />
            {withEx && <div className="space-y-2 pl-6"><Check id="pm-ex-appr" label="Nur freigegebene Erfahrungsberichte" checked={exApproved} onChange={setExApproved} /></div>}
            <Check id="pm-lt" label={`Leittexte (${withLt ? (works ? ltCount : "…") : "aus"})`} checked={withLt} onChange={setWithLt} />
            {withLt && <div className="space-y-2 pl-6"><Check id="pm-lt-appr" label="Nur freigegebene Leittexte" checked={ltApproved} onChange={setLtApproved} /></div>}
            {(withReports || withLt || withEx) && <Check id="pm-img" label="Bilder und Fotos einbetten" checked={embed} onChange={setEmbed} />}
          </fieldset>
          <Button className="h-11 w-full" disabled={!online || !header || !extras || nothing} onClick={() => void start()}>Mappe erstellen</Button>
          {nothing && <p className="text-xs text-muted-foreground">Wähle mindestens einen Inhalt.</p>}
          {!online && <p className="text-xs text-muted-foreground">{OFFLINE_ACTION_HINT}</p>}
        </>}
      </div>
    </ResponsiveDialog>
  );
}

function Check({ id, label, checked, onChange, disabled }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <div className="flex items-center gap-2"><Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(v === true)} /><Label htmlFor={id} className={disabled ? "font-normal text-muted-foreground" : "font-normal"}>{label}</Label></div>;
}

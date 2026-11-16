import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useMyProfile } from "@/features/app/session";
import { loadProgressContext, saveMyBundesland } from "../api";
import { dateDe, leittextCounts, resolveProgress } from "../model";
import { formatPages, pageUnitLabel, wordsForPages } from "../requirements";
import type { ProgressYear } from "../progress";

export function useExperienceProgress(azubiId: string | undefined) {
  return useQuery({
    queryKey: ["experience", "progress", azubiId],
    queryFn: async () => resolveProgress(await loadProgressContext(azubiId!)),
    enabled: !!azubiId,
  });
}

/** Zwei-Segment-Balken: freigegeben (Erfolg) und eingereicht (Primär, heller), gedeckelt bei required. */
export function TwoSegmentBar({ approved, submitted, required, label, thin }: { approved: number; submitted: number; required: number; label: string; thin?: boolean }) {
  const max = Math.max(required, 1);
  const a = Math.min(approved, max);
  const s = Math.min(submitted, max - a);
  return <div role="progressbar" aria-valuemin={0} aria-valuemax={required} aria-valuenow={Math.min(approved, required)} aria-label={label}
    className={cn("flex w-full overflow-hidden rounded-full bg-muted", thin ? "h-1.5" : "h-3")}>
    <div className="h-full bg-success" style={{ width: `${(a / max) * 100}%` }} />
    <div className="h-full bg-primary/50" style={{ width: `${(s / max) * 100}%` }} />
  </div>;
}

function stateText(y: ProgressYear) {
  switch (y.state) {
    case "done": return <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="size-4" aria-hidden /> Geschafft</span>;
    case "waiting": return <span className="inline-flex items-center gap-1"><Clock className="size-4" aria-hidden /> Wartet auf Freigabe</span>;
    case "late": return <span className="inline-flex items-center gap-1 font-medium text-warning-foreground dark:text-warning"><AlertTriangle className="size-4 text-warning" aria-hidden /> Offen – dieses Lehrjahr ist vorbei</span>;
    case "upcoming": return <span className="text-muted-foreground">Beginnt am {dateDe(y.start)}</span>;
    default: return <span>Noch {y.missing} offen, bis {dateDe(y.end)}</span>;
  }
}

export function ExperienceProgressCard({ azubiId, compact = false }: { azubiId: string; compact?: boolean }) {
  const { data: me } = useMyProfile();
  const { data, isLoading } = useExperienceProgress(azubiId);
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<string>("");
  const [saving, setSaving] = useState(false);
  if (isLoading || !data) return <div className="space-y-3 rounded-2xl border bg-card p-4"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-5/6" /></div>;
  const { requirement: req, progress, bundesland, ctx } = data;
  const isSelf = me?.id === azubiId;
  const n = req?.required_per_year ?? 2;
  const official = req?.required_basis === "official";
  const kindWord = (k: string | null | undefined) => (k === "official" ? "Vorgabe" : "Empfehlung");
  const years = compact ? progress.years.filter((y) => y.isCurrent) : progress.years;

  const saveBl = async () => {
    if (!choice) return;
    setSaving(true);
    try {
      await saveMyBundesland(choice);
      toast.success("Bundesland gespeichert");
      await queryClient.invalidateQueries({ queryKey: ["experience"] });
      await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen."); }
    finally { setSaving(false); }
  };

  return <section className="space-y-4 rounded-2xl border bg-card p-4" aria-label="Fortschritt Erfahrungsberichte">
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold">{official ? `Pflicht laut ${req?.source_issuer}: ${n} Erfahrungsberichte je Lehrjahr` : `Mindestzahl in Azuvera: ${n} Erfahrungsberichte je Lehrjahr`}</p>
        <Badge variant={official ? "default" : "secondary"}>{official ? "Vorgabe der zuständigen Stelle" : "Standardvorgabe"}</Badge>
      </div>
      {(bundesland.name || ctx.professionName) && <p className="text-sm text-muted-foreground">
        {[bundesland.name, ctx.professionName].filter(Boolean).join(" · ")}
        {bundesland.source === "company" ? " (vom Betrieb)" : bundesland.source === "profile" ? " (von dir gewählt)" : ""}
      </p>}
      {!compact && <p className="text-sm">{req?.source_url && req.source_issuer
        ? <a href={req.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline">{req.source_stand ? `${req.source_issuer}, Stand ${req.source_stand}` : req.source_issuer}<ExternalLink className="size-3.5" aria-hidden /></a>
        : <span className="text-muted-foreground">Quelle noch nicht hinterlegt</span>}</p>}
    </div>

    {!bundesland.code && (isSelf
      ? <div className="space-y-2 rounded-xl border border-warning/50 bg-warning/10 p-3 text-sm">
          <p>Wähle dein Bundesland, damit Azuvera die Vorgaben deiner zuständigen Stelle anzeigen kann. Bis dahin gilt die Standardvorgabe.</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1"><label className="mb-1 block text-xs font-medium" htmlFor={`bl-${azubiId}`}>Bundesland</label>
              <Select value={choice} onValueChange={setChoice}><SelectTrigger id={`bl-${azubiId}`}><SelectValue placeholder="Bitte wählen" /></SelectTrigger>
                <SelectContent>{ctx.bundeslaender.map((b) => <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>)}</SelectContent></Select></div>
            <Button onClick={() => void saveBl()} disabled={!choice || saving}>Speichern</Button>
          </div>
        </div>
      : <p className="rounded-xl border bg-muted/40 p-3 text-sm">Für diese Person ist kein Bundesland hinterlegt. Die Ausbildungsleitung trägt es beim Betrieb ein.</p>)}

    {!progress.hasYears ? <div className="space-y-1 text-sm">
      {isSelf ? <p>Trage deinen Ausbildungsbeginn im Profil ein, damit Azuvera die Lehrjahre berechnen kann. <Link to="/profil" className="text-primary underline">Zum Profil</Link></p>
        : <p className="text-muted-foreground">Für diese Person ist kein Ausbildungsbeginn hinterlegt.</p>}
      <p className="font-medium">{progress.total.approved + progress.total.submitted} Erfahrungsberichte geschrieben</p>
    </div> : <>
      <ul className="space-y-3">
        {years.map((y) => <li key={y.year} className={cn("space-y-2 rounded-xl border p-3", y.isCurrent && "border-primary")}>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{y.label}</span><span className="text-muted-foreground">{dateDe(y.start)} – {dateDe(y.end)}</span>{y.isCurrent && <Badge variant="outline" className="border-primary text-primary">laufend</Badge>}</span>
            <span className="font-medium tabular-nums">{y.approved} von {y.required}</span>
          </div>
          <TwoSegmentBar approved={y.approved} submitted={y.submitted} required={y.required} label={`${y.year}. Lehrjahr: ${Math.min(y.approved, y.required)} von ${y.required} freigegeben`} />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {stateText(y)}
            {y.extra > 0 && <Badge variant="secondary">+{y.extra} freiwillig</Badge>}
            {isSelf && y.drafts > 0 && <Badge variant="outline">{y.drafts} {y.drafts === 1 ? "Entwurf" : "Entwürfe"}</Badge>}
          </div>
        </li>)}
      </ul>
      {!compact && <div className="space-y-2 border-t pt-3">
        <div className="flex items-center justify-between text-sm"><span className="font-semibold">Gesamt: {progress.total.approved + progress.total.submitted} von {progress.total.required}</span>
          {progress.total.fulfilled && <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="size-4" aria-hidden /> Alle Lehrjahre erfüllt</span>}</div>
        <TwoSegmentBar approved={progress.total.approved} submitted={progress.total.submitted} required={progress.total.required} label={`Gesamt: ${progress.total.approved} von ${progress.total.required} freigegeben`} />
        {progress.total.extra > 0 && <p className="text-sm text-muted-foreground">Freiwillig zusätzlich: {progress.total.extra}</p>}
      </div>}
    </>}

    {!compact && progress.hint && <div className="space-y-1.5 text-sm">
      {progress.hint.total != null && <>
        <p>{kindWord(progress.hint.kind)} deiner Stelle: {progress.hint.counted} von {progress.hint.total} insgesamt{progress.hint.untilInterim != null ? `, davon ${progress.hint.untilInterim} bis zur Anmeldung zur Zwischenprüfung` : ""}</p>
        <TwoSegmentBar thin approved={progress.hint.counted} submitted={0} required={progress.hint.total} label={`${kindWord(progress.hint.kind)} deiner Stelle: ${progress.hint.counted} von ${progress.hint.total} insgesamt`} />
      </>}
      {progress.hint.perYear != null && <p>{kindWord(progress.hint.kind)}: {progress.hint.perYear} je Lehrjahr</p>}
    </div>}

    {!compact && <Collapsible>
      <CollapsibleTrigger className="group inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary">Was sagt meine zuständige Stelle?<ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden /></CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-1 text-sm">
        <p className="whitespace-pre-wrap">{req?.note?.trim() || "Für dein Bundesland und deinen Beruf ist keine verbindliche Zahl hinterlegt. Es gilt die Standardvorgabe von Azuvera."}</p>
        {req?.min_pages != null && <p>Mindestens {formatPages(Number(req.min_pages))} {pageUnitLabel(Number(req.min_pages), req.page_unit)}, etwa {wordsForPages(Number(req.min_pages), req.page_unit)} Wörter.</p>}
        <p>{(req?.leittext_weight ?? 0) > 0 ? `Ein Leittext zählt wie ${leittextCounts(req!.leittext_weight)}.` : "Leittexte zählen hier nicht zum Ziel."}</p>
        <p className="text-muted-foreground">Diese Angaben stammen aus der verlinkten Veröffentlichung (Stand der Recherche: {dateDe(req?.checked_on)}). Maßgeblich ist, was dir deine Ausbildungsberatung sagt. Du kannst jederzeit mehr schreiben; zusätzliche Berichte erscheinen als freiwillig.</p>
      </CollapsibleContent>
    </Collapsible>}
  </section>;
}

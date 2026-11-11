import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarOff, Check, CircleEllipsis, HeartPulse, Pencil, Plus, School, Sun, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog, ResponsiveDialog } from "@/components/dialogs";
import { EmptyState, ListSkeleton, PageHeader, StatCard } from "@/components/shared";
import { REVIEWER_ROLES, useMyProfile } from "@/features/app/session";
import { DictationButton } from "@/features/dictation/dictation-button";
import { readPunctuationPreference } from "@/features/dictation/api";
import { currentTrainingYear, trainingYears } from "@/lib/training-year";
import { cn } from "@/lib/utils";
import {
  ABSENCE_STATUS_LABELS, ABSENCE_TYPE_LABELS, absenceDisplayNames, canReviewAbsences, createAbsence, deleteAbsence,
  listAbsences, listAccessibleAzubis, listOverlappingAbsences, reviewAbsence, updateAbsence,
  type Absence, type AbsenceInput, type AbsenceStatus, type AbsenceType,
} from "@/features/absences/api";
import { absenceMetric, inclusiveDays, parseLocalDate, validateAbsenceDates } from "@/features/absences/absence-utils";

const TITLE = "Abwesenheiten – Azuvera";
const TYPE_ICONS = { urlaub: Sun, krank: HeartPulse, berufsschule: School, sonstiges: CircleEllipsis };

export const Route = createFileRoute("/_authenticated/abwesenheiten")({
  validateSearch: (search: Record<string, unknown>): { azubi?: string | undefined; id?: string | undefined } => ({
    azubi: typeof search["azubi"] === "string" ? search["azubi"] : undefined,
    id: typeof search["id"] === "string" ? search["id"] : undefined,
  }),
  head: () => ({ meta: [
    { title: TITLE },
    { name: "description", content: "Urlaub, Krankheit, Berufsschule und sonstige Abwesenheiten eintragen und prüfen." },
    { property: "og:title", content: TITLE },
    { property: "og:description", content: "Abwesenheiten während der Ausbildung übersichtlich verwalten." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AbsencesPage,
});

function AbsencesPage() {
  const { azubi: azubiFilter, id: highlightedId } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useMyProfile();
  const isAzubi = profile?.role === "azubi";
  const selectedAzubi = isAzubi ? profile?.id ?? "" : azubiFilter ?? "";
  const [yearFilter, setYearFilter] = useState("current");
  const [statusFilter, setStatusFilter] = useState<AbsenceStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<AbsenceType | "all">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Absence | null>(null);
  const [deleting, setDeleting] = useState<Absence | null>(null);
  const [reviewing, setReviewing] = useState<{ absence: Absence; decision: AbsenceStatus; change: boolean } | null>(null);

  const { data: azubiOptions } = useQuery({ queryKey: ["absences", "azubis"], queryFn: listAccessibleAzubis, enabled: !!profile && !isAzubi });
  const selectedProfile = isAzubi ? profile : azubiOptions?.find((p) => p.id === selectedAzubi);
  const years = useMemo(() => selectedProfile?.ausbildungsbeginn ? trainingYears(parseLocalDate(selectedProfile.ausbildungsbeginn), selectedProfile.ausbildungsende ? parseLocalDate(selectedProfile.ausbildungsende) : undefined) : [], [selectedProfile]);
  const currentYear = selectedProfile?.ausbildungsbeginn ? currentTrainingYear(parseLocalDate(selectedProfile.ausbildungsbeginn), selectedProfile.ausbildungsende ? parseLocalDate(selectedProfile.ausbildungsende) : undefined) : 1;
  const effectiveYear = yearFilter === "current" ? currentYear : Number(yearFilter);
  const period = years.find((y) => y.year === effectiveYear) ?? null;

  const { data: absences, isLoading } = useQuery({ queryKey: ["absences", selectedAzubi], queryFn: () => listAbsences(selectedAzubi), enabled: !!selectedAzubi });
  const { data: canReview } = useQuery({ queryKey: ["absences", "can-review", selectedAzubi], queryFn: () => canReviewAbsences(selectedAzubi), enabled: !!selectedAzubi && !isAzubi && REVIEWER_ROLES.includes(profile!.role) });
  const { data: names } = useQuery({
    queryKey: ["absences", "names", selectedAzubi],
    queryFn: () => absenceDisplayNames((absences ?? []).map((a) => a.azubi_id)),
    enabled: !!absences && !isAzubi,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["absences"] }),
      queryClient.invalidateQueries({ queryKey: ["absent-days"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  };

  const inYear = (absences ?? []).filter((a) => period && a.date_from <= format(period.end, "yyyy-MM-dd") && a.date_to >= format(period.start, "yyyy-MM-dd"));
  const filtered = inYear.filter((a) => (statusFilter === "all" || a.status === statusFilter) && (typeFilter === "all" || a.type === typeFilter));
  const openForm = (absence?: Absence) => { setEditing(absence ?? null); setFormOpen(true); };

  const remove = async () => {
    if (!deleting) return;
    try {
      await deleteAbsence(deleting.id);
      await refresh();
      toast.success("Gelöscht");
      setDeleting(null);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Löschen fehlgeschlagen."); }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Abwesenheiten"
        subtitle="Trage Urlaub, Krankheit, Berufsschule oder Sonstiges ein – deine zuständige Ausbilder:in genehmigt sie."
        actions={isAzubi ? <Button onClick={() => openForm()}><Plus className="size-4" aria-hidden />Neue Abwesenheit</Button> : undefined}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {!isAzubi && (
          <Select value={selectedAzubi} onValueChange={(value) => { setYearFilter("current"); void navigate({ to: "/abwesenheiten", search: { azubi: value } }); }}>
            <SelectTrigger className="sm:w-64"><SelectValue placeholder="Azubi auswählen" /></SelectTrigger>
            <SelectContent>{(azubiOptions ?? []).filter((p) => p.id !== profile?.id).map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {years.length > 0 && (
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="current">{currentYear}. Lehrjahr (laufend)</SelectItem>
              {years.map((y) => <SelectItem key={y.year} value={String(y.year)}>{y.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AbsenceStatus | "all")}>
          <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Alle Status</SelectItem>{(Object.keys(ABSENCE_STATUS_LABELS) as AbsenceStatus[]).map((s) => <SelectItem key={s} value={s}>{ABSENCE_STATUS_LABELS[s]}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as AbsenceType | "all")}>
          <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Alle Arten</SelectItem>{(Object.keys(ABSENCE_TYPE_LABELS) as AbsenceType[]).map((t) => <SelectItem key={t} value={t}>{ABSENCE_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {period && (
        <section className="grid gap-3 sm:grid-cols-3">
          {(["urlaub", "krank", "berufsschule"] as const).map((type) => (
            <StatCard key={type} label={{ urlaub: "Urlaubstage", krank: "Krankheitstage", berufsschule: "Berufsschultage" }[type]} value={absenceMetric(inYear, type, period.start, period.end)} hint={`im ${effectiveYear}. Lehrjahr · Kalendertage, ohne abgelehnte`} />
          ))}
        </section>
      )}

      {!selectedAzubi ? (
        <EmptyState icon={CalendarOff} title="Bitte wähle eine Person aus." />
      ) : isLoading ? <ListSkeleton /> : filtered.length === 0 ? (
        <EmptyState icon={CalendarOff} title="Noch keine Abwesenheiten eingetragen." action={isAzubi ? <Button onClick={() => openForm()}><Plus className="size-4" />Neue Abwesenheit</Button> : undefined} />
      ) : (
        <ul className="space-y-3">
          {filtered.map((absence) => {
            const Icon = TYPE_ICONS[absence.type];
            const ownActions = isAzubi && absence.azubi_id === profile?.id;
            return (
              <li key={absence.id} className={cn("rounded-2xl border bg-card p-4 shadow-sm", highlightedId === absence.id && "ring-2 ring-primary")}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon className="size-5 text-primary" aria-hidden />
                      <span className="font-semibold">{ABSENCE_TYPE_LABELS[absence.type]}</span>
                      <Badge variant={absence.status === "pending" ? "secondary" : absence.status === "rejected" ? "destructive" : "outline"} className={absence.status === "approved" ? "border-success/40 bg-success/15" : undefined}>{ABSENCE_STATUS_LABELS[absence.status]}</Badge>
                    </div>
                    <p className="mt-2 text-sm">
                      {format(parseLocalDate(absence.date_from), "d. MMMM yyyy", { locale: de })} – {format(parseLocalDate(absence.date_to), "d. MMMM yyyy", { locale: de })} · {inclusiveDays(absence.date_from, absence.date_to)} Tage
                      {!isAzubi && names?.get(absence.azubi_id) ? ` • ${names.get(absence.azubi_id)}` : ""}
                    </p>
                    {absence.note && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{absence.note}</p>}
                    {absence.status === "rejected" && absence.review_note && <p className="mt-2 text-sm text-destructive">Begründung: {absence.review_note}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    {ownActions && absence.status === "pending" && <Button variant="outline" size="sm" onClick={() => openForm(absence)}><Pencil className="size-4" />Bearbeiten</Button>}
                    {ownActions && ["pending", "rejected"].includes(absence.status) && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleting(absence)}><Trash2 className="size-4" />Löschen</Button>}
                    {canReview && absence.status === "pending" && <>
                      <Button size="sm" onClick={() => setReviewing({ absence, decision: "approved", change: false })}><Check className="size-4" />Genehmigen</Button>
                      <Button variant="outline" size="sm" onClick={() => setReviewing({ absence, decision: "rejected", change: false })}><X className="size-4" />Ablehnen</Button>
                    </>}
                    {canReview && absence.status !== "pending" && <Button variant="outline" size="sm" onClick={() => setReviewing({ absence, decision: absence.status, change: true })}>Entscheidung ändern</Button>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {profile && <AbsenceFormDialog key={editing?.id ?? "new"} open={formOpen} onOpenChange={setFormOpen} azubiId={profile.id} absence={editing} onSaved={refresh} />}
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Eintrag löschen?" description="Diese Abwesenheit wird gelöscht." confirmLabel="Löschen" destructive onConfirm={() => void remove()} />
      {reviewing && <ReviewDialog key={`${reviewing.absence.id}-${reviewing.decision}`} state={reviewing} onOpenChange={(o) => !o && setReviewing(null)} onSaved={refresh} />}
    </div>
  );
}

function AbsenceFormDialog({ open, onOpenChange, azubiId, absence, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; azubiId: string; absence: Absence | null; onSaved: () => Promise<void> }) {
  const [type, setType] = useState<AbsenceType>(absence?.type ?? "urlaub");
  const [from, setFrom] = useState(absence?.date_from ?? "");
  const [to, setTo] = useState(absence?.date_to ?? "");
  const [note, setNote] = useState(absence?.note ?? "");
  const [busy, setBusy] = useState(false);
  const validDates = !!from && !!to && to >= from && inclusiveDays(from, to) <= 366;
  const { data: overlaps } = useQuery({ queryKey: ["absences", "overlap", azubiId, from, to, absence?.id], queryFn: () => listOverlappingAbsences(azubiId, from, to, absence?.id), enabled: open && validDates });

  const save = async () => {
    if (!type) { toast.error("Bitte alle Pflichtfelder ausfüllen"); return; }
    const dateError = validateAbsenceDates(from, to);
    if (dateError) { toast.error(dateError); return; }
    setBusy(true);
    try {
      const input: AbsenceInput = { type, dateFrom: from, dateTo: to, note: note.trim() };
      if (absence) await updateAbsence(absence.id, input); else await createAbsence(azubiId, input);
      await onSaved();
      toast.success("Gespeichert");
      onOpenChange(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Speichern fehlgeschlagen."); }
    finally { setBusy(false); }
  };

  return <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={absence ? "Bearbeiten" : "Neue Abwesenheit"}>
    <div className="space-y-4">
      <div className="space-y-1.5"><Label>Art *</Label><Select value={type} onValueChange={(v) => setType(v as AbsenceType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(ABSENCE_TYPE_LABELS) as AbsenceType[]).map((t) => <SelectItem key={t} value={t}>{ABSENCE_TYPE_LABELS[t]}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="absence-from">Von *</Label><Input id="absence-from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (!to || to < e.target.value) setTo(e.target.value); }} /></div>
        <div className="space-y-1.5"><Label htmlFor="absence-to">Bis *</Label><Input id="absence-to" type="date" min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="absence-note">Notiz</Label><Textarea id="absence-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />{type === "krank" && <p className="text-xs text-muted-foreground">Bitte trage keine Diagnose ein.</p>}</div>
      {validDates && !!overlaps?.length && <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">Für diesen Zeitraum gibt es schon eine Abwesenheit.</p>}
      <Button className="w-full" onClick={() => void save()} disabled={busy}>Speichern</Button>
    </div>
  </ResponsiveDialog>;
}

function ReviewDialog({ state, onOpenChange, onSaved }: { state: { absence: Absence; decision: AbsenceStatus; change: boolean }; onOpenChange: (o: boolean) => void; onSaved: () => Promise<void> }) {
  const [decision, setDecision] = useState<AbsenceStatus>(state.decision);
  const [note, setNote] = useState(state.absence.review_note ?? "");
  const [interim, setInterim] = useState("");
  const [punctuation, setPunctuation] = useState(true);
  const [busy, setBusy] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setPunctuation(readPunctuationPreference()), []);

  const save = async () => {
    if (decision === "rejected" && note.trim().length < 3) { toast.error("Bitte gib eine Begründung mit mindestens 3 Zeichen ein."); return; }
    setBusy(true);
    try {
      await reviewAbsence(state.absence.id, decision, note.trim());
      await onSaved();
      toast.success(decision === "approved" ? "Genehmigt" : decision === "rejected" ? "Abgelehnt" : "Gespeichert");
      onOpenChange(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Speichern fehlgeschlagen."); }
    finally { setBusy(false); }
  };

  return <ResponsiveDialog open onOpenChange={onOpenChange} title={state.change ? "Entscheidung ändern" : decision === "rejected" ? "Abwesenheit ablehnen" : "Abwesenheit genehmigen"}>
    <div className="space-y-4">
      {state.change && <div className="space-y-1.5"><Label>Status</Label><Select value={decision} onValueChange={(v) => setDecision(v as AbsenceStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Offen</SelectItem><SelectItem value="approved">Genehmigt</SelectItem><SelectItem value="rejected">Abgelehnt</SelectItem></SelectContent></Select></div>}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2"><Label htmlFor="review-note">Begründung{decision === "rejected" ? " (erforderlich)" : " (optional)"}</Label><DictationButton textareaRef={noteRef} getValue={() => note} onValueChange={setNote} onInterim={setInterim} spokenPunctuation={punctuation} /></div>
        <Textarea id="review-note" ref={noteRef} rows={4} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        {interim && <p className="text-sm italic text-muted-foreground">{interim}</p>}
      </div>
      <Button className="w-full" variant={decision === "rejected" ? "destructive" : "default"} onClick={() => void save()} disabled={busy}>Speichern</Button>
    </div>
  </ResponsiveDialog>;
}

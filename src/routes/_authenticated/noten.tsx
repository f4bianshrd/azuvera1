import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { GraduationCap, Pencil, Plus, Trash2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ConfirmDialog, ResponsiveDialog } from "@/components/dialogs";
import { EmptyState, ListSkeleton, PageHeader, StatCard } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { currentTrainingYear, trainingYears } from "@/lib/training-year";
import { GRADE_KIND_LABELS, createGrade, deleteGrade, gradeDisplayNames, listGradeAzubis, listGrades, updateGrade, type Grade, type GradeInput, type GradeKind } from "@/features/grades/api";
import { averageGrade, formatGrade, gradeTrend, parseGradeInput, subjectAverages } from "@/features/grades/grade-utils";

const TITLE = "Schulnoten – Azuvera";

export const Route = createFileRoute("/_authenticated/noten")({
  validateSearch: (search: Record<string, unknown>): { azubi?: string | undefined } => ({ azubi: typeof search["azubi"] === "string" ? search["azubi"] : undefined }),
  head: () => ({ meta: [
    { title: TITLE },
    { name: "description", content: "Klausuren und Bewertungen aus der Berufsschule mit Durchschnitten und Notenverlauf." },
    { property: "og:title", content: TITLE },
    { property: "og:description", content: "Schulnoten der Ausbildung auswerten und verfolgen." },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: GradesPage,
});

function GradesPage() {
  const { azubi: azubiFilter } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useMyProfile();
  const isAzubi = profile?.role === "azubi";
  const selectedAzubi = isAzubi ? profile?.id ?? "" : azubiFilter ?? "";
  const [yearFilter, setYearFilter] = useState("current");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState<GradeKind | "all">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Grade | null>(null);
  const [deleting, setDeleting] = useState<Grade | null>(null);

  const { data: azubiOptions } = useQuery({ queryKey: ["grades", "azubis"], queryFn: listGradeAzubis, enabled: !!profile && !isAzubi });
  const selectedProfile = isAzubi ? profile : azubiOptions?.find((p) => p.id === selectedAzubi);
  const years = useMemo(() => selectedProfile?.ausbildungsbeginn ? trainingYears(new Date(`${selectedProfile.ausbildungsbeginn}T00:00:00`), selectedProfile.ausbildungsende ? new Date(`${selectedProfile.ausbildungsende}T00:00:00`) : undefined) : [], [selectedProfile]);
  const currentYear = selectedProfile?.ausbildungsbeginn ? currentTrainingYear(new Date(`${selectedProfile.ausbildungsbeginn}T00:00:00`), selectedProfile.ausbildungsende ? new Date(`${selectedProfile.ausbildungsende}T00:00:00`) : undefined) : 1;
  const effectiveYear = yearFilter === "current" ? currentYear : Number(yearFilter);
  const period = years.find((y) => y.year === effectiveYear) ?? null;
  const { data: grades, isLoading } = useQuery({ queryKey: ["grades", selectedAzubi], queryFn: () => listGrades(selectedAzubi), enabled: !!selectedAzubi });
  const { data: names } = useQuery({ queryKey: ["grades", "names", selectedAzubi], queryFn: () => gradeDisplayNames((grades ?? []).map((g) => g.azubi_id)), enabled: !!grades && !isAzubi });

  const inYear = (grades ?? []).filter((g) => !period || (g.grade_date >= format(period.start, "yyyy-MM-dd") && g.grade_date <= format(period.end, "yyyy-MM-dd")));
  const subjects = [...new Set(inYear.map((g) => g.subject))].sort((a, b) => a.localeCompare(b, "de"));
  const filtered = inYear.filter((g) => (subjectFilter === "all" || g.subject === subjectFilter) && (kindFilter === "all" || g.kind === kindFilter));
  const averages = subjectAverages(filtered);
  const trend = gradeTrend(filtered, subjectFilter);
  const overall = averageGrade(filtered);
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["grades"] });
  const openForm = (grade?: Grade) => { setEditing(grade ?? null); setFormOpen(true); };

  const remove = async () => {
    if (!deleting) return;
    try {
      await deleteGrade(deleting.id);
      await refresh();
      toast.success("Gelöscht");
      setDeleting(null);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Löschen fehlgeschlagen."); }
  };

  return <div className="space-y-5">
    <PageHeader title="Schulnoten" subtitle="Klausuren und Bewertungen aus der Berufsschule" actions={isAzubi ? <Button onClick={() => openForm()}><Plus className="size-4" />Neue Note</Button> : undefined} />
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {!isAzubi && <Select value={selectedAzubi} onValueChange={(value) => { setYearFilter("current"); setSubjectFilter("all"); void navigate({ to: "/noten", search: { azubi: value } }); }}><SelectTrigger className="sm:w-64"><SelectValue placeholder="Azubi auswählen" /></SelectTrigger><SelectContent>{(azubiOptions ?? []).filter((p) => p.id !== profile?.id).map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent></Select>}
      {years.length > 0 && <Select value={yearFilter} onValueChange={setYearFilter}><SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="current">{currentYear}. Lehrjahr (laufend)</SelectItem>{years.map((y) => <SelectItem key={y.year} value={String(y.year)}>{y.label}</SelectItem>)}</SelectContent></Select>}
      <Select value={subjectFilter} onValueChange={setSubjectFilter}><SelectTrigger className="sm:w-44"><SelectValue placeholder="Fach" /></SelectTrigger><SelectContent><SelectItem value="all">Alle Fächer</SelectItem>{subjects.map((subject) => <SelectItem key={subject} value={subject}>{subject}</SelectItem>)}</SelectContent></Select>
      <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as GradeKind | "all")}><SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Alle Arten</SelectItem>{(Object.keys(GRADE_KIND_LABELS) as GradeKind[]).map((kind) => <SelectItem key={kind} value={kind}>{GRADE_KIND_LABELS[kind]}</SelectItem>)}</SelectContent></Select>
    </div>

    <section className="grid gap-3 sm:grid-cols-3">
      <StatCard label="Gesamtschnitt" value={overall === null ? "–" : formatGrade(overall, 2)} hint="Ungewichteter Durchschnitt – die Gewichtung deiner Schule kann abweichen." />
      <StatCard label="Noten" value={filtered.length} />
      <StatCard label="Bestes Fach" value={averages[0] ? `${averages[0].subject} · ${formatGrade(averages[0].average, 2)}` : "–"} />
    </section>

    {filtered.length > 0 && <GradeCharts grades={filtered} subject={subjectFilter} />}

    {!selectedAzubi ? <EmptyState icon={GraduationCap} title="Bitte wähle eine Person aus." /> : isLoading ? <ListSkeleton /> : filtered.length === 0 ? (
      <EmptyState icon={GraduationCap} title="Noch keine Noten eingetragen." action={isAzubi ? <Button onClick={() => openForm()}><Plus className="size-4" />Neue Note</Button> : undefined} />
    ) : <ul className="space-y-2">{filtered.map((grade) => <li key={grade.id} className="flex items-start justify-between gap-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="min-w-0"><p className="font-semibold">{grade.subject} <span className="ml-2 text-lg">{formatGrade(Number(grade.grade))}</span></p><p className="mt-1 text-sm text-muted-foreground">{format(new Date(`${grade.grade_date}T00:00:00`), "d. MMMM yyyy", { locale: de })} • {GRADE_KIND_LABELS[grade.kind]}{!isAzubi && names?.get(grade.azubi_id) ? ` • ${names.get(grade.azubi_id)}` : ""}</p>{grade.note && <p className="mt-2 whitespace-pre-wrap text-sm">{grade.note}</p>}</div>
      {isAzubi && grade.azubi_id === profile?.id && <div className="flex shrink-0 gap-1"><Button variant="ghost" size="icon" aria-label="Note bearbeiten" onClick={() => openForm(grade)}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" aria-label="Note löschen" className="text-destructive" onClick={() => setDeleting(grade)}><Trash2 className="size-4" /></Button></div>}
    </li>)}</ul>}

    {profile && <GradeFormDialog key={editing?.id ?? "new"} open={formOpen} onOpenChange={setFormOpen} azubiId={profile.id} grade={editing} subjects={subjects} onSaved={refresh} />}
    <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Note löschen?" description="Diese Schulnote wird gelöscht." confirmLabel="Löschen" destructive onConfirm={() => void remove()} />
  </div>;
}

function GradeCharts({ grades, subject }: { grades: Grade[]; subject: string }) {
  const [averageTable, setAverageTable] = useState(false);
  const [trendTable, setTrendTable] = useState(false);
  const averages = subjectAverages(grades);
  const trend = gradeTrend(grades, subject);
  return <div className="grid gap-5 xl:grid-cols-2">
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <h2 className="font-semibold">Durchschnitt je Fach</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <ul className="space-y-2 text-sm">{averages.map((row) => <li key={row.subject} className="flex justify-between gap-2 border-b pb-2"><span>{row.subject}<span className="block text-xs text-muted-foreground">{row.count} Noten</span></span><strong>{formatGrade(row.average, 2)}</strong></li>)}</ul>
        {!averageTable && <ChartContainer config={{ average: { label: "Schnitt", color: "var(--chart-1)" } }} className="h-56 w-full"><BarChart data={averages} layout="vertical" margin={{ left: 8, right: 12 }}><CartesianGrid horizontal={false} /><XAxis type="number" domain={[1, 6]} ticks={[1, 2, 3, 4, 5, 6]} /><YAxis type="category" dataKey="subject" width={70} tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent formatter={(value) => formatGrade(Number(value), 2)} />} /><Bar dataKey="average" name="Schnitt" fill="var(--color-average)" radius={4} /></BarChart></ChartContainer>}
      </div>
      <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setAverageTable((v) => !v)}>{averageTable ? "Als Diagramm anzeigen" : "Als Tabelle anzeigen"}</Button>
      {averageTable && <div className="mt-2 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th className="py-1">Fach</th><th>Schnitt</th><th>Anzahl</th></tr></thead><tbody>{averages.map((row) => <tr key={row.subject} className="border-t"><td className="py-1">{row.subject}</td><td>{formatGrade(row.average, 2)}</td><td>{row.count}</td></tr>)}</tbody></table></div>}
    </section>
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <h2 className="font-semibold">Notenverlauf</h2>
      {!trendTable ? <ChartContainer config={{ grade: { label: "Note", color: "var(--chart-2)" } }} className="mt-4 h-64 w-full"><LineChart data={trend} margin={{ left: 4, right: 12, top: 8 }}><CartesianGrid vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis reversed domain={[1, 6]} ticks={[1, 2, 3, 4, 5, 6]} width={28} /><ChartTooltip content={<ChartTooltipContent formatter={(value) => formatGrade(Number(value), 2)} />} /><Line type="monotone" dataKey="grade" name="Note" stroke="var(--color-grade)" strokeWidth={2.5} dot={{ fill: "var(--color-grade)" }} /></LineChart></ChartContainer> : <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th>Zeitraum</th><th>Note</th><th>Anzahl</th></tr></thead><tbody>{trend.map((point) => <tr key={point.key} className="border-t"><td className="py-1">{point.label}</td><td>{formatGrade(point.grade, 2)}</td><td>{point.count}</td></tr>)}</tbody></table></div>}
      <Button variant="link" size="sm" className="mt-2 h-auto px-0" onClick={() => setTrendTable((v) => !v)}>{trendTable ? "Als Diagramm anzeigen" : "Als Tabelle anzeigen"}</Button>
    </section>
  </div>;
}

function GradeFormDialog({ open, onOpenChange, azubiId, grade, subjects, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; azubiId: string; grade: Grade | null; subjects: string[]; onSaved: () => Promise<unknown> }) {
  const [subject, setSubject] = useState(grade?.subject ?? "");
  const [value, setValue] = useState(grade ? formatGrade(Number(grade.grade)) : "");
  const [date, setDate] = useState(grade?.grade_date ?? format(new Date(), "yyyy-MM-dd"));
  const [kind, setKind] = useState<GradeKind>(grade?.kind ?? "klausur");
  const [note, setNote] = useState(grade?.note ?? "");
  const [busy, setBusy] = useState(false);
  const today = format(new Date(), "yyyy-MM-dd");

  const save = async () => {
    const parsed = parseGradeInput(value);
    if (!subject.trim() || !value.trim() || !date) { toast.error("Bitte alle Pflichtfelder ausfüllen"); return; }
    if (parsed === null || parsed < 1 || parsed > 6) { toast.error("Note muss zwischen 1 und 6 liegen"); return; }
    setBusy(true);
    try {
      const input: GradeInput = { subject: subject.trim(), grade: parsed, gradeDate: date, kind, note: note.trim() };
      if (grade) await updateGrade(grade.id, input); else await createGrade(azubiId, input);
      await onSaved();
      toast.success("Gespeichert");
      onOpenChange(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Speichern fehlgeschlagen."); }
    finally { setBusy(false); }
  };

  return <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={grade ? "Bearbeiten" : "Neue Note"}><div className="space-y-4">
    <div className="space-y-1.5"><Label htmlFor="grade-subject">Fach *</Label><Input id="grade-subject" list="grade-subjects" placeholder="z. B. WiSo" maxLength={80} value={subject} onChange={(e) => setSubject(e.target.value)} /><datalist id="grade-subjects">{subjects.map((s) => <option key={s} value={s} />)}</datalist></div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="grade-value">Note (1–6) *</Label><Input id="grade-value" inputMode="decimal" type="text" placeholder="z. B. 2,5" value={value} onChange={(e) => setValue(e.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="grade-date">Datum *</Label><Input id="grade-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} /></div></div>
    <div className="space-y-1.5"><Label>Art</Label><Select value={kind} onValueChange={(v) => setKind(v as GradeKind)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(GRADE_KIND_LABELS) as GradeKind[]).map((k) => <SelectItem key={k} value={k}>{GRADE_KIND_LABELS[k]}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-1.5"><Label htmlFor="grade-note">Notiz</Label><Textarea id="grade-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></div>
    <Button className="w-full" onClick={() => void save()} disabled={busy}>Speichern</Button>
  </div></ResponsiveDialog>;
}

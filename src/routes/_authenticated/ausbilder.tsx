import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { de } from "date-fns/locale";
import { Check, CheckCheck, Clock3, Eye, MessageSquare, Paperclip, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveDialog } from "@/components/dialogs";
import { EmptyState, ListSkeleton, PageHeader, StatusBadge } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { useProfessions } from "@/features/app/queries";
import { DictationButton } from "@/features/dictation/dictation-button";
import { readPunctuationPreference } from "@/features/dictation/api";
import { ABSENCE_STATUS_LABELS, ABSENCE_TYPE_LABELS, reviewAbsence, type Absence, type AbsenceStatus } from "@/features/absences/api";
import { displayNames, reportTitle, type Report, type ReportStatus, type ReportType } from "@/features/reports/api";
import { ApprovalSheet } from "@/features/review/approval-sheet";
import { RejectionSheet } from "@/features/review/rejection-sheet";
import { BulkApprovalDialog } from "@/features/review/bulk-approval-dialog";
import { ReviewPreview } from "@/features/review/review-preview";
import {
  countTodayApprovals, hasReviewAccess, listPendingReviewAbsences, listReportMetrics, listReportsByIds, listReviewPeople,
  listReviewQueue, listVisibleReports, type ReviewQueueItem,
} from "@/features/review/api";
import { filterVisibleReports, isOverdue, reviewAgeLabel } from "@/features/review/review-utils";
import { cn } from "@/lib/utils";
import { DeputyPanel, DeputyBanner } from "@/features/deputies/deputy-panel";
import { REVIEWER_ROLES } from "@/features/app/session";

const TITLE = "Ausbilderportal – Azuvera";
type PortalTab = "pruefen" | "abwesenheiten" | "alle" | "vertretung";

export const Route = createFileRoute("/_authenticated/ausbilder")({
  validateSearch: (search: Record<string, unknown>): { tab?: PortalTab | undefined } => ({
    tab: search["tab"] === "vertretung" || search["tab"] === "abwesenheiten" || search["tab"] === "alle" ? search["tab"] : "pruefen",
  }),
  head: () => ({ meta: [
    { title: TITLE },
    { name: "description", content: "Berichte deiner Auszubildenden einsehen, freigeben oder zurückweisen." },
    { property: "og:title", content: TITLE },
    { property: "og:type", content: "website" },
    { property: "og:description", content: "Der Prüfbereich für Ausbilder:innen in Azuvera." },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: TrainerPortalPage,
});

function nameInitials(name: string): string {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?";
}

function TrainerPortalPage() {
  const { tab = "pruefen" } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useMyProfile();
  const { data: professions } = useProfessions();
  const [search, setSearch] = useState("");
  const [azubi, setAzubi] = useState("");
  const [type, setType] = useState<ReportType | "all">("all");
  const [status, setStatus] = useState<ReportStatus | "all">("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [todayApprovedOnly, setTodayApprovedOnly] = useState(false);
  const [limit, setLimit] = useState(50);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [approveTarget, setApproveTarget] = useState<Report | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Report | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [absenceReview, setAbsenceReview] = useState<{ absence: Absence; decision: AbsenceStatus; name: string } | null>(null);
  const viewerRole = profile?.role === "ausbildungsberater" || profile?.role === "lehrer";
  const { data: reviewAccess } = useQuery({ queryKey: ["review", "has-access"], queryFn: hasReviewAccess, enabled: profile?.role === "betriebsleiter" });
  const readOnly = viewerRole || (profile?.role === "betriebsleiter" && reviewAccess !== true);
  const activeTab: PortalTab = readOnly && tab !== "vertretung" ? "alle" : tab;

  const queueQuery = useQuery({ queryKey: ["review", "queue", "submitted"], queryFn: () => listReviewQueue(["submitted"]), enabled: !!profile && profile.role !== "azubi" && !readOnly, refetchInterval: 60_000 });
  const rejectedQuery = useQuery({ queryKey: ["review", "queue", "rejected"], queryFn: () => listReviewQueue(["rejected"]), enabled: !!profile && profile.role !== "azubi" && !readOnly, refetchInterval: 60_000 });
  const todayQuery = useQuery({ queryKey: ["review", "today-approvals"], queryFn: countTodayApprovals, enabled: !!profile && profile.role !== "azubi" && !readOnly, refetchInterval: 60_000 });
  const queue = useMemo(() => queueQuery.data ?? [], [queueQuery.data]);
  const queueIds = useMemo(() => queue.map((item) => item.report_id), [queue]);
  const reportsQuery = useQuery({ queryKey: ["review", "queue-reports", queueIds.join(",")], queryFn: () => listReportsByIds(queueIds), enabled: queueIds.length > 0 });
  const peopleQuery = useQuery({ queryKey: ["review", "people"], queryFn: listReviewPeople, enabled: !!profile && profile.role !== "azubi" });
  const metricsQuery = useQuery({ queryKey: ["review", "metrics", queueIds.join(",")], queryFn: () => listReportMetrics(queueIds), enabled: queueIds.length > 0 });
  const allQuery = useQuery({ queryKey: ["review", "all", status, type, azubi, limit], queryFn: () => listVisibleReports({ status, type, azubiId: azubi || undefined, limit }), enabled: activeTab === "alle" && !!profile, refetchInterval: 60_000 });
  const absencesQuery = useQuery({ queryKey: ["review", "pending-absences"], queryFn: listPendingReviewAbsences, enabled: !!profile && profile.role !== "azubi" && !readOnly, refetchInterval: 60_000 });

  const people = useMemo(() => peopleQuery.data ?? [], [peopleQuery.data]);
  const deputyIds = useMemo(() => [...new Set(queue.map((item) => item.deputy_for).filter((id): id is string => !!id))], [queue]);
  const { data: deputyNames } = useQuery({ queryKey: ["review", "deputy-names", deputyIds.join(",")], queryFn: () => displayNames(deputyIds), enabled: deputyIds.length > 0 });
  const nameFor = (id: string) => people.find((person) => person.id === id)?.full_name ?? deputyNames?.get(id) ?? "Unbekannt";
  const professionFor = (id: string) => {
    const professionId = people.find((person) => person.id === id)?.profession_id;
    return professions?.find((profession) => profession.id === professionId)?.name ?? "";
  };
  const reportMap = useMemo(() => new Map((reportsQuery.data ?? []).map((report) => [report.id, report])), [reportsQuery.data]);
  const queueReports = useMemo(() => queue.map((item) => reportMap.get(item.report_id)).filter((report): report is Report => !!report), [queue, reportMap]);
  const filteredQueue = useMemo(() => filterVisibleReports(queueReports, { search, azubiId: azubi, type }, nameFor).filter((report) => !overdueOnly || isOverdue(report.submitted_at)), [queueReports, search, azubi, type, overdueOnly, people]);
  const filteredAll = useMemo(() => filterVisibleReports(allQuery.data ?? [], { search, azubiId: "", type: "all", todayApprovedBy: todayApprovedOnly ? profile?.id : undefined }, nameFor), [allQuery.data, search, todayApprovedOnly, profile?.id, people]);
  const selectedReport = filteredQueue.find((report) => report.id === selectedId) ?? filteredQueue[0] ?? null;
  const selectedQueueItem = queue.find((item) => item.report_id === selectedReport?.id);
  const checkedReports = filteredQueue.filter((report) => checked.has(report.id));

  useEffect(() => {
    if (selectedReport && selectedId !== selectedReport.id) setSelectedId(selectedReport.id);
  }, [selectedReport, selectedId]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["review"] }),
      queryClient.invalidateQueries({ queryKey: ["reports"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      queryClient.invalidateQueries({ queryKey: ["absences"] }),
    ]);
  };
  const setTab = (value: PortalTab) => {
    setOverdueOnly(false); setTodayApprovedOnly(false); setStatus("all"); setChecked(new Set());
    void navigate({ to: "/ausbilder", search: { tab: value } });
  };
  const nextAfter = (id: string) => {
    const index = filteredQueue.findIndex((report) => report.id === id);
    setSelectedId(filteredQueue[index + 1]?.id ?? filteredQueue[index - 1]?.id ?? null);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (activeTab !== "pruefen" || !selectedReport || approveTarget || rejectTarget || bulkOpen) return;
      const target = event.target as HTMLElement | null;
      if (target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)) return;
      const index = filteredQueue.findIndex((report) => report.id === selectedReport.id);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const next = event.key === "ArrowDown" ? filteredQueue[index + 1] : filteredQueue[index - 1];
        if (next) setSelectedId(next.id);
      } else if (event.key === "Enter") {
        event.preventDefault(); void navigate({ to: "/reports/$id", params: { id: selectedReport.id } });
      } else if (event.key.toLowerCase() === "a") { event.preventDefault(); setApproveTarget(selectedReport); }
      else if (event.key.toLowerCase() === "r") { event.preventDefault(); setRejectTarget(selectedReport); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTab, selectedReport, filteredQueue, approveTarget, rejectTarget, bulkOpen, navigate]);

  useEffect(() => {
    if (readOnly && tab !== "alle" && tab !== "vertretung") void navigate({ to: "/ausbilder", search: { tab: "alle" }, replace: true });
  }, [readOnly, tab, navigate]);

  if (profile?.role === "azubi") return <EmptyState title="Dazu fehlt dir die Berechtigung." />;
  const queueItemFor = (id: string): ReviewQueueItem | undefined => queue.find((item) => item.report_id === id);

  return <div className="space-y-5">
    <DeputyBanner />
    <PageHeader title="Ausbilderportal" subtitle="Berichte deiner Auszubildenden einsehen, freigeben oder zurückweisen." />
    {!readOnly && <><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricButton label="Zu prüfen" value={queue.length} onClick={() => setTab("pruefen")} />
      <MetricButton label="Wartet seit 7+ Tagen" value={queue.filter((item) => isOverdue(item.submitted_at)).length} warning onClick={() => { setTab("pruefen"); setOverdueOnly(true); }} />
      <MetricButton label="Heute freigegeben" value={todayQuery.data ?? 0} onClick={() => { setTab("alle"); setStatus("approved"); setTodayApprovedOnly(true); }} />
      <MetricButton label="Zurückgewiesen (offen)" value={rejectedQuery.data?.length ?? 0} onClick={() => { setTab("alle"); setStatus("rejected"); }} />
    </section>
    <div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
      <button className={cn("min-h-10 rounded-lg px-4 text-sm font-medium", tab === "pruefen" ? "bg-background shadow-sm" : "text-muted-foreground")} onClick={() => setTab("pruefen")}>Zu prüfen <Badge variant="secondary">{queue.length}</Badge></button>
      <button className={cn("min-h-10 rounded-lg px-4 text-sm font-medium", tab === "abwesenheiten" ? "bg-background shadow-sm" : "text-muted-foreground")} onClick={() => setTab("abwesenheiten")}>Abwesenheiten <Badge variant="secondary">{absencesQuery.data?.length ?? 0}</Badge></button>
      <button className={cn("min-h-10 rounded-lg px-4 text-sm font-medium", tab === "alle" ? "bg-background shadow-sm" : "text-muted-foreground")} onClick={() => setTab("alle")}>Alle Berichte</button>
    </div></>}

    {profile && REVIEWER_ROLES.includes(profile.role) && <Button variant={tab === "vertretung" ? "secondary" : "outline"} onClick={() => setTab("vertretung")}>Vertretung</Button>}
    {activeTab === "vertretung" && profile && REVIEWER_ROLES.includes(profile.role) && <DeputyPanel />}
    {activeTab !== "abwesenheiten" && activeTab !== "vertretung" && <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Suche nach Name, KW oder Datum" className="sm:w-64" />
      <Select value={azubi || "all"} onValueChange={(value) => setAzubi(value === "all" ? "" : value)}><SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Alle Azubis</SelectItem>{people.map((person) => <SelectItem key={person.id} value={person.id}>{person.full_name}</SelectItem>)}</SelectContent></Select>
      <Select value={type} onValueChange={(value) => setType(value as ReportType | "all")}><SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Alle Typen</SelectItem><SelectItem value="daily">Tagesbericht</SelectItem><SelectItem value="weekly">Wochenbericht</SelectItem></SelectContent></Select>
      {activeTab === "alle" && <Select value={status} onValueChange={(value) => setStatus(value as ReportStatus | "all")}><SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Alle Status</SelectItem><SelectItem value="submitted">Eingereicht</SelectItem><SelectItem value="approved">Freigegeben</SelectItem><SelectItem value="rejected">Zurückgewiesen</SelectItem></SelectContent></Select>}
    </div>}

    {activeTab === "pruefen" && <div className="grid gap-4 md:grid-cols-2">
      <div className="min-w-0 space-y-3">
        {checkedReports.length > 0 && <div className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3"><span className="text-sm font-medium">{checkedReports.length} ausgewählt</span><Button size="sm" onClick={() => setBulkOpen(true)}><CheckCheck className="size-4" />Alle freigeben</Button></div>}
        {queueQuery.isLoading || (queueIds.length > 0 && reportsQuery.isLoading) ? <ListSkeleton /> : filteredQueue.length === 0 ? <EmptyState icon={Check} title={queue.length === 0 ? "Alles geprüft – nichts offen." : "Keine Berichte für diese Auswahl."} /> : <ul className="space-y-2">{filteredQueue.map((report) => {
          const queueItem = queueItemFor(report.id)!;
          const overdue = isOverdue(report.submitted_at);
          const metrics = metricsQuery.data?.get(report.id);
          return <li key={report.id} className={cn("rounded-2xl border bg-card p-3", selectedReport?.id === report.id && "border-primary ring-1 ring-primary")} onClick={() => setSelectedId(report.id)}>
            <div className="flex items-start gap-2">
              <Checkbox aria-label={`${reportTitle(report)} auswählen`} checked={checked.has(report.id)} onCheckedChange={(value) => setChecked((current) => { const next = new Set(current); if (value === true) next.add(report.id); else next.delete(report.id); return next; })} onClick={(event) => event.stopPropagation()} className="mt-1" />
              <Avatar className="size-9 shrink-0"><AvatarFallback className="text-xs">{nameInitials(nameFor(report.azubi_id))}</AvatarFallback></Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{nameFor(report.azubi_id)}</p><p className="truncate text-xs text-muted-foreground">{professionFor(report.azubi_id)}</p>
                <p className="mt-2 text-sm font-medium">{reportTitle(report)}</p>
                <p className="text-xs text-muted-foreground">{format(new Date(report.report_date + "T00:00:00"), "dd.MM.yyyy")}{report.report_type === "weekly" ? ` – ${format(addDays(new Date(report.report_date + "T00:00:00"), 6), "dd.MM.yyyy")}` : ""}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5"><Badge variant="outline"><Paperclip className="size-3" />{metrics?.attachments ?? 0} Anhänge</Badge><Badge variant="outline"><MessageSquare className="size-3" />{metrics?.comments ?? 0}</Badge>{queueItem.deputy_for && <Badge variant="secondary">Vertretung für {nameFor(queueItem.deputy_for)}</Badge>}</div>
                <p className={cn("mt-2 flex items-center gap-1 text-xs", overdue ? "font-medium text-warning" : "text-muted-foreground")}><Clock3 className="size-3" />{reviewAgeLabel(report.submitted_at)}{overdue && <span className="ml-1">Überfällig</span>}</p>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-1 border-t pt-2">
              <Button asChild size="sm" variant="ghost" aria-label={`${reportTitle(report)} prüfen`}><Link to="/reports/$id" params={{ id: report.id }}><Eye className="size-4" /><span className="md:hidden">Prüfen</span></Link></Button>
              <Button size="sm" variant="outline" aria-label={`${reportTitle(report)} freigeben`} onClick={(event) => { event.stopPropagation(); setApproveTarget(report); }}><Check className="size-4" /><span className="hidden lg:inline">Freigeben</span></Button>
              <Button size="sm" variant="outline" className="text-destructive" aria-label={`${reportTitle(report)} zurückweisen`} onClick={(event) => { event.stopPropagation(); setRejectTarget(report); }}><X className="size-4" /><span className="hidden lg:inline">Zurückweisen</span></Button>
            </div>
          </li>;
        })}</ul>}
      </div>
      {selectedReport && <ReviewPreview report={selectedReport} azubiName={nameFor(selectedReport.azubi_id)} onApprove={() => setApproveTarget(selectedReport)} onReject={() => setRejectTarget(selectedReport)} />}
    </div>}

    {activeTab === "alle" && (allQuery.isLoading ? <ListSkeleton /> : filteredAll.length === 0 ? <EmptyState title="Keine Berichte für diese Auswahl." /> : <><ul className="space-y-2">{filteredAll.map((report) => <li key={report.id}><Link to="/reports/$id" params={{ id: report.id }} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 hover:bg-accent"><div className="min-w-0"><p className="truncate font-medium">{reportTitle(report)}</p><p className="text-sm text-muted-foreground">{nameFor(report.azubi_id)} · {format(new Date(report.report_date + "T00:00:00"), "dd.MM.yyyy")}</p></div><StatusBadge status={report.status} /></Link></li>)}</ul>{(allQuery.data?.length ?? 0) >= limit && <div className="text-center"><Button variant="outline" onClick={() => setLimit((value) => value + 50)}>Mehr laden</Button></div>}</>)}

    {activeTab === "abwesenheiten" && (absencesQuery.isLoading ? <ListSkeleton /> : (absencesQuery.data?.length ?? 0) === 0 ? <EmptyState title="Keine offenen Abwesenheitsanträge." /> : <ul className="grid gap-3 lg:grid-cols-2">{absencesQuery.data?.map(({ absence, name }) => <li key={absence.id} className="rounded-2xl border bg-card p-4"><p className="font-semibold">{name}</p><p className="mt-1 text-sm">{ABSENCE_TYPE_LABELS[absence.type]} · {format(new Date(absence.date_from + "T00:00:00"), "dd.MM.yyyy")} – {format(new Date(absence.date_to + "T00:00:00"), "dd.MM.yyyy")}</p><Badge variant="secondary" className="mt-2">{ABSENCE_STATUS_LABELS[absence.status]}</Badge>{absence.note && <p className="mt-2 text-sm text-muted-foreground">{absence.note}</p>}<div className="mt-4 flex gap-2"><Button size="sm" onClick={() => setAbsenceReview({ absence, decision: "approved", name })}><Check className="size-4" />Genehmigen</Button><Button size="sm" variant="outline" onClick={() => setAbsenceReview({ absence, decision: "rejected", name })}><X className="size-4" />Ablehnen</Button></div></li>)}</ul>)}

    {approveTarget && profile && <ApprovalSheet key={approveTarget.id} report={approveTarget} reviewerId={profile.id} azubiName={nameFor(approveTarget.azubi_id)} deputyName={queueItemFor(approveTarget.id)?.deputy_for ? nameFor(queueItemFor(approveTarget.id)!.deputy_for!) : undefined} open onOpenChange={(open) => !open && setApproveTarget(null)} onApproved={async () => { nextAfter(approveTarget.id); await refresh(); }} onConflict={() => void queryClient.invalidateQueries({ queryKey: ["reports", approveTarget.id] })} />}
    {rejectTarget && <RejectionSheet key={rejectTarget.id} report={rejectTarget} open onOpenChange={(open) => !open && setRejectTarget(null)} onRejected={async () => { nextAfter(rejectTarget.id); await refresh(); }} onConflict={() => void queryClient.invalidateQueries({ queryKey: ["reports", rejectTarget.id] })} />}
    <BulkApprovalDialog reports={checkedReports} open={bulkOpen} onOpenChange={setBulkOpen} onDone={async () => { setChecked(new Set()); await refresh(); }} />
    {absenceReview && <AbsenceReviewDialog state={absenceReview} onOpenChange={(open) => !open && setAbsenceReview(null)} onSaved={refresh} />}
  </div>;
}

function MetricButton({ label, value, warning, onClick }: { label: string; value: number; warning?: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-2xl border bg-card p-5 text-left shadow-sm transition-colors hover:bg-accent"><span className="text-sm text-muted-foreground">{label}</span><span className={cn("mt-2 block text-3xl font-bold", warning && value > 0 && "text-warning")}>{value}</span></button>;
}

function AbsenceReviewDialog({ state, onOpenChange, onSaved }: { state: { absence: Absence; decision: AbsenceStatus; name: string }; onOpenChange: (open: boolean) => void; onSaved: () => Promise<void> }) {
  const [note, setNote] = useState("");
  const [interim, setInterim] = useState("");
  const [punctuation, setPunctuation] = useState(true);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setPunctuation(readPunctuationPreference()), []);
  const save = async () => {
    if (state.decision === "rejected" && note.trim().length < 3) { toast.error("Bitte gib eine Begründung mit mindestens 3 Zeichen ein."); return; }
    setBusy(true);
    try { await reviewAbsence(state.absence.id, state.decision, note.trim()); await onSaved(); toast.success(state.decision === "approved" ? "Genehmigt" : "Abgelehnt"); onOpenChange(false); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Speichern fehlgeschlagen."); }
    finally { setBusy(false); }
  };
  return <ResponsiveDialog open onOpenChange={onOpenChange} title={state.decision === "approved" ? "Abwesenheit genehmigen" : "Abwesenheit ablehnen"} description={state.name}><div className="space-y-4"><div className="space-y-1.5"><div className="flex items-center justify-between gap-2"><Label htmlFor="portal-absence-note">Begründung{state.decision === "rejected" ? " (erforderlich)" : " (optional)"}</Label><DictationButton textareaRef={ref} getValue={() => note} onValueChange={setNote} onInterim={setInterim} spokenPunctuation={punctuation} /></div><Textarea id="portal-absence-note" ref={ref} rows={4} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />{interim && <p className="text-sm italic text-muted-foreground">{interim}</p>}</div><Button className="w-full" variant={state.decision === "rejected" ? "destructive" : "default"} disabled={busy} onClick={() => void save()}><Undo2 className="size-4" />Speichern</Button></div></ResponsiveDialog>;
}

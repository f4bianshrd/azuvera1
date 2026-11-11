import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { ArrowLeft, MessageSquarePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/dialogs";
import { ListSkeleton, StatusBadge } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { deleteReport, displayNames, getReport, reportTitle, STATUS_LABELS } from "@/features/reports/api";
import { AttachmentSection } from "@/features/reports/attachment-section";
import { ReportEditor, stateFromReport } from "@/features/reports/report-editor";
import { SubmitSheet } from "@/features/reports/submit-sheet";
import { ApprovalSheet } from "@/features/review/approval-sheet";
import { RejectionSheet } from "@/features/review/rejection-sheet";
import { ReopenSheet } from "@/features/review/reopen-sheet";
import { CommentsCard, COMMENT_SECTIONS } from "@/features/review/comments-card";
import { SignaturesCard } from "@/features/review/signatures-card";
import { actingPrincipal, canReviewReport, listComments, type CommentSection } from "@/features/review/api";

export const Route = createFileRoute("/_authenticated/reports/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Bericht ${params.id.slice(0, 8)} – Azuvera` },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportDetailPage,
});

function ReportDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useMyProfile();
  const { data, isLoading } = useQuery({ queryKey: ["reports", id], queryFn: () => getReport(id) });
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [sectionRequest, setSectionRequest] = useState<{ section: CommentSection; nonce: number } | undefined>();

  const report = data?.report;
  const isOwner = profile?.id === report?.azubi_id;
  const editable = isOwner && (report?.status === "draft" || report?.status === "rejected");
  const { data: canReview } = useQuery({ queryKey: ["review", "can-review", report?.azubi_id], queryFn: () => canReviewReport(report!.azubi_id), enabled: !!report && !isOwner });
  const { data: principalId } = useQuery({ queryKey: ["review", "acting-principal", report?.azubi_id], queryFn: () => actingPrincipal(report!.azubi_id), enabled: !!report && !!canReview });
  const { data: comments } = useQuery({ queryKey: ["review", "comments", id], queryFn: () => listComments(id), enabled: !!report && report.status !== "draft" });
  const { data: names } = useQuery({
    queryKey: ["display-names", report?.azubi_id, report?.reviewer_id, principalId],
    enabled: !!report,
    queryFn: () => displayNames([report!.azubi_id, report!.reviewer_id ?? "", principalId ?? ""].filter(Boolean)),
  });

  useEffect(() => {
    if (!report || window.location.hash !== "#kommentare") return;
    window.setTimeout(() => document.getElementById("kommentare")?.scrollIntoView(), 100);
  }, [report]);

  if (isLoading) return <ListSkeleton />;
  if (!report || !data) {
    return <div className="py-10 text-center"><p className="text-muted-foreground">Dieser Bericht ist nicht verfügbar.</p><Button variant="link" asChild><Link to="/reports">Zur Übersicht</Link></Button></div>;
  }

  const title = reportTitle(report);
  const dateLabel = format(new Date(report.report_date + "T00:00:00"), "d. MMMM yyyy", { locale: de });
  const refresh = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["reports", id] }),
      queryClient.invalidateQueries({ queryKey: ["review"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  };
  const doDelete = async () => {
    try {
      await deleteReport(report.id);
      toast.success("Entwurf gelöscht");
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
      void navigate({ to: "/reports" });
    } catch { toast.error("Löschen fehlgeschlagen."); }
  };
  const requestComment = (section: CommentSection) => setSectionRequest({ section, nonce: Date.now() });
  const commentCount = (section: CommentSection) => (comments ?? []).filter((comment) => comment.section === section).length;

  return <div className="space-y-5 pb-28">
    <div className="flex flex-col gap-3">
      {profile?.role === "azubi" ? <Link to="/reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> Zurück</Link> : <Link to="/ausbilder" search={{ tab: "pruefen" }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> Zurück</Link>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">{title}</h1><p className="mt-1 text-muted-foreground">{dateLabel}{!isOwner && names?.get(report.azubi_id) ? ` • ${names.get(report.azubi_id)}` : ""}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={report.status} />
          {editable && !editing && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Bearbeiten</Button>}
          {editing && <Button variant="outline" size="sm" disabled={dirty} onClick={() => setEditing(false)}>Fertig</Button>}
          {isOwner && report.status === "draft" && <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="size-4" aria-hidden /> Löschen</Button>}
          {editable && <Button size="sm" onClick={() => setSubmitOpen(true)}>{report.status === "rejected" ? "Erneut einreichen" : "Einreichen"}</Button>}
        </div>
      </div>
    </div>

    {isOwner && report.status === "rejected" && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm font-medium">Dein Bericht wurde zurückgewiesen. Lies die Korrekturnotiz, überarbeite den Bericht und reiche ihn erneut ein.</div>}
    {report.review_note && !isOwner && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"><h2 className="text-sm font-semibold">Korrekturnotiz{names?.get(report.reviewer_id ?? "") ? ` von ${names.get(report.reviewer_id ?? "")}` : ""}</h2><p className="mt-1 text-sm whitespace-pre-wrap">{report.review_note}</p></div>}

    {editing && isOwner ? <ReportEditor azubiId={report.azubi_id} report={report} initial={stateFromReport(report)} lockTypeAndDate onCreated={() => undefined} onSaved={(saved) => queryClient.setQueryData(["reports", id], { ...data, report: saved })} onDirtyChange={setDirty} /> : <div className="space-y-4">
      {COMMENT_SECTIONS.map((section) => {
        const value = report[section.value];
        if (!value?.trim()) return null;
        const count = commentCount(section.value);
        return <section key={section.value} className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-muted-foreground">{section.value === "summary" ? "Zusammenfassung / Reflexion" : section.label}</h2>{canReview && <div className="flex items-center gap-1">{count > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1 text-xs text-primary-foreground">{count}</span>}<Button type="button" variant="ghost" size="icon" aria-label={`Zu ${section.label} kommentieren`} onClick={() => requestComment(section.value)}><MessageSquarePlus className="size-4" /></Button></div>}</div>
          <p className="mt-1 whitespace-pre-wrap">{value}</p>
        </section>;
      })}
    </div>}

    {canReview && report.status === "submitted" && <section className="hidden rounded-2xl border bg-card p-4 md:block"><h2 className="font-semibold">Prüfung</h2><p className="mt-1 text-sm text-muted-foreground">Prüfe Inhalt und Anhänge und dokumentiere deine Entscheidung.</p><div className="mt-3 flex gap-2"><Button onClick={() => setApproveOpen(true)}>Freigeben</Button><Button variant="destructive" onClick={() => setRejectOpen(true)}>Zurückweisen</Button></div></section>}
    {profile?.role === "ausbildungsleitung" && report.status === "approved" && <section className="rounded-2xl border bg-card p-4"><h2 className="font-semibold">Prüfung</h2><Button variant="outline" className="mt-3" onClick={() => setReopenOpen(true)}>Wieder öffnen</Button></section>}

    <AttachmentSection report={report} attachments={data.attachments} editable={!!editable && !editing} />
    <SignaturesCard signatures={data.signatures} currentVersion={report.version} />
    <CommentsCard report={report} canComment={!!isOwner || !!canReview} sectionRequest={sectionRequest} />

    <section className="rounded-2xl border bg-card p-4 text-sm"><h2 className="font-semibold">Zeitleiste</h2><ul className="mt-2 space-y-1 text-muted-foreground"><li>Erstellt: {format(new Date(report.created_at), "dd.MM.yyyy HH:mm", { locale: de })}</li>{report.submitted_at && <li>Eingereicht: {format(new Date(report.submitted_at), "dd.MM.yyyy HH:mm", { locale: de })}</li>}{report.reviewed_at && <li>Geprüft: {format(new Date(report.reviewed_at), "dd.MM.yyyy HH:mm", { locale: de })} • {STATUS_LABELS[report.status]}</li>}</ul></section>

    {canReview && report.status === "submitted" && <div className="fixed inset-x-0 bottom-16 z-20 flex gap-2 border-t bg-background/95 p-3 backdrop-blur md:hidden"><Button className="flex-1" onClick={() => setApproveOpen(true)}>Freigeben</Button><Button className="flex-1" variant="destructive" onClick={() => setRejectOpen(true)}>Zurückweisen</Button></div>}

    <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Diesen Entwurf wirklich löschen?" description="Der Entwurf und seine Anhänge werden entfernt. Das kann nicht rückgängig gemacht werden." confirmLabel="Löschen" destructive onConfirm={() => void doDelete()} />
    <SubmitSheet report={report} attachmentCount={data.attachments.length} open={submitOpen} onOpenChange={setSubmitOpen} onSubmitted={() => { setSubmitOpen(false); void refresh(); }} />
    {profile && <ApprovalSheet report={report} reviewerId={profile.id} azubiName={names?.get(report.azubi_id) ?? ""} deputyName={names?.get(principalId ?? "")} open={approveOpen} onOpenChange={setApproveOpen} onApproved={refresh} onConflict={() => void queryClient.invalidateQueries({ queryKey: ["reports", id] })} />}
    <RejectionSheet report={report} open={rejectOpen} onOpenChange={setRejectOpen} onRejected={refresh} onConflict={() => void queryClient.invalidateQueries({ queryKey: ["reports", id] })} />
    <ReopenSheet reportId={report.id} open={reopenOpen} onOpenChange={setReopenOpen} onReopened={refresh} />
  </div>;
}

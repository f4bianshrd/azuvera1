import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/dialogs";
import { ListSkeleton, StatusBadge } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { SyncBadge } from "@/features/sync/sync-badge";
import { HistoryCard } from "@/features/audit/history-card";
import { SignaturesCard } from "@/features/review/signatures-card";
import type { ReportSignature } from "@/features/reports/api";
import {
  canCommentExperience, canReviewExperience, deleteExperienceDraft, experienceActingPrincipal, experienceLocalCopy, experienceNames,
  getExperience, keepMyExperience, takeServerExperience, type Experience,
} from "@/features/experience/api";
import { dateDe, kindLabel } from "@/features/experience/model";
import { ExperienceEditor, type EditorHandle } from "@/features/experience/components/experience-editor";
import { ExperienceAttachments } from "@/features/experience/components/attachments";
import { ExperienceCommentsCard } from "@/features/experience/components/comments";
import { ApproveExperienceSheet, RejectExperienceSheet, ReopenExperienceSheet, SubmitExperienceSheet } from "@/features/experience/components/experience-dialogs";
import { ExperiencePdfMenu } from "@/features/experience/components/export-button";
import { useExperienceProgress } from "@/features/experience/components/progress-card";

export const Route = createFileRoute("/_authenticated/erfahrungsberichte/$id")({
  head: () => ({
    meta: [
      { title: "Erfahrungsbericht – Azuvera" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Erfahrungsbericht mit Anhängen, Kommentaren, Unterschriften und Verlauf." },
      { property: "og:title", content: "Erfahrungsbericht – Azuvera" },
      { property: "og:description", content: "Erfahrungsbericht mit Anhängen, Kommentaren, Unterschriften und Verlauf." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExperienceDetailPage,
});

function ExperienceDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useMyProfile();
  const { data, isLoading } = useQuery({ queryKey: ["experience", "detail", id], queryFn: () => getExperience(id) });
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const handle = useRef<EditorHandle | null>(null);

  const report = data?.report;
  const isOwner = !!report && profile?.id === report.azubi_id;
  const editable = isOwner && (report.status === "draft" || report.status === "rejected") && !report._submit_pending && report._sync !== "conflict";
  const { data: progress } = useExperienceProgress(report?.azubi_id);
  const { data: canReview } = useQuery({ queryKey: ["experience", "can-review", report?.azubi_id], queryFn: () => canReviewExperience(report!.azubi_id), enabled: !!report && !isOwner });
  const { data: canComment } = useQuery({ queryKey: ["experience", "can-comment", report?.azubi_id], queryFn: () => canCommentExperience(report!.azubi_id), enabled: !!report });
  const { data: principalId } = useQuery({ queryKey: ["experience", "principal", report?.azubi_id], queryFn: () => experienceActingPrincipal(report!.azubi_id), enabled: !!report && !!canReview });
  const { data: people } = useQuery({
    queryKey: ["experience", "names", report?.azubi_id, report?.reviewer_id, principalId],
    queryFn: () => experienceNames([report!.azubi_id, report!.reviewer_id ?? "", principalId ?? ""]),
    enabled: !!report,
  });

  useEffect(() => {
    document.title = report ? `${report.title || "Erfahrungsbericht"} – Azuvera` : "Erfahrungsbericht – Azuvera";
  }, [report]);
  useEffect(() => {
    if (!report || window.location.hash !== "#kommentare") return;
    window.setTimeout(() => document.getElementById("kommentare")?.scrollIntoView(), 100);
  }, [report]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (isLoading) return <ListSkeleton />;
  if (!report || !data) {
    return <div className="py-10 text-center"><h1 className="text-xl font-semibold">Seite nicht gefunden</h1><p className="mt-1 text-muted-foreground">Dieser Erfahrungsbericht ist nicht verfügbar.</p><Button variant="link" asChild><Link to="/erfahrungsberichte">Zur Übersicht</Link></Button></div>;
  }

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["experience"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      queryClient.invalidateQueries({ queryKey: ["audit"] }),
    ]);
  };
  const doDelete = async () => {
    try {
      await deleteExperienceDraft(report.id);
      toast.success("Entwurf gelöscht");
      await queryClient.invalidateQueries({ queryKey: ["experience"] });
      void navigate({ to: "/erfahrungsberichte" });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Löschen fehlgeschlagen."); }
  };
  const year = progress?.yearOf(report.written_on);
  const azubi = people?.get(report.azubi_id);
  const reviewerName = people?.get(report.reviewer_id ?? "")?.name;
  const signatures = data.signatures.map((s) => ({ ...s, report_id: s.experience_id, report_version: s.experience_version })) as unknown as ReportSignature[];
  const onServer = report._server !== null;

  return <div className="space-y-5 pb-28">
    <div className="flex flex-col gap-3">
      <Link to="/erfahrungsberichte" search={isOwner ? {} : { azubi: report.azubi_id }} className="inline-flex min-h-11 items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> Zurück</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight">{report.title || "Ohne Titel"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{kindLabel(report.kind)}</Badge>
            {report.area && <Badge variant="outline">{report.area}</Badge>}
            <Badge variant="outline">{dateDe(report.written_on)}</Badge>
            {year && <Badge variant="outline">{year}. Lehrjahr</Badge>}
            {!isOwner && azubi && <span className="text-sm text-muted-foreground">{azubi.name}{azubi.profession ? ` · ${azubi.profession}` : ""}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={report.status} />
          <SyncBadge state={report._sync} submitPending={report._submit_pending} />
          {onServer && <ExperiencePdfMenu id={report.id} azubiId={report.azubi_id} />}
          {editable && !editing && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Bearbeiten</Button>}
          {editing && <Button variant="outline" size="sm" onClick={() => void handle.current?.flush().then(() => setEditing(false))}>Fertig</Button>}
          {isOwner && report.status === "draft" && !report._submit_pending && <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="size-4" aria-hidden /> Löschen</Button>}
          {editable && <Button size="sm" onClick={() => { void (async () => { if (editing) await handle.current?.flush(); setSubmitOpen(true); })(); }}>{report.status === "rejected" ? "Erneut einreichen" : "Einreichen"}</Button>}
        </div>
      </div>
    </div>

    {isOwner && report._submit_pending && report._sync !== "conflict" && <div className="rounded-xl border bg-muted/40 p-4 text-sm">Wird eingereicht, sobald du online bist.</div>}
    {isOwner && report._sync === "failed" && report._error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{report._error}</div>}
    {isOwner && report._sync === "conflict" && <ConflictBox report={report} onDone={refresh} />}
    {report.status === "rejected" && report.review_note && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <h2 className="text-sm font-semibold">Korrekturnotiz{reviewerName ? ` von ${reviewerName}` : ""}</h2>
      <p className="mt-1 whitespace-pre-wrap text-sm">{report.review_note}</p>
    </div>}

    {editing && isOwner ? <ExperienceEditor azubiId={report.azubi_id} report={report} requirement={progress?.requirement ?? null} handleRef={handle}
      onSaved={(saved) => queryClient.setQueryData(["experience", "detail", id], { ...data, report: saved })} onDirtyChange={setDirty} />
      : <div className="space-y-4">
        {report.body.trim() && <section className="rounded-2xl border bg-card p-4"><h2 className="text-sm font-semibold text-muted-foreground">Bericht</h2><p className="mt-1 whitespace-pre-wrap break-words">{report.body}</p></section>}
        {report.reasoning.trim() && <section className="rounded-2xl border bg-card p-4"><h2 className="text-sm font-semibold text-muted-foreground">Begründung und Bewertung</h2><p className="mt-1 whitespace-pre-wrap break-words">{report.reasoning}</p></section>}
        {!report.body.trim() && !report.reasoning.trim() && <p className="text-sm text-muted-foreground">Noch kein Text.</p>}
      </div>}

    {canReview && report.status === "submitted" && <section className="hidden rounded-2xl border bg-card p-4 md:block"><h2 className="font-semibold">Prüfung</h2><p className="mt-1 text-sm text-muted-foreground">Prüfe Inhalt und Anhänge und dokumentiere deine Entscheidung.</p><div className="mt-3 flex gap-2"><Button onClick={() => setApproveOpen(true)}>Freigeben</Button><Button variant="destructive" onClick={() => setRejectOpen(true)}>Zurückweisen</Button></div></section>}
    {profile?.role === "ausbildungsleitung" && report.status === "approved" && <section className="rounded-2xl border bg-card p-4"><h2 className="font-semibold">Prüfung</h2><Button variant="outline" className="mt-3" onClick={() => setReopenOpen(true)}>Wieder öffnen</Button></section>}

    <ExperienceAttachments report={report} attachments={data.attachments} editable={!!editable} />
    <SignaturesCard signatures={signatures} currentVersion={report.version} note="Einfache elektronische Bestätigung. Zeitpunkt und Prüfsumme werden festgehalten." />
    <ExperienceCommentsCard report={report} canComment={!!canComment} />
    <HistoryCard entity="experience" reportId={report.id} isDraft={report.status === "draft"} onServer={onServer} />
    {(report.submitted_at || report.reviewed_at) && <p className="text-sm text-muted-foreground">
      {report.submitted_at && `Eingereicht: ${new Date(report.submitted_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })}`}
      {report.submitted_at && report.reviewed_at && " • "}
      {report.reviewed_at && `Geprüft: ${new Date(report.reviewed_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })}`}
    </p>}

    {canReview && report.status === "submitted" && <div className="fixed inset-x-0 bottom-16 z-20 flex gap-2 border-t bg-background/95 p-3 backdrop-blur md:hidden"><Button className="flex-1" onClick={() => setApproveOpen(true)}>Freigeben</Button><Button className="flex-1" variant="destructive" onClick={() => setRejectOpen(true)}>Zurückweisen</Button></div>}

    <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Diesen Entwurf wirklich löschen?" description="Der Entwurf und seine Anhänge werden entfernt. Das kann nicht rückgängig gemacht werden." confirmLabel="Löschen" destructive onConfirm={() => void doDelete()} />
    <SubmitExperienceSheet report={report} attachmentCount={data.attachments.length} requirement={progress?.requirement ?? null} open={submitOpen} onOpenChange={setSubmitOpen} onSubmitted={() => { setSubmitOpen(false); setEditing(false); void refresh(); }} />
    {profile && <ApproveExperienceSheet report={report} reviewerId={profile.id} azubiName={azubi?.name ?? ""} deputyName={principalId && principalId !== profile.id ? people?.get(principalId)?.name : undefined} open={approveOpen} onOpenChange={setApproveOpen} onDone={refresh} onConflict={() => void refresh()} />}
    <RejectExperienceSheet report={report} open={rejectOpen} onOpenChange={setRejectOpen} onDone={refresh} onConflict={() => void refresh()} />
    <ReopenExperienceSheet id={report.id} open={reopenOpen} onOpenChange={setReopenOpen} onDone={refresh} />
  </div>;
}

/** Konflikt: Der Erfahrungsbericht wurde auf einem anderen Gerät geändert. */
function ConflictBox({ report, onDone }: { report: Experience; onDone: () => Promise<void> }) {
  const [showCopy, setShowCopy] = useState(false);
  const { data: copy } = useQuery({ queryKey: ["experience", "local-copy", report.id], queryFn: () => experienceLocalCopy(report.id), enabled: showCopy });
  const server = report._server;
  const locked = !!server && (server.status === "submitted" || server.status === "approved");
  const rows: [string, string, string][] = [
    ["Thema", report.title, server?.title ?? ""], ["Bereich", report.area, server?.area ?? ""],
    ["Bericht", report.body, server?.body ?? ""], ["Begründung und Bewertung", report.reasoning, server?.reasoning ?? ""],
  ];
  return <section className="rounded-2xl border border-warning bg-warning/10 p-4">
    <h2 className="font-semibold">Der Erfahrungsbericht wurde auf einem anderen Gerät geändert.</h2>
    {locked && <p className="mt-1 text-sm">Der Erfahrungsbericht wurde inzwischen eingereicht und kann nicht mehr geändert werden.</p>}
    <div className="mt-3 space-y-2">{rows.filter(([, a, b]) => a !== b).map(([label, mine, theirs]) => <div key={label} className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-lg border bg-background p-2 text-sm"><p className="text-xs text-muted-foreground">{label} – deine Fassung</p><p className="whitespace-pre-wrap">{mine || "—"}</p></div>
      <div className="rounded-lg border bg-background p-2 text-sm"><p className="text-xs text-muted-foreground">{label} – Serverfassung</p><p className="whitespace-pre-wrap">{theirs || "—"}</p></div>
    </div>)}</div>
    <div className="mt-3 flex flex-wrap gap-2">
      {!locked && <Button size="sm" onClick={() => void keepMyExperience(report.id).then(onDone)}>Meine Fassung behalten</Button>}
      <Button size="sm" variant="outline" onClick={() => void takeServerExperience(report.id).then(onDone)}>Serverversion übernehmen</Button>
      <Button size="sm" variant="ghost" onClick={() => setShowCopy((v) => !v)}>Lokale Kopie anzeigen</Button>
    </div>
    {showCopy && <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border bg-background p-2 text-xs">{copy ? `${copy.title}\n\n${copy.body}\n\n${copy.reasoning}` : `${report.title}\n\n${report.body}\n\n${report.reasoning}`}</pre>}
  </section>;
}

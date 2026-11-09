import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/dialogs";
import { ListSkeleton, StatusBadge } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import {
  deleteReport,
  displayNames,
  getReport,
  reportTitle,
  STATUS_LABELS,
} from "@/features/reports/api";
import { AttachmentSection } from "@/features/reports/attachment-section";
import { ReportEditor, stateFromReport } from "@/features/reports/report-editor";
import { SubmitSheet } from "@/features/reports/submit-sheet";

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
  const { data, isLoading } = useQuery({
    queryKey: ["reports", id],
    queryFn: () => getReport(id),
  });
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);

  const report = data?.report;
  const isOwner = profile?.id === report?.azubi_id;
  const editable = isOwner && (report?.status === "draft" || report?.status === "rejected");

  const { data: names } = useQuery({
    queryKey: ["display-names", report?.azubi_id, report?.reviewer_id],
    enabled: !!report,
    queryFn: () => displayNames([report!.azubi_id, report!.reviewer_id ?? ""].filter(Boolean)),
  });

  if (isLoading) return <ListSkeleton />;
  if (!report || !data) {
    return (
      <div className="py-10 text-center">
        <p className="text-muted-foreground">Dieser Bericht ist nicht verfügbar.</p>
        <Button variant="link" asChild>
          <Link to="/reports">Zur Übersicht</Link>
        </Button>
      </div>
    );
  }

  const title = reportTitle(report);
  const dateLabel = format(new Date(report.report_date + "T00:00:00"), "d. MMMM yyyy", { locale: de });

  const doDelete = async () => {
    try {
      await deleteReport(report.id);
      toast.success("Entwurf gelöscht");
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
      void navigate({ to: "/reports" });
    } catch {
      toast.error("Löschen fehlgeschlagen.");
    }
  };

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-col gap-3">
        <Link to="/reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Zurück
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1 text-muted-foreground">
              {dateLabel}
              {!isOwner && names?.get(report.azubi_id) ? ` • ${names.get(report.azubi_id)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={report.status} />
            {editable && !editing && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Bearbeiten
              </Button>
            )}
            {editing && (
              <Button variant="outline" size="sm" disabled={dirty} onClick={() => setEditing(false)}>
                Fertig
              </Button>
            )}
            {isOwner && report.status === "draft" && (
              <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" aria-hidden /> Löschen
              </Button>
            )}
            {editable && (
              <Button size="sm" onClick={() => setSubmitOpen(true)}>
                {report.status === "rejected" ? "Erneut einreichen" : "Einreichen"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {report.review_note && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <h2 className="text-sm font-semibold">
            Korrekturnotiz{names?.get(report.reviewer_id ?? "") ? ` von ${names.get(report.reviewer_id ?? "")}` : ""}
          </h2>
          <p className="mt-1 text-sm whitespace-pre-wrap">{report.review_note}</p>
        </div>
      )}

      {editing && isOwner ? (
        <ReportEditor
          azubiId={report.azubi_id}
          report={report}
          initial={stateFromReport(report)}
          lockTypeAndDate
          onCreated={() => undefined}
          onSaved={(r) => queryClient.setQueryData(["reports", id], { ...data, report: r })}
          onDirtyChange={setDirty}
        />
      ) : (
        <div className="space-y-4">
          {(
            [
              ["Tätigkeiten", report.activities],
              ["Berufsschule", report.school_content],
              ["Unterweisungen", report.instructions],
              ["Zusammenfassung / Reflexion", report.summary],
            ] as const
          )
            .filter(([, v]) => (v ?? "").trim().length > 0)
            .map(([label, v]) => (
              <section key={label} className="rounded-2xl border bg-card p-4">
                <h2 className="text-sm font-semibold text-muted-foreground">{label}</h2>
                <p className="mt-1 whitespace-pre-wrap">{v}</p>
              </section>
            ))}
        </div>
      )}

      <AttachmentSection report={report} attachments={data.attachments} editable={!!editable && !editing} />

      <section className="rounded-2xl border bg-card p-4 text-sm">
        <h2 className="font-semibold">Zeitleiste</h2>
        <ul className="mt-2 space-y-1 text-muted-foreground">
          <li>Erstellt: {format(new Date(report.created_at), "dd.MM.yyyy HH:mm", { locale: de })}</li>
          {report.submitted_at && (
            <li>Eingereicht: {format(new Date(report.submitted_at), "dd.MM.yyyy HH:mm", { locale: de })}</li>
          )}
          {report.reviewed_at && (
            <li>
              Geprüft: {format(new Date(report.reviewed_at), "dd.MM.yyyy HH:mm", { locale: de })} •{" "}
              {STATUS_LABELS[report.status]}
            </li>
          )}
        </ul>
        {data.signatures.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Unterschrieben von {data.signatures.map((s) => s.signer_name).join(", ")} (Version{" "}
            {data.signatures.map((s) => s.report_version).join(", ")})
          </p>
        )}
      </section>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Diesen Entwurf wirklich löschen?"
        description="Der Entwurf und seine Anhänge werden entfernt. Das kann nicht rückgängig gemacht werden."
        confirmLabel="Löschen"
        destructive
        onConfirm={() => void doDelete()}
      />
      <SubmitSheet
        report={report}
        attachmentCount={data.attachments.length}
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        onSubmitted={() => {
          setSubmitOpen(false);
          void queryClient.invalidateQueries({ queryKey: ["reports", id] });
        }}
      />
    </div>
  );
}

import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { findExistingReport, getReport, type Report } from "@/features/reports/api";
import { AttachmentSection } from "@/features/reports/attachment-section";
import { ReportEditor, isoWeekOf, type EditorState } from "@/features/reports/report-editor";
import { SubmitSheet } from "@/features/reports/submit-sheet";

const TITLE = "Neuer Bericht – Azuvera";

export const Route = createFileRoute("/_authenticated/reports/new")({
  validateSearch: (search: Record<string, unknown>): { type?: "daily" | "weekly" | undefined; date?: string | undefined } => ({
    type: search.type === "daily" || search.type === "weekly" ? search.type : undefined,
    date: typeof search.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.date) ? search.date : undefined,
  }),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: TITLE },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewReportPage,
});

function NewReportPage() {
  const { type, date } = Route.useSearch();
  const navigate = useNavigate();
  const { data: profile } = useMyProfile();
  const today = format(new Date(), "yyyy-MM-dd");
  const initialDate = date && date <= today ? date : today;

  const [report, setReport] = useState<Report | null>(null);
  const [dirty, setDirty] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [initial] = useState<EditorState>(() => ({
    reportType: type ?? "weekly",
    weeklyMode: "activities",
    reportDate: type === "daily" ? initialDate : format(isoWeekOf(new Date()).monday, "yyyy-MM-dd"),
    activities: "",
    school_content: "",
    instructions: "",
    summary: "",
  }));
  const [checkDate, setCheckDate] = useState(initial.reportDate);
  const [checkType, setCheckType] = useState(initial.reportType);

  const { data: existing } = useQuery({
    queryKey: ["reports", "existing", profile?.id, checkType, checkDate],
    enabled: !!profile && !report,
    queryFn: () => {
      const w = isoWeekOf(new Date(checkDate + "T00:00:00"));
      return findExistingReport(profile!.id, checkType, checkDate, { year: w.year, weekNumber: w.weekNumber });
    },
  });

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  if (!profile) return null;

  return (
    <div className="pb-24">
      <PageHeader title="Neuer Bericht" subtitle="Tages- oder Wochenbericht erfassen – speichert automatisch." />

      {existing && !report && (
        <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
          Dafür gibt es schon einen Bericht.{" "}
          <Link to="/reports/$id" params={{ id: existing.id }} className="font-medium text-primary underline-offset-4 hover:underline">
            Öffnen?
          </Link>
        </div>
      )}

      <ReportEditor
        azubiId={profile.id}
        report={report}
        initial={initial}
        lockTypeAndDate={false}
        onCreated={setReport}
        onSaved={setReport}
        onDirtyChange={setDirty}
      />

      {report && <NewReportAttachments report={report} />}

      <div className="fixed inset-x-0 bottom-16 z-20 border-t bg-background/95 p-3 backdrop-blur sm:bottom-0">
        <div className="mx-auto flex max-w-3xl justify-between gap-2">
          <Button variant="ghost" onClick={() => void navigate({ to: "/reports" })}>
            Abbrechen
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!report}
              onClick={() => {
                if (report) void navigate({ to: "/reports/$id", params: { id: report.id } });
              }}
            >
              Als Entwurf speichern
            </Button>
            <Button disabled={!report} onClick={() => setSubmitOpen(true)}>
              Weiter zum Einreichen
            </Button>
          </div>
        </div>
      </div>

      {report && (
        <SubmitSheet
          report={report}
          attachmentCount={0}
          open={submitOpen}
          onOpenChange={setSubmitOpen}
          onSubmitted={() => void navigate({ to: "/reports/$id", params: { id: report.id } })}
        />
      )}
    </div>
  );
}

/** Anhänge, sobald der Entwurf per Autosave angelegt wurde. */
function NewReportAttachments({ report }: { report: Report }) {
  const { data } = useQuery({
    queryKey: ["reports", report.id],
    queryFn: () => getReport(report.id),
  });
  return (
    <div className="mt-6">
      <AttachmentSection
        report={report}
        attachments={data?.attachments ?? []}
        editable={report.status === "draft" || report.status === "rejected"}
      />
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { getExperience, type Experience } from "@/features/experience/api";
import { ExperienceEditor, type EditorHandle } from "@/features/experience/components/experience-editor";
import { ExperienceAttachments } from "@/features/experience/components/attachments";
import { SubmitExperienceSheet } from "@/features/experience/components/experience-dialogs";
import { useExperienceProgress } from "@/features/experience/components/progress-card";

const TITLE = "Neuer Erfahrungsbericht – Azuvera";
const DESCRIPTION = "Erfahrungsbericht, Projektbericht oder Leittext schreiben – auch per Diktat.";

export const Route = createFileRoute("/_authenticated/erfahrungsberichte/new")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "robots", content: "noindex" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewExperiencePage,
});

function NewExperiencePage() {
  const navigate = useNavigate();
  const { data: profile } = useMyProfile();
  const [report, setReport] = useState<Experience | null>(null);
  const [dirty, setDirty] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const handle = useRef<EditorHandle | null>(null);
  const { data: progress } = useExperienceProgress(profile?.id);
  const { data: detail } = useQuery({ queryKey: ["experience", "detail", report?.id], queryFn: () => getExperience(report!.id), enabled: !!report });

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  if (!profile) return null;
  const requirement = progress?.requirement ?? null;

  const saveDraft = async () => {
    const saved = await handle.current?.flush();
    if (!saved) { toast.error("Bitte zuerst etwas eintragen."); return; }
    toast.success("Erfahrungsbericht angelegt");
    void navigate({ to: "/erfahrungsberichte/$id", params: { id: saved.id } });
  };
  const toSubmit = async () => {
    const saved = await handle.current?.flush();
    if (!saved) { toast.error("Bitte zuerst etwas eintragen."); return; }
    setReport(saved);
    setSubmitOpen(true);
  };

  return <div className="pb-24">
    <PageHeader title="Neuer Erfahrungsbericht" subtitle="Speichert automatisch – du kannst auch diktieren." />
    <ExperienceEditor azubiId={profile.id} report={null} requirement={requirement} onSaved={setReport} onDirtyChange={setDirty} handleRef={handle} />
    {report && <div className="mt-6"><ExperienceAttachments report={report} attachments={detail?.attachments ?? []} editable /></div>}
    {!report && <p className="mt-6 text-sm text-muted-foreground">Anhänge kannst du hinzufügen, sobald der Entwurf gespeichert ist.</p>}

    <div className="fixed inset-x-0 bottom-16 z-20 border-t bg-background/95 p-3 backdrop-blur sm:bottom-0">
      <div className="mx-auto flex max-w-3xl flex-wrap justify-between gap-2">
        <Button variant="ghost" onClick={() => void navigate({ to: "/erfahrungsberichte" })}>Abbrechen</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void saveDraft()}>Als Entwurf speichern</Button>
          <Button onClick={() => void toSubmit()}>Weiter zum Einreichen</Button>
        </div>
      </div>
    </div>

    {report && <SubmitExperienceSheet report={detail?.report ?? report} attachmentCount={detail?.attachments.length ?? 0} requirement={requirement} open={submitOpen} onOpenChange={setSubmitOpen}
      onSubmitted={() => { setSubmitOpen(false); void navigate({ to: "/erfahrungsberichte/$id", params: { id: report.id } }); }} />}
  </div>;
}

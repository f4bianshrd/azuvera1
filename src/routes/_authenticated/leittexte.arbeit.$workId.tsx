import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileQuestion } from "lucide-react";
import { EmptyState, ListSkeleton } from "@/components/shared";
import { getWork } from "@/features/leittexte/api";
import { WorkView } from "@/features/leittexte/components/work-view";

const TITLE = "Leittext bearbeiten – Azuvera";
const DESCRIPTION = "Leittext Schritt für Schritt ausfüllen, ansehen, einreichen und als PDF speichern.";

export const Route = createFileRoute("/_authenticated/leittexte/arbeit/$workId")({
  head: () => ({
    meta: [
      { title: TITLE }, { name: "robots", content: "noindex" }, { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE }, { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkPage,
});

function WorkPage() {
  const { workId } = Route.useParams();
  const q = useQuery({ queryKey: ["leittexte", "work", workId], queryFn: () => getWork(workId) });
  if (q.isLoading) return <ListSkeleton rows={6} />;
  if (!q.data) return <EmptyState icon={FileQuestion} title="Leittext nicht gefunden" description="Er wurde gelöscht oder du hast keinen Zugriff." />;
  return <WorkView leittext={q.data.leittext} work={q.data.work} images={q.data.images} own={q.data.own} onChanged={() => void q.refetch()} />;
}

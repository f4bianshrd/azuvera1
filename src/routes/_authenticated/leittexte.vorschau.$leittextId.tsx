import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileQuestion } from "lucide-react";
import { EmptyState, ListSkeleton } from "@/components/shared";
import { listCatalog } from "@/features/leittexte/api";
import { WorkView } from "@/features/leittexte/components/work-view";

const TITLE = "Leittext ansehen – Azuvera";
const DESCRIPTION = "Aufgaben eines Leittextes ansehen, ohne ihn zu bearbeiten.";

export const Route = createFileRoute("/_authenticated/leittexte/vorschau/$leittextId")({
  head: () => ({
    meta: [
      { title: TITLE }, { name: "robots", content: "noindex" }, { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE }, { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PreviewPage,
});

function PreviewPage() {
  const { leittextId } = Route.useParams();
  const q = useQuery({ queryKey: ["leittexte", "catalog"], queryFn: listCatalog });
  if (q.isLoading) return <ListSkeleton rows={6} />;
  const lt = q.data?.find((l) => l.id === leittextId);
  if (!lt) return <EmptyState icon={FileQuestion} title="Leittext nicht gefunden" />;
  return <WorkView leittext={lt} work={null} images={[]} own={false} onChanged={() => {}} />;
}

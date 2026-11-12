import { createFileRoute } from "@tanstack/react-router";
import { PlansAdmin } from "@/features/plan/admin/plans-admin";

const TITLE = "Ausbildungspläne – Azuvera";

export const Route = createFileRoute("/_authenticated/stammdaten/ausbildungsplaene")({
  validateSearch: (search: Record<string, unknown>): { plan?: string | undefined } => ({ plan: typeof search["plan"] === "string" ? search["plan"] : undefined }),
  head: () => ({ meta: [
    { title: TITLE },
    { name: "description", content: "Ausbildungspläne je Beruf verwalten, importieren und veröffentlichen." },
    { property: "og:title", content: TITLE },
    { property: "og:description", content: "Ausbildungspläne verwalten." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PlansRoute,
});

function PlansRoute() {
  const { plan } = Route.useSearch();
  return <PlansAdmin planParam={plan} />;
}

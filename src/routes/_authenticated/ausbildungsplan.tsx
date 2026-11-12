import { createFileRoute } from "@tanstack/react-router";
import { PlanPage } from "@/features/plan/components/plan-page";

const TITLE = "Ausbildungsplan – Azuvera";

export const Route = createFileRoute("/_authenticated/ausbildungsplan")({
  validateSearch: (search: Record<string, unknown>): { azubi?: string | undefined } => ({ azubi: typeof search["azubi"] === "string" ? search["azubi"] : undefined }),
  head: () => ({ meta: [
    { title: TITLE },
    { name: "description", content: "Ausbildungsinhalte je Lehrjahr planen, abhaken und als PDF oder ODT exportieren." },
    { property: "og:title", content: TITLE },
    { property: "og:description", content: "Den Ausbildungsplan planen, Fortschritt verfolgen und exportieren." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PlanRoute,
});

function PlanRoute() {
  const { azubi } = Route.useSearch();
  return <PlanPage azubiParam={azubi} />;
}

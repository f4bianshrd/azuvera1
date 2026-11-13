import { createFileRoute } from "@tanstack/react-router";
import { CatalogsAdmin } from "@/features/instructions/admin/catalogs-admin";

const TITLE = "Unterweisungs-Kataloge – Azuvera";

export const Route = createFileRoute("/_authenticated/stammdaten/unterweisungen")({
  validateSearch: (search: Record<string, unknown>): { katalog?: string | undefined } => ({ katalog: typeof search["katalog"] === "string" ? search["katalog"] : undefined }),
  head: () => ({ meta: [
    { title: TITLE },
    { name: "description", content: "Unterweisungskataloge je Beruf verwalten, importieren und veröffentlichen." },
    { property: "og:title", content: TITLE },
    { property: "og:description", content: "Unterweisungskataloge verwalten." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: CatalogsRoute,
});

function CatalogsRoute() {
  const { katalog } = Route.useSearch();
  return <CatalogsAdmin catalogParam={katalog} />;
}

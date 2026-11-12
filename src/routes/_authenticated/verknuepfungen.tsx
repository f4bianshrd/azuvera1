import { createFileRoute } from "@tanstack/react-router";
import { LinksPage } from "@/features/links/components/links-page";

export const Route = createFileRoute("/_authenticated/verknuepfungen")({
  validateSearch: (s: Record<string, unknown>): { code?: string } => (typeof s.code === "string" && s.code.length <= 20 ? { code: s.code } : {}),
  head: () => ({
    meta: [
      { title: "Verknüpfungen – Azuvera" },
      { name: "description", content: "Ausbilder:innen, Prüfer:innen und Ausbildungsberatung per QR-Code mit dem Berichtsheft verknüpfen." },
      { property: "og:title", content: "Verknüpfungen – Azuvera" },
      { property: "og:description", content: "Zugriff aufs Berichtsheft per QR-Code teilen und verwalten." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VerknuepfungenRoute,
});

function VerknuepfungenRoute() {
  const { code } = Route.useSearch();
  return <LinksPage code={code} />;
}

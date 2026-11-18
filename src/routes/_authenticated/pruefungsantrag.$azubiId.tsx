import { createFileRoute } from "@tanstack/react-router";
import { ApplicationReviewPage } from "@/features/certificates/components/application-pages";

const TITLE = "Prüfungsanträge prüfen – Azuvera";
const DESCRIPTION = "Anträge auf Zulassung zur Abschlussprüfung prüfen und bestätigen.";

export const Route = createFileRoute("/_authenticated/pruefungsantrag/$azubiId")({
  head: () => ({
    meta: [
      { title: TITLE }, { name: "robots", content: "noindex" }, { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE }, { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { azubiId } = Route.useParams();
  return <ApplicationReviewPage azubiId={azubiId} />;
}

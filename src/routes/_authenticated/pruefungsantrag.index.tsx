import { createFileRoute } from "@tanstack/react-router";
import { ApplicationHome } from "@/features/certificates/components/application-pages";

const TITLE = "Antrag auf Prüfungszulassung – Azuvera";
const DESCRIPTION = "Antrag auf Zulassung zur Abschlussprüfung vorbereiten und vom Betrieb bestätigen lassen.";

export const Route = createFileRoute("/_authenticated/pruefungsantrag/")({
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
  return <ApplicationHome />;
}

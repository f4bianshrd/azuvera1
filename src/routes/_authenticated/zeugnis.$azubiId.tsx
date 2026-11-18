import { createFileRoute } from "@tanstack/react-router";
import { CertificateEditorPage } from "@/features/certificates/components/certificate-pages";

const TITLE = "Ausbildungszeugnis bearbeiten – Azuvera";
const DESCRIPTION = "Ausbildungszeugnis einer Azubi-Person ausfüllen und ausstellen.";

export const Route = createFileRoute("/_authenticated/zeugnis/$azubiId")({
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
  return <CertificateEditorPage azubiId={azubiId} />;
}

import { createFileRoute } from "@tanstack/react-router";
import { CertificateHome } from "@/features/certificates/components/certificate-pages";

const TITLE = "Ausbildungszeugnis – Azuvera";
const DESCRIPTION = "Ausbildungszeugnis beantragen, ausfüllen und ausstellen.";

export const Route = createFileRoute("/_authenticated/zeugnis/")({
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
  return <CertificateHome />;
}

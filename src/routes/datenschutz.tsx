import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { InfoCard, LegalHeader, PublicLayout } from "@/features/public/public-layout";
import { privacySections } from "@/features/public/privacy-sections";
import { fetchPrivacyTexts } from "@/features/public/api";
import { PRIVACY_TEXT_DEFAULTS, PRIVACY_UPDATED_AT } from "@/lib/legal";

const TITLE = "Datenschutz – Azuvera";
const DESC = "Datenschutzerklärung nach DSGVO für Azuvera, das digitale Berichtsheft.";

export const Route = createFileRoute("/datenschutz")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "/datenschutz" }],
  }),
  component: Datenschutz,
});

function Datenschutz() {
  // Speicherort und Anbieter kommen aus den öffentlichen Einstellungen (auch ohne Anmeldung lesbar).
  const { data: texts } = useQuery({
    queryKey: ["app-settings", "privacy-texts"],
    queryFn: fetchPrivacyTexts,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const sections = privacySections(texts ?? PRIVACY_TEXT_DEFAULTS);
  return (
    <PublicLayout>
      <LegalHeader
        chip="DSGVO-konform"
        title="Datenschutzerklärung"
        subtitle="Informationen zur Verarbeitung personenbezogener Daten bei der Nutzung von Azuvera."
      />
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-12">
        {sections.map((s, i) => (
          <InfoCard key={s.id} title={`${i + 1}. ${s.title}`} icon={<s.icon className="size-5 text-primary" aria-hidden />}>
            {s.content}
          </InfoCard>
        ))}
        <p className="text-sm text-muted-foreground">Stand: {PRIVACY_UPDATED_AT}</p>
      </div>
    </PublicLayout>
  );
}

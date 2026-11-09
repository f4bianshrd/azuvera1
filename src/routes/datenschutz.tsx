import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { InfoCard, LegalHeader, PublicLayout } from "@/features/public/public-layout";
import { HOSTING_LOCATION_DEFAULT, privacySections } from "@/features/public/privacy-sections";

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
  // Speicherort kommt aus den Einstellungen (öffentlicher Schlüssel, auch ohne Anmeldung lesbar).
  const { data: hostingLocation } = useQuery({
    queryKey: ["app-settings", "hosting_location_text"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "hosting_location_text")
        .maybeSingle();
      return typeof data?.value === "string" ? data.value : HOSTING_LOCATION_DEFAULT;
    },
  });
  const sections = privacySections(hostingLocation ?? HOSTING_LOCATION_DEFAULT);
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
        <p className="text-sm text-muted-foreground">
          Stand: {format(new Date(), "d. MMMM yyyy", { locale: de })}
        </p>
      </div>
    </PublicLayout>
  );
}

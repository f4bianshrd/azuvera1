import { createFileRoute } from "@tanstack/react-router";
import { Building2, Mail, MapPin, Scale, UserCheck } from "lucide-react";
import { InfoCard, LegalHeader, PublicLayout, linkCls } from "@/features/public/public-layout";

const TITLE = "Impressum – Azuvera";
const DESC = "Impressum und Angaben nach § 5 DDG für Azuvera, das digitale Berichtsheft.";

export const Route = createFileRoute("/impressum")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "/impressum" }],
  }),
  component: Impressum,
});

const ic = "size-5 text-primary";

function Impressum() {
  return (
    <PublicLayout>
      <LegalHeader chip="Rechtliche Angaben" title="Impressum" subtitle="Angaben nach § 5 DDG und § 18 MStV." />
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-12">
        <div className="grid gap-5 md:grid-cols-2">
          <InfoCard title="Anbieter" icon={<Building2 className={ic} aria-hidden />}>
            <p className="font-semibold text-foreground">Azuvera – Eine Marke der Stage & Spotlight</p>
            <p>Inhaber: Fabian Schröder</p>
          </InfoCard>
          <InfoCard title="Anschrift" icon={<MapPin className={ic} aria-hidden />}>
            <p className="font-semibold text-foreground">Stage & Spotlight</p>
            <p>Inh. Fabian Schröder</p>
            <p>Hüdepohlweg 8</p>
            <p>49326 Melle</p>
            <p>Deutschland</p>
          </InfoCard>
          <InfoCard title="Kontakt" icon={<Mail className={ic} aria-hidden />}>
            <p>Telefon: <a className={linkCls} href="tel:+4915569490721">+49 155 69490721</a></p>
            <p>E-Mail: <a className={linkCls} href="mailto:info@azuvera.de">info@azuvera.de</a></p>
            <p>Web: <a className={linkCls} href="https://www.stage-spotlight.de" target="_blank" rel="noreferrer">www.stage-spotlight.de</a></p>
          </InfoCard>
          <InfoCard title="Haftung & Rechtliches" icon={<Scale className={ic} aria-hidden />}>
            <p>Trotz sorgfältiger inhaltlicher Kontrolle übernehmen wir keine Haftung für die Inhalte externer Links. Für den Inhalt der verlinkten Seiten sind ausschließlich deren Betreiber verantwortlich.</p>
            <p>Die Inhalte dieser Website dienen der Information über Azuvera und dem digitalen Berichtsheft.</p>
          </InfoCard>
        </div>
        <InfoCard title="Verantwortlich für den Inhalt nach § 18 MStV" icon={<UserCheck className={ic} aria-hidden />}>
          <p>Fabian Schröder, Hüdepohlweg 8, 49326 Melle.</p>
        </InfoCard>
      </div>
    </PublicLayout>
  );
}

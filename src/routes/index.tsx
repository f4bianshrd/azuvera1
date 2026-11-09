import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, FileSignature, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, PublicLayout } from "@/features/public/public-layout";

const TITLE = "Azuvera – Digitales Berichtsheft für die Ausbildung";
const DESC = "Azuvera: Tages- und Wochenberichte digital erfassen, einreichen und vom Ausbilder freigeben lassen.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: Home,
});

const features = [
  { icon: FileSignature, title: "Strukturierte Berichte", text: "Tages- und Wochenberichte mit allen wichtigen Feldern – Tätigkeiten, Berufsschule, Unterweisungen." },
  { icon: CheckCircle2, title: "Freigabe-Workflow", text: "Einreichen, prüfen, freigeben oder zurückweisen – mit klarem Status und Kommentaren." },
  { icon: Users, title: "Rollen für alle", text: "Azubis, Ausbilder und Ausbildungsleitung arbeiten in einem System zusammen." },
];

function Home() {
  return (
    <PublicLayout>
      <section className="relative overflow-hidden bg-gradient-subtle">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-gradient-primary opacity-20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 size-80 rounded-full bg-brand-teal opacity-20 blur-3xl" />
        <div className="relative mx-auto max-w-4xl px-4 py-16 text-center sm:py-24">
          <div className="flex flex-wrap justify-center gap-2">
            <Chip>Privat entwickelt auf Initiative der LWK Niedersachsen</Chip>
            <Chip>Für Azubis dauerhaft kostenlos</Chip>
          </div>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Azuvera – das digitale Berichtsheft für Ihre Ausbildung
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Tages- und Wochenberichte erfassen, beim Ausbilder einreichen, prüfungssicher archivieren – alles an
            einem Ort, jederzeit verfügbar.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 bg-gradient-primary px-8 shadow-elegant">
              <Link to="/auth" search={{ mode: "signup" }}>Kostenlos starten</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-8">
              <Link to="/auth" search={{}}>Anmelden</Link>
            </Button>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-5 px-4 py-16 md:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="inline-flex size-12 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-teal">
              <f.icon className="size-6" aria-hidden />
            </div>
            <h2 className="mt-4 text-lg font-semibold">{f.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
          </div>
        ))}
      </section>
    </PublicLayout>
  );
}

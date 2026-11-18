import { createFileRoute, Link } from "@tanstack/react-router";
import { BellRing, Camera, CheckCircle2, FileDown, FileSignature, Mic, PenLine, Users, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, PublicLayout } from "@/features/public/public-layout";
import { useSignedIn } from "@/features/auth/use-signed-in";

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
  { icon: Users, title: "Rollen für alle", text: "Azubis, Ausbilder:innen, Betriebe, Kammern und Prüfer:innen arbeiten in einem System zusammen." },
];

const overview = [
  { icon: Mic, title: "Diktieren statt tippen", text: "Berichte per Spracheingabe erfassen, sofern der Browser sie unterstützt." },
  { icon: Camera, title: "Fotos und Dateien", text: "Fotos, Skizzen und PDF-Dateien direkt an den Bericht anhängen." },
  { icon: WifiOff, title: "Auch offline arbeiten", text: "Berichte ohne Internet schreiben; sie werden gesendet, sobald wieder eine Verbindung besteht." },
  { icon: BellRing, title: "Erinnerungen", text: "Hinweise per Push oder E-Mail bei fehlenden Berichten und nahenden Fristen." },
  { icon: PenLine, title: "Digitale Freigabe", text: "Prüfen, kommentieren und per Unterschrift oder Klick freigeben oder mit Korrekturhinweis zurückweisen." },
  { icon: FileDown, title: "PDF für die Kammer", text: "Das ganze Berichtsheft als PDF mit Signaturprotokoll exportieren." },
];

function Home() {
  const signedIn = useSignedIn();
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
            {signedIn ? (
              <Button asChild size="lg" className="h-12 bg-gradient-primary px-8 shadow-elegant"><Link to="/dashboard">Weiter zur App</Link></Button>
            ) : <>
            <Button asChild size="lg" className="h-12 bg-gradient-primary px-8 shadow-elegant">
              <Link to="/auth" search={{ mode: "signup" }}>Kostenlos starten</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-8">
              <Link to="/auth" search={{}}>Anmelden</Link>
            </Button>
            </>}
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
      <section aria-labelledby="overview-title" className="border-t bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="overview-title" className="text-3xl font-bold tracking-tight">Funktionen im Überblick</h2>
            <p className="mt-3 text-muted-foreground">Alles, was Sie für ein vollständiges Berichtsheft brauchen – am Handy, Tablet und PC.</p>
          </div>
          <ul className="mt-10 flex flex-wrap justify-center gap-5">
            {overview.map((f) => (
              <li key={f.title} className="w-full rounded-2xl border bg-card p-6 shadow-sm sm:w-[calc((100%-1.25rem)/2)] lg:w-[calc((100%-2.5rem)/3)]">
                <div className="inline-flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <f.icon className="size-5" aria-hidden />
                </div>
                <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
              </li>
            ))}
          </ul>
          <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-muted-foreground">
            Hinweis: Die Freigabe ist eine einfache elektronische Bestätigung mit Zeitstempel und Prüfsumme, keine qualifizierte elektronische Signatur.
          </p>
        </div>
      </section>
    </PublicLayout>
  );
}

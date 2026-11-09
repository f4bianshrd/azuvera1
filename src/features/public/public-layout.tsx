import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared";
import { ThemeToggle } from "@/components/theme-toggle";

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-background">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
          <Link to="/" aria-label="Azuvera Startseite" className="rounded-md">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Button asChild variant="ghost" className="h-11">
              <Link to="/auth" search={{}}>Anmelden</Link>
            </Button>
            <Button asChild className="h-11">
              <Link to="/auth" search={{ mode: "signup" }}>Registrieren</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Azuvera.</span>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link to="/impressum" className="inline-flex min-h-11 items-center hover:text-foreground">
              Impressum
            </Link>
            <Link to="/datenschutz" className="inline-flex min-h-11 items-center hover:text-foreground">
              Datenschutz
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-brand-teal/50 bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
      {children}
    </span>
  );
}

export function LegalHeader({ chip, title, subtitle }: { chip: string; title: string; subtitle: string }) {
  return (
    <section className="bg-gradient-subtle border-b">
      <div className="mx-auto max-w-5xl px-4 py-12">
        <Chip>{chip}</Chip>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-muted-foreground">{subtitle}</p>
        <Link to="/" className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Zurück zur Startseite
        </Link>
      </div>
    </section>
  );
}

export function InfoCard({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-6 text-card-foreground shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {icon}
        {title}
      </h2>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

export const linkCls = "font-medium text-primary underline-offset-4 hover:underline";

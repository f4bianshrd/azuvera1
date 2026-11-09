import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isAfter } from "date-fns";
import { toast } from "sonner";
import { ArrowRight, CalendarDays, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/dialogs";
import { CardSkeleton, PageHeader, StatCard, StatusBadge } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { useProfessions } from "@/features/app/queries";
import { supabase } from "@/integrations/supabase/client";
import { listReports, listReportsInRange, reportTitle } from "@/features/reports/api";
import { computeCoverage } from "@/features/reports/coverage";
import { CoverageDonut } from "@/features/reports/coverage-donut";
import { isoWeekOf } from "@/features/reports/report-editor";
import { currentTrainingYear, defaultPeriodForYear, trainingYears } from "@/lib/training-year";

const TITLE = "Dashboard – Azuvera";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: "Dein Azuvera-Dashboard." },
      { property: "og:title", content: TITLE },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Hallo";
  return "Guten Abend";
}

const ONBOARDING_KEY = "azuvera-onboarding-done";

function Dashboard() {
  const { data: profile } = useMyProfile();
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const isAzubi = profile?.role === "azubi";

  const { data: reports, isLoading } = useQuery({
    queryKey: ["reports", "dashboard", profile?.id],
    enabled: !!profile && isAzubi,
    queryFn: () => listReports({ azubiId: profile!.id, limit: 200 }),
  });

  const coveragePeriod = useMemo(() => {
    if (!profile?.ausbildungsbeginn || !isAzubi) return null;
    const start = new Date(profile.ausbildungsbeginn + "T00:00:00");
    const end = profile.ausbildungsende ? new Date(profile.ausbildungsende + "T00:00:00") : undefined;
    const year = currentTrainingYear(start, end);
    const y = trainingYears(start, end).find((x) => x.year === year);
    if (!y) return null;
    const today = new Date();
    return { start: y.start, end: isAfter(y.end, today) ? today : y.end, year };
  }, [profile, isAzubi]);

  const { data: rangeReports } = useQuery({
    queryKey: ["reports", "range", profile?.id, coveragePeriod?.start.toISOString()],
    enabled: !!profile && !!coveragePeriod,
    queryFn: () =>
      listReportsInRange(profile!.id, format(coveragePeriod!.start, "yyyy-MM-dd"), format(coveragePeriod!.end, "yyyy-MM-dd")),
  });

  const coverage = useMemo(
    () => (rangeReports && coveragePeriod ? computeCoverage(rangeReports, coveragePeriod.start, coveragePeriod.end) : null),
    [rangeReports, coveragePeriod],
  );

  useEffect(() => {
    if (!profile || profile.role !== "azubi") return;
    let done = false;
    try {
      done = window.localStorage.getItem(ONBOARDING_KEY) === "1";
    } catch {
      /* Speicher nicht verfügbar */
    }
    if (!done && !profile.profession_id) setOnboardingOpen(true);
  }, [profile]);

  if (!isAzubi) {
    return (
      <PageHeader
        title={`${greeting()}${profile?.vorname ? `, ${profile.vorname}` : ""}`}
        subtitle="Die Prüfungs-Ansicht kommt mit Baustein 3."
      />
    );
  }

  const drafts = (reports ?? []).filter((r) => r.status === "draft");
  const rejected = (reports ?? []).filter((r) => r.status === "rejected");
  const submitted = (reports ?? []).filter((r) => r.status === "submitted");
  const approved = (reports ?? []).filter((r) => r.status === "approved");

  const thisWeek = isoWeekOf(new Date());
  const lastWeekMonday = new Date(thisWeek.monday.getTime() - 7 * 86400000);
  const lastWeek = isoWeekOf(lastWeekMonday);
  const hasThisWeek = (reports ?? []).some(
    (r) => r.report_type === "weekly" && r.year === thisWeek.year && r.week_number === thisWeek.weekNumber,
  );
  const hasLastWeek = (reports ?? []).some(
    (r) => r.report_type === "weekly" && r.year === lastWeek.year && r.week_number === lastWeek.weekNumber,
  );

  const tasks: { key: string; color: string; text: string; link?: { to: string; label: string } }[] = [];
  for (const r of rejected.slice(0, 3)) {
    tasks.push({
      key: `rej-${r.id}`,
      color: "border-destructive/40 bg-destructive/5",
      text: `Zurückgewiesen: ${reportTitle(r)}`,
      link: { to: `/reports/${r.id}`, label: "Ansehen" },
    });
  }
  if (!hasLastWeek) {
    tasks.push({
      key: "last-week",
      color: "border-amber-500/40 bg-amber-500/5",
      text: `Wochenbericht KW ${lastWeek.weekNumber}/${lastWeek.year} fehlt`,
      link: { to: `/reports/new?type=weekly&date=${format(lastWeekMonday, "yyyy-MM-dd")}`, label: "Jetzt anlegen" },
    });
  }
  for (const r of drafts.slice(0, 3)) {
    tasks.push({
      key: `draft-${r.id}`,
      color: "border-primary/40 bg-primary/5",
      text: `Entwurf: ${reportTitle(r)}`,
      link: { to: `/reports/${r.id}`, label: "Fortsetzen" },
    });
  }
  if (!hasThisWeek) {
    tasks.push({
      key: "this-week",
      color: "border-border bg-muted/40",
      text: `Wochenbericht KW ${thisWeek.weekNumber}/${thisWeek.year} noch nicht angelegt`,
      link: { to: "/reports/new", label: "Anlegen" },
    });
  }

  const recent = (reports ?? []).slice(0, 5);

  return (
    <div className="space-y-5">
      {/* Hero */}
      <section className="bg-gradient-primary rounded-2xl p-6 text-primary-foreground" style={{ boxShadow: "var(--shadow-elegant)" }}>
        <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-medium">Dashboard</span>
        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
          {greeting()}
          {profile?.vorname ? `, ${profile.vorname}` : ""}
        </h1>
        <p className="mt-1 text-sm opacity-90">
          {drafts.length > 0
            ? `Du hast ${drafts.length} ${drafts.length === 1 ? "Entwurf" : "Entwürfe"} – jetzt fortsetzen und einreichen.`
            : "Alles im grünen Bereich – Zeit für einen neuen Bericht?"}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link to="/reports/new" search={{ type: undefined, date: undefined }}>
              Neuer Bericht
            </Link>
          </Button>
          <Button asChild variant="ghost" className="text-primary-foreground hover:bg-white/10 hover:text-primary-foreground">
            <Link to="/reports" search={{ azubi: undefined }}>
              Alle ansehen
            </Link>
          </Button>
        </div>
      </section>

      {/* Offene Aufgaben */}
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">Offene Aufgaben</h2>
        {isLoading ? (
          <CardSkeleton />
        ) : tasks.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Alles erledigt.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {tasks.map((t) => (
              <li key={t.key} className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-sm ${t.color}`}>
                <span>{t.text}</span>
                {t.link && (
                  <Link to={t.link.to as "/reports"} className="shrink-0 font-medium text-primary underline-offset-4 hover:underline">
                    {t.link.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Kennzahlen */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Gesamt" value={(reports ?? []).length} />
        <StatCard label="Entwürfe" value={drafts.length} />
        <StatCard label="Eingereicht" value={submitted.length} />
        <StatCard label="Freigegeben" value={approved.length} />
        <StatCard label="Zurückgewiesen" value={rejected.length} />
      </section>

      {/* Letzte Berichte */}
      <section className="rounded-2xl border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Letzte Berichte</h2>
          <Button variant="link" size="sm" asChild className="h-auto px-0">
            <Link to="/reports" search={{ azubi: undefined }}>
              Alle
            </Link>
          </Button>
        </div>
        {recent.length === 0 ? (
          <div className="mt-3 text-sm text-muted-foreground">
            <p>Noch keine Berichte – leg gleich los.</p>
            <Button asChild size="sm" className="mt-2">
              <Link to="/reports/new" search={{ type: undefined, date: undefined }}>
                Ersten Bericht erstellen
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {recent.map((r) => (
              <li key={r.id}>
                <Link
                  to="/reports/$id"
                  params={{ id: r.id }}
                  className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm transition-colors hover:bg-accent"
                >
                  <span className="min-w-0 truncate">{reportTitle(r)}</span>
                  <StatusBadge status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Abdeckung */}
      {coverage && (
        <div>
          <CoverageDonut coverage={coverage} title={`Abdeckung · ${coveragePeriod!.year}. Lehrjahr`} size={140} />
          <Button variant="link" size="sm" asChild className="mt-1 h-auto px-0">
            <Link to="/reports" search={{ azubi: undefined }}>
              Zur Berichte-Übersicht <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </Button>
        </div>
      )}

      {/* Schnellzugriff – nur Links zu existierenden Seiten */}
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">Schnellzugriff</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          <QuickLink to="/reports/new" icon={FilePlus2} title="Neuer Bericht" hint="Tages- oder Wochenbericht erfassen" />
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Ausbildungsplan, Abwesenheit und Schulnoten erscheinen hier, sobald die Bausteine gebaut sind.
        </p>
      </section>

      {profile && (
        <OnboardingDialog
          open={onboardingOpen}
          onOpenChange={setOnboardingOpen}
          onDone={() => {
            try {
              window.localStorage.setItem(ONBOARDING_KEY, "1");
            } catch {
              /* ignorieren */
            }
            setOnboardingOpen(false);
          }}
        />
      )}
    </div>
  );
}

function QuickLink({
  to,
  icon: Icon,
  title,
  hint,
}: {
  to: string;
  icon: typeof CalendarDays;
  title: string;
  hint: string;
}) {
  return (
    <li>
      <Link
        to={to as "/reports"}
        className="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-accent"
      >
        <Icon className="size-5 shrink-0 text-primary" aria-hidden />
        <span>
          <span className="block text-sm font-medium">{title}</span>
          <span className="block text-xs text-muted-foreground">{hint}</span>
        </span>
      </Link>
    </li>
  );
}

function OnboardingDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [professionId, setProfessionId] = useState("");
  const [year, setYear] = useState("1");
  const [busy, setBusy] = useState(false);

  const { data: professions } = useProfessions();

  const finish = async () => {
    setBusy(true);
    try {
      if (professionId) {
        const { error } = await supabase.rpc("set_my_profession", { _profession_id: professionId });
        if (error) throw error;
      }
      const { start, end } = defaultPeriodForYear(Number(year));
      const { error } = await supabase
        .from("profiles")
        .update({
          ausbildungsbeginn: format(start, "yyyy-MM-dd"),
          ausbildungsende: format(end, "yyyy-MM-dd"),
        })
        .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "");
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      toast.success("Profil gespeichert");
      onDone();
    } catch {
      toast.error("Speichern fehlgeschlagen. Du kannst die Angaben später im Profil nachholen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Erste Schritte"
      description={`Schritt ${step + 1} von 3 – du kannst das auch später im Profil nachholen.`}
    >
      {step === 0 && (
        <div className="space-y-3">
          <Label>Beruf wählen</Label>
          <Select value={professionId} onValueChange={setProfessionId}>
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Ausbildungsberuf auswählen" />
            </SelectTrigger>
            <SelectContent>
              {(professions ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(professions ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground">
              Noch keine Berufe angelegt – die Ausbildungsleitung pflegt sie unter „Berufe“.
            </p>
          )}
        </div>
      )}
      {step === 1 && (
        <div className="space-y-3">
          <Label>Aktuelles Ausbildungsjahr</Label>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}. Lehrjahr
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Daraus werden Ausbildungsbeginn und -ende berechnet (Standard 1.8. bis 31.7., 3 Jahre).
          </p>
        </div>
      )}
      {step === 2 && (
        <p className="text-sm text-muted-foreground">
          Betrieb und zuständige:r Ausbilder:in werden von der Ausbildungsleitung zugewiesen.
        </p>
      )}
      <div className="mt-5 flex justify-between gap-2">
        <Button variant="ghost" onClick={onDone}>
          Überspringen
        </Button>
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
              Zurück
            </Button>
          )}
          {step < 2 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={step === 0 && !professionId && (professions ?? []).length > 0}>
              Weiter
            </Button>
          ) : (
            <Button onClick={() => void finish()} disabled={busy}>
              Fertig
            </Button>
          )}
        </div>
      </div>
    </ResponsiveDialog>
  );
}

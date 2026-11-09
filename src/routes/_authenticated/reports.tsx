import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, isAfter } from "date-fns";
import { de } from "date-fns/locale";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ListSkeleton, PageHeader, StatusBadge } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { listReports, listReportsInRange, reportTitle, STATUS_LABELS, type ReportStatus, type ReportType } from "@/features/reports/api";
import { computeCoverage } from "@/features/reports/coverage";
import { CoverageDonut } from "@/features/reports/coverage-donut";
import { currentTrainingYear, trainingYears } from "@/lib/training-year";
import { FileText } from "lucide-react";

const TITLE = "Berichte – Azuvera";
const PAGE_SIZE = 50;

export const Route = createFileRoute("/_authenticated/reports")({
  validateSearch: (search: Record<string, unknown>): { azubi?: string | undefined } => ({
    azubi: typeof search.azubi === "string" ? search.azubi : undefined,
  }),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: "Alle Tages- und Wochenberichte – inklusive gespeicherter Entwürfe." },
      { property: "og:title", content: TITLE },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { azubi: azubiFilter } = Route.useSearch();
  const { data: profile } = useMyProfile();
  const isAzubi = profile?.role === "azubi";

  const [yearFilter, setYearFilter] = useState<string>("current");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ReportStatus | "all">("all");
  const [type, setType] = useState<ReportType | "all">("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const years = useMemo(() => {
    if (!profile?.ausbildungsbeginn) return [];
    return trainingYears(
      new Date(profile.ausbildungsbeginn + "T00:00:00"),
      profile.ausbildungsende ? new Date(profile.ausbildungsende + "T00:00:00") : undefined,
    );
  }, [profile]);

  const currentYear = useMemo(() => {
    if (!profile?.ausbildungsbeginn) return 1;
    return currentTrainingYear(
      new Date(profile.ausbildungsbeginn + "T00:00:00"),
      profile.ausbildungsende ? new Date(profile.ausbildungsende + "T00:00:00") : undefined,
    );
  }, [profile]);

  const effectiveYear = yearFilter === "current" ? currentYear : yearFilter === "all" ? null : Number(yearFilter);

  const { data: reports, isLoading } = useQuery({
    queryKey: ["reports", "list", azubiFilter ?? profile?.id, status, type, search, limit],
    enabled: !!profile,
    queryFn: () =>
      listReports({
        azubiId: isAzubi ? profile!.id : azubiFilter,
        status,
        type,
        search,
        limit,
      }),
  });

  // Abdeckung: für Azubis immer eigene, für andere nur bei gewähltem Azubi
  const coverageAzubi = isAzubi ? profile?.id : azubiFilter;
  const coveragePeriod = useMemo(() => {
    if (!profile?.ausbildungsbeginn) return null;
    const start = new Date(profile.ausbildungsbeginn + "T00:00:00");
    const today = new Date();
    if (effectiveYear === null) return { start, end: today };
    const y = years.find((x) => x.year === effectiveYear);
    if (!y) return { start, end: today };
    return { start: y.start, end: isAfter(y.end, today) ? today : y.end };
  }, [profile, effectiveYear, years]);

  const { data: rangeReports } = useQuery({
    queryKey: ["reports", "range", coverageAzubi, coveragePeriod?.start.toISOString(), coveragePeriod?.end.toISOString()],
    enabled: !!coverageAzubi && !!coveragePeriod,
    queryFn: () =>
      listReportsInRange(
        coverageAzubi!,
        format(coveragePeriod!.start, "yyyy-MM-dd"),
        format(coveragePeriod!.end, "yyyy-MM-dd"),
      ),
  });

  const coverage = useMemo(
    () => (rangeReports && coveragePeriod ? computeCoverage(rangeReports, coveragePeriod.start, coveragePeriod.end) : null),
    [rangeReports, coveragePeriod],
  );

  const coverageTitle =
    effectiveYear === null ? "Tage-Abdeckung · gesamte Ausbildung" : `Tage-Abdeckung · ${effectiveYear}. Lehrjahr`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Berichte"
        subtitle="Alle Tages- und Wochenberichte – inklusive gespeicherter Entwürfe"
        actions={
          <Button asChild>
            <Link to="/reports/new" search={{ type: undefined, date: undefined }}>
              <Plus className="size-4" aria-hidden /> Neuer Bericht
            </Link>
          </Button>
        }
      />

      {coverage && coverageAzubi && (
        <CoverageDonut
          coverage={coverage}
          title={coverageTitle}
          subtitle={`seit ${format(coveragePeriod!.start, "d. MMMM yyyy", { locale: de })}`}
        />
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {years.length > 0 && (
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">{currentYear}. Lehrjahr (laufend)</SelectItem>
              <SelectItem value="all">Alle Lehrjahre</SelectItem>
              {years.map((y) => (
                <SelectItem key={y.year} value={String(y.year)}>
                  {y.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suche nach Name, KW oder Datum"
          className="sm:w-64"
        />
        <Select value={status} onValueChange={(v) => setStatus(v as ReportStatus | "all")}>
          <SelectTrigger className="sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            {(Object.keys(STATUS_LABELS) as ReportStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => setType(v as ReportType | "all")}>
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Typen</SelectItem>
            <SelectItem value="daily">Tagesbericht</SelectItem>
            <SelectItem value="weekly">Wochenbericht</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <ListSkeleton />
      ) : !reports || reports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={search || status !== "all" || type !== "all" ? "Keine Berichte entsprechen dem Filter." : "Noch keine Berichte vorhanden."}
          action={
            <Button asChild>
              <Link to="/reports/new" search={{ type: undefined, date: undefined }}>
                Ersten Bericht erstellen
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <ul className="space-y-2">
            {reports.map((r) => (
              <li key={r.id}>
                <Link
                  to="/reports/$id"
                  params={{ id: r.id }}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{reportTitle(r)}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(r.report_date + "T00:00:00"), "d. MMMM yyyy", { locale: de })}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
          {reports.length >= limit && (
            <div className="text-center">
              <Button variant="outline" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                Mehr laden
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

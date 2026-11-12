import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, isAfter } from "date-fns";
import { de } from "date-fns/locale";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExportButton } from "@/features/export/ExportDialog";
import { EmptyState, ListSkeleton, PageHeader, StatusBadge } from "@/components/shared";
import { SyncBadge } from "@/features/sync/sync-badge";
import { useMyProfile } from "@/features/app/session";
import { listReports, listReportsInRange, reportAzubiProfile, reportTitle, STATUS_LABELS, type ReportStatus, type ReportType } from "@/features/reports/api";
import { computeCoverage } from "@/features/reports/coverage";
import { CoverageDonut } from "@/features/reports/coverage-donut";
import { currentTrainingYear, trainingYears } from "@/lib/training-year";
import { listAbsentDays } from "@/features/absences/api";
import { FileText } from "lucide-react";

const TITLE = "Berichte – Azuvera";
const PAGE_SIZE = 50;

export const Route = createFileRoute("/_authenticated/reports/")({
  validateSearch: (search: Record<string, unknown>): { azubi?: string | undefined } => ({
    azubi: typeof search["azubi"] === "string" ? (search["azubi"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: "Alle Tages- und Wochenberichte – inklusive gespeicherter Entwürfe." },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: "Alle Tages- und Wochenberichte – inklusive gespeicherter Entwürfe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { azubi: azubiFilter } = Route.useSearch();
  const { data: profile } = useMyProfile();
  const isAzubi = profile?.role === "azubi";
  const { data: selectedAzubi } = useQuery({ queryKey: ["reports", "azubi-profile", azubiFilter], queryFn: () => azubiFilter ? reportAzubiProfile(azubiFilter) : null, enabled: !!azubiFilter && !isAzubi });
  const trainingProfile = isAzubi ? profile : selectedAzubi;

  const [yearFilter, setYearFilter] = useState<string>("current");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ReportStatus | "all">("all");
  const [type, setType] = useState<ReportType | "all">("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const years = useMemo(() => {
    if (!trainingProfile?.ausbildungsbeginn) return [];
    return trainingYears(
      new Date(trainingProfile.ausbildungsbeginn + "T00:00:00"),
      trainingProfile.ausbildungsende ? new Date(trainingProfile.ausbildungsende + "T00:00:00") : undefined,
    );
  }, [trainingProfile]);

  const currentYear = useMemo(() => {
    if (!trainingProfile?.ausbildungsbeginn) return 1;
    return currentTrainingYear(
      new Date(trainingProfile.ausbildungsbeginn + "T00:00:00"),
      trainingProfile.ausbildungsende ? new Date(trainingProfile.ausbildungsende + "T00:00:00") : undefined,
    );
  }, [trainingProfile]);

  const effectiveYear = yearFilter === "current" ? currentYear : yearFilter === "all" ? null : Number(yearFilter);

  const { data: reports, isLoading } = useQuery({
    queryKey: ["reports", "list", azubiFilter ?? profile?.id, status, type, search, limit],
    enabled: !!profile,
    queryFn: () =>
      listReports({
        azubiId: isAzubi ? profile?.id : azubiFilter,
        status,
        type,
        search,
        limit,
      }),
  });

  // Abdeckung: für Azubis immer eigene, für andere nur bei gewähltem Azubi
  const coverageAzubi = isAzubi ? profile?.id : azubiFilter;
  const coveragePeriod = useMemo(() => {
    if (!trainingProfile?.ausbildungsbeginn) return null;
    const start = new Date(trainingProfile.ausbildungsbeginn + "T00:00:00");
    const today = new Date();
    if (effectiveYear === null) return { start, end: today };
    const y = years.find((x) => x.year === effectiveYear);
    if (!y) return { start, end: today };
    return { start: y.start, end: isAfter(y.end, today) ? today : y.end };
  }, [trainingProfile, effectiveYear, years]);

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

  const { data: absentDates } = useQuery({
    queryKey: ["absent-days", coverageAzubi, coveragePeriod?.start.toISOString(), coveragePeriod?.end.toISOString()],
    enabled: !!coverageAzubi && !!coveragePeriod,
    queryFn: () => listAbsentDays(coverageAzubi!, format(coveragePeriod!.start, "yyyy-MM-dd"), format(coveragePeriod!.end, "yyyy-MM-dd")),
  });

  const coverage = useMemo(
    () => (rangeReports && absentDates && coveragePeriod ? computeCoverage(rangeReports, coveragePeriod.start, coveragePeriod.end, absentDates) : null),
    [rangeReports, absentDates, coveragePeriod],
  );

  const coverageTitle =
    effectiveYear === null ? "Tage-Abdeckung · gesamte Ausbildung" : `Tage-Abdeckung · ${effectiveYear}. Lehrjahr`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Berichte"
        subtitle="Alle Tages- und Wochenberichte – inklusive gespeicherter Entwürfe"
        actions={isAzubi ?
          <div className="flex flex-wrap gap-2">
            {profile && <ExportButton azubiId={profile.id} isSelf />}
            <Button asChild>
              <Link to="/reports/new" search={{ type: undefined, date: undefined }}>
                <Plus className="size-4" aria-hidden /> Neuer Bericht
              </Link>
            </Button>
          </div> : azubiFilter ? <ExportButton azubiId={azubiFilter} isSelf={azubiFilter === profile?.id} /> : undefined
        }
      />

      {coverage && coverageAzubi && (
        <CoverageDonut
          canCreate={isAzubi}
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
          action={isAzubi ?
            <Button asChild>
              <Link to="/reports/new" search={{ type: undefined, date: undefined }}>
                Ersten Bericht erstellen
              </Link>
            </Button> : undefined
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
                  <SyncBadge state={r._sync} submitPending={r._submit_pending} />
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

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/dialogs";
import { StatusBadge } from "@/components/shared";
import { COVERAGE_LABELS, type CoverageKind, type CoverageResult } from "./coverage";
import { reportTitle } from "./api";

/** Farben je Kategorie – über Design-Tokens, kein Hartkodieren. */
const KIND_COLOR: Record<CoverageKind, string> = {
  approved: "var(--success)",
  submitted: "var(--primary)",
  draft: "var(--muted-foreground)",
  rejected: "var(--destructive)",
  absent: "var(--brand-teal)",
  missing: "var(--border)",
};

interface Segment {
  kind: CoverageKind;
  count: number;
  startAngle: number;
  endAngle: number;
}

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  const rad = ((angle - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, rOuter, a0);
  const [x1, y1] = polar(cx, cy, rOuter, a1);
  const [x2, y2] = polar(cx, cy, rInner, a1);
  const [x3, y3] = polar(cx, cy, rInner, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${rOuter} ${rOuter} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${rInner} ${rInner} 0 ${large} 0 ${x3} ${y3} Z`;
}

export function CoverageDonut({
  coverage,
  size = 180,
  title,
  subtitle,
  canCreate = true,
}: {
  coverage: CoverageResult;
  size?: number;
  title: string;
  subtitle?: string;
  canCreate?: boolean;
}) {
  const [selected, setSelected] = useState<CoverageKind | null>(null);
  const [asTable, setAsTable] = useState(false);

  const segments = useMemo<Segment[]>(() => {
    let angle = 0;
    return coverage.counts.map(({ kind, count }) => {
      const sweep = coverage.total > 0 ? (count / coverage.total) * 360 : 0;
      const seg = { kind, count, startAngle: angle, endAngle: angle + sweep };
      angle += sweep;
      return seg;
    });
  }, [coverage]);

  const cx = 100;
  const rOuter = 92;
  const rInner = 62;
  const selectedDays = selected ? coverage.days.filter((d) => d.kind === selected) : [];

  return (
    <div className="rounded-2xl border bg-card p-5 text-card-foreground shadow-sm">
      <h2 className="font-semibold">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label="Tage-Abdeckung">
            {segments.map((s) => (
              <path
                key={s.kind}
                d={arcPath(cx, cx, rOuter, rInner, s.startAngle + 0.6, Math.max(s.startAngle + 0.6, s.endAngle - 0.6))}
                fill={KIND_COLOR[s.kind]}
                className="cursor-pointer transition-opacity hover:opacity-80"
                onClick={() => setSelected(s.kind)}
              >
                <title>
                  {COVERAGE_LABELS[s.kind]}: {s.count} Tage (
                  {coverage.total > 0 ? Math.round((s.count / coverage.total) * 100) : 0} %)
                </title>
              </path>
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold">
              {coverage.total > 0 ? Math.round((coverage.documented / coverage.total) * 100) : 0}%
            </span>
            <span className="text-xs text-muted-foreground">dokumentiert</span>
          </div>
        </div>
        <ul className="w-full space-y-1.5">
          {segments.map((s) => (
            <li key={s.kind}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-accent"
                onClick={() => setSelected(s.kind)}
              >
                <span className="size-3 shrink-0 rounded-full" style={{ background: KIND_COLOR[s.kind] }} />
                <span className="flex-1">{COVERAGE_LABELS[s.kind]}</span>
                <span className="text-muted-foreground tabular-nums">{s.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        {coverage.documented} von {coverage.total} Tagen dokumentiert. Ein Wochenbericht zählt als 7 Tage.
      </p>
      <Button variant="link" size="sm" className="mt-1 h-auto px-0" onClick={() => setAsTable((v) => !v)}>
        {asTable ? "Als Diagramm anzeigen" : "Als Tabelle anzeigen"}
      </Button>
      {asTable && (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-medium">Kategorie</th>
              <th className="py-1 font-medium">Tage</th>
              <th className="py-1 font-medium">Anteil</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((s) => (
              <tr key={s.kind} className="border-t">
                <td className="py-1">{COVERAGE_LABELS[s.kind]}</td>
                <td className="py-1 tabular-nums">{s.count}</td>
                <td className="py-1 tabular-nums">
                  {coverage.total > 0 ? Math.round((s.count / coverage.total) * 100) : 0} %
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ResponsiveDialog
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}
        title={selected ? `${COVERAGE_LABELS[selected]} · ${selectedDays.length} Tage` : ""}
      >
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 font-medium">Datum</th>
                <th className="py-1 font-medium">Bericht</th>
                <th className="py-1 font-medium">Status</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {selectedDays.map((d) => (
                <tr key={d.date} className="border-t">
                  <td className="py-1.5">{format(new Date(d.date + "T00:00:00"), "EE, dd.MM.yyyy", { locale: de })}</td>
                  <td className="py-1.5">{d.report ? reportTitle(d.report) : "–"}</td>
                  <td className="py-1.5">
                    {d.report ? <StatusBadge status={d.report.status} /> : COVERAGE_LABELS[d.kind]}
                  </td>
                  <td className="py-1.5 text-right">
                    {d.report ? (
                      <Link to="/reports/$id" params={{ id: d.report.id }} className="text-primary underline-offset-4 hover:underline">
                        Öffnen
                      </Link>
                    ) : d.kind === "missing" && canCreate ? (
                      <Link
                        to="/reports/new"
                        search={{ type: "daily", date: d.date }}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        Nachtragen
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ResponsiveDialog>
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { CheckCircle2, Circle, FileEdit, ListChecks, Send, XCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/dialogs";
import { cn } from "@/lib/utils";
import type { ReportLite } from "../api";
import { WEEK_STATUS_LABELS, calendarWeeks, dateDe, reportedWeeks, type CalendarWeek, type Cell, type WeekStatus } from "../stats";
import type { TrainingYear } from "@/lib/training-year";
import type { DrillState } from "./drilldown";

const STYLE: Record<WeekStatus, { cls: string; icon: LucideIcon }> = {
  none: { cls: "border-dashed text-muted-foreground", icon: Circle },
  draft: { cls: "bg-muted text-foreground", icon: FileEdit },
  submitted: { cls: "border-primary/40 bg-primary/10 text-primary", icon: Send },
  approved: { cls: "border-success/50 bg-success/15 text-foreground", icon: CheckCircle2 },
  rejected: { cls: "border-destructive/40 bg-destructive/10 text-destructive", icon: XCircle },
};

export function CalendarTab({ years, reports, cells, own, onDrill }: {
  years: TrainingYear[]; reports: ReportLite[]; cells: Cell[]; own: boolean; onDrill: (d: DrillState) => void;
}) {
  const navigate = useNavigate();
  const [create, setCreate] = useState<CalendarWeek | null>(null);
  if (!years.length) {
    return <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Für den Kalender fehlt der Ausbildungsbeginn im Profil.</p>;
  }
  const open = (w: CalendarWeek) => {
    if (w.reportId) void navigate({ to: "/reports/$id", params: { id: w.reportId } });
    else if (own) setCreate(w);
  };
  return (
    <div className="space-y-4">
      <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="Legende Kalender">
        {(Object.keys(STYLE) as WeekStatus[]).map((s) => { const I = STYLE[s].icon; return <li key={s} className="flex items-center gap-1"><I className="size-3.5" aria-hidden />{WEEK_STATUS_LABELS[s]}</li>; })}
      </ul>
      {years.map((ty) => {
        const weeks = calendarWeeks(ty.start, ty.end, reports);
        const planned = cells.filter((c) => c.year === ty.year && c.planned);
        return (
          <section key={ty.year} className="rounded-2xl border bg-card p-5 text-card-foreground shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">{ty.year}. Ausbildungsjahr ({dateDe(ty.start)} – {dateDe(ty.end)})</h3>
                <p className="text-sm text-muted-foreground">{reportedWeeks(weeks)} von {weeks.length} Wochen berichtet</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => onDrill({ title: `${ty.year}. Ausbildungsjahr · ${planned.length} Einträge`, cells: planned })}>
                <ListChecks className="size-4" aria-hidden /> Geplante Inhalte
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-1.5">
              {weeks.map((w) => {
                const st = STYLE[w.status], I = st.icon;
                const clickable = !!w.reportId || own;
                return (
                  <button
                    key={w.key}
                    type="button"
                    disabled={!clickable}
                    onClick={() => open(w)}
                    title={`${w.label} · ${WEEK_STATUS_LABELS[w.status]}`}
                    className={cn("flex flex-col items-start rounded-lg border px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:hover:ring-1 enabled:hover:ring-primary/40 disabled:cursor-default", st.cls)}
                  >
                    <span className="font-semibold tabular-nums">{w.label}</span>
                    <span className="mt-0.5 flex items-center gap-1"><I className="size-3" aria-hidden />{WEEK_STATUS_LABELS[w.status]}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      <ConfirmDialog
        open={!!create}
        onOpenChange={(o) => !o && setCreate(null)}
        title={create ? `${create.label}: noch kein Bericht` : ""}
        description="Möchtest du für diese Woche einen Wochenbericht anlegen?"
        confirmLabel="Bericht anlegen"
        onConfirm={() => { if (create) void navigate({ to: "/reports/new", search: { type: "weekly", date: format(create.monday, "yyyy-MM-dd") } }); setCreate(null); }}
      />
    </div>
  );
}

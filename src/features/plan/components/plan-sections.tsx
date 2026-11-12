import { useMemo, useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PlanTree } from "../api";
import { itemVisible, matchesSearch, matchesStatus, progressKey, type Mastered, type ProgressLike, type Selection } from "../stats";
import { YearCell, type CellState } from "./year-cell";

interface Props {
  tree: PlanTree;
  progress: ProgressLike[];
  kind: "content" | "checklist";
  sel: Selection;
  readOnly: boolean;
  onChange: (itemId: string, year: number, patch: Partial<CellState>) => Promise<void>;
}

/** Abschnitte → Gruppen → Punkte mit YearCells (Tab „Plan“ und „Betriebszweige“). */
export function PlanSections({ tree, progress, kind, sel, readOnly, onChange }: Props) {
  const map = useMemo(() => new Map(progress.map((p) => [progressKey(p.item_id, p.year), p])), [progress]);
  const duration = tree.plan.duration_years;
  const years = sel.years.length ? [...sel.years].sort() : Array.from({ length: duration }, (_, i) => i + 1);
  const sections = tree.sections.filter((s) => s.kind === kind);

  const view = sections.map((s) => ({
    s,
    groups: s.groups.map((g) => {
      const items = g.items.filter((it) => {
        if (!itemVisible(it, duration, map)) return false;
        if (!matchesSearch({ label: it.label, groupTitle: g.title, sectionTitle: s.title, reference: it.reference }, sel.search)) return false;
        if (sel.status === "all") return true;
        return years.some((y) => {
          const p = map.get(progressKey(it.id, y));
          return matchesStatus({ planned: !!p?.planned, mastered: (p?.mastered ?? "") as Mastered }, sel.status);
        });
      });
      const planned = items.filter((it) => years.some((y) => map.get(progressKey(it.id, y))?.planned)).length;
      return { g, items, planned };
    }).filter((x) => x.items.length > 0),
  })).filter((x) => x.groups.length > 0);

  if (!view.length) {
    return <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Keine Punkte passen zur aktuellen Auswahl.</p>;
  }

  return (
    <div className="space-y-4">
      {view.map(({ s, groups }) => <SectionCard key={s.id} title={s.title} hint={kind === "checklist" ? s.hint : null}>
        {groups.map(({ g, items, planned }) => (
          <div key={g.id} className="border-t pt-4 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold leading-snug">{g.title}</h3>
                {(g.reference || g.weeks_text) && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{[g.reference, g.weeks_text].filter(Boolean).join(" · ")}</p>
                )}
                {g.hint && <p className="mt-0.5 text-xs text-muted-foreground">{g.hint}</p>}
              </div>
              <Badge variant="secondary" className="tabular-nums" aria-label={`${planned} von ${items.length} Punkten geplant`}>{planned}/{items.length}</Badge>
            </div>
            <ul className="mt-3 space-y-3">
              {items.map((it) => (
                <li key={it.id} className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0 text-sm">
                    {it.reference && <span className="mr-1.5 font-semibold text-primary">{it.reference}</span>}
                    <span className="break-words">{it.label}</span>
                    {!it.is_active && <span className="ml-2 text-xs italic text-muted-foreground">nicht mehr Teil des Plans</span>}
                  </div>
                  <div className={cn("grid gap-1.5", kind === "content" ? "grid-cols-[repeat(auto-fit,minmax(118px,1fr))] lg:flex" : "grid-cols-[repeat(auto-fit,minmax(72px,1fr))] lg:flex")}>
                    {years.map((y) => {
                      const p = map.get(progressKey(it.id, y));
                      return (
                        <div key={y} className={kind === "content" ? "lg:w-[136px]" : "lg:w-[84px]"}>
                          <YearCell
                            year={y}
                            readOnly={readOnly}
                            withMastery={kind === "content"}
                            state={{ planned: !!p?.planned, mastered: (p?.mastered ?? "") as Mastered }}
                            onChange={(patch) => onChange(it.id, y, patch)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </SectionCard>)}
    </div>
  );
}

function SectionCard({ title, hint, children }: { title: string; hint: string | null; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-2xl border bg-card text-card-foreground shadow-sm">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-2xl px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
        <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 px-5 pb-5">
        {hint && (
          <p className="flex gap-2 rounded-xl bg-accent/60 p-3 text-sm text-accent-foreground"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{hint}</p>
        )}
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

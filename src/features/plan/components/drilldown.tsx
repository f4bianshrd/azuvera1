import { ResponsiveDialog } from "@/components/dialogs";
import { cn } from "@/lib/utils";
import { cellStatusLabel, groupCells, type Cell } from "../stats";

export interface DrillState { title: string; cells: Cell[] }

const tone: Record<string, string> = {
  Beherrscht: "bg-success/15 text-foreground border-success/40",
  "Nicht beherrscht": "bg-destructive/10 text-destructive border-destructive/30",
  Geplant: "bg-primary/10 text-primary border-primary/30",
  "Nicht geplant": "bg-muted text-muted-foreground border-border",
};

/** Drill-Down: Zellen gruppiert nach Abschnitt und Gruppe mit Status. */
export function DrillDownDialog({ state, onClose }: { state: DrillState | null; onClose: () => void }) {
  const groups = state ? groupCells(state.cells) : [];
  return (
    <ResponsiveDialog open={!!state} onOpenChange={(o) => !o && onClose()} title={state?.title ?? ""}>
      <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
        {groups.length === 0 && <p className="text-sm text-muted-foreground">Keine Einträge.</p>}
        {groups.map((s) => (
          <section key={s.sectionId}>
            <h3 className="text-sm font-semibold text-primary">{s.title}</h3>
            {s.groups.map((g) => (
              <div key={g.groupId} className="mt-2">
                <p className="text-xs font-medium text-muted-foreground">{g.title}</p>
                <ul className="mt-1 space-y-1">
                  {g.cells.map((c) => {
                    const label = cellStatusLabel(c);
                    return (
                      <li key={`${c.itemId}-${c.year}`} className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                        <span className="min-w-0 break-words">{c.reference ? `${c.reference} ` : ""}{c.label} <span className="text-xs text-muted-foreground">· {c.year}. Jahr</span></span>
                        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium", tone[label])}>{label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
    </ResponsiveDialog>
  );
}

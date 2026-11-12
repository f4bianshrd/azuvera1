import { useId, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { Mastered } from "../stats";

export const READ_ONLY_TOAST = "Nur-Lese-Ansicht: fremder Ausbildungsplan.";

export interface CellState { planned: boolean; mastered: Mastered }

/** Ein Punkt in einem Ausbildungsjahr: Kästchen „Vorgesehen“ und optional Beherrscht Ja/Nein. */
export function YearCell({ year, state, readOnly, withMastery = true, onChange }: {
  year: number;
  state: CellState;
  readOnly: boolean;
  withMastery?: boolean;
  onChange: (patch: Partial<CellState>) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (patch: Partial<CellState>) => {
    if (readOnly) { toast.info(READ_ONLY_TOAST); return; }
    setBusy(true);
    try {
      await onChange(patch);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };
  const id = useId();
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-lg border bg-background/60 px-2 py-1.5">
      <Checkbox
        id={id}
        checked={state.planned}
        aria-label={`Vorgesehen im ${year}. Jahr`}
        aria-readonly={readOnly}
        onCheckedChange={(v) => run({ planned: v === true })}
      />
      <label htmlFor={id} className="text-xs font-medium tabular-nums text-muted-foreground">{year}. J.</label>
      {withMastery && (
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Beherrscht: Ja"
            aria-pressed={state.mastered === "yes"}
            onClick={() => run({ mastered: state.mastered === "yes" ? "" : "yes" })}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              state.mastered === "yes" ? "border-success bg-success text-success-foreground" : "border-border text-muted-foreground hover:border-success hover:text-foreground",
            )}
          >
            <Check className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Beherrscht: Nein"
            aria-pressed={state.mastered === "no"}
            onClick={() => run({ mastered: state.mastered === "no" ? "" : "no" })}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              state.mastered === "no" ? "border-destructive bg-destructive text-destructive-foreground" : "border-border text-muted-foreground hover:border-destructive hover:text-foreground",
            )}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}
      {busy && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Wird gespeichert" />}
    </div>
  );
}

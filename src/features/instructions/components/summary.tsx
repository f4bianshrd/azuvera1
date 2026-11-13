import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { loadInstructionData, listPendingInstructions } from "../api";
import { berlinToday } from "../due";
import { buildViews, kpisFor } from "../model";

/** Kennzahlen der Unterweisungen einer Person (gleiche Quelle wie /unterweisungen). */
export function useInstructionSummary(azubiId: string | null | undefined) {
  return useQuery({
    queryKey: ["instructions", "data", azubiId],
    queryFn: () => loadInstructionData(azubiId!),
    enabled: !!azubiId,
    select: (d) => kpisFor(buildViews(d, berlinToday())),
  });
}

export function usePendingInstructionCount(enabled: boolean) {
  return useQuery({ queryKey: ["instructions", "pending"], queryFn: listPendingInstructions, enabled, select: (d) => d.length });
}

/** Karte „Unterweisungen“ auf der Team-Detailseite. */
export function InstructionTeamCard({ azubiId }: { azubiId: string }) {
  const { data: k } = useInstructionSummary(azubiId);
  const chip = (label: string, value: string | number) => <span className="rounded-full border px-3 py-1 text-sm">{label}: <span className="font-semibold">{value}</span></span>;
  return (
    <section className="border-t pt-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Unterweisungen</h2>
        <Button asChild variant="outline" size="sm" className="min-h-11"><Link to="/unterweisungen" search={{ azubi: azubiId }}>Öffnen</Link></Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {chip("Unterwiesen", k ? `${k.done}/${k.total}` : "–")}
        {chip("Offen", k?.open ?? "–")}
        {chip("Bald fällig", k?.dueSoon ?? "–")}
        {chip("Überfällig", k?.overdue ?? "–")}
      </div>
    </section>
  );
}

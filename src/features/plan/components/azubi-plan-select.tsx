import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOnline } from "@/lib/sync/status";
import { assignedPlans, plansForProfession, setAzubiPlan } from "../api";

/** Spalte „Ausbildungsplan“ in der Benutzertabelle (nur Azubis, Leitung). */
export function AzubiPlanSelect({ azubiId, professionId }: { azubiId: string; professionId: string | null }) {
  const qc = useQueryClient();
  const online = useOnline();
  const { data: plans = [] } = useQuery({ queryKey: ["plan", "for-profession", professionId], queryFn: () => plansForProfession(professionId), enabled: !!professionId && online });
  const { data: assigned } = useQuery({ queryKey: ["plan", "assigned"], queryFn: assignedPlans, enabled: online });
  if (!professionId) return <span className="text-xs text-muted-foreground">Erst Beruf wählen</span>;
  const value = assigned?.get(azubiId) ?? "__auto";
  return (
    <Select value={value} disabled={!online} onValueChange={async (v) => {
      try {
        await setAzubiPlan(azubiId, v === "__auto" ? null : v);
        toast.success("Ausbildungsplan gespeichert");
        await qc.invalidateQueries({ queryKey: ["plan"] });
      } catch (e) { toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen"); }
    }}>
      <SelectTrigger className="h-9 min-w-44" aria-label="Ausbildungsplan"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__auto">— automatisch —</SelectItem>
        {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

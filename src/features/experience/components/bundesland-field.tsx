import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveMyBundesland } from "../api";
import { useExperienceProgress } from "./progress-card";

/** Profil, Karte „Ausbildung“: Bundesland des Ausbildungsbetriebs (vom Betrieb festgelegt oder selbst gewählt). */
export function BundeslandField({ azubiId }: { azubiId: string }) {
  const queryClient = useQueryClient();
  const { data } = useExperienceProgress(azubiId);
  if (!data) return null;
  const bl = data.bundesland;
  if (bl.source === "company") {
    return <div className="space-y-1.5 sm:col-span-2">
      <Label>Bundesland des Ausbildungsbetriebs</Label>
      <p className="flex h-11 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">{bl.name ?? bl.code} (vom Betrieb festgelegt)</p>
    </div>;
  }
  return <div className="space-y-1.5 sm:col-span-2">
    <Label htmlFor="profil-bundesland">Bundesland des Ausbildungsbetriebs</Label>
    <Select value={bl.code ?? "none"} onValueChange={(v) => {
      void saveMyBundesland(v === "none" ? null : v)
        .then(() => { toast.success("Bundesland gespeichert"); return queryClient.invalidateQueries({ queryKey: ["experience"] }); })
        .catch((e: Error) => toast.error(e.message));
    }}>
      <SelectTrigger id="profil-bundesland" className="h-11"><SelectValue placeholder="Bundesland wählen" /></SelectTrigger>
      <SelectContent><SelectItem value="none">Nicht festgelegt</SelectItem>{data.ctx.bundeslaender.map((b) => <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>)}</SelectContent>
    </Select>
  </div>;
}

import { AlertTriangle, Clock, GitCompare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SyncState } from "@/lib/sync/db";

/** Kleines Badge je Datensatz; synchronisierte Datensätze zeigen nichts. */
export function SyncBadge({ state, submitPending }: { state?: SyncState | undefined; submitPending?: boolean | undefined }) {
  if (submitPending && state !== "conflict" && state !== "failed") {
    return <Badge variant="outline" className="gap-1 border-warning/50 text-warning-foreground"><Clock className="size-3" aria-hidden />Wartet auf Synchronisation</Badge>;
  }
  if (!state || state === "synced") return null;
  if (state === "pending") return <Badge variant="outline" className="gap-1"><Clock className="size-3" aria-hidden />Nicht synchronisiert</Badge>;
  if (state === "conflict") return <Badge variant="outline" className="gap-1 border-warning text-warning-foreground"><GitCompare className="size-3" aria-hidden />Konflikt</Badge>;
  return <Badge variant="destructive" className="gap-1"><AlertTriangle className="size-3" aria-hidden />Fehler</Badge>;
}

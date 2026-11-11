import { Link } from "@tanstack/react-router";
import { AlertTriangle, CloudOff, CloudUpload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSyncStatus } from "@/lib/sync/status";

/** Statuschip im Kopf neben der Glocke. Immer Icon und Text; ein Klick öffnet /sync. */
export function SyncChip() {
  const s = useSyncStatus();
  let icon = null;
  let text = "";
  let warn = false;
  if (!s.online) { icon = <CloudOff className="size-4" aria-hidden />; text = "Offline"; }
  else if (s.failed > 0 || s.conflicts > 0) { icon = <AlertTriangle className="size-4" aria-hidden />; text = "Sync-Problem"; warn = true; }
  else if (s.syncing && s.pending > 0) { icon = <Loader2 className="size-4 animate-spin" aria-hidden />; text = "Synchronisiere…"; }
  else if (s.pending > 0) { icon = <CloudUpload className="size-4" aria-hidden />; text = `${s.pending} ${s.pending === 1 ? "Änderung wartet" : "Änderungen warten"}`; }
  if (!icon) return null;
  return (
    <Link
      to="/sync"
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium",
        warn ? "border-warning bg-warning text-warning-foreground" : "bg-card text-foreground hover:bg-accent",
      )}
    >
      {icon}
      <span className="max-w-32 truncate sm:max-w-none">{text}</span>
    </Link>
  );
}

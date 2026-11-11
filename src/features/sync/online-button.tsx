import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";

/** Button für Aktionen, die nur online gehen: offline deaktiviert, mit Hinweis. */
export function OnlineButton({ disabled, ...props }: ComponentProps<typeof Button>) {
  const online = useOnline();
  return (
    <>
      <Button {...props} disabled={disabled || !online} />
      {!online && <p className="text-xs text-muted-foreground">{OFFLINE_ACTION_HINT}</p>}
    </>
  );
}

/** Hinweis für Online-only-Bereiche (Verwaltung, Vertretung, Erinnerungen). */
export function OfflineHint() {
  const online = useOnline();
  if (online) return null;
  return <div className="rounded-xl border bg-muted/40 p-3 text-sm">{OFFLINE_ACTION_HINT}</div>;
}

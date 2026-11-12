import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { format } from "date-fns";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";
import { latestCacheAt } from "@/lib/sync/online-cache";

const ONLINE_ONLY = ["/admin", "/stammdaten", "/erinnerungen", "/aenderungsprotokoll"];
const SNAPSHOT: Record<string, string[]> = { "/team": ["team:"], "/ausbilder": ["review-queue:", "visible-reports:", "review-people"] };

/** Offline: Hinweis auf Online-only-Seiten bzw. „Stand: …“ bei Team und Ausbilderportal. */
export function OfflinePageHint() {
  const online = useOnline();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [at, setAt] = useState<number | null>(null);
  const snapKey = Object.keys(SNAPSHOT).find((p) => pathname === p || pathname.startsWith(p + "/"));
  useEffect(() => {
    if (online || !snapKey) return;
    void latestCacheAt(SNAPSHOT[snapKey]!).then(setAt);
  }, [online, snapKey, pathname]);
  if (online) return null;
  if (snapKey) {
    return <div className="mb-4 rounded-xl border bg-muted/40 p-3 text-sm">{at ? `Stand: ${format(at, "dd.MM.yyyy, HH:mm")} Uhr · ${OFFLINE_ACTION_HINT}` : OFFLINE_ACTION_HINT}</div>;
  }
  if (ONLINE_ONLY.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return <div className="mb-4 rounded-xl border bg-muted/40 p-3 text-sm">{OFFLINE_ACTION_HINT}</div>;
  }
  return null;
}

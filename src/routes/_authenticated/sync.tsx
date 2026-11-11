import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow, format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { CheckCircle2, CloudOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/dialogs";
import { PageHeader } from "@/components/shared";
import { copyText } from "@/lib/platform";
import { useSyncStatus } from "@/lib/sync/status";
import { discardEntry, entryStatusLabel, retryEntry, useOutbox, useSyncLog, type OutboxEntry } from "@/features/sync/api";
import { SyncNowButton } from "@/features/sync/sync-now-button";

const TITLE = "Synchronisation – Azuvera";
const DESC = "Wartende Änderungen, Synchronisationsstatus und Protokoll dieses Geräts.";

export const Route = createFileRoute("/_authenticated/sync")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SyncPage,
});

function statusText(s: ReturnType<typeof useSyncStatus>): string {
  if (!s.online) return "Offline";
  if (s.failed || s.conflicts) return "Sync-Problem";
  if (s.syncing) return "Synchronisiere…";
  if (s.pending) return `${s.pending} ${s.pending === 1 ? "Änderung wartet" : "Änderungen warten"}`;
  return "Alles ist synchronisiert.";
}

function SyncPage() {
  const s = useSyncStatus();
  const outbox = useOutbox();
  const logRows = useSyncLog();
  const [discard, setDiscard] = useState<OutboxEntry | null>(null);

  return (
    <div className="space-y-5">
      <PageHeader title="Synchronisation" subtitle={DESC} />
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-2">
          {s.online ? <CheckCircle2 className="size-5 text-primary" aria-hidden /> : <CloudOff className="size-5 text-muted-foreground" aria-hidden />}
          <div>
            <p className="font-medium">{statusText(s)}</p>
            <p className="text-sm text-muted-foreground">Letzte Synchronisation: {s.lastSyncAt ? formatDistanceToNow(s.lastSyncAt, { addSuffix: true, locale: de }) : "noch nie"}</p>
          </div>
        </div>
        <SyncNowButton />
      </section>

      <section className="rounded-2xl border bg-card p-4">
        <h2 className="font-semibold">Wartende Änderungen</h2>
        {outbox && outbox.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Alles ist synchronisiert.</p>
        ) : (
          <ul className="mt-2 divide-y">
            {(outbox ?? []).map((e) => (
              <li key={e.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{e.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant={e.status === "failed" ? "destructive" : "outline"} className={e.status === "conflict" ? "border-warning bg-warning/15" : ""}>{entryStatusLabel(e)}</Badge>
                    {e.error && <span className="text-xs text-muted-foreground">{e.error}</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={!s.online || e.status === "sending"} onClick={() => void retryEntry(e.id!)}>Erneut versuchen</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" disabled={e.status === "sending"} onClick={() => setDiscard(e)}>Verwerfen</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Protokoll</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const text = (logRows ?? []).map((r) => `${format(r.at, "dd.MM.yyyy HH:mm:ss")} [${r.level}] ${r.message}`).join("\n");
              try { await copyText(text); toast.success("Protokoll kopiert"); } catch { toast.error("Kopieren nicht möglich."); }
            }}
          >
            Protokoll kopieren
          </Button>
        </div>
        {logRows && logRows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Noch keine Ereignisse.</p>
        ) : (
          <ul className="mt-2 max-h-96 space-y-1 overflow-y-auto font-mono text-xs">
            {(logRows ?? []).map((r) => (
              <li key={r.id} className={r.level === "error" ? "text-destructive" : r.level === "warn" ? "text-foreground" : "text-muted-foreground"}>
                {format(r.at, "dd.MM. HH:mm:ss")} · {r.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={discard !== null}
        onOpenChange={(o) => !o && setDiscard(null)}
        title="Änderung verwerfen?"
        description={discard ? `„${discard.title}“ wird nicht gesendet. Die lokale Änderung geht verloren.` : undefined}
        confirmLabel="Verwerfen"
        destructive
        onConfirm={() => { if (discard) void discardEntry(discard.id!); setDiscard(null); }}
      />
    </div>
  );
}

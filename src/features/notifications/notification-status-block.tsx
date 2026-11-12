import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { notificationStatus } from "./api";

function YesNo({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm">{label}</span>
        <span className={`flex items-center gap-1.5 text-sm font-medium ${ok ? "text-success" : "text-destructive"}`}>
          {ok ? <CheckCircle2 className="size-4" aria-hidden /> : <XCircle className="size-4" aria-hidden />}{ok ? "Ja" : "Nein"}
        </span>
      </div>
      {!ok && <p className="mt-1 text-xs text-muted-foreground">Die Zugangsdaten fehlen. Sie werden als Secrets im Backend hinterlegt.</p>}
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 py-3 text-sm"><span>{label}</span><span className="font-medium tabular-nums">{value}</span></div>;
}

export function NotificationStatusBlock() {
  const q = useQuery({ queryKey: ["notification-status"], queryFn: notificationStatus });
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Benachrichtigungen</h2>
        <Button variant="outline" className="h-11" disabled={q.isFetching} onClick={() => void q.refetch()}>Aktualisieren</Button>
      </div>
      {q.error ? <p className="mt-4 text-sm text-destructive">{(q.error as Error).message}</p> : !q.data ? <div className="mt-4 h-40 animate-pulse rounded-xl bg-muted" /> : (
        <div className="mt-2 divide-y">
          <YesNo label="Push eingerichtet" ok={q.data.push} />
          <YesNo label="E-Mail eingerichtet" ok={q.data.email} />
          <Row label="Wartende Zustellungen" value={String(q.data.pending)} />
          <Row label="Fehlgeschlagen (7 Tage)" value={String(q.data.failed7d)} />
          <Row label="Letzter erfolgreicher Versand" value={q.data.lastSentAt ? format(new Date(q.data.lastSentAt), "d. MMMM yyyy, HH:mm 'Uhr'", { locale: de }) : "–"} />
        </div>
      )}
    </section>
  );
}

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/dialogs";
import { keepMyVersion, takeServerVersion, type Report, type ReportDraftPatch } from "@/features/reports/api";

const SECTIONS = [
  { key: "activities", label: "Tätigkeiten" },
  { key: "school_content", label: "Berufsschule" },
  { key: "instructions", label: "Unterweisungen" },
  { key: "summary", label: "Zusammenfassung / Reflexion" },
] as const;
type Key = (typeof SECTIONS)[number]["key"];

/** Hinweiskasten bei Konflikt: behalten, übernehmen oder vergleichen. */
export function ConflictBox({ report }: { report: Report }) {
  const queryClient = useQueryClient();
  const server = report._server;
  const [compare, setCompare] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [merged, setMerged] = useState<Record<Key, string>>(() => Object.fromEntries(SECTIONS.map((s) => [s.key, report[s.key] ?? ""])) as Record<Key, string>);
  if (report._sync !== "conflict") return null;
  const locked = !!server && server.status !== "draft" && server.status !== "rejected";
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["reports"] });

  return (
    <section className="space-y-3 rounded-2xl border border-warning bg-warning/15 p-4">
      <p className="font-medium">{locked ? "Der Bericht wurde inzwischen eingereicht und kann nicht mehr geändert werden." : "Der Bericht wurde auf einem anderen Gerät geändert."}</p>
      <div className="flex flex-wrap gap-2">
        {!locked && <Button size="sm" onClick={async () => { await keepMyVersion(report.id); await refresh(); toast.success("Deine Version wird gesendet."); }}>Meine Version behalten</Button>}
        <Button size="sm" variant="outline" onClick={() => setConfirm(true)}>Serverversion übernehmen</Button>
        {!locked && <Button size="sm" variant="outline" onClick={() => setCompare((c) => !c)}>Texte vergleichen</Button>}
        {locked && <Button size="sm" variant="ghost" onClick={() => setShowCopy((c) => !c)}>Lokale Kopie anzeigen</Button>}
      </div>

      {locked && showCopy && (
        <div className="space-y-2 rounded-xl border bg-card p-3 text-sm">
          {SECTIONS.map((s) => (report[s.key] ?? "").trim() && <div key={s.key}><p className="font-semibold text-muted-foreground">{s.label}</p><p className="whitespace-pre-wrap">{report[s.key]}</p></div>)}
        </div>
      )}

      {compare && server && (
        <div className="space-y-4">
          {SECTIONS.map((s) => (
            <div key={s.key} className="space-y-2 rounded-xl border bg-card p-3">
              <p className="text-sm font-semibold">{s.label}</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Server</p>
                  <p className="min-h-10 whitespace-pre-wrap rounded-lg bg-muted/50 p-2 text-sm">{server[s.key] ?? ""}</p>
                  <Button size="sm" variant="outline" onClick={() => setMerged((m) => ({ ...m, [s.key]: server[s.key] ?? "" }))}>Diesen Abschnitt übernehmen</Button>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Auf diesem Gerät{merged[s.key] === (server[s.key] ?? "") && merged[s.key] !== (report[s.key] ?? "") ? " (Server übernommen)" : ""}</p>
                  <p className="min-h-10 whitespace-pre-wrap rounded-lg bg-muted/50 p-2 text-sm">{merged[s.key]}</p>
                  <Button size="sm" variant="ghost" onClick={() => setMerged((m) => ({ ...m, [s.key]: report[s.key] ?? "" }))}>Diesen Abschnitt übernehmen</Button>
                </div>
              </div>
            </div>
          ))}
          <Button onClick={async () => { await keepMyVersion(report.id, merged as ReportDraftPatch); setCompare(false); await refresh(); toast.success("Zusammengeführte Version wird gesendet."); }}>Zusammengeführte Version speichern</Button>
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Serverversion übernehmen?"
        description="Deine lokalen Änderungen an diesem Bericht werden verworfen."
        confirmLabel="Serverversion übernehmen"
        destructive
        onConfirm={async () => { await takeServerVersion(report.id); await refresh(); }}
      />
    </section>
  );
}

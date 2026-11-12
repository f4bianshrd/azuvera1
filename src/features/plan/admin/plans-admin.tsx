import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, FileJson, FolderOpen, ListTree, Send, ShieldAlert, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/dialogs";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { useProfessions } from "@/features/app/queries";
import { useOnline } from "@/lib/sync/status";
import { saveFile } from "@/lib/platform";
import { OFFLINE_MESSAGE, duplicatePlan, exportPlanJson, listPlansAdmin, planItemUsage, savePlanJson, setPlanStatus, type PlanJson, type PlanSummary } from "../api";
import { dateDe } from "../stats";
import { ImportDialog } from "./import-dialog";
import { PlanEditor } from "./plan-editor";

const fmt = (d: string | null) => (d ? dateDe(new Date(`${d}T00:00:00`)) : "offen");

export function PlansAdmin({ planParam }: { planParam: string | undefined }) {
  const { data: me } = useMyProfile();
  const online = useOnline();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isLeitung = me?.role === "ausbildungsleitung";
  const { data: professions = [] } = useProfessions();
  const codes = professions.map((p) => p.code).filter((c): c is string => !!c);
  const { data: plans, isLoading, error } = useQuery({ queryKey: ["plan", "admin-list"], queryFn: listPlansAdmin, enabled: isLeitung && online });
  const { data: editing } = useQuery({
    queryKey: ["plan", "admin-edit", planParam],
    queryFn: async () => ({ json: await exportPlanJson(planParam!), usage: await planItemUsage(planParam!) }),
    enabled: isLeitung && online && !!planParam,
  });
  const [importOpen, setImportOpen] = useState(false);
  const [dup, setDup] = useState<PlanSummary | null>(null);
  const [dupForm, setDupForm] = useState({ code: "", title: "" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["plan"] });

  if (me && !isLeitung) return <EmptyState icon={ShieldAlert} title="Kein Zugriff" description="Diese Seite ist der Ausbildungsleitung vorbehalten." />;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); await refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Aktion fehlgeschlagen"); }
  };
  const download = async (p: PlanSummary) => {
    try {
      const json = await exportPlanJson(p.id);
      saveFile(new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }), `${p.code}.json`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Export fehlgeschlagen"); }
  };

  if (planParam && editing) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ausbildungspläne" subtitle="Plan bearbeiten" />
        <PlanEditor initial={editing.json} usage={editing.usage} professionCodes={codes} online={online}
          onClose={() => void navigate({ to: "/stammdaten/ausbildungsplaene", search: {} })}
          onSave={async (json: PlanJson) => {
            try { await savePlanJson(json); toast.success("Gespeichert"); await refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen"); }
          }} />
      </div>
    );
  }

  const byProfession = new Map<string, PlanSummary[]>();
  for (const p of plans ?? []) byProfession.set(p.profession_name, [...(byProfession.get(p.profession_name) ?? []), p]);

  return (
    <div className="space-y-6">
      <PageHeader title="Ausbildungspläne" subtitle="Pläne je Beruf anlegen, prüfen und veröffentlichen."
        actions={<Button onClick={() => setImportOpen(true)} disabled={!online} title={online ? undefined : OFFLINE_MESSAGE}><FileJson className="size-4" aria-hidden /> JSON importieren</Button>} />
      {!online && <p className="rounded-xl border bg-muted/50 px-4 py-2 text-sm text-muted-foreground">Plan-Editor und Import sind nur mit Internetverbindung verfügbar.</p>}
      {online && isLoading && <ListSkeleton />}
      {error && <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Laden fehlgeschlagen"}</p>}
      {online && plans && !plans.length && <EmptyState icon={ListTree} title="Noch keine Ausbildungspläne" description="Importiere einen Plan als JSON-Datei." />}
      {[...byProfession.entries()].map(([prof, list]) => (
        <section key={prof} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{prof}</h2>
          <ul className="space-y-2">
            {list.map((p) => (
              <li key={p.id} className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{p.code} · {fmt(p.valid_from)} – {fmt(p.valid_until)} · {p.sections} Abschnitte · {p.groups} Gruppen · {p.items} Punkte</p>
                  </div>
                  {p.is_template ? <Badge variant="outline">Vorlage</Badge> : p.status === "published" ? <Badge className="bg-success text-success-foreground hover:bg-success">Veröffentlicht</Badge> : <Badge variant="secondary">Entwurf</Badge>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void navigate({ to: "/stammdaten/ausbildungsplaene", search: { plan: p.id } })}><FolderOpen className="size-4" aria-hidden /> Öffnen</Button>
                  <Button size="sm" variant="outline" onClick={() => { setDup(p); setDupForm({ code: `${p.code}-kopie`, title: `${p.title} (Kopie)` }); }}><Copy className="size-4" aria-hidden /> Duplizieren</Button>
                  {p.status === "published"
                    ? <Button size="sm" variant="outline" onClick={() => act(() => setPlanStatus(p.id, "draft"), "Plan zurückgezogen")}><Undo2 className="size-4" aria-hidden /> Zurückziehen</Button>
                    : <Button size="sm" variant="outline" onClick={() => act(() => setPlanStatus(p.id, "published"), "Plan veröffentlicht")}><Send className="size-4" aria-hidden /> Veröffentlichen</Button>}
                  <Button size="sm" variant="ghost" onClick={() => download(p)}><Download className="size-4" aria-hidden /> Als JSON exportieren</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} professionCodes={codes} onDone={() => void refresh()} />
      <ResponsiveDialog open={!!dup} onOpenChange={(o) => !o && setDup(null)} title="Plan duplizieren" description="Die Kopie wird als Entwurf angelegt.">
        <div className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="dup-code">Plan-Code</Label><Input id="dup-code" value={dupForm.code} onChange={(e) => setDupForm({ ...dupForm, code: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="dup-title">Titel</Label><Input id="dup-title" value={dupForm.title} onChange={(e) => setDupForm({ ...dupForm, title: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDup(null)}>Abbrechen</Button>
            <Button onClick={() => { const p = dup!; setDup(null); void act(() => duplicatePlan(p.id, dupForm.code.trim(), dupForm.title.trim()), "Plan dupliziert"); }}>Duplizieren</Button>
          </div>
        </div>
      </ResponsiveDialog>
    </div>
  );
}

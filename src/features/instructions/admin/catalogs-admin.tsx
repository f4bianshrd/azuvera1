import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Copy, Download, FileJson, FolderOpen, Send, ShieldAlert, ShieldCheck, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveDialog } from "@/components/dialogs";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { useProfessions } from "@/features/app/queries";
import { useOnline } from "@/lib/sync/status";
import { saveFile } from "@/lib/platform";
import { OFFLINE_MESSAGE, duplicateCatalog, exportCatalogJson, listCatalogsAdmin, saveCatalogJson, setCatalogStatus, topicsWithRecords, type CatalogListRow } from "../api";
import { previewCatalogJson, type CatalogJson, type CatalogPreview } from "../json";
import { CatalogEditor } from "./catalog-editor";

export function CatalogsAdmin({ catalogParam }: { catalogParam: string | undefined }) {
  const { data: me } = useMyProfile();
  const online = useOnline();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isLeitung = !!me?.is_team;
  const { data: professions = [] } = useProfessions();
  const codes = professions.map((p) => p.code).filter((c): c is string => !!c);
  const { data: list, isLoading, error } = useQuery({ queryKey: ["instructions", "admin-list"], queryFn: listCatalogsAdmin, enabled: isLeitung && online });
  const { data: editing } = useQuery({
    queryKey: ["instructions", "admin-edit", catalogParam],
    queryFn: async () => ({ json: await exportCatalogJson(catalogParam!), used: await topicsWithRecords(catalogParam!) }),
    enabled: isLeitung && online && !!catalogParam,
  });
  const [importOpen, setImportOpen] = useState(false);
  const [dup, setDup] = useState<CatalogListRow | null>(null);
  const [dupForm, setDupForm] = useState({ code: "", title: "" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["instructions"] });

  if (me && !isLeitung) return <EmptyState icon={ShieldAlert} title="Kein Zugriff" description="Diese Seite ist der Ausbildungsleitung vorbehalten." />;
  const header = <PageHeader title="Unterweisungs-Kataloge" subtitle="Kataloge je Beruf verwalten, importieren und veröffentlichen." />;
  if (!online) return <div className="space-y-6">{header}<EmptyState icon={ShieldCheck} title={OFFLINE_MESSAGE} /></div>;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); await refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Aktion fehlgeschlagen"); }
  };
  const download = async (c: CatalogListRow) => {
    try { saveFile(new Blob([JSON.stringify(await exportCatalogJson(c.id), null, 2)], { type: "application/json" }), `${c.code}.json`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Export fehlgeschlagen"); }
  };

  if (catalogParam && editing) {
    return (
      <div className="space-y-6">
        {header}
        <CatalogEditor initial={editing.json} used={editing.used} professions={professions.filter((p) => p.code).map((p) => ({ code: p.code!, name: p.name }))}
          onClose={() => void navigate({ to: "/stammdaten/unterweisungen", search: {} })}
          onSave={async (json: CatalogJson) => { await saveCatalogJson(json); toast.success("Katalog gespeichert"); await refresh(); }} />
      </div>
    );
  }

  const profName = (id: string | null) => (id ? professions.find((p) => p.id === id)?.name ?? "–" : "Alle Berufe");
  return (
    <div className="space-y-6">
      {header}
      <div className="flex flex-wrap gap-2"><Button className="min-h-11" onClick={() => setImportOpen(true)}><FileJson className="size-4" aria-hidden />JSON importieren</Button></div>
      {isLoading && <ListSkeleton />}
      {error && <EmptyState icon={AlertTriangle} title="Kataloge nicht verfügbar" description={error instanceof Error ? error.message : "Bitte später erneut versuchen."} />}
      {list && list.length === 0 && <EmptyState icon={ShieldCheck} title="Noch keine Kataloge" />}
      <ul className="grid gap-3 lg:grid-cols-2">
        {(list ?? []).map((c) => (
          <li key={c.id} className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="font-semibold">{c.title}</p><p className="text-sm text-muted-foreground">{profName(c.profession_id)} · {c.code}</p></div>
              <Badge variant={c.status === "published" ? "default" : "secondary"}>{c.status === "published" ? "Veröffentlicht" : "Entwurf"}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{c.topics} Themen · {c.points} Punkte</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="min-h-11" onClick={() => void navigate({ to: "/stammdaten/unterweisungen", search: { katalog: c.id } })}><FolderOpen className="size-4" aria-hidden />Öffnen</Button>
              <Button size="sm" variant="outline" className="min-h-11" onClick={() => { setDup(c); setDupForm({ code: `${c.code}-kopie`, title: `${c.title} (Kopie)` }); }}><Copy className="size-4" aria-hidden />Duplizieren</Button>
              {c.status === "published"
                ? <Button size="sm" variant="outline" className="min-h-11" onClick={() => void act(() => setCatalogStatus(c.id, "draft"), "Katalog zurückgezogen")}><Undo2 className="size-4" aria-hidden />Zurückziehen</Button>
                : <Button size="sm" variant="outline" className="min-h-11" onClick={() => void act(() => setCatalogStatus(c.id, "published"), "Katalog veröffentlicht")}><Send className="size-4" aria-hidden />Veröffentlichen</Button>}
              <Button size="sm" variant="ghost" className="min-h-11" onClick={() => void download(c)}><Download className="size-4" aria-hidden />Als JSON exportieren</Button>
            </div>
          </li>
        ))}
      </ul>
      <CatalogImportDialog open={importOpen} onOpenChange={setImportOpen} codes={codes} onDone={() => void refresh()} />
      <ResponsiveDialog open={!!dup} onOpenChange={(o) => { if (!o) setDup(null); }} title="Katalog duplizieren">
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="dup-code">Code</Label><Input id="dup-code" value={dupForm.code} onChange={(e) => setDupForm((f) => ({ ...f, code: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label htmlFor="dup-title">Titel</Label><Input id="dup-title" value={dupForm.title} onChange={(e) => setDupForm((f) => ({ ...f, title: e.target.value }))} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="min-h-11" onClick={() => setDup(null)}>Abbrechen</Button>
            <Button className="min-h-11" onClick={() => { const c = dup!; setDup(null); void act(() => duplicateCatalog(c.id, dupForm.code, dupForm.title), "Katalog dupliziert"); }}>Duplizieren</Button>
          </div>
        </div>
      </ResponsiveDialog>
    </div>
  );
}

function CatalogImportDialog({ open, onOpenChange, codes, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; codes: string[]; onDone: () => void }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<CatalogPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const check = (t: string) => { setText(t); setPreview(t.trim() ? previewCatalogJson(t, codes) : null); };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error("Die Datei ist größer als 5 MB."); return; }
    check(await f.text());
  };
  const doImport = async () => {
    if (!preview?.data) return;
    setBusy(true);
    try { await saveCatalogJson(preview.data); toast.success("Katalog importiert"); setText(""); setPreview(null); onOpenChange(false); onDone(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Import fehlgeschlagen"); }
    finally { setBusy(false); }
  };
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="JSON importieren" description="Datei wählen oder Inhalt einfügen. Erst „Importieren“ schreibt den Katalog.">
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div className="space-y-1.5"><Label htmlFor="cimp-file">Datei</Label><Input id="cimp-file" type="file" accept="application/json,.json" onChange={(e) => void onFile(e.target.files?.[0])} /></div>
        <div className="space-y-1.5"><Label htmlFor="cimp-text">Oder einfügen</Label><Textarea id="cimp-text" rows={6} className="font-mono text-xs" value={text} onChange={(e) => check(e.target.value)} /></div>
        {preview && !preview.ok && <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{preview.error}</p>}
        {preview?.ok && preview.data && (
          <div className="space-y-2 rounded-xl border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{preview.data.catalog.title} <span className="text-muted-foreground">({preview.data.catalog.code})</span></p>
            <p className="text-muted-foreground">{preview.counts.topics} Themen · {preview.counts.points} Punkte · {preview.counts.optional} „Je nach Betrieb“</p>
            {preview.warnings.map((w) => <p key={w} className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />{w}</p>)}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button className="min-h-11" onClick={() => void doImport()} disabled={!preview?.ok || busy}>Importieren</Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

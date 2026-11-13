import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, ClipboardCheck, FileDown, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CardSkeleton, EmptyState, PageHeader, StatCard } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { listViewablePersons } from "@/features/plan/api";
import { buildInstructionPdf, instructionFileName } from "@/features/export/pdf/instructions";
import { dateDe } from "@/features/export/pdf/text";
import { readDeviceString, saveFile, writeDeviceString } from "@/lib/platform";
import { useOnline } from "@/lib/sync/status";
import { OFFLINE_MESSAGE, READ_ONLY_TOAST, canReviewFor, listPendingInstructions, loadInstructionData, logInstructionExport, type InstructionRecord } from "../api";
import { berlinToday, type DueState } from "../due";
import { buildInstructionInput, getHeader, type InstructionExportFilter } from "../export";
import { STATE_FILTER, buildViews, kpisFor } from "../model";
import { DetailDialog } from "./detail-dialog";
import { RecordDialog, type RecordDialogInit } from "./record-dialog";
import { CatalogTab, LegendTab, OverviewTab, RecordsTab } from "./tabs";

const STATE_PREF = "azuvera-instructions-state";

export interface InstructionsSearch { azubi?: string | undefined; neu?: string | undefined; thema?: string | undefined; nachweis?: string | undefined }

export function InstructionsPage({ search }: { search: InstructionsSearch }) {
  const { data: me } = useMyProfile();
  const isAzubi = me?.role === "azubi";
  const online = useOnline();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const today = berlinToday();
  const azubiId = me ? (isAzubi ? me.id : search.azubi ?? null) : null;

  const { data: persons = [] } = useQuery({ queryKey: ["instructions", "persons"], queryFn: listViewablePersons, enabled: !!me && !isAzubi });
  const { data, isLoading, error } = useQuery({ queryKey: ["instructions", "data", azubiId], queryFn: () => loadInstructionData(azubiId!), enabled: !!azubiId });
  const { data: canReview = false } = useQuery({ queryKey: ["instructions", "can-review", azubiId], queryFn: () => canReviewFor(azubiId!), enabled: !!azubiId && !isAzubi && online });
  const { data: pending = [] } = useQuery({ queryKey: ["instructions", "pending"], queryFn: listPendingInstructions, enabled: !!me && !isAzubi && !azubiId });

  const [dialog, setDialog] = useState<RecordDialogInit | null>(null);
  const [detail, setDetail] = useState<InstructionRecord | null>(null);
  const [tab, setTab] = useState("uebersicht");
  const [filter, setFilter] = useState<InstructionExportFilter>(() => {
    let state: DueState | "all" = "all";
    try { const s = readDeviceString(STATE_PREF); if (s && STATE_FILTER.some((x) => x.value === s)) state = s as DueState | "all"; } catch { /* ignorieren */ }
    return { catalogId: "all", state, from: null, to: null, onlyConfirmed: true, withOverview: true };
  });
  useEffect(() => { try { writeDeviceString(STATE_PREF, filter.state); } catch { /* ignorieren */ } }, [filter.state]);
  const [exporting, setExporting] = useState(false);

  const views = useMemo(() => (data ? buildViews(data, today) : []), [data, today]);
  const kpis = kpisFor(views);

  // ?neu=1, ?thema=<id>, ?nachweis=<id> öffnen die Dialoge direkt
  useEffect(() => {
    if (!data) return;
    if (data.own && (search.neu === "1" || search.thema)) setDialog({ topicId: search.thema ?? null });
    if (search.nachweis) { const r = data.records.find((x) => x.id === search.nachweis); if (r) setDetail(r); }
  }, [data, search.neu, search.thema, search.nachweis]);

  const refresh = () => { void qc.invalidateQueries({ queryKey: ["instructions"] }); };
  const readOnly = () => toast.info(READ_ONLY_TOAST);
  const add = (topicId?: string | null) => { if (!data?.own) { readOnly(); return; } setDialog({ topicId: topicId ?? null }); };

  const exportPdf = async () => {
    if (!data) return;
    if (!online) { toast.error(OFFLINE_MESSAGE); return; }
    setExporting(true);
    try {
      const header = await getHeader(data.person.id);
      const inp = buildInstructionInput(data, header, filter, today);
      const bytes = await buildInstructionPdf(inp);
      saveFile(new Blob([bytes as BlobPart], { type: "application/pdf" }), instructionFileName(header));
      await logInstructionExport(data.person.id, inp.records.length, filter.from, filter.to);
      toast.success("PDF erstellt");
    } catch { toast.error("Export fehlgeschlagen"); }
    finally { setExporting(false); }
  };

  if (!me) return <div className="space-y-4"><CardSkeleton /><CardSkeleton /></div>;

  const personSelect = !isAzubi && (
    <div className="max-w-sm space-y-1.5">
      <Label htmlFor="ins-person">Person wählen</Label>
      <Select value={azubiId ?? ""} onValueChange={(v) => void navigate({ to: "/unterweisungen", search: { azubi: v }, replace: true })}>
        <SelectTrigger id="ins-person"><SelectValue placeholder="Person wählen" /></SelectTrigger>
        <SelectContent>{persons.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
  const exportButton = (
    <Button variant="outline" className="min-h-11" disabled={!data || !online || exporting} title={online ? undefined : OFFLINE_MESSAGE} onClick={() => void exportPdf()}>
      <FileDown className="size-4" aria-hidden />PDF exportieren
    </Button>
  );
  const header = <PageHeader title="Unterweisungen" subtitle="Sicherheits- und Fachunterweisungen für deinen Beruf" actions={azubiId ? exportButton : undefined} />;

  if (!azubiId) {
    return (
      <div className="space-y-6">
        {header}
        {personSelect}
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Zu bestätigen</h2>
          {pending.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nichts zu bestätigen.</p> : (
            <ul className="mt-3 divide-y">
              {pending.map((p) => (
                <li key={p.record_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="font-medium">{p.title}</p><p className="text-sm text-muted-foreground">{p.azubi_name} · {dateDe(p.given_on)}</p></div>
                  <Button asChild variant="outline" className="min-h-11"><Link to="/unterweisungen" search={{ azubi: p.azubi_id, nachweis: p.record_id }}>Öffnen</Link></Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  if (isLoading || !data) {
    if (error) return <div className="space-y-6">{header}{personSelect}<EmptyState icon={CircleAlert} title="Unterweisungen nicht verfügbar" description={error instanceof Error ? error.message : "Bitte später erneut versuchen."} /></div>;
    return <div className="space-y-4">{header}<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton /></div></div>;
  }

  const p = data.person;
  const isAzubiPerson = (p.role ?? "azubi") === "azubi";
  return (
    <div className="space-y-6">
      {header}
      {personSelect}
      {!p.profession_id && (
        <div className="flex gap-3 rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>Für diese Person ist noch kein Ausbildungsberuf hinterlegt. {data.own && <Link to="/profil" className="font-medium underline underline-offset-4">Zu Mein Profil</Link>}</p>
        </div>
      )}
      {isAzubiPerson && !p.geburtsdatum && (
        <div className="flex gap-3 rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>Trage dein Geburtsdatum im Profil ein, damit die Fristen für Jugendliche unter 18 stimmen. {data.own && <Link to="/profil" className="font-medium underline underline-offset-4">Zu Mein Profil</Link>}</p>
        </div>
      )}
      {data.catalogs.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Für deinen Beruf ist noch kein Unterweisungskatalog hinterlegt." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Unterwiesen" value={`${kpis.done}/${kpis.total}`} hint={`${kpis.percent} %`} />
            <StatCard label="Noch offen" value={kpis.open} hint="Pflichtthemen ohne Nachweis" />
            <StatCard label="Bald fällig" value={kpis.dueSoon} hint="in den nächsten 14 Tagen" />
            <StatCard label="Überfällig" value={kpis.overdue} hint="Wiederholung nötig" />
          </div>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-auto w-full justify-start overflow-x-auto">
              <TabsTrigger value="uebersicht">Übersicht</TabsTrigger>
              <TabsTrigger value="katalog">Katalog</TabsTrigger>
              <TabsTrigger value="nachweise">Nachweise</TabsTrigger>
              <TabsTrigger value="legende">Legende</TabsTrigger>
              <TabsTrigger value="filter">Filter & Export</TabsTrigger>
            </TabsList>
            <TabsContent value="uebersicht" className="mt-4"><OverviewTab views={views} records={data.records} isAzubi={data.own} onAdd={add} /></TabsContent>
            <TabsContent value="katalog" className="mt-4"><CatalogTab data={data} views={views} today={today} isAzubi={data.own} onAdd={add} /></TabsContent>
            <TabsContent value="nachweise" className="mt-4"><RecordsTab records={data.records} isAzubi={data.own} onOpen={setDetail} onAdd={() => add()} /></TabsContent>
            <TabsContent value="legende" className="mt-4"><LegendTab /></TabsContent>
            <TabsContent value="filter" className="mt-4">
              <section className="max-w-3xl space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ex-cat">Katalog</Label>
                    <Select value={filter.catalogId} onValueChange={(v) => setFilter((f) => ({ ...f, catalogId: v }))}>
                      <SelectTrigger id="ex-cat"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="all">Alle Kataloge</SelectItem>{data.catalogs.map((c) => <SelectItem key={c.catalog.id} value={c.catalog.id}>{c.catalog.title}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ex-state">Zustand</Label>
                    <Select value={filter.state} onValueChange={(v) => setFilter((f) => ({ ...f, state: v as DueState | "all" }))}>
                      <SelectTrigger id="ex-state"><SelectValue /></SelectTrigger>
                      <SelectContent>{STATE_FILTER.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label htmlFor="ex-from">Von</Label><Input id="ex-from" type="date" value={filter.from ?? ""} onChange={(e) => setFilter((f) => ({ ...f, from: e.target.value || null }))} /></div>
                  <div className="space-y-1.5"><Label htmlFor="ex-to">Bis</Label><Input id="ex-to" type="date" value={filter.to ?? ""} onChange={(e) => setFilter((f) => ({ ...f, to: e.target.value || null }))} /></div>
                </div>
                <p className="text-xs text-muted-foreground">Zeitraum leer = gesamte Ausbildung.</p>
                <label className="flex min-h-11 items-center justify-between gap-3"><span className="text-sm">Nur bestätigte Nachweise</span><Switch checked={filter.onlyConfirmed} onCheckedChange={(v) => setFilter((f) => ({ ...f, onlyConfirmed: v }))} /></label>
                <label className="flex min-h-11 items-center justify-between gap-3"><span className="text-sm">Themenübersicht beifügen</span><Switch checked={filter.withOverview} onCheckedChange={(v) => setFilter((f) => ({ ...f, withOverview: v }))} /></label>
                <div className="flex justify-end">{exportButton}</div>
                {!online && <p className="text-right text-xs text-muted-foreground">{OFFLINE_MESSAGE}</p>}
              </section>
            </TabsContent>
          </Tabs>
        </>
      )}
      {dialog && <RecordDialog open={!!dialog} onOpenChange={(o) => { if (!o) setDialog(null); }} data={data} init={dialog} onSaved={refresh} />}
      <DetailDialog record={detail} data={data} canReview={canReview} onOpenChange={(o) => { if (!o) setDetail(null); }}
        onEdit={(r) => { setDetail(null); setDialog({ record: r }); }} onChanged={refresh} />
    </div>
  );
}

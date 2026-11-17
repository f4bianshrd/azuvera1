import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck, CalendarCheck2, CheckCircle2, CircleAlert, FileDown, FileText, Loader2, NotebookTabs } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CardSkeleton, EmptyState, PageHeader, StatCard } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { useProfessions } from "@/features/app/queries";
import { useOnline } from "@/lib/sync/status";
import { saveFile } from "@/lib/platform";
import { OFFLINE_MESSAGE, listTopics, listViewablePersons, loadPlanData, logPlanExport, setAzubiPlan, setProgress, type PlanData } from "../api";
import { buildCells, computeKpis, personTrainingYears, selectCells, selectTopics, slugify, type Selection } from "../stats";
import { kpiCards, buildModel } from "../export/model";
import { BRAND } from "../export/color";
import { layoutFor, loadLastSettings, resolveBranding, saveLastSettings, type PlanSettings } from "../prefs";
import { CalendarTab } from "./calendar";
import { DrillDownDialog, type DrillState } from "./drilldown";
import { FilterTab } from "./filter-tab";
import { Overview } from "./overview";
import { PlanSections } from "./plan-sections";
import { TopicsTab } from "./topics-tab";
import { READ_ONLY_TOAST } from "./year-cell";

export function PlanPage({ azubiParam }: { azubiParam: string | undefined }) {
  const { data: me } = useMyProfile();
  const isAzubi = me?.role === "azubi";
  const isLeitung = me?.role === "ausbildungsleitung" || !!me?.is_team;
  const navigate = useNavigate();
  const [settings, setSettings] = useState<PlanSettings>(() => loadLastSettings());
  useEffect(() => { saveLastSettings(settings); }, [settings]);
  useEffect(() => { if (azubiParam && azubiParam !== settings.azubiId) setSettings((s) => ({ ...s, azubiId: azubiParam })); }, [azubiParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const azubiId = me ? (isAzubi ? me.id : settings.azubiId) : null;
  const { data: persons = [] } = useQuery({ queryKey: ["plan", "persons"], queryFn: listViewablePersons, enabled: !!me && !isAzubi });
  const { data: professions = [] } = useProfessions();
  const { data, isLoading, error } = useQuery({ queryKey: ["plan", "data", azubiId], queryFn: () => loadPlanData(azubiId!), enabled: !!azubiId });
  const topicProfession = data?.azubi.profession_id ?? settings.professionId;
  const { data: extraTopics = [] } = useQuery({ queryKey: ["plan", "topics", topicProfession], queryFn: () => listTopics(topicProfession!), enabled: !!topicProfession && !data && isLeitung });

  const changeSettings = (s: PlanSettings) => {
    setSettings(s);
    if (!isAzubi && s.azubiId !== settings.azubiId) void navigate({ to: "/ausbildungsplan", search: s.azubiId ? { azubi: s.azubiId } : {}, replace: true });
  };

  const filterTab = (duration: number) => (
    <FilterTab settings={settings} onChange={changeSettings} isAzubi={isAzubi} professions={professions} persons={persons}
      ownProfessionId={isAzubi ? me?.profession_id ?? null : null} duration={duration}
      company={{ name: data?.azubi.company_name ?? null, address: data?.azubi.company_address ?? null }} />
  );

  if (!me) return <div className="space-y-4"><CardSkeleton /><CardSkeleton /></div>;

  // Nicht-Azubis ohne gewählte Person: nur Filter und (Leitung) Themen
  if (!isAzubi && !azubiId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ausbildungsplan" subtitle="Wähle unter „Filter & Konfiguration“ eine Person." />
        <Tabs defaultValue="filter">
          <TabsList className="h-auto w-full justify-start overflow-x-auto">
            <TabsTrigger value="filter">Filter & Konfiguration</TabsTrigger>
            {isLeitung && settings.professionId && <TabsTrigger value="themen">Themen</TabsTrigger>}
          </TabsList>
          <TabsContent value="filter" className="mt-4">{filterTab(4)}</TabsContent>
          {isLeitung && settings.professionId && (
            <TabsContent value="themen" className="mt-4"><TopicsTab topics={extraTopics} professionId={settings.professionId} canEdit linksByTopic={new Map()} reports={[]} /></TabsContent>
          )}
        </Tabs>
      </div>
    );
  }

  if (isLoading || !data) {
    if (error) return <EmptyState icon={CircleAlert} title="Ausbildungsplan nicht verfügbar" description={error instanceof Error ? error.message : "Bitte später erneut versuchen."} />;
    return <div className="space-y-4"><PageHeader title="Ausbildungsplan" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton /></div></div>;
  }

  return <PlanView data={data} settings={settings} isAzubi={isAzubi} isLeitung={isLeitung} filterTab={filterTab} />;
}

function PlanView({ data, settings, isAzubi, isLeitung, filterTab }: {
  data: PlanData; settings: PlanSettings; isAzubi: boolean; isLeitung: boolean; filterTab: (duration: number) => React.ReactNode;
}) {
  const qc = useQueryClient();
  const online = useOnline();
  const [drill, setDrill] = useState<DrillState | null>(null);
  const [tab, setTab] = useState("uebersicht");
  const [exporting, setExporting] = useState<"pdf" | "odt" | null>(null);
  const tree = data.tree;
  const readOnly = !data.own;
  const sel: Selection = { years: settings.years.filter((y) => !tree || y <= tree.plan.duration_years), status: settings.status, search: settings.search };

  const visibleReports = useMemo(() => new Set(data.reports.map((r) => r.id)), [data.reports]);
  const linkedTopics = useMemo(() => new Set(data.topicLinks.filter((l) => visibleReports.has(l.report_id)).map((l) => l.topic_id)), [data.topicLinks, visibleReports]);
  const linkedItems = useMemo(() => new Set(data.itemLinks.filter((l) => visibleReports.has(l.report_id)).map((l) => l.item_id)), [data.itemLinks, visibleReports]);
  const linksByTopic = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of data.topicLinks) if (visibleReports.has(l.report_id)) m.set(l.topic_id, [...(m.get(l.topic_id) ?? []), l.report_id]);
    return m;
  }, [data.topicLinks, visibleReports]);
  const allCells = useMemo(() => (tree ? buildCells(tree, data.progress) : []), [tree, data.progress]);
  const cells = useMemo(() => selectCells(allCells, sel), [allCells, sel.years.join(), sel.status, sel.search]); // eslint-disable-line react-hooks/exhaustive-deps
  const topics = useMemo(() => selectTopics(data.topics, sel), [data.topics, sel.years.join(), sel.search]); // eslint-disable-line react-hooks/exhaustive-deps
  const kpis = computeKpis(cells, topics, linkedTopics, linkedItems);
  const hasProgress = data.progress.some((p) => p.planned || p.mastered);

  const onChange = async (itemId: string, year: number, patch: { planned?: boolean; mastered?: "" | "yes" | "no" }) => {
    if (readOnly) { toast.info(READ_ONLY_TOAST); return; }
    await setProgress(itemId, year, patch);
    await qc.invalidateQueries({ queryKey: ["plan", "data", data.azubi.id] });
  };

  const choosePlan = async (planId: string) => {
    try {
      await setAzubiPlan(data.azubi.id, planId === "__auto" ? null : planId);
      toast.success("Ausbildungsplan gespeichert");
      await qc.invalidateQueries({ queryKey: ["plan"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen"); }
  };

  const canChoose = isLeitung || (isAzubi && data.own && !hasProgress);
  const planPicker = data.selectable.length > 1 || (!data.planId && data.selectable.length > 0) ? (
    <div className="space-y-1.5 sm:max-w-sm">
      <Label>Ausbildungsplan</Label>
      <Select value={data.planId ?? ""} disabled={!canChoose || !online} onValueChange={choosePlan}>
        <SelectTrigger><SelectValue placeholder="Plan wählen" /></SelectTrigger>
        <SelectContent>
          {isLeitung && <SelectItem value="__auto">— automatisch —</SelectItem>}
          {data.selectable.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
        </SelectContent>
      </Select>
      {!online && <p className="text-xs text-muted-foreground">{OFFLINE_MESSAGE}</p>}
      {online && isAzubi && hasProgress && <p className="text-xs text-muted-foreground">Du hast schon Fortschritt gespeichert. Den Plan kann jetzt nur die Ausbildungsleitung ändern.</p>}
    </div>
  ) : null;

  const subtitle = tree ? [tree.plan.title, tree.plan.source].filter(Boolean).join(" · ") : data.own ? undefined : data.azubi.full_name;

  // Leere Zustände
  let empty: React.ReactNode = null;
  if (!data.azubi.profession_id) {
    empty = data.own
      ? <EmptyState icon={NotebookTabs} title="Kein Ausbildungsberuf hinterlegt" description="Trage zuerst deinen Ausbildungsberuf ein, damit dein Ausbildungsplan erscheint." action={<Button asChild><Link to="/profil">Mein Profil</Link></Button>} />
      : <EmptyState icon={NotebookTabs} title="Kein Ausbildungsberuf hinterlegt" description="Für diese Person ist noch kein Ausbildungsberuf eingetragen." />;
  } else if (!tree && data.selectable.length === 0) {
    empty = <EmptyState icon={NotebookTabs} title="Noch kein Ausbildungsplan zugeordnet" description="Für deinen Beruf ist noch kein Ausbildungsplan hinterlegt. Das Azuvera-Team legt Pläne an." />;
  } else if (!tree) {
    empty = <EmptyState icon={NotebookTabs} title="Noch kein Ausbildungsplan zugeordnet" description="Wähle deinen Plan, damit du Inhalte planen und abhaken kannst." action={planPicker} />;
  }

  if (empty) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ausbildungsplan" {...(subtitle ? { subtitle } : {})} />
        {empty}
        {!isAzubi && <Tabs defaultValue="filter"><TabsList><TabsTrigger value="filter">Filter & Konfiguration</TabsTrigger></TabsList><TabsContent value="filter" className="mt-4">{filterTab(4)}</TabsContent></Tabs>}
      </div>
    );
  }

  const t = tree!;
  const duration = t.plan.duration_years;
  const allYears = Array.from({ length: duration }, (_, i) => i + 1);
  const years = sel.years.length ? [...sel.years].sort() : allYears;
  const checklists = t.sections.filter((s) => s.kind === "checklist");
  const checklistTitle = checklists.length === 1 ? checklists[0]!.title : "Betriebszweige";
  const personYears = personTrainingYears(data.azubi.ausbildungsbeginn, data.azubi.ausbildungsende, duration).filter((y) => years.includes(y.year));
  const cards = kpiCards(kpis);
  const icons = [BookOpenCheck, CalendarCheck2, CheckCircle2, CircleAlert];

  const doExport = async (kind: "pdf" | "odt") => {
    setExporting(kind);
    try {
      const template = settings.template;
      const model = buildModel({
        data, cells, contentCells: allCells, kpis, sel, template, layout: layoutFor(settings), topics, linkedTopics,
        branding: resolveBranding(template, { name: data.azubi.company_name, address: data.azubi.company_address }),
        colors: { primary: "", accent: "", success: BRAND.success, destructive: BRAND.destructive, warning: BRAND.warning, muted: BRAND.muted },
      });
      Object.assign(model.charts, buildModel({
        data, cells, contentCells: allCells, kpis, sel, template, layout: model.layout, topics, linkedTopics, branding: model.branding,
        colors: { primary: model.branding.primary, accent: model.branding.accent, success: BRAND.success, destructive: BRAND.destructive, warning: BRAND.warning, muted: BRAND.muted },
      }).charts);
      const name = `ausbildungsplan-${slugify(data.azubi.full_name)}`;
      if (kind === "pdf") {
        const { buildPlanPdf } = await import("../export/pdf");
        const bytes = await buildPlanPdf(model);
        saveFile(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${name}.pdf`);
        toast.success("PDF erstellt");
      } else {
        const { buildPlanOdt } = await import("../export/odt");
        const bytes = buildPlanOdt(model);
        saveFile(new Blob([bytes as BlobPart], { type: "application/vnd.oasis.opendocument.text" }), `${name}.odt`);
        toast.success("ODT erstellt");
      }
      void logPlanExport(data.azubi.id, kind === "pdf" ? "plan_pdf" : "plan_odt").catch(() => undefined);
    } catch {
      toast.error("Export fehlgeschlagen");
    } finally { setExporting(null); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ausbildungsplan"
        {...(subtitle ? { subtitle } : {})}
        actions={<>
          <Button variant="outline" onClick={() => doExport("pdf")} disabled={!!exporting}>{exporting === "pdf" ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" aria-hidden />} PDF exportieren</Button>
          <Button variant="outline" onClick={() => doExport("odt")} disabled={!!exporting}>{exporting === "odt" ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" aria-hidden />} ODT exportieren</Button>
        </>}
      />
      {!data.own && <p className="rounded-xl border bg-muted/50 px-4 py-2 text-sm text-muted-foreground">Nur-Lese-Ansicht für <span className="font-medium text-foreground">{data.azubi.full_name}</span>.</p>}
      {planPicker}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => <StatCard key={c.label} label={c.label} value={c.value} hint={c.hint} icon={icons[i]!} />)}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList className="h-auto w-max min-w-full justify-start sm:w-auto sm:min-w-0 sm:flex-wrap">
            <TabsTrigger value="uebersicht">Übersicht</TabsTrigger>
            <TabsTrigger value="plan">Plan</TabsTrigger>
            <TabsTrigger value="kalender">Kalender</TabsTrigger>
            <TabsTrigger value="themen">Themen</TabsTrigger>
            {checklists.length > 0 && <TabsTrigger value="zweige">{checklistTitle}</TabsTrigger>}
            <TabsTrigger value="legende">Legende</TabsTrigger>
            <TabsTrigger value="filter">Filter & Konfiguration</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="uebersicht" className="mt-4">
          <Overview cells={cells} topics={topics} linkedTopics={linkedTopics} kpis={kpis} allYears={allYears} years={years} onDrill={setDrill} />
        </TabsContent>
        <TabsContent value="plan" className="mt-4">
          <PlanSections tree={t} progress={data.progress} kind="content" sel={sel} readOnly={readOnly} onChange={onChange} />
        </TabsContent>
        <TabsContent value="kalender" className="mt-4">
          <CalendarTab years={personYears} reports={data.reports} cells={cells} own={data.own} onDrill={setDrill} />
        </TabsContent>
        <TabsContent value="themen" className="mt-4">
          <TopicsTab topics={topics} professionId={data.azubi.profession_id} canEdit={isLeitung} linksByTopic={linksByTopic} reports={data.reports} />
        </TabsContent>
        {checklists.length > 0 && (
          <TabsContent value="zweige" className="mt-4">
            <PlanSections tree={t} progress={data.progress} kind="checklist" sel={sel} readOnly={readOnly} onChange={onChange} />
          </TabsContent>
        )}
        <TabsContent value="legende" className="mt-4">
          <section className="max-w-2xl space-y-3 rounded-2xl border bg-card p-5 text-sm shadow-sm">
            <p>Pro Ausbildungsjahr kannst du für jede Fertigkeit festlegen:</p>
            <ul className="space-y-1.5">
              <li>Kästchen – Inhalt soll in diesem Jahr vermittelt werden.</li>
              <li><span className="font-semibold text-success">✓ Ja</span> – Wird beherrscht.</li>
              <li><span className="font-semibold text-destructive">– Nein</span> – Noch nicht ausreichend beherrscht.</li>
            </ul>
            <p className="text-muted-foreground">Die Einstellungen unter ‚Filter & Konfiguration‘ wirken auf Diagramme, Listen, Kalender und Export. Der Export erzeugt ein PDF (mit Diagrammen) oder eine ODT-Datei für Word/LibreOffice.</p>
            <p className="text-muted-foreground">Änderungen werden automatisch gespeichert. Deine Ausbilder:in und weitere eingeladene Personen sehen deinen Fortschritt.</p>
          </section>
        </TabsContent>
        <TabsContent value="filter" className="mt-4">{filterTab(duration)}</TabsContent>
      </Tabs>
      <DrillDownDialog state={drill} onClose={() => setDrill(null)} />
    </div>
  );
}

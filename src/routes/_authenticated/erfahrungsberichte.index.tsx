import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, NotebookPen, Paperclip, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ListSkeleton, PageHeader, StatusBadge } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { SyncBadge } from "@/features/sync/sync-badge";
import type { ReportStatus } from "@/features/reports/api";
import { getAzubiHeader, listExperienceFor, listExperienceMetrics, listVisibleAzubis, type ExperienceKind } from "@/features/experience/api";
import { dateDe, KIND_LABELS, KINDS } from "@/features/experience/model";
import { ExperienceProgressCard, useExperienceProgress } from "@/features/experience/components/progress-card";
import { ExperienceExportButton } from "@/features/experience/components/export-button";

const TITLE = "Erfahrungsberichte – Azuvera";
const DESCRIPTION = "Fortschritt je Lehrjahr und alle Erfahrungsberichte auf einen Blick.";

export const Route = createFileRoute("/_authenticated/erfahrungsberichte/")({
  validateSearch: (search: Record<string, unknown>): { azubi?: string | undefined } => ({
    azubi: typeof search["azubi"] === "string" ? (search["azubi"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "robots", content: "noindex" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExperiencePage,
});

const STATUS_OPTIONS: { value: ReportStatus; label: string }[] = [
  { value: "draft", label: "Entwurf" }, { value: "submitted", label: "Eingereicht" }, { value: "approved", label: "Freigegeben" }, { value: "rejected", label: "Zurückgewiesen" },
];

function ExperiencePage() {
  const { azubi } = Route.useSearch();
  const navigate = useNavigate();
  const { data: profile } = useMyProfile();
  const isAzubi = profile?.role === "azubi";
  const azubiId = isAzubi ? profile?.id : azubi;
  const { data: header } = useQuery({ queryKey: ["experience", "azubi", azubiId], queryFn: () => getAzubiHeader(azubiId!), enabled: !!azubiId && !isAzubi });
  const { data: people } = useQuery({ queryKey: ["experience", "visible-azubis"], queryFn: listVisibleAzubis, enabled: !!profile && !isAzubi });

  if (!profile) return <ListSkeleton />;
  return <div className="space-y-5">
    <PageHeader title="Erfahrungsberichte"
      subtitle={isAzubi ? "Dein Fortschritt und alle deine Berichte auf einen Blick." : header ? `Fortschritt und Berichte von ${header.name}.` : "Wähle eine Person, um Fortschritt und Berichte zu sehen."}
      actions={<div className="flex flex-wrap gap-2">
        {azubiId && <ExperienceExportButton azubiId={azubiId} />}
        {isAzubi && <Button asChild><Link to="/erfahrungsberichte/new"><Plus className="size-4" aria-hidden />Neuer Erfahrungsbericht</Link></Button>}
      </div>} />
    {!isAzubi && <div className="max-w-sm">
      <Select value={azubi ?? ""} onValueChange={(v) => void navigate({ to: "/erfahrungsberichte", search: { azubi: v } })}>
        <SelectTrigger aria-label="Azubi auswählen" className="h-11"><SelectValue placeholder="Azubi auswählen" /></SelectTrigger>
        <SelectContent>{(people ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.profession ? ` · ${p.profession}` : ""}</SelectItem>)}</SelectContent>
      </Select>
    </div>}
    {azubiId ? <>
      <ExperienceProgressCard azubiId={azubiId} />
      <ExperienceList azubiId={azubiId} isAzubi={isAzubi} />
    </> : <EmptyState icon={NotebookPen} title="Keine Person ausgewählt" description="Wähle oben eine Azubi-Person aus." />}
  </div>;
}

function ExperienceList({ azubiId, isAzubi }: { azubiId: string; isAzubi: boolean }) {
  const [year, setYear] = useState("all");
  const [status, setStatus] = useState<ReportStatus | "all">("all");
  const [kind, setKind] = useState<ExperienceKind | "all">("all");
  const [search, setSearch] = useState("");
  const { data: reports, isLoading } = useQuery({ queryKey: ["experience", "list", azubiId], queryFn: () => listExperienceFor(azubiId) });
  const { data: progress } = useExperienceProgress(azubiId);
  const ids = (reports ?? []).map((r) => r.id);
  const { data: metrics } = useQuery({ queryKey: ["experience", "metrics", azubiId, ids.join(",")], queryFn: () => listExperienceMetrics(ids, azubiId), enabled: ids.length > 0 });

  const years = progress?.progress.years.map((y) => y.year) ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (reports ?? [])
      .filter((r) => isAzubi || r.status !== "draft")
      .filter((r) => status === "all" || r.status === status)
      .filter((r) => kind === "all" || r.kind === kind)
      .filter((r) => year === "all" || progress?.yearOf(r.written_on) === Number(year))
      .filter((r) => !q || r.title.toLowerCase().includes(q) || r.area.toLowerCase().includes(q))
      .sort((a, b) => b.written_on.localeCompare(a.written_on));
  }, [reports, status, kind, year, search, isAzubi, progress]);

  const yearLabel = (d: string) => { const y = progress?.yearOf(d); return y ? `${y}. Lehrjahr` : "—"; };

  return <section className="space-y-3">
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Select value={year} onValueChange={setYear}><SelectTrigger aria-label="Lehrjahr" className="h-11"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">Alle</SelectItem>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}. Lehrjahr</SelectItem>)}</SelectContent></Select>
      <Select value={status} onValueChange={(v) => setStatus(v as ReportStatus | "all")}><SelectTrigger aria-label="Status" className="h-11"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">Alle</SelectItem>{STATUS_OPTIONS.filter((o) => isAzubi || o.value !== "draft").map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>
      <Select value={kind} onValueChange={(v) => setKind(v as ExperienceKind | "all")}><SelectTrigger aria-label="Art" className="h-11"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">Alle</SelectItem>{KINDS.map((k) => <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>)}</SelectContent></Select>
      <Input aria-label="Suche" placeholder="Titel oder Bereich suchen" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11" />
    </div>

    {isLoading ? <ListSkeleton /> : filtered.length === 0 ? (
      (reports ?? []).filter((r) => isAzubi || r.status !== "draft").length === 0
        ? <EmptyState icon={NotebookPen} title={isAzubi ? "Noch kein Erfahrungsbericht. Schreibe deinen ersten – du kannst auch diktieren." : "Noch keine Erfahrungsberichte eingereicht."}
            action={isAzubi ? <Button asChild><Link to="/erfahrungsberichte/new"><Plus className="size-4" aria-hidden />Neuer Erfahrungsbericht</Link></Button> : undefined} />
        : <p className="py-6 text-center text-sm text-muted-foreground">Keine Erfahrungsberichte für diese Auswahl.</p>
    ) : <>
      <ul className="space-y-2 md:hidden">
        {filtered.map((r) => { const m = metrics?.get(r.id); return <li key={r.id}>
          <Link to="/erfahrungsberichte/$id" params={{ id: r.id }} className="block rounded-xl border bg-card p-4 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
            <div className="flex items-start justify-between gap-2"><p className="min-w-0 break-words font-medium">{r.title || "Ohne Titel"}</p><StatusBadge status={r.status} /></div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="secondary">{KIND_LABELS[r.kind as ExperienceKind] ?? r.kind}</Badge>
              {r.area && <span>{r.area}</span>}<span>{dateDe(r.written_on)}</span><span>· {yearLabel(r.written_on)}</span>
              <SyncBadge state={r._sync} submitPending={r._submit_pending} />
            </div>
            <div className="mt-2 flex gap-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><Paperclip className="size-3.5" aria-hidden />{m?.attachments ?? 0} Anhänge</span><span className="inline-flex items-center gap-1"><MessageSquare className="size-3.5" aria-hidden />{m?.comments ?? 0} Kommentare</span></div>
          </Link></li>; })}
      </ul>
      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr>
            <th className="p-3 font-medium">Titel</th><th className="p-3 font-medium">Art</th><th className="p-3 font-medium">Bereich</th><th className="p-3 font-medium">Datum</th><th className="p-3 font-medium">Lehrjahr</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium">Anhänge</th><th className="p-3 font-medium">Kommentare</th>
          </tr></thead>
          <tbody>{filtered.map((r) => { const m = metrics?.get(r.id); return <tr key={r.id} className="relative border-t hover:bg-accent/50">
            <td className="p-3 font-medium"><Link to="/erfahrungsberichte/$id" params={{ id: r.id }} className="after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-ring">{r.title || "Ohne Titel"}</Link></td>
            <td className="p-3"><Badge variant="secondary">{KIND_LABELS[r.kind as ExperienceKind] ?? r.kind}</Badge></td>
            <td className="p-3 text-muted-foreground">{r.area || "—"}</td>
            <td className="p-3 tabular-nums">{dateDe(r.written_on)}</td>
            <td className="p-3">{yearLabel(r.written_on)}</td>
            <td className="p-3"><div className="flex items-center gap-1.5"><StatusBadge status={r.status} /><SyncBadge state={r._sync} submitPending={r._submit_pending} /></div></td>
            <td className="p-3 text-muted-foreground">{m?.attachments ?? 0} Anhänge</td>
            <td className="p-3 text-muted-foreground">{m?.comments ?? 0} Kommentare</td>
          </tr>; })}</tbody>
        </table>
      </div>
    </>}
  </section>;
}

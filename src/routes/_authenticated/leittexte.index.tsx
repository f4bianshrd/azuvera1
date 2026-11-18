import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpenCheck, ChevronRight, ClipboardCheck, Eye, Loader2, PencilLine, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ListSkeleton, PageHeader, StatusBadge } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { listVisibleAzubis } from "@/features/experience/api";
import { getReviewQueue, listCatalog, listMyWorks, listWorksFor, myProfessionCode, startWork, type Leittext, type Work } from "@/features/leittexte/api";
import { PROFESSION_LABEL, progress, STATUS_LABEL } from "@/features/leittexte/model";
import { cn } from "@/lib/utils";

const TITLE = "Leittexte – Azuvera";
const DESCRIPTION = "Leittexte für deinen Ausbildungsberuf direkt in der App bearbeiten, speichern und einreichen.";

export const Route = createFileRoute("/_authenticated/leittexte/")({
  validateSearch: (s: Record<string, unknown>): { azubi?: string | undefined } => ({ azubi: typeof s["azubi"] === "string" ? (s["azubi"] as string) : undefined }),
  head: () => ({
    meta: [
      { title: TITLE }, { name: "robots", content: "noindex" }, { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE }, { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LeittextePage,
});

type StatusFilter = "all" | "none" | "draft" | "submitted" | "approved" | "rejected";

function LeittextePage() {
  const { data: me } = useMyProfile();
  const isAzubi = me?.role === "azubi";
  const search = Route.useSearch();
  const catalog = useQuery({ queryKey: ["leittexte", "catalog"], queryFn: listCatalog });
  const profession = useQuery({ queryKey: ["leittexte", "profession"], queryFn: myProfessionCode, enabled: isAzubi });
  const azubis = useQuery({ queryKey: ["leittexte", "azubis"], queryFn: listVisibleAzubis, enabled: !!me && !isAzubi });
  const azubiId = isAzubi ? me?.id : search.azubi;
  const works = useQuery({ queryKey: ["leittexte", "works", azubiId], queryFn: () => (isAzubi ? listMyWorks() : listWorksFor(azubiId!)), enabled: !!azubiId });
  const queue = useQuery({ queryKey: ["leittexte", "queue"], queryFn: getReviewQueue, enabled: !!me && !isAzubi });
  const navigate = useNavigate();

  const [q, setQ] = useState("");
  const [topic, setTopic] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [opening, setOpening] = useState<string | null>(null);
  const [prof, setProf] = useState<string>("auto");

  const effectiveProf = prof !== "auto" ? prof : isAzubi ? profession.data ?? "all" : "all";
  const byLeittext = useMemo(() => new Map((works.data ?? []).map((w) => [w.leittext_id, w])), [works.data]);
  const list = useMemo(() => (catalog.data ?? []).filter((l) => effectiveProf === "all" || l.profession_codes.includes(effectiveProf)), [catalog.data, effectiveProf]);
  const topics = useMemo(() => [...new Set(list.map((l) => l.topic).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de")), [list]);
  const filtered = list.filter((l) => {
    const w = byLeittext.get(l.id);
    if (topic !== "all" && l.topic !== topic) return false;
    if (status !== "all" && (w?.status ?? "none") !== status) return false;
    if (!azubiId || isAzubi ? false : !w) return false;
    return !q.trim() || l.title.toLowerCase().includes(q.trim().toLowerCase()) || l.topic.toLowerCase().includes(q.trim().toLowerCase());
  });
  const counts = { started: (works.data ?? []).length, approved: (works.data ?? []).filter((w) => w.status === "approved").length };

  const open = async (l: Leittext) => {
    const w = byLeittext.get(l.id);
    if (w) return navigate({ to: "/leittexte/arbeit/$workId", params: { workId: w.id } });
    if (!isAzubi) return navigate({ to: "/leittexte/vorschau/$leittextId", params: { leittextId: l.id } });
    setOpening(l.id);
    try {
      const id = await startWork(l.id, {});
      await navigate({ to: "/leittexte/arbeit/$workId", params: { workId: id } });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Konnte nicht starten."); }
    finally { setOpening(null); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Leittexte" subtitle={isAzubi ? "Bearbeite die Leittexte deines Berufs direkt hier – auch ohne Internet." : "Leittexte deiner Azubis prüfen und alle Leittexte ansehen."} />

      {!isAzubi && (queue.data?.length ?? 0) > 0 && (
        <section className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4" aria-labelledby="queue">
          <h2 id="queue" className="flex items-center gap-2 font-semibold"><ClipboardCheck className="size-4 text-primary" aria-hidden /> Zur Prüfung ({queue.data!.length})</h2>
          <ul className="mt-2 divide-y">
            {queue.data!.map((it) => (
              <li key={it.id}>
                <Link to="/leittexte/arbeit/$workId" params={{ workId: it.id }} className="flex items-center justify-between gap-3 py-2.5 hover:text-primary">
                  <span className="min-w-0"><span className="block truncate font-medium">{it.title}</span><span className="text-sm text-muted-foreground">{it.azubi_name} · eingereicht {new Date(it.submitted_at!).toLocaleDateString("de-DE")}</span></span>
                  <ChevronRight className="size-4 shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAzubi && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Verfügbar</p><p className="text-2xl font-bold">{list.length}</p></div>
          <div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Begonnen</p><p className="text-2xl font-bold">{counts.started}</p></div>
          <div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Freigegeben</p><p className="text-2xl font-bold text-primary">{counts.approved}</p></div>
        </div>
      )}
      {isAzubi && profession.isSuccess && !profession.data && prof === "auto" && (
        <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">Lege in deinem Profil deinen Ausbildungsberuf fest, dann siehst du hier nur die passenden Leittexte. Bis dahin werden alle angezeigt.</p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {!isAzubi && (
          <Select value={search.azubi ?? "none"} onValueChange={(v) => void navigate({ to: "/leittexte", search: v === "none" ? {} : { azubi: v } })}>
            <SelectTrigger className="sm:w-56" aria-label="Azubi wählen"><SelectValue placeholder="Azubi wählen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Alle Leittexte (Katalog)</SelectItem>
              {(azubis.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="relative sm:w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Leittext suchen …" className="pl-9" aria-label="Leittext suchen" />
        </div>
        <Select value={prof} onValueChange={setProf}>
          <SelectTrigger className="sm:w-48" aria-label="Beruf"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{isAzubi ? "Mein Beruf" : "Alle Berufe"}</SelectItem>
            <SelectItem value="all">Alle Berufe</SelectItem>
            <SelectItem value="landwirt">{PROFESSION_LABEL["landwirt"]}</SelectItem>
            <SelectItem value="pferdewirt">{PROFESSION_LABEL["pferdewirt"]}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={topic} onValueChange={setTopic}>
          <SelectTrigger className="sm:w-48" aria-label="Thema"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Alle Themen</SelectItem>{topics.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
        {azubiId && (
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="sm:w-48" aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Jeder Status</SelectItem>
              {(["none", "draft", "submitted", "approved", "rejected"] as const).filter((s) => isAzubi || s !== "none").map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {catalog.isLoading ? <ListSkeleton rows={6} /> : filtered.length === 0 ? (
        <EmptyState icon={BookOpenCheck} title={!isAzubi && azubiId ? "Noch keine Leittexte" : "Keine Leittexte gefunden"} description={!isAzubi && azubiId ? "Diese Person hat noch keinen Leittext eingereicht." : "Ändere die Suche oder die Filter."} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((l) => <LeittextCard key={l.id} leittext={l} work={byLeittext.get(l.id)} isAzubi={isAzubi} loading={opening === l.id} onOpen={() => void open(l)} />)}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Quelle der Leittexte: Bundesanstalt für Landwirtschaft und Ernährung (BLE), Bundesinformationszentrum Landwirtschaft – leittexte.de. Jeder Leittext verlinkt sein Original.</p>
    </div>
  );
}

function LeittextCard({ leittext, work, isAzubi, loading, onOpen }: { leittext: Leittext; work: Work | undefined; isAzubi: boolean; loading: boolean; onOpen: () => void }) {
  const p = work ? progress(leittext.content, work.answers) : null;
  const editable = isAzubi && (!work || work.status === "draft" || work.status === "rejected");
  const taskCount = leittext.content.sections.reduce((n, s) => n + s.tasks.length, 0);
  return (
    <li className={cn("flex flex-col rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md", work?.status === "approved" && "border-primary/40")}>
      <div className="flex items-start justify-between gap-2">
        <Badge variant="secondary" className="max-w-[60%] truncate">{leittext.topic || "Leittext"}</Badge>
        {work ? <StatusBadge status={work.status} /> : <span className="text-xs text-muted-foreground">{STATUS_LABEL["none"]}</span>}
      </div>
      <h3 className="mt-2 font-semibold leading-snug">{leittext.title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{leittext.profession_codes.length === 1 ? `${PROFESSION_LABEL[leittext.profession_codes[0]!] ?? ""} · ` : ""}{taskCount} Aufgaben{leittext.order_no ? ` · Nr. ${leittext.order_no}` : ""}{leittext.stand ? ` · Stand ${leittext.stand}` : ""}</p>
      {p && <div className="mt-3"><Progress value={p.percent} aria-label={`${p.percent} Prozent bearbeitet`} /><p className="mt-1 text-xs text-muted-foreground">{p.done} von {p.total} Aufgaben bearbeitet</p></div>}
      <div className="mt-auto pt-3">
        <Button size="sm" variant={editable ? "default" : "outline"} className="w-full" onClick={onOpen} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : editable ? <PencilLine className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          {editable ? (work ? "Weiter bearbeiten" : "Bearbeiten") : "Ansehen"}
        </Button>
      </div>
    </li>
  );
}

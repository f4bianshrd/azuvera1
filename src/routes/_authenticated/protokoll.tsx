import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, Download, ScrollText, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/shared";
import { ROLE_LABELS, useMyProfile, type AppRole } from "@/features/app/session";
import {
  auditNames, listAudit, listAuditForCsv, listAzubiOptions, PAGE_SIZE, verifyAuditChain, visibleReportIds,
  type AuditFilters, type ChainResult,
} from "@/features/audit/api";
import { buildAuditCsv } from "@/features/audit/csv";
import { Box } from "@/features/audit/history-card";
import { ACTION_LABELS, describeEntry, ENTITY_LABELS, formatAuditTime, referencedIds, type AuditEntry } from "@/features/audit/labels";
import { saveFile } from "@/lib/platform";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";

const TITLE = "Änderungsprotokoll – Azuvera";
const DESC = "Revisionssicher dokumentiert: wer wann was an Berichten und Nachweisen getan hat.";

export const Route = createFileRoute("/_authenticated/protokoll")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "robots", content: "noindex" },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProtokollPage,
});

const ALL = "__all__";
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ProtokollPage() {
  const { data: me } = useMyProfile();
  const online = useOnline();
  const isAzubi = me?.role === "azubi";
  const isLeitung = me?.role === "ausbildungsleitung";
  const [azubi, setAzubi] = useState<string>(ALL);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return ymd(d); });
  const [to, setTo] = useState(() => ymd(new Date()));
  const [actions, setActions] = useState<string[]>([]);
  const [entity, setEntity] = useState<string>(ALL);
  const [csvBusy, setCsvBusy] = useState(false);

  const filters: AuditFilters = useMemo(() => ({
    azubiId: isAzubi ? null : azubi === ALL ? null : azubi,
    from: from || null, to: to || null, actions, entityTypes: entity === ALL ? [] : [entity],
  }), [isAzubi, azubi, from, to, actions, entity]);

  const { data: azubis } = useQuery({ queryKey: ["audit", "azubis"], queryFn: listAzubiOptions, enabled: !!me && !isAzubi && online });

  const pages = useInfiniteQuery({
    queryKey: ["audit", "list", me?.id, filters],
    enabled: !!me && online,
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      const entries = await listAudit(filters, pageParam);
      const [names, visible] = await Promise.all([
        auditNames(referencedIds(entries)),
        visibleReportIds(entries.filter((e) => e.entity_type === "report" && e.entity_id).map((e) => e.entity_id!)),
      ]);
      return { entries, names, visible };
    },
    getNextPageParam: (last) => (last.entries.length === PAGE_SIZE ? last.entries[last.entries.length - 1]!.id : undefined),
  });
  const rows = (pages.data?.pages ?? []).flatMap((p) => p.entries.map((e) => ({ e, names: p.names, visible: p.visible })));

  const exportCsv = async () => {
    setCsvBusy(true);
    try {
      const entries = await listAuditForCsv(filters);
      const names = new Map<string, string>();
      const ids = referencedIds(entries);
      for (let i = 0; i < ids.length; i += 200) for (const [k, v] of await auditNames(ids.slice(i, i + 200))) names.set(k, v);
      const csv = buildAuditCsv(entries, names);
      saveFile(new Blob([csv], { type: "text/csv;charset=utf-8" }), `Aenderungsprotokoll_${ymd(new Date())}.csv`);
      toast.success(`${entries.length} Einträge exportiert`);
    } catch {
      toast.error("Der Export ist fehlgeschlagen.");
    } finally { setCsvBusy(false); }
  };

  if (!online) {
    return <div className="space-y-5"><PageHeader title="Änderungsprotokoll" subtitle={DESC} /><div className="rounded-xl border bg-muted/40 p-4 text-sm">{OFFLINE_ACTION_HINT}</div></div>;
  }

  const chain: string | null | undefined = isAzubi ? me?.id : azubi !== ALL ? azubi : isLeitung ? null : undefined;

  return <div className="space-y-5">
    <PageHeader title="Änderungsprotokoll" subtitle={DESC}
      actions={<Button variant="outline" disabled={csvBusy || !me} onClick={() => void exportCsv()}><Download className="size-4" aria-hidden /> {csvBusy ? "Wird erstellt …" : "Als CSV exportieren"}</Button>} />

    <section className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filter">
      {!isAzubi && <div className="space-y-1.5">
        <Label htmlFor="f-azubi">Azubi</Label>
        <Select value={azubi} onValueChange={setAzubi}>
          <SelectTrigger id="f-azubi"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Azubis</SelectItem>
            {(azubis ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name || "Ohne Namen"}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>}
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium leading-none">Zeitraum</legend>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <Input type="date" aria-label="Von" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" aria-label="Bis" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="f-action">Aktion</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button id="f-action" variant="outline" className="w-full justify-between font-normal">
              <span className="truncate">{actions.length === 0 ? "Alle Aktionen" : actions.length === 1 ? ACTION_LABELS[actions[0]!] : `${actions.length} Aktionen`}</span>
              <ChevronDown className="size-4 opacity-60" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="max-h-80 w-64 overflow-y-auto p-2" align="start">
            {actions.length > 0 && <Button variant="ghost" size="sm" className="mb-1 w-full justify-start" onClick={() => setActions([])}>Auswahl zurücksetzen</Button>}
            {Object.entries(ACTION_LABELS).map(([key, label]) => <label key={key} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-muted">
              <Checkbox checked={actions.includes(key)} onCheckedChange={(c) => setActions((prev) => c ? [...prev, key] : prev.filter((x) => x !== key))} />
              {label}
            </label>)}
          </PopoverContent>
        </Popover>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-entity">Objekt</Label>
        <Select value={entity} onValueChange={setEntity}>
          <SelectTrigger id="f-entity"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Objekte</SelectItem>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </section>

    {pages.isLoading ? <ListSkeleton rows={6} /> : pages.isError ? <p className="text-sm text-destructive">Das Protokoll konnte nicht geladen werden.</p>
      : rows.length === 0 ? <EmptyState icon={ScrollText} title="Keine Einträge für diese Auswahl." />
      : <>
        <div className="hidden overflow-x-auto rounded-2xl border bg-card md:block">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr><th className="p-3 font-medium">Zeit</th><th className="p-3 font-medium">Wer</th><th className="p-3 font-medium">Aktion</th><th className="p-3 font-medium">Objekt</th><th className="p-3 font-medium">Einzelheiten</th></tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(({ e, names, visible }) => { const d = describeEntry(e, names); return <tr key={e.id} className="align-top">
                <td className="whitespace-nowrap p-3 text-muted-foreground"><time dateTime={e.created_at}>{formatAuditTime(e.created_at)}</time></td>
                <td className="p-3"><Actor e={e} names={names} /></td>
                <td className="p-3 font-medium">{d.title}</td>
                <td className="p-3"><ObjectCell e={e} visible={visible} /></td>
                <td className="p-3 text-xs text-muted-foreground">{d.details.join(" · ") || "–"}</td>
              </tr>; })}
            </tbody>
          </table>
        </div>
        <ul className="space-y-2 md:hidden">
          {rows.map(({ e, names, visible }) => { const d = describeEntry(e, names); return <li key={e.id} className="rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><p className="font-medium">{d.title}</p><time dateTime={e.created_at} className="text-xs text-muted-foreground">{formatAuditTime(e.created_at)}</time></div>
            <div className="mt-1 text-sm"><Actor e={e} names={names} /></div>
            <div className="mt-1 text-sm"><ObjectCell e={e} visible={visible} /></div>
            {d.details.length > 0 && <p className="mt-1 break-words text-xs text-muted-foreground">{d.details.join(" · ")}</p>}
          </li>; })}
        </ul>
        {pages.hasNextPage && <div className="flex justify-center"><Button variant="outline" disabled={pages.isFetchingNextPage} onClick={() => void pages.fetchNextPage()}>{pages.isFetchingNextPage ? "Wird geladen …" : "Mehr laden"}</Button></div>}
      </>}

    <IntegrityCard chain={chain} />
  </div>;
}

function Actor({ e, names }: { e: AuditEntry; names: Map<string, string> }) {
  return <span className="inline-flex flex-wrap items-center gap-1.5">
    <span>{e.actor_id ? names.get(e.actor_id) ?? "Unbekannt" : "System"}</span>
    {e.actor_role && <Badge variant="secondary" className="text-[11px]">{ROLE_LABELS[e.actor_role as AppRole] ?? e.actor_role}</Badge>}
  </span>;
}

function ObjectCell({ e, visible }: { e: AuditEntry; visible: Set<string> }) {
  const label = ENTITY_LABELS[e.entity_type] ?? e.entity_type;
  if (e.entity_type === "report" && e.entity_id && visible.has(e.entity_id)) {
    return <Link to="/reports/$id" params={{ id: e.entity_id }} className="text-primary underline-offset-2 hover:underline">{label} {e.entity_id.slice(0, 8)}</Link>;
  }
  return <span>{label}</span>;
}

function IntegrityCard({ chain }: { chain: string | null | undefined }) {
  const [result, setResult] = useState<{ rows: ChainResult[]; at: Date } | "error" | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (chain === undefined) return;
    setBusy(true);
    try { setResult({ rows: await verifyAuditChain(chain), at: new Date() }); } catch { setResult("error"); } finally { setBusy(false); }
  };
  const summary = result && result !== "error" ? (() => {
    const total = result.rows.reduce((n, r) => n + r.entries, 0);
    const bad = result.rows.filter((r) => !r.ok).map((r) => r.first_bad_id ?? 0).sort((a, b) => a - b)[0];
    return { total, bad };
  })() : null;
  return <section className="rounded-2xl border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">Integrität der Protokolle</h2>
      <Button variant="outline" size="sm" disabled={busy || chain === undefined} onClick={() => void run()}><ShieldCheck className="size-4" aria-hidden /> Integrität prüfen</Button>
    </div>
    {chain === undefined && <p className="mt-2 text-sm text-muted-foreground">Wähle oben eine Person aus, um ihr Protokoll zu prüfen.</p>}
    {result === "error" && <Box tone="bad" icon={AlertTriangle}>Die Prüfung ist fehlgeschlagen. Bitte versuche es erneut.</Box>}
    {summary && result !== "error" && result && <Box tone={summary.bad === undefined ? "ok" : "bad"} icon={summary.bad === undefined ? CheckCircle2 : AlertTriangle}>
      <p>{summary.bad === undefined ? `Alle ${summary.total} Einträge sind lückenlos und unverändert.` : `Abweichung ab Eintrag ${summary.bad}. Bitte informiere die Ausbildungsleitung.`}</p>
      <p className="mt-1 text-xs text-muted-foreground">Geprüft am {formatAuditTime(result.at.toISOString())}</p>
    </Box>}
    <p className="mt-3 text-xs text-muted-foreground">Das Protokoll enthält keine Klarnamen und keine Berichtstexte; Namen werden erst bei der Anzeige aufgelöst.</p>
  </section>;
}

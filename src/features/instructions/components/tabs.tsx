import { useMemo, useState } from "react";
import { Cell as PieCell, Pie, PieChart } from "recharts";
import { ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { dateDe } from "@/features/export/pdf/text";
import type { DueState } from "../due";
import type { InstructionData, InstructionRecord } from "../api";
import { RECORD_STATUS_DE, STATE_FILTER, intervalLabel, sortRecords, type TopicView } from "../model";
import { DueBadge, RecordStatusBadge } from "./badges";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border bg-card p-5 text-card-foreground shadow-sm"><h3 className="font-semibold">{title}</h3><div className="mt-3">{children}</div></section>;
}
const Hint = ({ children }: { children: React.ReactNode }) => <p className="rounded-xl bg-muted/60 p-4 text-center text-sm text-muted-foreground">{children}</p>;

const RING: { key: DueState; label: string; color: string }[] = [
  { key: "valid", label: "Aktuell", color: "var(--success)" },
  { key: "due_soon", label: "Bald fällig", color: "var(--warning)" },
  { key: "overdue", label: "Überfällig", color: "var(--destructive)" },
  { key: "open", label: "Offen", color: "var(--muted-foreground)" },
];

export function OverviewTab({ views, records, isAzubi, onAdd }: { views: TopicView[]; records: InstructionRecord[]; isAzubi: boolean; onAdd: (topicId: string) => void }) {
  const counts = RING.map((r) => ({ ...r, value: views.filter((v) => v.status.state === r.key).length }));
  const cfg = Object.fromEntries(RING.map((r) => [r.key, { label: r.label, color: r.color }])) as ChartConfig;
  const rank: Partial<Record<DueState, number>> = { overdue: 0, due_soon: 1, open: 2 };
  const next = views.filter((v) => rank[v.status.state] !== undefined)
    .sort((a, b) => rank[a.status.state]! - rank[b.status.state]! || (a.status.due_on ?? "").localeCompare(b.status.due_on ?? "")).slice(0, 6);
  const confirmed = sortRecords(records.filter((r) => r.status === "confirmed")).slice(0, 5);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Status der Themen">
        {counts.every((c) => c.value === 0) ? <Hint>Noch keine Themen mit Fristen.</Hint> : (
          <>
            <ChartContainer config={cfg} className="mx-auto aspect-square max-h-[220px]">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Pie data={counts.filter((c) => c.value > 0)} dataKey="value" nameKey="label" innerRadius="58%" outerRadius="85%" strokeWidth={2}>
                  {counts.filter((c) => c.value > 0).map((c) => <PieCell key={c.key} fill={c.color} />)}
                </Pie>
              </PieChart>
            </ChartContainer>
            <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
              {counts.map((c) => <li key={c.key} className="flex items-center gap-2"><span className="size-3 rounded-full" style={{ background: c.color }} aria-hidden />{c.label}: <span className="font-semibold">{c.value}</span></li>)}
            </ul>
          </>
        )}
      </Card>
      <Card title="Als Nächstes">
        {next.length === 0 ? <Hint>Alles erledigt – nichts ist fällig.</Hint> : (
          <ul className="space-y-3">
            {next.map((v) => (
              <li key={v.topic.id} className="flex flex-col gap-2 border-b pb-3 last:border-0 last:pb-0">
                <span className="text-sm font-medium">{v.topic.title}</span>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <DueBadge status={v.status} />
                  {isAzubi && <Button size="sm" variant="outline" className="min-h-11" onClick={() => onAdd(v.topic.id)}>Eintragen</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Zuletzt bestätigt">
        {confirmed.length === 0 ? <Hint>Noch keine bestätigten Nachweise.</Hint> : (
          <ul className="space-y-2 text-sm">{confirmed.map((r) => <li key={r.id} className="flex gap-3"><span className="shrink-0 tabular-nums text-muted-foreground">{dateDe(r.given_on)}</span><span>{r.title}</span></li>)}</ul>
        )}
      </Card>
    </div>
  );
}

export function CatalogTab({ data, views, today, isAzubi, onAdd }: { data: InstructionData; views: TopicView[]; today: string; isAzubi: boolean; onAdd: (topicId: string) => void }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<DueState | "all">("all");
  const [openInfo, setOpenInfo] = useState<Set<string>>(new Set());
  const byTopic = useMemo(() => new Map(views.map((v) => [v.topic.id, v])), [views]);
  const needle = q.trim().toLowerCase();
  const match = (v: TopicView) => (state === "all" || v.status.state === state) && (!needle || [v.topic.title, v.topic.category, ...v.topic.points.map((p) => p.label)].some((s) => s.toLowerCase().includes(needle)));
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input placeholder="Thema oder Inhalt" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-sm" aria-label="Suche" />
        <Select value={state} onValueChange={(v) => setState(v as DueState | "all")}>
          <SelectTrigger className="sm:w-56" aria-label="Zustand"><SelectValue /></SelectTrigger>
          <SelectContent>{STATE_FILTER.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {data.catalogs.map((c) => {
        const cats = new Map<string, TopicView[]>();
        for (const t of c.topics) { const v = byTopic.get(t.id); if (v && match(v)) cats.set(t.category, [...(cats.get(t.category) ?? []), v]); }
        return (
          <section key={c.catalog.id} className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold">{c.catalog.title}</h3>
              {c.catalog.subtitle && <p className="text-sm text-muted-foreground">{c.catalog.subtitle}</p>}
              {c.catalog.source && <p className="mt-1 text-xs text-muted-foreground">{c.catalog.source}</p>}
            </div>
            {cats.size === 0 && <Hint>Keine passenden Themen.</Hint>}
            {[...cats.entries()].map(([cat, items]) => (
              <Collapsible key={cat} defaultOpen className="rounded-2xl border bg-card shadow-sm">
                <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-2 px-4 py-3 text-left font-medium">
                  {cat} <span className="ml-auto text-sm font-normal text-muted-foreground">{items.length}</span><ChevronDown className="size-4" aria-hidden />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="divide-y border-t">
                    {items.map((v) => {
                      const open = openInfo.has(v.topic.id);
                      return (
                        <li key={v.topic.id} className="space-y-2 px-4 py-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 space-y-1">
                              <p className="font-medium">{v.topic.title}</p>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {v.topic.legal_basis && <span className="rounded-full border px-2 py-0.5">{v.topic.legal_basis}</span>}
                                <span>{intervalLabel(v.topic.interval_months, data.person.geburtsdatum, today)}</span>
                                {v.topic.when_text && <span>{v.topic.when_text}</span>}
                                {!v.topic.is_active && <span className="italic">nicht mehr Teil des Katalogs</span>}
                              </div>
                            </div>
                            <DueBadge status={v.status} />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="ghost" className="min-h-11" aria-expanded={open} onClick={() => setOpenInfo((s) => { const n = new Set(s); if (open) n.delete(v.topic.id); else n.add(v.topic.id); return n; })}>Inhalte</Button>
                            {isAzubi && <Button size="sm" variant="outline" className="min-h-11" onClick={() => onAdd(v.topic.id)}><Plus className="size-4" aria-hidden />Unterweisung eintragen</Button>}
                          </div>
                          {open && (
                            <div className="rounded-xl bg-muted/50 p-3 text-sm">
                              {v.topic.hint && <p className="mb-2">{v.topic.hint}</p>}
                              <ul className="list-disc space-y-1 pl-5">{v.topic.points.filter((p) => p.is_active).map((p) => <li key={p.id}>{p.label}</li>)}</ul>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </section>
        );
      })}
    </div>
  );
}

export function RecordsTab({ records, isAzubi, onOpen, onAdd }: { records: InstructionRecord[]; isAzubi: boolean; onOpen: (r: InstructionRecord) => void; onAdd: () => void }) {
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const rows = sortRecords(records).filter((r) => (status === "all" || r.status === status) && (!needle || `${r.title} ${r.instructor_name ?? ""}`.toLowerCase().includes(needle)));
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input placeholder="Suche" aria-label="Suche" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-48" aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            {Object.entries(RECORD_STATUS_DE).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        {isAzubi && <Button className="min-h-11 sm:ml-auto" onClick={onAdd}><Plus className="size-4" aria-hidden />Unterweisung eintragen</Button>}
      </div>
      {rows.length === 0 ? <Hint>Noch keine Nachweise.</Hint> : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground"><tr><th className="p-3 font-medium">Datum</th><th className="p-3 font-medium">Thema</th><th className="p-3 font-medium">Unterweisende Person</th><th className="p-3 font-medium">Dauer</th><th className="p-3 font-medium">Status</th></tr></thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => onOpen(r)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(r); }}>
                    <td className="p-3 tabular-nums">{dateDe(r.given_on)}</td><td className="p-3 font-medium">{r.title}</td>
                    <td className="p-3">{r.instructor_name ?? "–"}</td><td className="p-3">{r.duration_minutes ? `${r.duration_minutes} min` : "–"}</td>
                    <td className="p-3"><RecordStatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onOpen(r)} className="w-full space-y-2 rounded-2xl border bg-card p-4 text-left shadow-sm">
                  <div className="flex items-center justify-between gap-2"><span className="text-sm tabular-nums text-muted-foreground">{dateDe(r.given_on)}</span><RecordStatusBadge status={r.status} /></div>
                  <p className="font-medium">{r.title}</p>
                  <p className="text-sm text-muted-foreground">{r.instructor_name ?? "–"}{r.duration_minutes ? ` · ${r.duration_minutes} min` : ""}</p>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function LegendTab() {
  return (
    <section className="max-w-3xl rounded-2xl border bg-card p-5 shadow-sm">
      <h3 className="font-semibold">So funktioniert es</h3>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
        <li>Du trägst jede Unterweisung als Nachweis ein und reichst sie ein.</li>
        <li>Deine Ausbilder:in bestätigt den Nachweis.</li>
        <li>Nach dem Intervall des Themas wird die Unterweisung wieder fällig. Für Jugendliche unter 18 gilt höchstens ein halbes Jahr (§ 29 JArbSchG).</li>
        <li>Themen mit ‚Je nach Betrieb‘ zählen erst, wenn du dazu einen Nachweis eingetragen hast.</li>
      </ul>
      <p className="mt-4 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">Die Kataloge sind eine Hilfe. Welche Inhalte im Betrieb vermittelt werden, legt die Gefährdungsbeurteilung des Betriebs fest.</p>
    </section>
  );
}

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookMarked, Check, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveDialog } from "@/components/dialogs";
import { cn } from "@/lib/utils";
import { MAX_LINKS, getReportLinks, linkOptions, setReportLinks, type LinkChip } from "../api";

function Chip({ chip, onRemove }: { chip: LinkChip; onRemove?: () => void }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
      chip.kind === "topic" ? "border-brand-teal/50 bg-brand-teal/10 text-foreground" : "border-primary/30 bg-primary/10 text-primary")}>
      <span className="truncate" title={chip.group ? `${chip.group}: ${chip.label}` : chip.label}>{chip.label}</span>
      {onRemove && <button type="button" onClick={onRemove} aria-label={`${chip.label} entfernen`} className="-mr-1 rounded-full p-0.5 hover:bg-background/60"><X className="size-3" /></button>}
    </span>
  );
}

/** Nur-Lese-Chips (Berichtsdetail, Prüfansicht). */
export function ReportLinkChips({ reportId, azubiId }: { reportId: string; azubiId: string }) {
  const { data } = useQuery({ queryKey: ["report-links", reportId], queryFn: () => getReportLinks(reportId, azubiId) });
  const chips = [...(data?.items ?? []), ...(data?.topics ?? [])];
  if (!chips.length) return null;
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ausbildungsinhalte</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">{chips.map((c) => <Chip key={`${c.kind}-${c.id}`} chip={c} />)}</div>
    </section>
  );
}

/** Block „Ausbildungsinhalte“ im Berichtseditor/-detail. */
export function ReportLinksBlock({ reportId, azubiId, editable }: { reportId: string; azubiId: string; editable: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["report-links", reportId], queryFn: () => getReportLinks(reportId, azubiId) });
  const [open, setOpen] = useState(false);
  const items = data?.items ?? [], topics = data?.topics ?? [];
  if (!editable && !items.length && !topics.length) return null;

  const save = async (itemIds: string[], topicIds: string[]) => {
    try {
      await setReportLinks(reportId, itemIds, topicIds);
      await qc.invalidateQueries({ queryKey: ["report-links", reportId] });
      await qc.invalidateQueries({ queryKey: ["plan"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen"); }
  };

  return (
    <section className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><BookMarked className="size-4" aria-hidden /> Ausbildungsinhalte</h2>
        {editable && <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Inhalte zuordnen</Button>}
      </div>
      {items.length + topics.length === 0
        ? <p className="mt-2 text-sm text-muted-foreground">Noch keine Inhalte zugeordnet.</p>
        : <div className="mt-3 flex flex-wrap gap-1.5">
          {items.map((c) => <Chip key={`i-${c.id}`} chip={c} {...(editable ? { onRemove: () => void save(items.filter((x) => x.id !== c.id).map((x) => x.id), topics.map((x) => x.id)) } : {})} />)}
          {topics.map((c) => <Chip key={`t-${c.id}`} chip={c} {...(editable ? { onRemove: () => void save(items.map((x) => x.id), topics.filter((x) => x.id !== c.id).map((x) => x.id)) } : {})} />)}
        </div>}
      {!editable && <p className="mt-2 text-xs text-muted-foreground">Nach dem Einreichen nicht mehr änderbar.</p>}
      {editable && open && <LinkPicker open={open} onOpenChange={setOpen} initialItems={items.map((x) => x.id)} initialTopics={topics.map((x) => x.id)} onSave={async (a, b) => { await save(a, b); setOpen(false); }} />}
    </section>
  );
}

function LinkPicker({ open, onOpenChange, initialItems, initialTopics, onSave }: {
  open: boolean; onOpenChange: (o: boolean) => void; initialItems: string[]; initialTopics: string[]; onSave: (items: string[], topics: string[]) => Promise<void>;
}) {
  const { data } = useQuery({ queryKey: ["plan", "link-options"], queryFn: linkOptions });
  const [items, setItems] = useState<Set<string>>(() => new Set(initialItems));
  const [topics, setTopics] = useState<Set<string>>(() => new Set(initialTopics));
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const count = items.size + topics.size;
  const needle = q.trim().toLocaleLowerCase("de");
  const has = (...t: (string | null | undefined)[]) => !needle || t.some((x) => (x ?? "").toLocaleLowerCase("de").includes(needle));

  const tree = useMemo(() => (data?.tree?.sections ?? []).map((s) => ({
    s, groups: s.groups.map((g) => ({ g, items: g.items.filter((i) => (i.is_active || items.has(i.id)) && has(i.label, i.reference, g.title, s.title)) })).filter((x) => x.items.length),
  })).filter((x) => x.groups.length), [data, needle, items]); // eslint-disable-line react-hooks/exhaustive-deps
  const topicList = (data?.topics ?? []).filter((t) => has(t.title, t.code)).sort((a, b) => (a.target_year ?? 9) - (b.target_year ?? 9) || a.sort_order - b.sort_order);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else { if (count >= MAX_LINKS) { toast.error(`Höchstens ${MAX_LINKS} Inhalte je Bericht.`); return; } n.add(id); }
    setter(n);
  };
  const Row = ({ on, label, sub, onClick }: { on: boolean; label: string; sub?: string; onClick: () => void }) => (
    <button type="button" onClick={onClick} aria-pressed={on} className={cn("flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors", on ? "border-primary bg-primary/10" : "hover:bg-accent")}>
      <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>{on && <Check className="size-3" />}</span>
      <span className="min-w-0"><span className="break-words">{label}</span>{sub && <span className="block text-xs text-muted-foreground">{sub}</span>}</span>
    </button>
  );

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Inhalte zuordnen" description="Wähle Punkte aus deinem Ausbildungsplan und Themen, die dieser Bericht abdeckt.">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input className="pl-9" placeholder="Suchen" aria-label="Inhalte durchsuchen" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Tabs defaultValue="plan">
          <div className="flex items-center justify-between gap-2">
            <TabsList><TabsTrigger value="plan">Plan</TabsTrigger><TabsTrigger value="themen">Themen</TabsTrigger></TabsList>
            <span className={cn("text-sm tabular-nums", count >= MAX_LINKS ? "font-semibold text-destructive" : "text-muted-foreground")}>{count} / {MAX_LINKS}</span>
          </div>
          <TabsContent value="plan" className="mt-3 max-h-[50vh] space-y-4 overflow-y-auto pr-1">
            {!data?.tree && <p className="text-sm text-muted-foreground">Dir ist noch kein Ausbildungsplan zugeordnet.</p>}
            {tree.map(({ s, groups }) => (
              <div key={s.id} className="space-y-2">
                <h3 className="text-sm font-semibold text-primary">{s.title}</h3>
                {groups.map(({ g, items: list }) => (
                  <div key={g.id} className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">{g.title}</p>
                    {list.map((i) => <Row key={i.id} on={items.has(i.id)} label={`${i.reference ? `${i.reference} ` : ""}${i.label}`} onClick={() => toggle(items, setItems, i.id)} />)}
                  </div>
                ))}
              </div>
            ))}
          </TabsContent>
          <TabsContent value="themen" className="mt-3 max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
            {!topicList.length && <p className="text-sm text-muted-foreground">Keine Themen gefunden.</p>}
            {topicList.map((t) => <Row key={t.id} on={topics.has(t.id)} label={`${t.code ? `${t.code} ` : ""}${t.title}`} {...(t.target_year ? { sub: `${t.target_year}. Ausbildungsjahr` } : {})} onClick={() => toggle(topics, setTopics, t.id)} />)}
          </TabsContent>
        </Tabs>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button disabled={saving} onClick={async () => { setSaving(true); try { await onSave([...items], [...topics]); } finally { setSaving(false); } }}>Übernehmen</Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

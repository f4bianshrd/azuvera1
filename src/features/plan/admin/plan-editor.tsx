import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, EyeOff, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { PlanJson, PlanJsonGroup, PlanJsonItem, PlanJsonSection } from "../api";
import { previewPlanJson } from "../json";

const newKey = (p: string) => `${p}${crypto.randomUUID().slice(0, 8)}`;
function move<T>(arr: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const c = [...arr];
  [c[i], c[j]] = [c[j]!, c[i]!];
  return c;
}

function Arrows({ onUp, onDown, label }: { onUp: () => void; onDown: () => void; label: string }) {
  return (
    <div className="flex shrink-0">
      <Button variant="ghost" size="icon" className="size-8" aria-label={`${label} nach oben`} onClick={onUp}><ArrowUp className="size-4" /></Button>
      <Button variant="ghost" size="icon" className="size-8" aria-label={`${label} nach unten`} onClick={onDown}><ArrowDown className="size-4" /></Button>
    </div>
  );
}

function RemoveButton({ used, onRemove, label }: { used: boolean; onRemove: () => void; label: string }) {
  return used
    ? <Button variant="ghost" size="sm" className="shrink-0" onClick={onRemove} title="Hat Fortschritt oder Verknüpfungen – wird nur ausgeblendet."><EyeOff className="size-4" aria-hidden /> Ausblenden</Button>
    : <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={`${label} löschen`} onClick={onRemove}><Trash2 className="size-4" /></Button>;
}

/** Editor eines Plans (arbeitet auf dem JSON-Format; „Speichern“ ruft admin_save_plan). */
export function PlanEditor({ initial, usage, professionCodes, online, onSave, onClose }: {
  initial: PlanJson; usage: Map<string, boolean>; professionCodes: string[]; online: boolean;
  onSave: (p: PlanJson) => Promise<void>; onClose: () => void;
}) {
  const [plan, setPlan] = useState<PlanJson>(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => setPlan(initial), [initial]);
  const P = plan.plan;
  const setP = (patch: Partial<PlanJson["plan"]>) => setPlan({ ...plan, plan: { ...P, ...patch } });
  const setSections = (sections: PlanJsonSection[]) => setPlan({ ...plan, sections });
  const setSection = (i: number, s: PlanJsonSection) => setSections(plan.sections.map((x, j) => (j === i ? s : x)));
  const groupUsed = (g: PlanJsonGroup) => g.items.some((it) => usage.get(it.key));
  const sectionUsed = (s: PlanJsonSection) => s.groups.some(groupUsed);

  const save = async () => {
    const check = previewPlanJson(JSON.stringify(plan), professionCodes);
    if (!check.ok || !check.plan) { toast.error(check.error ?? "Plan ist ungültig."); return; }
    setSaving(true);
    try { await onSave(check.plan); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Plan bearbeiten <span className="text-sm font-normal text-muted-foreground">({P.code})</span></h2>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Schließen</Button>
            <Button onClick={save} disabled={saving || !online} title={online ? undefined : "Dafür brauchst du eine Internetverbindung."}><Save className="size-4" aria-hidden /> Speichern</Button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="pe-title">Titel</Label><Input id="pe-title" maxLength={200} value={P.title} onChange={(e) => setP({ title: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="pe-sub">Untertitel</Label><Input id="pe-sub" maxLength={300} value={P.subtitle ?? ""} onChange={(e) => setP({ subtitle: e.target.value || null })} /></div>
          <div className="space-y-1.5"><Label htmlFor="pe-src">Quelle</Label><Input id="pe-src" maxLength={1000} value={P.source ?? ""} onChange={(e) => setP({ source: e.target.value || null })} /></div>
          <div className="space-y-1.5"><Label htmlFor="pe-from">Gültig ab</Label><Input id="pe-from" type="date" value={P.valid_from ?? ""} onChange={(e) => setP({ valid_from: e.target.value || null })} /></div>
          <div className="space-y-1.5"><Label htmlFor="pe-until">Gültig bis</Label><Input id="pe-until" type="date" value={P.valid_until ?? ""} onChange={(e) => setP({ valid_until: e.target.value || null })} /></div>
          <div className="space-y-1.5">
            <Label>Dauer</Label>
            <Select value={String(P.duration_years ?? 3)} onValueChange={(v) => setP({ duration_years: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{[1, 2, 3, 4].map((y) => <SelectItem key={y} value={String(y)}>{y} {y === 1 ? "Jahr" : "Jahre"}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={P.status ?? "draft"} onValueChange={(v) => setP({ status: v as "draft" | "published" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="draft">Entwurf</SelectItem><SelectItem value="published">Veröffentlicht</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {plan.sections.map((s, si) => (
        <Collapsible key={s.key} className="rounded-2xl border bg-card shadow-sm">
          <div className="flex items-center gap-1 p-3">
            <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-accent">
              <ChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
              <span className="truncate font-semibold">{s.title || "Neuer Abschnitt"}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{s.groups.length} Gruppen</span>
            </CollapsibleTrigger>
            <Arrows label="Abschnitt" onUp={() => setSections(move(plan.sections, si, -1))} onDown={() => setSections(move(plan.sections, si, 1))} />
            <RemoveButton label="Abschnitt" used={sectionUsed(s)} onRemove={() => setSections(plan.sections.filter((_, j) => j !== si))} />
          </div>
          <CollapsibleContent className="space-y-4 border-t p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <div className="space-y-1.5"><Label>Titel</Label><Input maxLength={300} value={s.title} onChange={(e) => setSection(si, { ...s, title: e.target.value })} /></div>
              <div className="space-y-1.5">
                <Label>Art</Label>
                <Select value={s.kind ?? "content"} onValueChange={(v) => setSection(si, { ...s, kind: v as "content" | "checklist" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="content">Inhalte</SelectItem><SelectItem value="checklist">Betriebszweig (Checkliste)</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Hinweis</Label><Textarea rows={2} maxLength={2000} value={s.hint ?? ""} onChange={(e) => setSection(si, { ...s, hint: e.target.value || null })} /></div>
            </div>
            {s.groups.map((g, gi) => {
              const setGroup = (ng: PlanJsonGroup) => setSection(si, { ...s, groups: s.groups.map((x, j) => (j === gi ? ng : x)) });
              const setItems = (items: PlanJsonItem[]) => setGroup({ ...g, items });
              return (
                <div key={g.key} className="space-y-3 rounded-xl border p-3">
                  <div className="flex items-start gap-1">
                    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                      <Input aria-label="Gruppentitel" placeholder="Gruppentitel" maxLength={300} value={g.title} onChange={(e) => setGroup({ ...g, title: e.target.value })} />
                      <Input aria-label="Referenz" placeholder="Referenz (z. B. § 4 Nr. 1)" maxLength={200} value={g.reference ?? ""} onChange={(e) => setGroup({ ...g, reference: e.target.value || null })} />
                      <Input aria-label="Zeitrichtwert" placeholder="Zeitrichtwert (z. B. 8 Wochen)" maxLength={300} value={g.weeks_text ?? ""} onChange={(e) => setGroup({ ...g, weeks_text: e.target.value || null })} />
                      <Input aria-label="Hinweis" placeholder="Hinweis" maxLength={2000} value={g.hint ?? ""} onChange={(e) => setGroup({ ...g, hint: e.target.value || null })} />
                    </div>
                    <Arrows label="Gruppe" onUp={() => setSection(si, { ...s, groups: move(s.groups, gi, -1) })} onDown={() => setSection(si, { ...s, groups: move(s.groups, gi, 1) })} />
                    <RemoveButton label="Gruppe" used={groupUsed(g)} onRemove={() => setSection(si, { ...s, groups: s.groups.filter((_, j) => j !== gi) })} />
                  </div>
                  <ul className="space-y-2">
                    {g.items.map((it, ii) => (
                      <li key={it.key} className={cn("flex items-center gap-1")}>
                        <Input aria-label="Referenz des Punkts" className="w-20 shrink-0" placeholder="a)" maxLength={50} value={it.reference ?? ""} onChange={(e) => setItems(g.items.map((x, j) => (j === ii ? { ...x, reference: e.target.value || null } : x)))} />
                        <Input aria-label="Text des Punkts" className="min-w-0 flex-1" maxLength={800} value={it.label} onChange={(e) => setItems(g.items.map((x, j) => (j === ii ? { ...x, label: e.target.value } : x)))} />
                        <Arrows label="Punkt" onUp={() => setItems(move(g.items, ii, -1))} onDown={() => setItems(move(g.items, ii, 1))} />
                        <RemoveButton label="Punkt" used={!!usage.get(it.key)} onRemove={() => setItems(g.items.filter((_, j) => j !== ii))} />
                      </li>
                    ))}
                  </ul>
                  <Button variant="outline" size="sm" onClick={() => setItems([...g.items, { key: newKey("i"), label: "", reference: null }])}><Plus className="size-4" aria-hidden /> Punkt</Button>
                </div>
              );
            })}
            <Button variant="outline" size="sm" onClick={() => setSection(si, { ...s, groups: [...s.groups, { key: newKey("g"), title: "", reference: null, weeks_text: null, hint: null, items: [] }] })}><Plus className="size-4" aria-hidden /> Gruppe</Button>
          </CollapsibleContent>
        </Collapsible>
      ))}
      <Button variant="outline" onClick={() => setSections([...plan.sections, { key: newKey("s"), title: "", kind: "content", hint: null, groups: [] }])}><Plus className="size-4" aria-hidden /> Abschnitt</Button>
    </div>
  );
}

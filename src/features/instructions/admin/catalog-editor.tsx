import { useState } from "react";
import { ArrowDown, ArrowUp, EyeOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { previewCatalogJson, type CatalogJson } from "../json";

type Topic = CatalogJson["topics"][number];
const ALL = "__all";

function move<T>(arr: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const n = [...arr]; [n[i], n[j]] = [n[j]!, n[i]!]; return n;
}
const uniqueKey = (base: string, used: Set<string>) => { let k = base, i = 2; while (used.has(k)) k = `${base}-${i++}`; return k; };

export function CatalogEditor({ initial, used, professions, onClose, onSave }: {
  initial: CatalogJson; used: { topicKeys: Set<string>; pointKeys: Set<string> }; professions: { code: string; name: string }[];
  onClose: () => void; onSave: (json: CatalogJson) => Promise<void>;
}) {
  const [json, setJson] = useState<CatalogJson>(initial);
  const [busy, setBusy] = useState(false);
  const c = json.catalog;
  const setCat = (patch: Partial<CatalogJson["catalog"]>) => setJson((j) => ({ ...j, catalog: { ...j.catalog, ...patch } }));
  const setTopic = (i: number, patch: Partial<Topic>) => setJson((j) => ({ ...j, topics: j.topics.map((t, k) => (k === i ? { ...t, ...patch } : t)) }));
  const allPointKeys = () => new Set(json.topics.flatMap((t) => t.points.map((p) => p.key)));
  const addTopic = () => setJson((j) => ({ ...j, topics: [...j.topics, { key: uniqueKey("thema", new Set(j.topics.map((t) => t.key))), title: "Neues Thema", category: "Allgemein", legal_basis: "", interval_months: 12, when_text: "", hint: "", is_optional: false, points: [] }] }));
  const save = async () => {
    const check = previewCatalogJson(JSON.stringify(json));
    if (!check.ok) { toast.error(check.error); return; }
    setBusy(true);
    try { await onSave(check.data!); } catch (e) { toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen"); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
        <h2 className="font-semibold">Katalog</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="ce-title">Titel</Label><Input id="ce-title" maxLength={200} value={c.title} onChange={(e) => setCat({ title: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ce-sub">Untertitel</Label><Input id="ce-sub" maxLength={300} value={c.subtitle} onChange={(e) => setCat({ subtitle: e.target.value })} /></div>
          <div className="space-y-1.5">
            <Label htmlFor="ce-prof">Beruf</Label>
            <Select value={c.profession_code || ALL} onValueChange={(v) => setCat({ profession_code: v === ALL ? "" : v })}>
              <SelectTrigger id="ce-prof"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>Alle Berufe</SelectItem>{professions.map((p) => <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ce-status">Status</Label>
            <Select value={c.status} onValueChange={(v) => setCat({ status: v as "draft" | "published" })}>
              <SelectTrigger id="ce-status"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="draft">Entwurf</SelectItem><SelectItem value="published">Veröffentlicht</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="ce-src">Quelle</Label><Textarea id="ce-src" rows={3} maxLength={2000} value={c.source} onChange={(e) => setCat({ source: e.target.value })} /></div>
      </section>

      {json.topics.map((t, i) => {
        const hasRecords = used.topicKeys.has(t.key);
        return (
          <section key={t.key} className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{i + 1}. {t.title || "Thema"}</h3>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="size-11" aria-label="Nach oben" onClick={() => setJson((j) => ({ ...j, topics: move(j.topics, i, -1) }))}><ArrowUp className="size-4" /></Button>
                <Button size="icon" variant="ghost" className="size-11" aria-label="Nach unten" onClick={() => setJson((j) => ({ ...j, topics: move(j.topics, i, 1) }))}><ArrowDown className="size-4" /></Button>
                <Button variant="ghost" className="min-h-11" onClick={() => setJson((j) => ({ ...j, topics: j.topics.filter((_, k) => k !== i) }))}>
                  {hasRecords ? <><EyeOff className="size-4" aria-hidden />Ausblenden</> : <><Trash2 className="size-4" aria-hidden />Löschen</>}
                </Button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Titel</Label><Input maxLength={200} value={t.title} onChange={(e) => setTopic(i, { title: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Kategorie</Label><Input maxLength={80} value={t.category} onChange={(e) => setTopic(i, { category: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Rechtsgrundlage</Label><Input maxLength={300} value={t.legal_basis} onChange={(e) => setTopic(i, { legal_basis: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Intervall in Monaten (leer = einmalig)</Label><Input type="number" min={1} max={36} value={t.interval_months ?? ""} onChange={(e) => setTopic(i, { interval_months: e.target.value ? Number(e.target.value) : null })} /></div>
              <div className="space-y-1.5"><Label>Zeitpunkt</Label><Input maxLength={200} value={t.when_text} onChange={(e) => setTopic(i, { when_text: e.target.value })} /></div>
              <label className="flex min-h-11 items-center justify-between gap-3 pt-6"><span className="text-sm">Je nach Betrieb</span><Switch checked={t.is_optional} onCheckedChange={(v) => setTopic(i, { is_optional: v })} /></label>
            </div>
            <div className="space-y-1.5"><Label>Hinweis</Label><Textarea rows={2} maxLength={600} value={t.hint} onChange={(e) => setTopic(i, { hint: e.target.value })} /></div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Inhaltspunkte</p>
              {t.points.map((p, k) => (
                <div key={p.key} className="flex items-center gap-1">
                  <Input aria-label={`Punkt ${k + 1}`} maxLength={600} value={p.label} onChange={(e) => setTopic(i, { points: t.points.map((x, m) => (m === k ? { ...x, label: e.target.value } : x)) })} />
                  <Button size="icon" variant="ghost" className="size-11 shrink-0" aria-label="Nach oben" onClick={() => setTopic(i, { points: move(t.points, k, -1) })}><ArrowUp className="size-4" /></Button>
                  <Button size="icon" variant="ghost" className="size-11 shrink-0" aria-label="Nach unten" onClick={() => setTopic(i, { points: move(t.points, k, 1) })}><ArrowDown className="size-4" /></Button>
                  <Button size="icon" variant="ghost" className="size-11 shrink-0" aria-label={used.pointKeys.has(p.key) ? "Ausblenden" : "Löschen"} onClick={() => setTopic(i, { points: t.points.filter((_, m) => m !== k) })}>
                    {used.pointKeys.has(p.key) ? <EyeOff className="size-4" /> : <Trash2 className="size-4" />}
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="min-h-11" onClick={() => setTopic(i, { points: [...t.points, { key: uniqueKey(`${t.key}-${t.points.length + 1}`, allPointKeys()), label: "Neuer Inhaltspunkt" }] })}><Plus className="size-4" aria-hidden />Punkt hinzufügen</Button>
            </div>
          </section>
        );
      })}
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="outline" className="min-h-11" onClick={addTopic}><Plus className="size-4" aria-hidden />Thema hinzufügen</Button>
        <div className="flex gap-2">
          <Button variant="ghost" className="min-h-11" onClick={onClose}>Zurück</Button>
          <Button className="min-h-11" disabled={busy} onClick={() => void save()}>Speichern</Button>
        </div>
      </div>
    </div>
  );
}

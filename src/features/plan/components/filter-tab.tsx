import { useState } from "react";
import { Palette, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { PersonOption } from "../api";
import { STATUS_FILTER_LABELS, type StatusFilter } from "../stats";
import {
  TEMPLATES, allBranding, deleteSetting, layoutFor, listSaved, saveSetting, storeBranding, templateDef,
  type Layout, type PlanSettings, type SavedSetting,
} from "../prefs";
import { BrandingDialog } from "./branding-dialog";

export function FilterTab({ settings, onChange, isAzubi, professions, persons, ownProfessionId, duration, company }: {
  settings: PlanSettings;
  onChange: (s: PlanSettings) => void;
  isAzubi: boolean;
  professions: { id: string; name: string }[];
  persons: PersonOption[];
  ownProfessionId: string | null;
  duration: number;
  company: { name: string | null; address: string | null };
}) {
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<SavedSetting[]>(() => listSaved());
  const [brandOpen, setBrandOpen] = useState(false);
  const set = (patch: Partial<PlanSettings>) => onChange({ ...settings, ...patch });
  const layout = layoutFor(settings);
  const setLayout = (patch: Partial<Layout>) => set({ layouts: { ...settings.layouts, [settings.template]: { ...layout, ...patch } } });
  const professionId = isAzubi ? ownProfessionId : settings.professionId;
  const visiblePersons = persons.filter((p) => !settings.professionId || p.profession_id === settings.professionId);
  const years = Array.from({ length: duration }, (_, i) => i + 1);

  const save = () => {
    const n = name.trim();
    if (!n) { toast.error("Bitte einen Namen für die Einstellung angeben."); return; }
    setSaved(saveSetting({ name: n.slice(0, 60), settings, branding: allBranding() }));
    setName("");
    toast.success(`Vorlage ‚${n}‘ mit Layout und Branding gespeichert`);
  };
  const load = (e: SavedSetting) => {
    for (const t of TEMPLATES) if (e.branding[t.id]) storeBranding(t.id, e.branding[t.id]!);
    onChange(isAzubi ? { ...e.settings, azubiId: null } : e.settings);
    toast.success(`‚${e.name}‘ geladen`);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="space-y-1.5">
          <Label>Ausbildungsberuf</Label>
          <Select value={professionId ?? ""} disabled={isAzubi} onValueChange={(v) => set({ professionId: v === "__all" ? null : v, azubiId: null })}>
            <SelectTrigger><SelectValue placeholder="Beruf wählen" /></SelectTrigger>
            <SelectContent>
              {!isAzubi && <SelectItem value="__all">Alle Berufe</SelectItem>}
              {professions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {!isAzubi && (
          <div className="space-y-1.5">
            <Label>Auszubildende(r)</Label>
            <Select value={settings.azubiId ?? ""} onValueChange={(v) => set({ azubiId: v })}>
              <SelectTrigger><SelectValue placeholder="Person wählen" /></SelectTrigger>
              <SelectContent>
                {visiblePersons.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
            {!visiblePersons.length && <p className="text-xs text-muted-foreground">Keine Personen sichtbar.</p>}
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={settings.status} onValueChange={(v) => set({ status: v as StatusFilter })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(STATUS_FILTER_LABELS) as StatusFilter[]).map((s) => <SelectItem key={s} value={s}>{STATUS_FILTER_LABELS[s]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-search">Suche</Label>
          <Input id="plan-search" placeholder="Fertigkeit oder Bereich" value={settings.search} maxLength={200} onChange={(e) => set({ search: e.target.value })} />
        </div>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Zeitraum (Ausbildungsjahre)</legend>
          <div className="flex flex-wrap gap-2">
            {years.map((y) => {
              const on = settings.years.includes(y);
              return (
                <button key={y} type="button" aria-pressed={on}
                  onClick={() => set({ years: on ? settings.years.filter((x) => x !== y) : [...settings.years, y].sort() })}
                  className={cn("rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>
                  {y}. Jahr
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Ohne Auswahl gelten alle Jahre.</p>
        </fieldset>
      </section>

      <div className="space-y-4">
        <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
          <div className="space-y-1.5">
            <Label>Export-Vorlage</Label>
            <Select value={settings.template} onValueChange={(v) => set({ template: v as PlanSettings["template"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TEMPLATES.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">{templateDef(settings.template).description}</p>
          </div>
          <div className="space-y-2">
            {([["charts", "Diagramme"], ["weeks", "Wochenübersicht"], ["contents", "Inhalte"]] as const).map(([k, l]) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <Label htmlFor={`lay-${k}`}>{l}</Label>
                <Switch id={`lay-${k}`} checked={layout[k]} onCheckedChange={(v) => setLayout({ [k]: v })} />
              </div>
            ))}
          </div>
          <Button variant="outline" onClick={() => setBrandOpen(true)}><Palette className="size-4" aria-hidden /> Branding anpassen</Button>
        </section>

        <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
          <Label htmlFor="setting-name">Einstellung speichern</Label>
          <div className="flex gap-2">
            <Input id="setting-name" placeholder="z. B. ‚Jahr 2 offen‘" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
            <Button onClick={save}>Speichern</Button>
          </div>
          <h3 className="pt-2 text-sm font-medium">Gespeicherte Einstellungen</h3>
          {!saved.length && <p className="text-sm text-muted-foreground">Noch keine gespeicherten Einstellungen auf diesem Gerät.</p>}
          <ul className="space-y-1.5">
            {saved.map((e) => (
              <li key={e.name} className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate text-sm">{e.name}</span>
                <Button variant="ghost" size="sm" onClick={() => load(e)}><Upload className="size-4" aria-hidden /> Laden</Button>
                <Button variant="ghost" size="icon" aria-label={`${e.name} löschen`} onClick={() => { setSaved(deleteSetting(e.name)); toast.success("Einstellung gelöscht"); }}><Trash2 className="size-4" /></Button>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <BrandingDialog open={brandOpen} onOpenChange={setBrandOpen} template={settings.template} company={company} />
    </div>
  );
}

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { AlertTriangle, BadgeCheck, Info, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog, ResponsiveDialog } from "@/components/dialogs";
import { ListSkeleton } from "@/components/shared";
import { OnlineButton } from "@/features/sync/online-button";
import { useProfessions } from "@/features/app/queries";
import { deleteRequirement, listBundeslaender, listRequirements, saveRequirement, type RequirementInput } from "../api";
import { dateDe, berlinToday } from "../model";
import type { ExperienceRequirement } from "../requirements";

const optInt = (min: number, max: number) => z.union([z.literal(""), z.coerce.number().int().min(min).max(max)]);
const formSchema = z.object({
  bundesland: z.string(), profession_code: z.string(),
  required_per_year: z.coerce.number().int().min(0, "0 bis 20").max(20, "0 bis 20"),
  required_basis: z.enum(["official", "default"]),
  hint_per_year: optInt(1, 100), hint_total: optInt(1, 100), hint_until_interim: optInt(1, 100),
  hint_kind: z.enum(["", "official", "recommended"]),
  min_pages: z.union([z.literal(""), z.coerce.number().min(0.5).max(10)]), page_unit: z.enum(["", "a4", "handwritten"]),
  leittext_weight: z.coerce.number().int().min(0).max(5),
  note: z.string().max(800), source_title: z.string().max(300), source_issuer: z.string().max(200),
  source_url: z.string().refine((v) => v === "" || v.startsWith("https://"), "Die Adresse muss mit https:// beginnen."),
  source_stand: z.string().max(40), checked_on: z.string(), is_active: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.required_basis === "official" && (!v.source_title.trim() || !v.source_url.trim())) ctx.addIssue({ code: "custom", path: ["source_title"], message: "Eine amtliche Vorgabe braucht eine Quelle." });
  if ((v.hint_per_year !== "" || v.hint_total !== "" || v.hint_until_interim !== "") && !v.hint_kind) ctx.addIssue({ code: "custom", path: ["hint_kind"], message: "Bitte die Verbindlichkeit der Hinweise wählen." });
  if (v.min_pages !== "" && !v.page_unit) ctx.addIssue({ code: "custom", path: ["page_unit"], message: "Bitte die Einheit wählen." });
});
type Form = z.input<typeof formSchema>;

const toForm = (r: Partial<ExperienceRequirement>): Form => ({
  bundesland: r.bundesland ?? "*", profession_code: r.profession_code ?? "*",
  required_per_year: r.required_per_year ?? 2, required_basis: (r.required_basis as "official" | "default") ?? "default",
  hint_per_year: r.hint_per_year ?? "", hint_total: r.hint_total ?? "", hint_until_interim: r.hint_until_interim ?? "",
  hint_kind: (r.hint_kind as "official" | "recommended" | null) ?? "", min_pages: r.min_pages ?? "", page_unit: (r.page_unit as "a4" | "handwritten" | null) ?? "",
  leittext_weight: r.leittext_weight ?? 0, note: r.note ?? "", source_title: r.source_title ?? "", source_issuer: r.source_issuer ?? "",
  source_url: r.source_url ?? "", source_stand: r.source_stand ?? "", checked_on: r.checked_on ?? berlinToday(), is_active: r.is_active ?? true,
});

const isDefault = (r: Pick<ExperienceRequirement, "bundesland" | "profession_code">) => r.bundesland === null && r.profession_code === null;
const stale = (d: string | null) => !d || (Date.now() - new Date(`${d}T00:00:00`).getTime()) > 365 * 86_400_000;

function bestRow(rows: ExperienceRequirement[], bl: string, pc: string | null): ExperienceRequirement | null {
  const c = rows.filter((r) => (r.bundesland === null || r.bundesland === bl) && (r.profession_code === null || r.profession_code === pc));
  c.sort((a, b) => Number(b.bundesland !== null) - Number(a.bundesland !== null) || Number(b.profession_code !== null) - Number(a.profession_code !== null));
  return c.find((r) => r.is_active) ?? null;
}

export function RequirementsAdmin() {
  const queryClient = useQueryClient();
  const { data: rows, isLoading } = useQuery({ queryKey: ["experience", "requirements-admin"], queryFn: listRequirements });
  const { data: lands = [] } = useQuery({ queryKey: ["experience", "bundeslaender"], queryFn: listBundeslaender });
  const { data: professions = [] } = useProfessions();
  const [edit, setEdit] = useState<{ row: Partial<ExperienceRequirement> } | null>(null);
  const [del, setDel] = useState<ExperienceRequirement | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["experience"] });
  const landName = (c: string | null) => c ? lands.find((l) => l.code === c)?.name ?? c : "Alle Länder";
  const profName = (c: string | null) => c ? professions.find((p) => p.code === c)?.name ?? c : "Alle Berufe";
  const profs = professions.filter((p) => p.code);

  if (isLoading || !rows) return <ListSkeleton />;
  return <div className="space-y-6">
    <section className="rounded-2xl border bg-card p-4">
      <h2 className="font-semibold">Übersicht</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="p-2 font-medium">Bundesland</th>{profs.map((p) => <th key={p.id} className="p-2 font-medium">{p.name}</th>)}</tr></thead>
          <tbody>{lands.map((l) => <tr key={l.code} className="border-t">
            <th scope="row" className="p-2 text-left font-medium">{l.name}</th>
            {profs.map((p) => {
              const r = bestRow(rows, l.code, p.code);
              const origin = !r || isDefault(r) ? "Standard" : r.required_basis === "official" ? "amtlich" : "Hinweis";
              const Icon = origin === "amtlich" ? BadgeCheck : origin === "Hinweis" ? Info : Minus;
              const exact = r && r.bundesland === l.code && r.profession_code === p.code ? r : null;
              return <td key={p.id} className="p-1">
                <button type="button" className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => setEdit({ row: exact ?? (r && !isDefault(r) && r.bundesland === l.code && r.profession_code === p.code ? r : { bundesland: l.code, profession_code: p.code, required_per_year: r?.required_per_year ?? 2 }) })}
                  aria-label={`${l.name}, ${p.name}: ${r?.required_per_year ?? 2} je Lehrjahr, ${origin}`}>
                  <span className="font-semibold tabular-nums">{r?.required_per_year ?? 2}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Icon className="size-3.5" aria-hidden />{origin}</span>
                </button>
              </td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <section className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Alle Vorgaben</h2><OnlineButton onClick={() => setEdit({ row: {} })}><Plus className="size-4" aria-hidden />Neue Vorgabe</OnlineButton></div>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => <li key={r.id} className="rounded-xl border p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium">{landName(r.bundesland)} · {profName(r.profession_code)}{!r.is_active && <span className="text-muted-foreground"> (inaktiv)</span>}</p>
              <p className="text-muted-foreground">Ziel je Lehrjahr: {r.required_per_year} · {r.required_basis === "official" ? "Vorgabe der zuständigen Stelle" : "Standardvorgabe"}</p>
              {(r.hint_per_year || r.hint_total) && <p className="text-muted-foreground">Hinweis: {[r.hint_per_year ? `${r.hint_per_year} je Lehrjahr` : null, r.hint_total ? `${r.hint_total} insgesamt` : null].filter(Boolean).join(", ")} ({r.hint_kind === "official" ? "Vorgabe" : "Empfehlung"})</p>}
              {r.source_url && <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="break-words text-primary underline-offset-4 hover:underline">{r.source_issuer || r.source_title || "Quelle"}{r.source_stand ? `, Stand ${r.source_stand}` : ""}</a>}
              <p className="text-xs text-muted-foreground">zuletzt geprüft: {dateDe(r.checked_on)}{stale(r.checked_on) && <span className="ml-2 inline-flex items-center gap-1 font-medium text-warning"><AlertTriangle className="size-3" aria-hidden />Prüfung fällig</span>}</p>
            </div>
            <div className="flex gap-1">
              <OnlineButton size="sm" variant="outline" onClick={() => setEdit({ row: r })}><Pencil className="size-4" aria-hidden />Bearbeiten</OnlineButton>
              {!isDefault(r) && <OnlineButton size="sm" variant="outline" className="text-destructive" onClick={() => setDel(r)}><Trash2 className="size-4" aria-hidden />Löschen</OnlineButton>}
            </div>
          </div>
        </li>)}
      </ul>
    </section>

    {edit && <RequirementDialog row={edit.row} lands={lands} professions={profs.map((p) => ({ code: p.code!, name: p.name }))} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void refresh(); }} />}
    <ConfirmDialog open={!!del} onOpenChange={(o) => { if (!o) setDel(null); }} title="Diese Vorgabe löschen?" description="Danach gilt für diese Kombination die nächstallgemeinere Vorgabe." confirmLabel="Löschen" destructive
      onConfirm={() => { if (del) void deleteRequirement(del.id).then(() => { toast.success("Vorgabe gelöscht"); void refresh(); }).catch((e: Error) => toast.error(e.message)); setDel(null); }} />
  </div>;
}

function RequirementDialog({ row, lands, professions, onClose, onSaved }: { row: Partial<ExperienceRequirement>; lands: { code: string; name: string }[]; professions: { code: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Form>(() => toForm(row));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const locked = !!row.id && row.bundesland === null && row.profession_code === null;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((c) => ({ ...c, [k]: v }));
  const err = (k: string) => errors[k] ? <p className="text-xs text-destructive">{errors[k]}</p> : null;

  const save = async () => {
    const parsed = formSchema.safeParse(f);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]))); return; }
    const v = parsed.data;
    const n = (x: number | "") => (x === "" ? null : x);
    const s = (x: string) => (x.trim() ? x.trim() : null);
    const input: RequirementInput = {
      ...(row.id ? { id: row.id } : {}),
      bundesland: v.bundesland === "*" ? null : v.bundesland, profession_code: v.profession_code === "*" ? null : v.profession_code,
      required_per_year: v.required_per_year, required_basis: v.required_basis,
      hint_per_year: n(v.hint_per_year), hint_total: n(v.hint_total), hint_until_interim: n(v.hint_until_interim), hint_kind: v.hint_kind || null,
      min_pages: n(v.min_pages), page_unit: v.page_unit || null, leittext_weight: v.leittext_weight,
      note: s(v.note), source_title: s(v.source_title), source_issuer: s(v.source_issuer), source_url: s(v.source_url), source_stand: s(v.source_stand),
      checked_on: v.checked_on || null, is_active: v.is_active,
    };
    setBusy(true);
    try { await saveRequirement(input); toast.success("Vorgabe gespeichert"); onSaved(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen."); }
    finally { setBusy(false); }
  };

  const num = (k: "required_per_year" | "hint_per_year" | "hint_total" | "hint_until_interim" | "leittext_weight" | "min_pages", label: string, step = 1) => <div className="space-y-1">
    <Label htmlFor={`req-${k}`}>{label}</Label>
    <Input id={`req-${k}`} type="number" step={step} inputMode="decimal" value={String(f[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} className="h-11" />
    {err(k)}
  </div>;

  return <ResponsiveDialog open onOpenChange={(o) => { if (!o) onClose(); }} title={row.id ? "Vorgabe bearbeiten" : "Neue Vorgabe"}>
    <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label>Bundesland</Label>
          <Select value={f.bundesland} onValueChange={(v) => set("bundesland", v)} disabled={locked}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="*">Alle Länder</SelectItem>{lands.map((l) => <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Beruf</Label>
          <Select value={f.profession_code} onValueChange={(v) => set("profession_code", v)} disabled={locked}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="*">Alle Berufe</SelectItem>{professions.map((p) => <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {num("required_per_year", "Ziel je Lehrjahr")}
        <div className="space-y-1"><Label>Verbindlichkeit des Ziels</Label>
          <Select value={f.required_basis} onValueChange={(v) => set("required_basis", v as "official" | "default")} disabled={locked}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="official">Vorgabe der zuständigen Stelle</SelectItem><SelectItem value="default">Standardvorgabe</SelectItem></SelectContent></Select></div>
      </div>
      <fieldset className="space-y-2"><legend className="text-sm font-medium">Hinweiszahlen</legend>
        <div className="grid gap-3 sm:grid-cols-3">{num("hint_per_year", "je Lehrjahr")}{num("hint_total", "insgesamt")}{num("hint_until_interim", "bis zur Zwischenprüfung")}</div>
        <div className="space-y-1"><Label>Verbindlichkeit der Hinweise</Label>
          <Select value={f.hint_kind || "none"} onValueChange={(v) => set("hint_kind", (v === "none" ? "" : v) as Form["hint_kind"])}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">Keine</SelectItem><SelectItem value="official">Vorgabe</SelectItem><SelectItem value="recommended">Empfehlung</SelectItem></SelectContent></Select>{err("hint_kind")}</div>
      </fieldset>
      <fieldset className="space-y-2"><legend className="text-sm font-medium">Mindestumfang</legend>
        <div className="grid gap-3 sm:grid-cols-2">{num("min_pages", "Seiten", 0.5)}
          <div className="space-y-1"><Label>Einheit</Label>
            <Select value={f.page_unit || "none"} onValueChange={(v) => set("page_unit", (v === "none" ? "" : v) as Form["page_unit"])}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Keine</SelectItem><SelectItem value="a4">A4-Seiten</SelectItem><SelectItem value="handwritten">handschriftliche Seiten</SelectItem></SelectContent></Select>{err("page_unit")}</div></div>
      </fieldset>
      {num("leittext_weight", "Wie viele Erfahrungsberichte zählt ein Leittext?")}
      <div className="space-y-1"><Label htmlFor="req-note">Hinweistext</Label><Textarea id="req-note" rows={3} maxLength={800} value={f.note} onChange={(e) => set("note", e.target.value)} /></div>
      <fieldset className="space-y-2"><legend className="text-sm font-medium">Quelle</legend>
        <div className="space-y-1"><Label htmlFor="req-st">Titel</Label><Input id="req-st" value={f.source_title} onChange={(e) => set("source_title", e.target.value)} className="h-11" />{err("source_title")}</div>
        <div className="space-y-1"><Label htmlFor="req-si">Herausgeber</Label><Input id="req-si" value={f.source_issuer} onChange={(e) => set("source_issuer", e.target.value)} className="h-11" /></div>
        <div className="space-y-1"><Label htmlFor="req-su">Adresse</Label><Input id="req-su" type="url" placeholder="https://" value={f.source_url} onChange={(e) => set("source_url", e.target.value)} className="h-11" />{err("source_url")}</div>
        <div className="space-y-1"><Label htmlFor="req-ss">Stand</Label><Input id="req-ss" placeholder="zum Beispiel 07/2024" value={f.source_stand} onChange={(e) => set("source_stand", e.target.value)} className="h-11" /></div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="req-co">zuletzt geprüft</Label><input id="req-co" type="date" value={f.checked_on} onChange={(e) => set("checked_on", e.target.value)} className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm" /></div>
        <div className="flex items-center gap-2 pt-6"><Switch id="req-active" checked={f.is_active} disabled={locked} onCheckedChange={(v) => set("is_active", v)} /><Label htmlFor="req-active">aktiv</Label></div>
      </div>
      <OnlineButton className="w-full" disabled={busy} onClick={() => void save()}>{busy ? "Speichert…" : "Speichern"}</OnlineButton>
    </div>
  </ResponsiveDialog>;
}

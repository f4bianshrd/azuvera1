import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog, ResponsiveDialog } from "@/components/dialogs";
import { StatusBadge, type ReportStatus } from "@/components/shared";
import { useOnline } from "@/lib/sync/status";
import { OFFLINE_MESSAGE, deleteTopic, saveTopic, type ReportLite, type Topic, type TopicInput } from "../api";
import { dateDe } from "../stats";

export function TopicsTab({ topics, professionId, canEdit, linksByTopic, reports }: {
  topics: Topic[]; professionId: string | null; canEdit: boolean; linksByTopic: Map<string, string[]>; reports: ReportLite[];
}) {
  const qc = useQueryClient();
  const online = useOnline();
  const navigate = useNavigate();
  const [form, setForm] = useState<TopicInput | null>(null);
  const [del, setDel] = useState<Topic | null>(null);
  const [drill, setDrill] = useState<Topic | null>(null);
  const [saving, setSaving] = useState(false);
  const reportById = new Map(reports.map((r) => [r.id, r]));
  const sorted = [...topics].sort((a, b) => (a.target_year ?? 9) - (b.target_year ?? 9) || a.sort_order - b.sort_order || a.title.localeCompare(b.title, "de"));
  const groups = [...new Set(sorted.map((t) => t.target_year))];

  const submit = async () => {
    if (!form) return;
    if (!form.title.trim()) { toast.error("Titel ist Pflicht"); return; }
    setSaving(true);
    try {
      await saveTopic(form);
      toast.success("Gespeichert");
      setForm(null);
      await qc.invalidateQueries({ queryKey: ["plan"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      {canEdit && professionId && !form && (
        <Button onClick={() => setForm({ profession_id: professionId, code: "", title: "", description: "", target_year: null, sort_order: topics.length })} disabled={!online} title={online ? undefined : OFFLINE_MESSAGE}>
          <Plus className="size-4" aria-hidden /> Neues Thema
        </Button>
      )}
      {form && (
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h3 className="font-semibold">{form.id ? "Thema bearbeiten" : "Neues Thema"}</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="t-code">Code</Label><Input id="t-code" placeholder="z. B. 1.3a" maxLength={50} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="t-title">Titel *</Label><Input id="t-title" maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Ziel-Ausbildungsjahr</Label>
              <Select value={form.target_year ? String(form.target_year) : "none"} onValueChange={(v) => setForm({ ...form, target_year: v === "none" ? null : Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {[1, 2, 3, 4].map((y) => <SelectItem key={y} value={String(y)}>{y}. Jahr</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="t-sort">Reihenfolge</Label><Input id="t-sort" type="number" min={0} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="t-desc">Beschreibung</Label><Textarea id="t-desc" maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={submit} disabled={saving || !online}>Speichern</Button>
            <Button variant="ghost" onClick={() => setForm(null)}>Abbrechen</Button>
          </div>
        </section>
      )}
      {!sorted.length && <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Für diesen Beruf sind noch keine Themen angelegt.</p>}
      {groups.map((y) => (
        <section key={String(y)} className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">{y ? `${y}. Ausbildungsjahr` : "Ohne Zieljahr"}</h3>
          <ul className="space-y-2">
            {sorted.filter((t) => t.target_year === y).map((t) => {
              const n = linksByTopic.get(t.id)?.length ?? 0;
              return (
                <li key={t.id} className="rounded-2xl border bg-card p-4 shadow-sm">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{t.code && <span className="mr-1.5 text-primary">{t.code}</span>}{t.title}{t.target_year && <Badge variant="secondary" className="ml-2">J{t.target_year}</Badge>}</p>
                      {t.description && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{t.description}</p>}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setDrill(t)} disabled={!n}>{n === 1 ? "1 Bericht" : `${n} Berichte`}</Button>
                    {canEdit && (
                      <>
                        <Button variant="ghost" size="icon" aria-label="Bearbeiten" disabled={!online} onClick={() => setForm({ id: t.id, profession_id: t.profession_id, code: t.code ?? "", title: t.title, description: t.description ?? "", target_year: t.target_year, sort_order: t.sort_order })}><Pencil className="size-4" /></Button>
                        <Button variant="ghost" size="icon" aria-label="Löschen" disabled={!online} onClick={() => setDel(t)}><Trash2 className="size-4" /></Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Thema löschen?" description="Verknüpfungen mit Berichten werden ebenfalls entfernt." confirmLabel="Löschen" destructive
        onConfirm={async () => { if (!del) return; try { await deleteTopic(del.id); toast.success("Gelöscht"); await qc.invalidateQueries({ queryKey: ["plan"] }); } catch (e) { toast.error(e instanceof Error ? e.message : "Löschen fehlgeschlagen"); } setDel(null); }} />
      <ResponsiveDialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)} title={drill ? `${drill.title} · ${linksByTopic.get(drill.id)?.length ?? 0} Einträge` : ""}>
        <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
          {(drill ? linksByTopic.get(drill.id) ?? [] : []).map((id) => reportById.get(id)).filter(Boolean).map((r) => (
            <li key={r!.id}>
              <button type="button" onClick={() => { setDrill(null); void navigate({ to: "/reports/$id", params: { id: r!.id } }); }} className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm hover:bg-accent">
                <span>{r!.report_type === "weekly" && r!.week_number ? `KW ${r!.week_number}/${String(r!.year).slice(-2)}` : dateDe(new Date(`${r!.report_date}T00:00:00`))}</span>
                <StatusBadge status={r!.status as ReportStatus} />
              </button>
            </li>
          ))}
        </ul>
      </ResponsiveDialog>
    </div>
  );
}

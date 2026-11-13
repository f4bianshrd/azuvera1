import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveDialog } from "@/components/dialogs";
import { useOnline } from "@/lib/sync/status";
import { OFFLINE_MESSAGE, saveDraft, submitInstruction, type InstructionData, type InstructionRecord } from "../api";
import { berlinToday } from "../due";
import { topicById } from "../model";

const OWN = "__own";
const REQUIRED = "Bitte fülle alle Pflichtfelder aus.";

export interface RecordDialogInit { record?: InstructionRecord | null; topicId?: string | null; date?: string | null }

export function RecordDialog({ open, onOpenChange, data, init, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; data: InstructionData; init: RecordDialogInit; onSaved: () => void;
}) {
  const online = useOnline();
  const today = berlinToday();
  const [topicSel, setTopicSel] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [duration, setDuration] = useState("");
  const [instructor, setInstructor] = useState("");
  const [notes, setNotes] = useState("");
  const [points, setPoints] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const r = init.record;
    setTopicSel(r ? r.topic_id ?? OWN : init.topicId ?? "");
    setTitle(r && !r.topic_id ? r.title : "");
    setDate(r?.given_on ?? init.date ?? today);
    setDuration(r?.duration_minutes ? String(r.duration_minutes) : "");
    setInstructor(r?.instructor_name ?? "");
    setNotes(r?.notes ?? "");
    setPoints(new Set(r ? data.recordPoints.filter((p) => p.record_id === r.id).map((p) => p.point_id) : []));
    setErrors({});
  }, [open, init, data.recordPoints, today]);

  const groups = useMemo(() => {
    const m = new Map<string, { id: string; title: string }[]>();
    for (const c of data.catalogs) for (const t of c.topics) {
      if (!t.is_active && t.id !== init.record?.topic_id) continue;
      m.set(t.category, [...(m.get(t.category) ?? []), { id: t.id, title: t.title }]);
    }
    return [...m.entries()];
  }, [data.catalogs, init.record]);
  const topic = topicSel && topicSel !== OWN ? topicById(data, topicSel) : null;
  const topicPoints = (topic?.points ?? []).filter((p) => p.is_active || points.has(p.id));

  const changeTopic = (v: string) => { setTopicSel(v); setPoints(new Set()); };
  const toggle = (id: string, on: boolean) => setPoints((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!topicSel) e["topic"] = REQUIRED;
    if (topicSel === OWN && (title.trim().length < 1 || title.trim().length > 200)) e["title"] = REQUIRED;
    if (!date) e["date"] = REQUIRED;
    else if (date > today) e["date"] = "Das Datum darf nicht in der Zukunft liegen.";
    const d = duration.trim() ? Number(duration) : null;
    if (d !== null && (!Number.isInteger(d) || d < 5 || d > 480)) e["duration"] = "Die Dauer muss zwischen 5 und 480 Minuten liegen.";
    if (!instructor.trim()) e["instructor"] = REQUIRED;
    if (notes.length > 2000) e["notes"] = "Die Notiz darf höchstens 2000 Zeichen lang sein.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async (submit: boolean) => {
    if (!validate()) return;
    setBusy(true);
    try {
      const id = await saveDraft({
        id: init.record?.id, topic_id: topic?.id ?? null, title: topic ? topic.title : title.trim(), given_on: date,
        duration_minutes: duration.trim() ? Number(duration) : null, instructor_name: instructor, notes: notes || null, point_ids: [...points],
      });
      if (submit) { await submitInstruction(id); toast.success("Eingereicht"); }
      else toast.success("Entwurf gespeichert");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally { setBusy(false); }
  };

  const err = (k: string) => errors[k] ? <p className="text-sm text-destructive" role="alert">{errors[k]}</p> : null;
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Unterweisung eintragen">
      <div className="max-h-[72vh] space-y-4 overflow-y-auto pr-1">
        <div className="space-y-1.5">
          <Label htmlFor="ins-topic">Thema *</Label>
          <Select value={topicSel} onValueChange={changeTopic}>
            <SelectTrigger id="ins-topic" aria-invalid={!!errors["topic"]}><SelectValue placeholder="Thema wählen" /></SelectTrigger>
            <SelectContent>
              {groups.map(([cat, items]) => (
                <SelectGroup key={cat}><SelectLabel>{cat}</SelectLabel>{items.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}</SelectGroup>
              ))}
              <SelectGroup><SelectItem value={OWN}>Eigenes Thema</SelectItem></SelectGroup>
            </SelectContent>
          </Select>
          {err("topic")}
        </div>
        {topicSel === OWN && (
          <div className="space-y-1.5"><Label htmlFor="ins-title">Titel *</Label><Input id="ins-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors["title"]} />{err("title")}</div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="ins-date">Datum *</Label><Input id="ins-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={!!errors["date"]} />{err("date")}</div>
          <div className="space-y-1.5"><Label htmlFor="ins-dur">Dauer in Minuten</Label><Input id="ins-dur" type="number" inputMode="numeric" min={5} max={480} value={duration} onChange={(e) => setDuration(e.target.value)} aria-invalid={!!errors["duration"]} />{err("duration")}</div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="ins-who">Unterweisende Person *</Label><Input id="ins-who" maxLength={120} placeholder="z. B. Ausbilder Meier" value={instructor} onChange={(e) => setInstructor(e.target.value)} aria-invalid={!!errors["instructor"]} />{err("instructor")}</div>
        {topic && topicPoints.length > 0 && (
          <fieldset className="space-y-2 rounded-xl border p-3">
            <div className="flex items-center justify-between gap-2">
              <legend className="text-sm font-medium">Besprochene Inhalte</legend>
              <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setPoints(new Set(topicPoints.slice(0, 40).map((p) => p.id)))}>Alle auswählen</Button>
            </div>
            {topicPoints.map((p) => (
              <label key={p.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-1 py-1.5 text-sm hover:bg-muted/50">
                <Checkbox className="mt-0.5" checked={points.has(p.id)} onCheckedChange={(v) => toggle(p.id, v === true)} />
                <span>{p.label}</span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="space-y-1.5"><Label htmlFor="ins-notes">Notiz</Label><Textarea id="ins-notes" rows={3} maxLength={2000} placeholder="z. B. Betriebsanweisung gezeigt" value={notes} onChange={(e) => setNotes(e.target.value)} />{err("notes")}</div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void save(false)}>Als Entwurf speichern</Button>
          <Button className="min-h-11" disabled={busy || !online} title={online ? undefined : OFFLINE_MESSAGE} onClick={() => void save(true)}>Zur Bestätigung einreichen</Button>
        </div>
        {!online && <p className="text-right text-xs text-muted-foreground">{OFFLINE_MESSAGE}</p>}
      </div>
    </ResponsiveDialog>
  );
}

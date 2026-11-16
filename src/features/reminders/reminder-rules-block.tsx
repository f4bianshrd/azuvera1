import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getReminderRules, saveReminderRules, type ReminderRules } from "./api";

const DAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];

function Day({ id, value, onChange }: { id: string; value: number; onChange: (v: number) => void }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger id={id} className="h-11 w-40"><SelectValue /></SelectTrigger>
      <SelectContent>{DAYS.map((d, i) => <SelectItem key={d} value={String(i + 1)}>{d}</SelectItem>)}</SelectContent>
    </Select>
  );
}
function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label htmlFor={htmlFor}>{label}</Label>{children}</div>;
}
function Group({ title, help, toggle, children }: { title: string; help?: string; toggle?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center justify-between gap-4"><h3 className="font-medium">{title}</h3>{toggle}</div>
      {help && <p className="mt-1 text-xs text-muted-foreground">{help}</p>}
      <div className="mt-3 flex flex-wrap gap-4">{children}</div>
    </div>
  );
}

/** „Tage vor Ende des Lehrjahres“: 1 bis 5 Werte von 1 bis 365 als Chips. */
function DaysBefore({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const n = Number(draft);
    if (!Number.isInteger(n) || n < 1 || n > 365) { toast.error("Bitte eine ganze Zahl von 1 bis 365 eingeben."); return; }
    if (value.length >= 5) { toast.error("Höchstens 5 Werte."); return; }
    onChange([...new Set([...value, n])].sort((a, b) => b - a));
    setDraft("");
  };
  return <div className="space-y-1.5">
    <Label htmlFor="rr-exp-days">Tage vor Ende des Lehrjahres</Label>
    <div className="flex flex-wrap items-center gap-2">
      {value.map((d) => <Button key={d} type="button" size="sm" variant="secondary" aria-label={`${d} Tage entfernen`} disabled={value.length <= 1} onClick={() => onChange(value.filter((x) => x !== d))}>{d} ×</Button>)}
      <Input id="rr-exp-days" type="number" min={1} max={365} step={1} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} className="h-11 w-24 text-base" />
      <Button type="button" size="sm" variant="outline" onClick={add} disabled={value.length >= 5}>Hinzufügen</Button>
    </div>
  </div>;
}

export function ReminderRulesBlock() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["app-settings", "reminder_rules"], queryFn: getReminderRules });
  const [r, setR] = useState<ReminderRules | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setR(data); }, [data]);
  if (!r) return null;
  const set = <K extends keyof ReminderRules>(k: K, v: ReminderRules[K]) => setR({ ...r, [k]: v });
  const time = (id: string, k: "deadline_time" | "soon_time" | "today_time" | "overdue_time" | "review_time" | "experience_time") =>
    <Input id={id} type="time" value={r[k]} onChange={(e) => set(k, e.target.value)} className="h-11 w-32 text-base" />;
  const num = (id: string, k: "overdue_every_days" | "overdue_max" | "review_after_days", min: number, max: number) =>
    <Input id={id} type="number" min={min} max={max} step={1} value={r[k]} onChange={(e) => set(k, Number(e.target.value))} className="h-11 w-24 text-base" />;

  const save = async () => {
    setBusy(true);
    try { await saveReminderRules(r); await qc.invalidateQueries({ queryKey: ["app-settings", "reminder_rules"] }); toast.success("Einstellungen gespeichert"); }
    catch (e) { toast.error((e as { message?: string })?.message || "Einstellungen konnten nicht gespeichert werden."); }
    finally { setBusy(false); }
  };

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Erinnerungen</h2>
        <div className="flex items-center gap-2"><Label htmlFor="rr-enabled" className="font-normal">Automatische Erinnerungen</Label><Switch id="rr-enabled" checked={r.enabled} onCheckedChange={(v) => set("enabled", v)} /></div>
      </div>
      <div className="mt-4 space-y-3">
        <Group title="Abgabefrist für Wochenberichte" help="Der Bericht einer Woche ist zu diesem Zeitpunkt der Folgewoche fällig.">
          <Field label="Wochentag" htmlFor="rr-dl-day"><Day id="rr-dl-day" value={r.deadline_weekday} onChange={(v) => set("deadline_weekday", v)} /></Field>
          <Field label="Uhrzeit" htmlFor="rr-dl-time">{time("rr-dl-time", "deadline_time")}</Field>
        </Group>
        <Group title="Hinweis vor der Frist" help="Erinnert Azubis, deren Bericht der laufenden Woche noch fehlt." toggle={<Switch aria-label="Hinweis vor der Frist" checked={r.soon_enabled} onCheckedChange={(v) => set("soon_enabled", v)} />}>
          <Field label="Wochentag" htmlFor="rr-soon-day"><Day id="rr-soon-day" value={r.soon_weekday} onChange={(v) => set("soon_weekday", v)} /></Field>
          <Field label="Uhrzeit" htmlFor="rr-soon-time">{time("rr-soon-time", "soon_time")}</Field>
        </Group>
        <Group title="Hinweis am Fristtag" toggle={<Switch aria-label="Hinweis am Fristtag" checked={r.today_enabled} onCheckedChange={(v) => set("today_enabled", v)} />}>
          <Field label="Uhrzeit" htmlFor="rr-today-time">{time("rr-today-time", "today_time")}</Field>
        </Group>
        <Group title="Erinnerung bei Überfälligkeit" toggle={<Switch aria-label="Erinnerung bei Überfälligkeit" checked={r.overdue_enabled} onCheckedChange={(v) => set("overdue_enabled", v)} />}>
          <Field label="Uhrzeit" htmlFor="rr-od-time">{time("rr-od-time", "overdue_time")}</Field>
          <Field label="Abstand in Tagen" htmlFor="rr-od-every">{num("rr-od-every", "overdue_every_days", 1, 14)}</Field>
          <Field label="Höchstens … Erinnerungen" htmlFor="rr-od-max">{num("rr-od-max", "overdue_max", 1, 10)}</Field>
        </Group>
        <Group title="Erinnerung an wartende Prüfungen" toggle={<Switch aria-label="Erinnerung an wartende Prüfungen" checked={r.review_enabled} onCheckedChange={(v) => set("review_enabled", v)} />}>
          <div className="space-y-1.5"><span className="text-sm font-medium">Wochentage</span>
            <div className="flex flex-wrap gap-2">{DAYS.map((d, i) => { const on = r.review_weekdays.includes(i + 1); return (
              <Button key={d} type="button" size="sm" variant={on ? "default" : "outline"} aria-pressed={on}
                onClick={() => set("review_weekdays", on ? r.review_weekdays.filter((x) => x !== i + 1) : [...r.review_weekdays, i + 1].sort())}>{d.slice(0, 2)}</Button>); })}</div>
          </div>
          <Field label="Uhrzeit" htmlFor="rr-rv-time">{time("rr-rv-time", "review_time")}</Field>
          <Field label="nach … Tagen" htmlFor="rr-rv-days">{num("rr-rv-days", "review_after_days", 1, 30)}</Field>
        </Group>
        <Group title="Erinnerung an Erfahrungsberichte" help="Erinnert Azubis, denen im laufenden Lehrjahr noch Erfahrungsberichte fehlen. Eingereichte Berichte zählen als erledigt."
          toggle={<Switch aria-label="Erinnerung an Erfahrungsberichte" checked={r.experience_enabled ?? true} onCheckedChange={(v) => set("experience_enabled", v)} />}>
          <Field label="Uhrzeit" htmlFor="rr-exp-time">{time("rr-exp-time", "experience_time")}</Field>
          <DaysBefore value={r.experience_days_before ?? [60, 30, 14]} onChange={(v) => set("experience_days_before", v)} />
        </Group>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Zeiten gelten in Deutschland. Push-Nachrichten beachten zusätzlich die persönlichen Ruhezeiten.</p>
      <Button className="mt-4 h-11" onClick={() => void save()} disabled={busy}>Speichern</Button>
    </section>
  );
}

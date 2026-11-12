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

export function ReminderRulesBlock() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["app-settings", "reminder_rules"], queryFn: getReminderRules });
  const [r, setR] = useState<ReminderRules | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setR(data); }, [data]);
  if (!r) return null;
  const set = <K extends keyof ReminderRules>(k: K, v: ReminderRules[K]) => setR({ ...r, [k]: v });
  const time = (id: string, k: "deadline_time" | "soon_time" | "today_time" | "overdue_time" | "review_time") =>
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
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Zeiten gelten in Deutschland. Push-Nachrichten beachten zusätzlich die persönlichen Ruhezeiten.</p>
      <Button className="mt-4 h-11" onClick={() => void save()} disabled={busy}>Speichern</Button>
    </section>
  );
}

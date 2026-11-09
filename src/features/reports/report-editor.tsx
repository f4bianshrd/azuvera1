import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Mic, Sparkles } from "lucide-react";
import {
  createDraft,
  saveReportDraft,
  ReportConflictError,
  type Report,
  type ReportDraftPatch,
  type ReportType,
  type WeeklyMode,
} from "./api";

export const SECTIONS = [
  { key: "activities" as const, label: "Tätigkeiten", placeholder: "Was wurde im Betrieb gemacht?", required: true },
  { key: "school_content" as const, label: "Berufsschule", placeholder: "Inhalte aus dem Unterricht", required: false },
  { key: "instructions" as const, label: "Unterweisungen", placeholder: "Sicherheits- und Fachunterweisungen", required: false },
  { key: "summary" as const, label: "Zusammenfassung / Reflexion", placeholder: "Was lief gut, was nehme ich mit?", required: false },
];

const ENCOURAGEMENT = [
  "Fang einfach mit einem Stichpunkt an.",
  "Guter Start – die Tätigkeiten stehen.",
  "Fast geschafft.",
  "Fast geschafft.",
  "Vollständig – du kannst einreichen.",
];

export function isoWeekOf(date: Date): { year: number; weekNumber: number; monday: Date } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const weekNumber = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const monday = new Date(date);
  monday.setDate(date.getDate() - (dayNum - 1));
  return { year, weekNumber, monday };
}

export interface EditorState {
  reportType: ReportType;
  weeklyMode: WeeklyMode;
  reportDate: string;
  activities: string;
  school_content: string;
  instructions: string;
  summary: string;
}

export function stateFromReport(r: Report): EditorState {
  return {
    reportType: r.report_type,
    weeklyMode: r.weekly_mode as WeeklyMode,
    reportDate: r.report_date,
    activities: r.activities ?? "",
    school_content: r.school_content ?? "",
    instructions: r.instructions ?? "",
    summary: r.summary ?? "",
  };
}

export function filledCount(s: EditorState): number {
  return [s.activities, s.school_content, s.instructions, s.summary].filter((v) => v.trim().length > 0).length;
}

/**
 * Editor mit Autosave: die erste Eingabe legt den Entwurf an (Geräte-UUID),
 * danach wird 3 Sekunden nach der letzten Änderung gespeichert.
 */
export function ReportEditor({
  azubiId,
  report,
  initial,
  lockTypeAndDate,
  onCreated,
  onSaved,
  onDirtyChange,
}: {
  azubiId: string;
  report: Report | null;
  initial: EditorState;
  /** Auf der Neuanlage-Seite wählbar, in der Detailansicht gesperrt. */
  lockTypeAndDate: boolean;
  onCreated: (r: Report) => void;
  onSaved: (r: Report) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<EditorState>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const reportRef = useRef<Report | null>(report);
  const stateRef = useRef(state);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  stateRef.current = state;
  reportRef.current = report;

  const patch: ReportDraftPatch = useMemo(
    () => ({
      weekly_mode: state.weeklyMode,
      report_date: state.reportDate,
      activities: state.activities,
      school_content: state.school_content,
      instructions: state.instructions,
      summary: state.summary,
    }),
    [state],
  );
  const patchRef = useRef(patch);
  patchRef.current = patch;

  const save = async () => {
    const current = reportRef.current;
    setStatus("saving");
    try {
      if (!current) {
        const created = await createDraft({
          id: crypto.randomUUID(),
          azubiId,
          reportType: stateRef.current.reportType,
          weeklyMode: stateRef.current.weeklyMode,
          reportDate: stateRef.current.reportDate,
        });
        reportRef.current = created;
        onCreated(created);
      }
      const saved = await saveReportDraft(reportRef.current.id, reportRef.current.version, patchRef.current);
      reportRef.current = saved;
      onSaved(saved);
      setStatus("saved");
      setSavedAt(new Date());
      onDirtyChange(false);
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
    } catch (e) {
      setStatus("idle");
      if (e instanceof ReportConflictError) toast.error(e.message);
      else toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  const schedule = () => {
    onDirtyChange(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void saveRef.current(), 3000);
  };

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
    schedule();
  };

  const today = format(new Date(), "yyyy-MM-dd");
  const week = isoWeekOf(new Date(state.reportDate + "T00:00:00"));

  const shiftWeek = (dir: -1 | 1) => {
    const monday = new Date(week.monday);
    monday.setDate(monday.getDate() + dir * 7);
    if (monday > new Date()) return;
    set("reportDate", format(monday, "yyyy-MM-dd"));
  };

  const filled = filledCount(state);

  return (
    <div className="space-y-5">
      {!lockTypeAndDate && (
        <div className="space-y-4 rounded-2xl border bg-card p-4">
          <div className="space-y-1.5">
            <Label>Berichtsart</Label>
            <div className="flex gap-2">
              {(["weekly", "daily"] as const).map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant={state.reportType === t ? "default" : "outline"}
                  size="sm"
                  onClick={() => set("reportType", t)}
                >
                  {t === "weekly" ? "Wochenbericht" : "Tagesbericht"}
                </Button>
              ))}
            </div>
          </div>

          {state.reportType === "weekly" ? (
            <>
              <div className="space-y-1.5">
                <Label>Woche</Label>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => shiftWeek(-1)}>
                    ←
                  </Button>
                  <span className="text-sm font-medium">
                    KW {week.weekNumber} · {format(week.monday, "dd.MM.")}–
                    {format(new Date(week.monday.getTime() + 6 * 86400000), "dd.MM.yyyy")}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => shiftWeek(1)}
                    disabled={new Date(week.monday.getTime() + 7 * 86400000) > new Date()}
                  >
                    →
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Berichtsform</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      { mode: "activities", label: "Tätigkeitsbericht", hint: "Chronologische Auflistung der Tätigkeiten der Woche." },
                      { mode: "topics", label: "Themenbericht", hint: "Ausführliche Beschreibung eines Schwerpunktthemas der Woche." },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.mode}
                      type="button"
                      onClick={() => set("weeklyMode", m.mode)}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors",
                        state.weeklyMode === m.mode ? "border-primary bg-primary/5" : "hover:bg-accent",
                      )}
                    >
                      <span className="text-sm font-medium">{m.label}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{m.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="report-date">Datum</Label>
              <input
                id="report-date"
                type="date"
                value={state.reportDate}
                max={today}
                onChange={(e) => set("reportDate", e.target.value)}
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{filled} von 4 Abschnitten ausgefüllt</span>
          <span className="text-muted-foreground">{ENCOURAGEMENT[filled]}</span>
        </div>
        <Progress value={(filled / 4) * 100} />
      </div>

      {SECTIONS.map((s) => (
        <div key={s.key} className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`sec-${s.key}`}>
              {s.label}
              {s.required && <span className="text-destructive"> *</span>}
            </Label>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" disabled title="Kommt mit Baustein 2B">
                <Mic className="size-4" aria-hidden /> Diktat
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled title="Kommt mit Baustein 2B">
                <Sparkles className="size-4" aria-hidden /> KI-Text
              </Button>
            </div>
          </div>
          <AutoTextarea
            id={`sec-${s.key}`}
            value={state[s.key]}
            placeholder={s.placeholder}
            maxLength={20000}
            onChange={(v) => set(s.key, v)}
          />
          <p className="text-right text-xs text-muted-foreground tabular-nums">
            {state[s.key].length.toLocaleString("de-DE")} / 20.000
          </p>
        </div>
      ))}

      <p className="text-xs text-muted-foreground" role="status">
        {status === "saving" ? "Speichert…" : savedAt ? `Gespeichert um ${format(savedAt, "HH:mm")}` : "Änderungen werden automatisch gespeichert."}
      </p>
    </div>
  );
}

function AutoTextarea({
  value,
  onChange,
  ...props
}: {
  value: string;
  onChange: (v: string) => void;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <Textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-28 resize-none overflow-hidden"
      {...props}
    />
  );
}

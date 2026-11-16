import { useEffect, useRef, useState, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { DictationButton } from "@/features/dictation/dictation-button";
import { readPunctuationPreference } from "@/features/dictation/api";
import { createExperienceDraft, saveExperienceDraft, type Experience, type ExperienceDraft, type ExperienceKind } from "../api";
import { berlinToday, KIND_HINTS, KIND_LABELS, KINDS, leittextCounts, wordCount } from "../model";
import { formatPages, pageUnitLabel, wordsForPages, type ExperienceRequirement } from "../requirements";

const ENCOURAGEMENT = ["Fang einfach mit einem Stichpunkt an.", "Guter Start.", "Fast geschafft.", "Fast geschafft.", "Vollständig – du kannst einreichen."];

export function draftFrom(r: Experience | null): ExperienceDraft {
  return r
    ? { kind: r.kind as ExperienceKind, title: r.title, area: r.area, written_on: r.written_on, body: r.body, reasoning: r.reasoning }
    : { kind: "erfahrungsbericht", title: "", area: "", written_on: berlinToday(), body: "", reasoning: "" };
}

export interface EditorHandle { flush: () => Promise<Experience | null> }

/** Editor mit Autosave: die erste Eingabe legt den Entwurf an (Geräte-UUID), danach 3 Sekunden nach der letzten Änderung. */
export function ExperienceEditor({ azubiId, report, requirement, onSaved, onDirtyChange, handleRef }: {
  azubiId: string;
  report: Experience | null;
  requirement: ExperienceRequirement | null;
  onSaved: (r: Experience) => void;
  onDirtyChange: (dirty: boolean) => void;
  handleRef?: RefObject<EditorHandle | null>;
}) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ExperienceDraft>(() => draftFrom(report));
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [punctuation, setPunctuation] = useState(true);
  const [interim, setInterim] = useState({ body: "", reasoning: "" });
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const reasoningRef = useRef<HTMLTextAreaElement>(null);
  const reportRef = useRef<Experience | null>(report);
  const stateRef = useRef(state);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  stateRef.current = state;
  reportRef.current = reportRef.current ?? report;

  const save = async (): Promise<Experience | null> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!dirtyRef.current && reportRef.current) return reportRef.current;
    setStatus("saving");
    try {
      const current = reportRef.current;
      const saved = current ? await saveExperienceDraft(current.id, stateRef.current) : await createExperienceDraft(crypto.randomUUID(), azubiId, stateRef.current);
      reportRef.current = saved;
      dirtyRef.current = false;
      onSaved(saved);
      onDirtyChange(false);
      setSavedAt(new Date());
      await queryClient.invalidateQueries({ queryKey: ["experience"] });
      return saved;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
      return null;
    } finally { setStatus("idle"); }
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  if (handleRef) handleRef.current = { flush: () => saveRef.current() };

  useEffect(() => {
    setPunctuation(readPunctuationPreference());
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  const set = <K extends keyof ExperienceDraft>(key: K, value: ExperienceDraft[K]) => {
    setState((s) => ({ ...s, [key]: value }));
    dirtyRef.current = true;
    onDirtyChange(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveRef.current(), 3000);
  };

  const filled = [state.title, state.written_on, state.body, state.reasoning].filter((v) => v.trim().length > 0).length;
  const words = wordCount(state.body);
  const minPages = requirement?.min_pages != null ? Number(requirement.min_pages) : null;
  const target = minPages != null ? wordsForPages(minPages, requirement!.page_unit) : null;
  const weight = requirement?.leittext_weight ?? 0;
  const today = berlinToday();

  const textArea = (key: "body" | "reasoning", ref: RefObject<HTMLTextAreaElement | null>, label: string, hint: string, required: boolean) => <div className="space-y-1.5">
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={`exp-${key}`}>{label}{required && <span className="text-destructive"> *</span>}</Label>
      <DictationButton textareaRef={ref} getValue={() => stateRef.current[key]} onValueChange={(v) => set(key, v)} onInterim={(t) => setInterim((c) => ({ ...c, [key]: t }))} spokenPunctuation={punctuation} />
    </div>
    <p id={`exp-${key}-hint`} className="text-xs text-muted-foreground">{hint}</p>
    <AutoTextarea id={`exp-${key}`} aria-describedby={`exp-${key}-hint`} textareaRef={ref} value={state[key]} maxLength={20000} onChange={(v) => set(key, v)} />
    {interim[key] && <p className="text-sm italic text-muted-foreground">{interim[key]}</p>}
    <p className="text-right text-xs tabular-nums text-muted-foreground">{wordCount(state[key]).toLocaleString("de-DE")} Wörter · {state[key].length.toLocaleString("de-DE")} / 20.000</p>
  </div>;

  return <div className="space-y-5">
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">{filled} von 4 Angaben ausgefüllt</span><span className="text-muted-foreground">{ENCOURAGEMENT[filled]}</span></div>
      <Progress value={(filled / 4) * 100} aria-label={`${filled} von 4 Angaben ausgefüllt`} />
    </div>

    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Art</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {KINDS.map((k) => <button key={k} type="button" aria-pressed={state.kind === k} onClick={() => set("kind", k)}
          className={cn("min-h-11 rounded-xl border p-3 text-left transition-colors", state.kind === k ? "border-primary bg-primary/5" : "hover:bg-accent")}>
          <span className="text-sm font-medium">{KIND_LABELS[k]}</span><span className="mt-0.5 block text-xs text-muted-foreground">{KIND_HINTS[k]}</span>
        </button>)}
      </div>
      {state.kind === "leittext" && <p className="text-sm text-muted-foreground">{weight > 0 ? `Zählt bei deinem Bundesland und Beruf als ${leittextCounts(weight)}.` : "Zählt bei deinem Bundesland und Beruf nicht zum Ziel."}</p>}
    </fieldset>

    <div className="space-y-1.5">
      <Label htmlFor="exp-title">Thema / Titel<span className="text-destructive"> *</span></Label>
      <Input id="exp-title" value={state.title} maxLength={150} placeholder="Zum Beispiel: Pflanzenschutz im Winterweizen" onChange={(e) => set("title", e.target.value)} className="h-11" />
      <p className="text-right text-xs tabular-nums text-muted-foreground">{state.title.length} / 150</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="exp-area">Bereich im Betrieb</Label>
        <Input id="exp-area" value={state.area} maxLength={80} placeholder="Zum Beispiel: Ackerbau, Zierpflanzenbau, Reitschule" onChange={(e) => set("area", e.target.value)} className="h-11" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="exp-date">Datum<span className="text-destructive"> *</span></Label>
        <input id="exp-date" type="date" value={state.written_on} max={today} onChange={(e) => e.target.value && set("written_on", e.target.value > today ? today : e.target.value)}
          className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm" />
      </div>
    </div>

    {textArea("body", bodyRef, "Bericht", "Beschreibe genau: Was wurde gemacht? Wie, womit und mit wem? Wann und wo im Betrieb?", true)}
    {target != null && minPages != null && <div className="space-y-1">
      <p className="text-sm text-muted-foreground">Richtwert deiner zuständigen Stelle: mindestens {formatPages(minPages)} {pageUnitLabel(minPages, requirement!.page_unit)}, etwa {target} Wörter</p>
      <Progress value={Math.min(100, (words / target) * 100)} className="h-1.5" aria-label={`${words} von etwa ${target} Wörtern`} />
    </div>}
    {textArea("reasoning", reasoningRef, "Begründung und Bewertung", "Warum wurde es so gemacht? Was hast du daraus gelernt? Was würdest du anders machen?", false)}

    <p className="text-xs text-muted-foreground" role="status">{status === "saving" ? "Speichert…" : savedAt ? `Gespeichert um ${format(savedAt, "HH:mm")}` : "Änderungen werden automatisch gespeichert."}</p>
  </div>;
}

function AutoTextarea({ value, onChange, textareaRef, ...props }: { value: string; onChange: (v: string) => void; textareaRef: RefObject<HTMLTextAreaElement | null> }
  & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, textareaRef]);
  return <Textarea ref={textareaRef} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-32 resize-none overflow-hidden" {...props} />;
}

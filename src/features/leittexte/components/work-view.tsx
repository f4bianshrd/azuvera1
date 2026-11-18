import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, BookOpenText, Check, ExternalLink, Eye, FileDown, Loader2, MessageSquare, PencilLine, RotateCcw, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ConfirmDialog } from "@/components/dialogs";
import { StatusBadge } from "@/components/shared";
import { SyncBadge } from "@/features/sync/sync-badge";
import { openExternal, getNetworkStatus } from "@/lib/platform";
import { cn } from "@/lib/utils";
import {
  addComment, approveWork, canReview, deleteWork, listComments, personHeader, rejectWork, reopenWork, saveWork, submitWork, subscribeToComments,
  type Leittext, type Work, type WorkImage,
} from "../api";
import { answerKey, progress, taskDone, type AnswerValue, type Answers, type WorkHeader } from "../model";
import { downloadLeittextPdf } from "../export";
import { LeittextFieldView } from "./fields";

interface Props { leittext: Leittext; work: Work | null; images: WorkImage[]; own: boolean; onChanged: () => void }

export function LeittextSource({ leittext }: { leittext: Leittext }) {
  return (
    <p className="text-xs text-muted-foreground">
      Quelle: {leittext.issuer}{leittext.stand ? `, Stand ${leittext.stand}` : ""}{leittext.order_no ? `, Bestell-Nr. ${leittext.order_no}` : ""} ·{" "}
      <button type="button" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline" onClick={() => openExternal(leittext.source_url)}>
        Original-PDF <ExternalLink className="size-3" aria-hidden />
      </button>
    </p>
  );
}

export function WorkView({ leittext, work, images, own, onChanged }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canEditStatus = own && !!work && (work.status === "draft" || work.status === "rejected") && !work._submit_pending;
  const [mode, setMode] = useState<"edit" | "view">(canEditStatus ? "edit" : "view");
  const editable = canEditStatus && mode === "edit";
  const [answers, setAnswers] = useState<Answers>(work?.answers ?? {});
  const [header, setHeader] = useState<WorkHeader>(work?.header ?? {});
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    // Nur beim Öffnen bzw. Statuswechsel übernehmen – sonst überschreibt die Synchronisation das Tippen.
    const sig = `${work?.id}:${work?.status}:${work?._submit_pending}`;
    if (seeded.current === sig) return;
    seeded.current = sig;
    setAnswers(work?.answers ?? {});
    setHeader(work?.header ?? {});
    if (!canEditStatus) setMode("view");
  }, [work?.id, work?.status, work?._submit_pending, canEditStatus, work?.answers, work?.header]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ answers?: Answers; header?: WorkHeader }>({});
  const flush = async () => {
    if (!work || !Object.keys(pending.current).length) return;
    const patch = pending.current; pending.current = {};
    try { await saveWork(work.id, patch); } catch (e) { toast.error(e instanceof Error ? e.message : "Konnte nicht speichern."); }
  };
  const queueSave = (patch: { answers?: Answers; header?: WorkHeader }) => {
    pending.current = { ...pending.current, ...patch };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 600);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); void flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setAnswer = (key: string, v: AnswerValue) => setAnswers((prev) => { const next = { ...prev, [key]: v }; queueSave({ answers: next }); return next; });
  const setHead = (patch: WorkHeader) => setHeader((prev) => { const next = { ...prev, ...patch }; queueSave({ header: next }); return next; });

  const imageCounts = useMemo(() => images.reduce<Record<string, number>>((m, i) => ({ ...m, [i.field_key]: (m[i.field_key] ?? 0) + 1 }), {}), [images]);
  const prog = progress(leittext.content, answers, imageCounts);
  const person = useQuery({ queryKey: ["leittexte", "person", work?.azubi_id], queryFn: () => personHeader(work!.azubi_id), enabled: !!work });
  const reviewer = useQuery({ queryKey: ["leittexte", "can-review", work?.azubi_id], queryFn: () => canReview(work!.azubi_id), enabled: !!work && !own });

  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"submit" | "delete" | null>(null);
  const run = async (key: string, fn: () => Promise<void>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) toast.success(ok); onChanged(); void qc.invalidateQueries({ queryKey: ["leittexte"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Das hat nicht geklappt."); }
    finally { setBusy(null); }
  };

  const intro = leittext.content.intro ?? {};
  const introItems: [string, string, string | string[] | undefined][] = [
    ["worum", "Worum geht's?", intro.worum], ["lernen", "Was kann ich hier lernen?", intro.lernen],
    ["brauchen", "Was brauche ich für die Durchführung?", intro.brauchen], ["helfen", "Was kann mir noch helfen?", intro.helfen], ["vorgehen", "So gehst du vor", intro.vorgehen],
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2"><Link to="/leittexte"><ArrowLeft className="size-4" aria-hidden /> Alle Leittexte</Link></Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Leittext{leittext.topic ? ` · ${leittext.topic}` : ""}</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{leittext.title}</h1>
            <LeittextSource leittext={leittext} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {work && <StatusBadge status={work.status} />}
            {work && <SyncBadge state={work._sync} submitPending={work._submit_pending} />}
          </div>
        </div>
        {work && (
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-48 flex-1">
                <div className="mb-1.5 flex justify-between text-sm"><span className="font-medium">Fortschritt</span><span className="text-muted-foreground">{prog.done} von {prog.total} Aufgaben</span></div>
                <Progress value={prog.percent} aria-label={`${prog.percent} Prozent bearbeitet`} />
              </div>
              <div className="flex flex-wrap gap-2">
                {canEditStatus && (
                  <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label="Ansicht wählen">
                    <Button size="sm" variant={mode === "edit" ? "default" : "ghost"} onClick={() => setMode("edit")} aria-pressed={mode === "edit"}><PencilLine className="size-4" aria-hidden /> Bearbeiten</Button>
                    <Button size="sm" variant={mode === "view" ? "default" : "ghost"} onClick={() => { void flush(); setMode("view"); }} aria-pressed={mode === "view"}><Eye className="size-4" aria-hidden /> Ansehen</Button>
                  </div>
                )}
                <Button size="sm" variant="outline" disabled={busy === "pdf"} onClick={() => run("pdf", async () => { await flush(); await downloadLeittextPdf(leittext, { ...work, answers, header }, images, work.azubi_id); }, "PDF erstellt.")}>
                  {busy === "pdf" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileDown className="size-4" aria-hidden />} PDF
                </Button>
                {canEditStatus && (<>
                  <Button size="sm" disabled={busy === "submit" || prog.done === 0} onClick={() => setConfirm("submit")}><Send className="size-4" aria-hidden /> Einreichen</Button>
                  <ConfirmDialog open={confirm === "submit"} onOpenChange={(o) => !o && setConfirm(null)}
                    title="Leittext einreichen?"
                    description="Danach kannst du ihn nicht mehr ändern, bis er geprüft wurde. Deine Ausbilderin oder dein Ausbilder wird benachrichtigt."
                    confirmLabel="Einreichen"
                    onConfirm={() => run("submit", async () => { await flush(); await submitWork(work.id); }, getNetworkStatus().online ? "Eingereicht." : "Wird eingereicht, sobald du online bist.")}
                  />
                </>)}
              </div>
            </div>
          </div>
        )}
        {work?.status === "rejected" && work.review_note && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm"><p className="font-semibold">Zurückgegeben – bitte überarbeiten</p><p className="mt-1 whitespace-pre-line">{work.review_note}</p></div>
        )}
      </div>

      {work && (
        <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="kopf">
          <h2 id="kopf" className="mb-3 font-semibold">Angaben</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="text-xs text-muted-foreground">Auszubildende:r</p><p className="font-medium">{person.data?.name || "–"}</p></div>
            <div><p className="text-xs text-muted-foreground">Ausbildungsbetrieb</p><p className="font-medium">{person.data?.company || "–"}</p></div>
            {editable ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label htmlFor="von">Bearbeitet von</Label><Input id="von" type="date" value={header.zeitraum_von ?? ""} onChange={(e) => setHead({ zeitraum_von: e.target.value })} /></div>
                  <div className="space-y-1"><Label htmlFor="bis">bis</Label><Input id="bis" type="date" value={header.zeitraum_bis ?? ""} onChange={(e) => setHead({ zeitraum_bis: e.target.value })} /></div>
                </div>
                <div className="space-y-1"><Label htmlFor="zus">Zusammenarbeit mit</Label><Input id="zus" value={header.zusammenarbeit ?? ""} maxLength={200} onChange={(e) => setHead({ zusammenarbeit: e.target.value })} placeholder="z. B. Herr Meier (Ausbilder)" /></div>
              </>
            ) : (
              <>
                <div><p className="text-xs text-muted-foreground">Zeitraum der Bearbeitung</p><p className="font-medium">{[header.zeitraum_von, header.zeitraum_bis].filter(Boolean).map((d) => new Date(`${d}T00:00:00`).toLocaleDateString("de-DE")).join(" bis ") || "–"}</p></div>
                <div><p className="text-xs text-muted-foreground">Zusammenarbeit mit</p><p className="font-medium">{header.zusammenarbeit || "–"}</p></div>
              </>
            )}
          </div>
        </section>
      )}

      {introItems.some(([, , v]) => v && (!Array.isArray(v) || v.length)) && (
        <Accordion type="multiple" defaultValue={work ? [] : ["worum"]} className="rounded-2xl border bg-card px-4 shadow-sm">
          {introItems.filter(([, , v]) => v && (!Array.isArray(v) || v.length)).map(([k, title, v]) => (
            <AccordionItem key={k} value={k}>
              <AccordionTrigger className="text-left"><span className="inline-flex items-center gap-2"><BookOpenText className="size-4 text-primary" aria-hidden />{title}</span></AccordionTrigger>
              <AccordionContent>
                {Array.isArray(v) ? <ul className="list-disc space-y-1 pl-5 text-sm">{v.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="whitespace-pre-line text-sm leading-relaxed">{v}</p>}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Abschnitte" className="hidden lg:block">
          <ol className="sticky top-20 space-y-1 text-sm">
            {leittext.content.sections.map((s, i) => {
              const tasks = s.tasks.filter((t) => t.fields.some((f) => f.type !== "info"));
              const done = tasks.filter((t) => taskDone(t, answers, imageCounts)).length;
              return (
                <li key={i}>
                  <a href={`#abschnitt-${i}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-muted">
                    <span className="truncate">{s.title}</span>
                    {work && tasks.length > 0 && <span className={cn("shrink-0 text-xs", done === tasks.length ? "text-primary" : "text-muted-foreground")}>{done === tasks.length ? <Check className="size-4" aria-label="fertig" /> : `${done}/${tasks.length}`}</span>}
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="space-y-8">
          {leittext.content.sections.map((s, i) => (
            <section key={i} id={`abschnitt-${i}`} aria-labelledby={`abschnitt-titel-${i}`} className="scroll-mt-20 space-y-4">
              <h2 id={`abschnitt-titel-${i}`} className="border-b-2 border-primary pb-1.5 text-lg font-semibold">{s.title}</h2>
              {s.tasks.map((t) => (
                <article key={t.key} id={`aufgabe-${t.key}`} className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
                  <div className="flex gap-3">
                    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold", work && taskDone(t, answers, imageCounts) ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")} aria-hidden>{t.number}</span>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <p className="font-medium leading-snug whitespace-pre-line">{t.prompt}</p>
                        {t.hint && <p className="mt-1 text-sm text-muted-foreground whitespace-pre-line">{t.hint}</p>}
                      </div>
                      {t.fields.map((f) => (
                        <LeittextFieldView key={f.key} field={f} answerKey={answerKey(t, f)} value={answers[answerKey(t, f)]} onChange={(v) => setAnswer(answerKey(t, f), v)}
                          editable={editable} images={images} {...(work ? { work: { id: work.id, azubi_id: work.azubi_id } } : {})} onImagesChanged={onChanged} />
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
      </div>

      {work && !own && reviewer.data && <ReviewPanel work={work} busy={busy} run={run} />}
      {work && work.status !== "draft" && <Comments workId={work.id} canWrite={own || !!reviewer.data} />}

      {own && work?.status === "draft" && !work._submit_pending && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirm("delete")}><Trash2 className="size-4" aria-hidden /> Bearbeitung löschen</Button>
          <ConfirmDialog open={confirm === "delete"} onOpenChange={(o) => !o && setConfirm(null)}
            title="Bearbeitung löschen?" description="Alle Antworten und Bilder dieses Leittextes werden gelöscht." confirmLabel="Löschen" destructive
            onConfirm={() => run("delete", async () => { await deleteWork(work.id); await navigate({ to: "/leittexte" }); }, "Gelöscht.")}
          />
        </div>
      )}
    </div>
  );
}

function ReviewPanel({ work, busy, run }: { work: Work; busy: string | null; run: (k: string, fn: () => Promise<void>, ok?: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  if (work.status === "submitted") {
    return (
      <section className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-4 sm:p-5" aria-labelledby="pruefen">
        <h2 id="pruefen" className="font-semibold">Leittext prüfen</h2>
        <p className="mt-1 text-sm text-muted-foreground">Gib den Leittext frei oder gib ihn mit einer Begründung zur Überarbeitung zurück.</p>
        <Label htmlFor="note" className="mt-3 block">Notiz (beim Zurückgeben Pflicht)</Label>
        <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} className="mt-1" />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={!!busy} onClick={() => run("approve", () => approveWork(work.id, work.version, note.trim() || undefined), "Freigegeben.")}><Check className="size-4" aria-hidden /> Freigeben</Button>
          <Button variant="outline" disabled={!!busy || note.trim().length < 3} onClick={() => run("reject", () => rejectWork(work.id, work.version, note), "Zurückgegeben.")}><RotateCcw className="size-4" aria-hidden /> Zurückgeben</Button>
        </div>
      </section>
    );
  }
  if (work.status === "approved") {
    return (
      <section className="rounded-2xl border bg-card p-4 sm:p-5" aria-labelledby="wieder">
        <h2 id="wieder" className="font-semibold">Wieder zur Bearbeitung öffnen</h2>
        <Label htmlFor="reason" className="mt-2 block">Begründung (mind. 10 Zeichen)</Label>
        <Textarea id="reason" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} className="mt-1" />
        <Button className="mt-3" variant="outline" disabled={!!busy || note.trim().length < 10} onClick={() => run("reopen", () => reopenWork(work.id, note), "Wieder geöffnet.")}><RotateCcw className="size-4" aria-hidden /> Wieder öffnen</Button>
      </section>
    );
  }
  return null;
}

const KIND_LABEL: Record<string, string> = { rejection: "Zurückgegeben", approval: "Freigabe-Notiz", reopen: "Wieder geöffnet", comment: "" };
function Comments({ workId, canWrite }: { workId: string; canWrite: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["leittexte", "comments", workId], queryFn: () => listComments(workId) });
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  useEffect(() => subscribeToComments(workId, () => void qc.invalidateQueries({ queryKey: ["leittexte", "comments", workId] })), [workId, qc]);
  return (
    <section id="kommentare" className="scroll-mt-20 rounded-2xl border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="kom">
      <h2 id="kom" className="flex items-center gap-2 font-semibold"><MessageSquare className="size-4 text-primary" aria-hidden /> Kommentare</h2>
      <ul className="mt-3 space-y-3">
        {(q.data ?? []).map((c) => (
          <li key={c.id} className="rounded-xl bg-muted/50 p-3 text-sm">
            <p className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString("de-DE")}{KIND_LABEL[c.kind] ? ` · ${KIND_LABEL[c.kind]}` : ""}</p>
            <p className="mt-1 whitespace-pre-line">{c.body}</p>
          </li>
        ))}
        {q.data?.length === 0 && <li className="text-sm text-muted-foreground">Noch keine Kommentare.</li>}
      </ul>
      {canWrite && (
        <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={async (e) => {
          e.preventDefault(); if (!body.trim()) return; setSending(true);
          try { await addComment(workId, "", body); setBody(""); void q.refetch(); } catch (err) { toast.error(err instanceof Error ? err.message : "Nicht gesendet."); } finally { setSending(false); }
        }}>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={2000} placeholder="Kommentar schreiben …" aria-label="Kommentar" className="flex-1" />
          <Button type="submit" disabled={sending || !body.trim()} className="sm:self-end">Senden</Button>
        </form>
      )}
    </section>
  );
}

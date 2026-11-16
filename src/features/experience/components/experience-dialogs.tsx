import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ConfirmDialog, ResponsiveDialog } from "@/components/dialogs";
import { OnlineButton } from "@/features/sync/online-button";
import { DictationButton } from "@/features/dictation/dictation-button";
import { readPunctuationPreference } from "@/features/dictation/api";
import { SignaturePad } from "@/features/reports/signature-pad";
import { uploadSignature } from "@/features/reports/api";
import { getSavedSignature, saveDrawnSignature, savedSignatureUrl } from "@/features/review/api";
import { getNetworkStatus } from "@/lib/platform";
import { approveExperience, ExperienceConflictError, rejectExperience, reopenExperience, submitExperience, type Experience } from "../api";
import { dateDe, experienceTitle, kindLabel, wordCount } from "../model";
import { formatPages, pageUnitLabel, wordsForPages, type ExperienceRequirement } from "../requirements";

export function SubmitExperienceSheet({ report, attachmentCount, requirement, open, onOpenChange, onSubmitted }: {
  report: Experience; attachmentCount: number; requirement: ExperienceRequirement | null;
  open: boolean; onOpenChange: (o: boolean) => void; onSubmitted: () => void;
}) {
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<"draw" | "click">("draw");
  const [sigValid, setSigValid] = useState(false);
  const [sigBlob, setSigBlob] = useState<Blob | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [askShort, setAskShort] = useState(false);
  const words = wordCount(report.body);
  const minPages = requirement?.min_pages != null ? Number(requirement.min_pages) : null;
  const target = minPages != null ? wordsForPages(minPages, requirement!.page_unit) : null;
  const canSubmit = method === "draw" ? sigValid && sigBlob !== null : confirmed;

  const doSubmit = async () => {
    setBusy(true);
    try {
      await submitExperience({ id: report.id, method, signature: method === "draw" ? sigBlob : null, clientSignedAt: new Date().toISOString() });
      toast.success(getNetworkStatus().online ? "Eingereicht" : "Wird eingereicht, sobald du online bist.");
      await queryClient.invalidateQueries({ queryKey: ["experience"] });
      onSubmitted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Einreichen fehlgeschlagen.");
    } finally { setBusy(false); }
  };
  const start = () => { if (target != null && words < target) setAskShort(true); else void doSubmit(); };

  return <>
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Erfahrungsbericht einreichen" description={experienceTitle(report)}>
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl border bg-muted/40 p-3 text-sm">
          <dt className="text-muted-foreground">Art</dt><dd>{kindLabel(report.kind)}</dd>
          <dt className="text-muted-foreground">Titel</dt><dd className="break-words">{report.title || "—"}</dd>
          <dt className="text-muted-foreground">Datum</dt><dd>{dateDe(report.written_on)}</dd>
          <dt className="text-muted-foreground">Wörter</dt><dd>{words}</dd>
          <dt className="text-muted-foreground">Anhänge</dt><dd className="inline-flex items-center gap-1"><Paperclip className="size-3.5" aria-hidden /> {attachmentCount}</dd>
        </dl>
        <RadioGroup value={method} onValueChange={(v) => setMethod(v as "draw" | "click")}>
          <div className="flex min-h-11 items-center gap-2"><RadioGroupItem value="draw" id="exp-m-draw" /><Label htmlFor="exp-m-draw">Zeichnen</Label></div>
          <div className="flex min-h-11 items-center gap-2"><RadioGroupItem value="click" id="exp-m-click" /><Label htmlFor="exp-m-click">Klick-Bestätigung</Label></div>
        </RadioGroup>
        {method === "draw" ? <SignaturePad onChange={(valid, png) => { setSigValid(valid); setSigBlob(png); }} />
          : <div className="flex items-start gap-2"><Checkbox id="exp-confirm" checked={confirmed} onCheckedChange={(c) => setConfirmed(c === true)} className="mt-0.5" /><Label htmlFor="exp-confirm" className="font-normal leading-snug">Ich bestätige, dass meine Angaben richtig und vollständig sind.</Label></div>}
        <p className="text-xs text-muted-foreground">Mit dem Einreichen bestätigst du die Richtigkeit deiner Angaben. Zeitpunkt und Prüfsumme werden festgehalten.</p>
        <Button className="w-full" disabled={!canSubmit || busy} onClick={start}>{busy ? "Wird eingereicht…" : "Verbindlich einreichen"}</Button>
      </div>
    </ResponsiveDialog>
    {minPages != null && <ConfirmDialog open={askShort} onOpenChange={setAskShort} title="Trotzdem einreichen?"
      description={`Dein Bericht hat ${words} Wörter, deine zuständige Stelle nennt mindestens ${formatPages(minPages)} ${pageUnitLabel(minPages, requirement!.page_unit)} (etwa ${target} Wörter). Trotzdem einreichen?`}
      confirmLabel="Trotzdem einreichen" onConfirm={() => void doSubmit()} />}
  </>;
}

export type ApprovalMethod = "draw" | "saved" | "click";
const METHOD_KEY = "azuvera-review-method";

export function ApproveExperienceSheet({ report, reviewerId, azubiName, deputyName, open, onOpenChange, onDone, onConflict }: {
  report: Experience; reviewerId: string; azubiName: string; deputyName?: string | undefined;
  open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void | Promise<void>; onConflict: () => void;
}) {
  const [method, setMethod] = useState<ApprovalMethod>("draw");
  const [sigValid, setSigValid] = useState(false);
  const [sig, setSig] = useState<Blob | null>(null);
  const [saveSig, setSaveSig] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [interim, setInterim] = useState("");
  const [punctuation, setPunctuation] = useState(true);
  const [busy, setBusy] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const { data: saved } = useQuery({ queryKey: ["review", "saved-signature"], queryFn: getSavedSignature, enabled: open });
  const { data: savedUrl } = useQuery({ queryKey: ["review", "saved-signature-url", saved?.image_path], queryFn: () => savedSignatureUrl(saved!.image_path), enabled: open && !!saved });
  useEffect(() => {
    if (!open) return;
    setPunctuation(readPunctuationPreference());
    try { const m = localStorage.getItem(METHOD_KEY); if (m === "draw" || m === "saved" || m === "click") setMethod(m); } catch { /* optional */ }
  }, [open]);
  const choose = (m: ApprovalMethod) => { setMethod(m); try { localStorage.setItem(METHOD_KEY, m); } catch { /* optional */ } };
  const can = method === "draw" ? sigValid && !!sig : method === "saved" ? !!saved : confirmed;

  const submit = async () => {
    if (!can || busy) return;
    setBusy(true);
    try {
      let imagePath: string | undefined;
      if (method === "draw" && sig) {
        imagePath = await uploadSignature(reviewerId, sig);
        if (saveSig) await saveDrawnSignature(reviewerId, sig);
      }
      await approveExperience({ id: report.id, expectedVersion: report.version, method, imagePath, note: note.trim() || undefined });
      toast.success("Erfahrungsbericht freigegeben");
      onOpenChange(false);
      await onDone();
    } catch (e) {
      if (e instanceof ExperienceConflictError) onConflict();
      toast.error(e instanceof Error ? e.message : "Freigabe fehlgeschlagen.");
    } finally { setBusy(false); }
  };

  return <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Erfahrungsbericht freigeben" description={`${azubiName} · ${experienceTitle(report)}`}>
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/40 p-3 text-sm">
        <p>Version {report.version} · Prüfsumme <span className="font-mono">{report.content_hash?.slice(0, 8) || "—"}</span></p>
        {deputyName && <p className="mt-1 text-muted-foreground">Du gibst in Vertretung für {deputyName} frei.</p>}
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="group" aria-label="Bestätigungsmethode">
        {([{ v: "draw", l: "Zeichnen" }, { v: "saved", l: "Gespeicherte Unterschrift" }, { v: "click", l: "Klick-Freigabe" }] as const).map((i) =>
          <button key={i.v} type="button" aria-pressed={method === i.v} disabled={i.v === "saved" && !saved} onClick={() => choose(i.v)}
            className={cn("min-h-11 rounded-lg px-2 text-xs font-medium sm:text-sm", method === i.v ? "bg-background shadow-sm" : "text-muted-foreground", i.v === "saved" && !saved && "opacity-50")}>{i.l}</button>)}
      </div>
      {method === "draw" && <>
        <SignaturePad onChange={(valid, png) => { setSigValid(valid); setSig(png); }} />
        <div className="flex items-start gap-2"><Checkbox id="exp-save-sig" checked={saveSig} onCheckedChange={(c) => setSaveSig(c === true)} /><Label htmlFor="exp-save-sig" className="font-normal">Unterschrift in meinem Profil speichern</Label></div>
      </>}
      {method === "saved" && (saved ? <div className="rounded-xl border bg-signature-paper p-3">{savedUrl && <img src={savedUrl} alt="Gespeicherte Unterschrift" className="mx-auto h-24 object-contain" />}</div>
        : <p className="text-sm text-muted-foreground">Noch keine Unterschrift gespeichert. <Link to="/profil" className="text-primary underline">Im Profil anlegen</Link></p>)}
      {method === "click" && <div className="flex items-start gap-2"><Checkbox id="exp-review-ok" checked={confirmed} onCheckedChange={(c) => setConfirmed(c === true)} /><Label htmlFor="exp-review-ok" className="font-normal leading-snug">Ich habe den Erfahrungsbericht geprüft und bestätige seine Richtigkeit.</Label></div>}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2"><Label htmlFor="exp-approval-note">Notiz (optional)</Label><DictationButton textareaRef={noteRef} getValue={() => note} onValueChange={setNote} onInterim={setInterim} spokenPunctuation={punctuation} /></div>
        <Textarea id="exp-approval-note" ref={noteRef} rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        {interim && <p className="text-sm italic text-muted-foreground">{interim}</p>}
      </div>
      <p className="text-xs text-muted-foreground">Einfache elektronische Bestätigung. Zeitpunkt und Prüfsumme werden festgehalten.</p>
      <OnlineButton className="w-full" disabled={!can || busy} onClick={() => void submit()}>{busy ? "Wird freigegeben…" : "Verbindlich freigeben"}</OnlineButton>
    </div>
  </ResponsiveDialog>;
}

export function RejectExperienceSheet({ report, open, onOpenChange, onDone, onConflict }: {
  report: Experience; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void | Promise<void>; onConflict: () => void;
}) {
  const [note, setNote] = useState("");
  const [interim, setInterim] = useState("");
  const [punctuation, setPunctuation] = useState(true);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (open) setPunctuation(readPunctuationPreference()); }, [open]);
  const submit = async () => {
    if (note.trim().length < 3) { toast.error("Bitte eine Begründung angeben."); return; }
    setBusy(true);
    try {
      await rejectExperience(report.id, report.version, note.trim());
      toast.success("Erfahrungsbericht zurückgewiesen");
      onOpenChange(false);
      await onDone();
    } catch (e) {
      if (e instanceof ExperienceConflictError) onConflict();
      toast.error(e instanceof Error ? e.message : "Zurückweisung fehlgeschlagen.");
    } finally { setBusy(false); }
  };
  return <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Erfahrungsbericht zurückweisen" description={experienceTitle(report)}>
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2"><Label htmlFor="exp-reject-note">Begründung (erforderlich)</Label><DictationButton textareaRef={ref} getValue={() => note} onValueChange={setNote} onInterim={setInterim} spokenPunctuation={punctuation} /></div>
        <Textarea id="exp-reject-note" ref={ref} rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        {interim && <p className="text-sm italic text-muted-foreground">{interim}</p>}
        <p className="text-right text-xs text-muted-foreground">{note.length} / 2.000</p>
      </div>
      <OnlineButton variant="destructive" className="w-full" disabled={busy} onClick={() => void submit()}>{busy ? "Wird zurückgewiesen…" : "Zurückweisen"}</OnlineButton>
    </div>
  </ResponsiveDialog>;
}

export function ReopenExperienceSheet({ id, open, onOpenChange, onDone }: { id: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void | Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = reason.trim().length >= 10 && reason.trim().length <= 1000;
  const submit = async () => {
    setBusy(true);
    try {
      await reopenExperience(id, reason.trim());
      toast.success("Erfahrungsbericht wieder geöffnet");
      onOpenChange(false);
      await onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Wieder öffnen fehlgeschlagen."); }
    finally { setBusy(false); }
  };
  return <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Erfahrungsbericht wieder öffnen" description="Bitte begründe, warum der Erfahrungsbericht wieder geöffnet wird.">
    <div className="space-y-3">
      <Label htmlFor="exp-reopen">Begründung (10 bis 1000 Zeichen)</Label>
      <Textarea id="exp-reopen" rows={4} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
      <OnlineButton className="w-full" disabled={!ok || busy} onClick={() => void submit()}>Wieder öffnen</OnlineButton>
    </div>
  </ResponsiveDialog>;
}

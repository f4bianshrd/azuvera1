import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveDialog } from "@/components/dialogs";
import { DictationButton } from "@/features/dictation/dictation-button";
import { readPunctuationPreference } from "@/features/dictation/api";
import { reportTitle, ReportConflictError, type Report } from "@/features/reports/api";
import { SignaturePad } from "@/features/reports/signature-pad";
import { cn } from "@/lib/utils";
import { approveReport, getSavedSignature, saveDrawnSignature, savedSignatureUrl } from "./api";

export type ApprovalMethod = "draw" | "saved" | "click";
const STORAGE_KEY = "azuvera-review-method";

export function ApprovalSheet({
  report,
  reviewerId,
  azubiName,
  deputyName,
  open,
  onOpenChange,
  onApproved,
  onConflict,
}: {
  report: Report;
  reviewerId: string;
  azubiName: string;
  deputyName?: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApproved: () => void | Promise<void>;
  onConflict: () => void;
}) {
  const [method, setMethod] = useState<ApprovalMethod>("draw");
  const [signatureValid, setSignatureValid] = useState(false);
  const [signature, setSignature] = useState<Blob | null>(null);
  const [saveSignature, setSaveSignature] = useState(false);
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
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "draw" || stored === "saved" || stored === "click") setMethod(stored);
    } catch { /* Speicher ist optional. */ }
  }, [open]);

  const chooseMethod = (value: ApprovalMethod) => {
    setMethod(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* Speicher ist optional. */ }
  };
  const canApprove = method === "draw" ? signatureValid && !!signature : method === "saved" ? !!saved : confirmed;

  const submit = async () => {
    if (!canApprove || busy) return;
    setBusy(true);
    try {
      let imagePath: string | undefined;
      if (method === "draw" && signature) {
        const { uploadSignature } = await import("@/features/reports/api");
        imagePath = await uploadSignature(reviewerId, signature);
        if (saveSignature) await saveDrawnSignature(reviewerId, signature);
      }
      await approveReport({ reportId: report.id, expectedVersion: report.version, method, imagePath, note: note.trim() || undefined });
      toast.success("Bericht freigegeben");
      onOpenChange(false);
      await onApproved();
    } catch (error) {
      if (error instanceof ReportConflictError) onConflict();
      toast.error(error instanceof Error ? error.message : "Freigabe fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Bericht freigeben" description={`${azubiName} · ${reportTitle(report)}`}>
      <div className="space-y-4">
        <div className="rounded-xl border bg-muted/40 p-3 text-sm">
          <p>Version {report.version} · Prüfsumme <span className="font-mono">{report.content_hash?.slice(0, 8) || "—"}</span></p>
          {deputyName && <p className="mt-1 text-muted-foreground">Du gibst in Vertretung für {deputyName} frei.</p>}
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" aria-label="Bestätigungsmethode">
          {([{ value: "draw", label: "Zeichnen" }, { value: "saved", label: "Gespeichert" }, { value: "click", label: "Klick" }] as const).map((item) => (
            <button key={item.value} type="button" disabled={item.value === "saved" && !saved} onClick={() => chooseMethod(item.value)} className={cn("min-h-10 rounded-lg px-2 text-sm font-medium", method === item.value ? "bg-background shadow-sm" : "text-muted-foreground", item.value === "saved" && !saved && "opacity-50")}>{item.label}</button>
          ))}
        </div>
        {method === "draw" && <>
          <SignaturePad onChange={(valid, png) => { setSignatureValid(valid); setSignature(png); }} />
          <div className="flex items-start gap-2"><Checkbox id="save-signature" checked={saveSignature} onCheckedChange={(checked) => setSaveSignature(checked === true)} /><Label htmlFor="save-signature" className="font-normal">Unterschrift in meinem Profil speichern</Label></div>
        </>}
        {method === "saved" && (saved ? <div className="rounded-xl border bg-signature-paper p-3">{savedUrl && <img src={savedUrl} alt="Gespeicherte Unterschrift" className="mx-auto h-24 object-contain" />}</div> : <p className="text-sm text-muted-foreground">Noch keine Unterschrift gespeichert. <Link to="/profil" className="text-primary underline">Im Profil anlegen</Link></p>)}
        {method === "click" && <div className="flex items-start gap-2"><Checkbox id="review-confirmed" checked={confirmed} onCheckedChange={(checked) => setConfirmed(checked === true)} /><Label htmlFor="review-confirmed" className="font-normal leading-snug">Ich habe den Bericht geprüft und bestätige seine Richtigkeit.</Label></div>}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2"><Label htmlFor="approval-note">Kommentar (optional)</Label><DictationButton textareaRef={noteRef} getValue={() => note} onValueChange={setNote} onInterim={setInterim} spokenPunctuation={punctuation} /></div>
          <Textarea id="approval-note" ref={noteRef} rows={3} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
          {interim && <p className="text-sm italic text-muted-foreground">{interim}</p>}
          <p className="text-right text-xs text-muted-foreground">{note.length} / 2.000</p>
        </div>
        <p className="text-xs text-muted-foreground">Einfache elektronische Bestätigung mit Zeitstempel und Prüfsumme – keine qualifizierte elektronische Signatur.</p>
        <Button className="w-full" disabled={!canApprove || busy} onClick={() => void submit()}>{busy ? "Wird freigegeben…" : "Verbindlich freigeben"}</Button>
      </div>
    </ResponsiveDialog>
  );
}

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ResponsiveDialog } from "@/components/dialogs";
import { reportTitle, submitReport, ReportConflictError, type Report } from "./api";
import { SignaturePad } from "./signature-pad";
import { getNetworkStatus } from "@/lib/platform";

const SECTIONS: { key: keyof Pick<Report, "activities" | "school_content" | "instructions" | "summary">; label: string }[] = [
  { key: "activities", label: "Tätigkeiten" },
  { key: "school_content", label: "Berufsschule" },
  { key: "instructions", label: "Unterweisungen" },
  { key: "summary", label: "Zusammenfassung / Reflexion" },
];

export function SubmitSheet({
  report,
  attachmentCount,
  open,
  onOpenChange,
  onSubmitted,
}: {
  report: Report;
  attachmentCount: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmitted: () => void;
}) {
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<"draw" | "click">("draw");
  const [sigValid, setSigValid] = useState(false);
  const [sigBlob, setSigBlob] = useState<Blob | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const filled = SECTIONS.filter((s) => (report[s.key] ?? "").trim().length > 0);
  const empty = SECTIONS.filter((s) => (report[s.key] ?? "").trim().length === 0);
  const canSubmit = method === "draw" ? sigValid && sigBlob !== null : confirmed;

  const doSubmit = async () => {
    setBusy(true);
    try {
      await submitReport({
        reportId: report.id,
        expectedVersion: report.version,
        method,
        signature: method === "draw" ? sigBlob : null,
        clientSignedAt: new Date().toISOString(),
      });
      toast.success(getNetworkStatus().online ? "Eingereicht" : "Wird eingereicht, sobald du online bist.");
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
      onSubmitted();
    } catch (e) {
      if (e instanceof ReportConflictError) {
        toast.error(e.message);
      } else {
        toast.error(e instanceof Error ? e.message : "Einreichen fehlgeschlagen.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Bericht einreichen"
      description={reportTitle(report)}
    >
      <div className="space-y-4">
        <div className="rounded-xl border bg-muted/40 p-3 text-sm">
          <p>
            {filled.length} von 4 Abschnitten ausgefüllt ·{" "}
            <span className="inline-flex items-center gap-1">
              <Paperclip className="size-3.5" aria-hidden /> {attachmentCount} Anhänge
            </span>
          </p>
          {empty.length > 0 && (
            <p className="mt-1 text-muted-foreground">
              {empty.map((s) => s.label).join(", ")} {empty.length === 1 ? "ist" : "sind"} leer. Trotzdem einreichen?
            </p>
          )}
        </div>

        <RadioGroup value={method} onValueChange={(v) => setMethod(v as "draw" | "click")}>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="draw" id="m-draw" />
            <Label htmlFor="m-draw">Zeichnen</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="click" id="m-click" />
            <Label htmlFor="m-click">Klick-Bestätigung</Label>
          </div>
        </RadioGroup>

        {method === "draw" ? (
          <SignaturePad
            onChange={(valid, png) => {
              setSigValid(valid);
              setSigBlob(png);
            }}
          />
        ) : (
          <div className="flex items-start gap-2">
            <Checkbox
              id="confirm"
              checked={confirmed}
              onCheckedChange={(c) => setConfirmed(c === true)}
              className="mt-0.5"
            />
            <Label htmlFor="confirm" className="font-normal leading-snug">
              Ich bestätige, dass meine Angaben richtig und vollständig sind.
            </Label>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Mit dem Einreichen bestätigst du die Richtigkeit deiner Angaben. Zeitpunkt und Prüfsumme werden
          festgehalten.
        </p>
        <Button className="w-full" disabled={!canSubmit || busy} onClick={() => void doSubmit()}>
          {busy ? "Wird eingereicht…" : "Verbindlich einreichen"}
        </Button>
      </div>
    </ResponsiveDialog>
  );
}

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveDialog } from "@/components/dialogs";
import { savePlanJson } from "../api";
import { previewPlanJson, type JsonPreview } from "../json";

export function ImportDialog({ open, onOpenChange, professionCodes, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; professionCodes: string[]; onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<JsonPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const check = (t: string) => { setText(t); setPreview(t.trim() ? previewPlanJson(t, professionCodes) : null); };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error("Die Datei ist größer als 5 MB."); return; }
    check(await f.text());
  };
  const doImport = async () => {
    if (!preview?.plan) return;
    setBusy(true);
    try {
      await savePlanJson(preview.plan);
      toast.success("Plan importiert");
      setText(""); setPreview(null); onOpenChange(false); onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import fehlgeschlagen");
    } finally { setBusy(false); }
  };
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="JSON importieren" description="Datei wählen oder Inhalt einfügen. Erst „Importieren“ schreibt den Plan.">
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div className="space-y-1.5"><Label htmlFor="imp-file">Datei</Label><Input id="imp-file" type="file" accept="application/json,.json" onChange={(e) => void onFile(e.target.files?.[0])} /></div>
        <div className="space-y-1.5"><Label htmlFor="imp-text">Oder einfügen</Label><Textarea id="imp-text" rows={6} className="font-mono text-xs" value={text} onChange={(e) => check(e.target.value)} /></div>
        {preview && !preview.ok && <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{preview.error}</p>}
        {preview?.ok && preview.plan && (
          <div className="space-y-2 rounded-xl border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{preview.plan.plan.title} <span className="text-muted-foreground">({preview.plan.plan.code})</span></p>
            <p className="text-muted-foreground">{preview.counts.sections} Abschnitte · {preview.counts.groups} Gruppen · {preview.counts.items} Punkte</p>
            {preview.warnings.map((w) => <p key={w} className="flex gap-2 text-warning-foreground"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />{w}</p>)}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={doImport} disabled={!preview?.ok || busy}>Importieren</Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

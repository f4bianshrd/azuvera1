import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ResponsiveDialog } from "@/components/dialogs";
import type { Report } from "@/features/reports/api";
import { approveReport, getSavedSignature } from "./api";
import { bulkSummary } from "./review-utils";

export function BulkApprovalDialog({ reports, open, onOpenChange, onDone }: { reports: Report[]; open: boolean; onOpenChange: (open: boolean) => void; onDone: () => void | Promise<void> }) {
  const [method, setMethod] = useState<"saved" | "click">("click");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: saved } = useQuery({ queryKey: ["review", "saved-signature"], queryFn: getSavedSignature, enabled: open });
  const submit = async () => {
    setBusy(true);
    let approved = 0;
    const skipped: { message: string }[] = [];
    for (const report of reports) {
      try {
        await approveReport({ reportId: report.id, expectedVersion: report.version, method });
        approved += 1;
      } catch (error) { skipped.push({ message: error instanceof Error ? error.message : "Freigabe fehlgeschlagen." }); }
    }
    setBusy(false);
    onOpenChange(false);
    await onDone();
    toast.success(bulkSummary(approved, skipped));
  };
  return <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={`${reports.length} Berichte freigeben`}>
    <div className="space-y-4">
      <RadioGroup value={method} onValueChange={(value) => setMethod(value as "saved" | "click")}>
        <div className="flex items-center gap-2"><RadioGroupItem value="saved" id="bulk-saved" disabled={!saved} /><Label htmlFor="bulk-saved">Gespeicherte Unterschrift</Label></div>
        <div className="flex items-center gap-2"><RadioGroupItem value="click" id="bulk-click" /><Label htmlFor="bulk-click">Klick-Freigabe</Label></div>
      </RadioGroup>
      <div className="flex items-start gap-2"><Checkbox id="bulk-confirmed" checked={confirmed} onCheckedChange={(checked) => setConfirmed(checked === true)} /><Label htmlFor="bulk-confirmed" className="font-normal">Ich habe die ausgewählten Berichte geprüft.</Label></div>
      <Button className="w-full" disabled={!confirmed || busy || (method === "saved" && !saved)} onClick={() => void submit()}>{busy ? "Werden freigegeben…" : "Alle freigeben"}</Button>
    </div>
  </ResponsiveDialog>;
}

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canReviewFor, loadInstructionData, type InstructionRecord } from "../api";
import { addDays } from "../due";
import { DetailDialog } from "./detail-dialog";
import { RecordDialog } from "./record-dialog";

const ddmm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.` : "");

/**
 * Nachweise des Berichtszeitraums als Chips (B2, Abschnitt 4). Gehören nicht zur Prüfsumme des Berichts.
 * editable = eigener Bericht (Button „Unterweisung eintragen“); sonst nur Lesen ohne Entwürfe.
 */
export function ReportInstructionChips({ azubiId, reportType, reportDate, editable }: { azubiId: string; reportType: string; reportDate: string; editable: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["instructions", "data", azubiId], queryFn: () => loadInstructionData(azubiId) });
  const { data: canReview = false } = useQuery({ queryKey: ["instructions", "can-review", azubiId], queryFn: () => canReviewFor(azubiId), enabled: !editable });
  const [detail, setDetail] = useState<InstructionRecord | null>(null);
  const [adding, setAdding] = useState(false);
  const to = reportType === "weekly" ? addDays(reportDate, 6) : reportDate;
  const records = useMemo(() => (data?.records ?? [])
    .filter((r) => r.given_on && r.given_on >= reportDate && r.given_on <= to)
    .filter((r) => (editable && data?.own) || r.status !== "draft")
    .sort((a, b) => (a.given_on ?? "").localeCompare(b.given_on ?? "")), [data, reportDate, to, editable]);
  if (!data || (!records.length && !(editable && data.own))) return null;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["instructions"] }); };
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Unterweisungen im Berichtszeitraum">
      {records.map((r) => (
        <button key={r.id} type="button" onClick={() => setDetail(r)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border bg-card px-3 text-sm hover:bg-accent">
          <ClipboardCheck className="size-4 text-primary" aria-hidden />{r.title} · {ddmm(r.given_on)}
        </button>
      ))}
      {editable && data.own && (
        <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden />Unterweisung eintragen</Button>
      )}
      {adding && <RecordDialog open={adding} onOpenChange={setAdding} data={data} init={{ date: reportDate }} onSaved={refresh} />}
      <DetailDialog record={detail} data={data} canReview={canReview} onOpenChange={(o) => { if (!o) setDetail(null); }}
        onEdit={() => setDetail(null)} onChanged={refresh} />
    </div>
  );
}

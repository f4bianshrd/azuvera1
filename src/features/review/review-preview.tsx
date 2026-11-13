import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/shared";
import { getReport, reportTitle, type Report } from "@/features/reports/api";
import { CommentsCard } from "./comments-card";
import { ReportLinkChips } from "@/features/plan/components/report-links";
import { ReportInstructionChips } from "@/features/instructions/components/report-chips";

export function ReviewPreview({ report, azubiName, onApprove, onReject }: { report: Report; azubiName: string; onApprove: () => void; onReject: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["reports", report.id], queryFn: () => getReport(report.id) });
  const detail = data?.report ?? report;
  return <aside className="hidden min-w-0 md:block">
    <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border bg-card">
      <div className="border-b p-4"><p className="text-sm text-muted-foreground">{azubiName}</p><h2 className="mt-1 font-semibold">{reportTitle(detail)}</h2><p className="mt-1 text-xs text-muted-foreground">{format(new Date(detail.report_date + "T00:00:00"), "dd.MM.yyyy", { locale: de })} · Version {detail.version}</p></div>
      {isLoading ? <div className="p-4"><ListSkeleton rows={3} /></div> : <div className="space-y-4 p-4 pb-24">
        {([["Tätigkeiten", detail.activities], ["Berufsschule", detail.school_content], ["Unterweisungen", detail.instructions], ["Zusammenfassung / Reflexion", detail.summary]] as const).filter(([, value]) => value?.trim()).map(([label, value]) => <section key={label}><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3><p className="mt-1 whitespace-pre-wrap text-sm">{value}</p></section>)}
        <ReportInstructionChips azubiId={detail.azubi_id} reportType={detail.report_type} reportDate={detail.report_date} editable={false} />
        <ReportLinkChips reportId={detail.id} azubiId={detail.azubi_id} />
        {(data?.attachments.length ?? 0) > 0 && <section><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Anhänge</h3><ul className="mt-2 space-y-1">{data?.attachments.map((attachment) => <li key={attachment.id} className="flex items-center gap-2 text-sm"><Paperclip className="size-3.5" />{attachment.file_name}</li>)}</ul></section>}
        <CommentsCard report={detail} canComment />
      </div>}
      <div className="absolute inset-x-0 bottom-0 flex gap-2 border-t bg-card/95 p-3 backdrop-blur"><Button className="flex-1" onClick={onApprove}>Freigeben</Button><Button className="flex-1" variant="destructive" onClick={onReject}>Zurückweisen</Button></div>
    </div>
  </aside>;
}

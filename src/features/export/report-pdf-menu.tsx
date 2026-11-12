import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";
import { saveFile } from "@/lib/platform";
import { getExportHeader, getExportReport, logExport } from "./api";
import { buildSinglePdf, singleFileName } from "./pdf/build";

export function ReportPdfMenu({ reportId, azubiId }: { reportId: string; azubiId: string }) {
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const run = async (blank: boolean) => {
    setBusy(true);
    try {
      const [report, header] = await Promise.all([getExportReport(reportId), getExportHeader(azubiId)]);
      const bytes = await buildSinglePdf(report, header, { blankSignatures: blank });
      saveFile(new Blob([bytes as BlobPart], { type: "application/pdf" }), singleFileName(report));
      toast.success("Export fertig");
      void logExport(azubiId, "single", 1, report.report_date, report.report_date).catch(() => undefined);
    } catch {
      toast.error("Der Export ist fehlgeschlagen. Bitte versuche es erneut.");
    } finally { setBusy(false); }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={!online || busy} title={online ? undefined : OFFLINE_ACTION_HINT}>
          <Download className="size-4" aria-hidden /> {busy ? "PDF wird erstellt …" : "PDF herunterladen"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void run(false)}>PDF mit digitaler Bestätigung</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run(true)}>PDF zum handschriftlichen Unterschreiben</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

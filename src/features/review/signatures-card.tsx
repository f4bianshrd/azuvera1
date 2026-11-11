import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { displayNames, type ReportSignature } from "@/features/reports/api";
import { savedSignatureUrl } from "./api";

const METHOD_LABELS: Record<string, string> = { draw: "gezeichnet", saved: "gespeicherte Unterschrift", click: "Klick-Bestätigung" };

function SignatureImage({ path }: { path: string }) {
  const { data: url } = useQuery({ queryKey: ["review", "signature-url", path], queryFn: () => savedSignatureUrl(path) });
  return <div className="mt-3 rounded-xl border bg-signature-paper p-3">{url ? <img src={url} alt="Unterschrift" className="h-24 max-w-full object-contain" /> : <div className="h-24 animate-pulse rounded bg-muted" />}</div>;
}

function SignatureEntry({ signature, principalName }: { signature: ReportSignature; principalName?: string | undefined }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!signature.content_hash) return;
    await navigator.clipboard.writeText(signature.content_hash);
    setCopied(true);
    toast.success("Prüfsumme kopiert");
    window.setTimeout(() => setCopied(false), 1500);
  };
  return <article className="rounded-xl border p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><p className="text-sm font-semibold">{signature.signer_role_label || (signature.role === "azubi" ? "Auszubildende:r" : "Ausbilder:in")}</p><p className="text-sm">{signature.signer_name}</p></div>
      <p className="text-sm text-muted-foreground">{format(new Date(signature.signed_at), "dd.MM.yyyy, HH:mm 'Uhr'", { locale: de })}</p>
    </div>
    <p className="mt-1 text-sm text-muted-foreground">{METHOD_LABELS[signature.method] ?? signature.method}{principalName ? ` · i. V. für ${principalName}` : ""}</p>
    {signature.image_path && <SignatureImage path={signature.image_path} />}
    <div className="mt-3 flex items-center gap-2 text-xs"><span className="text-muted-foreground">Prüfsumme</span><code>{signature.content_hash?.slice(0, 12) || "—"}</code><Button type="button" variant="ghost" size="sm" disabled={!signature.content_hash} onClick={() => void copy()}><Copy className="size-3.5" />{copied ? "Kopiert" : "Kopieren"}</Button></div>
  </article>;
}

export function SignaturesCard({ signatures, currentVersion }: { signatures: ReportSignature[]; currentVersion: number }) {
  const current = signatures.filter((signature) => signature.report_version === currentVersion);
  const previous = signatures.filter((signature) => signature.report_version !== currentVersion);
  const principalIds = [...new Set(signatures.map((signature) => signature.on_behalf_of).filter((id): id is string => !!id))];
  const { data: names } = useQuery({ queryKey: ["review", "signature-principals", principalIds.join(",")], queryFn: () => displayNames(principalIds), enabled: principalIds.length > 0 });
  return <section className="rounded-2xl border bg-card p-4">
    <h2 className="font-semibold">Unterschriften</h2>
    <p className="mt-1 text-xs text-muted-foreground">Zeitpunkt und Prüfsumme wurden bei der Unterschrift festgehalten.</p>
    <div className="mt-4 space-y-3">
      {current.map((signature) => <SignatureEntry key={signature.id} signature={signature} principalName={names?.get(signature.on_behalf_of ?? "")} />)}
      {!current.some((signature) => signature.role === "ausbilder") && <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Noch nicht freigegeben.</p>}
    </div>
    {previous.length > 0 && <Accordion type="single" collapsible className="mt-3"><AccordionItem value="previous"><AccordionTrigger>Frühere Versionen</AccordionTrigger><AccordionContent><div className="space-y-3">{previous.map((signature) => <SignatureEntry key={signature.id} signature={signature} principalName={names?.get(signature.on_behalf_of ?? "")} />)}</div></AccordionContent></AccordionItem></Accordion>}
  </section>;
}

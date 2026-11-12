import { useEffect, useMemo, useState } from "react";
import { Copy, Download, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/dialogs";
import { copyText, publicAppOrigin, saveFile, shareContent } from "@/lib/platform";
import { ACCESS_INFO, formatCode, linkUrl, type LinkAccess } from "../codes";
import { logoDataUrl, qrCardPng, qrSvg, svgDataUrl } from "../qr";

const dateTime = (iso: string) => new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " Uhr";

/** Dialog mit gestaltetem QR-Code, Code zum Abtippen und Teilen/Speichern/Kopieren. */
export function QrCodeDialog({ open, onOpenChange, code, access, expiresAt, name }: {
  open: boolean; onOpenChange: (o: boolean) => void; code: string; access: LinkAccess; expiresAt: string; name: string;
}) {
  const [logo, setLogo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void logoDataUrl().then(setLogo); }, []);
  const url = linkUrl(publicAppOrigin(), code);
  const src = useMemo(() => svgDataUrl(qrSvg(url, { size: 560, logo })), [url, logo]);
  const info = ACCESS_INFO[access];
  const file = async () => {
    const blob = await qrCardPng({ url, code: formatCode(code), name, access: info.label, who: info.who, validUntil: dateTime(expiresAt) });
    return new File([blob], `azuvera-verknuepfung-${code.toLowerCase()}.png`, { type: "image/png" });
  };
  const share = async () => {
    setBusy(true);
    try {
      const f = await file();
      const ok = await shareContent({ title: "Azuvera-Verknüpfung", text: `Verknüpfe dich mit mir in Azuvera (${info.label}). Code: ${formatCode(code)}`, url, files: [f] });
      if (!ok) { await copyText(url); toast.success("Link kopiert – dieses Gerät hat kein Teilen-Menü."); }
    } catch { toast.error("Teilen hat nicht geklappt."); } finally { setBusy(false); }
  };
  const download = async () => {
    setBusy(true);
    try { const f = await file(); saveFile(f, f.name); toast.success("Bild gespeichert"); }
    catch { toast.error("Bild konnte nicht erstellt werden."); } finally { setBusy(false); }
  };
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Dein Verknüpfungscode" description="Zeigen, teilen oder vorlesen – der Code gilt einmal.">
      <div className="space-y-5">
        <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
          <div className="bg-gradient-to-br from-primary to-brand-teal px-5 pb-12 pt-4 text-primary-foreground">
            <p className="text-xs font-medium uppercase tracking-wider opacity-85">Verknüpfung mit</p>
            <p className="truncate text-lg font-semibold">{name}</p>
          </div>
          <div className="-mt-9 px-5 pb-5">
            <div className="mx-auto w-full max-w-[280px] rounded-3xl bg-card p-2 shadow-md ring-1 ring-border">
              <img src={src} alt={`QR-Code für Code ${formatCode(code)}`} className="block aspect-square w-full rounded-2xl" />
            </div>
            <p className="mt-4 text-center font-mono text-3xl font-bold tracking-[0.18em]" aria-label={`Code ${[...code].join(" ")}`}>{formatCode(code)}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
              <span className="rounded-full bg-brand-teal/15 px-3 py-1 font-medium text-primary">{info.label}</span>
              <span className="text-muted-foreground">für {info.who}</span>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">Gültig bis {dateTime(expiresAt)}</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Button onClick={() => void share()} disabled={busy}><Share2 className="size-4" aria-hidden /> Teilen</Button>
          <Button variant="outline" onClick={() => void copyText(url).then(() => toast.success("Link kopiert"), () => toast.error("Kopieren nicht möglich"))}><Copy className="size-4" aria-hidden /> Link kopieren</Button>
          <Button variant="outline" onClick={() => void download()} disabled={busy}><Download className="size-4" aria-hidden /> Als Bild</Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Copy, Download, Link2, MessageSquareText, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/dialogs";
import { ROLE_LABELS, type AppRole } from "@/features/app/session";
import { canShareNatively, copyText, publicAppOrigin, saveFile, shareContent } from "@/lib/platform";
import { formatCode, inviteUrl, roleCanReview } from "../codes";
import { logoDataUrl, qrCardPng, qrSvg, svgDataUrl } from "../qr";

const dateDe = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

export function invitationMessage(role: AppRole, link: string, code: string, expiresAt: string): string {
  return `Hallo, ich nutze Azuvera als digitales Berichtsheft und möchte dich als ${ROLE_LABELS[role]} einladen. Öffne ${link} und erstelle ein Konto oder melde dich an. Dein Einladungs-Code: ${formatCode(code)}. Er ist bis ${dateDe(expiresAt)} gültig und nur einmal nutzbar.`;
}

/** Dialog „Einladung bereit“: gestalteter QR-Code, Code in Vierergruppen, Kopieren/Teilen/Als Bild. */
export function InvitationReadyDialog({ open, onOpenChange, code, role, expiresAt, name }: {
  open: boolean; onOpenChange: (o: boolean) => void; code: string; role: AppRole; expiresAt: string; name: string;
}) {
  const [logo, setLogo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void logoDataUrl().then(setLogo); }, []);
  const link = inviteUrl(publicAppOrigin(), code, role);
  const src = useMemo(() => svgDataUrl(qrSvg(link, { size: 560, logo })), [link, logo]);
  const message = invitationMessage(role, link, code, expiresAt);
  const accessLabel = roleCanReview(role) ? "darf prüfen" : "nur lesen";
  const copy = (text: string) => void copyText(text).then(() => toast.success("Kopiert"), () => toast.error("Kopieren nicht möglich"));
  const file = async () => {
    const blob = await qrCardPng({ url: link, code: formatCode(code), name, access: ROLE_LABELS[role], who: accessLabel, validUntil: dateDe(expiresAt) });
    return new File([blob], `azuvera-einladung-${code.toLowerCase()}.png`, { type: "image/png" });
  };
  const share = async () => {
    setBusy(true);
    try {
      let files: File[] | undefined;
      try { files = [await file()]; } catch { files = undefined; }
      const ok = await shareContent({ title: "Einladung zu Azuvera", text: message, url: link, ...(files ? { files } : {}) });
      if (!ok) { await copyText(message); toast.success("Kopiert"); }
    } catch { toast.error("Teilen hat nicht geklappt."); } finally { setBusy(false); }
  };
  const download = async () => {
    setBusy(true);
    try { const f = await file(); saveFile(f, f.name); toast.success("Bild gespeichert"); }
    catch { toast.error("Bild konnte nicht erstellt werden."); } finally { setBusy(false); }
  };
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Einladung bereit" description="Zeig den QR-Code oder schick Link oder Code weiter.">
      <div className="space-y-5">
        <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
          <div className="bg-gradient-to-br from-primary to-brand-teal px-5 pb-12 pt-4 text-primary-foreground">
            <p className="text-xs font-medium uppercase tracking-wider opacity-85">Einladung von</p>
            <p className="truncate text-lg font-semibold">{name}</p>
          </div>
          <div className="-mt-9 px-5 pb-5">
            <div className="mx-auto w-full max-w-[260px] rounded-3xl bg-card p-2 shadow-md ring-1 ring-border">
              <img src={src} alt={`QR-Code für den Einladungs-Code ${formatCode(code)}`} className="block aspect-square w-full rounded-2xl" />
            </div>
            <p className="mt-4 break-all text-center font-mono text-2xl font-bold tracking-[0.14em] sm:text-3xl" aria-label={`Code ${[...code].join(" ")}`}>{formatCode(code)}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
              <span className="rounded-full bg-brand-teal/15 px-3 py-1 font-medium text-primary">{ROLE_LABELS[role]}</span>
              <span className="text-muted-foreground">{accessLabel}</span>
            </div>
            <p className="mt-2 text-center text-sm text-muted-foreground">Gültig bis {dateDe(expiresAt)}, nur einmal nutzbar.</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" onClick={() => copy(formatCode(code))}><Copy className="size-4" aria-hidden /> Code kopieren</Button>
          <Button variant="outline" onClick={() => copy(link)}><Link2 className="size-4" aria-hidden /> Link kopieren</Button>
          <Button variant="outline" onClick={() => copy(message)}><MessageSquareText className="size-4" aria-hidden /> Nachricht kopieren</Button>
          <Button variant="outline" onClick={() => void download()} disabled={busy}><Download className="size-4" aria-hidden /> Als Bild</Button>
          {canShareNatively() && <Button className="sm:col-span-2" onClick={() => void share()} disabled={busy}><Share2 className="size-4" aria-hidden /> Teilen</Button>}
        </div>
      </div>
    </ResponsiveDialog>
  );
}

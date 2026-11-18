import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LegalHeader, PublicLayout } from "@/features/public/public-layout";

const TITLE = "E-Mail-Signatur – Azuvera";
const DESC = "Azuvera E-Mail-Signatur zum Kopieren für Outlook, Apple Mail und Gmail.";

export const Route = createFileRoute("/signatur")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Signatur,
});

// E-Mail-Programme verstehen nur feste Farben direkt im Text.
const A = 'style="color:#2f6b4f;text-decoration:none;"';
const SIG = `<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#1f2937;background:#ffffff;padding:12px;">
<tr><td style="padding-bottom:6px;"><span style="font-size:16px;font-weight:bold;color:#2f6b4f;">Azuvera</span> <span style="color:#64748b;">· Eine Marke der Stage &amp; Spotlight</span></td></tr>
<tr><td>Inhaber: Fabian Schröder</td></tr>
<tr><td>Hüdepohlweg 8, D-49326 Melle</td></tr>
<tr><td style="padding-top:6px;"><a href="mailto:info@azuvera.de" ${A}>✉ info@azuvera.de</a> &nbsp;·&nbsp; <a href="tel:+4915569490721" ${A}>☎ +49 155 69490721</a></td></tr>
<tr><td><a href="https://instagram.com/getazuvera" ${A}>Instagram: getazuvera</a> &nbsp;·&nbsp; <a href="https://wa.me/4915569490721" ${A}>WhatsApp</a></td></tr>
<tr><td style="padding-top:6px;"><a href="https://azuvera.de" ${A}>🌐 azuvera.de</a> &nbsp;·&nbsp; <a href="https://get.azuvera.de" ${A}>📱 Azuvera WebApp</a></td></tr>
<tr><td style="padding-top:6px;font-size:11px;"><a href="https://get.azuvera.de/impressum" style="color:#64748b;">Impressum</a> · <a href="https://get.azuvera.de/datenschutz" style="color:#64748b;">Datenschutz</a></td></tr>
</table>`;
const TEXT = `Azuvera · Eine Marke der Stage & Spotlight
Inhaber: Fabian Schröder
Hüdepohlweg 8, D-49326 Melle
info@azuvera.de · +49 155 69490721
Instagram: getazuvera · WhatsApp: wa.me/4915569490721
azuvera.de · get.azuvera.de
Impressum: get.azuvera.de/impressum · Datenschutz: get.azuvera.de/datenschutz`;

function Signatur() {
  const [done, setDone] = useState<"" | "sig" | "html">("");
  const flash = (k: "sig" | "html") => { setDone(k); setTimeout(() => setDone(""), 2000); };
  async function copySig() {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([SIG], { type: "text/html" }),
        "text/plain": new Blob([TEXT], { type: "text/plain" }),
      })]);
    } catch {
      const el = document.getElementById("sig-preview");
      if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r); document.execCommand("copy"); s?.removeAllRanges(); }
    }
    flash("sig");
  }
  async function copyHtml() { await navigator.clipboard.writeText(SIG); flash("html"); }

  return (
    <PublicLayout>
      <LegalHeader chip="Intern" title="E-Mail-Signatur" subtitle="Mit einem Klick kopieren und in dein E-Mail-Programm einfügen." />
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <div className="rounded-xl border bg-card p-6">
          <div id="sig-preview" className="overflow-x-auto rounded-lg bg-background p-4" dangerouslySetInnerHTML={{ __html: SIG }} />
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={copySig}>{done === "sig" ? <Check /> : <Copy />} {done === "sig" ? "Kopiert!" : "Signatur kopieren"}</Button>
            <Button variant="outline" onClick={copyHtml}>{done === "html" ? <Check /> : <Copy />} {done === "html" ? "Kopiert!" : "HTML-Code kopieren"}</Button>
          </div>
        </div>
        <div className="space-y-4 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          <div><p className="font-semibold text-foreground">Outlook auf dem Mac</p>
            <p>Auf „Signatur kopieren“ klicken → Outlook → Einstellungen → Signaturen → „+“ → ins Feld klicken → Cmd + V → speichern.</p></div>
          <div><p className="font-semibold text-foreground">Apple Mail</p>
            <p>Mail → Einstellungen → Signaturen → „+“ → Haken bei „Immer meiner Standardschrift entsprechen“ entfernen → Cmd + V.</p></div>
          <div><p className="font-semibold text-foreground">Gmail / Outlook im Browser</p>
            <p>Einstellungen → Signatur → neue Signatur → ins Feld klicken → Strg/Cmd + V → speichern.</p></div>
        </div>
      </div>
    </PublicLayout>
  );
}

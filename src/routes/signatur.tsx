import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Code2, Copy, Globe, Mail, MonitorSmartphone, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared";
import { PublicLayout } from "@/features/public/public-layout";
import logoAsset from "@/assets/signature/sig-logo.png.asset.json";
import mailAsset from "@/assets/signature/sig-mail.png.asset.json";
import phoneAsset from "@/assets/signature/sig-phone.png.asset.json";
import globeAsset from "@/assets/signature/sig-globe.png.asset.json";
import smartphoneAsset from "@/assets/signature/sig-smartphone.png.asset.json";
import instagramAsset from "@/assets/signature/sig-instagram.png.asset.json";
import whatsappAsset from "@/assets/signature/sig-whatsapp.png.asset.json";

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

const LIVE = "https://get.azuvera.de";

// Bilder liegen auf dem Azuvera-CDN und sind über die Live-Adresse sofort erreichbar.
const ICONS: Record<string, string> = {
  logo: logoAsset.url, mail: mailAsset.url, phone: phoneAsset.url, globe: globeAsset.url,
  smartphone: smartphoneAsset.url, instagram: instagramAsset.url, whatsapp: whatsappAsset.url,
};
const src = (n: string) => `${LIVE}${ICONS[n]}`;

/*
 * E-Mail-Programme kennen keine Design-Tokens: Die Signatur braucht feste Farben,
 * Tabellen und Bilder mit voller Adresse. Farben = Azuvera-Verlauf in Hex.
 */
const C = { blue: "#0056c5", mid: "#0093c1", teal: "#06bfa8", ink: "#091123", muted: "#677284", line: "#e3ebf5" };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

function buildSignature() {
  const img = (n: string, s: number, alt: string) =>
    `<img src="${src(n)}" width="${s}" height="${s}" alt="${alt}" style="display:block;border:0;width:${s}px;height:${s}px;" />`;
  const row = (icon: string, alt: string, html: string) =>
    `<tr><td style="padding:0 10px 6px 0;vertical-align:middle;">${img(icon, 18, alt)}</td><td style="padding:0 0 6px 0;vertical-align:middle;font-size:13px;color:${C.ink};">${html}</td></tr>`;
  const a = (href: string, text: string, color = C.ink) =>
    `<a href="${href}" style="color:${color};text-decoration:none;">${text}</a>`;
  const pill = (href: string, icon: string, label: string, sub: string) =>
    `<td style="padding:0 8px 0 0;"><a href="${href}" style="text-decoration:none;"><table cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};border-radius:10px;"><tr>
<td style="padding:8px 8px 8px 10px;vertical-align:middle;">${img(icon, 22, "")}</td>
<td style="padding:7px 12px 7px 0;vertical-align:middle;font-family:${FONT};"><div style="font-size:12px;font-weight:600;color:${C.ink};line-height:1.2;">${label}</div><div style="font-size:11px;color:${C.muted};line-height:1.2;">${sub}</div></td>
</tr></table></a></td>`;

  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family:${FONT};color:${C.ink};background:#ffffff;max-width:520px;">
<tr><td style="padding:0 0 14px 0;"><table cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:top;padding:2px 18px 0 0;"><a href="https://azuvera.de"><img src="${src("logo")}" width="76" height="76" alt="Azuvera" style="display:block;border:0;width:76px;height:76px;border-radius:16px;" /></a></td>
<td width="3" bgcolor="${C.mid}" style="width:3px;background:${C.mid};background-image:linear-gradient(180deg,${C.blue},${C.mid},${C.teal});font-size:0;line-height:0;">&nbsp;</td>
<td style="vertical-align:top;padding:0 0 0 18px;">
<div style="font-size:18px;font-weight:700;letter-spacing:-0.2px;color:${C.ink};line-height:1.25;">Fabian Schröder</div>
<div style="font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${C.blue};padding:3px 0 2px;">Inhaber · Azuvera</div>
<div style="font-size:12px;color:${C.muted};padding:0 0 10px;">Eine Marke der Stage &amp; Spotlight</div>
<table cellpadding="0" cellspacing="0" border="0">
${row("mail", "E-Mail", a("mailto:info@azuvera.de", "info@azuvera.de"))}
${row("phone", "Telefon", a("tel:+4915569490721", "+49 155 69490721"))}
</table>
<div style="font-size:12px;color:${C.muted};padding:2px 0 10px;">Hüdepohlweg 8 · D-49326 Melle</div>
<table cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding:0 8px 0 0;"><a href="https://instagram.com/getazuvera">${img("instagram", 26, "Instagram @getazuvera")}</a></td>
<td style="padding:0 10px 0 0;"><a href="https://wa.me/4915569490721">${img("whatsapp", 26, "WhatsApp")}</a></td>
<td style="font-size:12px;color:${C.muted};vertical-align:middle;">${a("https://instagram.com/getazuvera", "@getazuvera", C.muted)}</td>
</tr></table>
</td></tr></table></td></tr>
<tr><td style="padding:0 0 14px 0;"><table cellpadding="0" cellspacing="0" border="0"><tr>
${pill("https://azuvera.de", "globe", "azuvera.de", "Website")}
${pill(LIVE, "smartphone", "Azuvera WebApp", "Digitales Berichtsheft")}
</tr></table></td></tr>
<tr><td height="3" bgcolor="${C.mid}" style="height:3px;background:${C.mid};background-image:linear-gradient(90deg,${C.blue},${C.mid},${C.teal});font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:8px 0 0 0;font-size:10.5px;color:${C.muted};">
${a(`${LIVE}/impressum`, "Impressum", C.muted)} &nbsp;·&nbsp; ${a(`${LIVE}/datenschutz`, "Datenschutz", C.muted)}
</td></tr>
</table>`;
}

const SIG_LIVE = buildSignature();
const TEXT = `Fabian Schröder
Inhaber · Azuvera – Eine Marke der Stage & Spotlight
Hüdepohlweg 8 · D-49326 Melle
E-Mail: info@azuvera.de · Tel.: +49 155 69490721
Instagram: @getazuvera · WhatsApp: wa.me/4915569490721
Website: azuvera.de · WebApp: get.azuvera.de
Impressum: get.azuvera.de/impressum · Datenschutz: get.azuvera.de/datenschutz`;

const STEPS = [
  { app: "Outlook (Mac)", text: "Outlook → Einstellungen → Signaturen → „+“ → ins Feld klicken → Cmd + V → Speichern." },
  { app: "Apple Mail", text: "Mail → Einstellungen → Signaturen → „+“ → Haken „Immer meiner Standardschrift entsprechen“ entfernen → Cmd + V." },
  { app: "Gmail & Outlook Web", text: "Einstellungen → Signatur → Neu → ins Feld klicken → Strg / Cmd + V → Speichern." },
];

function Signatur() {
  const [done, setDone] = useState<"" | "sig" | "html">("");
  const flash = (k: "sig" | "html") => { setDone(k); setTimeout(() => setDone(""), 2200); };

  async function copySig() {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([SIG_LIVE], { type: "text/html" }),
        "text/plain": new Blob([TEXT], { type: "text/plain" }),
      })]);
    } catch {
      const box = document.createElement("div");
      box.innerHTML = SIG_LIVE;
      box.style.position = "fixed"; box.style.left = "-9999px";
      document.body.appendChild(box);
      const r = document.createRange(); r.selectNodeContents(box);
      const s = getSelection(); s?.removeAllRanges(); s?.addRange(r);
      document.execCommand("copy"); s?.removeAllRanges(); box.remove();
    }
    flash("sig");
  }
  async function copyHtml() { await navigator.clipboard.writeText(SIG_LIVE); flash("html"); }

  return (
    <PublicLayout>
      <section className="relative overflow-hidden border-b bg-gradient-subtle">
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 size-[28rem] rounded-full bg-gradient-primary opacity-20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 size-80 rounded-full bg-brand-teal opacity-15 blur-3xl" />
        <div className="relative mx-auto max-w-5xl px-4 py-14 sm:py-20">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-teal/40 bg-background/70 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary backdrop-blur">
            <Sparkles className="size-3.5" aria-hidden /> Brand Kit
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
            Deine Azuvera <span className="whitespace-nowrap bg-gradient-primary bg-clip-text text-transparent">E-Mail-Signatur</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground">
            Einmal klicken, in Outlook, Apple Mail oder Gmail einfügen – fertig.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="overflow-hidden rounded-3xl border bg-card shadow-elegant">
          <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
            <div className="flex items-center gap-1.5" aria-hidden>
              <span className="size-3 rounded-full bg-muted-foreground/25" />
              <span className="size-3 rounded-full bg-muted-foreground/25" />
              <span className="size-3 rounded-full bg-muted-foreground/25" />
            </div>
            <span className="truncate text-xs text-muted-foreground">Neue E-Mail · info@azuvera.de</span>
            <Mail className="size-4 text-muted-foreground" aria-hidden />
          </div>
          {/* Weiß wie in einer echten E-Mail – unabhängig vom hellen/dunklen Modus. */}
          <div className="overflow-x-auto px-6 py-8 sm:px-10" style={{ background: "#ffffff" }}>
            <p className="mb-6 text-sm" style={{ color: "#677284", fontFamily: "Helvetica, Arial, sans-serif" }}>
              Viele Grüße
            </p>
            <div dangerouslySetInnerHTML={{ __html: SIG_LIVE }} />
          </div>
          <div className="flex flex-col gap-3 border-t bg-muted/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">Bilder und Links sind schon eingebaut.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button size="lg" className="h-11 bg-gradient-primary text-primary-foreground shadow-elegant" onClick={copySig}>
                {done === "sig" ? <Check /> : <Copy />} {done === "sig" ? "Kopiert" : "Signatur kopieren"}
              </Button>
              <Button size="lg" variant="outline" className="h-11" onClick={copyHtml}>
                {done === "html" ? <Check /> : <Code2 />} {done === "html" ? "Kopiert" : "HTML-Code"}
              </Button>
            </div>
          </div>
        </div>

        <h2 className="mt-14 text-2xl font-bold tracking-tight">So fügst du sie ein</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.app} className="rounded-2xl border bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-gradient-primary text-sm font-bold text-primary-foreground">{i + 1}</span>
                <h3 className="font-semibold">{s.app}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-gradient-subtle p-6">
          <Logo />
          <div className="flex gap-5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Globe className="size-4" aria-hidden /> azuvera.de</span>
            <span className="inline-flex items-center gap-1.5"><MonitorSmartphone className="size-4" aria-hidden /> get.azuvera.de</span>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

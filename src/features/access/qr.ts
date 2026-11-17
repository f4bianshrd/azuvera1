/** Gestalteter QR-Code (SVG) und Teil-Karte (PNG) für Einladungs-Codes – alles im Browser. */
import QRCode from "qrcode";
import iconUrl from "@/assets/azuvera-icon.png";
import { BRAND, oklchToRgb, rgbToHex } from "@/features/plan/export/color";

export const QR_INK = rgbToHex(oklchToRgb(0.26, 0.07, 262));
const SURFACE = rgbToHex(oklchToRgb(0.975, 0.008, 250));
const MUTED_TEXT = rgbToHex(oklchToRgb(0.5, 0.03, 258));

let logoData: Promise<string | null> | null = null;
/** App-Icon als data:-URL, damit es in SVG-Bildern und im Canvas mitkommt. */
export function logoDataUrl(): Promise<string | null> {
  logoData ??= fetch(iconUrl)
    .then((r) => r.blob())
    .then((b) => new Promise<string | null>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => res(null); fr.readAsDataURL(b); }))
    .catch(() => null);
  return logoData;
}

/** QR-Code mit runden Punkten, eigenen Ecken und Logo in der Mitte (Fehlerkorrektur H). */
export function qrSvg(text: string, opts: { size?: number; logo?: string | null; dark?: string; accent?: string } = {}): string {
  const size = opts.size ?? 512, dark = opts.dark ?? BRAND.primary, accent = opts.accent ?? BRAND.teal;
  const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
  const n = qr.modules.size, data = qr.modules.data;
  const quiet = 2, s = size / (n + quiet * 2), off = quiet * s;
  const finder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  let hole = Math.round(n * 0.24); if (hole % 2 === 0) hole += 1;
  const h0 = (n - hole) / 2, h1 = h0 + hole;
  const inHole = (r: number, c: number) => !!opts.logo && r >= h0 && r < h1 && c >= h0 && c < h1;
  const dots: string[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!data[r * n + c] || finder(r, c) || inHole(r, c)) continue;
    dots.push(`<circle cx="${(off + (c + 0.5) * s).toFixed(2)}" cy="${(off + (r + 0.5) * s).toFixed(2)}" r="${(s * 0.43).toFixed(2)}"/>`);
  }
  const eye = (r: number, c: number) => {
    const x = off + c * s, y = off + r * s;
    return `<rect x="${(x + s / 2).toFixed(2)}" y="${(y + s / 2).toFixed(2)}" width="${(6 * s).toFixed(2)}" height="${(6 * s).toFixed(2)}" rx="${(2 * s).toFixed(2)}" fill="none" stroke="${dark}" stroke-width="${s.toFixed(2)}"/>`
      + `<rect x="${(x + 2 * s).toFixed(2)}" y="${(y + 2 * s).toFixed(2)}" width="${(3 * s).toFixed(2)}" height="${(3 * s).toFixed(2)}" rx="${(1.1 * s).toFixed(2)}" fill="${accent}"/>`;
  };
  let logo = "";
  if (opts.logo) {
    const lx = off + h0 * s, lw = hole * s, pad = s * 0.6;
    logo = `<rect x="${(lx + pad / 2).toFixed(2)}" y="${(lx + pad / 2).toFixed(2)}" width="${(lw - pad).toFixed(2)}" height="${(lw - pad).toFixed(2)}" rx="${(lw * 0.22).toFixed(2)}" fill="#ffffff"/>`
      + `<image href="${opts.logo}" x="${(lx + pad).toFixed(2)}" y="${(lx + pad).toFixed(2)}" width="${(lw - 2 * pad).toFixed(2)}" height="${(lw - 2 * pad).toFixed(2)}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`
    + `<rect width="${size}" height="${size}" rx="${(size * 0.06).toFixed(1)}" fill="#ffffff"/>`
    + `<g fill="${dark}">${dots.join("")}</g>${eye(0, 0)}${eye(0, n - 7)}${eye(n - 7, 0)}${logo}</svg>`;
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Teil-Karte 1080×1350 (Hochformat wie in Messengern) mit Name, Zugriffsart, QR und Code. */
export async function qrCardPng(args: { url: string; code: string; name: string; access: string; who: string; validUntil: string }): Promise<Blob> {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const logo = await logoDataUrl();
  ctx.fillStyle = SURFACE; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, W, 420); g.addColorStop(0, BRAND.primary); g.addColorStop(1, BRAND.teal);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 420);
  ctx.fillStyle = "#ffffff"; roundRect(ctx, 70, 150, W - 140, H - 230, 56); ctx.fill();
  const font = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  if (logo) ctx.drawImage(await loadImage(logo), 70, 52, 72, 72);
  ctx.fillStyle = "#ffffff"; ctx.font = `700 44px ${font}`; ctx.textBaseline = "middle"; ctx.fillText("Azuvera", 160, 90);
  ctx.textAlign = "center"; ctx.fillStyle = MUTED_TEXT; ctx.font = `600 30px ${font}`;
  ctx.fillText("EINLADUNG VON", W / 2, 230);
  ctx.fillStyle = QR_INK; ctx.font = `700 54px ${font}`;
  ctx.fillText(args.name.length > 30 ? `${args.name.slice(0, 29)}…` : args.name, W / 2, 300);
  ctx.font = `600 32px ${font}`; const pill = `${args.access} · ${args.who}`;
  const pw = Math.min(W - 200, ctx.measureText(pill).width + 64);
  ctx.fillStyle = `${BRAND.teal}22`; roundRect(ctx, (W - pw) / 2, 345, pw, 60, 30); ctx.fill();
  ctx.fillStyle = BRAND.primary; ctx.fillText(pill, W / 2, 376, W - 240);
  const qrImg = await loadImage(svgDataUrl(qrSvg(args.url, { size: 640, logo })));
  ctx.drawImage(qrImg, (W - 640) / 2, 440, 640, 640);
  ctx.fillStyle = QR_INK; ctx.font = `700 72px ui-monospace, 'SF Mono', Menlo, monospace`;
  ctx.fillText(args.code, W / 2, 1150);
  ctx.fillStyle = MUTED_TEXT; ctx.font = `400 28px ${font}`;
  ctx.fillText(`In Azuvera scannen oder Code eingeben · gültig bis ${args.validUntil}`, W / 2, 1215, W - 200);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Bild konnte nicht erstellt werden."))), "image/png"));
}

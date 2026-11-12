/** Diagramme für den PDF-Export als PNG (Canvas im Browser). */
import type { ChartSpec } from "./model";

const W = 900, H = 420;

function toPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (b) => {
      if (!b) return reject(new Error("Diagramm konnte nicht gezeichnet werden."));
      resolve(new Uint8Array(await b.arrayBuffer()));
    }, "image/png");
  });
}

/** Zeichnet ein Diagramm; null, wenn es keine Daten gibt. */
export async function chartPng(spec: ChartSpec): Promise<Uint8Array | null> {
  const total = spec.series.reduce((s, x) => s + x.values.reduce((a, b) => a + b, 0), 0);
  if (total === 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
  ctx.font = "22px Helvetica, Arial, sans-serif";
  ctx.textBaseline = "middle";
  if (spec.kind === "bar") drawBars(ctx, spec); else drawDonut(ctx, spec);
  return toPng(canvas);
}

function drawBars(ctx: CanvasRenderingContext2D, spec: ChartSpec) {
  const left = 60, right = W - 20, top = 30, bottom = H - 80;
  const step = Math.max(1, Math.ceil(Math.max(1, ...spec.series.flatMap((s) => s.values)) / 4));
  const max = step * 4;
  ctx.strokeStyle = "#d9dee6"; ctx.fillStyle = "#5b6472"; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = bottom - ((bottom - top) * i) / 4;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    ctx.textAlign = "right"; ctx.fillText(String(step * i), left - 8, y);
  }
  const n = spec.labels.length, groupW = (right - left) / Math.max(1, n), barW = Math.min(60, (groupW * 0.7) / spec.series.length);
  spec.labels.forEach((label, gi) => {
    const gx = left + gi * groupW + (groupW - barW * spec.series.length) / 2;
    spec.series.forEach((s, si) => {
      const v = s.values[gi] ?? 0, h = ((bottom - top) * v) / max;
      ctx.fillStyle = s.color; ctx.fillRect(gx + si * barW, bottom - h, barW - 4, h);
    });
    ctx.fillStyle = "#1c2838"; ctx.textAlign = "center"; ctx.fillText(label, left + gi * groupW + groupW / 2, bottom + 22);
  });
  legend(ctx, spec.series.map((s) => [s.name, s.color] as [string, string]), H - 26);
}

function drawDonut(ctx: CanvasRenderingContext2D, spec: ChartSpec) {
  const values = spec.series[0]!.values, colors = spec.series[0]!.color.split(",");
  const total = values.reduce((a, b) => a + b, 0);
  const cx = W / 2, cy = (H - 60) / 2 + 10, r = 140;
  let a = -Math.PI / 2;
  values.forEach((v, i) => {
    const da = (v / total) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a, a + da); ctx.closePath();
    ctx.fillStyle = colors[i % colors.length]!; ctx.fill(); a += da;
  });
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2); ctx.fillStyle = "#ffffff"; ctx.fill();
  legend(ctx, spec.labels.map((l, i) => [`${l} (${values[i]})`, colors[i % colors.length]!] as [string, string]), H - 26);
}

function legend(ctx: CanvasRenderingContext2D, entries: [string, string][], y: number) {
  ctx.font = "20px Helvetica, Arial, sans-serif";
  entries = entries.map(([t, c]) => [t.length > 30 ? `${t.slice(0, 29)}…` : t, c]);
  const widths = entries.map(([t]) => ctx.measureText(t).width + 44);
  let x = Math.max(10, (W - widths.reduce((a, b) => a + b, 0)) / 2);
  entries.forEach(([t, c], i) => {
    ctx.fillStyle = c; ctx.fillRect(x, y - 9, 18, 18);
    ctx.fillStyle = "#1c2838"; ctx.textAlign = "left"; ctx.fillText(t, x + 24, y);
    x += widths[i]!;
  });
}

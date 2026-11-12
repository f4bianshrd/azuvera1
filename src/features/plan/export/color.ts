/** Farbumrechnung für Export (PDF/Canvas brauchen sRGB). Quelle sind die oklch-Werte der Marken-Variablen. */
export function oklchToRgb(l: number, c: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h), b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3, M = m_ ** 3, S = s_ ** 3;
  const lin = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  const enc = (x: number) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  };
  return [enc(lin[0]!), enc(lin[1]!), enc(lin[2]!)];
}
export const rgbToHex = ([r, g, b]: [number, number, number]) => `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
export function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [0.05, 0.42, 0.55];
  return [parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255, parseInt(m[3]!, 16) / 255];
}

/** Helle Marken-Tokens aus src/styles.css (--primary, --brand-teal, --success, --destructive, --warning). */
export const BRAND = {
  primary: rgbToHex(oklchToRgb(0.48, 0.19, 258)),
  teal: rgbToHex(oklchToRgb(0.72, 0.13, 180)),
  success: rgbToHex(oklchToRgb(0.62, 0.15, 155)),
  destructive: rgbToHex(oklchToRgb(0.58, 0.22, 27)),
  warning: rgbToHex(oklchToRgb(0.75, 0.15, 75)),
  muted: rgbToHex(oklchToRgb(0.88, 0.01, 250)),
};

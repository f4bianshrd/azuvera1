import { format } from "date-fns";
import { de } from "date-fns/locale";
import { parseTime } from "./util";

export const PLATFORM_LABELS: Record<string, string> = {
  ios: "iPhone",
  ipados: "iPad",
  macos_arm: "Mac (Apple Silicon)",
  macos_intel: "Mac (Intel)",
  macos_universal: "Mac",
};

export function platformLabel(p: string | null | undefined): string {
  return (p && PLATFORM_LABELS[p]) || "Gerät";
}

export function defaultDeviceName(p: string): string {
  if (p === "ios") return "iPhone";
  if (p === "ipados") return "iPad";
  return "Mac";
}

export function fmtDate(v: unknown): string {
  const ms = parseTime(v);
  return ms ? format(ms, "d. MMMM yyyy", { locale: de }) : "–";
}

export function fmtDateTime(v: unknown): string {
  const ms = parseTime(v);
  return ms ? format(ms, "d. MMMM yyyy, HH:mm 'Uhr'", { locale: de }) : "–";
}

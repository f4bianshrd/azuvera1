/**
 * Geräte- und Browser-Naht. Heute Web-Implementierung; später lassen sich hier
 * Capacitor-Plugins einsetzen. Kein anderer Code ruft diese Browser-APIs direkt auf.
 */
export type ConnectionType = "wifi" | "ethernet" | "cellular" | "other" | "unknown";

export interface NetworkStatus {
  online: boolean;
  /** Verbindungsart, nur wenn der Browser sie meldet. */
  type: ConnectionType | null;
  saveData: boolean;
}

interface NetworkInformationLike extends EventTarget {
  type?: string;
  saveData?: boolean;
}

function connection(): NetworkInformationLike | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

export function isNative(): boolean {
  return false;
}

export function getNetworkStatus(): NetworkStatus {
  if (typeof navigator === "undefined") return { online: true, type: null, saveData: false };
  const c = connection();
  const raw = c?.type;
  const type: ConnectionType | null = raw
    ? raw === "wifi" || raw === "ethernet" || raw === "cellular"
      ? raw
      : raw === "unknown"
        ? "unknown"
        : "other"
    : null;
  return { online: navigator.onLine, type, saveData: !!c?.saveData };
}

/** Meldet der Browser die Verbindungsart? (Safari/iPhone und die meisten Desktop-Browser nicht.) */
export function connectionTypeKnown(): boolean {
  return getNetworkStatus().type !== null;
}

export function onNetworkChange(cb: (s: NetworkStatus) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const fire = () => cb(getNetworkStatus());
  window.addEventListener("online", fire);
  window.addEventListener("offline", fire);
  const c = connection();
  c?.addEventListener("change", fire);
  return () => {
    window.removeEventListener("online", fire);
    window.removeEventListener("offline", fire);
    c?.removeEventListener("change", fire);
  };
}

export function onVisibilityChange(cb: (visible: boolean) => void): () => void {
  if (typeof document === "undefined") return () => undefined;
  const fire = () => cb(document.visibilityState === "visible");
  document.addEventListener("visibilitychange", fire);
  return () => document.removeEventListener("visibilitychange", fire);
}

export function isVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

/** Datei wählen oder Foto aufnehmen (Web: Dateiauswahl mit capture). */
export function pickOrCapturePhoto(opts: { capture?: boolean; accept?: string; multiple?: boolean } = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = opts.accept ?? "image/*";
    if (opts.capture) input.setAttribute("capture", "environment");
    if (opts.multiple) input.multiple = true;
    input.onchange = () => resolve(input.files ? [...input.files] : []);
    input.click();
  });
}

/** Platzhalter für Teil 4B (Web Push). */
export async function registerPush(): Promise<null> {
  return null;
}

/** Push-Anmeldung dieses Geräts entfernen (falls vorhanden). */
export async function unregisterPush(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      const sub = await reg.pushManager?.getSubscription();
      await sub?.unsubscribe();
    }
  } catch {
    /* kein Push vorhanden */
  }
}

export function openExternal(url: string): void {
  window.open(url, "_blank", "noopener");
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

// ---------- Speicher ----------
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
export async function isStoragePersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}
export async function clearCacheStorage(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    for (const key of await caches.keys()) await caches.delete(key);
  } catch {
    /* nicht verfügbar */
  }
}

// ---------- Installation ----------
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}
export function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}
export function isLovablePreviewHost(hostname = typeof window === "undefined" ? "" : window.location.hostname): boolean {
  const h = hostname.toLowerCase();
  const first = h.split(".")[0] ?? "";
  const suffixOk = /\.(lovable\.app|gpt-eng\.com|gptengineer\.run)$/.test(h);
  if (suffixOk && /^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/.test(first)) return true;
  if (suffixOk && /^live--[0-9a-f-]{36}(?:-thr_[a-z0-9]+)?$/.test(first)) return true;
  if (/^project--[0-9a-f-]+-dev\./.test(h)) return true;
  if (h === "lovableproject.com" || h.endsWith(".lovableproject.com")) return true;
  if (h === "lovableproject-dev.com" || h.endsWith(".lovableproject-dev.com")) return true;
  if (h === "beta.lovable.dev" || h.endsWith(".beta.lovable.dev")) return true;
  return h === "localhost" || h === "127.0.0.1";
}

// ---------- Geräte-Einstellungen (localStorage in try/catch) ----------
export function readDevicePref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}
export function writeDevicePref(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* privat */
  }
}
export function readDeviceString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeDeviceString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* privat */
  }
}

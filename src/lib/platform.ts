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

// ---------- Web Push ----------
export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
export function notificationPermission(): NotificationPermission | null {
  return pushSupported() ? Notification.permission : null;
}
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  return Notification.requestPermission();
}
export function deviceUserAgent(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent;
}
async function pushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  const regs = await navigator.serviceWorker.getRegistrations();
  return regs.find((r) => (r.active ?? r.waiting ?? r.installing)?.scriptURL.endsWith("/sw.js")) ?? null;
}
export interface PushKeys { endpoint: string; p256dh: string; auth: string; serverKey: string | null }
function b64url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  let s = ""; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function toKeys(sub: PushSubscription): PushKeys {
  return { endpoint: sub.endpoint, p256dh: b64url(sub.getKey("p256dh")), auth: b64url(sub.getKey("auth")), serverKey: b64url(sub.options.applicationServerKey) || null };
}
export function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
/** Aktuelle Push-Anmeldung dieses Geräts (ohne Berechtigungsfrage). */
export async function currentPush(): Promise<PushKeys | null> {
  try {
    const sub = await (await pushRegistration())?.pushManager.getSubscription();
    return sub ? toKeys(sub) : null;
  } catch { return null; }
}
/** Gerät für Push anmelden; Berechtigung muss vorher erteilt sein. */
export async function registerPush(publicKey: string): Promise<PushKeys> {
  const reg = (await pushRegistration()) ?? (await navigator.serviceWorker.ready);
  const old = await reg.pushManager.getSubscription();
  if (old && b64url(old.options.applicationServerKey) !== publicKey) await old.unsubscribe();
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(publicKey) });
  return toKeys(sub);
}

/** Push-Anmeldung dieses Geräts entfernen (falls vorhanden); liefert den Endpunkt. */
export async function unregisterPush(): Promise<string | null> {
  try {
    if (!pushSupported()) return null;
    const sub = await (await pushRegistration())?.pushManager.getSubscription();
    if (!sub) return null;
    const ep = sub.endpoint;
    await sub.unsubscribe();
    return ep;
  } catch {
    return null;
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Zähler am App-Symbol; fehlende Unterstützung wird still ignoriert. */
export async function setAppBadge(count: number): Promise<void> {
  try {
    const n = navigator as Navigator & { setAppBadge?: (c?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (count > 0) await n.setAppBadge?.(count);
    else await n.clearAppBadge?.();
  } catch { /* nicht unterstützt */ }
}

/** Nachrichten des Service Workers empfangen (z. B. Navigation nach Klick auf eine Benachrichtigung). */
export function onServiceWorkerMessage(cb: (data: unknown) => void): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return () => undefined;
  const h = (e: MessageEvent) => cb(e.data);
  navigator.serviceWorker.addEventListener("message", h);
  return () => navigator.serviceWorker.removeEventListener("message", h);
}

export function openExternal(url: string): void {
  window.open(url, "_blank", "noopener");
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/** Teilen-Menü des Geräts; liefert false, wenn es keins gibt (dann kopiert der Aufrufer). */
export async function shareContent(data: { title?: string; text?: string; url?: string; files?: File[] }): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  const payload: ShareData = { ...data };
  if (data.files?.length && !(navigator.canShare?.({ files: data.files }) ?? false)) delete payload.files;
  try {
    await navigator.share(payload);
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return true;
    return false;
  }
}

// ---------- Kamera (QR-Scanner) ----------
export function cameraSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}
/** Rückkamera öffnen; wirft DOMException (NotAllowedError, NotFoundError …). */
export async function openCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
}
export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}
/** Öffentliche Adresse der App für Links in QR-Codes (in Capacitor gibt es keinen http-Origin). */
export function publicAppOrigin(): string {
  if (typeof window === "undefined") return "https://get.azuvera.de";
  const o = window.location.origin;
  return /^https?:/.test(o) ? o : "https://get.azuvera.de";
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

/** Datei auf dem Gerät speichern (Download). */
export function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

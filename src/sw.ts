/* Azuvera Service Worker (Workbox, injectManifest).
 * - Precache der App-Hülle (HTML, JS, CSS, Icons), cleanupOutdatedCaches.
 * - Navigations-Fallback auf die App-Hülle (/_shell.html, beim Installieren gesichert).
 * - Statische Dateien: StaleWhileRevalidate.
 * - Backend (Datenbank, Auth, Storage, Funktionen) geht immer direkt ins Netz – nie zwischengespeichert.
 * - skipWaiting nur nach Klick auf „Jetzt aktualisieren“ (Nachricht SKIP_WAITING).
 */
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { StaleWhileRevalidate } from "workbox-strategies";

type PrecacheEntry = { url: string; revision: string | null } | string;

declare global {
  interface Window {
    __WB_MANIFEST: PrecacheEntry[];
  }
}

interface SwScope {
  location: Location;
  addEventListener: (type: string, cb: (event: never) => void) => void;
  skipWaiting: () => Promise<void>;
}
const sw = self as unknown as SwScope;

// Workbox ersetzt genau diesen Ausdruck beim Build durch die Precache-Liste.
const manifest = self.__WB_MANIFEST;
precacheAndRoute(manifest);
cleanupOutdatedCaches();

const SHELL_CACHE = "azuvera-shell";
/** SPA-Hülle: wird nach dem Client-Build erzeugt und steht deshalb nicht in der Precache-Liste. */
const SHELL_URL = "/_shell.html";
const precachedShell = (() => {
  const urls = manifest.map((e) => (typeof e === "string" ? e : e.url));
  return urls.find((u) => /(^|\/)_shell\.html$/.test(u)) ?? urls.find((u) => /(^|\/)index\.html$/.test(u)) ?? null;
})();

async function refreshShell(): Promise<void> {
  const res = await fetch(SHELL_URL, { cache: "no-store", credentials: "same-origin" });
  if (res.ok && (res.headers.get("content-type") ?? "").includes("text/html")) {
    await (await caches.open(SHELL_CACHE)).put(SHELL_URL, res);
  }
}

// Beim Installieren die App-Hülle sichern, damit der allererste Offline-Start klappt.
sw.addEventListener("install", (event: { waitUntil: (p: Promise<unknown>) => void }) => {
  event.waitUntil(refreshShell().catch(() => undefined));
});

async function offlineShell(): Promise<Response | undefined> {
  const cache = await caches.open(SHELL_CACHE);
  return (
    (await cache.match(SHELL_URL)) ??
    (precachedShell ? await matchPrecache(precachedShell) : undefined) ??
    (await cache.match("/__shell")) // ältere Versionen
  );
}

/** Backend-Anfragen niemals im Service Worker behandeln. */
function isBackend(url: URL): boolean {
  if (url.origin !== sw.location.origin) return true; // Datenbank/Auth/Storage/Funktionen liegen auf eigener Domain
  return /^\/(rest|auth|storage|functions|realtime|lovable|~oauth|_serverFn|api)(\/|$)/.test(url.pathname);
}

// Navigationen: Netz zuerst (neue Version), offline die App-Hülle.
registerRoute(
  ({ request, url }) => request.mode === "navigate" && !isBackend(url),
  async ({ request }) => {
    try {
      const res = await fetch(request);
      // Hülle im Hintergrund aktuell halten (passt immer zur gerade geladenen Version).
      void refreshShell().catch(() => undefined);
      return res;
    } catch {
      return (await offlineShell()) ?? Response.error();
    }
  },
);

// Statische Dateien (gleiche Herkunft): StaleWhileRevalidate.
registerRoute(
  ({ request, url }) => !isBackend(url) && ["script", "style", "image", "font", "manifest"].includes(request.destination),
  new StaleWhileRevalidate({ cacheName: "azuvera-static" }),
);

sw.addEventListener("message", (event: { data?: { type?: string } }) => {
  if (event.data?.type === "SKIP_WAITING") void sw.skipWaiting();
});

// ---------- Push (Teil 4C) – arbeitet ohne Backend-Aufrufe, auch bei geschlossener App ----------
interface PushScope {
  registration: { showNotification: (title: string, opts: Record<string, unknown>) => Promise<void> };
  clients: {
    matchAll: (o: { type: "window"; includeUncontrolled: boolean }) => Promise<Array<{ url: string; focus: () => Promise<unknown>; navigate?: (u: string) => Promise<unknown>; postMessage: (m: unknown) => void }>>;
    openWindow: (u: string) => Promise<unknown>;
  };
}
const psw = self as unknown as PushScope;
type WaitEvent = { waitUntil: (p: Promise<unknown>) => void };

function safePath(u: unknown): string {
  return typeof u === "string" && u.startsWith("/") && !u.startsWith("//") ? u : "/notifications";
}

sw.addEventListener("push", (event: WaitEvent & { data?: { json: () => unknown } | null }) => {
  let title = "Neue Benachrichtigung";
  let body = "Öffne Azuvera, um sie zu lesen.";
  let url = "/notifications";
  let tag: string | undefined;
  try {
    const p = (event.data?.json() ?? {}) as { title?: unknown; body?: unknown; url?: unknown; tag?: unknown };
    if (typeof p.title === "string" && p.title) title = p.title;
    if (typeof p.body === "string") body = p.body;
    url = safePath(p.url);
    if (typeof p.tag === "string") tag = p.tag;
  } catch {
    /* Standardtext */
  }
  event.waitUntil(
    psw.registration.showNotification(title, { body, icon: "/icons/icon-192.png", badge: "/icons/badge-96.png", tag, data: { url }, lang: "de" }),
  );
});

sw.addEventListener("notificationclick", (event: WaitEvent & { notification: { close: () => void; data?: { url?: unknown } } }) => {
  event.notification.close();
  const url = safePath(event.notification.data?.url);
  event.waitUntil(
    (async () => {
      const wins = await psw.clients.matchAll({ type: "window", includeUncontrolled: true });
      const win = wins.find((c) => new URL(c.url).origin === sw.location.origin);
      if (win) {
        await win.focus();
        if (win.navigate) {
          try { await win.navigate(url); return; } catch { /* unkontrolliertes Fenster */ }
        }
        win.postMessage({ type: "NAVIGATE", url });
        return;
      }
      await psw.clients.openWindow(url);
    })(),
  );
});

// Kein Upload hier (keine Sitzung im Service Worker); die App meldet das Gerät beim nächsten Start neu an.
sw.addEventListener("pushsubscriptionchange", () => undefined);

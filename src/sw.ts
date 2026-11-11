/* Azuvera Service Worker (Workbox, injectManifest).
 * - Precache der App-Hülle (HTML, JS, CSS, Icons), cleanupOutdatedCaches.
 * - Navigations-Fallback auf die App-Hülle (index.html bzw. SPA-Shell).
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
const shellUrl = (() => {
  const urls = manifest.map((e) => (typeof e === "string" ? e : e.url));
  return urls.find((u) => /(^|\/)index\.html$/.test(u)) ?? urls.find((u) => /_shell\.html$/.test(u)) ?? null;
})();

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
      if (res.ok) {
        const cache = await caches.open(SHELL_CACHE);
        await cache.put("/__shell", res.clone());
      }
      return res;
    } catch {
      const pre = shellUrl ? await matchPrecache(shellUrl) : undefined;
      return pre ?? (await (await caches.open(SHELL_CACHE)).match("/__shell")) ?? Response.error();
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

// ---------- Platzhalter für Teil 4B (Push) ----------
// sw.addEventListener("push", (event) => {
//   // Teil 4B: Benachrichtigung aus event.data anzeigen (self.registration.showNotification).
// });
// sw.addEventListener("notificationclick", (event) => {
//   // Teil 4B: Ziel-URL der Benachrichtigung öffnen bzw. vorhandenes Fenster fokussieren.
// });

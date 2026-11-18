import { toast } from "sonner";
import { isInIframe, isLovablePreviewHost, isNative } from "@/lib/platform";

let started = false;

/**
 * Service Worker registrieren – nur außerhalb von iframes und Lovable-Vorschauen.
 * Neue Versionen laden im Hintergrund; aktualisiert wird erst nach „Jetzt aktualisieren“.
 */
export async function registerAppServiceWorker(): Promise<void> {
  if (started || typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  started = true;
  // Native App: Dateien liegen im App-Paket, kein Service Worker.
  if (isNative()) return;
  const refused = !import.meta.env.PROD || isInIframe() || isLovablePreviewHost() || new URLSearchParams(window.location.search).get("sw") === "off";
  if (refused) {
    // Alte Registrierungen in der Vorschau entfernen, damit keine alten Zwischenstände bleiben.
    for (const reg of await navigator.serviceWorker.getRegistrations()) {
      if (reg.active?.scriptURL.endsWith("/sw.js") || reg.installing?.scriptURL.endsWith("/sw.js") || reg.waiting?.scriptURL.endsWith("/sw.js")) await reg.unregister();
    }
    return;
  }
  const { Workbox } = await import("workbox-window");
  const wb = new Workbox("/sw.js", { scope: "/" });
  wb.addEventListener("waiting", () => {
    toast("Neue Version verfügbar", {
      duration: Infinity,
      action: {
        label: "Jetzt aktualisieren",
        onClick: () => {
          wb.addEventListener("controlling", () => window.location.reload());
          wb.messageSkipWaiting();
        },
      },
    });
  });
  await wb.register();
}

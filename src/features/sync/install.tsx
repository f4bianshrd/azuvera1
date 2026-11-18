import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isIosSafari, isNative, isStandalone, readDeviceString, writeDeviceString } from "@/lib/platform";

interface BeforeInstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

let deferred: BeforeInstallPromptEvent | null = null;
const subs = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BeforeInstallPromptEvent; subs.forEach((s) => s()); });
  window.addEventListener("appinstalled", () => { deferred = null; subs.forEach((s) => s()); });
}

export const IOS_INSTALL_TEXT = "Tippe auf Teilen und dann auf ‘Zum Home-Bildschirm’, um Azuvera zu installieren.";

export function useInstall() {
  const [, force] = useState(0);
  const [env, setEnv] = useState({ standalone: true, ios: false });
  useEffect(() => {
    // Native App: gilt als installiert, damit kein Installationshinweis erscheint.
    setEnv({ standalone: isNative() || isStandalone(), ios: !isNative() && isIosSafari() });
    const s = () => force((n) => n + 1);
    subs.add(s);
    return () => { subs.delete(s); };
  }, []);
  return {
    installed: env.standalone,
    ios: env.ios,
    canPrompt: !!deferred,
    prompt: async () => { if (deferred) { await deferred.prompt(); deferred = null; force((n) => n + 1); } },
  };
}

/** Installationshilfe: Button (Android/PC) oder Text (iPhone/iPad). Installiert: nichts. */
export function InstallHelp() {
  const i = useInstall();
  if (i.installed) return <p className="text-sm text-muted-foreground">Azuvera ist auf diesem Gerät installiert.</p>;
  if (i.ios) return <p className="text-sm">{IOS_INSTALL_TEXT}</p>;
  if (i.canPrompt) return <Button onClick={() => void i.prompt()}>App installieren</Button>;
  return <p className="text-sm text-muted-foreground">Öffne Azuvera in Chrome, Edge oder Safari, um die App zu installieren.</p>;
}

const VISITS = "azuvera-visits";
const DISMISSED = "azuvera-install-dismissed";

/** Einmaliges, wegklickbares Banner ab dem zweiten Besuch. */
export function InstallBanner() {
  const i = useInstall();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const visits = Number(readDeviceString(VISITS) ?? "0") + 1;
    writeDeviceString(VISITS, String(visits));
    setShow(visits >= 2 && readDeviceString(DISMISSED) !== "1");
  }, []);
  if (!show || i.installed || (!i.ios && !i.canPrompt)) return null;
  const close = () => { writeDeviceString(DISMISSED, "1"); setShow(false); };
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border bg-card p-3 text-sm">
      <div className="flex-1 space-y-2">
        {i.ios ? <p>{IOS_INSTALL_TEXT}</p> : <><p>Installiere Azuvera als App – sie startet schneller und funktioniert auch offline.</p><Button size="sm" onClick={() => void i.prompt().then(close)}>App installieren</Button></>}
      </div>
      <Button variant="ghost" size="icon" className="size-8" aria-label="Schließen" onClick={close}><X className="size-4" /></Button>
    </div>
  );
}

/** iPhone/iPad im Safari-Tab mit wartenden Änderungen. */
export function IosDataSafetyBanner({ pending }: { pending: number }) {
  const i = useInstall();
  if (!i.ios || i.installed || pending === 0) return null;
  return (
    <div className="mb-4 rounded-xl border border-warning bg-warning/15 p-3 text-sm">
      Installiere Azuvera auf dem Home-Bildschirm, damit nicht synchronisierte Daten sicher bleiben. Safari kann lokale Daten von lange nicht genutzten Webseiten löschen.
    </div>
  );
}

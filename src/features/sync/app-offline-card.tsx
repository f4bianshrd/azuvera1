import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/dialogs";
import { connectionTypeKnown, isStoragePersisted, readDevicePref, storageEstimate, writeDevicePref } from "@/lib/platform";
import { useSyncStatus } from "@/lib/sync/status";
import { PREF_PHOTOS_WIFI, PREF_WIFI_ONLY, scheduleSync } from "@/lib/sync/engine";
import { clearLocalData, pendingChangeCount } from "@/features/app/session";
import { InstallHelp } from "./install";
import { SyncNowButton } from "./sync-now-button";
import { UNSYNCED_WARNING } from "./sign-out";

const mb = (n: number) => (n / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 });

export function AppOfflineCard() {
  const status = useSyncStatus();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [known, setKnown] = useState(false);
  const [wifiOnly, setWifiOnly] = useState(false);
  const [photosWifi, setPhotosWifi] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    void isStoragePersisted().then(setPersisted);
    void storageEstimate().then(setEstimate);
    setKnown(connectionTypeKnown());
    setWifiOnly(readDevicePref(PREF_WIFI_ONLY, false));
    setPhotosWifi(readDevicePref(PREF_PHOTOS_WIFI, true));
  }, []);

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4">
      <h2 className="font-semibold">App &amp; Offline</h2>
      <InstallHelp />
      <div className="space-y-1 text-sm">
        <p>Dauerhafter Speicher: <span className="font-medium">{persisted === null ? "…" : persisted ? "gewährt" : "nicht gewährt"}</span></p>
        {estimate && <p className="text-muted-foreground">Belegt: {mb(estimate.usage)} MB von etwa {mb(estimate.quota)} MB</p>}
      </div>
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div><Label htmlFor="wifi-only">Nur im WLAN synchronisieren</Label><p className="text-xs text-muted-foreground">Wartende Änderungen werden nur im WLAN gesendet.</p></div>
          <Switch id="wifi-only" disabled={!known} checked={known && wifiOnly} onCheckedChange={(v) => { setWifiOnly(v); writeDevicePref(PREF_WIFI_ONLY, v); scheduleSync(0); }} />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div><Label htmlFor="photos-wifi">Fotos nur im WLAN hochladen</Label><p className="text-xs text-muted-foreground">Fotos und PDFs warten auf WLAN.</p></div>
          <Switch id="photos-wifi" disabled={!known} checked={known && photosWifi} onCheckedChange={(v) => { setPhotosWifi(v); writeDevicePref(PREF_PHOTOS_WIFI, v); scheduleSync(0); }} />
        </div>
        {!known && <p className="text-xs text-muted-foreground">Dein Browser meldet nicht, ob du im WLAN bist. Azuvera synchronisiert deshalb bei jeder Verbindung.</p>}
      </div>
      <div className="space-y-2 text-sm">
        <p>Letzte Synchronisation: {status.lastSyncAt ? formatDistanceToNow(status.lastSyncAt, { addSuffix: true, locale: de }) : "noch nie"}</p>
        <div className="flex flex-wrap gap-2">
          <SyncNowButton />
          <Button variant="link" asChild className="px-0"><Link to="/sync">Synchronisationsstatus</Link></Button>
        </div>
      </div>
      <Button variant="outline" className="text-destructive" onClick={async () => { setPending(await pendingChangeCount()); setConfirm(true); }}>Lokale Daten löschen</Button>
      <p className="text-xs text-muted-foreground">Die Daten auf deinem Gerät sind nicht zusätzlich verschlüsselt. Nutze eine Gerätesperre.</p>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Lokale Daten löschen"
        description={pending > 0 ? UNSYNCED_WARNING : "Die Daten auf diesem Gerät werden gelöscht und beim nächsten Start neu geladen."}
        confirmLabel="Lokale Daten löschen"
        destructive
        onConfirm={async () => { await clearLocalData(); toast.success("Lokale Daten gelöscht"); window.location.reload(); }}
      />
    </section>
  );
}

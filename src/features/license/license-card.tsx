import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { NATIVE_LICENSE as C } from "@/config/native-license";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/dialogs";
import { useNative } from "@/lib/use-native";
import { openExternal } from "@/lib/platform";
import { useLicense } from "./store";
import { checkNow, deactivate } from "./service";
import { maskLicenseKey } from "./key";
import { fmtDate, fmtDateTime } from "./labels";

const BLOCK_TOAST: Record<string, string> = {
  ended: "Diese Lizenz ist beendet.",
  refunded: "Dieser Kauf wurde erstattet.",
  revoked: "Diese Lizenz wurde gesperrt.",
  payment: "Die Zahlung für diese Lizenz fehlt.",
};

/** Karte „Lizenz“ im Profil – nur in der nativen App. */
export function LicenseCard() {
  const native = useNative();
  const lic = useLicense();
  const [confirm, setConfirm] = useState(false);
  if (!native || !lic.stored?.licenseKey) return null;
  const s = lic.stored;
  const until = lic.accessUntil ?? s.accessUntil;

  const check = async () => {
    const r = await checkNow({ force: true });
    if (r.status === "ok") toast.success("Lizenz geprüft – alles in Ordnung.");
    else if (r.status === "offline")
      toast.error("Keine Verbindung. Die Lizenz gilt bis zur nächsten Prüfung weiter.");
    else if (r.status === "blocked")
      toast.error(BLOCK_TOAST[r.reason] ?? "Die Lizenz ist nicht mehr gültig.");
    else if (r.status === "removed") toast.error("Dieses Gerät wurde abgemeldet.");
    else if (r.status === "error") toast.error(r.message);
  };

  const rows: Array<[string, string]> = [
    ["Tarif", s.planLabel ?? "–"],
    ["Status", s.status === "past_due" ? "Zahlung überfällig" : "Aktiv"],
    ["Zugriff", until ? `Zugriff bis ${fmtDate(until)}` : "Unbefristet"],
    ["Geräte", `Geräte: ${s.devicesUsed ?? "–"} von ${s.deviceLimit ?? "–"}`],
    ["Zuletzt geprüft", s.lastCheckOkAt ? fmtDateTime(s.lastCheckOkAt) : "–"],
    ["Schlüssel", maskLicenseKey(s.licenseKey)],
  ];

  return (
    <section className="rounded-2xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold">Lizenz</h2>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-muted-foreground">{k}</dt>
            <dd className={k === "Schlüssel" ? "font-mono" : "font-medium"}>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" className="h-11" onClick={() => void check()} disabled={lic.busy}>
          {lic.busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Jetzt prüfen
        </Button>
        <Button variant="outline" className="h-11" onClick={() => openExternal(C.ACCOUNT_URL)}>
          Lizenz verwalten
        </Button>
        <Button
          variant="outline"
          className="h-11 text-destructive"
          onClick={() => setConfirm(true)}
          disabled={lic.busy}
        >
          Dieses Gerät abmelden
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Gerät abmelden?"
        description="Die App sperrt sich auf diesem Gerät. Der Platz wird frei, und du kannst die App hier oder auf einem anderen Gerät erneut freischalten."
        confirmLabel="Gerät abmelden"
        destructive
        onConfirm={async () => {
          const r = await deactivate();
          if (!r.ok) toast.error(r.message);
        }}
      />
    </section>
  );
}

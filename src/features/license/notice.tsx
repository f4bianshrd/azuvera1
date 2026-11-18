import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";
import { NATIVE_LICENSE as C } from "@/config/native-license";
import { Button } from "@/components/ui/button";
import { useNative } from "@/lib/use-native";
import { readSessionString, writeSessionString } from "@/lib/platform";
import { useLicense } from "./store";
import { fmtDate, fmtDateTime } from "./labels";
import { ExternalLink } from "./external-link";

const CLOSED_KEY = "azuvera.licenseNoticeClosed";

/** Schmale Hinweisleiste über dem Inhalt (nur native App, schließbar je Sitzung). */
export function LicenseNotice() {
  const native = useNative();
  const lic = useLicense();
  const [closed, setClosed] = useState<string | null>("");
  useEffect(() => setClosed(readSessionString(CLOSED_KEY)), []);
  if (!native || lic.phase !== "active" || lic.warnings.length === 0) return null;
  const sig = lic.warnings.join(",");
  if (closed === sig) return null;
  const until = lic.accessUntil ?? lic.stored?.accessUntil ?? null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 flex items-start gap-3 rounded-xl border border-warning bg-warning/15 px-3 py-2 text-sm"
    >
      <Info className="mt-1 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1 py-0.5">
        {lic.warnings.includes("lease_soon") && (
          <p>
            Die Lizenz muss bald online geprüft werden. Verbinde dich bis{" "}
            {fmtDateTime(lic.leaseExpiresAt)} mit dem Internet.
          </p>
        )}
        {lic.warnings.includes("past_due") && (
          <p>
            Deine letzte Zahlung ist nicht eingegangen. Der Zugriff gilt noch bis{" "}
            {fmtDate(until ?? lic.leaseExpiresAt)}. Prüfe deine Zahlungsart.{" "}
            <ExternalLink href={C.ACCOUNT_URL} className="min-h-0">
              Mein Konto
            </ExternalLink>
          </p>
        )}
        {lic.warnings.includes("ends_soon") && !lic.warnings.includes("past_due") && (
          <p>
            Deine Lizenz läuft am {fmtDate(until)} aus.{" "}
            <ExternalLink href={C.ACCOUNT_URL} className="min-h-0">
              Mein Konto
            </ExternalLink>
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-11 shrink-0"
        aria-label="Hinweis schließen"
        onClick={() => {
          writeSessionString(CLOSED_KEY, sig);
          setClosed(sig);
        }}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

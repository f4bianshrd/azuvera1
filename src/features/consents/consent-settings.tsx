import { useState } from "react";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/dialogs";
import { useMyProfile } from "@/features/app/session";
import { activeConsent, listMyConsents, revokeConsent, type ConsentKind } from "./api";
import { ConsentDialog } from "./consent-dialog";

const DESCRIPTIONS: Record<ConsentKind, { title: string; description: string }> = {
  dictation: { title: "Diktat", description: "Spracheingabe über den Spracherkennungsdienst deines Browsers." },
  ai_text: { title: "KI-Text", description: "Textvorschläge aus deinen Stichpunkten und deinem Ausbildungsberuf." },
};

export function ConsentSettings() {
  const { data: profile } = useMyProfile();
  const online = useOnline();
  const queryClient = useQueryClient();
  const { data: consents } = useQuery({ queryKey: ["consents"], queryFn: listMyConsents });
  const [grantKind, setGrantKind] = useState<ConsentKind | null>(null);
  const [revokeKind, setRevokeKind] = useState<ConsentKind | null>(null);
  const [busy, setBusy] = useState(false);
  const kinds: ConsentKind[] = profile?.role === "azubi" ? ["dictation", "ai_text"] : ["dictation"];

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["consents"] });
  };

  const revoke = async () => {
    if (!revokeKind) return;
    setBusy(true);
    try {
      await revokeConsent(revokeKind);
      await refresh();
      toast.success("Einwilligung widerrufen");
      setRevokeKind(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Widerruf fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        {kinds.map((kind) => {
          const consent = activeConsent(consents, kind);
          const content = DESCRIPTIONS[kind];
          return (
            <div key={kind} className="flex items-start justify-between gap-4 rounded-xl border p-4">
              <div className="space-y-1">
                <Label htmlFor={`consent-${kind}`} className="text-sm font-medium">{content.title}</Label>
                <p className="text-xs text-muted-foreground">{content.description}</p>
                <p className="text-xs text-muted-foreground" role="status">
                  {consent ? `Erteilt am ${format(new Date(consent.granted_at), "d.M.yyyy", { locale: de })}` : "Nicht erteilt"}
                </p>
              </div>
              <Switch
                id={`consent-${kind}`}
                checked={!!consent}
                disabled={busy || !online}
                onCheckedChange={(checked) => checked ? setGrantKind(kind) : setRevokeKind(kind)}
                aria-label={`${content.title} ${consent ? "widerrufen" : "erteilen"}`}
              />
            </div>
          );
        })}
      </div>
      {!online && <p className="mt-2 text-xs text-muted-foreground">{OFFLINE_ACTION_HINT}</p>}
      <ConsentDialog
        kind={grantKind ?? "dictation"}
        open={grantKind !== null}
        onOpenChange={(open) => !open && setGrantKind(null)}
        onGranted={refresh}
      />
      <ConfirmDialog
        open={revokeKind !== null}
        onOpenChange={(open) => !open && setRevokeKind(null)}
        title="Einwilligung widerrufen?"
        description="Die Funktion wird sofort gesperrt. Du kannst die Einwilligung später erneut erteilen."
        confirmLabel="Widerrufen"
        destructive
        onConfirm={() => void revoke()}
      />
    </>
  );
}

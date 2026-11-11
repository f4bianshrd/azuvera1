import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/dialogs";
import { grantConsent, type ConsentKind } from "./api";

export const CONSENT_TEXT: Record<ConsentKind, { title: string; body: string }> = {
  dictation: {
    title: "Diktat aktivieren",
    body: "Beim Diktieren wandelt der Spracherkennungsdienst deines Browsers deine Sprache in Text um. Je nach Browser wird dein Ton dafür an den Hersteller gesendet (Chrome: Google, Safari: Apple). Azuvera speichert keine Tonaufnahmen. Du kannst die Einwilligung jederzeit im Profil widerrufen.",
  },
  ai_text: {
    title: "KI-Text aktivieren",
    body: "Für den KI-Text sendet Azuvera die Stichpunkte, die du eingibst, und deinen Ausbildungsberuf an einen KI-Dienst, der daraus einen Textvorschlag formuliert. Gib keine Namen von Kunden oder anderen Personen ein. Azuvera speichert weder deine Stichpunkte noch den Vorschlag auf dem Server. Die KI kann Fehler machen: Prüfe jeden Vorschlag, bevor du ihn übernimmst – du bist für den Inhalt deines Berichts verantwortlich. Du kannst die Einwilligung jederzeit im Profil widerrufen.",
  },
};

export function ConsentDialog({
  kind,
  open,
  onOpenChange,
  onGranted,
}: {
  kind: ConsentKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGranted: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const content = CONSENT_TEXT[kind];

  const accept = async () => {
    setBusy(true);
    try {
      await grantConsent(kind);
      await onGranted();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Einwilligung konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={content.title} description={content.body}>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Abbrechen</Button>
        <Button onClick={() => void accept()} disabled={busy}>Einverstanden</Button>
      </div>
    </ResponsiveDialog>
  );
}

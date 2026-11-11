import { useEffect, useState } from "react";
import { getNetworkStatus, onNetworkChange } from "@/lib/platform";
import { OFFLINE_ACTION_HINT } from "@/lib/sync/status";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveDialog } from "@/components/dialogs";
import { activeConsent, listMyConsents } from "@/features/consents/api";
import { ConsentDialog } from "@/features/consents/consent-dialog";
import { useMyProfile } from "@/features/app/session";
import { useProfessions } from "@/features/app/queries";
import { getAiEnabled, logAiAssist, useGenerateReportText, type AiField } from "./api";

function placeholderFor(code: string | null | undefined): string {
  switch (code?.toLocaleLowerCase("de-DE")) {
    case "landwirt":
      return "- Weizenbestand kontrolliert\n- Bodenfeuchte und Entwicklungsstadium beurteilt\n- Schlepper und Anbaugerät geprüft";
    case "gaertner":
      return "- Stauden zurückgeschnitten\n- Jungpflanzen pikiert\n- Gewächshaus gelüftet und Temperatur kontrolliert";
    case "pferdewirt":
      return "- Pferde gefüttert und Boxen ausgemistet\n- Fohlen an das Halfter gewöhnt\n- Reitbahn abgezogen";
    default:
      return "- …";
  }
}

export function AiTextButton({
  field,
  reportType,
  weeklyMode,
  reportId,
  currentValue,
  onAccept,
}: {
  field: AiField;
  reportType: "daily" | "weekly";
  weeklyMode: "activities" | "topics";
  reportId?: string | undefined;
  currentValue: string;
  onAccept: (text: string) => void;
}) {
  const { data: profile } = useMyProfile();
  const { data: professions } = useProfessions();
  const queryClient = useQueryClient();
  const { data: aiEnabled } = useQuery({ queryKey: ["ai-enabled"], queryFn: getAiEnabled, staleTime: 30000 });
  const { data: consents } = useQuery({ queryKey: ["consents"], queryFn: listMyConsents });
  const generate = useGenerateReportText();
  const [online, setOnline] = useState(true);
  const [consentOpen, setConsentOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [bullets, setBullets] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const update = () => setOnline(getNetworkStatus().online);
    update();
    return onNetworkChange(update);
  }, []);

  if (profile?.role !== "azubi" || aiEnabled !== true) return null;
  if (!online) return <Button type="button" variant="ghost" size="sm" disabled title={OFFLINE_ACTION_HINT} aria-label={`KI-Text – ${OFFLINE_ACTION_HINT}`}><Sparkles className="size-4" aria-hidden /></Button>;
  const profession = professions?.find((p) => p.id === profile.profession_id);

  const openGenerator = () => {
    if (!activeConsent(consents, "ai_text")) {
      setConsentOpen(true);
      return;
    }
    setSuggestion("");
    setOpen(true);
  };

  const runGeneration = async () => {
    if (!bullets.trim() || busy) return;
    setBusy(true);
    try {
      const result = await generate({ bullets, field, reportType, weeklyMode });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setSuggestion(result.text);
      toast.success("Text generiert");
    } catch {
      toast.error("Die KI konnte den Text nicht erstellen. Bitte versuche es erneut.");
    } finally {
      setBusy(false);
    }
  };

  const accept = () => {
    const text = suggestion.trim();
    if (!text) return;
    const next = currentValue.trim() ? `${currentValue.trimEnd()}\n\n${text}` : text;
    onAccept(next.slice(0, 20000));
    if (reportId) void logAiAssist(reportId, field).catch(() => undefined);
    toast.success("Text übernommen");
    setOpen(false);
    setSuggestion("");
  };

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={openGenerator}>
        <Sparkles className="size-4" aria-hidden /> KI-Text
      </Button>
      <ConsentDialog
        kind="ai_text"
        open={consentOpen}
        onOpenChange={setConsentOpen}
        onGranted={async () => {
          await queryClient.invalidateQueries({ queryKey: ["consents"] });
          setOpen(true);
        }}
      />
      <ResponsiveDialog open={open} onOpenChange={setOpen} title="Text aus Stichpunkten generieren">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`ai-bullets-${field}`}>Stichpunkte</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{bullets.length} / 8000</span>
            </div>
            <Textarea
              id={`ai-bullets-${field}`}
              rows={6}
              maxLength={8000}
              value={bullets}
              onChange={(event) => setBullets(event.target.value)}
              placeholder={placeholderFor(profession?.code)}
              className="text-base"
            />
            <p className="text-xs text-muted-foreground">Gib keine Namen von Kunden oder anderen Personen ein.</p>
          </div>
          <Button className="w-full" onClick={() => void runGeneration()} disabled={!bullets.trim() || busy}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {busy ? "Generiert…" : suggestion ? "Neu generieren" : "Generieren"}
          </Button>

          {suggestion && (
            <div className="space-y-3 border-t pt-4">
              <Label htmlFor={`ai-suggestion-${field}`}>Vorschlag</Label>
              <Textarea
                id={`ai-suggestion-${field}`}
                rows={8}
                maxLength={6000}
                value={suggestion}
                onChange={(event) => setSuggestion(event.target.value)}
                className="text-base"
              />
              <p className="text-xs text-muted-foreground">Das ist ein Vorschlag. Lies ihn durch und ändere ihn ab – nur was wirklich so war, gehört in deinen Bericht.</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button onClick={accept} disabled={!suggestion.trim()}>Übernehmen</Button>
                <Button variant="outline" onClick={() => void runGeneration()} disabled={busy}>Neu generieren</Button>
                <Button variant="ghost" onClick={() => setSuggestion("")}>Verwerfen</Button>
              </div>
            </div>
          )}
        </div>
      </ResponsiveDialog>
    </>
  );
}

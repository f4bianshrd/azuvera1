import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EmptyState, PageHeader } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { fetchPrivacyTexts, savePrivacyTexts } from "@/features/public/api";
import { PROVIDER_TEXT_MAX, validProviderText } from "@/lib/legal";
import { NotificationStatusBlock } from "@/features/notifications/notification-status-block";
import { ReminderRulesBlock } from "@/features/reminders/reminder-rules-block";
import { getAdminAiSettings, saveAdminAiSettings } from "@/features/ai/api";

const TITLE = "Einstellungen – Azuvera";

export const Route = createFileRoute("/_authenticated/admin_/einstellungen")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: "Azuvera-Einstellungen für die Ausbildungsleitung." },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: "Speicherort, KI-Text und Vertretungen verwalten." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EinstellungenPage,
});

function EinstellungenPage() {
  const { data: me } = useMyProfile();
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [aiProvider, setAiProvider] = useState("");
  const [emailProvider, setEmailProvider] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [dailyLimit, setDailyLimit] = useState("500");
  const [busy, setBusy] = useState(false);
  const isLeitung = !!me?.is_team;

  const { data: setting } = useQuery({
    queryKey: ["app-settings", "privacy-texts"],
    enabled: isLeitung,
    queryFn: fetchPrivacyTexts,
  });
  const { data: aiSettings } = useQuery({
    queryKey: ["app-settings", "ai"],
    enabled: isLeitung,
    queryFn: getAdminAiSettings,
  });

  useEffect(() => {
    if (!setting) return;
    setValue(setting.hostingLocation);
    setAiProvider(setting.aiProvider);
    setEmailProvider(setting.emailProvider);
  }, [setting]);
  useEffect(() => {
    if (!aiSettings) return;
    setAiEnabled(aiSettings.enabled);
    setDailyLimit(String(aiSettings.dailyLimit));
  }, [aiSettings]);

  if (me && !isLeitung) {
    return <EmptyState icon={ShieldAlert} title="Kein Zugriff" description="Die Einstellungen stehen nur der Ausbildungsleitung zur Verfügung." />;
  }

  const save = async () => {
    if (!value.trim()) { toast.error("Bitte einen Speicherort eintragen."); return; }
    if (!validProviderText(aiProvider) || !validProviderText(emailProvider)) {
      toast.error("KI-Anbieter und E-Mail-Dienstleister müssen 3 bis 200 Zeichen lang sein.");
      return;
    }
    setBusy(true);
    try { await savePrivacyTexts({ hostingLocation: value, aiProvider, emailProvider }, me?.id ?? null); }
    catch { toast.error("Einstellung konnte nicht gespeichert werden."); setBusy(false); return; }
    setBusy(false);
    await queryClient.invalidateQueries({ queryKey: ["app-settings"] });
    toast.success("Gespeichert");
  };

  const saveAi = async () => {
    const limit = Number(dailyLimit);
    if (!Number.isInteger(limit) || limit < 10 || limit > 10000) {
      toast.error("Das Tageslimit muss zwischen 10 und 10.000 liegen.");
      return;
    }
    setBusy(true);
    try {
      await saveAdminAiSettings({ enabled: aiEnabled, dailyLimit: limit });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["ai-enabled"] }),
      ]);
      toast.success("KI-Einstellungen gespeichert");
    } catch {
      toast.error("KI-Einstellungen konnten nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Einstellungen" subtitle="Speicherort und KI-Text zentral verwalten." />
      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="space-y-1.5">
          <Label htmlFor="hosting-location">Speicherort in der Datenschutzerklärung</Label>
          <Input id="hosting-location" value={value} onChange={(e) => setValue(e.target.value)} placeholder="in Frankfurt am Main (Deutschland)" className="h-11 max-w-lg text-base" />
          <p className="text-xs text-muted-foreground">Wird in Abschnitt 4 der Datenschutzerklärung angezeigt, z. B. „in Frankfurt am Main (Deutschland)“.</p>
        </div>
        <div className="mt-6 space-y-4 border-t pt-5">
          <div>
            <h2 className="text-base font-semibold">Anbieter in der Datenschutzerklärung</h2>
            <p className="mt-1 text-xs text-muted-foreground">Trage hier die tatsächlich genutzten Anbieter ein. Der Text erscheint wörtlich in der Datenschutzerklärung und muss grammatisch in den Satz passen, zum Beispiel ‚einen KI-Modellanbieter (über das KI-Gateway von Lovable)‘.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-provider">KI-Anbieter</Label>
            <Input id="ai-provider" required minLength={3} maxLength={PROVIDER_TEXT_MAX} value={aiProvider} onChange={(e) => setAiProvider(e.target.value)} aria-invalid={!validProviderText(aiProvider)} className="h-11 max-w-lg text-base" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email-provider">E-Mail-Dienstleister</Label>
            <Input id="email-provider" required minLength={3} maxLength={PROVIDER_TEXT_MAX} value={emailProvider} onChange={(e) => setEmailProvider(e.target.value)} aria-invalid={!validProviderText(emailProvider)} className="h-11 max-w-lg text-base" />
          </div>
        </div>
        <Button className="mt-4 h-11" onClick={() => void save()} disabled={busy}>Speichern</Button>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">KI-Text</h2>
        <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border p-4">
          <Label htmlFor="ai-enabled" className="font-normal">KI-Text für Azubis anbieten</Label>
          <Switch id="ai-enabled" checked={aiEnabled} onCheckedChange={setAiEnabled} />
        </div>
        <div className="mt-4 space-y-1.5">
          <Label htmlFor="ai-daily-limit">Tageslimit für alle Azubis zusammen</Label>
          <Input id="ai-daily-limit" type="number" min={10} max={10000} step={1} value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} className="h-11 max-w-xs text-base" />
          <p className="text-xs text-muted-foreground">Die Nutzung kann Kosten beim KI-Dienst verursachen. Das Limit begrenzt sie.</p>
        </div>
        <Button className="mt-4 h-11" onClick={() => void saveAi()} disabled={busy}>KI-Einstellungen speichern</Button>
      </section>
      <ReminderRulesBlock />
      <NotificationStatusBlock />
    </div>
  );
}

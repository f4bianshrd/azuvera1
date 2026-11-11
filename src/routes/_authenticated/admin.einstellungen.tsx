import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EmptyState, PageHeader } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { deputySelfService, saveDeputySetting } from "@/features/deputies/api";
import { getAdminAiSettings, saveAdminAiSettings } from "@/features/ai/api";

const TITLE = "Einstellungen – Azuvera";

export const Route = createFileRoute("/_authenticated/admin/einstellungen")({
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
  const [aiEnabled, setAiEnabled] = useState(true);
  const [dailyLimit, setDailyLimit] = useState("500");
  const [busy, setBusy] = useState(false);
  const { data: deputySetting = false } = useQuery({ queryKey: ["deputies", "setting"], queryFn: deputySelfService, enabled: me?.role === "ausbildungsleitung" });
  const isLeitung = me?.role === "ausbildungsleitung";

  const { data: setting } = useQuery({
    queryKey: ["app-settings", "hosting_location_text"],
    enabled: isLeitung,
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "hosting_location_text").maybeSingle();
      return typeof data?.value === "string" ? data.value : "";
    },
  });
  const { data: aiSettings } = useQuery({
    queryKey: ["app-settings", "ai"],
    enabled: isLeitung,
    queryFn: getAdminAiSettings,
  });

  useEffect(() => {
    if (setting !== undefined) setValue(setting);
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
    setBusy(true);
    const { error } = await supabase.from("app_settings").upsert({ key: "hosting_location_text", value, is_public: true, updated_by: me?.id ?? null });
    setBusy(false);
    if (error) {
      toast.error("Einstellung konnte nicht gespeichert werden.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["app-settings"] });
    toast.success("Einstellung gespeichert");
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
        <Button className="mt-4 h-11" onClick={() => void save()} disabled={busy}>Speichern</Button>
      </section>

      <section className="border-t py-5"><h2 className="text-lg font-semibold">Vertretung</h2><div className="mt-4 flex items-center justify-between gap-4"><Label htmlFor="deputy-self">Ausbilder:innen dürfen Vertretungen selbst eintragen</Label><Switch id="deputy-self" checked={deputySetting} onCheckedChange={value => { void saveDeputySetting(value).then(() => queryClient.invalidateQueries({ queryKey: ["deputies"] })).then(() => toast.success("Einstellung gespeichert")).catch(() => toast.error("Einstellung konnte nicht gespeichert werden.")); }} /></div></section>
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
    </div>
  );
}

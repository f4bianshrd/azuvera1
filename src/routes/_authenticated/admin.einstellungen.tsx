import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, PageHeader } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";

const TITLE = "Einstellungen – Azuvera";

export const Route = createFileRoute("/_authenticated/admin/einstellungen")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: "Azuvera-Einstellungen für die Ausbildungsleitung." },
      { property: "og:title", content: TITLE },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EinstellungenPage,
});

function EinstellungenPage() {
  const { data: me } = useMyProfile();
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: setting } = useQuery({
    queryKey: ["app-settings", "hosting_location_text"],
    enabled: me?.role === "ausbildungsleitung",
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "hosting_location_text")
        .maybeSingle();
      return typeof data?.value === "string" ? data.value : "";
    },
  });

  useEffect(() => {
    if (setting !== undefined) setValue(setting);
  }, [setting]);

  if (me && me.role !== "ausbildungsleitung") {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Kein Zugriff"
        description="Die Einstellungen stehen nur der Ausbildungsleitung zur Verfügung."
      />
    );
  }

  const save = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "hosting_location_text", value, is_public: true, updated_by: me?.id ?? null });
    setBusy(false);
    if (error) {
      toast.error("Einstellung konnte nicht gespeichert werden.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["app-settings"] });
    toast.success("Einstellung gespeichert");
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Einstellungen" subtitle="Weitere Einstellungen ergänzen spätere Bausteine." />
      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="space-y-1.5">
          <Label htmlFor="hosting-location">Speicherort in der Datenschutzerklärung</Label>
          <Input
            id="hosting-location"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="in Frankfurt am Main (Deutschland)"
            className="h-11 max-w-lg text-base"
          />
          <p className="text-xs text-muted-foreground">
            Wird in Abschnitt 4 der Datenschutzerklärung angezeigt, z. B. „in Frankfurt am Main (Deutschland)“.
          </p>
        </div>
        <Button className="mt-4 h-11" onClick={() => void save()} disabled={busy}>
          Speichern
        </Button>
      </section>
    </div>
  );
}

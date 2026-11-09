import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/dialogs";
import { PageHeader } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { useProfessions } from "@/features/app/queries";
import { defaultPeriodForYear } from "@/lib/training-year";
import { format } from "date-fns";

const TITLE = "Dashboard – Azuvera";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: "Dein Azuvera-Dashboard." },
      { property: "og:title", content: TITLE },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Hallo";
  return "Guten Abend";
}

const ONBOARDING_KEY = "azuvera-onboarding-done";

function Dashboard() {
  const { data: profile } = useMyProfile();
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  useEffect(() => {
    if (!profile || profile.role !== "azubi") return;
    let done = false;
    try {
      done = window.localStorage.getItem(ONBOARDING_KEY) === "1";
    } catch {
      /* Speicher nicht verfügbar */
    }
    if (!done && !profile.profession_id) setOnboardingOpen(true);
  }, [profile]);

  return (
    <div>
      <PageHeader
        title={`${greeting()}${profile?.vorname ? `, ${profile.vorname}` : ""}`}
        subtitle="Schön, dass du da bist. Dein Dashboard wird mit dem nächsten Baustein gefüllt."
      />
      {profile && (
        <OnboardingDialog
          open={onboardingOpen}
          onOpenChange={setOnboardingOpen}
          onDone={() => {
            try {
              window.localStorage.setItem(ONBOARDING_KEY, "1");
            } catch {
              /* ignorieren */
            }
            setOnboardingOpen(false);
          }}
        />
      )}
    </div>
  );
}

function OnboardingDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [professionId, setProfessionId] = useState("");
  const [year, setYear] = useState("1");
  const [busy, setBusy] = useState(false);

  const { data: professions } = useQueryProfessions();

  const finish = async () => {
    setBusy(true);
    try {
      if (professionId) {
        const { error } = await supabase.rpc("set_my_profession", { _profession_id: professionId });
        if (error) throw error;
      }
      const { start, end } = defaultPeriodForYear(Number(year));
      const { error } = await supabase
        .from("profiles")
        .update({
          ausbildungsbeginn: format(start, "yyyy-MM-dd"),
          ausbildungsende: format(end, "yyyy-MM-dd"),
        })
        .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "");
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      toast.success("Profil gespeichert");
      onDone();
    } catch {
      toast.error("Speichern fehlgeschlagen. Du kannst die Angaben später im Profil nachholen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Erste Schritte"
      description={`Schritt ${step + 1} von 3 – du kannst das auch später im Profil nachholen.`}
    >
      {step === 0 && (
        <div className="space-y-3">
          <Label>Beruf wählen</Label>
          <Select value={professionId} onValueChange={setProfessionId}>
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Ausbildungsberuf auswählen" />
            </SelectTrigger>
            <SelectContent>
              {(professions ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(professions ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground">
              Noch keine Berufe angelegt – die Ausbildungsleitung pflegt sie unter „Berufe“.
            </p>
          )}
        </div>
      )}
      {step === 1 && (
        <div className="space-y-3">
          <Label>Aktuelles Ausbildungsjahr</Label>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}. Lehrjahr
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Daraus werden Ausbildungsbeginn und -ende berechnet (Standard 1.8. bis 31.7., 3 Jahre).
          </p>
        </div>
      )}
      {step === 2 && (
        <p className="text-sm text-muted-foreground">
          Betrieb und zuständige:r Ausbilder:in werden von der Ausbildungsleitung zugewiesen.
        </p>
      )}
      <div className="mt-5 flex justify-between gap-2">
        <Button variant="ghost" onClick={onDone}>
          Überspringen
        </Button>
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
              Zurück
            </Button>
          )}
          {step < 2 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={step === 0 && !professionId && (professions ?? []).length > 0}>
              Weiter
            </Button>
          ) : (
            <Button onClick={() => void finish()} disabled={busy}>
              Fertig
            </Button>
          )}
        </div>
      </div>
    </ResponsiveDialog>
  );
}

export function useQueryProfessions() {
  const { useQuery } = require("@tanstack/react-query") as typeof import("@tanstack/react-query");
  return useQuery({
    queryKey: ["professions"],
    queryFn: async () => {
      const { data } = await supabase.from("professions").select("id, name").order("name");
      return data ?? [];
    },
  });
}

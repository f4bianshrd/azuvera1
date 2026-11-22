import { BundeslandField } from "@/features/experience/components/bundesland-field";
import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared";
import { ThemeToggle } from "@/components/theme-toggle";
import { ROLE_LABELS, useMyProfile, type MyProfile } from "@/features/app/session";
import { useCompanies, useProfessions } from "@/features/app/queries";
import { currentTrainingYear, defaultPeriodForYear } from "@/lib/training-year";
import { listCompanyChoices, setMyTraining } from "@/features/profile/api";
import { NotificationSettingsCard } from "@/features/notifications/notification-settings";
import { ConsentSettings } from "@/features/consents/consent-settings";
import { SavedSignatureCard } from "@/features/review/saved-signature-card";
import { format } from "date-fns";
import { AppOfflineCard } from "@/features/sync/app-offline-card";
import { useSignOut } from "@/features/sync/sign-out";
import { MyDataCard } from "@/features/account/my-data-card";
import { LoginMethodsCard } from "@/features/account/login-methods-card";
import { LicenseCard } from "@/features/license/license-card";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";

const TITLE = "Mein Profil – Azuvera";

export const Route = createFileRoute("/_authenticated/profil")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: "Dein Azuvera-Profil: persönliche Daten, Ausbildung und Sicherheit." },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: "Dein Azuvera-Profil: persönliche Daten, Ausbildung und Sicherheit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilPage,
});

function Card({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="h-11 text-base"
      />
    </div>
  );
}

interface ProfileForm {
  vorname: string;
  nachname: string;
  geburtsdatum: string;
  telefon: string;
  personalnummer: string;
  strasse: string;
  plz: string;
  ort: string;
  land: string;
  notfallkontakt_name: string;
  notfallkontakt_telefon: string;
  ausbildungsbeginn: string;
  ausbildungsende: string;
}

const emptyProfileForm: ProfileForm = {
  vorname: "",
  nachname: "",
  geburtsdatum: "",
  telefon: "",
  personalnummer: "",
  strasse: "",
  plz: "",
  ort: "",
  land: "Deutschland",
  notfallkontakt_name: "",
  notfallkontakt_telefon: "",
  ausbildungsbeginn: "",
  ausbildungsende: "",
};

function ProfilPage() {
  const { data: profile, isLoading } = useMyProfile();
  const online = useOnline();
  const globalSignOut = useSignOut(true);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: companies } = useCompanies();
  const { data: professions } = useProfessions();

  const [form, setForm] = useState<ProfileForm>(emptyProfileForm);
  const [organization, setOrganization] = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);
  const isAzubi = profile?.role === "azubi";
  const { data: companyChoices } = useQuery({ queryKey: ["company-choices"], queryFn: listCompanyChoices, enabled: isAzubi && online });
  const [training, setTraining] = useState<{ professionId: string; companyId: string; newName: string; newAddress: string }>({ professionId: "", companyId: "", newName: "", newAddress: "" });
  const [year, setYear] = useState("");

  useEffect(() => {
    if (!profile) return;
    setForm({
      vorname: profile.vorname ?? "",
      nachname: profile.nachname ?? "",
      geburtsdatum: profile.geburtsdatum ?? "",
      telefon: profile.telefon ?? "",
      personalnummer: profile.personalnummer ?? "",
      strasse: profile.strasse ?? "",
      plz: profile.plz ?? "",
      ort: profile.ort ?? "",
      land: profile.land ?? "Deutschland",
      notfallkontakt_name: profile.notfallkontakt_name ?? "",
      notfallkontakt_telefon: profile.notfallkontakt_telefon ?? "",
      ausbildungsbeginn: profile.ausbildungsbeginn ?? "",
      ausbildungsende: profile.ausbildungsende ?? "",
    });
    setOrganization(profile.organization ?? "");
    setTraining({ professionId: profile.profession_id ?? "", companyId: profile.company_id ?? "", newName: "", newAddress: "" });
    setYear(profile.ausbildungsbeginn ? String(currentTrainingYear(new Date(`${profile.ausbildungsbeginn}T00:00:00`), profile.ausbildungsende ? new Date(`${profile.ausbildungsende}T00:00:00`) : undefined)) : "");
  }, [profile]);

  if (isLoading || !profile) {
    return (
      <div className="space-y-4">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  const set = (key: keyof ProfileForm) => (v: string) => setForm((f) => ({ ...f, [key]: v }));
  const company = companies?.find((c) => c.id === profile.company_id);
  const profession = professions?.find((p) => p.id === profile.profession_id);

  const save = async () => {
    if (isAzubi && training.companyId === "__new" && training.newName.trim().length < 2) {
      toast.error("Bitte den Namen deines Ausbildungsbetriebs eintragen.");
      return;
    }
    setBusy(true);
    if (isAzubi && (training.professionId !== (profile.profession_id ?? "") || training.companyId !== (profile.company_id ?? ""))) {
      try {
        await setMyTraining({
          professionId: training.professionId || null,
          companyId: training.companyId && training.companyId !== "__new" ? training.companyId : null,
          ...(training.companyId === "__new" ? { newCompanyName: training.newName, newCompanyAddress: training.newAddress } : {}),
        });
        await queryClient.invalidateQueries({ queryKey: ["company-choices"] });
        await queryClient.invalidateQueries({ queryKey: ["plan"] });
      } catch (e) {
        setBusy(false);
        toast.error(e instanceof Error ? e.message : "Beruf und Betrieb konnten nicht gespeichert werden.");
        return;
      }
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        vorname: form.vorname,
        nachname: form.nachname,
        geburtsdatum: form.geburtsdatum || null,
        telefon: form.telefon || null,
        personalnummer: form.personalnummer || null,
        strasse: form.strasse || null,
        plz: form.plz || null,
        ort: form.ort || null,
        land: form.land || "Deutschland",
        notfallkontakt_name: form.notfallkontakt_name || null,
        notfallkontakt_telefon: form.notfallkontakt_telefon || null,
        ausbildungsbeginn: form.ausbildungsbeginn || null,
        ausbildungsende: form.ausbildungsende || null,
      })
      .eq("id", profile.id);
    setBusy(false);
    if (error) {
      toast.error("Profil konnte nicht gespeichert werden.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    toast.success("Profil gespeichert");
  };

  const saveOrganization = async () => {
    const org = organization.trim();
    if (org.length < 2 || org.length > 120) {
      toast.error("Die Organisation muss 2 bis 120 Zeichen lang sein.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ organization: org }).eq("id", profile.id);
    setBusy(false);
    if (error) {
      toast.error("Organisation konnte nicht gespeichert werden.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    toast.success("Organisation gespeichert");
  };

  const changePassword = async () => {
    if (newPw.length < 10) {
      toast.error("Das neue Passwort muss mindestens 10 Zeichen lang sein.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPw, current_password: currentPw });
    setBusy(false);
    if (error) {
      toast.error("Passwort konnte nicht geändert werden. Prüfe dein aktuelles Passwort.");
      return;
    }
    setCurrentPw("");
    setNewPw("");
    toast.success("Passwort geändert");
  };

  const applyYear = (year: string) => {
    setYear(year);
    const { start, end } = defaultPeriodForYear(Number(year));
    setForm((f) => ({
      ...f,
      ausbildungsbeginn: format(start, "yyyy-MM-dd"),
      ausbildungsende: format(end, "yyyy-MM-dd"),
    }));
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Mein Profil" subtitle={profile.email} />

      <Card title="Rolle">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary">{ROLE_LABELS[profile.role]}</Badge>
          {profile.role === "azubi" && (
            <p className="text-xs text-muted-foreground">Die Azubi-Rolle ist endgültig.</p>
          )}
        </div>
        {profile.role !== "azubi" && (
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="organization">Organisation</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input id="organization" value={organization} onChange={(e) => setOrganization(e.target.value)} minLength={2} maxLength={120} className="h-11 text-base sm:max-w-sm" />
                <Button variant="outline" className="h-11" disabled={busy || !online || organization.trim() === (profile.organization ?? "")} onClick={() => void saveOrganization()}>Speichern</Button>
              </div>
            </div>
            <Link to="/zugriff" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">Zugriff & Einladungen</Link>
          </div>
        )}
      </Card>

      <Card title="Persönliche Daten">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="vorname" label="Vorname" value={form.vorname ?? ""} onChange={set("vorname")} autoComplete="given-name" />
          <Field id="nachname" label="Nachname" value={form.nachname ?? ""} onChange={set("nachname")} autoComplete="family-name" />
          <Field id="geburtsdatum" label="Geburtsdatum" type="date" value={form.geburtsdatum ?? ""} onChange={set("geburtsdatum")} />
          <Field id="telefon" label="Telefon" type="tel" value={form.telefon ?? ""} onChange={set("telefon")} autoComplete="tel" />
          <Field id="personalnummer" label="Personalnummer" value={form.personalnummer ?? ""} onChange={set("personalnummer")} />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Geburtsdatum und Telefon sind freiwillig. Sie helfen dem Support, dich zu erkennen, wenn du anrufst oder schreibst. <Link to="/hilfe" className="font-medium text-primary underline-offset-4 hover:underline">Hilfe & Support</Link></p>
      </Card>

      <Card title="Anschrift">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="strasse" label="Straße" value={form.strasse ?? ""} onChange={set("strasse")} autoComplete="street-address" />
          <Field id="plz" label="PLZ" value={form.plz ?? ""} onChange={set("plz")} autoComplete="postal-code" />
          <Field id="ort" label="Ort" value={form.ort ?? ""} onChange={set("ort")} autoComplete="address-level2" />
          <Field id="land" label="Land" value={form.land ?? ""} onChange={set("land")} autoComplete="country-name" />
        </div>
      </Card>

      <Card title="Notfallkontakt">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="nk-name" label="Name" value={form.notfallkontakt_name ?? ""} onChange={set("notfallkontakt_name")} />
          <Field id="nk-tel" label="Telefon" type="tel" value={form.notfallkontakt_telefon ?? ""} onChange={set("notfallkontakt_telefon")} />
        </div>
      </Card>

      <Card title="Ausbildung">
        <div className="grid gap-4 sm:grid-cols-2">
          {isAzubi ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="beruf">Ausbildungsberuf</Label>
                <Select value={training.professionId} onValueChange={(v) => setTraining((t) => ({ ...t, professionId: v }))} disabled={!online}>
                  <SelectTrigger id="beruf" className="h-11"><SelectValue placeholder="Beruf wählen" /></SelectTrigger>
                  <SelectContent>
                    {(professions ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="betrieb">Ausbildungsbetrieb</Label>
                <Select value={training.companyId} onValueChange={(v) => setTraining((t) => ({ ...t, companyId: v }))} disabled={!online}>
                  <SelectTrigger id="betrieb" className="h-11"><SelectValue placeholder={company?.name ?? "Betrieb wählen"} /></SelectTrigger>
                  <SelectContent>
                    {(companyChoices ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    <SelectItem value="__new">Mein Betrieb fehlt – neu eintragen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {training.companyId === "__new" && (
                <>
                  <Field id="betrieb-name" label="Name des Betriebs" value={training.newName} onChange={(v) => setTraining((t) => ({ ...t, newName: v }))} />
                  <Field id="betrieb-adresse" label="Anschrift des Betriebs" value={training.newAddress} onChange={(v) => setTraining((t) => ({ ...t, newAddress: v }))} />
                </>
              )}
              {!online && <p className="text-xs text-muted-foreground sm:col-span-2">{OFFLINE_ACTION_HINT}</p>}
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Betrieb</Label>
                <p className="flex h-11 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                  {company?.name ?? "Wird von der Ausbildungsleitung zugewiesen"}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Beruf</Label>
                <p className="flex h-11 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                  {profession?.name ?? "Wird von der Ausbildungsleitung zugewiesen"}
                </p>
              </div>
            </>
          )}
          {isAzubi && <BundeslandField azubiId={profile.id} />}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Aktuelles Ausbildungsjahr</Label>
            <Select value={year} onValueChange={applyYear}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Lehrjahr wählen" />
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
          <Field id="ausbildungsbeginn" label="Ausbildungsbeginn" type="date" value={form.ausbildungsbeginn ?? ""} onChange={set("ausbildungsbeginn")} />
          <Field id="ausbildungsende" label="Ausbildungsende" type="date" value={form.ausbildungsende ?? ""} onChange={set("ausbildungsende")} />
        </div>
      </Card>

      <NotificationSettingsCard email={profile.email} role={profile.role} />

      <SavedSignatureCard />

      <Card title="Datenschutz-Einwilligungen">
        <ConsentSettings />
      </Card>

      <MyDataCard profile={profile} />

      <LoginMethodsCard userId={profile.id} profileEmail={profile.email} />

      <Card title="Sicherheit">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="current-pw" label="Aktuelles Passwort" type="password" value={currentPw} onChange={setCurrentPw} autoComplete="current-password" />
          <Field id="new-pw" label="Neues Passwort (mind. 10 Zeichen)" type="password" value={newPw} onChange={setNewPw} autoComplete="new-password" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" className="h-11" onClick={() => void changePassword()} disabled={busy || !currentPw || !newPw}>
            Passwort ändern
          </Button>
          <Button
            variant="outline"
            className="h-11"
            disabled={!online}
            onClick={globalSignOut.request}
          >
            Auf allen Geräten abmelden
          </Button>
        </div>
      </Card>

      <AppOfflineCard />

      <LicenseCard />
      {globalSignOut.dialog}

      <Card title="Darstellung">
        <ThemeToggle />
      </Card>

      <div className="sticky bottom-20 z-10 md:bottom-4">
        <div className="flex justify-end rounded-2xl border bg-card/95 p-3 shadow-elegant backdrop-blur">
          {!online && <p className="mr-auto self-center text-sm text-muted-foreground">{OFFLINE_ACTION_HINT}</p>}
          <Button className="h-11 px-8" onClick={() => void save()} disabled={busy || !online}>
            Speichern
          </Button>
        </div>
      </div>
    </div>
  );
}

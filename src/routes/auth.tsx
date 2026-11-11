import { useCallback, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, FileSignature, Info, KeyRound, ShieldCheck, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveDialog } from "@/components/dialogs";
import { Logo } from "@/components/shared";
import { cn } from "@/lib/utils";
import { SocialButtons } from "@/features/auth/social-buttons";

const TITLE = "Anmelden – Azuvera";
const DESC = "Bei Azuvera anmelden oder ein Konto erstellen – das digitale Berichtsheft für die Ausbildung.";

interface AuthSearch {
  mode?: string | undefined;
  redirect?: string | undefined;
}

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    mode: typeof search["mode"] === "string" ? search["mode"] : undefined,
    redirect: typeof search["redirect"] === "string" ? search["redirect"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const brandPoints = [
  { icon: FileSignature, text: "Strukturierte Tages- & Wochenberichte" },
  { icon: Users, text: "Rollen & Einladungs-Codes für Teams" },
  { icon: ShieldCheck, text: "Datenschutzkonform & prüfungssicher" },
  { icon: Sparkles, text: "KI-Hilfe beim Formulieren" },
];

function passwordStrength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 10) score++;
  if (pw.length >= 14) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 2) return { score, label: "Schwach" };
  if (score <= 3) return { score, label: "Mittel" };
  return { score, label: "Stark" };
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="h-11 pr-11 text-base"
        required
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Passwort verbergen" : "Passwort anzeigen"}
        className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function AuthPage() {
  const { mode, redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [tab, setTab] = useState(mode === "signup" ? "signup" : "login");
  const [signedUpEmail, setSignedUpEmail] = useState<string | null>(null);

  const target = redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/dashboard";

  if (signedUpEmail) {
    return (
      <AuthFrame>
        <div className="rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold">Fast geschafft</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Wir haben dir eine E-Mail an <span className="font-medium text-foreground">{signedUpEmail}</span> gesendet.
            Öffne den Bestätigungslink darin, um dein Konto zu aktivieren.
          </p>
          <Button
            variant="outline"
            className="mt-5 h-11"
            onClick={async () => {
              const { error } = await supabase.auth.resend({
                type: "signup",
                email: signedUpEmail,
                options: { emailRedirectTo: window.location.origin },
              });
              if (error) toast.error("E-Mail konnte nicht erneut gesendet werden.");
              else toast.success("E-Mail erneut gesendet.");
            }}
          >
            E-Mail erneut senden
          </Button>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-semibold">Willkommen</h2>
        <p className="mt-1 text-sm text-muted-foreground">Melde dich an oder erstelle ein neues Konto.</p>
        <Tabs value={tab} onValueChange={setTab} className="mt-5">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login" className="min-h-11">Anmelden</TabsTrigger>
            <TabsTrigger value="signup" className="min-h-11">Registrieren</TabsTrigger>
          </TabsList>
          <TabsContent value="login" className="mt-5">
            <LoginForm onSuccess={() => void navigate({ to: target })} />
          </TabsContent>
          <TabsContent value="signup" className="mt-5">
            <SignupForm onSignedUp={setSignedUpEmail} />
          </TabsContent>
        </Tabs>
      </div>
    </AuthFrame>
  );
}

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Markenfläche ab Tablet quer */}
      <div className="relative hidden w-1/2 overflow-hidden bg-gradient-primary lg:flex lg:flex-col lg:justify-center lg:px-12 xl:px-20">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-brand-teal/30 blur-3xl" />
        <div className="relative">
          <Logo size={40} />
          <h1 className="mt-8 text-4xl font-bold tracking-tight text-primary-foreground xl:text-5xl">
            Dein digitales Berichtsheft –
            <span className="block">modern, sicher, gemeinsam.</span>
          </h1>
          <p className="mt-4 max-w-md text-lg text-primary-foreground/85">
            Berichte schreiben, einreichen, freigeben – alles an einem Ort. Für Azubis, Ausbilder:innen, Betriebe
            und Berufsschulen.
          </p>
          <ul className="mt-8 space-y-3">
            {brandPoints.map((p) => (
              <li key={p.text} className="flex items-center gap-3 text-primary-foreground/90">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-foreground/15">
                  <p.icon className="size-4" aria-hidden />
                </span>
                <span className="text-sm font-medium">{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {/* Karte */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="mb-6 lg:hidden">
          <Logo size={36} />
        </div>
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const { redirect } = Route.useSearch();
  const target = redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/dashboard";
  const handleSuccess = useCallback(onSuccess, [onSuccess]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error("Anmeldung fehlgeschlagen. Bitte prüfe E-Mail und Passwort.");
      return;
    }
    toast.success("Willkommen zurück");
    onSuccess();
  };

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetOpen(false);
    toast.success("Wenn ein Konto existiert, wurde eine E-Mail versendet.");
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="login-email">E-Mail</Label>
        <Input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="h-11 text-base"
          required
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="login-password">Passwort</Label>
          <button
            type="button"
            onClick={() => {
              setResetEmail(email);
              setResetOpen(true);
            }}
            className="text-xs font-medium text-primary hover:underline"
          >
            Passwort vergessen?
          </button>
        </div>
        <PasswordInput id="login-password" value={password} onChange={setPassword} autoComplete="current-password" />
      </div>
      <Button type="submit" className="h-11 w-full" disabled={busy}>
        Anmelden
      </Button>
      <SocialButtons target={target} onSuccess={handleSuccess} />

      <ResponsiveDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Passwort zurücksetzen"
        description="Wir senden dir einen Link, mit dem du ein neues Passwort setzen kannst."
      >
        <form onSubmit={sendReset} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reset-email">E-Mail</Label>
            <Input
              id="reset-email"
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              autoComplete="email"
              className="h-11 text-base"
              required
            />
          </div>
          <Button type="submit" className="h-11 w-full">
            Link senden
          </Button>
        </form>
      </ResponsiveDialog>
    </form>
  );
}

function SignupForm({ onSignedUp }: { onSignedUp: (email: string) => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [kind, setKind] = useState<"azubi" | "team">("azubi");
  const [code, setCode] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);

  const strength = passwordStrength(password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 10) {
      toast.error("Das Passwort muss mindestens 10 Zeichen lang sein.");
      return;
    }
    if (!privacy) {
      toast.error("Bitte bestätige, dass du die Datenschutzerklärung gelesen hast.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          ...(kind === "team" && code.trim() ? { invite_code: code.trim().toUpperCase() } : {}),
        },
        emailRedirectTo: window.location.origin,
      },
    });
    setBusy(false);
    if (error) {
      if (error.message.includes("Einladungs-Code")) {
        toast.error(
          "Der Einladungs-Code ist ungültig, abgelaufen oder bereits eingelöst. Bitte prüfe ihn oder frage die Ausbildungsleitung.",
        );
      } else if (error.message.toLowerCase().includes("password")) {
        toast.error("Das Passwort ist zu schwach oder wurde bereits geleakt. Bitte wähle ein anderes.");
      } else {
        toast.error("Registrierung fehlgeschlagen. Bitte prüfe deine Eingaben.");
      }
      return;
    }
    onSignedUp(email);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="signup-name">Vollständiger Name</Label>
        <Input
          id="signup-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          className="h-11 text-base"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="signup-email">E-Mail</Label>
        <Input
          id="signup-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="h-11 text-base"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="signup-password">Passwort</Label>
        <PasswordInput id="signup-password" value={password} onChange={setPassword} autoComplete="new-password" />
        {password.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full transition-all",
                  strength.score <= 2 ? "bg-destructive" : strength.score <= 3 ? "bg-warning" : "bg-success",
                )}
                style={{ width: `${(strength.score / 5) * 100}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{strength.label}</span>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Mindestens 10 Zeichen.</p>
      </div>

      <div className="space-y-2">
        <Label>Ich bin…</Label>
        <RadioGroup value={kind} onValueChange={(v) => setKind(v as "azubi" | "team")} className="space-y-2">
          <label
            htmlFor="kind-azubi"
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-3",
              kind === "azubi" && "border-primary bg-primary/5",
            )}
          >
            <RadioGroupItem id="kind-azubi" value="azubi" className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Auszubildende:r</span>
              <span className="block text-xs text-muted-foreground">
                Diese Wahl ist endgültig und kann später nicht geändert werden.
              </span>
            </span>
          </label>
          <label
            htmlFor="kind-team"
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-3",
              kind === "team" && "border-primary bg-primary/5",
            )}
          >
            <RadioGroupItem id="kind-team" value="team" className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Ausbilder, Betriebsleiter, Berater oder Lehrer:in</span>
              <span className="block text-xs text-muted-foreground">
                Einladungs-Code von der Ausbildungsleitung erforderlich.
              </span>
            </span>
          </label>
        </RadioGroup>
        {kind === "team" && (
          <div className="space-y-1.5">
            <Label htmlFor="signup-code">Einladungs-Code</Label>
            <Input
              id="signup-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="z. B. A1B2C3D4E5"
              maxLength={10}
              className="h-11 font-mono text-base uppercase tracking-widest"
              required
            />
          </div>
        )}
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Einmal als Azubi registriert, lässt sich die Rolle nicht mehr ändern.
        </p>
      </div>

      <label htmlFor="signup-privacy" className="flex cursor-pointer items-start gap-2.5">
        <Checkbox id="signup-privacy" checked={privacy} onCheckedChange={(c) => setPrivacy(c === true)} className="mt-0.5" />
        <span className="text-sm">
          Ich habe die{" "}
          <Link to="/datenschutz" className="font-medium text-primary underline-offset-4 hover:underline">
            Datenschutzerklärung
          </Link>{" "}
          gelesen.
        </span>
      </label>

      <Button type="submit" className="h-11 w-full" disabled={busy}>
        <KeyRound className="size-4" aria-hidden />
        Konto erstellen
      </Button>
    </form>
  );
}

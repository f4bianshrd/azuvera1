import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/shared";

const TITLE = "Neues Passwort – Azuvera";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: "Neues Passwort für dein Azuvera-Konto setzen." },
      { property: "og:title", content: TITLE },
      { property: "og:type", content: "website" },
      { property: "og:description", content: "Neues Passwort für dein Azuvera-Konto setzen." },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Der Reset-Link trägt type=recovery im URL-Hash; die Sitzung wird dann per Event gesetzt.
    if (window.location.hash.includes("type=recovery")) {
      setReady(true);
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 10) {
      toast.error("Das Passwort muss mindestens 10 Zeichen lang sein.");
      return;
    }
    if (password !== repeat) {
      toast.error("Die Passwörter stimmen nicht überein.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error("Passwort konnte nicht gespeichert werden. Bitte fordere einen neuen Link an.");
      return;
    }
    toast.success("Passwort gespeichert");
    void navigate({ to: "/dashboard" });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-6">
        <Logo size={36} />
      </div>
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold">Neues Passwort</h1>
        {ready ? (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Neues Passwort</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="h-11 text-base"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="repeat-password">Passwort wiederholen</Label>
              <Input
                id="repeat-password"
                type="password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                autoComplete="new-password"
                className="h-11 text-base"
                required
              />
            </div>
            <Button type="submit" className="h-11 w-full" disabled={busy}>
              Passwort speichern
            </Button>
          </form>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Dieser Link ist ungültig oder abgelaufen. Fordere auf der{" "}
            <Link to="/auth" className="font-medium text-primary underline-offset-4 hover:underline">
              Anmeldeseite
            </Link>{" "}
            einen neuen Link an.
          </p>
        )}
      </div>
    </div>
  );
}

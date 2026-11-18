import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, Mail } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithProvider, type SocialProvider } from "@/features/auth/api";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";
import { loadLoginMethods, rememberLinkingUser, requestEmailChange, setFirstPassword, syncMyEmail, takeLinkingUser, type LoginMethod } from "./api";

const LABEL: Record<LoginMethod, string> = { email: "E-Mail und Passwort", google: "Google", apple: "Apple", microsoft: "Microsoft" };
const SOCIAL: SocialProvider[] = ["google", "apple", "microsoft"];

/** Profil: E-Mail-Adresse ansehen/ändern und weitere Anmeldewege hinzufügen. */
export function LoginMethodsCard({ userId, profileEmail }: { userId: string; profileEmail: string }) {
  const online = useOnline();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["account", "login-methods"], queryFn: loadLoginMethods, enabled: online });
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  // Bestätigte neue Adresse ins Profil übernehmen; Rückkehr vom Verknüpfen auswerten.
  useEffect(() => {
    const linking = takeLinkingUser();
    if (linking && linking !== userId) toast.error("Dieses Konto hat eine andere E-Mail-Adresse und wurde deshalb nicht verbunden. Du bist jetzt mit dem anderen Konto angemeldet – melde dich ab und wieder mit deinem bisherigen Konto an.", { duration: 12000 });
    else if (linking) toast.success("Anmeldeweg verbunden");
  }, [userId]);
  useEffect(() => {
    if (!q.data || !q.data.email || q.data.email === profileEmail) return;
    void syncMyEmail().then(() => qc.invalidateQueries({ queryKey: ["my-profile"] })).catch(() => undefined);
  }, [q.data, profileEmail, qc]);

  const changeEmail = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast.error("Bitte gib eine gültige E-Mail-Adresse ein."); return; }
    setBusy(true);
    try {
      await requestEmailChange(email);
      setEmail("");
      toast.success("Wir haben dir einen Bestätigungslink geschickt. Die neue Adresse gilt, sobald du ihn öffnest.", { duration: 10000 });
      await q.refetch();
    } catch (e) {
      toast.error((e as Error).message.includes("already") ? "Diese E-Mail-Adresse wird schon für ein anderes Konto genutzt." : "Die E-Mail-Adresse konnte nicht geändert werden.");
    } finally { setBusy(false); }
  };

  const addPassword = async () => {
    if (pw.length < 10) { toast.error("Das Passwort muss mindestens 10 Zeichen lang sein."); return; }
    setBusy(true);
    try { await setFirstPassword(pw); setPw(""); toast.success("Passwort festgelegt – du kannst dich jetzt auch mit E-Mail und Passwort anmelden."); await q.refetch(); }
    catch (e) {
      const m = (e as Error).message.toLowerCase();
      toast.error(m.includes("reauth") || m.includes("recent") ? "Bitte melde dich einmal neu an und versuche es dann erneut." : m.includes("weak") || m.includes("pwned") ? "Dieses Passwort ist zu unsicher. Bitte wähle ein anderes." : "Das Passwort konnte nicht festgelegt werden.");
    } finally { setBusy(false); }
  };

  const connect = async (p: SocialProvider) => {
    setBusy(true);
    rememberLinkingUser(userId);
    const r = await signInWithProvider(p, "/profil");
    if (r.error) { takeLinkingUser(); setBusy(false); toast.error("Das Verbinden hat nicht geklappt. Bitte versuche es erneut."); return; }
    if (!r.redirected) { setBusy(false); window.location.reload(); }
  };

  const d = q.data;
  return (
    <section className="rounded-2xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6" aria-labelledby="login-methods">
      <h2 id="login-methods" className="text-lg font-semibold">E-Mail und Anmeldung</h2>
      {!online ? <p className="mt-3 text-sm text-muted-foreground">{OFFLINE_ACTION_HINT}</p> : (
        <div className="mt-4 space-y-6">
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm"><Mail className="size-4 text-muted-foreground" aria-hidden /> <span className="font-medium break-all">{d?.email || profileEmail}</span></p>
            {d?.pendingEmail && <p className="rounded-lg border-l-4 border-primary bg-accent p-2 text-sm">Neue Adresse <span className="font-medium">{d.pendingEmail}</span> wartet auf Bestätigung. Öffne den Link in der E-Mail.</p>}
            <Label htmlFor="new-email">Neue E-Mail-Adresse</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="new-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 text-base sm:max-w-sm" />
              <Button variant="outline" className="h-11" disabled={busy || !email.trim()} onClick={() => void changeEmail()}>E-Mail ändern</Button>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-medium">Anmeldewege</h3>
            <ul className="space-y-2">
              {(["email", ...SOCIAL] as LoginMethod[]).map((m) => {
                const on = d?.methods.includes(m) ?? false;
                return (
                  <li key={m} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                    <span className="flex items-center gap-2 text-sm font-medium">{m === "email" ? <KeyRound className="size-4" aria-hidden /> : null}{LABEL[m]}</span>
                    {on ? <Badge variant="secondary" className="gap-1"><CheckCircle2 className="size-3.5" aria-hidden /> Verbunden</Badge>
                      : m === "email" ? null
                      : <Button size="sm" variant="outline" disabled={busy || !d} onClick={() => void connect(m as SocialProvider)}>Verbinden</Button>}
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted-foreground">Verbinden klappt mit einem {"Google-, Apple- oder Microsoft-Konto"}, das dieselbe E-Mail-Adresse nutzt wie dein Azuvera-Konto ({d?.email || profileEmail}).</p>
            {d && !d.hasPassword && (
              <div className="space-y-2 rounded-xl border border-dashed p-3">
                <Label htmlFor="first-pw">Passwort festlegen (mind. 10 Zeichen)</Label>
                <p className="text-xs text-muted-foreground">Dann kannst du dich zusätzlich mit deiner E-Mail-Adresse und diesem Passwort anmelden. Hast du schon eines festgelegt, wird es hier ersetzt.</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input id="first-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className="h-11 text-base sm:max-w-sm" />
                  <Button variant="outline" className="h-11" disabled={busy || !pw} onClick={() => void addPassword()}>Passwort festlegen</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

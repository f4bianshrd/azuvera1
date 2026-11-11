import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { finishProviderSignIn, pendingProviderSignIn, rememberAuthTarget, signInWithProvider, type SocialProvider } from "./api";

function GoogleLogo() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>;
}

function MicrosoftLogo() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#F25022" d="M1 1h10v10H1z"/><path fill="#7FBA00" d="M13 1h10v10H13z"/><path fill="#00A4EF" d="M1 13h10v10H1z"/><path fill="#FFB900" d="M13 13h10v10H13z"/></svg>;
}

export function SocialButtons({ target, onSuccess }: { target: string; onSuccess: () => void }) {
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  useEffect(() => {
    if (!pendingProviderSignIn()) return;
    void finishProviderSignIn().then((finished) => { if (finished) onSuccess(); });
  }, [onSuccess]);

  const signIn = async (provider: SocialProvider) => {
    setBusy(provider);
    rememberAuthTarget(target);
    const result = await signInWithProvider(provider);
    if (result.error) {
      setBusy(null);
      toast.error("Anmeldung fehlgeschlagen. Bitte versuche es erneut.");
      return;
    }
    if (!result.redirected) {
      if (await finishProviderSignIn()) onSuccess();
      else setBusy(null);
    }
  };

  const providers: { id: SocialProvider; label: string; logo?: React.ReactNode; className: string }[] = [
    { id: "google", label: "Mit Google fortfahren", logo: <GoogleLogo />, className: "border-oauth-google-border bg-oauth-google-background text-oauth-google-foreground hover:bg-oauth-google-background/90" },
    { id: "apple", label: "Mit Apple fortfahren", className: "border-oauth-apple-border bg-oauth-apple-background text-oauth-apple-foreground hover:bg-oauth-apple-background/90" },
    { id: "microsoft", label: "Mit Microsoft fortfahren", logo: <MicrosoftLogo />, className: "border-oauth-google-border bg-oauth-google-background text-oauth-google-foreground hover:bg-oauth-google-background/90" },
  ];
  return <div className="space-y-3">
    <div className="flex items-center gap-3" aria-hidden><span className="h-px flex-1 bg-border" /><span className="text-xs text-muted-foreground">oder</span><span className="h-px flex-1 bg-border" /></div>
    <div className="space-y-2">{providers.map((provider) => <Button key={provider.id} type="button" variant="outline" disabled={busy !== null} onClick={() => void signIn(provider.id)} className={`h-11 min-w-36 w-full justify-center gap-2.5 border px-3 text-sm font-medium leading-5 ${provider.className}`}>{provider.logo}{busy === provider.id ? "Anmeldung läuft…" : provider.label}</Button>)}</div>
  </div>;
}

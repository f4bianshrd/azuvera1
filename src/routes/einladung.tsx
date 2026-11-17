import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { MailOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared";
import { ROLE_LABELS, useMyProfile } from "@/features/app/session";
import { redeemInvitation, storePendingInvite } from "@/features/access/api";
import { formatCode, isInviteRole, isValidCode, normalizeCode, type InviteRole } from "@/features/access/codes";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";

const TITLE = "Einladung – Azuvera";
const DESC = "Eine Auszubildende Person lädt dich ein, ihr digitales Berichtsheft in Azuvera einzusehen.";

export const Route = createFileRoute("/einladung")({
  validateSearch: (s: Record<string, unknown>): { code?: string; rolle?: InviteRole } => ({
    ...(typeof s["code"] === "string" && s["code"].length <= 20 ? { code: s["code"] } : {}),
    ...(isInviteRole(s["rolle"]) ? { rolle: s["rolle"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvitationPage,
});

function InvitationPage() {
  const { code: raw, rolle } = Route.useSearch();
  const code = raw ? normalizeCode(raw) : "";
  const valid = isValidCode(code);
  const { data: me, isLoading } = useMyProfile();
  const signedIn = isLoading ? null : !!me;
  useEffect(() => { if (valid) storePendingInvite(code); }, [valid, code]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-primary/10 via-background to-background px-4 py-10">
      <Link to="/" className="mb-8" aria-label="Zur Startseite"><Logo size={36} /></Link>
      <div className="w-full max-w-md overflow-hidden rounded-3xl border bg-card shadow-lg">
        <div className="bg-gradient-to-br from-primary to-brand-teal px-6 py-6 text-primary-foreground">
          <MailOpen className="size-8 opacity-90" aria-hidden />
          <h1 className="mt-3 text-xl font-semibold">Du wurdest zu Azuvera eingeladen</h1>
        </div>
        <div className="space-y-5 p-6">
          {!valid ? (
            <>
              <p className="text-sm">Dieser Link enthält keinen Einladungs-Code.</p>
              <Button asChild variant="outline" className="h-11 w-full"><Link to="/">Zur Startseite</Link></Button>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed">
                Eine Auszubildende Person möchte dir Einblick in ihr digitales Berichtsheft geben{rolle ? `, als ${ROLE_LABELS[rolle]}` : ""}.
              </p>
              <div className="rounded-2xl bg-muted/60 p-4 text-center">
                <p className="text-xs text-muted-foreground">Dein Einladungs-Code</p>
                <p className="mt-1 font-mono text-2xl font-bold tracking-[0.14em]">{formatCode(code)}</p>
              </div>
              {signedIn === null ? null : signedIn ? <SignedInActions code={code} /> : (
                <div className="grid gap-2">
                  <Button asChild className="h-11"><Link to="/auth" search={{ mode: "signup", code, ...(rolle ? { rolle } : {}) }}>Konto erstellen</Link></Button>
                  <Button asChild variant="outline" className="h-11"><Link to="/auth">Ich habe schon ein Konto</Link></Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SignedInActions({ code }: { code: string }) {
  const { data: me } = useMyProfile();
  const online = useOnline();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;
  if (me.role === "azubi") {
    return <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">Mit einem Azubi-Konto lässt sich diese Einladung nicht annehmen. Registriere dich mit der passenden Rolle.</p>;
  }
  const accept = async () => {
    setBusy(true); setError(null);
    try {
      const r = await redeemInvitation(code);
      if (!r.ok || !r.azubiId) { setError(r.error ?? "Das hat nicht geklappt."); return; }
      toast.success("Zugriff erhalten");
      await client.invalidateQueries();
      void navigate({ to: "/team/$azubiId", params: { azubiId: r.azubiId } });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      <Button className="h-11 w-full" disabled={!online || busy} onClick={() => void accept()}>Einladung annehmen</Button>
      {!online && <p className="text-xs text-muted-foreground">{OFFLINE_ACTION_HINT}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

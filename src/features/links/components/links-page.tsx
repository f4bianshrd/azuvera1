import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Eye, KeyRound, Link2, MessageSquareText, QrCode, ScanLine, UserMinus, Users, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog, ResponsiveDialog } from "@/components/dialogs";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/shared";
import { ROLE_LABELS, useMyProfile, type AppRole } from "@/features/app/session";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";
import { cn } from "@/lib/utils";
import { ACCESS_INFO, VALIDITY_OPTIONS, canRedeem, expiresInText, formatCode, isValidCode, normalizeCode, type LinkAccess } from "../codes";
import { createLinkCode, listLinks, listMyCodes, previewLinkCode, redeemLinkCode, removeLink, revokeLinkCode, type LinkCode, type LinkRow } from "../api";
import { QrCodeDialog } from "./qr-card";
import { QrScanner } from "./qr-scanner";

const ACCESS_ICON: Record<LinkAccess, LucideIcon> = { read: Eye, feedback: MessageSquareText, review: BadgeCheck };
const ACCESS_ORDER: LinkAccess[] = ["read", "feedback", "review"];
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
const dateDe = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

function AccessBadge({ access }: { access: LinkAccess }) {
  const Icon = ACCESS_ICON[access];
  return <Badge variant="outline" className="gap-1 whitespace-nowrap"><Icon className="size-3.5" aria-hidden />{ACCESS_INFO[access].label}</Badge>;
}

export function LinksPage({ code }: { code?: string | undefined }) {
  const { data: me } = useMyProfile();
  const online = useOnline();
  if (!me) return <ListSkeleton />;
  return (
    <div className="space-y-8 pb-24">
      <PageHeader
        title="Verknüpfungen"
        subtitle={me.role === "azubi"
          ? "Gib Ausbilder:innen, Prüfer:innen oder der Ausbildungsberatung Zugriff – per QR-Code oder Code."
          : "Scanne den QR-Code einer oder eines Auszubildenden oder gib den Code ein."}
      />
      {!online ? <EmptyState icon={Link2} title="Gerade offline" description={OFFLINE_ACTION_HINT} />
        : me.role === "azubi" ? <AzubiLinks name={me.full_name} /> : <StaffLinks role={me.role} initialCode={code} />}
    </div>
  );
}

// ---------------- Azubi ----------------
function AzubiLinks({ name }: { name: string }) {
  const qc = useQueryClient();
  const [access, setAccess] = useState<LinkAccess>("review");
  const [hours, setHours] = useState<number>(168);
  const [shown, setShown] = useState<LinkCode | null>(null);
  const [revoke, setRevoke] = useState<LinkCode | null>(null);
  const [remove, setRemove] = useState<LinkRow | null>(null);
  const codes = useQuery({ queryKey: ["links", "codes"], queryFn: listMyCodes });
  const links = useQuery({ queryKey: ["links", "list"], queryFn: listLinks });
  const create = useMutation({
    mutationFn: () => createLinkCode(access, hours),
    onSuccess: async (c) => { setShown(c); await qc.invalidateQueries({ queryKey: ["links"] }); },
    onError: (e) => toast.error(e.message),
  });
  const now = new Date();
  const open = (codes.data ?? []).filter((c) => !c.used_at && !c.revoked_at && new Date(c.expires_at) > now);

  return (
    <>
      <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="bg-gradient-to-br from-primary to-brand-teal px-5 py-5 text-primary-foreground sm:px-7">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-primary-foreground/15"><QrCode className="size-6" aria-hidden /></span>
            <div>
              <h2 className="text-lg font-semibold">Neuen Code erstellen</h2>
              <p className="text-sm opacity-90">Wähle, was die andere Person darf. Jeder Code gilt einmal.</p>
            </div>
          </div>
        </div>
        <div className="space-y-5 p-5 sm:p-7">
          <div role="radiogroup" aria-label="Zugriff" className="grid gap-3 md:grid-cols-3">
            {ACCESS_ORDER.map((a) => {
              const Icon = ACCESS_ICON[a], info = ACCESS_INFO[a], active = access === a;
              return (
                <button key={a} type="button" role="radio" aria-checked={active} onClick={() => setAccess(a)}
                  className={cn("flex flex-col gap-2 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50")}>
                  <span className="flex items-center gap-2">
                    <span className={cn("grid size-9 place-items-center rounded-xl", active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}><Icon className="size-4.5" aria-hidden /></span>
                    <span className="font-semibold">{info.label}</span>
                  </span>
                  <span className="text-sm text-muted-foreground">Für {info.who}</span>
                  <ul className="space-y-0.5 text-xs text-muted-foreground">{info.can.map((c) => <li key={c}>· {c}</li>)}</ul>
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5">
              <Label id="validity-label" className="block">Gültig für</Label>
              <div role="radiogroup" aria-labelledby="validity-label" className="inline-flex rounded-xl border bg-muted/40 p-1">
                {VALIDITY_OPTIONS.map((v) => (
                  <button key={v.hours} type="button" role="radio" aria-checked={hours === v.hours} onClick={() => setHours(v.hours)}
                    className={cn("rounded-lg px-3 py-1.5 text-sm transition-colors", hours === v.hours ? "bg-primary font-medium text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{v.label}</button>
                ))}
              </div>
            </div>
            <Button size="lg" onClick={() => create.mutate()} disabled={create.isPending}><QrCode className="size-4" aria-hidden /> {create.isPending ? "Wird erstellt …" : "QR-Code erstellen"}</Button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Offene Codes</h2>
        {codes.isLoading ? <ListSkeleton /> : !open.length ? <p className="text-sm text-muted-foreground">Keine offenen Codes. Erstelle oben einen neuen.</p> : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {open.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted"><KeyRound className="size-4.5" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-base font-semibold tracking-wider">{formatCode(c.code)}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><AccessBadge access={c.access} />{expiresInText(c.expires_at)}</div>
                </div>
                <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                  <Button size="sm" variant="outline" onClick={() => setShown(c)}><QrCode className="size-4" aria-hidden /> QR</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRevoke(c)}>Widerrufen</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Verknüpfte Personen</h2>
        {links.isLoading ? <ListSkeleton /> : !links.data?.length ? (
          <EmptyState icon={Users} title="Noch niemand verknüpft" description="Sobald jemand deinen Code einlöst, erscheint die Person hier – du kannst den Zugriff jederzeit wieder entfernen." />
        ) : (
          <ul className="divide-y rounded-2xl border bg-card shadow-sm">
            {links.data.map((l) => (
              <li key={l.member_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar><AvatarFallback>{initials(l.member_name)}</AvatarFallback></Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.member_name || "Unbekannt"}</p>
                    <p className="text-xs text-muted-foreground">{l.member_role ? ROLE_LABELS[l.member_role] : "—"} · seit {dateDe(l.created_at)}{l.is_primary ? " · hauptzuständig" : ""}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <AccessBadge access={l.access} />
                  <Button size="sm" variant="ghost" onClick={() => setRemove(l)}><UserMinus className="size-4" aria-hidden /> Entfernen</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {shown && <QrCodeDialog open onOpenChange={(o) => !o && setShown(null)} code={shown.code} access={shown.access} expiresAt={shown.expires_at} name={name} />}
      <ConfirmDialog open={!!revoke} onOpenChange={(o) => !o && setRevoke(null)} title="Code widerrufen?" description="Danach kann niemand mehr diesen Code einlösen." confirmLabel="Widerrufen" destructive
        onConfirm={() => { const c = revoke; setRevoke(null); if (c) void revokeLinkCode(c.id).then(() => { toast.success("Code widerrufen"); return qc.invalidateQueries({ queryKey: ["links"] }); }, (e: Error) => toast.error(e.message)); }} />
      <ConfirmDialog open={!!remove} onOpenChange={(o) => !o && setRemove(null)} title="Zugriff entfernen?" description={remove ? `${remove.member_name} sieht deine Berichte danach nicht mehr.` : undefined} confirmLabel="Entfernen" destructive
        onConfirm={() => { const l = remove; setRemove(null); if (l) void removeLink(l.azubi_id, l.member_id).then(() => { toast.success("Zugriff entfernt"); return qc.invalidateQueries({ queryKey: ["links"] }); }, (e: Error) => toast.error(e.message)); }} />
    </>
  );
}

// ---------------- Ausbilder:innen, Prüfer:innen, Beratung ----------------
function StaffLinks({ role, initialCode }: { role: AppRole; initialCode?: string | undefined }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [scan, setScan] = useState(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [remove, setRemove] = useState<LinkRow | null>(null);
  const links = useQuery({ queryKey: ["links", "list"], queryFn: listLinks });

  useEffect(() => {
    if (!initialCode) return;
    const c = normalizeCode(initialCode);
    if (isValidCode(c)) setPending(c); else toast.error("Dieser Code ist ungültig.");
    void navigate({ to: "/verknuepfungen", search: {}, replace: true });
  }, [initialCode, navigate]);

  const onScanned = useCallback((c: string) => { setScan(false); setPending(c); }, []);
  const submitInput = () => {
    const c = normalizeCode(input);
    if (!isValidCode(c)) { toast.error("Der Code hat 8 Zeichen, z. B. ABCD-2345."); return; }
    setPending(c);
  };

  return (
    <>
      <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="grid gap-0 md:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col justify-between gap-5 bg-gradient-to-br from-primary to-brand-teal p-6 text-primary-foreground sm:p-8">
            <div className="space-y-2">
              <span className="grid size-12 place-items-center rounded-2xl bg-primary-foreground/15"><ScanLine className="size-6" aria-hidden /></span>
              <h2 className="text-xl font-semibold">QR-Code scannen</h2>
              <p className="text-sm opacity-90">Lass dir den Code in der Azuvera-App zeigen und halte die Kamera darauf.</p>
            </div>
            <Button size="lg" variant="secondary" className="w-full sm:w-auto" onClick={() => setScan(true)}><ScanLine className="size-4" aria-hidden /> Scanner öffnen</Button>
          </div>
          <form className="space-y-3 p-6 sm:p-8" onSubmit={(e) => { e.preventDefault(); submitInput(); }}>
            <Label htmlFor="link-code" className="text-base font-semibold">Code eingeben</Label>
            <p className="text-sm text-muted-foreground">8 Zeichen, z. B. ABCD-2345.</p>
            <Input id="link-code" value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="XXXX-XXXX" maxLength={12}
              autoComplete="off" autoCapitalize="characters" spellCheck={false} className="h-12 font-mono text-lg tracking-widest" />
            <Button type="submit" className="w-full" disabled={!input.trim()}>Weiter</Button>
          </form>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Verknüpfte Auszubildende</h2>
        {links.isLoading ? <ListSkeleton /> : !links.data?.length ? (
          <EmptyState icon={Users} title="Noch keine Verknüpfungen" description="Scanne den Code einer oder eines Auszubildenden, um Berichte zu sehen." />
        ) : (
          <ul className="divide-y rounded-2xl border bg-card shadow-sm">
            {links.data.map((l) => (
              <li key={l.azubi_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar><AvatarFallback>{initials(l.azubi_name)}</AvatarFallback></Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.azubi_name}</p>
                    <p className="text-xs text-muted-foreground">seit {dateDe(l.created_at)}{l.is_primary ? " · hauptzuständig" : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <AccessBadge access={l.access} />
                  <span className="flex-1" />
                  <Button size="sm" variant="outline" asChild><Link to="/team/$azubiId" params={{ azubiId: l.azubi_id }}>Öffnen</Link></Button>
                  <Button size="sm" variant="ghost" onClick={() => setRemove(l)}>Lösen</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {scan && <QrScanner onCode={onScanned} onClose={() => setScan(false)} />}
      {pending && <RedeemDialog code={pending} role={role} onDone={async (ok) => { setPending(null); if (ok) { setInput(""); await qc.invalidateQueries(); } }} />}
      <ConfirmDialog open={!!remove} onOpenChange={(o) => !o && setRemove(null)} title="Verknüpfung lösen?" description={remove ? `Du siehst die Berichte von ${remove.azubi_name} danach nicht mehr.` : undefined} confirmLabel="Lösen" destructive
        onConfirm={() => { const l = remove; setRemove(null); if (l) void removeLink(l.azubi_id, l.member_id).then(() => { toast.success("Verknüpfung gelöst"); return qc.invalidateQueries(); }, (e: Error) => toast.error(e.message)); }} />
    </>
  );
}

function RedeemDialog({ code, role, onDone }: { code: string; role: AppRole; onDone: (ok: boolean) => void | Promise<void> }) {
  const preview = useQuery({ queryKey: ["links", "preview", code], queryFn: () => previewLinkCode(code), retry: false, staleTime: Infinity });
  const redeem = useMutation({
    mutationFn: () => redeemLinkCode(code),
    onSuccess: async (r) => { toast.success(`Verknüpft mit ${r.azubi_name}`); await onDone(true); },
    onError: (e) => toast.error(e.message),
  });
  const p = preview.data;
  const allowed = p ? p.allowed && canRedeem(role, p.access) : false;
  const Icon = p ? ACCESS_ICON[p.access] : Link2;
  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && void onDone(false)} title="Verknüpfen?" description={`Code ${formatCode(code)}`}>
      {preview.isLoading ? <ListSkeleton /> : preview.error ? (
        <div className="space-y-4"><p className="text-sm">{preview.error.message}</p><Button variant="outline" className="w-full" onClick={() => void onDone(false)}>Schließen</Button></div>
      ) : p && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-2xl border bg-muted/30 p-4">
            <Avatar className="size-12"><AvatarFallback>{initials(p.azubi_name)}</AvatarFallback></Avatar>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{p.azubi_name}</p>
              <p className="text-xs text-muted-foreground">Code gültig {expiresInText(p.expires_at)}</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="flex items-center gap-2 font-medium"><Icon className="size-4 text-primary" aria-hidden /> {ACCESS_INFO[p.access].label}</p>
            <ul className="space-y-1 text-sm text-muted-foreground">{ACCESS_INFO[p.access].can.map((c) => <li key={c}>· {c}</li>)}</ul>
          </div>
          {!allowed && <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">Mit deiner Rolle ({ROLE_LABELS[role]}) kannst du diesen Code nicht einlösen. Er ist für {ACCESS_INFO[p.access].who}.</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={() => void onDone(false)}>Abbrechen</Button>
            <Button onClick={() => redeem.mutate()} disabled={!allowed || redeem.isPending}>{redeem.isPending ? "Wird verknüpft …" : "Verknüpfen"}</Button>
          </div>
        </div>
      )}
    </ResponsiveDialog>
  );
}

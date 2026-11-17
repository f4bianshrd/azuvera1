import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Eye, EyeOff, KeyRound, Plus, QrCode, ScanLine, ShieldCheck, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog, ResponsiveDialog } from "@/components/dialogs";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/shared";
import { ROLE_LABELS, useMyProfile, type AppRole, type MyProfile } from "@/features/app/session";
import { subscribeNotifications } from "@/features/notifications/api";
import { copyText } from "@/lib/platform";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";
import { cn } from "@/lib/utils";
import {
  ACCESS_DAYS, CODE_VALID_DAYS, INVITE_ROLE_HINT, INVITE_ROLE_ORDER, PRUEFER_ACCESS_DAYS, daysLeft, formatCode, isValidCode, normalizeCode, type InviteRole,
} from "../codes";
import {
  createInvitation, endAccess, myAccessOverview, redeemInvitation, revokeInvitation, setDeputyAllowed,
  type AzubiGrant, type GranteeGrant, type Invitation,
} from "../api";
import { InvitationReadyDialog } from "./invitation-ready";
import { QrScanner } from "./qr-scanner";

const dateDe = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
const initialsOf = (n: string | null) => (n ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
export const ACCESS_QUERY_KEY = ["access", "overview"] as const;

export function AccessPage({ openNew, code }: { openNew?: boolean; code?: string | undefined }) {
  const { data: me } = useMyProfile();
  const client = useQueryClient();
  const myId = me?.id;
  useEffect(() => (myId ? subscribeNotifications(myId, () => void client.invalidateQueries({ queryKey: ACCESS_QUERY_KEY })) : undefined), [myId, client]);
  if (!me) return <ListSkeleton />;
  const isAzubi = me.role === "azubi";
  return (
    <div className="space-y-8 pb-24">
      <PageHeader title="Zugriff & Einladungen" subtitle={isAzubi ? "Du entscheidest, wer dein Berichtsheft sehen darf." : "Auszubildende, die dich eingeladen haben."} />
      {isAzubi ? <AzubiView me={me} openNew={!!openNew} /> : me.role === "ausbildungsleitung" ? (
        <EmptyState icon={ShieldCheck} title="Du siehst als Ausbildungsleitung alle Berichtshefte." description="Einladungs-Codes brauchst du nicht." />
      ) : <GranteeView initialCode={code} />}
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{title}</h2>{action}</div>
      {children}
    </section>
  );
}

function EndsHint({ validUntil, alwaysDate }: { validUntil: string | null; alwaysDate?: boolean }) {
  const left = daysLeft(validUntil);
  return (
    <span className="text-xs text-muted-foreground">
      {validUntil ? `bis ${dateDe(validUntil)}` : alwaysDate ? "" : "unbefristet"}
      {left !== null && left >= 0 && left <= 7 && <span className="ml-2 font-medium text-warning-foreground dark:text-warning">Endet in {left} Tagen</span>}
    </span>
  );
}

function ReviewChip({ canReview }: { canReview: boolean }) {
  return <Badge variant={canReview ? "default" : "outline"} className="whitespace-nowrap">{canReview ? "darf prüfen" : "nur lesen"}</Badge>;
}

/* ---------------- Azubi ---------------- */

function AzubiView({ me, openNew }: { me: MyProfile; openNew: boolean }) {
  const online = useOnline();
  const client = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ACCESS_QUERY_KEY, queryFn: myAccessOverview, enabled: online });
  const [inviteOpen, setInviteOpen] = useState(openNew);
  const [ready, setReady] = useState<{ code: string; role: AppRole; expires_at: string } | null>(null);
  const [ending, setEnding] = useState<AzubiGrant | null>(null);
  const [revoking, setRevoking] = useState<Invitation | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ACCESS_QUERY_KEY });
  const endM = useMutation({ mutationFn: endAccess, onSuccess: async () => { toast.success("Zugriff beendet"); await refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const revokeM = useMutation({ mutationFn: revokeInvitation, onSuccess: async () => { toast.success("Einladung widerrufen"); await refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const deputyM = useMutation({ mutationFn: (a: { id: string; v: boolean }) => setDeputyAllowed(a.id, a.v), onSuccess: async () => { toast.success("Gespeichert"); await refresh(); }, onError: (e: Error) => toast.error(e.message) });

  if (!online) return <EmptyState icon={KeyRound} title={OFFLINE_ACTION_HINT} />;
  if (isLoading) return <ListSkeleton />;
  if (error) return <EmptyState title="Das hat nicht geklappt." description={(error as Error).message} />;
  const grants = data?.as_azubi?.grants ?? [];
  const invitations = data?.as_azubi?.invitations ?? [];
  const active = grants.filter((g) => g.status === "active");
  const past = grants.filter((g) => g.status !== "active");
  const open = invitations.filter((i) => i.status === "open");
  const closed = invitations.filter((i) => i.status !== "open");
  const nobodyReviews = !active.some((g) => g.can_review);

  return (
    <>
      {nobodyReviews && (
        <div className="flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">Noch niemand prüft deine Berichte. Lade deine Ausbilder:in oder Betriebsleiter:in ein, damit sie Berichte freigeben können.</p>
          <Button onClick={() => setInviteOpen(true)} className="shrink-0"><Plus className="size-4" aria-hidden /> Person einladen</Button>
        </div>
      )}

      <Section title="Wer hat Zugriff?">
        {active.length === 0 ? <p className="text-sm text-muted-foreground">Niemand hat Zugriff auf dein Berichtsheft.</p> : (
          <ul className="divide-y">
            {active.map((g) => (
              <li key={g.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start">
                <Avatar className="size-10 shrink-0"><AvatarFallback>{initialsOf(g.grantee_name)}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{g.grantee_name ?? "Unbekannt"}</p>
                    <Badge variant="secondary">{ROLE_LABELS[g.role]}</Badge>
                    <ReviewChip canReview={g.can_review} />
                  </div>
                  {g.organization && <p className="text-sm text-muted-foreground">{g.organization}</p>}
                  <p className="text-xs text-muted-foreground">seit {dateDe(g.created_at)} · <EndsHint validUntil={g.valid_until} /></p>
                  {g.can_review && (
                    <div className="flex items-start gap-3 pt-1">
                      <Switch id={`dep-${g.id}`} checked={g.deputy_allowed} disabled={deputyM.isPending} onCheckedChange={(v) => deputyM.mutate({ id: g.id, v })} />
                      <div>
                        <Label htmlFor={`dep-${g.id}`} className="text-sm">Vertretung darf mitlesen</Label>
                        <p className="text-xs text-muted-foreground">Ist die Person verhindert, darf eine von ihr eingetragene Vertretung deine Berichte zeitweise prüfen.</p>
                      </div>
                    </div>
                  )}
                  {g.deputies.map((d) => <p key={d.name + d.date_to} className="text-xs">Vertretung: {d.name} bis {dateDe(d.date_to)}</p>)}
                </div>
                <Button variant="outline" size="sm" className="min-h-11 shrink-0" onClick={() => setEnding(g)}><UserMinus className="size-4" aria-hidden /> Zugriff beenden</Button>
              </li>
            ))}
          </ul>
        )}
        {past.length > 0 && (
          <Fold label="Beendete und abgelaufene Zugriffe">
            <ul className="divide-y text-sm">
              {past.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{g.grantee_name ?? "Unbekannt"} · {ROLE_LABELS[g.role]}</span>
                  <span className="text-xs text-muted-foreground">{dateDe(g.created_at)} – {dateDe(g.revoked_at ?? g.valid_until ?? g.created_at)} · {g.status === "ended" ? "Beendet" : "Abgelaufen"}</span>
                </li>
              ))}
            </ul>
          </Fold>
        )}
      </Section>

      <Section title="Einladungen" action={<Button onClick={() => setInviteOpen(true)}><Plus className="size-4" aria-hidden /> Neue Einladung</Button>}>
        {open.length === 0 ? <p className="text-sm text-muted-foreground">Keine offenen Einladungen.</p> : (
          <ul className="divide-y">
            {open.map((i) => <OpenInvitation key={i.id} inv={i} onShow={() => setReady({ code: i.code, role: i.role, expires_at: i.expires_at })} onRevoke={() => setRevoking(i)} />)}
          </ul>
        )}
        {closed.length > 0 && (
          <Fold label="Eingelöste und abgelaufene Einladungen">
            <ul className="divide-y text-sm">
              {closed.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{ROLE_LABELS[i.role]}{i.note ? ` · ${i.note}` : ""}</span>
                  <span className="text-xs text-muted-foreground">
                    {i.status === "redeemed" ? `Eingelöst von ${i.used_by_name ?? "Unbekannt"} am ${dateDe(i.used_at ?? i.expires_at)}` : i.status === "revoked" ? "Widerrufen" : "Abgelaufen"}
                  </span>
                </li>
              ))}
            </ul>
          </Fold>
        )}
      </Section>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} onCreated={async (r) => { setInviteOpen(false); setReady(r); await refresh(); }} />
      {ready && <InvitationReadyDialog open onOpenChange={(o) => !o && setReady(null)} code={ready.code} role={ready.role} expiresAt={ready.expires_at} name={me.full_name || me.email} />}
      <ConfirmDialog open={!!ending} onOpenChange={(o) => !o && setEnding(null)} title="Zugriff beenden?" destructive confirmLabel="Zugriff beenden"
        description={`${ending?.grantee_name ?? "Die Person"} kann deine Berichte danach nicht mehr sehen. Bereits erteilte Freigaben und Kommentare bleiben erhalten.`}
        onConfirm={() => { if (ending) endM.mutate(ending.id); setEnding(null); }} />
      <ConfirmDialog open={!!revoking} onOpenChange={(o) => !o && setRevoking(null)} title="Einladung widerrufen?" destructive confirmLabel="Widerrufen"
        description="Der Code funktioniert danach nicht mehr." onConfirm={() => { if (revoking) revokeM.mutate(revoking.id); setRevoking(null); }} />
    </>
  );
}

function OpenInvitation({ inv, onShow, onRevoke }: { inv: Invitation; onShow: () => void; onRevoke: () => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{ROLE_LABELS[inv.role]}</Badge>{inv.note && <span className="text-sm">{inv.note}</span>}</div>
        <p className="text-xs text-muted-foreground">gültig bis {dateDe(inv.expires_at)} · {inv.access_days ? `Zugriff ${inv.access_days} Tage` : "Zugriff unbefristet"}</p>
        <p className="font-mono text-sm tracking-wider">{visible ? formatCode(inv.code) : "••••-••••-••••"}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="min-h-11" onClick={() => setVisible((v) => !v)}>{visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />} {visible ? "Verbergen" : "Anzeigen"}</Button>
        <Button variant="outline" size="sm" className="min-h-11" onClick={() => void copyText(formatCode(inv.code)).then(() => toast.success("Kopiert"))}>Kopieren</Button>
        <Button variant="outline" size="sm" className="min-h-11" onClick={onShow}><QrCode className="size-4" aria-hidden /> QR-Code</Button>
        <Button variant="ghost" size="sm" className="min-h-11 text-destructive" onClick={onRevoke}>Widerrufen</Button>
      </div>
    </li>
  );
}

function Fold({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="min-h-11 px-2"><ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden /> {label}</Button>
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

function InviteDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (r: { code: string; role: AppRole; expires_at: string }) => void }) {
  const online = useOnline();
  const [role, setRole] = useState<InviteRole>("ausbilder");
  const [note, setNote] = useState("");
  const [validDays, setValidDays] = useState(14);
  const [accessDays, setAccessDays] = useState<number | null>(null);
  useEffect(() => { setAccessDays(role === "pruefer" ? 60 : null); }, [role]);
  const m = useMutation({
    mutationFn: () => createInvitation({ role, note, validDays, accessDays }),
    onSuccess: (r) => { setNote(""); onCreated({ code: r.code, role, expires_at: r.expires_at }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const accessOptions = role === "pruefer" ? [...PRUEFER_ACCESS_DAYS] : ACCESS_DAYS;
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Person einladen">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <div className="space-y-1.5">
          <Label htmlFor="inv-role">Rolle</Label>
          <Select value={role} onValueChange={(v) => setRole(v as InviteRole)}>
            <SelectTrigger id="inv-role"><SelectValue /></SelectTrigger>
            <SelectContent>{INVITE_ROLE_ORDER.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{INVITE_ROLE_HINT[role]}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-note">Notiz (nur für dich sichtbar)</Label>
          <Textarea id="inv-note" rows={2} maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Zum Beispiel: Herr Meier, Prüfungsausschuss" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="inv-valid">Code gültig für</Label>
            <Select value={String(validDays)} onValueChange={(v) => setValidDays(Number(v))}>
              <SelectTrigger id="inv-valid"><SelectValue /></SelectTrigger>
              <SelectContent>{CODE_VALID_DAYS.map((d) => <SelectItem key={d} value={String(d)}>{d} Tage</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-access">Zugriff dauert</Label>
            <Select value={accessDays === null ? "none" : String(accessDays)} onValueChange={(v) => setAccessDays(v === "none" ? null : Number(v))}>
              <SelectTrigger id="inv-access"><SelectValue /></SelectTrigger>
              <SelectContent>{accessOptions.map((d) => <SelectItem key={d ?? "none"} value={d === null ? "none" : String(d)}>{d === null ? "Bis ich ihn beende" : `${d} Tage`}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="rounded-xl border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Was die Person sieht</p>
          <p className="mt-1 text-muted-foreground">Die eingeladene Person sieht deine eingereichten und freigegebenen Berichte und Erfahrungsberichte mit Anhängen, Kommentaren und Unterschriften, deine Abwesenheiten, Schulnoten, deinen Ausbildungsplan und deine Profilangaben. Entwürfe bleiben privat. Du kannst den Zugriff jederzeit beenden.</p>
        </div>
        <Button type="submit" className="w-full" disabled={!online || m.isPending} title={online ? undefined : OFFLINE_ACTION_HINT}>Einladung erstellen</Button>
        {!online && <p className="text-xs text-muted-foreground">{OFFLINE_ACTION_HINT}</p>}
      </form>
    </ResponsiveDialog>
  );
}

/* ---------------- Eingeladene Personen ---------------- */

function GranteeView({ initialCode }: { initialCode?: string | undefined }) {
  const online = useOnline();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({ queryKey: ACCESS_QUERY_KEY, queryFn: myAccessOverview, enabled: online });
  const [code, setCode] = useState(initialCode ? formatCode(initialCode) : "");
  const [err, setErr] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [leaving, setLeaving] = useState<GranteeGrant | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ACCESS_QUERY_KEY });
  const redeem = useMutation({
    mutationFn: (c: string) => redeemInvitation(c),
    onSuccess: async (r) => {
      if (!r.ok) { setErr(r.error ?? "Das hat nicht geklappt."); return; }
      setErr(null); setCode(""); toast.success("Zugriff erhalten");
      await refresh(); await client.invalidateQueries({ queryKey: ["team"] });
      if (r.azubiId) void navigate({ to: "/team/$azubiId", params: { azubiId: r.azubiId } });
    },
    onError: (e: Error) => setErr(e.message),
  });
  const leave = useMutation({ mutationFn: endAccess, onSuccess: async () => { toast.success("Zugriff aufgegeben"); await refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const grants = data?.as_grantee?.grants ?? [];
  const active = grants.filter((g) => g.status === "active");
  const past = grants.filter((g) => g.status !== "active");
  const normalized = normalizeCode(code);

  return (
    <>
      <Section title="Einladungs-Code einlösen">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (isValidCode(normalized)) redeem.mutate(normalized); else setErr("Der Einladungs-Code ist ungültig, abgelaufen oder bereits eingelöst."); }}>
          <div className="space-y-1.5">
            <Label htmlFor="redeem-code">Einladungs-Code</Label>
            <Input id="redeem-code" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr(null); }} placeholder="Zum Beispiel: K7M2-Q9XA-4TBN" autoCapitalize="characters" autoComplete="off" className="font-mono tracking-wider" aria-invalid={!!err} aria-describedby={err ? "redeem-err" : undefined} />
            {err && <p id="redeem-err" className="text-sm text-destructive">{err}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!online || redeem.isPending || !normalized}>Einlösen</Button>
            <Button type="button" variant="outline" disabled={!online} onClick={() => setScanning(true)}><ScanLine className="size-4" aria-hidden /> QR-Code scannen</Button>
          </div>
          {!online && <p className="text-xs text-muted-foreground">{OFFLINE_ACTION_HINT}</p>}
        </form>
      </Section>

      <Section title="Meine Azubis">
        {!online ? <p className="text-sm text-muted-foreground">{OFFLINE_ACTION_HINT}</p> : isLoading ? <ListSkeleton rows={2} /> : error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : active.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch kein Zugriff. Lass dir von einer Azubi-Person einen Einladungs-Code geben.</p>
        ) : (
          <ul className="divide-y">
            {active.map((g) => (
              <li key={g.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                <Avatar className="size-10 shrink-0"><AvatarFallback>{initialsOf(g.azubi_name)}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{g.azubi_name ?? "Unbekannt"}</p><ReviewChip canReview={g.can_review} /></div>
                  {g.profession_name && <p className="text-sm text-muted-foreground">{g.profession_name}</p>}
                  <p className="text-xs text-muted-foreground">seit {dateDe(g.created_at)} · <EndsHint validUntil={g.valid_until} /></p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" className="min-h-11"><Link to="/team/$azubiId" params={{ azubiId: g.azubi_id }}>Öffnen</Link></Button>
                  <Button variant="outline" size="sm" className="min-h-11" onClick={() => setLeaving(g)}>Zugriff aufgeben</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {past.length > 0 && (
          <Fold label="Beendet oder abgelaufen">
            <ul className="divide-y text-sm">
              {past.map((g) => <li key={g.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{g.azubi_name ?? "Unbekannt"}</span><span className="text-xs text-muted-foreground">{g.status === "ended" ? "Beendet" : "Abgelaufen"}</span></li>)}
            </ul>
          </Fold>
        )}
      </Section>

      {scanning && <QrScanner onClose={() => setScanning(false)} onCode={(c) => { setScanning(false); setCode(formatCode(c)); redeem.mutate(c); }} />}
      <ConfirmDialog open={!!leaving} onOpenChange={(o) => !o && setLeaving(null)} title="Zugriff aufgeben?" destructive confirmLabel="Zugriff aufgeben"
        description={`Du siehst die Berichte von ${leaving?.azubi_name ?? "dieser Person"} danach nicht mehr.`} onConfirm={() => { if (leaving) leave.mutate(leaving.id); setLeaving(null); }} />
    </>
  );
}

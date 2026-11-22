import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, KeyRound, LifeBuoy, LogOut, ShieldCheck, UserSearch } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/shared";
import { ROLE_LABELS } from "@/features/app/session";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";
import {
  endSession, enrollTotp, getActiveSession, getAgentStatus, getDirectory, getMfaState, listMySessions, redeemCode, verifyIdentity, verifyTotp,
  type ActiveSession,
} from "../api";
import { formatTicketCode, isValidTicketCode, remainingLabel, scopeLabel } from "../scopes";
import { PersonPanel } from "./person-panel";

const dtDe = (iso: string) => new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
const dDe = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof LifeBuoy; children: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon className="size-5 text-primary" aria-hidden />{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function AgentConsole() {
  const online = useOnline();
  const status = useQuery({ queryKey: ["support", "status"], queryFn: getAgentStatus, enabled: online });
  if (!online) return <div className="space-y-6"><PageHeader title="Support" /><EmptyState title={OFFLINE_ACTION_HINT} /></div>;
  if (status.isLoading || !status.data) return <ListSkeleton />;
  if (!status.data.is_agent) return <div className="space-y-6"><PageHeader title="Support" /><EmptyState title="Dieser Bereich ist nur für IT/Technik." /></div>;
  return (
    <div className="space-y-6 pb-16">
      <PageHeader title="Support" subtitle="Personen helfen – erst nach bestätigter Identität, immer protokolliert." />
      {!status.data.mfa_ok ? <MfaGate /> : <Console codeLocked={status.data.code_locked} />}
    </div>
  );
}

function MfaGate() {
  const client = useQueryClient();
  const state = useQuery({ queryKey: ["support", "mfa"], queryFn: getMfaState });
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const start = useMutation({ mutationFn: enrollTotp, onSuccess: setEnroll, onError: (e: Error) => toast.error(e.message) });
  const verify = useMutation({
    mutationFn: (factorId: string) => verifyTotp(factorId, code),
    onSuccess: async () => { toast.success("Zwei-Faktor-Anmeldung bestätigt"); setCode(""); await client.invalidateQueries({ queryKey: ["support"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (state.isLoading || !state.data) return <ListSkeleton rows={2} />;
  const factorId = state.data.verifiedFactorId ?? enroll?.factorId ?? null;
  const codeField = (id: string) => (
    <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); verify.mutate(id); }}>
      <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        placeholder="6-stelliger Code" aria-label="Code aus der Authenticator-App" className="h-11 font-mono text-lg tracking-widest sm:max-w-48" />
      <Button type="submit" className="h-11" disabled={code.length !== 6 || verify.isPending}>Bestätigen</Button>
    </form>
  );
  return (
    <Panel title="Zwei-Faktor-Anmeldung" icon={KeyRound}>
      {state.data.verifiedFactorId ? (
        <>
          <p className="text-sm">Gib den aktuellen Code aus deiner Authenticator-App ein, um den Support-Bereich zu öffnen.</p>
          {codeField(state.data.verifiedFactorId)}
        </>
      ) : enroll && factorId ? (
        <>
          <p className="text-sm">Scanne den QR-Code mit einer Authenticator-App (z. B. Apple Passwörter, Google Authenticator, Microsoft Authenticator) und gib dann den angezeigten Code ein.</p>
          <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row">
            <img src={enroll.qr} alt="QR-Code für die Authenticator-App" className="size-44 rounded-xl border bg-card p-2" />
            <div className="space-y-1 text-sm">
              <p className="text-muted-foreground">Oder diesen Schlüssel eintippen:</p>
              <p className="select-all break-all font-mono">{enroll.secret}</p>
            </div>
          </div>
          {codeField(factorId)}
        </>
      ) : (
        <>
          <p className="text-sm">Für IT/Technik ist die Zwei-Faktor-Anmeldung Pflicht. Ohne sie bleibt der Support-Bereich gesperrt.</p>
          <Button className="mt-4 min-h-11" onClick={() => start.mutate()} disabled={start.isPending}>Jetzt einrichten</Button>
        </>
      )}
    </Panel>
  );
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

function SessionBanner({ s }: { s: ActiveSession }) {
  const client = useQueryClient();
  const now = useNow();
  const left = new Date(s.laeuft_ab_am).getTime() - now;
  useEffect(() => { if (left <= 0) void client.invalidateQueries({ queryKey: ["support"] }); }, [left <= 0, client]); // eslint-disable-line react-hooks/exhaustive-deps
  const end = useMutation({
    mutationFn: () => endSession(s.id),
    onSuccess: async () => { toast.success("Sitzung beendet"); await client.invalidateQueries({ queryKey: ["support"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rights = s.scopes.length ? s.scopes.map(scopeLabel).join(", ") : "nur lesen";
  return (
    <div role="status" className="sticky top-2 z-20 flex flex-col gap-3 rounded-2xl border-2 border-primary bg-primary/10 p-4 shadow-sm backdrop-blur sm:flex-row sm:items-center">
      <ShieldCheck className="hidden size-6 shrink-0 text-primary sm:block" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">Support-Sitzung für <span className="font-mono">{s.ref}</span></p>
        <p className="text-muted-foreground">Rechte: Lesen{s.scopes.length ? `, ${rights}` : ""} · {s.methode === "ticket" ? "per Ticket" : "nach Identitätsprüfung"} · läuft ab in <span className="font-mono font-semibold text-foreground">{remainingLabel(s.laeuft_ab_am, now)}</span></p>
      </div>
      <Button variant="outline" className="min-h-10" onClick={() => end.mutate()} disabled={end.isPending}><LogOut className="size-4" aria-hidden /> Sitzung beenden</Button>
    </div>
  );
}

function Console({ codeLocked }: { codeLocked: boolean }) {
  const session = useQuery({ queryKey: ["support", "active"], queryFn: getActiveSession, refetchInterval: 30_000 });
  const [tab, setTab] = useState("verifizieren");
  const active = session.data ?? null;
  useEffect(() => { if (active) setTab("sitzung"); }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-4">
      {active && <SessionBanner s={active} />}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="verifizieren">Verifizieren</TabsTrigger>
          <TabsTrigger value="liste">Pseudonyme Liste</TabsTrigger>
          <TabsTrigger value="sitzung">Aktive Sitzung</TabsTrigger>
          <TabsTrigger value="verlauf">Meine Sitzungen</TabsTrigger>
        </TabsList>
        <TabsContent value="verifizieren" className="space-y-4">
          <RedeemPanel locked={codeLocked} />
          <IdentityPanel />
        </TabsContent>
        <TabsContent value="liste"><DirectoryPanel /></TabsContent>
        <TabsContent value="sitzung">
          {active ? <PersonPanel session={active} /> : <EmptyState icon={UserSearch} title="Keine aktive Sitzung" description="Löse einen Ticket-Code ein oder prüfe die Identität der Person." />}
        </TabsContent>
        <TabsContent value="verlauf"><HistoryPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function RedeemPanel({ locked }: { locked: boolean }) {
  const client = useQueryClient();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => redeemCode(code),
    onSuccess: async (r) => {
      if (!r.ok) { setError(r.error ?? "Code ungültig oder abgelaufen."); await client.invalidateQueries({ queryKey: ["support", "status"] }); return; }
      setError(null); setCode(""); toast.success("Sitzung gestartet");
      await client.invalidateQueries({ queryKey: ["support"] });
    },
    onError: (e: Error) => setError(e.message),
  });
  return (
    <Panel title="Ticket-Code einlösen" icon={KeyRound}>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Input value={code} onChange={(e) => setCode(formatTicketCode(e.target.value).slice(0, 19))} placeholder="ABCD-EFGH-JKLM-NPQR" autoComplete="off" spellCheck={false}
          aria-label="Ticket-Code" className="h-11 font-mono text-lg uppercase tracking-widest sm:max-w-72" disabled={locked} />
        <Button type="submit" className="h-11" disabled={locked || !isValidTicketCode(code) || m.isPending}>Einlösen</Button>
      </form>
      {locked && <p role="alert" className="mt-2 text-sm text-destructive">Zu viele falsche Codes. Bitte warte 30 Minuten.</p>}
      {error && !locked && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      <p className="mt-2 text-xs text-muted-foreground">Die Person erstellt den Code unter „Hilfe & Support“. Du erhältst genau die Rechte, die sie erlaubt hat.</p>
    </Panel>
  );
}

const EMPTY_ID = { vorname: "", nachname: "", geburtsdatum: "", email: "", telefon: "", grund: "" };

function IdentityPanel() {
  const client = useQueryClient();
  const [f, setF] = useState(EMPTY_ID);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY_ID) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const m = useMutation({
    mutationFn: () => verifyIdentity(f),
    onSuccess: async (r) => {
      if (!r.ok) { setError(r.error ?? "Angaben stimmen nicht überein."); return; }
      setError(null); setF(EMPTY_ID); toast.success("Identität bestätigt – Sitzung für 30 Minuten gestartet");
      await client.invalidateQueries({ queryKey: ["support"] });
    },
    onError: (e: Error) => setError(e.message),
  });
  const ready = f.vorname.trim() && f.nachname.trim() && f.geburtsdatum && f.email.trim() && f.grund.trim().length >= 5;
  return (
    <Panel title="Identität manuell prüfen" icon={UserSearch}>
      <p className="mb-4 text-sm text-muted-foreground">Für Anrufe oder E-Mails ohne Ticket. Frage die Angaben bei der Person ab – lies sie ihr nie vor.</p>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <div className="space-y-1.5"><Label htmlFor="id-vn">Vorname</Label><Input id="id-vn" autoComplete="off" value={f.vorname} onChange={set("vorname")} className="h-11" /></div>
        <div className="space-y-1.5"><Label htmlFor="id-nn">Nachname</Label><Input id="id-nn" autoComplete="off" value={f.nachname} onChange={set("nachname")} className="h-11" /></div>
        <div className="space-y-1.5"><Label htmlFor="id-gd">Geburtsdatum</Label><Input id="id-gd" type="date" value={f.geburtsdatum} onChange={set("geburtsdatum")} className="h-11" /></div>
        <div className="space-y-1.5"><Label htmlFor="id-em">E-Mail-Adresse</Label><Input id="id-em" type="email" autoComplete="off" value={f.email} onChange={set("email")} className="h-11" /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="id-tel">Telefonnummer (optional)</Label><Input id="id-tel" type="tel" autoComplete="off" value={f.telefon} onChange={set("telefon")} className="h-11 sm:max-w-sm" /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="id-grund">Grund / Anliegen</Label><Textarea id="id-grund" required minLength={5} maxLength={500} value={f.grund} onChange={set("grund")} /></div>
        <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center">
          <Button type="submit" className="min-h-11" disabled={!ready || m.isPending}>Identität prüfen</Button>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      </form>
      <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />Nach 3 Fehlversuchen ist die Prüfung für diese Person 24 Stunden gesperrt – dann hilft nur ein Ticket. Die Person wird über jeden Versuch informiert. E-Mail-Änderungen sind nach dieser Prüfung nicht möglich.</p>
    </Panel>
  );
}

function DirectoryPanel() {
  const dir = useQuery({ queryKey: ["support", "directory"], queryFn: getDirectory });
  const [q, setQ] = useState("");
  if (dir.isLoading || !dir.data) return <ListSkeleton rows={4} />;
  const list = dir.data.filter((r) => !q.trim() || r.ref.includes(q.trim().toUpperCase()));
  return (
    <Panel title="Pseudonyme Liste" icon={LifeBuoy}>
      <p className="mb-3 text-sm text-muted-foreground">Ohne bestätigte Identität siehst du nur Support-ID, Rolle, Registrierung und Status – keine Namen und keine Inhalte.</p>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Support-ID suchen …" aria-label="Support-ID suchen" className="mb-3 h-10 font-mono sm:max-w-xs" />
      <ul className="divide-y">
        {list.slice(0, 300).map((r) => (
          <li key={r.ref} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
            <span className="w-28 font-mono font-medium">{r.ref}</span>
            <Badge variant="secondary">{r.role ? ROLE_LABELS[r.role] : "—"}</Badge>
            <span className="text-muted-foreground">seit {dDe(r.registriert_am)}</span>
            <Badge variant={r.status === "aktiv" ? "outline" : "secondary"}>{r.status}</Badge>
            {r.sitzung_aktiv && <Badge className="ml-auto">Sitzung aktiv</Badge>}
          </li>
        ))}
      </ul>
      {list.length === 0 && <p className="text-sm text-muted-foreground">Keine Treffer.</p>}
    </Panel>
  );
}

function HistoryPanel() {
  const h = useQuery({ queryKey: ["support", "history"], queryFn: listMySessions });
  if (h.isLoading || !h.data) return <ListSkeleton rows={3} />;
  return (
    <Panel title="Meine Sitzungen" icon={Clock}>
      {h.data.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Sitzungen.</p> : (
        <ul className="divide-y">
          {h.data.map((s) => {
            const open = !s.beendet_am && new Date(s.laeuft_ab_am).getTime() > Date.now();
            return (
              <li key={s.id} className="space-y-1 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-medium">{s.ref ?? "—"}</span>
                  <Badge variant="secondary">{s.methode === "ticket" ? "Ticket" : "Identitätsprüfung"}</Badge>
                  <Badge variant={open ? "default" : "outline"}>{open ? "aktiv" : s.beendet_am ? "beendet" : "abgelaufen"}</Badge>
                </div>
                <p className="text-muted-foreground">{dtDe(s.gestartet_am)} – {dtDe(s.beendet_am ?? s.laeuft_ab_am)} · {s.scopes.length ? s.scopes.map(scopeLabel).join(", ") : "nur lesen"}</p>
                {s.grund && <p className="text-muted-foreground">Grund: {s.grund}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

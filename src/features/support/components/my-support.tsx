import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, LifeBuoy, ShieldCheck, Ticket } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog, ResponsiveDialog } from "@/components/dialogs";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/shared";
import { copyText } from "@/lib/platform";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";
import { createTicket, getMyRef, listMyAccessLog, listMyTickets, revokeTicket, type MyTicket } from "../api";
import { ALWAYS_BLOCKED, formatTicketCode, generateTicketCode, scopeLabel, SUPPORT_SCOPES, TICKET_DURATIONS, type SupportScope } from "../scopes";

const dtDe = (iso: string) => new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  offen: { label: "Offen", variant: "default" },
  eingeloest: { label: "Eingelöst", variant: "default" },
  geschlossen: { label: "Geschlossen", variant: "secondary" },
  abgelaufen: { label: "Abgelaufen", variant: "secondary" },
  widerrufen: { label: "Beendet", variant: "outline" },
};

const AKTION: Record<string, string> = {
  lesen: "hat deine Daten angesehen",
  aendern: "hat Daten geändert",
  loeschen: "hat etwas gelöscht",
  sitzung_start: "hat eine Support-Sitzung gestartet",
  sitzung_ende: "Support-Sitzung beendet",
};
const TABELLE: Record<string, string> = {
  uebersicht: "Übersicht", profiles: "Profil", reports: "Bericht", report_attachments: "Anhang", experience_attachments: "Anhang",
  leittext_attachments: "Anhang", access_grants: "Zugriff", auth: "Anmeldung", support_tickets: "Ticket", support_sessions: "Sitzung",
};

function Section({ title, icon: Icon, children, action }: { title: string; icon: typeof Ticket; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon className="size-5 text-primary" aria-hidden />{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function MySupportPage() {
  const online = useOnline();
  const ref = useQuery({ queryKey: ["support", "my-ref"], queryFn: getMyRef, enabled: online, staleTime: Infinity });
  const tickets = useQuery({ queryKey: ["support", "my-tickets"], queryFn: listMyTickets, enabled: online });
  const log = useQuery({ queryKey: ["support", "my-log"], queryFn: listMyAccessLog, enabled: online });
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6 pb-16">
      <PageHeader title="Hilfe & Support" subtitle="Hier gibst du dem Azuvera-Support gezielt und zeitlich begrenzt Zugriff auf dein Konto." />
      {!online ? <EmptyState title={OFFLINE_ACTION_HINT} /> : (
        <>
          <Section title="Deine Support-ID" icon={LifeBuoy}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <p className="font-mono text-2xl font-semibold tracking-wider">{ref.data ?? "…"}</p>
              {ref.data && (
                <Button variant="outline" size="sm" className="min-h-10 w-fit" onClick={() => void copyText(ref.data!).then(() => toast.success("Support-ID kopiert"))}>
                  <Copy className="size-4" aria-hidden /> Kopieren
                </Button>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Nenne diese ID, wenn du dich beim Support meldest. Sie verrät nichts über dich. Wir fragen nie nach deinem Passwort.</p>
          </Section>

          <Section title="Support-Tickets" icon={Ticket} action={<Button className="min-h-10" onClick={() => setCreating(true)}>Ticket erstellen</Button>}>
            {tickets.isLoading ? <ListSkeleton rows={2} /> : !tickets.data?.length ? (
              <p className="text-sm text-muted-foreground">Noch keine Tickets. Erstelle eines, wenn der Support dir helfen soll – du entscheidest, was er ändern darf.</p>
            ) : <TicketList tickets={tickets.data} />}
          </Section>

          <Section title="Zugriffsprotokoll" icon={ShieldCheck}>
            <p className="mb-3 text-sm text-muted-foreground">Wer vom Support wann etwas gesehen oder geändert hat. Das Protokoll kann niemand verändern.</p>
            {log.isLoading ? <ListSkeleton rows={2} /> : !log.data?.length ? (
              <p className="text-sm text-muted-foreground">Der Support hat bisher nicht auf dein Konto zugegriffen.</p>
            ) : (
              <ul className="divide-y">
                {log.data.map((e) => (
                  <li key={e.id} className="flex flex-col gap-1 py-2.5 text-sm sm:flex-row sm:items-baseline sm:gap-3">
                    <span className="shrink-0 tabular-nums text-muted-foreground">{dtDe(e.erstellt_am)}</span>
                    <span>
                      <span className="font-medium">{e.agent_name}</span> {AKTION[e.aktion] ?? e.aktion}
                      {e.tabelle && e.aktion !== "sitzung_start" && e.aktion !== "sitzung_ende" ? ` · ${TABELLE[e.tabelle] ?? e.tabelle}` : ""}
                      {e.geaenderte_felder.length > 0 ? ` (${e.geaenderte_felder.join(", ")})` : ""}
                      {e.methode && e.aktion === "sitzung_start" ? ` · ${e.methode === "ticket" ? "per Ticket" : "nach Identitätsprüfung"}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Das darf der Support nie" icon={KeyRound}>
            <ul className="list-disc space-y-1 pl-5 text-sm">{ALWAYS_BLOCKED.map((b) => <li key={b}>{b}</li>)}</ul>
            <p className="mt-3 text-sm text-muted-foreground">Konto löschen oder Passwort ändern machst du selbst unter Mein Profil.</p>
          </Section>
        </>
      )}
      {creating && <CreateTicketDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function TicketList({ tickets }: { tickets: MyTicket[] }) {
  const client = useQueryClient();
  const [revoking, setRevoking] = useState<MyTicket | null>(null);
  const revoke = useMutation({
    mutationFn: revokeTicket,
    onSuccess: async () => { toast.success("Zugriff beendet"); await client.invalidateQueries({ queryKey: ["support"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <ul className="space-y-3">
        {tickets.map((t) => {
          const st = STATUS[t.status] ?? { label: t.status, variant: "secondary" as const };
          const active = t.status === "offen" || t.status === "eingeloest";
          return (
            <li key={t.id} className="space-y-2 rounded-xl border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{t.betreff}</p>
                <Badge variant={st.variant}>{st.label}</Badge>
                {t.sitzung_aktiv && <Badge variant="outline" className="border-primary text-primary">Support arbeitet gerade</Badge>}
              </div>
              {t.beschreibung && <p className="text-sm text-muted-foreground">{t.beschreibung}</p>}
              <p className="text-xs text-muted-foreground">Erstellt {dtDe(t.erstellt_am)} · gültig bis {dtDe(t.gueltig_bis)}</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">Lesen</Badge>
                {t.scopes.map((s) => <Badge key={s} variant="secondary">{scopeLabel(s)}</Badge>)}
              </div>
              {active && (
                <Button variant="outline" size="sm" className="min-h-10 text-destructive" onClick={() => setRevoking(t)}>Zugriff sofort beenden</Button>
              )}
            </li>
          );
        })}
      </ul>
      <ConfirmDialog open={!!revoking} onOpenChange={(o) => !o && setRevoking(null)} destructive title="Zugriff sofort beenden?" confirmLabel="Beenden"
        description="Der Code wird ungültig und eine laufende Support-Sitzung endet sofort."
        onConfirm={() => { if (revoking) revoke.mutate(revoking.id); setRevoking(null); }} />
    </>
  );
}

function CreateTicketDialog({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const [betreff, setBetreff] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [hours, setHours] = useState("24");
  const [scopes, setScopes] = useState<SupportScope[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: async () => {
      const c = generateTicketCode();
      await createTicket({ betreff: betreff.trim(), beschreibung: beschreibung.trim(), scopes, hours: Number(hours), code: c });
      return c;
    },
    onSuccess: async (c) => { setCode(c); await client.invalidateQueries({ queryKey: ["support", "my-tickets"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = (k: SupportScope, on: boolean) => setScopes((s) => (on ? [...s, k] : s.filter((x) => x !== k)));

  if (code) {
    const formatted = formatTicketCode(code);
    return (
      <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title="Dein Support-Code" description="Dieser Code wird nur jetzt angezeigt. Danach ist er nicht mehr abrufbar.">
        <div className="space-y-4">
          <p className="select-all rounded-xl border-2 border-primary/40 bg-muted/50 p-4 text-center font-mono text-2xl font-bold tracking-widest sm:text-3xl" aria-label="Support-Code">{formatted}</p>
          <Button className="min-h-11 w-full" onClick={() => void copyText(formatted).then(() => toast.success("Code kopiert"))}><Copy className="size-4" aria-hidden /> Code kopieren</Button>
          <p className="rounded-xl bg-muted p-3 text-sm font-medium">Gib den Code nur dem Azuvera-Support. Wir fragen nie nach deinem Passwort.</p>
          <Button variant="outline" className="min-h-11 w-full" onClick={onClose}>Fertig</Button>
        </div>
      </ResponsiveDialog>
    );
  }

  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title="Support-Ticket erstellen" description="Mit dem Code kann der Support alle deine Daten lesen. Ändern darf er nur, was du unten erlaubst.">
      <form className="max-h-[70vh] space-y-4 overflow-y-auto pr-1" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <div className="space-y-1.5">
          <Label htmlFor="t-betreff">Betreff</Label>
          <Input id="t-betreff" required minLength={3} maxLength={120} value={betreff} onChange={(e) => setBetreff(e.target.value)} placeholder="z. B. Bericht lässt sich nicht speichern" className="h-11 text-base" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-text">Beschreibung (optional)</Label>
          <Textarea id="t-text" maxLength={2000} value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Gültigkeit</Label>
          <Select value={hours} onValueChange={setHours}>
            <SelectTrigger className="h-11" aria-label="Gültigkeit"><SelectValue /></SelectTrigger>
            <SelectContent>{TICKET_DURATIONS.map((d) => <SelectItem key={d.hours} value={String(d.hours)}>{d.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Das darf der Support ändern</legend>
          {SUPPORT_SCOPES.map((s) => (
            <label key={s.key} className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 hover:bg-muted/40">
              <Checkbox className="mt-0.5" checked={scopes.includes(s.key)} onCheckedChange={(v) => toggle(s.key, v === true)} aria-label={s.label} />
              <span><span className="block text-sm font-medium">{s.label}</span><span className="block text-xs text-muted-foreground">{s.hint}</span></span>
            </label>
          ))}
          <p className="text-xs text-muted-foreground">Ohne Haken darf der Support nur lesen. Brauchst du später mehr, erstellst du ein neues Ticket.</p>
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" disabled={create.isPending || betreff.trim().length < 3}>Ticket erstellen</Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}

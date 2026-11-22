import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, FileText, GraduationCap, KeyRound, Mail, Paperclip, Pencil, Trash2, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog, ResponsiveDialog } from "@/components/dialogs";
import { ListSkeleton } from "@/components/shared";
import { ROLE_LABELS } from "@/features/app/session";
import {
  deleteAttachment, deleteReport, getPersonView, revokeAccess, supportAction, updateProfile, updateReport, updateTraining,
  type ActiveSession, type PersonAttachment, type PersonReport, type PersonView,
} from "../api";
import type { SupportScope } from "../scopes";

const NO_RIGHT = "Dafür hat die Person keine Freigabe erteilt. Neues Ticket nötig.";
const dDe = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }) : "—";
const STATUS_DE: Record<string, string> = { draft: "Entwurf", submitted: "Eingereicht", approved: "Freigegeben", rejected: "Zurückgewiesen" };
const editable = (status: string) => status === "draft" || status === "rejected";

function Block({ title, icon: Icon, children, action }: { title: string; icon: typeof FileText; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><Icon className="size-4 text-primary" aria-hidden />{title}</h3>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Knopf, der ohne Freigabe deaktiviert bleibt und den Grund nennt. */
function Guarded({ allowed, reason = NO_RIGHT, children, ...props }: { allowed: boolean; reason?: string; children: ReactNode } & React.ComponentProps<typeof Button>) {
  if (allowed) return <Button {...props}>{children}</Button>;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} role="note" aria-label={reason} title={reason} className="inline-flex cursor-not-allowed" onClick={() => toast.info(reason)}>
            <Button {...props} disabled aria-disabled className={`${props.className ?? ""} pointer-events-none`}>{children}</Button>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">{reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return <div className="grid grid-cols-[9rem_1fr] gap-2 py-1 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="break-words">{value || "—"}</dd></div>;
}

export function PersonPanel({ session }: { session: ActiveSession }) {
  const ziel = session.ziel_user_id;
  const q = useQuery({ queryKey: ["support", "person", ziel], queryFn: () => getPersonView(ziel), staleTime: 60_000 });
  const can = (s: SupportScope) => session.schreiben_erlaubt && session.scopes.includes(s) && (s !== "email_aendern" || session.methode === "ticket");
  if (q.isLoading) return <ListSkeleton rows={4} />;
  if (q.error || !q.data) return <p role="alert" className="text-sm text-destructive">{(q.error as Error | null)?.message ?? "Die Daten konnten nicht geladen werden."}</p>;
  return <PersonDetails v={q.data} ziel={ziel} can={can} session={session} />;
}

function PersonDetails({ v, ziel, can, session }: { v: PersonView; ziel: string; can: (s: SupportScope) => boolean; session: ActiveSession }) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["support", "person", ziel] });
  const [editProfile, setEditProfile] = useState(false);
  const [editTraining, setEditTraining] = useState(false);
  const [editRep, setEditRep] = useState<PersonReport | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; description: string; run: () => Promise<void> } | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const p = v.profile;

  const run = useMutation({
    mutationFn: (fn: () => Promise<void>) => fn(),
    onSuccess: async () => { toast.success("Erledigt"); await refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const reset = useMutation({
    mutationFn: () => supportAction(ziel, "password_reset"),
    onSuccess: () => toast.success("Die Person bekommt eine E-Mail zum Zurücksetzen ihres Passworts."),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Block title="Stammdaten" icon={UserRound} action={
        <Guarded allowed={can("profil_bearbeiten")} variant="outline" size="sm" className="min-h-9" onClick={() => setEditProfile(true)}><Pencil className="size-4" aria-hidden /> Bearbeiten</Guarded>
      }>
        <dl>
          <Row label="Support-ID" value={<span className="font-mono">{v.ref}</span>} />
          <Row label="Rolle" value={v.role ? ROLE_LABELS[v.role] : "—"} />
          <Row label="Name" value={`${p["vorname"] ?? ""} ${p["nachname"] ?? ""}`.trim()} />
          <Row label="E-Mail" value={p["email"]} />
          <Row label="Telefon" value={p["telefon"]} />
          <Row label="Geburtsdatum" value={dDe(p["geburtsdatum"] ?? null)} />
          <Row label="Anschrift" value={[p["strasse"], [p["plz"], p["ort"]].filter(Boolean).join(" "), p["land"]].filter(Boolean).join(", ")} />
          <Row label="Organisation" value={p["organization"]} />
          <Row label="Registriert" value={dDe(p["created_at"] ?? null)} />
        </dl>
      </Block>

      <Block title="Anmeldung" icon={KeyRound}>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="min-h-9" disabled={reset.isPending}
            onClick={() => setConfirm({ title: "Passwort-Reset-Mail senden?", description: "Die Person bekommt eine E-Mail und setzt ihr Passwort selbst neu. Das Passwort siehst du nie.", run: async () => reset.mutate() })}>
            Passwort-Reset-Mail senden
          </Button>
          <Guarded allowed={can("email_aendern")} reason={session.methode === "ticket" ? NO_RIGHT : "E-Mail-Änderungen gibt es nur über ein Ticket mit dieser Freigabe."}
            variant="outline" size="sm" className="min-h-9" onClick={() => setEmailOpen(true)}><Mail className="size-4" aria-hidden /> E-Mail ändern</Guarded>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Gesperrt: Passwort sehen oder setzen, als die Person anmelden, Konto löschen, Rollen, Lizenzen.</p>
      </Block>

      <Block title="Ausbildung" icon={GraduationCap} action={
        <Guarded allowed={can("ausbildung_bearbeiten")} variant="outline" size="sm" className="min-h-9" onClick={() => setEditTraining(true)}><Pencil className="size-4" aria-hidden /> Bearbeiten</Guarded>
      }>
        <dl>
          <Row label="Beruf" value={v.training?.profession_name} />
          <Row label="Betrieb" value={v.training?.company_name} />
          <Row label="Zeitraum" value={`${dDe(v.training?.ausbildungsbeginn ?? null)} – ${dDe(v.training?.ausbildungsende ?? null)}`} />
          <Row label="Bundesland" value={v.bundeslaender.find((b) => b.code === v.training?.bundesland)?.name ?? v.training?.bundesland} />
          <Row label="Ausbildungsplan" value={v.training?.plan_title} />
          <Row label="Weitere Daten" value={`${v.counts.absences} Abwesenheiten · ${v.counts.grades} Noten · ${v.counts.instructions} Unterweisungen · ${v.experience.length} Erfahrungsberichte · ${v.leittexte.length} Leittexte`} />
        </dl>
      </Block>

      <Block title={`Berichte (${v.reports.length})`} icon={FileText}>
        {v.reports.length === 0 ? <p className="text-sm text-muted-foreground">Keine Berichte.</p> : (
          <ul className="divide-y">
            {v.reports.slice(0, 100).map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{r.report_type === "weekly" ? `KW ${r.week_number ?? "?"}/${r.year ?? ""}` : dDe(r.report_date)} <Badge variant="secondary" className="ml-1">{STATUS_DE[r.status] ?? r.status}</Badge></p>
                  <p className="line-clamp-2 text-muted-foreground">{r.activities || r.summary || "Ohne Text"}</p>
                </div>
                <div className="flex gap-2">
                  <Guarded allowed={can("berichte_bearbeiten") && editable(r.status)} reason={!can("berichte_bearbeiten") ? NO_RIGHT : "Nur Entwürfe und zurückgewiesene Berichte lassen sich ändern."}
                    variant="outline" size="sm" className="min-h-9" onClick={() => setEditRep(r)} aria-label="Bericht bearbeiten"><Pencil className="size-4" aria-hidden /></Guarded>
                  <Guarded allowed={can("berichte_loeschen") && editable(r.status)} reason={!can("berichte_loeschen") ? NO_RIGHT : "Nur Entwürfe und zurückgewiesene Berichte lassen sich löschen."}
                    variant="outline" size="sm" className="min-h-9 text-destructive" aria-label="Bericht löschen"
                    onClick={() => setConfirm({ title: "Bericht löschen?", description: "Der Bericht und seine Anhänge werden endgültig gelöscht. Die Person wird im Protokoll darüber informiert.", run: () => deleteReport(ziel, r.id) })}>
                    <Trash2 className="size-4" aria-hidden />
                  </Guarded>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title={`Anhänge (${v.attachments.length})`} icon={Paperclip}>
        {v.attachments.length === 0 ? <p className="text-sm text-muted-foreground">Keine Anhänge.</p> : (
          <ul className="divide-y">
            {v.attachments.map((a: PersonAttachment) => (
              <li key={a.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{a.file_name} <span className="text-muted-foreground">· {a.kind === "report" ? "Bericht" : a.kind === "experience" ? "Erfahrungsbericht" : "Leittext"} · {Math.round(a.size_bytes / 1024)} KB</span></span>
                <Guarded allowed={can("anhaenge_verwalten") && editable(a.parent_status)} reason={!can("anhaenge_verwalten") ? NO_RIGHT : "Anhänge eingereichter Einträge bleiben unverändert."}
                  variant="outline" size="sm" className="min-h-9 text-destructive" aria-label="Anhang löschen"
                  onClick={() => setConfirm({ title: "Anhang löschen?", description: `„${a.file_name}“ wird endgültig gelöscht.`, run: () => deleteAttachment(ziel, a.kind, a.id) })}>
                  <Trash2 className="size-4" aria-hidden />
                </Guarded>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Zugriffe und Team" icon={Users}>
        {v.grants.length === 0 ? <p className="text-sm text-muted-foreground">Keine Zugriffe.</p> : (
          <ul className="divide-y">
            {v.grants.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <Badge variant="secondary">{ROLE_LABELS[g.role]}</Badge>
                <span>{g.direction === "erteilt" ? "Zugriff für" : "Zugriff auf"} <span className="font-mono">{g.other_ref ?? "—"}</span></span>
                <span className="text-muted-foreground">seit {dDe(g.created_at)}{g.revoked_at ? ` · beendet ${dDe(g.revoked_at)}` : ""}</span>
                {!g.revoked_at && (
                  <Guarded allowed={can("team_verwalten")} variant="outline" size="sm" className="ml-auto min-h-9"
                    onClick={() => setConfirm({ title: "Zugriff beenden?", description: "Die andere Person verliert sofort den Zugriff und wird benachrichtigt.", run: () => revokeAccess(ziel, g.id) })}>
                    Beenden
                  </Guarded>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Andere Personen erscheinen nur mit ihrer Support-ID.</p>
      </Block>

      <Block title="Erfahrungsberichte und Leittexte" icon={BookOpen}>
        <ul className="space-y-1 text-sm">
          {v.experience.map((e) => <li key={e.id}>{e.title} <span className="text-muted-foreground">· {STATUS_DE[e.status] ?? e.status} · {dDe(e.written_on)}</span></li>)}
          {v.leittexte.map((l) => <li key={l.id}>{l.title} <span className="text-muted-foreground">· {STATUS_DE[l.status] ?? l.status}</span></li>)}
          {v.experience.length + v.leittexte.length === 0 && <li className="text-muted-foreground">Keine Einträge.</li>}
        </ul>
      </Block>

      {editProfile && <ProfileDialog v={v} onClose={() => setEditProfile(false)} onSave={(f) => run.mutate(() => updateProfile(ziel, f))} />}
      {editTraining && <TrainingDialog v={v} onClose={() => setEditTraining(false)} onSave={(f) => run.mutate(() => updateTraining(ziel, f))} />}
      {editRep && <ReportDialog r={editRep} onClose={() => setEditRep(null)} onSave={(f) => run.mutate(() => updateReport(ziel, editRep.id, f))} />}
      {emailOpen && <EmailDialog current={p["email"] ?? ""} onClose={() => setEmailOpen(false)} onSave={(email) => run.mutate(() => supportAction(ziel, "email_change", email))} />}
      <ConfirmDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} destructive={!!confirm && (confirm.title.includes("löschen") || confirm.title.includes("beenden"))}
        title={confirm?.title ?? ""} description={confirm?.description ?? ""} confirmLabel="Ja, ausführen"
        onConfirm={() => { if (confirm) run.mutate(confirm.run); setConfirm(null); }} />
    </div>
  );
}

const PROFILE_FIELDS: [string, string, string?][] = [
  ["vorname", "Vorname"], ["nachname", "Nachname"], ["telefon", "Telefon", "tel"], ["geburtsdatum", "Geburtsdatum", "date"],
  ["strasse", "Straße"], ["plz", "PLZ"], ["ort", "Ort"], ["land", "Land"], ["notfallkontakt_name", "Notfallkontakt"],
  ["notfallkontakt_telefon", "Notfallkontakt Telefon", "tel"], ["personalnummer", "Personalnummer"], ["organization", "Organisation"],
];

function ProfileDialog({ v, onClose, onSave }: { v: PersonView; onClose: () => void; onSave: (f: Record<string, string | null>) => void }) {
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(PROFILE_FIELDS.map(([k]) => [k, v.profile[k] ?? ""])));
  const changed = () => Object.fromEntries(Object.entries(f).filter(([k, val]) => (v.profile[k] ?? "") !== val));
  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title="Stammdaten bearbeiten">
      <form className="grid max-h-[65vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); onSave(changed()); onClose(); }}>
        {PROFILE_FIELDS.map(([k, label, type]) => (
          <div key={k} className="space-y-1"><Label htmlFor={`sp-${k}`}>{label}</Label>
            <Input id={`sp-${k}`} type={type ?? "text"} value={f[k] ?? ""} onChange={(e) => setF((s) => ({ ...s, [k]: e.target.value }))} className="h-10" /></div>
        ))}
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={onClose}>Abbrechen</Button><Button type="submit">Speichern</Button></div>
      </form>
    </ResponsiveDialog>
  );
}

function TrainingDialog({ v, onClose, onSave }: { v: PersonView; onClose: () => void; onSave: (f: Record<string, string | null>) => void }) {
  const t = v.training;
  const [f, setF] = useState({ profession_id: t?.profession_id ?? "", company_id: t?.company_id ?? "", ausbildungsbeginn: t?.ausbildungsbeginn ?? "", ausbildungsende: t?.ausbildungsende ?? "", bundesland: t?.bundesland ?? "" });
  const orig: Record<string, string> = { profession_id: t?.profession_id ?? "", company_id: t?.company_id ?? "", ausbildungsbeginn: t?.ausbildungsbeginn ?? "", ausbildungsende: t?.ausbildungsende ?? "", bundesland: t?.bundesland ?? "" };
  const sel = (k: "profession_id" | "company_id" | "bundesland", label: string, opts: { value: string; label: string }[]) => (
    <div className="space-y-1"><Label>{label}</Label>
      <Select value={f[k] || "none"} onValueChange={(val) => setF((s) => ({ ...s, [k]: val === "none" ? "" : val }))}>
        <SelectTrigger className="h-10" aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="none">— keine Angabe —</SelectItem>{opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select></div>
  );
  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title="Ausbildung bearbeiten" description="Ändert sich der Beruf, wird der passende Ausbildungsplan neu zugeordnet.">
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); onSave(Object.fromEntries(Object.entries(f).filter(([k, val]) => orig[k] !== val))); onClose(); }}>
        {sel("profession_id", "Beruf", v.professions.map((p) => ({ value: p.id, label: p.name })))}
        {sel("company_id", "Betrieb", v.companies.map((c) => ({ value: c.id, label: c.name })))}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label htmlFor="st-b">Beginn</Label><Input id="st-b" type="date" value={f.ausbildungsbeginn} onChange={(e) => setF((s) => ({ ...s, ausbildungsbeginn: e.target.value }))} className="h-10" /></div>
          <div className="space-y-1"><Label htmlFor="st-e">Ende</Label><Input id="st-e" type="date" value={f.ausbildungsende} onChange={(e) => setF((s) => ({ ...s, ausbildungsende: e.target.value }))} className="h-10" /></div>
        </div>
        {sel("bundesland", "Bundesland", v.bundeslaender.map((b) => ({ value: b.code, label: b.name })))}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Abbrechen</Button><Button type="submit">Speichern</Button></div>
      </form>
    </ResponsiveDialog>
  );
}

const REPORT_FIELDS: [keyof PersonReport & string, string][] = [["activities", "Betriebliche Tätigkeiten"], ["school_content", "Berufsschule"], ["instructions", "Unterweisungen"], ["summary", "Zusammenfassung"]];

function ReportDialog({ r, onClose, onSave }: { r: PersonReport; onClose: () => void; onSave: (f: Record<string, string>) => void }) {
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(REPORT_FIELDS.map(([k]) => [k, (r[k] as string | null) ?? ""])));
  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title="Bericht bearbeiten" description="Die Person sieht die Änderung beim nächsten Abgleich.">
      <form className="max-h-[65vh] space-y-3 overflow-y-auto pr-1" onSubmit={(e) => { e.preventDefault(); onSave(Object.fromEntries(Object.entries(f).filter(([k, val]) => ((r[k as keyof PersonReport] as string | null) ?? "") !== val))); onClose(); }}>
        {REPORT_FIELDS.map(([k, label]) => (
          <div key={k} className="space-y-1"><Label htmlFor={`sr-${k}`}>{label}</Label>
            <Textarea id={`sr-${k}`} rows={3} value={f[k] ?? ""} onChange={(e) => setF((s) => ({ ...s, [k]: e.target.value }))} /></div>
        ))}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Abbrechen</Button><Button type="submit">Speichern</Button></div>
      </form>
    </ResponsiveDialog>
  );
}

function EmailDialog({ current, onClose, onSave }: { current: string; onClose: () => void; onSave: (email: string) => void }) {
  const [email, setEmail] = useState("");
  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title="E-Mail-Adresse ändern" description={`Bisher: ${current}. Beide Adressen bekommen eine Bestätigungs-E-Mail; erst danach gilt die neue Adresse.`}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSave(email.trim()); onClose(); }}>
        <div className="space-y-1"><Label htmlFor="se-new">Neue E-Mail-Adresse</Label><Input id="se-new" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" /></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={!email.includes("@")}>Bestätigung senden</Button></div>
      </form>
    </ResponsiveDialog>
  );
}

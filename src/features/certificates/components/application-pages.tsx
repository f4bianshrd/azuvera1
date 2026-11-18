import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, FileDown, FilePlus2, Loader2, RotateCcw, Save, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog, ResponsiveDialog } from "@/components/dialogs";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";
import { saveFile } from "@/lib/platform";
import { berlinDateTime } from "@/features/export/pdf/text";
import {
  applicationDefaults, azubiName, canReviewFor, confirmApplication, deleteApplication, listApplications, personName, returnApplication,
  saveApplication, submitApplication, type ExamApplication,
} from "../api";
import { APPLICATION_FIELDS, APPLICATION_REQUIRED, APPLICATION_STATUS_LABEL, examTermOptions, fieldLabel, missingApplicationFields, type Values } from "../model";
import { AzubiPicker } from "./certificate-pages";
import { FieldsForm, FieldsView } from "./fields-form";

async function downloadApplication(a: ExamApplication, name: string) {
  const [{ buildApplicationPdf, applicationFileName }, confirmerName] = await Promise.all([
    import("@/features/export/pdf/certificate"), a.status === "confirmed" ? personName(a.confirmer_id) : Promise.resolve(null),
  ]);
  const bytes = await buildApplicationPdf({ application: a, azubiName: name, confirmerName });
  saveFile(new Blob([bytes as BlobPart], { type: "application/pdf" }), applicationFileName(name, a.exam_term));
}

function StatusChip({ a }: { a: ExamApplication }) {
  return <Badge variant={a.status === "confirmed" ? "default" : a.status === "returned" ? "destructive" : "secondary"}>{APPLICATION_STATUS_LABEL[a.status]}</Badge>;
}

function Confirmations({ a }: { a: ExamApplication }) {
  return <ul className="space-y-1 text-sm">
    <li>{a.data["bestaetigung_berichtsheft"] === true ? "✓" : "–"} Berichtsheft regelmäßig geführt</li>
    <li>{a.data["bestaetigung_richtig"] === true ? "✓" : "–"} Angaben richtig und vollständig</li>
  </ul>;
}

/** /pruefungsantrag – Azubis bereiten ihren Antrag vor; alle anderen wählen eine Azubi-Person. */
export function ApplicationHome() {
  const { data: me } = useMyProfile();
  if (!me) return <ListSkeleton />;
  return me.role === "azubi" ? <OwnApplications azubiId={me.id} name={me.full_name} /> : <AzubiPicker kind="antrag" />;
}

function OwnApplications({ azubiId, name }: { azubiId: string; name: string }) {
  const online = useOnline();
  const { data, isLoading } = useQuery({ queryKey: ["exam-applications", azubiId], queryFn: () => listApplications(azubiId), enabled: online });
  const [open, setOpen] = useState<string | "new" | null>(null);
  const current = open && open !== "new" ? data?.find((a) => a.id === open) ?? null : null;
  if (open) return <ApplicationEditor key={open} azubiId={azubiId} name={name} app={current} onClose={() => setOpen(null)} />;
  return <div className="space-y-6">
    <PageHeader title="Antrag auf Prüfungszulassung" subtitle="Bereite deinen Antrag für die Abschlussprüfung vor, lass ihn vom Betrieb bestätigen und gib ihn bei deiner Kammer ab."
      actions={<Button disabled={!online} onClick={() => setOpen("new")}><FilePlus2 className="size-4" aria-hidden /> Neuer Antrag</Button>} />
    {!online ? <EmptyState title={OFFLINE_ACTION_HINT} /> : isLoading ? <ListSkeleton rows={2} /> : !data?.length
      ? <EmptyState title="Noch kein Antrag" description="Lege deinen Antrag ein paar Monate vor der Prüfung an. Viele Angaben sind schon aus deinem Profil eingetragen." />
      : <ul className="space-y-2">{data.map((a) => <li key={a.id}>
        <button type="button" onClick={() => setOpen(a.id)} className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent">
          <span className="min-w-0"><span className="block truncate font-medium">{a.exam_term || "Ohne Termin"}</span><span className="block text-sm text-muted-foreground">Zuletzt geändert {berlinDateTime(a.updated_at)}</span></span>
          <StatusChip a={a} />
        </button>
      </li>)}</ul>}
  </div>;
}

function ApplicationEditor({ azubiId, name, app, onClose }: { azubiId: string; name: string; app: ExamApplication | null; onClose: () => void }) {
  const qc = useQueryClient();
  const online = useOnline();
  const [id] = useState(() => app?.id ?? crypto.randomUUID());
  const [version, setVersion] = useState(app?.version ?? 0);
  const defaults = useQuery({ queryKey: ["exam-applications", "defaults", azubiId], queryFn: () => applicationDefaults(azubiId), enabled: !app && online });
  const [term, setTerm] = useState(app?.exam_term ?? "");
  const [values, setValues] = useState<Values | null>(app ? app.data : null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const terms = useMemo(() => examTermOptions(new Date()), []);
  const data = values ?? defaults.data ?? null;
  const editable = !app || app.status === "draft" || app.status === "returned";
  const back = <Button variant="ghost" size="sm" onClick={onClose}>Zu meinen Anträgen</Button>;
  if (!data) return <ListSkeleton />;
  const set = (k: string, v: string | boolean) => setValues({ ...data, [k]: v });
  const refresh = () => qc.invalidateQueries({ queryKey: ["exam-applications", azubiId] });

  const save = async (quiet = false): Promise<number | null> => {
    setBusy(true);
    try { const v = await saveApplication(id, term, data, version); setVersion(v); await refresh(); if (!quiet) toast.success("Antrag gespeichert"); return v; }
    catch (e) { toast.error(e instanceof Error ? e.message : "Das hat nicht geklappt."); return null; }
    finally { setBusy(false); }
  };
  const missing = missingApplicationFields(term, data);
  const submit = async () => {
    const v = await save(true);
    if (v === null) return;
    setBusy(true);
    try { await submitApplication(id, v); toast.success("Antrag an den Betrieb geschickt"); await refresh(); onClose(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Das hat nicht geklappt."); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setConfirmDelete(false);
    try { await deleteApplication(id); toast.success("Entwurf gelöscht"); await refresh(); onClose(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Das hat nicht geklappt."); }
  };
  const current: ExamApplication = app ? { ...app, exam_term: term, data } : {
    id, azubi_id: azubiId, exam_term: term, data, status: "draft", version, submitted_at: null, confirmed_at: null, confirmer_id: null, review_note: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };

  if (!editable && app) {
    return <div className="space-y-6">{back}
      <PageHeader title={`Prüfungsantrag · ${app.exam_term}`} actions={<StatusChip a={app} />} />
      {app.status === "submitted" && <p className="rounded-lg border-l-4 border-primary bg-accent p-3 text-sm">Dein Betrieb prüft den Antrag. Du bekommst eine Benachrichtigung, sobald er bestätigt ist.</p>}
      {app.status === "confirmed" && <p className="rounded-lg border-l-4 border-primary bg-accent p-3 text-sm">Bestätigt am {app.confirmed_at ? berlinDateTime(app.confirmed_at) : "–"}. Speichere das PDF, unterschreibe es und gib es bei deiner Kammer ab – oder übertrage die Angaben in deren Formular.{app.review_note ? ` Notiz: „${app.review_note}“` : ""}</p>}
      <Card><CardContent className="space-y-5 p-5"><FieldsView fields={APPLICATION_FIELDS} values={app.data} /><Confirmations a={app} /></CardContent></Card>
      <Button onClick={() => void downloadApplication(app, name)}><FileDown className="size-4" aria-hidden /> Als PDF speichern</Button>
    </div>;
  }

  return <div className="space-y-6">{back}
    <PageHeader title={app ? `Prüfungsantrag · ${app.exam_term || "Entwurf"}` : "Neuer Prüfungsantrag"} subtitle="Pflichtfelder sind mit * markiert. Gespeichert wird beim Klick auf „Speichern“." actions={app ? <StatusChip a={app} /> : undefined} />
    {app?.status === "returned" && app.review_note && <p className="rounded-lg border-l-4 border-destructive bg-destructive/10 p-3 text-sm">Zurückgegeben: „{app.review_note}“</p>}
    <Card><CardContent className="space-y-6 p-5">
      <div className="space-y-1.5 sm:max-w-sm">
        <Label htmlFor="app-term">Prüfungstermin<span className="text-destructive"> *</span></Label>
        <Input id="app-term" list="app-terms" value={term} onChange={(e) => setTerm(e.target.value)} maxLength={60} className="h-11" placeholder="z. B. Sommer 2027" />
        <datalist id="app-terms">{terms.map((t) => <option key={t} value={t} />)}</datalist>
      </div>
      <FieldsForm idPrefix="app" fields={APPLICATION_FIELDS} values={data} required={APPLICATION_REQUIRED} onChange={set} disabled={busy} />
      <fieldset className="space-y-3"><legend className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Bestätigungen</legend>
        <div className="flex items-start gap-2"><Checkbox id="app-bh" checked={data["bestaetigung_berichtsheft"] === true} onCheckedChange={(v) => set("bestaetigung_berichtsheft", v === true)} />
          <Label htmlFor="app-bh" className="font-normal">Ich habe meinen Ausbildungsnachweis (Berichtsheft) regelmäßig geführt.</Label></div>
        <div className="flex items-start gap-2"><Checkbox id="app-ok" checked={data["bestaetigung_richtig"] === true} onCheckedChange={(v) => set("bestaetigung_richtig", v === true)} />
          <Label htmlFor="app-ok" className="font-normal">Ich versichere, dass meine Angaben richtig und vollständig sind.<span className="text-destructive"> *</span></Label></div>
      </fieldset>
      {missing.length > 0 && <p className="text-sm text-muted-foreground">Zum Einreichen fehlt noch: {missing.map(fieldLabel).join(", ")}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy || !online} onClick={() => void save()}><Save className="size-4" aria-hidden /> Speichern</Button>
        <Button variant="outline" disabled={busy} onClick={() => void downloadApplication(current, name)}><FileDown className="size-4" aria-hidden /> PDF-Vorschau</Button>
        <Button disabled={busy || !online || missing.length > 0} onClick={() => void submit()}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />} An Betrieb zur Bestätigung</Button>
        {app?.status === "draft" && <Button variant="ghost" className="text-destructive" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 className="size-4" aria-hidden /> Entwurf löschen</Button>}
      </div>
    </CardContent></Card>
    <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Entwurf löschen?" destructive confirmLabel="Löschen" onConfirm={() => void remove()} />
  </div>;
}

/** /pruefungsantrag/$azubiId – Prüfberechtigte bestätigen oder geben zurück; Lesende sehen die Anträge. */
export function ApplicationReviewPage({ azubiId }: { azubiId: string }) {
  const online = useOnline();
  const qc = useQueryClient();
  const name = useQuery({ queryKey: ["certificate", "name", azubiId], queryFn: () => azubiName(azubiId), enabled: online });
  const list = useQuery({ queryKey: ["exam-applications", azubiId], queryFn: () => listApplications(azubiId), enabled: online });
  const review = useQuery({ queryKey: ["certificate", "can-review", azubiId], queryFn: () => canReviewFor(azubiId), enabled: online });
  const [action, setAction] = useState<{ app: ExamApplication; kind: "confirm" | "return" } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!online) return <EmptyState title={OFFLINE_ACTION_HINT} />;
  if (list.isLoading || name.isLoading) return <ListSkeleton />;
  const apps = (list.data ?? []).filter((a) => a.status !== "draft");
  const run = async () => {
    if (!action) return;
    setBusy(true);
    try {
      if (action.kind === "confirm") { await confirmApplication(action.app.id, action.app.version, note); toast.success("Antrag bestätigt"); }
      else { await returnApplication(action.app.id, note); toast.success("Antrag zurückgegeben"); }
      setAction(null); setNote("");
      await qc.invalidateQueries({ queryKey: ["exam-applications", azubiId] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Das hat nicht geklappt."); }
    finally { setBusy(false); }
  };
  return <div className="space-y-6">
    <Button asChild variant="ghost" size="sm"><Link to="/pruefungsantrag">Zur Übersicht</Link></Button>
    <PageHeader title={`Prüfungsanträge · ${name.data ?? ""}`} subtitle="Prüfe die Angaben und bestätige den Antrag als Ausbildungsbetrieb." />
    {!apps.length ? <EmptyState title="Noch kein eingereichter Antrag" /> : apps.map((a) => <Card key={a.id}><CardContent className="space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-semibold">{a.exam_term}</p><p className="text-sm text-muted-foreground">Eingereicht {a.submitted_at ? berlinDateTime(a.submitted_at) : "–"}</p></div>
        <StatusChip a={a} />
      </div>
      {a.review_note && <p className="text-sm text-muted-foreground">Notiz: „{a.review_note}“</p>}
      <FieldsView fields={APPLICATION_FIELDS} values={a.data} />
      <Confirmations a={a} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void downloadApplication(a, name.data ?? "")}><FileDown className="size-4" aria-hidden /> PDF</Button>
        {review.data && a.status === "submitted" && <Button onClick={() => { setNote(""); setAction({ app: a, kind: "confirm" }); }}><CheckCircle2 className="size-4" aria-hidden /> Bestätigen</Button>}
        {review.data && (a.status === "submitted" || a.status === "confirmed") && <Button variant="outline" onClick={() => { setNote(""); setAction({ app: a, kind: "return" }); }}><RotateCcw className="size-4" aria-hidden /> Zurückgeben</Button>}
      </div>
    </CardContent></Card>)}
    <ResponsiveDialog open={!!action} onOpenChange={(v) => { if (!v) setAction(null); }} title={action?.kind === "confirm" ? "Antrag bestätigen" : "Antrag zurückgeben"}
      description={action?.kind === "confirm" ? "Du bestätigst als Ausbildungsbetrieb, dass die Angaben stimmen." : "Schreib kurz, was geändert werden soll."}>
      <div className="space-y-4">
        <div className="space-y-1.5"><Label htmlFor="app-note">{action?.kind === "confirm" ? "Notiz (freiwillig)" : "Begründung"}</Label>
          <Textarea id="app-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={4} /></div>
        <Button className="h-11 w-full" disabled={busy || (action?.kind === "return" && note.trim().length < 3)} onClick={() => void run()}>
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}{action?.kind === "confirm" ? "Bestätigen" : "Zurückgeben"}</Button>
      </div>
    </ResponsiveDialog>
  </div>;
}

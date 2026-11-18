import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Award, ChevronRight, FileDown, Loader2, Save, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/dialogs";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { listVisibleAzubis } from "@/features/experience/api";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";
import { saveFile } from "@/lib/platform";
import { dateDe } from "@/features/export/pdf/text";
import { azubiName, certificateDefaults, getCertificate, issueCertificate, requestCertificate, saveCertificate, type Certificate } from "../api";
import {
  CERTIFICATE_KIND_HINT, CERTIFICATE_KIND_LABEL, CERTIFICATE_STATUS_LABEL, certificateFields, certificateRequired, fieldLabel,
  missingCertificateFields, type CertificateKind, type Values,
} from "../model";
import { FieldsForm, FieldsView } from "./fields-form";

async function downloadCertificate(c: Certificate, name: string) {
  const { buildCertificatePdf, certificateFileName } = await import("@/features/export/pdf/certificate");
  const bytes = await buildCertificatePdf({ certificate: c, azubiName: name });
  saveFile(new Blob([bytes as BlobPart], { type: "application/pdf" }), certificateFileName(name));
}

function StatusChip({ c }: { c: Certificate }) {
  return <Badge variant={c.status === "issued" ? "default" : "secondary"}>{CERTIFICATE_STATUS_LABEL[c.status]}</Badge>;
}

/** /zeugnis – Azubis beantragen und sehen ihr Zeugnis; alle anderen wählen eine Azubi-Person. */
export function CertificateHome() {
  const { data: me } = useMyProfile();
  if (!me) return <ListSkeleton />;
  return me.role === "azubi" ? <OwnCertificate azubiId={me.id} name={me.full_name} /> : <AzubiPicker kind="zeugnis" />;
}

export function AzubiPicker({ kind }: { kind: "zeugnis" | "antrag" }) {
  const online = useOnline();
  const { data, isLoading } = useQuery({ queryKey: ["certificates", "azubis"], queryFn: listVisibleAzubis, enabled: online });
  const title = kind === "zeugnis" ? "Ausbildungszeugnisse" : "Prüfungsanträge";
  return <div className="space-y-6">
    <PageHeader title={title} subtitle={kind === "zeugnis" ? "Zeugnisse deiner Azubis ausfüllen und ausstellen." : "Anträge auf Zulassung zur Abschlussprüfung prüfen und bestätigen."} />
    {!online ? <EmptyState title={OFFLINE_ACTION_HINT} /> : isLoading ? <ListSkeleton /> : !data?.length ? <EmptyState title="Noch keine Azubis verknüpft" /> :
      <ul className="space-y-2">{data.map((a) => <li key={a.id}>
        <Link to={kind === "zeugnis" ? "/zeugnis/$azubiId" : "/pruefungsantrag/$azubiId"} params={{ azubiId: a.id }} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-accent">
          <span className="min-w-0"><span className="block truncate font-medium">{a.name}</span><span className="block truncate text-sm text-muted-foreground">{a.profession ?? "–"}</span></span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      </li>)}</ul>}
  </div>;
}

function OwnCertificate({ azubiId, name }: { azubiId: string; name: string }) {
  const online = useOnline();
  const qc = useQueryClient();
  const { data: cert, isLoading } = useQuery({ queryKey: ["certificate", azubiId], queryFn: () => getCertificate(azubiId), enabled: online });
  const [kind, setKind] = useState<CertificateKind>("qualifiziert");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState(false);
  const request = async () => {
    setBusy(true);
    try { await requestCertificate(kind, note); toast.success("Zeugnis beantragt"); setNote(""); setAgain(false); await qc.invalidateQueries({ queryKey: ["certificate", azubiId] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Das hat nicht geklappt."); }
    finally { setBusy(false); }
  };
  const canRequest = !cert || (cert.status === "issued" && again);
  return <div className="space-y-6">
    <PageHeader title="Ausbildungszeugnis" subtitle="Dein Betrieb stellt dir zum Ende der Ausbildung ein Zeugnis aus (§ 16 BBiG). Hier beantragst du es." />
    {!online ? <EmptyState title={OFFLINE_ACTION_HINT} /> : isLoading ? <ListSkeleton rows={2} /> : <>
      {cert && <Card><CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-semibold">{CERTIFICATE_KIND_LABEL[cert.kind]}</p>
            <p className="text-sm text-muted-foreground">{cert.status === "issued" ? `Ausgestellt am ${dateDe(cert.issued_at?.slice(0, 10))}${cert.issuer_name ? ` von ${cert.issuer_name}` : ""}` : cert.requested_at ? `Beantragt am ${dateDe(cert.requested_at.slice(0, 10))}` : "Wird vom Betrieb vorbereitet"}</p></div>
          <StatusChip c={cert} />
        </div>
        {cert.status !== "issued" && <p className="rounded-lg border-l-4 border-primary bg-accent p-3 text-sm">Dein Betrieb füllt das Zeugnis aus. Du bekommst eine Benachrichtigung, sobald es ausgestellt ist.</p>}
        {cert.status === "issued" && <>
          <FieldsView fields={certificateFields(cert.kind)} values={cert.content} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void downloadCertificate(cert, name)}><FileDown className="size-4" aria-hidden /> Als PDF speichern</Button>
            {!again && <Button variant="outline" onClick={() => setAgain(true)}>Neues Zeugnis beantragen</Button>}
          </div>
        </>}
      </CardContent></Card>}
      {canRequest && <Card><CardContent className="space-y-5 p-5">
        <h2 className="text-lg font-semibold">Zeugnis beantragen</h2>
        <RadioGroup value={kind} onValueChange={(v) => setKind(v as CertificateKind)} className="grid gap-3 sm:grid-cols-2">
          {(["einfach", "qualifiziert"] as const).map((k) => <Label key={k} htmlFor={`kind-${k}`} className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 font-normal has-[:checked]:border-primary has-[:checked]:bg-accent">
            <RadioGroupItem id={`kind-${k}`} value={k} className="mt-0.5" />
            <span><span className="block font-semibold">{CERTIFICATE_KIND_LABEL[k]}</span><span className="mt-1 block text-sm text-muted-foreground">{CERTIFICATE_KIND_HINT[k]}</span></span>
          </Label>)}
        </RadioGroup>
        <div className="space-y-1.5"><Label htmlFor="cert-note">Notiz an den Betrieb (freiwillig)</Label>
          <Textarea id="cert-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} placeholder="z. B. Ich brauche das Zeugnis bis zum 15. Juli für eine Bewerbung." /></div>
        <Button className="h-11" disabled={busy} onClick={() => void request()}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />} Zeugnis beantragen</Button>
      </CardContent></Card>}
    </>}
  </div>;
}

/** /zeugnis/$azubiId – Prüfberechtigte füllen aus und stellen aus; Lesende sehen das ausgestellte Zeugnis. */
export function CertificateEditorPage({ azubiId }: { azubiId: string }) {
  const online = useOnline();
  const qc = useQueryClient();
  const { data: me } = useMyProfile();
  const name = useQuery({ queryKey: ["certificate", "name", azubiId], queryFn: () => azubiName(azubiId), enabled: online });
  const cert = useQuery({ queryKey: ["certificate", azubiId], queryFn: () => getCertificate(azubiId), enabled: online && !!me && me.id !== azubiId });
  const review = useQuery({ queryKey: ["certificate", "can-review", azubiId], queryFn: async () => (await import("../api")).canReviewFor(azubiId), enabled: online && !!me });
  const defaults = useQuery({ queryKey: ["certificate", "defaults", azubiId], queryFn: () => certificateDefaults(azubiId), enabled: online && review.data === true });
  const [kind, setKind] = useState<CertificateKind>("qualifiziert");
  const [values, setValues] = useState<Values>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmIssue, setConfirmIssue] = useState(false);

  useEffect(() => {
    if (loaded || cert.isLoading || review.isLoading || (review.data && defaults.isLoading)) return;
    const c = cert.data;
    if (c) setKind(c.kind);
    const base = defaults.data ?? {};
    const own = c?.content ?? {};
    setValues(Object.keys(own).length ? own : base);
    setLoaded(true);
  }, [loaded, cert.isLoading, cert.data, defaults.isLoading, defaults.data, review.isLoading, review.data]);

  if (!online) return <EmptyState title={OFFLINE_ACTION_HINT} />;
  if (cert.isLoading || review.isLoading || name.isLoading) return <ListSkeleton />;
  const c = cert.data ?? null;
  const canEdit = review.data === true;
  const back = <Button asChild variant="ghost" size="sm"><Link to="/zeugnis">Zur Übersicht</Link></Button>;

  if (!canEdit) {
    return <div className="space-y-6">{back}
      <PageHeader title={`Ausbildungszeugnis · ${name.data ?? ""}`} />
      {!c || c.status !== "issued" ? <EmptyState icon={Award} title="Noch kein Zeugnis ausgestellt" /> : <Card><CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3"><p className="font-semibold">{CERTIFICATE_KIND_LABEL[c.kind]}</p><StatusChip c={c} /></div>
        <FieldsView fields={certificateFields(c.kind)} values={c.content} />
        <Button onClick={() => void downloadCertificate(c, name.data ?? "")}><FileDown className="size-4" aria-hidden /> Als PDF speichern</Button>
      </CardContent></Card>}
    </div>;
  }

  const save = async (): Promise<number | null> => {
    setBusy(true);
    try {
      const v = await saveCertificate(azubiId, kind, values, c?.version ?? 0);
      await qc.invalidateQueries({ queryKey: ["certificate", azubiId] });
      toast.success("Zeugnis gespeichert");
      return v;
    } catch (e) { toast.error(e instanceof Error ? e.message : "Das hat nicht geklappt."); return null; }
    finally { setBusy(false); }
  };
  const missing = missingCertificateFields(kind, values);
  const issue = async () => {
    setConfirmIssue(false);
    const v = await save();
    if (v === null) return;
    setBusy(true);
    try { await issueCertificate(azubiId, v); toast.success("Zeugnis ausgestellt"); await qc.invalidateQueries({ queryKey: ["certificate", azubiId] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Das hat nicht geklappt."); }
    finally { setBusy(false); }
  };
  const preview = () => void downloadCertificate({
    id: c?.id ?? "", azubi_id: azubiId, kind, status: c?.status ?? "draft", request_note: c?.request_note ?? null, requested_at: c?.requested_at ?? null,
    content: values, issued_at: c?.issued_at ?? null, issuer_name: c?.issuer_name ?? null, version: c?.version ?? 0, can_edit: true,
  }, name.data ?? "");

  return <div className="space-y-6">{back}
    <PageHeader title={`Ausbildungszeugnis · ${name.data ?? ""}`} subtitle="Ausfüllen, speichern und ausstellen. Das Zeugnis wird danach ausgedruckt und unterschrieben."
      actions={c ? <StatusChip c={c} /> : undefined} />
    {c?.status === "requested" && <p className="rounded-lg border-l-4 border-primary bg-accent p-3 text-sm">
      Beantragt am {dateDe(c.requested_at?.slice(0, 10))}: {CERTIFICATE_KIND_LABEL[c.kind]}{c.request_note ? ` – „${c.request_note}“` : ""}</p>}
    {c?.status === "issued" && <p className="rounded-lg border-l-4 border-primary bg-accent p-3 text-sm">Bereits ausgestellt. Wenn du etwas änderst und speicherst, ist das Zeugnis wieder in Bearbeitung und muss neu ausgestellt werden.</p>}
    <Card><CardContent className="space-y-6 p-5">
      <RadioGroup value={kind} onValueChange={(v) => setKind(v as CertificateKind)} className="grid gap-3 sm:grid-cols-2">
        {(["einfach", "qualifiziert"] as const).map((k) => <Label key={k} htmlFor={`ekind-${k}`} className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 font-normal has-[:checked]:border-primary has-[:checked]:bg-accent">
          <RadioGroupItem id={`ekind-${k}`} value={k} className="mt-0.5" />
          <span><span className="block font-semibold">{CERTIFICATE_KIND_LABEL[k]}</span><span className="mt-1 block text-sm text-muted-foreground">{CERTIFICATE_KIND_HINT[k]}</span></span>
        </Label>)}
      </RadioGroup>
      <FieldsForm idPrefix="cert" fields={certificateFields(kind)} values={values} required={certificateRequired(kind)} onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))} disabled={busy} />
      {missing.length > 0 && <p className="text-sm text-muted-foreground">Zum Ausstellen fehlt noch: {missing.map(fieldLabel).join(", ")}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void save()}><Save className="size-4" aria-hidden /> Speichern</Button>
        <Button variant="outline" disabled={busy} onClick={preview}><FileDown className="size-4" aria-hidden /> PDF-Vorschau</Button>
        <Button disabled={busy || missing.length > 0} onClick={() => setConfirmIssue(true)}><Award className="size-4" aria-hidden /> Zeugnis ausstellen</Button>
      </div>
    </CardContent></Card>
    <ConfirmDialog open={confirmIssue} onOpenChange={setConfirmIssue} title="Zeugnis ausstellen?" description="Die Person sieht das Zeugnis danach in der App und kann es als PDF speichern." confirmLabel="Ausstellen" onConfirm={() => void issue()} />
  </div>;
}

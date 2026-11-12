import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/dialogs";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";
import type { AppRole } from "@/features/app/session";
import { getMyPrefs, listMyDevices, removePushDevice, saveMyPrefs, sendTestEmail, sendTestPush, type GroupKey, type NotificationPrefs, type PushDevice } from "./api";
import { currentEndpoint, currentEndpointHash, disablePush, enablePush, getPushState, type PushState } from "./push";

const GROUPS: { key: GroupKey; title: string; hint: string }[] = [
  { key: "reports", title: "Berichte und Kommentare", hint: "Einreichungen, Freigaben, Zurückweisungen, Kommentare" },
  { key: "absences", title: "Abwesenheiten", hint: "Anträge und Entscheidungen" },
  { key: "reminders", title: "Erinnerungen", hint: "Fehlende Berichte, Fristen, wartende Prüfungen, Unterweisungen" },
  { key: "deputy", title: "Vertretung", hint: "Vertretungen, die für dich eingetragen oder beendet werden" },
];

const STATE_TEXT: Partial<Record<PushState, string>> = {
  denied: "Push ist für Azuvera blockiert. Erlaube Benachrichtigungen in den Einstellungen deines Browsers oder Geräts und lade die Seite neu.",
  "needs-install": "Auf dem iPhone und iPad funktioniert Push nur, wenn Azuvera auf dem Home-Bildschirm liegt (ab iOS und iPadOS 16.4). Tippe auf Teilen und dann auf ‘Zum Home-Bildschirm’ und öffne Azuvera danach von dort.",
  unsupported: "Dein Browser unterstützt keine Push-Nachrichten.",
  "not-configured": "Push ist noch nicht eingerichtet. Bitte informiere die Ausbildungsleitung.",
};

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="border-t pt-5 first:border-t-0 first:pt-0"><h3 className="mb-3 font-semibold">{title}</h3>{children}</div>;
}

export function NotificationSettingsCard({ email, role }: { email: string; role: AppRole }) {
  const online = useOnline();
  const qc = useQueryClient();
  const [state, setState] = useState<PushState | null>(null);
  const [thisHash, setThisHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<PushDevice | null>(null);
  const devices = useQuery({ queryKey: ["notifications", "devices"], queryFn: listMyDevices, enabled: online });
  const prefsQ = useQuery({ queryKey: ["notifications", "prefs"], queryFn: getMyPrefs });
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  useEffect(() => { if (prefsQ.data) setPrefs(prefsQ.data); }, [prefsQ.data]);

  const reloadState = async () => { setState(await getPushState()); setThisHash(await currentEndpointHash()); };
  useEffect(() => { void reloadState(); }, []);
  useEffect(() => { if (window.location.hash === "#benachrichtigungen") document.getElementById("benachrichtigungen")?.scrollIntoView(); }, []);

  const hasDevice = (devices.data?.length ?? 0) > 0;

  const save = async (next: NotificationPrefs) => {
    const prev = prefs;
    setPrefs(next);
    try { await saveMyPrefs(next); qc.setQueryData(["notifications", "prefs"], next); toast.success("Gespeichert"); }
    catch { setPrefs(prev); toast.error("Einstellung konnte nicht gespeichert werden."); }
  };
  const setGroup = (g: GroupKey, ch: "push" | "email", v: boolean) => prefs && void save({ ...prefs, groups: { ...prefs.groups, [g]: { ...prefs.groups[g], [ch]: v } } });
  const setTime = (key: "quiet_from" | "quiet_to" | "daily_nudge_time", v: string) => {
    if (!prefs || !/^\d{2}:\d{2}$/.test(v)) return;
    const next = { ...prefs, [key]: v };
    if (next.quiet_from === next.quiet_to) { toast.error("Von und Bis dürfen nicht gleich sein."); return; }
    void save(next);
  };

  const turnOn = async () => {
    setBusy(true);
    try { const s = await enablePush(); if (s !== "subscribed") setState(s); await reloadState(); await devices.refetch(); }
    catch { toast.error("Push konnte nicht eingeschaltet werden."); }
    finally { setBusy(false); }
  };
  const turnOff = async () => {
    setBusy(true);
    try { await disablePush(); await reloadState(); await devices.refetch(); } finally { setBusy(false); }
  };
  const testPush = async () => {
    const ep = await currentEndpoint();
    if (!ep) return;
    try { await sendTestPush(ep); toast.success("Test gesendet"); } catch (e) { toast.error((e as Error).message); }
  };
  const testMail = async () => {
    try { await sendTestEmail(); toast.success("Test-E-Mail gesendet"); } catch (e) { toast.error((e as Error).message); }
  };
  const confirmRemove = async () => {
    const d = removing; setRemoving(null);
    if (!d) return;
    try {
      await removePushDevice(d.id);
      if (d.endpoint_hash && d.endpoint_hash === thisHash) await disablePush();
      await reloadState(); await devices.refetch();
      toast.success("Gerät entfernt");
    } catch { toast.error("Gerät konnte nicht entfernt werden."); }
  };

  const off = !online;
  return (
    <section id="benachrichtigungen" className="scroll-mt-24 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold">Benachrichtigungen</h2>
      {off && <p className="mt-2 text-sm text-muted-foreground">{OFFLINE_ACTION_HINT}</p>}
      <div className="mt-4 space-y-5">
        <Sub title="Push auf diesem Gerät">
          {state === null ? <div className="h-11 animate-pulse rounded-lg bg-muted" /> : state === "subscribed" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="push-on" className="font-normal">Push ist auf diesem Gerät eingeschaltet.</Label>
                <Switch id="push-on" checked disabled={off || busy} onCheckedChange={(v) => { if (!v) void turnOff(); }} />
              </div>
              <Button variant="outline" className="h-11" disabled={off} onClick={() => void testPush()}>Test-Push senden</Button>
            </div>
          ) : state === "default" || state === "granted-not-subscribed" ? (
            <Button className="h-11" disabled={off || busy} onClick={() => void turnOn()}>Push auf diesem Gerät einschalten</Button>
          ) : <p className="text-sm text-muted-foreground">{STATE_TEXT[state]}</p>}
        </Sub>

        {hasDevice && (
          <Sub title="Meine Geräte">
            <ul className="divide-y rounded-xl border">
              {devices.data!.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{d.device_label ?? "Dieses Gerät"}{d.endpoint_hash && d.endpoint_hash === thisHash && <Badge variant="secondary">Dieses Gerät</Badge>}</p>
                    <p className="text-xs text-muted-foreground">Angemeldet am {format(new Date(d.created_at), "d. MMMM yyyy", { locale: de })}{d.last_used_at && ` · Zuletzt aktiv vor ${formatDistanceToNow(new Date(d.last_used_at), { locale: de })}`}</p>
                  </div>
                  <Button variant="outline" className="h-10" disabled={off} onClick={() => setRemoving(d)}>Entfernen</Button>
                </li>
              ))}
            </ul>
          </Sub>
        )}

        <Sub title="Was du erhältst">
          <p className="mb-3 text-sm text-muted-foreground">Alle Benachrichtigungen erscheinen immer in der App. Hier legst du fest, welche du zusätzlich als Push-Nachricht oder E-Mail bekommst.</p>
          {prefs ? (
            <ul className="divide-y rounded-xl border">
              {GROUPS.map((g) => (
                <li key={g.key} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium">{g.title}</p><p className="text-xs text-muted-foreground">{g.hint}</p></div>
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 text-sm"><Switch checked={prefs.groups[g.key].push} disabled={off || !hasDevice} onCheckedChange={(v) => setGroup(g.key, "push", v)} />Push</label>
                    <label className="flex items-center gap-2 text-sm"><Switch checked={prefs.groups[g.key].email} disabled={off} onCheckedChange={(v) => setGroup(g.key, "email", v)} />E-Mail</label>
                  </div>
                </li>
              ))}
            </ul>
          ) : <div className="h-40 animate-pulse rounded-xl bg-muted" />}
          {!hasDevice && <p className="mt-2 text-xs text-muted-foreground">Schalte zuerst Push auf einem Gerät ein.</p>}
          <p className="mt-3 text-sm">E-Mails gehen an {email}.</p>
          <Button variant="outline" className="mt-3 h-11" disabled={off} onClick={() => void testMail()}>Test-E-Mail senden</Button>
        </Sub>

        {prefs && (
          <Sub title="Ruhezeiten">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="quiet" className="font-normal">Ruhezeiten für Push</Label>
              <Switch id="quiet" checked={prefs.quiet_hours_enabled} disabled={off} onCheckedChange={(v) => void save({ ...prefs, quiet_hours_enabled: v })} />
            </div>
            <div className="mt-3 grid max-w-sm grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="quiet-from">Von</Label><Input id="quiet-from" type="time" className="h-11" disabled={off} defaultValue={prefs.quiet_from} key={`f${prefs.quiet_from}`} onBlur={(e) => e.target.value !== prefs.quiet_from && setTime("quiet_from", e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="quiet-to">Bis</Label><Input id="quiet-to" type="time" className="h-11" disabled={off} defaultValue={prefs.quiet_to} key={`t${prefs.quiet_to}`} onBlur={(e) => e.target.value !== prefs.quiet_to && setTime("quiet_to", e.target.value)} /></div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">In dieser Zeit kommen Push-Nachrichten erst nach Ende der Ruhezeit an. E-Mails sind nicht betroffen.</p>
          </Sub>
        )}

        {prefs && role === "azubi" && (
          <Sub title="Täglicher Hinweis">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="nudge" className="font-normal">Erinnere mich, wenn ich heute noch keinen Berichtseintrag angelegt habe</Label>
              <Switch id="nudge" checked={prefs.daily_nudge_enabled} disabled={off} onCheckedChange={(v) => void save({ ...prefs, daily_nudge_enabled: v })} />
            </div>
            <div className="mt-3 max-w-[10rem] space-y-1.5"><Label htmlFor="nudge-time">Uhrzeit</Label><Input id="nudge-time" type="time" className="h-11" disabled={off} defaultValue={prefs.daily_nudge_time} key={`n${prefs.daily_nudge_time}`} onBlur={(e) => e.target.value !== prefs.daily_nudge_time && setTime("daily_nudge_time", e.target.value)} /></div>
            <p className="mt-2 text-xs text-muted-foreground">Montag bis Freitag, nur wenn für heute weder ein Bericht noch eine Abwesenheit eingetragen ist.</p>
          </Sub>
        )}
      </div>
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Gerät entfernen?" description="Auf diesem Gerät kommen dann keine Push-Nachrichten mehr an." confirmLabel="Entfernen" destructive onConfirm={() => void confirmRemove()} />
    </section>
  );
}

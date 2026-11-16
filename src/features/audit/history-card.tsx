import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, Circle, FileMinus, FilePlus2, Info, MessageSquare, Paperclip, Pencil,
  RotateCcw, Send, ShieldCheck, Sparkles, Trash2, XCircle, type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ListSkeleton } from "@/components/shared";
import { ROLE_LABELS, type AppRole } from "@/features/app/session";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";
import { cn } from "@/lib/utils";
import {
  auditNames, listEntityHistory, listEntityVersions, verifyEntityIntegrity,
  type EntityVersion, type HistoryEntity, type ReportIntegrity,
} from "./api";
import { wordDiff } from "./diff";
import { describeEntry, formatAuditTime, matchesHistoryFilter, referencedIds, shortHash, type HistoryFilter } from "./labels";

const ICONS: Record<string, LucideIcon> = {
  create: FilePlus2, edit: Pencil, delete: Trash2, attachment_add: Paperclip, attachment_delete: FileMinus,
  ai_assist: Sparkles, submit: Send, approve: CheckCircle2, reject: XCircle, reopen: RotateCcw, comment: MessageSquare,
};

const CHIPS: { value: HistoryFilter; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "status", label: "Status" },
  { value: "changes", label: "Änderungen" },
  { value: "comments", label: "Kommentare" },
];

const VERSION_STATUS: Record<string, string> = {
  submitted: "Eingereicht", rejected: "Zurückgewiesen", approved: "Freigegeben", draft: "Wieder geöffnet",
};

const SECTIONS: Record<HistoryEntity, { key: string; label: string }[]> = {
  report: [
    { key: "activities", label: "Tätigkeiten" },
    { key: "school", label: "Berufsschule" },
    { key: "instructions", label: "Unterweisungen" },
    { key: "summary", label: "Zusammenfassung" },
  ],
  experience: [
    { key: "kind", label: "Art" },
    { key: "title", label: "Thema" },
    { key: "area", label: "Bereich" },
    { key: "written_on", label: "Datum" },
    { key: "body", label: "Bericht" },
    { key: "reasoning", label: "Begründung" },
  ],
};

export function HistoryCard({ reportId, isDraft, onServer, entity = "report" }: { reportId: string; isDraft: boolean; onServer: boolean; entity?: HistoryEntity }) {
  const online = useOnline();
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [integrity, setIntegrity] = useState<ReportIntegrity | "draft" | "error" | null>(null);
  const [checking, setChecking] = useState(false);
  const enabled = online && onServer;

  const { data: entries, isLoading } = useQuery({ queryKey: ["audit", entity, reportId], queryFn: () => listEntityHistory(entity, reportId), enabled });
  const { data: names } = useQuery({
    queryKey: ["audit", "names", reportId, entries?.length],
    queryFn: () => auditNames(referencedIds(entries ?? [])),
    enabled: enabled && !!entries?.length,
  });

  const runCheck = async () => {
    if (isDraft) { setIntegrity("draft"); return; }
    setChecking(true);
    try { setIntegrity(await verifyEntityIntegrity(entity, reportId)); } catch { setIntegrity("error"); } finally { setChecking(false); }
  };

  const shown = (entries ?? []).filter((e) => matchesHistoryFilter(e.action, filter));

  return <section id="verlauf" className="rounded-2xl border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">Verlauf</h2>
      <Button variant="outline" size="sm" disabled={!enabled || checking} onClick={() => void runCheck()}><ShieldCheck className="size-4" aria-hidden /> Integrität prüfen</Button>
    </div>

    {!online ? <p className="mt-3 rounded-xl border bg-muted/40 p-3 text-sm">{OFFLINE_ACTION_HINT}</p> : <>
      {integrity && <IntegrityBox result={integrity} />}

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Verlauf filtern">
        {CHIPS.map((c) => <button key={c.value} type="button" aria-pressed={filter === c.value} onClick={() => setFilter(c.value)}
          className={cn("min-h-9 rounded-full border px-3 text-sm font-medium transition-colors", filter === c.value ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground")}>{c.label}</button>)}
      </div>

      {!onServer ? <p className="mt-3 text-sm text-muted-foreground">Der Verlauf erscheint, sobald der {entity === "experience" ? "Erfahrungsbericht" : "Bericht"} synchronisiert ist.</p>
        : isLoading ? <div className="mt-3"><ListSkeleton rows={3} /></div>
        : shown.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Keine Einträge für diese Auswahl.</p>
        : <ol className="mt-4 space-y-0">
          {shown.map((e, i) => {
            const Icon = ICONS[e.action] ?? Circle;
            const desc = describeEntry({ ...e, entity_type: entity }, names);
            const name = e.actor_id ? names?.get(e.actor_id) ?? "…" : "System";
            return <li key={e.id} className="relative flex gap-3 pb-4">
              {i < shown.length - 1 && <span className="absolute left-4 top-9 bottom-0 w-px bg-border" aria-hidden />}
              <span className="grid size-8 shrink-0 place-items-center rounded-full border bg-muted text-foreground"><Icon className="size-4" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{desc.title}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="text-foreground">{name}</span>
                  {e.actor_role && <Badge variant="secondary" className="text-[11px]">{ROLE_LABELS[e.actor_role as AppRole] ?? e.actor_role}</Badge>}
                  <time dateTime={e.created_at}>{formatAuditTime(e.created_at)}</time>
                </div>
                {desc.details.length > 0 && <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">{desc.details.map((d) => <li key={d} className="break-words">{d}</li>)}</ul>}
              </div>
            </li>;
          })}
        </ol>}

      <p className="mt-2 text-xs text-muted-foreground">Das Protokoll wird nur ergänzt und kann nicht geändert werden. Zeitpunkte sind Serverzeiten; offline erfasste Änderungen erscheinen mit dem Zeitpunkt der Synchronisation.</p>

      {onServer && <VersionsCard reportId={reportId} entity={entity} />}
    </>}
  </section>;
}

function IntegrityBox({ result }: { result: ReportIntegrity | "draft" | "error" }) {
  if (result === "draft") return <Box tone="info" icon={Info}>Entwürfe haben noch keine Prüfsumme.</Box>;
  if (result === "error") return <Box tone="bad" icon={AlertTriangle}>Die Prüfung ist fehlgeschlagen. Bitte versuche es erneut.</Box>;
  if (result.hashOk === null) return <Box tone="info" icon={Info}>Entwürfe haben noch keine Prüfsumme.</Box>;
  return <Box tone={result.hashOk && result.signaturesOk ? "ok" : "bad"} icon={result.hashOk ? CheckCircle2 : AlertTriangle}>
    <p>{result.hashOk
      ? `Prüfsumme in Ordnung: Der Inhalt entspricht dem eingereichten bzw. freigegebenen Stand (Version ${result.version}).`
      : "Abweichung: Der Inhalt weicht von der gespeicherten Prüfsumme ab. Bitte informiere die Ausbildungsleitung."}</p>
    <p className="mt-1">Unterschriften passen zur Prüfsumme: {result.signaturesOk ? "ja" : "nein"}</p>
  </Box>;
}

export function Box({ tone, icon: Icon, children }: { tone: "ok" | "bad" | "info"; icon: LucideIcon; children: ReactNode }) {
  return <div role="status" className={cn("mt-3 flex gap-2 rounded-xl border p-3 text-sm",
    tone === "ok" && "border-success/40 bg-success/10", tone === "bad" && "border-destructive/40 bg-destructive/10", tone === "info" && "bg-muted/40")}>
    <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "bad" && "text-destructive")} aria-hidden />
    <div className="min-w-0">{children}</div>
  </div>;
}

function VersionsCard({ reportId, entity }: { reportId: string; entity: HistoryEntity }) {
  const { data: versions, isLoading } = useQuery({ queryKey: ["audit", "versions", entity, reportId], queryFn: () => listEntityVersions(entity, reportId) });
  const [open, setOpen] = useState<number | null>(null);
  const list = versions ?? [];
  return <div className="mt-4 rounded-xl border p-3">
    <h3 className="text-sm font-semibold">Versionen</h3>
    {isLoading ? <div className="mt-2"><ListSkeleton rows={2} /></div>
      : list.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Noch keine eingereichte Version.</p>
      : <ul className="mt-2 divide-y">
        {[...list].reverse().map((v) => {
          const i = list.indexOf(v);
          return <li key={v.id}><button type="button" onClick={() => setOpen(i)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left text-sm hover:bg-muted/40">
            <span className="font-medium">Version {v.version}</span>
            <Badge variant="outline">{VERSION_STATUS[v.status] ?? v.status}</Badge>
            <span className="text-xs text-muted-foreground">{formatAuditTime(v.created_at)}</span>
            {shortHash(v.content_hash) && <span className="font-mono text-xs text-muted-foreground">{shortHash(v.content_hash)}</span>}
          </button></li>;
        })}
      </ul>}
    <VersionDialog entity={entity} version={open !== null ? list[open] ?? null : null} previous={open !== null ? previousVersion(list, open) : null} onClose={() => setOpen(null)} />
  </div>;
}

/** Vorherige Version = neuester Schnappschuss mit kleinerer Versionsnummer. */
function previousVersion(list: EntityVersion[], index: number): EntityVersion | null {
  const current = list[index];
  if (!current) return null;
  for (let i = index - 1; i >= 0; i--) if (list[i]!.version < current.version) return list[i]!;
  return null;
}

function VersionDialog({ entity, version, previous, onClose }: { entity: HistoryEntity; version: EntityVersion | null; previous: EntityVersion | null; onClose: () => void }) {
  const [showDiff, setShowDiff] = useState(false);
  const snap = version ? version.sections : null;
  const prev = previous ? previous.sections : null;
  return <Dialog open={!!version} onOpenChange={(o) => { if (!o) { setShowDiff(false); onClose(); } }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Version {version?.version}</DialogTitle>
        <DialogDescription>{version ? `${VERSION_STATUS[version.status] ?? version.status} · ${formatAuditTime(version.created_at)}${shortHash(version.content_hash) ? ` · Prüfsumme ${shortHash(version.content_hash)}` : ""}` : ""}</DialogDescription>
      </DialogHeader>
      <div className="flex items-center gap-2">
        <Switch id="version-diff" checked={showDiff} disabled={!prev} onCheckedChange={setShowDiff} />
        <Label htmlFor="version-diff">Änderungen zur vorherigen Version anzeigen</Label>
      </div>
      {!prev && <p className="text-xs text-muted-foreground">Dies ist die erste gespeicherte Version.</p>}
      {showDiff && prev && <p className="text-xs text-muted-foreground">Vergleich mit Version {previous?.version}: <ins className="rounded bg-success/15 px-0.5 underline decoration-2 underline-offset-2">hinzugefügt</ins> · <del className="rounded bg-destructive/10 px-0.5 text-destructive line-through">entfernt</del></p>}
      {snap && <div className="space-y-3">
        {SECTIONS[entity].map((s) => {
          const now = snap[s.key] ?? "";
          const before = prev?.[s.key] ?? "";
          if (!now.trim() && !(showDiff && before.trim())) return null;
          return <section key={s.key} className="rounded-xl border p-3">
            <h4 className="text-sm font-semibold text-muted-foreground">{s.label}</h4>
            <p className="mt-1 whitespace-pre-wrap text-sm">{showDiff && prev ? <DiffText before={before} after={now} /> : now}</p>
          </section>;
        })}
        {entity === "experience" && version && <section className="rounded-xl border p-3">
          <h4 className="text-sm font-semibold text-muted-foreground">Anhänge</h4>
          {version.attachments.length ? <ul className="mt-1 list-disc pl-5 text-sm">{version.attachments.map((a) => <li key={a} className="break-words">{a}</li>)}</ul> : <p className="mt-1 text-sm text-muted-foreground">Keine Anhänge.</p>}
        </section>}
      </div>}
    </DialogContent>
  </Dialog>;
}

function DiffText({ before, after }: { before: string; after: string }) {
  return <>{wordDiff(before, after).map((p, i) =>
    p.kind === "added" ? <ins key={i} className="rounded bg-success/15 underline decoration-2 underline-offset-2"><span className="sr-only">[hinzugefügt: </span>{p.value}<span className="sr-only">]</span></ins>
      : p.kind === "removed" ? <del key={i} className="rounded bg-destructive/10 text-destructive line-through"><span className="sr-only">[entfernt: </span>{p.value}<span className="sr-only">]</span></del>
      : <span key={i}>{p.value}</span>)}</>;
}

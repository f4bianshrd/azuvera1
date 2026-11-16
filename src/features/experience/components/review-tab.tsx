import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { de } from "date-fns/locale";
import { Check, Eye, MessageSquare, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton } from "@/components/shared";
import { getReviewQueue, experienceNames, listExperienceMetrics, listExperiencesByIds, type Experience } from "../api";
import { dateDe, kindLabel } from "../model";
import { ApproveExperienceSheet, RejectExperienceSheet } from "./experience-dialogs";

export function useExperienceQueue(enabled: boolean) {
  return useQuery({ queryKey: ["experience", "queue"], queryFn: getReviewQueue, enabled, refetchInterval: 60_000 });
}

const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?";
const overdue = (iso: string | null) => !!iso && Date.now() - new Date(iso).getTime() >= 7 * 86_400_000;

/** Tab „Erfahrungsberichte“ im Ausbilderportal: älteste zuerst, keine Sammelfreigabe. */
export function ExperienceReviewTab({ reviewerId }: { reviewerId: string }) {
  const queryClient = useQueryClient();
  const { data: queue, isLoading } = useExperienceQueue(true);
  const items = [...(queue ?? [])].sort((a, b) => (a.submitted_at ?? "").localeCompare(b.submitted_at ?? ""));
  const ids = items.map((i) => i.experience_id);
  const { data: rows } = useQuery({ queryKey: ["experience", "queue-rows", ids.join(",")], queryFn: () => listExperiencesByIds(ids), enabled: ids.length > 0 });
  const personIds = [...items.map((i) => i.azubi_id), ...items.map((i) => i.deputy_for ?? "")];
  const { data: people } = useQuery({ queryKey: ["experience", "queue-people", personIds.join(",")], queryFn: () => experienceNames(personIds), enabled: ids.length > 0 });
  const { data: metrics } = useQuery({
    queryKey: ["experience", "queue-metrics", ids.join(",")],
    queryFn: async () => {
      const out = new Map<string, { attachments: number; comments: number }>();
      for (const a of [...new Set(items.map((i) => i.azubi_id))]) for (const [k, v] of await listExperienceMetrics(items.filter((i) => i.azubi_id === a).map((i) => i.experience_id), a)) out.set(k, v);
      return out;
    },
    enabled: ids.length > 0,
  });
  const [approve, setApprove] = useState<Experience | null>(null);
  const [reject, setReject] = useState<Experience | null>(null);
  const byId = new Map((rows ?? []).map((r) => [r.id, r as Experience]));
  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["experience"] }), queryClient.invalidateQueries({ queryKey: ["notifications"] })]); };

  if (isLoading) return <ListSkeleton />;
  if (!items.length) return <EmptyState title="Alles geprüft – nichts offen." />;
  return <>
    <ul className="grid gap-3 lg:grid-cols-2">
      {items.map((it) => {
        const r = byId.get(it.experience_id);
        const p = people?.get(it.azubi_id);
        const m = metrics?.get(it.experience_id);
        const late = overdue(it.submitted_at);
        return <li key={it.experience_id} className="rounded-2xl border bg-card p-4">
          <div className="flex items-start gap-3">
            <Avatar className="size-10 shrink-0"><AvatarFallback>{initials(p?.name ?? "")}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{p?.name ?? "…"}</p>
              {p?.profession && <p className="text-xs text-muted-foreground">{p.profession}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <p className="min-w-0 break-words text-sm font-medium">{r?.title ?? "…"}</p>
                {r && <Badge variant="secondary">{kindLabel(r.kind)}</Badge>}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                {r && <span>{dateDe(r.written_on)}</span>}
                <span className="inline-flex items-center gap-1"><Paperclip className="size-3" aria-hidden />{m?.attachments ?? 0}</span>
                <span className="inline-flex items-center gap-1"><MessageSquare className="size-3" aria-hidden />{m?.comments ?? 0}</span>
              </div>
              <p className={cn("mt-1 text-xs", late ? "font-medium text-warning" : "text-muted-foreground")}>
                {it.submitted_at ? `eingereicht vor ${formatDistanceToNowStrict(new Date(it.submitted_at), { locale: de })}` : ""}{late ? " · Überfällig" : ""}
              </p>
              {it.deputy_for && <Badge variant="outline" className="mt-2">Vertretung für {people?.get(it.deputy_for)?.name ?? "…"}</Badge>}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" asChild><Link to="/erfahrungsberichte/$id" params={{ id: it.experience_id }} aria-label="Prüfen"><Eye className="size-4" aria-hidden /><span className="hidden sm:inline">Prüfen</span></Link></Button>
            <Button size="sm" disabled={!r} onClick={() => r && setApprove(r)} aria-label="Freigeben"><Check className="size-4" aria-hidden /><span className="hidden sm:inline">Freigeben</span></Button>
            <Button size="sm" variant="outline" disabled={!r} onClick={() => r && setReject(r)} aria-label="Zurückweisen"><X className="size-4" aria-hidden /><span className="hidden sm:inline">Zurückweisen</span></Button>
          </div>
        </li>;
      })}
    </ul>
    {approve && <ApproveExperienceSheet report={approve} reviewerId={reviewerId} azubiName={people?.get(approve.azubi_id)?.name ?? ""}
      deputyName={(() => { const d = items.find((i) => i.experience_id === approve.id)?.deputy_for; return d ? people?.get(d)?.name : undefined; })()}
      open onOpenChange={(o) => { if (!o) setApprove(null); }} onDone={refresh} onConflict={() => void refresh()} />}
    {reject && <RejectExperienceSheet report={reject} open onOpenChange={(o) => { if (!o) setReject(null); }} onDone={refresh} onConflict={() => void refresh()} />}
  </>;
}

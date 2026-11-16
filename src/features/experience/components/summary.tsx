import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared";
import { getTeamOverview, listExperienceFor, type TeamExperienceRow } from "../api";
import { ExperienceProgressCard } from "./progress-card";

/** Karte „Erfahrungsberichte“ auf der Azubi-Übersicht im Team. */
export function ExperienceTeamCard({ azubiId }: { azubiId: string }) {
  const { data: reports = [] } = useQuery({ queryKey: ["experience", "list", azubiId], queryFn: () => listExperienceFor(azubiId) });
  const visible = reports.filter((r) => r.status !== "draft").slice(0, 5);
  return <section className="space-y-3 border-t pt-5">
    <h2 className="font-semibold">Erfahrungsberichte</h2>
    <ExperienceProgressCard azubiId={azubiId} compact />
    <div>
      <h3 className="text-sm font-medium text-muted-foreground">Letzte Erfahrungsberichte</h3>
      <ul className="mt-2 space-y-2">{visible.map((r) => <li key={r.id}><Link to="/erfahrungsberichte/$id" params={{ id: r.id }} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border p-3"><span className="min-w-0 break-words text-sm">{r.title || "Ohne Titel"}</span><StatusBadge status={r.status} /></Link></li>)}</ul>
      {!visible.length && <p className="mt-2 text-sm text-muted-foreground">Noch keine Erfahrungsberichte eingereicht.</p>}
      <Button asChild variant="link" className="mt-1 px-0"><Link to="/erfahrungsberichte" search={{ azubi: azubiId }}>Alle ansehen</Link></Button>
    </div>
  </section>;
}

export function useTeamExperience() {
  return useQuery({ queryKey: ["experience", "team-overview"], queryFn: () => getTeamOverview() });
}

/** Chips in der Team-Liste: Stand im laufenden Lehrjahr und „Rückstand“ bei vergangenen Lehrjahren. */
export function ExperienceTeamChips({ azubiId, rows }: { azubiId: string; rows: TeamExperienceRow[] | undefined }) {
  const mine = (rows ?? []).filter((r) => r.azubi_id === azubiId);
  const current = mine.find((r) => r.is_current);
  const today = new Date().toISOString().slice(0, 10);
  const backlog = mine.some((r) => !r.is_current && r.year_end < today && r.approved + r.submitted < r.required);
  if (!current && !backlog) return null;
  return <div className="flex flex-wrap gap-1">
    {current && <Badge variant="outline">Erfahrungsberichte {current.approved}/{current.required} im {current.year_no}. Lehrjahr</Badge>}
    {backlog && <Badge variant="outline" className="border-warning text-warning">Rückstand</Badge>}
  </div>;
}

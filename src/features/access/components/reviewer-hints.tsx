import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/lib/sync/status";
import { myAccessOverview } from "../api";
import { ACCESS_QUERY_KEY } from "./access-page";

/** true/false, sobald bekannt; undefined offline oder beim Laden (dann kein Hinweis). */
export function useHasReviewer(enabled = true): boolean | undefined {
  const online = useOnline();
  const { data } = useQuery({ queryKey: ACCESS_QUERY_KEY, queryFn: myAccessOverview, enabled: enabled && online, staleTime: 60_000 });
  if (!data?.as_azubi) return undefined;
  return data.as_azubi.grants.some((g) => g.status === "active" && g.can_review);
}

/** Hat die angemeldete Nicht-Azubi-Person Zugriff auf mindestens ein Berichtsheft? */
export function useHasAnyAccess(enabled = true): boolean | undefined {
  const online = useOnline();
  const { data } = useQuery({ queryKey: ACCESS_QUERY_KEY, queryFn: myAccessOverview, enabled: enabled && online, staleTime: 60_000 });
  if (!data?.as_grantee) return undefined;
  return data.as_grantee.grants.some((g) => g.status === "active");
}

export function NoReviewerSubmitHint() {
  const has = useHasReviewer();
  if (has !== false) return null;
  return <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">Noch niemand ist als Prüfer:in eingeladen. Du kannst trotzdem einreichen; die Prüfung beginnt, sobald jemand Zugriff hat.</p>;
}

export function NoReviewerDashboardCard() {
  const has = useHasReviewer();
  if (has !== false) return null;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="font-semibold">Wer prüft deine Berichte?</h2>
        <p className="mt-1 text-sm">Noch niemand prüft deine Berichte. Lade deine Ausbilder:in oder Betriebsleiter:in ein.</p>
      </div>
      <Button asChild className="min-h-11 shrink-0"><Link to="/zugriff" search={{ neu: true }}><UserPlus className="size-4" aria-hidden /> Person einladen</Link></Button>
    </section>
  );
}

export function NoAccessCard() {
  return (
    <section className="rounded-2xl border bg-card p-6 text-center shadow-sm">
      <KeyRound className="mx-auto size-8 text-primary" aria-hidden />
      <p className="mt-3 text-sm">Du hast noch keinen Zugriff auf ein Berichtsheft. Lass dir von einer Azubi-Person einen Einladungs-Code geben.</p>
      <Button asChild className="mt-4 min-h-11"><Link to="/zugriff">Code einlösen</Link></Button>
    </section>
  );
}

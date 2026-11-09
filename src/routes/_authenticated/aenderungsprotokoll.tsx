import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/shared";
import { ROLE_LABELS, useMyProfile, type AppRole } from "@/features/app/session";

const TITLE = "Änderungsprotokoll – Azuvera";

const ACTION_LABELS: Record<string, string> = {
  role_changed: "Rolle geändert",
  azubi_assignment_changed: "Zuweisung geändert",
  viewers_changed: "Lesezugriff geändert",
  invite_code_created: "Einladungs-Code erzeugt",
  invite_code_revoked: "Einladungs-Code widerrufen",
  invite_code_redeemed: "Einladungs-Code eingelöst",
  profession_set: "Beruf gesetzt",
};

export const Route = createFileRoute("/_authenticated/aenderungsprotokoll")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: "Protokoll sicherheitsrelevanter Änderungen." },
      { property: "og:title", content: TITLE },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProtokollPage,
});

function ProtokollPage() {
  const { data: me } = useMyProfile();

  const { data: entries, isLoading } = useQuery({
    queryKey: ["audit-log", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, created_at, actor_role, entity_type, action")
        .order("id", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Änderungsprotokoll"
        subtitle="Sicherheitsrelevante Änderungen, manipulationssicher verkettet."
      />
      {isLoading ? (
        <ListSkeleton />
      ) : (entries ?? []).length === 0 ? (
        <EmptyState icon={History} title="Noch keine Einträge" description="Änderungen an Rollen und Zuweisungen erscheinen hier." />
      ) : (
        <ul className="space-y-2">
          {(entries ?? []).map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-4 shadow-sm">
              <span className="text-sm font-medium">{ACTION_LABELS[e.action] ?? e.action}</span>
              {e.actor_role && <Badge variant="secondary">{ROLE_LABELS[e.actor_role as AppRole]}</Badge>}
              <span className="ml-auto text-xs text-muted-foreground">
                {format(new Date(e.created_at), "d. MMM yyyy, HH:mm 'Uhr'", { locale: de })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

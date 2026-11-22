import { createFileRoute, Navigate } from "@tanstack/react-router";
import { ListSkeleton } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { AgentConsole } from "@/features/support/components/agent-console";

const TITLE = "Support – Azuvera";
const DESC = "Support-Bereich für IT/Technik: Identität prüfen, Tickets einlösen, protokolliert helfen.";

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupportRoute,
});

function SupportRoute() {
  const { data: me, isLoading } = useMyProfile();
  if (isLoading || !me) return <ListSkeleton />;
  // Daten schützt die Datenbank; die Seite selbst ist nur für IT/Technik sichtbar.
  if (me.role !== "it_technik") return <Navigate to="/hilfe" replace />;
  return <AgentConsole />;
}

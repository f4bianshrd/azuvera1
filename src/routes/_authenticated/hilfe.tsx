import { createFileRoute, Navigate } from "@tanstack/react-router";
import { ListSkeleton } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { MySupportPage } from "@/features/support/components/my-support";

const TITLE = "Hilfe & Support – Azuvera";
const DESC = "Support-ID, Support-Tickets mit Einmal-Code und Zugriffsprotokoll für dein Azuvera-Konto.";

export const Route = createFileRoute("/_authenticated/hilfe")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HilfeRoute,
});

function HilfeRoute() {
  const { data: me, isLoading } = useMyProfile();
  if (isLoading || !me) return <ListSkeleton />;
  if (me.role === "it_technik") return <Navigate to="/support" replace />;
  return <MySupportPage />;
}

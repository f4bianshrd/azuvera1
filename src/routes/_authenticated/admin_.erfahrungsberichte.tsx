import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, PageHeader } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { RequirementsAdmin } from "@/features/experience/components/requirements-admin";

const TITLE = "Vorgaben für Erfahrungsberichte – Azuvera";
const DESCRIPTION = "Wie viele Erfahrungsberichte je Lehrjahr gelten, je Bundesland und Beruf.";

export const Route = createFileRoute("/_authenticated/admin_/erfahrungsberichte")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "robots", content: "noindex" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RequirementsPage,
});

function RequirementsPage() {
  const { data: me } = useMyProfile();
  if (me && me.role !== "ausbildungsleitung") return <EmptyState title="Dazu fehlt dir die Berechtigung." />;
  return <div className="space-y-5">
    <PageHeader title="Vorgaben für Erfahrungsberichte" subtitle="Wie viele Erfahrungsberichte je Lehrjahr gelten, je Bundesland und Beruf." />
    {me && <RequirementsAdmin />}
  </div>;
}

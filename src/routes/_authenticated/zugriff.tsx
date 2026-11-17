import { createFileRoute } from "@tanstack/react-router";
import { AccessPage } from "@/features/access/components/access-page";

export const Route = createFileRoute("/_authenticated/zugriff")({
  validateSearch: (s: Record<string, unknown>): { neu?: boolean; code?: string } => ({
    ...(s["neu"] === true || s["neu"] === "1" || s["neu"] === 1 ? { neu: true } : {}),
    ...(typeof s["code"] === "string" && s["code"].length <= 20 ? { code: s["code"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Zugriff & Einladungen – Azuvera" },
      { name: "description", content: "Bestimme, wer dein Berichtsheft sehen und prüfen darf – mit Einladungs-Code und QR-Code." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Zugriff & Einladungen – Azuvera" },
      { property: "og:description", content: "Einladungen per QR-Code teilen und Zugriffe verwalten." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ZugriffRoute,
});

function ZugriffRoute() {
  const { neu, code } = Route.useSearch();
  return <AccessPage openNew={!!neu} code={code} />;
}

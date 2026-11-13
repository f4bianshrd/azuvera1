import { createFileRoute } from "@tanstack/react-router";
import { InstructionsPage, type InstructionsSearch } from "@/features/instructions/components/instructions-page";

const TITLE = "Unterweisungen – Azuvera";
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export const Route = createFileRoute("/_authenticated/unterweisungen")({
  validateSearch: (s: Record<string, unknown>): InstructionsSearch => ({ azubi: str(s["azubi"]), neu: str(s["neu"]), thema: str(s["thema"]), nachweis: str(s["nachweis"]) }),
  head: () => ({ meta: [
    { title: TITLE },
    { name: "description", content: "Sicherheits- und Fachunterweisungen eintragen, bestätigen lassen und Fristen im Blick behalten." },
    { property: "og:title", content: TITLE },
    { property: "og:description", content: "Unterweisungen mit Fristen, Nachweisen und PDF-Export." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: InstructionsRoute,
});

function InstructionsRoute() {
  return <InstructionsPage search={Route.useSearch()} />;
}

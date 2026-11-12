import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alte Adresse aus Baustein 1B: leitet auf /protokoll weiter. */
export const Route = createFileRoute("/_authenticated/aenderungsprotokoll")({
  beforeLoad: () => { throw redirect({ to: "/protokoll", replace: true }); },
});

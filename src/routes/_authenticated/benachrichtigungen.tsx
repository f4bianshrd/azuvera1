import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alte Adresse – leitet auf /notifications weiter. */
export const Route = createFileRoute("/_authenticated/benachrichtigungen")({
  beforeLoad: () => { throw redirect({ to: "/notifications", replace: true }); },
});

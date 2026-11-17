import { createFileRoute, redirect } from "@tanstack/react-router";

/** Frühere Adresse – führt zur Seite „Zugriff & Einladungen“. */
export const Route = createFileRoute("/_authenticated/verknuepfungen")({
  beforeLoad: () => { throw redirect({ to: "/zugriff", replace: true }); },
});

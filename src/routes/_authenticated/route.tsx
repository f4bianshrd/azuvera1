import { createFileRoute, redirect } from "@tanstack/react-router";
import { currentSession } from "@/features/auth/remember";
import { AppShell } from "@/features/app/app-shell";
import { openUserDb } from "@/lib/sync/db";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // getSession liest die gespeicherte Sitzung lokal – so startet die App auch offline.
    const session = await currentSession();
    const user = session?.user;
    if (user) openUserDb(user.id);
    if (!user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
  },
  component: AppShell,
});

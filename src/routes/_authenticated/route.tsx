import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/features/app/app-shell";
import { openUserDb } from "@/lib/sync/db";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // getSession liest die gespeicherte Sitzung lokal – so startet die App auch offline.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (user) openUserDb(user.id);
    if (!user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
  },
  component: AppShell,
});

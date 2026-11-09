import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export const ROLE_LABELS: Record<AppRole, string> = {
  azubi: "Auszubildende:r",
  ausbilder: "Ausbilder:in",
  betriebsleiter: "Betriebsleiter:in",
  ausbildungsberater: "Ausbildungsberater:in",
  lehrer: "Lehrer:in",
  ausbildungsleitung: "Ausbildungsleitung",
};

export const REVIEWER_ROLES: AppRole[] = ["ausbilder", "betriebsleiter", "ausbildungsleitung"];
export const VIEWER_ROLES: AppRole[] = ["ausbildungsberater", "lehrer"];

export interface MyProfile extends Profile {
  role: AppRole;
}

export function useMyProfile() {
  return useQuery({
    queryKey: ["my-profile"],
    queryFn: async (): Promise<MyProfile | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const [{ data: profile }, { data: roleRow }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
      ]);
      if (!profile) return null;
      return { ...profile, role: (roleRow?.role ?? "azubi") as AppRole };
    },
    staleTime: 30_000,
  });
}

export function initials(p: { vorname: string; nachname: string; email: string } | null | undefined): string {
  if (!p) return "?";
  const a = p.vorname.trim().charAt(0);
  const b = p.nachname.trim().charAt(0);
  return (a + b).toUpperCase() || p.email.charAt(0).toUpperCase() || "?";
}

/** Abmelden: erst laufende Abfragen stoppen und Cache leeren, dann Sitzung beenden. */
export async function signOutAndLeave(
  queryClient: QueryClient,
  navigate: (opts: { to: string; replace?: boolean }) => void,
  global = false,
) {
  await queryClient.cancelQueries();
  queryClient.clear();
  await supabase.auth.signOut(global ? { scope: "global" } : undefined);
  navigate({ to: "/auth", replace: true });
}

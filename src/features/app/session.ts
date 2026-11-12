import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { currentDb, currentUserId, deleteUserDb, openUserDb } from "@/lib/sync/db";
import { stopSync } from "@/lib/sync/engine";
import { clearCacheStorage, getNetworkStatus, setAppBadge } from "@/lib/platform";
import { disablePush } from "@/features/notifications/push";

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
      // Sitzung lokal lesen (funktioniert auch ohne Netz).
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return null;
      const db = openUserDb(user.id);
      const cached = async () => ((await db.lookups.get("profile"))?.value as MyProfile | undefined) ?? null;
      if (!getNetworkStatus().online) return cached();
      try {
        const [{ data: profile, error }, { data: roleRow }] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
          supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
        ]);
        if (error) throw error;
        if (!profile) return null;
        const me = { ...profile, role: (roleRow?.role ?? "azubi") as AppRole };
        await db.lookups.put({ key: "profile", value: me, updated_at: new Date().toISOString() });
        return me;
      } catch (e) {
        const c = await cached();
        if (c) return c;
        throw e;
      }
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

/** Anzahl nicht synchronisierter Änderungen auf diesem Gerät. */
export async function pendingChangeCount(): Promise<number> {
  return (await currentDb()?.outbox.count()) ?? 0;
}

/** Lokale Daten dieses Kontos löschen (Datenbank, Cache Storage). */
export async function clearLocalData(): Promise<void> {
  const uid = currentUserId();
  stopSync();
  if (uid) await deleteUserDb(uid);
  await clearCacheStorage();
}

/** Abmelden: Abfragen stoppen, lokale Datenbank, Cache Storage und Push-Anmeldung löschen, dann Sitzung beenden. */
export async function signOutAndLeave(
  queryClient: QueryClient,
  navigate: (opts: { to: string; replace?: boolean }) => void,
  global = false,
) {
  await queryClient.cancelQueries();
  queryClient.clear();
  await disablePush();
  await setAppBadge(0);
  await clearLocalData();
  await supabase.auth.signOut(global ? { scope: "global" } : undefined);
  navigate({ to: "/auth", replace: true });
}

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { currentDb, currentUserId, deleteUserDb, openUserDb } from "@/lib/sync/db";
import { stopSync } from "@/lib/sync/engine";
import { clearCacheStorage, getNetworkStatus, setAppBadge } from "@/lib/platform";
import { disablePush } from "@/features/notifications/push";
import { currentSession } from "@/features/auth/remember";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export const ROLE_LABELS: Record<AppRole, string> = {
  azubi: "Auszubildende:r",
  ausbilder: "Ausbilder:in",
  betriebsleiter: "Betriebsleiter:in",
  ausbildungsberater: "Ausbildungsberater:in",
  pruefer: "Prüfer:in",
  lehrer: "Lehrer:in",
  ausbildungsleitung: "Ausbildungsleitung",
};

/** Rollen, die bei der Registrierung wählbar sind (Reihenfolge der Auswahlkarten). */
export const SIGNUP_ROLES: AppRole[] = ["azubi", "ausbilder", "betriebsleiter", "ausbildungsberater", "pruefer", "lehrer"];
/** Rollen, die eine Azubi-Person einladen kann. */
export const INVITE_ROLES: AppRole[] = ["ausbilder", "betriebsleiter", "ausbildungsberater", "pruefer", "lehrer"];
/** Rollen mit Prüfrecht (freigeben, zurückweisen, kommentieren). */
export const REVIEWER_ROLES: AppRole[] = ["ausbilder", "betriebsleiter", "ausbildungsberater", "ausbildungsleitung"];
/** Rollen, die eingeladen nur lesen. */
export const VIEWER_ROLES: AppRole[] = ["pruefer", "lehrer"];

export interface MyProfile extends Profile {
  role: AppRole;
  /** Darf die Plattform verwalten (Ausbildungsleitung oder Verwaltungs-Team). */
  is_team: boolean;
  is_team_owner: boolean;
}

export function useMyProfile() {
  return useQuery({
    queryKey: ["my-profile"],
    queryFn: async (): Promise<MyProfile | null> => {
      // Sitzung lokal lesen (funktioniert auch ohne Netz, auch mit abgelaufenem Zugangsschlüssel).
      const session = await currentSession();
      const user = session?.user;
      if (!user) return null;
      const db = openUserDb(user.id);
      const cached = async () => {
        const v = (await db.lookups.get("profile"))?.value as MyProfile | undefined;
        return v ? { ...v, is_team: !!v.is_team, is_team_owner: !!v.is_team_owner } : null;
      };
      if (!getNetworkStatus().online) return cached();
      try {
        const [{ data: profile, error }, { data: roleRow }, { data: teamRow }] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
          supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
          supabase.from("team_members").select("is_owner").eq("user_id", user.id).maybeSingle(),
        ]);
        if (error) throw error;
        if (!profile) return null;
        const me: MyProfile = {
          ...profile,
          role: (roleRow?.role ?? "azubi") as AppRole,
          is_team: !!teamRow || roleRow?.role === "ausbildungsleitung",
          is_team_owner: !!teamRow?.is_owner,
        };
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

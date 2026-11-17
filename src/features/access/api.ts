/** Datenzugriff für Einladungen und Zugriffe (nur online, über SECURITY-DEFINER-Funktionen). */
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/features/app/session";
import { readSessionString, writeSessionString } from "@/lib/platform";
import { normalizeCode } from "./codes";

export type GrantStatus = "active" | "expired" | "ended";
export type InvitationStatus = "open" | "redeemed" | "expired" | "revoked";

export interface AzubiGrant {
  id: string; grantee_name: string | null; organization: string | null; role: AppRole; can_review: boolean;
  deputy_allowed: boolean; created_at: string; valid_until: string | null; revoked_at: string | null; status: GrantStatus;
  deputies: { name: string; date_from: string; date_to: string }[];
}
export interface Invitation {
  id: string; role: AppRole; note: string | null; code: string; expires_at: string; access_days: number | null;
  used_by_name: string | null; used_at: string | null; revoked_at: string | null; status: InvitationStatus;
}
export interface GranteeGrant {
  id: string; azubi_id: string; azubi_name: string | null; profession_name: string | null; role: AppRole; can_review: boolean;
  created_at: string; valid_until: string | null; revoked_at: string | null; status: GrantStatus;
}
export interface AccessOverview {
  as_azubi?: { grants: AzubiGrant[]; invitations: Invitation[] };
  as_grantee?: { grants: GranteeGrant[] };
}

function fail(e: { message?: string } | null): Error {
  return new Error(e?.message || "Das hat nicht geklappt. Bitte versuche es erneut.");
}

export async function myAccessOverview(): Promise<AccessOverview> {
  const { data, error } = await supabase.rpc("my_access_overview");
  if (error) throw fail(error);
  return (data ?? {}) as unknown as AccessOverview;
}

export async function createInvitation(args: { role: AppRole; note: string; validDays: number; accessDays: number | null }) {
  const { data, error } = await supabase.rpc("create_invitation", {
    p_role: args.role, p_note: args.note, p_valid_days: args.validDays, ...(args.accessDays ? { p_access_days: args.accessDays } : {}),
  });
  if (error) throw fail(error);
  const row = data?.[0];
  if (!row) throw fail(null);
  return row as { id: string; code: string; expires_at: string };
}

export async function revokeInvitation(id: string) {
  const { error } = await supabase.rpc("revoke_invitation", { p_id: id });
  if (error) throw fail(error);
}

export async function endAccess(grantId: string) {
  const { error } = await supabase.rpc("end_access", { p_grant: grantId });
  if (error) throw fail(error);
}

export async function setDeputyAllowed(grantId: string, allowed: boolean) {
  const { error } = await supabase.rpc("set_deputy_allowed", { p_grant: grantId, p_allowed: allowed });
  if (error) throw fail(error);
}

/** Löst einen Code ein; Fehler kommen als Text zurück (kein Werfen bei ungültigem Code). */
export async function redeemInvitation(code: string): Promise<{ ok: boolean; error: string | null; azubiId: string | null }> {
  const { data, error } = await supabase.rpc("redeem_invitation", { p_code: normalizeCode(code) });
  if (error) throw fail(error);
  const row = data?.[0];
  return { ok: !!row?.ok, error: row?.error ?? null, azubiId: row?.azubi_id ?? null };
}

/** Darf die angemeldete Person zu Berichten dieser Person Rückmeldungen schreiben? */
export async function canCommentFor(azubiId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase.rpc("can_comment_for", { _user: user.id, _azubi: azubiId });
  if (error) throw fail(error);
  return data === true;
}

/* ---------- Verwaltung (Ausbildungsleitung) ---------- */

export interface AdminUser { id: string; full_name: string; email: string; role: AppRole; organization: string | null; is_team: boolean; created_at: string }
export interface AdminStats {
  users_total: number; users_by_role: Record<string, number>; new_7d: number; new_30d: number;
  active_grants: number; open_invitations: number; open_deletion_requests: number;
}

export async function adminListUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc("admin_list_users");
  if (error) throw fail(error);
  return (data ?? []) as AdminUser[];
}

export async function adminStats(): Promise<AdminStats> {
  const { data, error } = await supabase.rpc("admin_stats");
  if (error) throw fail(error);
  return data as unknown as AdminStats;
}

export async function adminSetUserRole(userId: string, role: AppRole) {
  const { error } = await supabase.rpc("admin_set_user_role", { p_user: userId, p_role: role });
  if (error) throw fail(error);
}

/** Ausstehender Code aus /einladung (sessionStorage „az_invite“). */
export const PENDING_INVITE_KEY = "az_invite";
export function readPendingInvite(): string | null {
  return readSessionString(PENDING_INVITE_KEY);
}
export function storePendingInvite(code: string) {
  writeSessionString(PENDING_INVITE_KEY, normalizeCode(code));
}
export function clearPendingInvite() {
  writeSessionString(PENDING_INVITE_KEY, null);
}

export interface TeamMember { user_id: string; full_name: string; email: string; is_owner: boolean; created_at: string }

export async function adminListTeam(): Promise<TeamMember[]> {
  const { data, error } = await supabase.rpc("admin_list_team");
  if (error) throw fail(error);
  return (data ?? []) as TeamMember[];
}

export async function adminAddTeamMember(email: string) {
  const { error } = await supabase.rpc("admin_add_team_member", { p_email: email.trim() });
  if (error) throw fail(error);
}

export async function adminRemoveTeamMember(userId: string) {
  const { error } = await supabase.rpc("admin_remove_team_member", { p_user: userId });
  if (error) throw fail(error);
}

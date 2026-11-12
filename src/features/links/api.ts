/** Datenzugriff für Verknüpfungscodes und Verknüpfungen (nur online, über SECURITY-DEFINER-Funktionen). */
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/features/app/session";
import type { LinkAccess } from "./codes";

export interface LinkCode { id: string; code: string; access: LinkAccess; expires_at: string; used_at: string | null; revoked_at: string | null; created_at: string }
export interface LinkRow { azubi_id: string; azubi_name: string; member_id: string; member_name: string; member_role: AppRole | null; access: LinkAccess; is_primary: boolean; created_at: string }
export interface CodePreview { azubi_name: string; access: LinkAccess; expires_at: string; allowed: boolean }

function message(e: { message?: string } | null): Error {
  return new Error(e?.message || "Das hat nicht geklappt. Bitte versuche es erneut.");
}

export async function createLinkCode(access: LinkAccess, hours: number): Promise<LinkCode> {
  const { data, error } = await supabase.rpc("create_link_code", { p_access: access, p_hours: hours });
  if (error) throw message(error);
  const row = data?.[0];
  if (!row) throw message(null);
  return { ...row, access: row.access as LinkAccess, used_at: null, revoked_at: null, created_at: new Date().toISOString() };
}

export async function listMyCodes(): Promise<LinkCode[]> {
  const { data, error } = await supabase.from("link_codes").select("id, code, access, expires_at, used_at, revoked_at, created_at").order("created_at", { ascending: false }).limit(50);
  if (error) throw message(error);
  return (data ?? []).map((r) => ({ ...r, access: r.access as LinkAccess }));
}

export async function revokeLinkCode(id: string): Promise<void> {
  const { error } = await supabase.rpc("revoke_link_code", { p_id: id });
  if (error) throw message(error);
}

export async function listLinks(): Promise<LinkRow[]> {
  const { data, error } = await supabase.rpc("list_links");
  if (error) throw message(error);
  return (data ?? []).map((r) => ({ ...r, access: r.access as LinkAccess }));
}

export async function removeLink(azubiId: string, memberId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_link", { p_azubi: azubiId, p_member: memberId });
  if (error) throw message(error);
}

export async function previewLinkCode(code: string): Promise<CodePreview> {
  const { data, error } = await supabase.rpc("preview_link_code", { p_code: code });
  if (error) throw message(error);
  const row = data?.[0];
  if (!row) throw new Error("Dieser Code ist ungültig, abgelaufen oder schon eingelöst.");
  return { ...row, access: row.access as LinkAccess };
}

export async function redeemLinkCode(code: string): Promise<{ azubi_id: string; azubi_name: string; access: LinkAccess }> {
  const { data, error } = await supabase.rpc("redeem_link_code", { p_code: code });
  if (error) throw message(error);
  const row = data?.[0];
  if (!row) throw message(null);
  return { ...row, access: row.access as LinkAccess };
}

/** Darf die angemeldete Person zu Berichten dieser Person Rückmeldungen schreiben? */
export async function canCommentFor(azubiId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase.rpc("can_comment_for", { _user: user.id, _azubi: azubiId });
  if (error) throw message(error);
  return data === true;
}

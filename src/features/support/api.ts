/** Datenzugriff für Support-Tickets und IT/Technik (nur online, über SECURITY-DEFINER-Funktionen). */
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/features/app/session";
import { hashTicketCode, type SupportScope } from "./scopes";

function fail(e: { message?: string } | null): Error {
  return new Error(e?.message || "Das hat nicht geklappt. Bitte versuche es erneut.");
}

// ---------- Für alle: eigene Support-ID, Tickets, Protokoll ----------
export interface MyTicket {
  id: string; betreff: string; beschreibung: string; scopes: string[]; status: string;
  gueltig_bis: string; erstellt_am: string; eingeloest_am: string | null; sitzung_aktiv: boolean;
}
export interface AccessLogEntry {
  id: number; erstellt_am: string; aktion: string; tabelle: string | null; geaenderte_felder: string[]; agent_name: string; methode: string | null;
}

export async function getMyRef(): Promise<string> {
  const { data, error } = await supabase.rpc("support_my_ref");
  if (error) throw fail(error);
  return data as string;
}

export async function listMyTickets(): Promise<MyTicket[]> {
  const { data, error } = await supabase.rpc("support_my_tickets");
  if (error) throw fail(error);
  return (data ?? []) as MyTicket[];
}

/** Code wird auf dem Gerät erzeugt; an den Server geht nur die Prüfsumme. */
export async function createTicket(p: { betreff: string; beschreibung: string; scopes: SupportScope[]; hours: number; code: string }) {
  const { data, error } = await supabase.rpc("support_create_ticket", {
    p_betreff: p.betreff, p_beschreibung: p.beschreibung, p_scopes: p.scopes, p_hours: p.hours, p_code_hash: await hashTicketCode(p.code),
  });
  if (error) throw fail(error);
  return data as string;
}

export async function revokeTicket(id: string) {
  const { error } = await supabase.rpc("support_revoke_ticket", { p_ticket: id });
  if (error) throw fail(error);
}

export async function listMyAccessLog(): Promise<AccessLogEntry[]> {
  const { data, error } = await supabase.rpc("support_my_access_log");
  if (error) throw fail(error);
  return (data ?? []) as AccessLogEntry[];
}

// ---------- IT/Technik ----------
export interface AgentStatus { is_agent: boolean; mfa_ok: boolean; code_locked: boolean }
export interface DirectoryRow { ref: string; role: AppRole | null; registriert_am: string; status: string; sitzung_aktiv: boolean }
export interface ActiveSession {
  id: string; ziel_user_id: string; ref: string; methode: "ticket" | "identitaet"; scopes: string[];
  schreiben_erlaubt: boolean; grund: string; gestartet_am: string; laeuft_ab_am: string;
}
export interface SessionRow {
  id: string; ref: string | null; methode: string; scopes: string[]; grund: string; gestartet_am: string; laeuft_ab_am: string; beendet_am: string | null;
}
export interface PersonReport {
  id: string; report_type: string; report_date: string; week_number: number | null; year: number | null; status: string; version: number;
  activities: string | null; school_content: string | null; instructions: string | null; summary: string | null; updated_at: string;
}
export interface PersonAttachment {
  kind: "report" | "experience" | "leittext"; id: string; parent_id: string; file_name: string; mime_type: string; size_bytes: number;
  parent_status: string; created_at: string;
}
export interface PersonGrant {
  id: string; role: AppRole; direction: "erteilt" | "erhalten"; other_ref: string | null; created_at: string; valid_until: string | null; revoked_at: string | null;
}
export interface PersonView {
  ref: string; role: AppRole;
  profile: Record<string, string | null>;
  training: { profession_id: string | null; profession_name: string | null; company_id: string | null; company_name: string | null;
    ausbildungsbeginn: string | null; ausbildungsende: string | null; bundesland: string | null; plan_title: string | null };
  reports: PersonReport[];
  experience: { id: string; title: string; status: string; written_on: string }[];
  leittexte: { id: string; title: string; status: string; updated_at: string }[];
  attachments: PersonAttachment[];
  grants: PersonGrant[];
  counts: { absences: number; grades: number; instructions: number };
  professions: { id: string; name: string }[];
  companies: { id: string; name: string }[];
  bundeslaender: { code: string; name: string }[];
}
type Result = { ok: boolean; error?: string; session_id?: string };

export async function getAgentStatus(): Promise<AgentStatus> {
  const { data, error } = await supabase.rpc("support_my_status");
  if (error) throw fail(error);
  return data as unknown as AgentStatus;
}

export async function getDirectory(): Promise<DirectoryRow[]> {
  const { data, error } = await supabase.rpc("support_directory");
  if (error) throw fail(error);
  return (data ?? []) as DirectoryRow[];
}

export async function getActiveSession(): Promise<ActiveSession | null> {
  const { data, error } = await supabase.rpc("support_active_session");
  if (error) throw fail(error);
  return (data ?? null) as unknown as ActiveSession | null;
}

export async function listMySessions(): Promise<SessionRow[]> {
  const { data, error } = await supabase.rpc("support_my_sessions");
  if (error) throw fail(error);
  return (data ?? []) as SessionRow[];
}

export async function redeemCode(code: string): Promise<Result> {
  const { data, error } = await supabase.rpc("support_redeem_ticket", { p_code: code });
  if (error) throw fail(error);
  return data as unknown as Result;
}

export async function verifyIdentity(p: { vorname: string; nachname: string; geburtsdatum: string; email: string; telefon: string; grund: string }): Promise<Result> {
  const { data, error } = await supabase.rpc("support_verify_identity", {
    p_vorname: p.vorname, p_nachname: p.nachname, p_geburtsdatum: p.geburtsdatum, p_email: p.email, p_telefon: p.telefon, p_grund: p.grund,
  });
  if (error) throw fail(error);
  return data as unknown as Result;
}

export async function endSession(id: string) {
  const { error } = await supabase.rpc("support_end_session", { p_session: id });
  if (error) throw fail(error);
}

export async function getPersonView(ziel: string): Promise<PersonView> {
  const { data, error } = await supabase.rpc("support_person_view", { p_ziel: ziel });
  if (error) throw fail(error);
  return data as unknown as PersonView;
}

export async function updateProfile(ziel: string, fields: Record<string, string | null>) {
  const { error } = await supabase.rpc("support_update_profile", { p_ziel: ziel, p_fields: fields });
  if (error) throw fail(error);
}

export async function updateTraining(ziel: string, fields: Record<string, string | null>) {
  const { error } = await supabase.rpc("support_update_training", { p_ziel: ziel, p_fields: fields });
  if (error) throw fail(error);
}

export async function updateReport(ziel: string, report: string, fields: Record<string, string>) {
  const { error } = await supabase.rpc("support_update_report", { p_ziel: ziel, p_report: report, p_fields: fields });
  if (error) throw fail(error);
}

async function removeFiles(res: unknown) {
  const r = res as { bucket?: string; paths?: string[] } | null;
  if (!r?.bucket || !r.paths?.length) return;
  // Dateien liegen im nicht öffentlichen Speicher; Fehler hier lassen nur eine verwaiste Datei zurück.
  await supabase.storage.from(r.bucket).remove(r.paths).catch(() => undefined);
}

export async function deleteReport(ziel: string, report: string) {
  const { data, error } = await supabase.rpc("support_delete_report", { p_ziel: ziel, p_report: report });
  if (error) throw fail(error);
  await removeFiles(data);
}

export async function deleteAttachment(ziel: string, kind: PersonAttachment["kind"], id: string) {
  const { data, error } = await supabase.rpc("support_delete_attachment", { p_ziel: ziel, p_kind: kind, p_id: id });
  if (error) throw fail(error);
  await removeFiles(data);
}

export async function revokeAccess(ziel: string, grant: string) {
  const { error } = await supabase.rpc("support_revoke_access", { p_ziel: ziel, p_grant: grant });
  if (error) throw fail(error);
}

/** Passwort-Reset-Mail auslösen oder E-Mail-Änderung mit Bestätigung starten (läuft über den Server). */
export async function supportAction(ziel: string, action: "password_reset" | "email_change", newEmail?: string) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/support-action", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
    body: JSON.stringify({ ziel, action, ...(newEmail ? { newEmail } : {}) }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof body["error"] === "string" ? body["error"] : "Das hat nicht geklappt.");
}

// ---------- Zwei-Faktor-Anmeldung ----------
export interface MfaState { level: "aal1" | "aal2" | null; verifiedFactorId: string | null }

export async function getMfaState(): Promise<MfaState> {
  const [{ data: aal }, { data: factors }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  const verified = factors?.totp?.find((f) => f.status === "verified") ?? null;
  return { level: (aal?.currentLevel ?? null) as MfaState["level"], verifiedFactorId: verified?.id ?? null };
}

export async function enrollTotp(): Promise<{ factorId: string; qr: string; secret: string }> {
  // Halbfertige Einrichtungen entfernen, sonst lehnt die Anmeldung eine neue ab.
  const { data: list } = await supabase.auth.mfa.listFactors();
  for (const f of list?.all ?? []) {
    if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => undefined);
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Azuvera Support ${new Date().toISOString().slice(0, 10)}` });
  if (error) throw new Error(error.message.includes("disabled") ? "Die Zwei-Faktor-Anmeldung ist für dieses Projekt nicht freigeschaltet." : "Die Einrichtung hat nicht geklappt. Bitte versuche es erneut.");
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyTotp(factorId: string, code: string) {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, "") });
  if (error) throw new Error("Der Code stimmt nicht. Bitte nimm den aktuellen Code aus deiner App.");
}

// ---------- Verwaltung: Support-Konten ----------
export interface SupportAgent { user_id: string; full_name: string; email: string; previous_role: AppRole; added_at: string; has_mfa: boolean }

export async function adminListSupportAgents(): Promise<SupportAgent[]> {
  const { data, error } = await supabase.rpc("admin_list_support_agents");
  if (error) throw fail(error);
  return (data ?? []) as SupportAgent[];
}

export async function adminAddSupportAgent(email: string) {
  const { error } = await supabase.rpc("admin_add_support_agent", { p_email: email });
  if (error) throw fail(error);
}

export async function adminRemoveSupportAgent(userId: string) {
  const { error } = await supabase.rpc("admin_remove_support_agent", { p_user: userId });
  if (error) throw fail(error);
}

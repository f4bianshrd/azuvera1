/** Datenzugriff für Ausbildungszeugnis und Prüfungsantrag (nur online, Schreiben nur über Datenbank-Funktionen). */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getExportHeader } from "@/features/export/api";
import type { ApplicationStatus, CertificateKind, CertificateStatus, Values } from "./model";

export interface Certificate {
  id: string;
  azubi_id: string;
  kind: CertificateKind;
  status: CertificateStatus;
  request_note: string | null;
  requested_at: string | null;
  content: Values;
  issued_at: string | null;
  issuer_name: string | null;
  version: number;
  can_edit: boolean;
}

export type ExamApplication = Omit<Database["public"]["Tables"]["exam_applications"]["Row"], "data" | "status"> & { data: Values; status: ApplicationStatus };

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function getCertificate(azubiId: string): Promise<Certificate | null> {
  const { data, error } = await supabase.rpc("get_training_certificate", { p_azubi: azubiId });
  fail(error);
  return (data as unknown as Certificate | null) ?? null;
}

export async function requestCertificate(kind: CertificateKind, note: string): Promise<void> {
  const { error } = await supabase.rpc("request_training_certificate", { p_kind: kind, p_note: note });
  fail(error);
}

export async function saveCertificate(azubiId: string, kind: CertificateKind, content: Values, expectedVersion: number): Promise<number> {
  const { data, error } = await supabase.rpc("save_training_certificate", { p_azubi: azubiId, p_kind: kind, p_content: content as never, p_expected_version: expectedVersion });
  fail(error);
  return data as number;
}

export async function issueCertificate(azubiId: string, expectedVersion: number): Promise<void> {
  const { error } = await supabase.rpc("issue_training_certificate", { p_azubi: azubiId, p_expected_version: expectedVersion });
  fail(error);
}

/** Vorschlag für ein neues Zeugnis aus den Ausbildungsdaten. */
export async function certificateDefaults(azubiId: string): Promise<Values> {
  const h = await getExportHeader(azubiId);
  return {
    beruf: h.profession_name ?? "", betrieb: h.company_name ?? "", betrieb_anschrift: h.company_address ?? "",
    beginn: h.training_start ?? "", ende: h.training_end ?? "", ausbilder_name: h.ausbilder_name ?? "",
    datum: new Date().toISOString().slice(0, 10),
  };
}

export async function listApplications(azubiId: string): Promise<ExamApplication[]> {
  const { data, error } = await supabase.from("exam_applications").select("*").eq("azubi_id", azubiId).order("created_at", { ascending: false });
  fail(error);
  return (data ?? []) as unknown as ExamApplication[];
}

export async function saveApplication(id: string, term: string, data: Values, expectedVersion: number): Promise<number> {
  const { data: v, error } = await supabase.rpc("save_exam_application", { p_id: id, p_term: term, p_data: data as never, p_expected_version: expectedVersion });
  fail(error);
  return v as number;
}

export async function deleteApplication(id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_exam_application", { p_id: id });
  fail(error);
}

export async function submitApplication(id: string, expectedVersion: number): Promise<void> {
  const { error } = await supabase.rpc("submit_exam_application", { p_id: id, p_expected_version: expectedVersion });
  fail(error);
}

export async function confirmApplication(id: string, expectedVersion: number, note: string): Promise<void> {
  const { error } = await supabase.rpc("confirm_exam_application", { p_id: id, p_expected_version: expectedVersion, p_note: note });
  fail(error);
}

export async function returnApplication(id: string, note: string): Promise<void> {
  const { error } = await supabase.rpc("return_exam_application", { p_id: id, p_note: note });
  fail(error);
}

/** Vorschlag für einen neuen Antrag aus Profil und Ausbildungsdaten. */
export async function applicationDefaults(azubiId: string): Promise<Values> {
  const [h, { data: p }] = await Promise.all([
    getExportHeader(azubiId),
    supabase.from("profiles").select("geburtsdatum, strasse, plz, ort, telefon, email").eq("id", azubiId).maybeSingle(),
  ]);
  const anschrift = [p?.strasse, [p?.plz, p?.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return {
    geburtsdatum: p?.geburtsdatum ?? "", anschrift, telefon: p?.telefon ?? "", email: p?.email ?? "",
    beruf: h.profession_name ?? "", betrieb: h.company_name ?? "", betrieb_anschrift: h.company_address ?? "",
    ausbilder: h.ausbilder_name ?? "", beginn: h.training_start ?? "", ende: h.training_end ?? "",
  };
}

export async function canReviewFor(azubiId: string): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user.id;
  if (!uid || uid === azubiId) return false;
  const { data, error } = await supabase.rpc("can_review_for", { _reviewer: uid, _azubi: azubiId });
  fail(error);
  return !!data;
}

export async function azubiName(azubiId: string): Promise<string> {
  const h = await getExportHeader(azubiId);
  return h.azubi_name ?? "";
}

export async function personName(id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data } = await supabase.from("profiles").select("full_name").eq("id", id).maybeSingle();
  return data?.full_name ?? null;
}

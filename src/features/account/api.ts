import { strToU8, zipSync, type Zippable } from "fflate";
import { supabase } from "@/integrations/supabase/client";
import { dataExportFileName, uniqueName, zipSafeName } from "./rules";

/* ---------- Auskunft und Datenexport ---------- */

export type MyDataExport = Record<string, unknown> & {
  generated_at: string;
  report_attachments: { id: string; report_id: string; storage_path: string; file_name: string }[];
  report_signatures: { id: string; image_path: string | null; own: boolean }[];
  user_signatures: { image_path: string | null }[];
};

export class DataExportCancelled extends Error {}

export async function fetchMyData(): Promise<MyDataExport> {
  const { data, error } = await supabase.rpc("export_my_data");
  if (error) throw error;
  return data as unknown as MyDataExport;
}

async function download(bucket: string, path: string): Promise<Uint8Array | null> {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 120);
  if (!data?.signedUrl) return null;
  try {
    const res = await fetch(data.signedUrl);
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch { return null; }
}

function readme(created: Date, withFiles: boolean, missing: number): string {
  const ts = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "long", timeStyle: "short" }).format(created);
  return [
    "AZUVERA – DATENEXPORT",
    "",
    `Erstellt am ${ts} Uhr.`,
    "",
    "Inhalt:",
    "- daten.json: alle bei Azuvera zu deinem Konto gespeicherten Daten (Profil, Rolle, Einwilligungen,",
    "  Benachrichtigungs-Einstellungen, Geräte, Berichte inkl. Entwürfe, Versionen, Unterschriften, Kommentare,",
    "  Abwesenheiten, Noten, Benachrichtigungen, Vertretungen, KI-Nutzung, Löschanträge und Protokolleinträge).",
    withFiles ? "- anhaenge/{Bericht-ID}/: die Originaldateien deiner Anhänge." : "- Anhänge wurden auf Wunsch nicht eingeschlossen.",
    withFiles ? "- unterschriften/: die Bilder deiner Unterschriften." : "- Unterschriftsbilder wurden auf Wunsch nicht eingeschlossen.",
    ...(missing ? [`- ${missing} Datei(en) konnten nicht geladen werden.`] : []),
    "",
    "Dieser Export erfüllt dein Recht auf Auskunft (Art. 15 DSGVO) und auf Datenübertragbarkeit (Art. 20 DSGVO).",
    "Die Datei enthält persönliche Daten. Bewahre sie sicher auf.",
    "",
  ].join("\r\n");
}

export interface DataExportProgress { done: number; total: number }

/** ZIP im Browser bauen: daten.json, anhaenge/, unterschriften/, LIESMICH.txt. */
export async function buildMyDataZip(
  data: MyDataExport,
  opts: { withFiles: boolean; signal: AbortSignal; onProgress: (p: DataExportProgress) => void },
): Promise<{ blob: Blob; filename: string }> {
  const created = new Date();
  const files: Zippable = { "daten.json": strToU8(JSON.stringify(data, null, 2)) };
  let missing = 0;
  if (opts.withFiles) {
    const sigPaths = [
      ...data.report_signatures.filter((s) => s.own && s.image_path).map((s) => s.image_path!),
      ...data.user_signatures.map((u) => u.image_path).filter((p): p is string => !!p),
    ].filter((p, i, a) => a.indexOf(p) === i);
    const total = data.report_attachments.length + sigPaths.length;
    let done = 0;
    opts.onProgress({ done, total });
    const used = new Map<string, Set<string>>();
    for (const a of data.report_attachments) {
      if (opts.signal.aborted) throw new DataExportCancelled();
      const bytes = await download("report-files", a.storage_path);
      if (bytes) {
        const folder = `anhaenge/${a.report_id}`;
        const set = used.get(folder) ?? new Set<string>(); used.set(folder, set);
        files[`${folder}/${uniqueName(set, zipSafeName(a.file_name, `${a.id}`))}`] = bytes;
      } else missing++;
      opts.onProgress({ done: ++done, total });
    }
    const sigSet = new Set<string>();
    for (const p of sigPaths) {
      if (opts.signal.aborted) throw new DataExportCancelled();
      const bytes = await download("signatures", p);
      if (bytes) files[`unterschriften/${uniqueName(sigSet, zipSafeName(p.split("/").pop() ?? "unterschrift.png"))}`] = bytes;
      else missing++;
      opts.onProgress({ done: ++done, total });
    }
  }
  if (opts.signal.aborted) throw new DataExportCancelled();
  files["LIESMICH.txt"] = strToU8(readme(created, opts.withFiles, missing));
  return { blob: new Blob([zipSync(files, { level: 6 }) as BlobPart], { type: "application/zip" }), filename: dataExportFileName(created) };
}

export async function logDataExport(): Promise<void> {
  const { error } = await supabase.rpc("log_data_export");
  if (error) throw error;
}

/* ---------- Löschantrag ---------- */

export interface DeletionRequest {
  id: string; user_id: string; note: string | null; status: "open" | "rejected" | "withdrawn" | "done";
  handled_at: string | null; handled_note: string | null; created_at: string;
}

/** Neuester eigener Antrag (offen oder zuletzt bearbeitet). */
export async function myLatestDeletionRequest(userId: string): Promise<DeletionRequest | null> {
  const { data, error } = await supabase.from("deletion_requests")
    .select("id, user_id, note, status, handled_at, handled_note, created_at")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as DeletionRequest | null;
}

export async function requestDeletion(note: string): Promise<string> {
  const { data, error } = await supabase.rpc("request_account_deletion", { p_note: note });
  if (error) throw new Error(error.message);
  return data;
}

export async function withdrawDeletion(id: string): Promise<void> {
  const { error } = await supabase.rpc("withdraw_account_deletion", { p_id: id });
  if (error) throw new Error(error.message);
}

/* ---------- Ausbildungsleitung ---------- */

export async function listOpenDeletionRequests(): Promise<DeletionRequest[]> {
  const { data, error } = await supabase.from("deletion_requests")
    .select("id, user_id, note, status, handled_at, handled_note, created_at")
    .eq("status", "open").order("created_at");
  if (error) throw error;
  return (data ?? []) as DeletionRequest[];
}

export async function rejectDeletion(id: string, note: string): Promise<void> {
  const { error } = await supabase.rpc("reject_account_deletion", { p_id: id, p_note: note });
  if (error) throw new Error(error.message);
}

export interface DeleteAccountResult { ok: true; mode: "deleted" | "anonymized"; filesRemoved: number; filesFailed: number }

export async function deleteAccount(userId: string, confirmEmail: string): Promise<DeleteAccountResult> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/delete-account", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
    body: JSON.stringify({ userId, confirmEmail }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof body["error"] === "string" ? body["error"] : "Das hat nicht geklappt.");
  return body as unknown as DeleteAccountResult;
}

/**
 * Datenzugriff für Leittexte. Eigene Bearbeitungen der Azubis: zuerst lokal (Dexie), dann Synchronisation.
 * Fremde Bearbeitungen, Freigabe, Kommentare und Export-Protokoll: nur online.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { getNetworkStatus } from "@/lib/platform";
import { currentDb, type LocalLeittextAttachment, type LocalLeittextWork, type SyncState } from "@/lib/sync/db";
import { changed, dropWaiting, enqueue, formatMb, hasOutbox, myId, nowIso, ownScope } from "@/lib/sync/local";
import { cachedOnline } from "@/lib/sync/online-cache";
import { signedUrl } from "@/features/reports/api";
import type { ProcessedFile } from "@/features/reports/attachments";
import { parseContent, type Answers, type LeittextContent, type WorkHeader } from "./model";

type Tables = Database["public"]["Tables"];
export type LeittextRow = Tables["leittexts"]["Row"];
export type Leittext = Omit<LeittextRow, "content"> & { content: LeittextContent };
export type WorkRow = Tables["leittext_works"]["Row"];
export type Work = Omit<WorkRow, "answers" | "header"> & { answers: Answers; header: WorkHeader; _sync?: SyncState; _submit_pending?: boolean; _error?: string | null };
export type WorkImage = Tables["leittext_attachments"]["Row"] & { _sync?: SyncState; _base_version?: number | null };
export type LeittextComment = Tables["leittext_comments"]["Row"];
export type QueueItem = Database["public"]["Functions"]["leittext_review_queue"]["Returns"][number];

export const OFFLINE_MESSAGE = "Dafür brauchst du eine Internetverbindung.";
function requireOnline(): void {
  if (!getNetworkStatus().online) throw new Error(OFFLINE_MESSAGE);
}
const toLeittext = (r: LeittextRow): Leittext => ({ ...r, content: parseContent(r.content) });
const toWork = (r: WorkRow | LocalLeittextWork): Work => ({ ...(r as LocalLeittextWork), answers: (r.answers ?? {}) as Answers, header: (r.header ?? {}) as WorkHeader });

// ---------- Katalog ----------
export async function listCatalog(): Promise<Leittext[]> {
  const db = currentDb();
  if (db && !getNetworkStatus().online) {
    const cached = (await db.lookups.get("leittexts"))?.value as LeittextRow[] | undefined;
    if (cached) return cached.map(toLeittext);
  }
  return cachedOnline("leittexts", async () => {
    const { data, error } = await supabase.from("leittexts").select("*").order("sort_order").limit(500);
    if (error) throw error;
    if (db) await db.lookups.put({ key: "leittexts", value: data ?? [], updated_at: nowIso() });
    return (data ?? []).map(toLeittext);
  });
}

/** Berufs-Kürzel der angemeldeten Person (aus dem Gerätespeicher). */
export async function myProfessionCode(): Promise<string | null> {
  const p = (await currentDb()?.lookups.get("profession"))?.value as { code?: string | null } | undefined;
  return p?.code ?? null;
}

// ---------- Bearbeitungen ----------
export async function listMyWorks(): Promise<Work[]> {
  const uid = myId();
  const db = currentDb();
  if (!db || !uid) return [];
  return (await db.leittext_works.where("azubi_id").equals(uid).toArray()).map(toWork);
}

export async function listWorksFor(azubiId: string): Promise<Work[]> {
  if (await ownScope(azubiId)) return listMyWorks();
  return cachedOnline(`leittext-works:${azubiId}`, async () => {
    const { data, error } = await supabase.from("leittext_works").select("*").eq("azubi_id", azubiId);
    if (error) throw error;
    return (data ?? []).map(toWork);
  });
}

export interface WorkDetail { work: Work; leittext: Leittext; images: WorkImage[]; own: boolean }

export async function getWork(id: string): Promise<WorkDetail | null> {
  const db = currentDb();
  const local = db ? await db.leittext_works.get(id) : undefined;
  const catalog = await listCatalog();
  if (db && local) {
    const leittext = catalog.find((l) => l.id === local.leittext_id);
    if (!leittext) return null;
    const images = (await db.leittext_attachments.where("work_id").equals(id).toArray()).sort((a, b) => a.sort_order - b.sort_order);
    return { work: toWork(local), leittext, images, own: true };
  }
  return cachedOnline(`leittext-work:${id}`, async () => {
    const [{ data: work, error }, { data: images }] = await Promise.all([
      supabase.from("leittext_works").select("*").eq("id", id).maybeSingle(),
      supabase.from("leittext_attachments").select("*").eq("work_id", id).order("sort_order"),
    ]);
    if (error) throw error;
    if (!work) return null;
    let leittext = catalog.find((l) => l.id === work.leittext_id);
    if (!leittext) {
      const { data } = await supabase.from("leittexts").select("*").eq("id", work.leittext_id).maybeSingle();
      if (!data) return null;
      leittext = toLeittext(data);
    }
    return { work: toWork(work), leittext, images: images ?? [], own: work.azubi_id === myId() };
  });
}

/** Bearbeitung beginnen (oder vorhandene zurückgeben). Neue Datensätze bekommen ihre ID auf dem Gerät. */
export async function startWork(leittextId: string, header: WorkHeader): Promise<string> {
  const db = currentDb();
  const uid = myId();
  if (!db || !uid) throw new Error("Lokaler Speicher ist nicht bereit.");
  const existing = await db.leittext_works.where("azubi_id").equals(uid).filter((w) => w.leittext_id === leittextId).first();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const now = nowIso();
  const row: LocalLeittextWork = {
    id, azubi_id: uid, leittext_id: leittextId, header: header as Json, answers: {}, status: "draft", version: 1, content_hash: null,
    submitted_at: null, reviewed_at: null, reviewer_id: null, review_note: null, created_at: now, updated_at: now,
    _sync: "pending", _base_version: null, _submit_pending: false, _server: null,
  };
  await db.leittext_works.put(row);
  await enqueue({ record: `leittext:${id}`, op: "leittext.upsert", payload: { id }, title: "Leittext speichern" });
  return id;
}

/** Automatisch speichern: lokal sofort, Server über die Warteschlange. */
export async function saveWork(id: string, patch: { header?: WorkHeader; answers?: Answers }): Promise<void> {
  const db = currentDb();
  const row = db ? await db.leittext_works.get(id) : undefined;
  if (!db || !row) throw new Error("Leittext nicht gefunden.");
  if (row._submit_pending) throw new Error("Wird eingereicht, sobald du online bist.");
  if (row.status !== "draft" && row.status !== "rejected") throw new Error("Eingereichte und freigegebene Leittexte lassen sich nicht ändern.");
  const next: LocalLeittextWork = {
    ...row,
    ...(patch.header ? { header: patch.header as Json } : {}),
    ...(patch.answers ? { answers: patch.answers as Json } : {}),
    updated_at: nowIso(), _sync: row._sync === "conflict" ? "conflict" : "pending",
  };
  await db.leittext_works.put(next);
  if (row._sync !== "conflict") await enqueue({ record: `leittext:${id}`, op: "leittext.upsert", payload: { id }, title: "Leittext speichern" });
  else changed();
}

export async function deleteWork(id: string): Promise<void> {
  const db = currentDb();
  const row = db ? await db.leittext_works.get(id) : undefined;
  if (!db || !row) throw new Error("Leittext nicht gefunden.");
  if (row.status !== "draft") throw new Error("Nur Entwürfe lassen sich löschen.");
  const imgs = await db.leittext_attachments.where("work_id").equals(id).toArray();
  for (const a of imgs) {
    await dropWaiting(db, `lt_attachment:${a.id}`);
    await db.files.bulkDelete([`ltatt:${a.id}:original`, `ltatt:${a.id}:thumb`]);
  }
  await db.leittext_attachments.bulkDelete(imgs.map((a) => a.id));
  await dropWaiting(db, `leittext:${id}`);
  await db.leittext_works.delete(id);
  if (row._base_version !== null || (await hasOutbox(db, `leittext:${id}`))) {
    await enqueue({ record: `leittext:${id}`, op: "leittext.delete", payload: { id }, title: "Leittext löschen" });
  } else changed();
}

export async function submitWork(id: string): Promise<void> {
  const db = currentDb();
  const row = db ? await db.leittext_works.get(id) : undefined;
  if (!db || !row) throw new Error("Leittext nicht gefunden.");
  if (!row.answers || Object.keys(row.answers as object).length === 0) throw new Error("Bitte bearbeite zuerst mindestens eine Aufgabe.");
  await db.leittext_works.update(id, { _submit_pending: true, _sync: "pending" });
  await enqueue({ record: `leittext:${id}`, op: "leittext.submit", payload: { id }, title: "Leittext einreichen" });
}

function rethrow(error: { message: string }): never { throw new Error(error.message); }
export async function approveWork(id: string, expectedVersion: number, note?: string): Promise<void> {
  requireOnline();
  const { error } = await supabase.rpc("approve_leittext", { p_id: id, p_expected_version: expectedVersion, ...(note ? { p_note: note } : {}) });
  if (error) rethrow(error);
}
export async function rejectWork(id: string, expectedVersion: number, note: string): Promise<void> {
  requireOnline();
  const { error } = await supabase.rpc("reject_leittext", { p_id: id, p_expected_version: expectedVersion, p_note: note });
  if (error) rethrow(error);
}
export async function reopenWork(id: string, reason: string): Promise<void> {
  requireOnline();
  const { error } = await supabase.rpc("reopen_leittext", { p_id: id, p_reason: reason });
  if (error) rethrow(error);
}

// ---------- Fotos und Skizzen ----------
export async function addImage(work: { id: string; azubi_id: string }, fieldKey: string, file: ProcessedFile, fileName: string, sortOrder: number): Promise<void> {
  const db = currentDb();
  if (!db) throw new Error("Lokaler Speicher ist nicht bereit.");
  if (file.mimeType !== "image/jpeg") throw new Error("Hier sind nur Fotos und Bilder möglich.");
  const id = crypto.randomUUID();
  const base = `${work.azubi_id}/${work.id}/${id}`;
  const row: LocalLeittextAttachment = {
    id, work_id: work.id, azubi_id: work.azubi_id, field_key: fieldKey, storage_path: `${base}.jpg`, thumb_path: file.thumb ? `${base}_thumb.jpg` : null,
    file_name: fileName, mime_type: "image/jpeg", size_bytes: file.blob.size, width: file.width ?? null, height: file.height ?? null,
    sha256: file.sha256, caption: null, sort_order: sortOrder, created_at: nowIso(), _sync: "pending", _base_version: null,
  };
  const now = Date.now();
  await db.transaction("rw", db.files, db.leittext_attachments, async () => {
    await db.files.put({ key: `ltatt:${id}:original`, blob: file.blob, kind: "original", synced: false, size: file.blob.size, last_used_at: now });
    if (file.thumb) await db.files.put({ key: `ltatt:${id}:thumb`, blob: file.thumb, kind: "thumb", synced: false, size: file.thumb.size, last_used_at: now });
    await db.leittext_attachments.put(row);
  });
  await enqueue({ record: `lt_attachment:${id}`, op: "leittext_attachment.upload", payload: { id }, title: `Foto hochladen (${formatMb(file.blob.size)})`, size: file.blob.size });
}

export async function deleteImage(a: { id: string; storage_path: string; thumb_path: string | null }): Promise<void> {
  const db = currentDb();
  if (!db) throw new Error("Lokaler Speicher ist nicht bereit.");
  const row = await db.leittext_attachments.get(a.id);
  await dropWaiting(db, `lt_attachment:${a.id}`);
  await db.leittext_attachments.delete(a.id);
  await db.files.bulkDelete([`ltatt:${a.id}:original`, `ltatt:${a.id}:thumb`]);
  if (row?._base_version === null && !(await hasOutbox(db, `lt_attachment:${a.id}`))) { changed(); return; }
  await enqueue({ record: `lt_attachment:${a.id}`, op: "leittext_attachment.delete", payload: { id: a.id, storage_path: a.storage_path, thumb_path: a.thumb_path }, title: "Foto löschen" });
}

/** Bild als Blob (lokal oder vom Server) – auch für den PDF-Export. */
export async function imageBlob(a: { id: string; storage_path: string; thumb_path: string | null }, kind: "thumb" | "original"): Promise<Blob | null> {
  const db = currentDb();
  const useKind = kind === "thumb" && !a.thumb_path ? "original" : kind;
  const hit = db ? await db.files.get(`ltatt:${a.id}:${useKind}`) : undefined;
  if (hit) return hit.blob;
  if (!getNetworkStatus().online) return null;
  const { data } = await supabase.storage.from("leittext-files").download(useKind === "thumb" ? a.thumb_path! : a.storage_path);
  return data ?? null;
}
export async function imageUrl(a: { id: string; storage_path: string; thumb_path: string | null }, kind: "thumb" | "original"): Promise<string> {
  const db = currentDb();
  const useKind = kind === "thumb" && !a.thumb_path ? "original" : kind;
  const hit = db ? await db.files.get(`ltatt:${a.id}:${useKind}`) : undefined;
  if (hit) return URL.createObjectURL(hit.blob);
  return signedUrl("leittext-files", useKind === "thumb" ? a.thumb_path! : a.storage_path);
}

// ---------- Kommentare (online) ----------
export async function listComments(workId: string): Promise<LeittextComment[]> {
  if (!getNetworkStatus().online) return [];
  const { data, error } = await supabase.from("leittext_comments").select("*").eq("work_id", workId).order("created_at");
  if (error) throw error;
  return data ?? [];
}
export async function addComment(workId: string, taskKey: string, body: string): Promise<void> {
  requireOnline();
  const { error } = await supabase.from("leittext_comments").insert({ id: crypto.randomUUID(), work_id: workId, task_key: taskKey, body: body.trim() } as never);
  if (error) throw new Error(error.message);
}
export function subscribeToComments(workId: string, onChange: () => void): () => void {
  const channel = supabase.channel(`leittext-comments-${workId}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "leittext_comments", filter: `work_id=eq.${workId}` }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

// ---------- Prüfen, Personen, Export ----------
export const getReviewQueue = () => cachedOnline("leittext-queue", async () => {
  const { data, error } = await supabase.rpc("leittext_review_queue");
  if (error) throw error;
  return data ?? [];
});

export async function canReview(azubiId: string): Promise<boolean> {
  const uid = myId();
  if (!uid || uid === azubiId || !getNetworkStatus().online) return false;
  const { data } = await supabase.rpc("can_review_for", { _reviewer: uid, _azubi: azubiId });
  return data === true;
}

export interface PersonHeader { name: string; company: string | null; profession: string | null }
/** Name, Betrieb und Beruf für das Deckblatt (eigene Daten offline aus dem Gerätespeicher). */
export async function personHeader(azubiId: string): Promise<PersonHeader> {
  const db = currentDb();
  if (azubiId === myId() && db) {
    const p = (await db.lookups.get("profile"))?.value as { full_name?: string } | undefined;
    const c = (await db.lookups.get("company"))?.value as { name?: string } | undefined;
    const pr = (await db.lookups.get("profession"))?.value as { name?: string } | undefined;
    if (p?.full_name || !getNetworkStatus().online) return { name: p?.full_name ?? "", company: c?.name ?? null, profession: pr?.name ?? null };
  }
  return cachedOnline(`leittext-person:${azubiId}`, async () => {
    const { data } = await supabase.from("profiles").select("full_name, companies(name), professions(name)").eq("id", azubiId).maybeSingle();
    return {
      name: data?.full_name ?? "",
      company: (data?.companies as { name: string } | null)?.name ?? null,
      profession: (data?.professions as { name: string } | null)?.name ?? null,
    };
  });
}

export async function logLeittextExport(azubiId: string, count: number): Promise<void> {
  if (!getNetworkStatus().online) return;
  await supabase.rpc("log_export", { p_azubi: azubiId, p_kind: "leittext", p_count: count, p_from: null as unknown as string, p_to: null as unknown as string });
}

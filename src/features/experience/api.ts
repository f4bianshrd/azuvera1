/**
 * Datenzugriff für Erfahrungsberichte. Eigene Daten der Azubis: zuerst lokal (Dexie), dann Synchronisation.
 * Fremde Daten, Freigabe, Verwaltung, Export und Verlauf: nur online.
 */
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getNetworkStatus, openExternal } from "@/lib/platform";
import { currentDb, type LocalExperience, type LocalExperienceAttachment, type SyncState } from "@/lib/sync/db";
import { changed, dropWaiting, enqueue, formatMb, hasOutbox, myId, nowIso, ownScope } from "@/lib/sync/local";
import { cachedOnline } from "@/lib/sync/online-cache";
import { signedUrl } from "@/features/reports/api";
import type { ExperienceRequirement } from "./requirements";

type Tables = Database["public"]["Tables"];
export type Bundesland = Tables["bundeslaender"]["Row"];
export type ExperienceRow = Tables["experience_reports"]["Row"];
export type Experience = ExperienceRow & { _sync?: SyncState; _submit_pending?: boolean; _server?: ExperienceRow | null; _error?: string | null };
export type ExperienceAttachment = Tables["experience_attachments"]["Row"] & { _sync?: SyncState; _base_version?: number | null };
export type ExperienceSignature = Tables["experience_signatures"]["Row"];
export type ExperienceComment = Tables["experience_comments"]["Row"];
export type ExperienceVersion = Tables["experience_versions"]["Row"];
export type ExperienceKind = "erfahrungsbericht" | "projektbericht" | "leittext";
export type ExperienceSection = "" | "body" | "reasoning";
export type TeamExperienceRow = Database["public"]["Functions"]["team_experience_overview"]["Returns"][number];
export type ExperienceQueueItem = Database["public"]["Functions"]["experience_review_queue"]["Returns"][number];

export const OFFLINE_MESSAGE = "Dafür brauchst du eine Internetverbindung.";
export const CONFLICT_MESSAGE = "Der Erfahrungsbericht wurde inzwischen geändert.";
export class ExperienceConflictError extends Error {
  constructor() { super(CONFLICT_MESSAGE); this.name = "ExperienceConflictError"; }
}
function requireOnline(): void {
  if (!getNetworkStatus().online) throw new Error(OFFLINE_MESSAGE);
}
function rethrow(error: { message: string }): never {
  if (error.message.includes("inzwischen geändert")) throw new ExperienceConflictError();
  throw new Error(error.message);
}

// ---------- Prüfschemas ----------
export const draftSchema = z.object({
  kind: z.enum(["erfahrungsbericht", "projektbericht", "leittext"]),
  title: z.string().max(150),
  area: z.string().max(80),
  written_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  body: z.string().max(20000),
  reasoning: z.string().max(20000),
});
export const submitSchema = draftSchema.extend({
  title: z.string().trim().min(3, "Bitte gib einen Titel an (mindestens 3 Zeichen).").max(150),
  body: z.string().trim().min(200, "Der Bericht ist noch zu kurz. Schreibe mindestens 200 Zeichen.").max(20000),
});
export type ExperienceDraft = z.infer<typeof draftSchema>;

// ---------- Bundesland und Vorgaben ----------
export async function listBundeslaender(): Promise<Bundesland[]> {
  const db = currentDb();
  if (!getNetworkStatus().online && db) return ((await db.lookups.get("bundeslaender"))?.value as Bundesland[] | undefined) ?? [];
  const { data, error } = await supabase.from("bundeslaender").select("*").order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function listRequirements(): Promise<ExperienceRequirement[]> {
  const db = currentDb();
  if (!getNetworkStatus().online && db) return ((await db.lookups.get("experience_requirements"))?.value as ExperienceRequirement[] | undefined) ?? [];
  const { data, error } = await supabase.from("experience_requirements").select("*").order("bundesland", { nullsFirst: true }).order("profession_code", { nullsFirst: true });
  if (error) throw error;
  return data ?? [];
}

export type RequirementInput = Omit<Tables["experience_requirements"]["Insert"], "created_at" | "updated_at">;
export async function saveRequirement(row: RequirementInput): Promise<void> {
  requireOnline();
  const { id, ...rest } = row;
  const { error } = id
    ? await supabase.from("experience_requirements").update(rest).eq("id", id)
    : await supabase.from("experience_requirements").insert(rest);
  if (error) {
    if (error.message.includes("experience_requirements_official_source")) throw new Error("Eine amtliche Vorgabe braucht eine Quelle.");
    if (error.code === "23505") throw new Error("Für dieses Bundesland und diesen Beruf gibt es schon eine Vorgabe.");
    throw new Error(error.message);
  }
}

export async function deleteRequirement(id: string): Promise<void> {
  requireOnline();
  const { error } = await supabase.from("experience_requirements").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Eigenes Bundesland setzen (Operation profile.update, auch offline). */
export async function saveMyBundesland(code: string | null): Promise<void> {
  const db = currentDb();
  if (!db) {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await supabase.from("profiles").update({ bundesland: code }).eq("id", uid ?? "");
    if (error) throw error;
    return;
  }
  const p = (await db.lookups.get("profile"))?.value as Record<string, unknown> | undefined;
  if (p) await db.lookups.put({ key: "profile", value: { ...p, bundesland: code }, updated_at: nowIso() });
  await enqueue({ record: "profile:bundesland", op: "profile.update", payload: { patch: { bundesland: code } }, title: "Bundesland speichern" });
}

// ---------- Fortschritt ----------
export interface ProgressContext {
  azubiId: string;
  beginn: string | null;
  ende: string | null;
  profileBundesland: string | null;
  companyBundesland: string | null;
  professionCode: string | null;
  professionName: string | null;
  reports: Pick<Experience, "id" | "kind" | "status" | "written_on">[];
  requirements: ExperienceRequirement[];
  bundeslaender: Bundesland[];
}

export async function loadProgressContext(azubiId: string): Promise<ProgressContext> {
  const db = await ownScope(azubiId);
  if (db) {
    const [p, prof, comp, reps, reqs, bls] = await Promise.all([
      db.lookups.get("profile"), db.lookups.get("profession"), db.lookups.get("company"),
      db.experience_reports.where("azubi_id").equals(azubiId).toArray(),
      db.lookups.get("experience_requirements"), db.lookups.get("bundeslaender"),
    ]);
    const profile = p?.value as { ausbildungsbeginn?: string | null; ausbildungsende?: string | null; bundesland?: string | null; company_id?: string | null } | undefined;
    const profession = prof?.value as { code?: string | null; name?: string } | undefined;
    const company = comp?.value as { id?: string; bundesland?: string | null } | undefined;
    let requirements = (reqs?.value as ExperienceRequirement[] | undefined) ?? [];
    let bundeslaender = (bls?.value as Bundesland[] | undefined) ?? [];
    if ((!requirements.length || !bundeslaender.length) && getNetworkStatus().online) {
      [requirements, bundeslaender] = await Promise.all([listRequirements(), listBundeslaender()]);
    }
    return {
      azubiId, beginn: profile?.ausbildungsbeginn ?? null, ende: profile?.ausbildungsende ?? null,
      profileBundesland: profile?.bundesland ?? null,
      companyBundesland: profile?.company_id && company?.id === profile.company_id ? company.bundesland ?? null : null,
      professionCode: profession?.code ?? null, professionName: profession?.name ?? null,
      // Wartet ein Bericht auf das Einreichen, zählt er lokal als eingereicht.
      reports: reps.map((r) => ({ id: r.id, kind: r.kind, written_on: r.written_on, status: r._submit_pending ? "submitted" : r.status })),
      requirements, bundeslaender,
    };
  }
  return cachedOnline(`experience-progress:${azubiId}`, async () => {
    const { data: profile, error } = await supabase.from("profiles").select("ausbildungsbeginn, ausbildungsende, bundesland, company_id, profession_id").eq("id", azubiId).maybeSingle();
    if (error) throw error;
    const [company, profession, reps, requirements, bundeslaender] = await Promise.all([
      profile?.company_id ? supabase.from("companies").select("bundesland").eq("id", profile.company_id).maybeSingle() : Promise.resolve({ data: null }),
      profile?.profession_id ? supabase.from("professions").select("code, name").eq("id", profile.profession_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("experience_reports").select("id, kind, status, written_on").eq("azubi_id", azubiId),
      listRequirements(), listBundeslaender(),
    ]);
    return {
      azubiId, beginn: profile?.ausbildungsbeginn ?? null, ende: profile?.ausbildungsende ?? null,
      profileBundesland: profile?.bundesland ?? null,
      companyBundesland: (company.data as { bundesland: string | null } | null)?.bundesland ?? null,
      professionCode: (profession.data as { code: string | null } | null)?.code ?? null,
      professionName: (profession.data as { name: string } | null)?.name ?? null,
      reports: (reps.data ?? []) as ProgressContext["reports"],
      requirements: requirements.filter((r) => r.is_active), bundeslaender,
    };
  });
}

// ---------- Erfahrungsberichte ----------
export async function listMyExperience(): Promise<Experience[]> {
  const uid = myId();
  const db = currentDb();
  if (!db || !uid) return [];
  const rows = await db.experience_reports.where("azubi_id").equals(uid).toArray();
  return rows.sort((a, b) => b.written_on.localeCompare(a.written_on) || b.created_at.localeCompare(a.created_at));
}

export async function listExperienceFor(azubiId: string): Promise<Experience[]> {
  if (await ownScope(azubiId)) return listMyExperience();
  return cachedOnline(`experience-list:${azubiId}`, async () => {
    const { data, error } = await supabase.from("experience_reports").select("*").eq("azubi_id", azubiId).order("written_on", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });
}

/** Zahl der Anhänge und Kommentare je Erfahrungsbericht. */
export async function listExperienceMetrics(ids: string[], azubiId: string): Promise<Map<string, { attachments: number; comments: number }>> {
  const result = new Map(ids.map((id) => [id, { attachments: 0, comments: 0 }]));
  if (!ids.length) return result;
  const db = await ownScope(azubiId);
  if (db) {
    for (const a of await db.experience_attachments.where("azubi_id").equals(azubiId).toArray()) { const m = result.get(a.experience_id); if (m) m.attachments++; }
    for (const c of await db.experience_comments.where("azubi_id").equals(azubiId).toArray()) { const m = result.get(c.experience_id); if (m) m.comments++; }
    return result;
  }
  if (!getNetworkStatus().online) return result;
  const [a, c] = await Promise.all([
    supabase.from("experience_attachments").select("experience_id").in("experience_id", ids),
    supabase.from("experience_comments").select("experience_id").in("experience_id", ids),
  ]);
  for (const r of a.data ?? []) { const m = result.get(r.experience_id); if (m) m.attachments++; }
  for (const r of c.data ?? []) { const m = result.get(r.experience_id); if (m) m.comments++; }
  return result;
}

export interface ExperienceDetail { report: Experience; attachments: ExperienceAttachment[]; signatures: ExperienceSignature[] }

export async function getExperience(id: string): Promise<ExperienceDetail | null> {
  const db = currentDb();
  const local = db ? await db.experience_reports.get(id) : undefined;
  if (db && local) {
    const attachments = (await db.experience_attachments.where("experience_id").equals(id).toArray()).sort((a, b) => a.sort_order - b.sort_order);
    let signatures: ExperienceSignature[] = [];
    if (getNetworkStatus().online && local._base_version !== null) {
      const { data } = await supabase.from("experience_signatures").select("*").eq("experience_id", id).order("signed_at");
      signatures = data ?? [];
      await db.lookups.put({ key: `exp-signatures:${id}`, value: signatures, updated_at: nowIso() });
    } else signatures = ((await db.lookups.get(`exp-signatures:${id}`))?.value as ExperienceSignature[] | undefined) ?? [];
    return { report: local, attachments, signatures };
  }
  return cachedOnline(`experience:${id}`, async () => {
    const [{ data: report, error }, { data: attachments }, { data: signatures }] = await Promise.all([
      supabase.from("experience_reports").select("*").eq("id", id).maybeSingle(),
      supabase.from("experience_attachments").select("*").eq("experience_id", id).order("sort_order"),
      supabase.from("experience_signatures").select("*").eq("experience_id", id).order("signed_at"),
    ]);
    if (error) throw error;
    if (!report) return null;
    return { report, attachments: attachments ?? [], signatures: signatures ?? [] };
  });
}

function saveTitle(): string { return "Erfahrungsbericht speichern"; }

/** Entwurf lokal anlegen (Geräte-UUID); die outbox legt ihn später idempotent an. */
export async function createExperienceDraft(id: string, azubiId: string, draft: ExperienceDraft): Promise<Experience> {
  const db = currentDb();
  if (!db) throw new Error("Lokaler Speicher ist nicht bereit.");
  const parsed = draftSchema.parse(draft);
  const now = nowIso();
  const row: LocalExperience = {
    id, azubi_id: azubiId, ...parsed, status: "draft", version: 1, content_hash: null, submitted_at: null, reviewed_at: null,
    reviewer_id: null, review_note: null, created_at: now, updated_at: now, _sync: "pending", _base_version: null, _submit_pending: false, _server: null,
  };
  await db.experience_reports.put(row);
  await enqueue({ record: `experience:${id}`, op: "experience.upsert", payload: { id }, title: saveTitle() });
  return row;
}

/** Entwurf lokal speichern (Autosave); die outbox sendet mit id und version = _base_version. */
export async function saveExperienceDraft(id: string, patch: Partial<ExperienceDraft>): Promise<Experience> {
  const db = currentDb();
  const row = db ? await db.experience_reports.get(id) : undefined;
  if (!db || !row) throw new Error("Erfahrungsbericht nicht gefunden.");
  if (row._submit_pending) throw new Error("Wird eingereicht, sobald du online bist.");
  const next: LocalExperience = { ...row, ...draftSchema.partial().parse(patch), updated_at: nowIso(), _sync: row._sync === "conflict" ? "conflict" : "pending" };
  await db.experience_reports.put(next);
  if (row._sync !== "conflict") await enqueue({ record: `experience:${id}`, op: "experience.upsert", payload: { id }, title: saveTitle() });
  else changed();
  return next;
}

export async function deleteExperienceDraft(id: string): Promise<void> {
  const db = currentDb();
  const row = db ? await db.experience_reports.get(id) : undefined;
  if (!db || !row) throw new Error("Erfahrungsbericht nicht gefunden.");
  const atts = await db.experience_attachments.where("experience_id").equals(id).toArray();
  for (const a of atts) {
    await dropWaiting(db, `exp_attachment:${a.id}`);
    await db.files.bulkDelete([`expatt:${a.id}:original`, `expatt:${a.id}:thumb`]);
  }
  await db.experience_attachments.bulkDelete(atts.map((a) => a.id));
  await dropWaiting(db, `experience:${id}`);
  await db.experience_reports.delete(id);
  if (row._base_version !== null || (await hasOutbox(db, `experience:${id}`))) {
    await enqueue({ record: `experience:${id}`, op: "experience.delete", payload: { id }, title: "Erfahrungsbericht löschen" });
  } else changed();
}

/** Einreichen: lokal sperren, Unterschrift lokal ablegen; expected_version setzt die Sync-Engine beim Senden. */
export async function submitExperience(input: { id: string; method: "draw" | "click"; signature?: Blob | null; clientSignedAt?: string }): Promise<void> {
  const db = currentDb();
  const row = db ? await db.experience_reports.get(input.id) : undefined;
  if (!db || !row) throw new Error("Erfahrungsbericht nicht gefunden.");
  const check = submitSchema.safeParse(row);
  if (!check.success) throw new Error(check.error.issues[0]?.message ?? "Bitte prüfe deine Angaben.");
  let signatureId: string | undefined;
  if (input.signature) {
    signatureId = crypto.randomUUID();
    await db.local_signatures.put({ id: signatureId, report_id: row.id, blob: input.signature, created_at: nowIso() });
  }
  await db.experience_reports.update(row.id, { _submit_pending: true, _sync: "pending" });
  await enqueue({ record: `experience:${row.id}`, op: "experience.submit", payload: { id: row.id, method: input.method, signatureId, clientSignedAt: input.clientSignedAt ?? nowIso() }, title: "Erfahrungsbericht einreichen" });
}

export async function approveExperience(input: { id: string; expectedVersion: number; method: "draw" | "saved" | "click"; imagePath?: string | undefined; note?: string | undefined }): Promise<void> {
  requireOnline();
  const args: Record<string, unknown> = { p_id: input.id, p_expected_version: input.expectedVersion, p_method: input.method, p_client_signed_at: nowIso() };
  if (input.imagePath) args.p_image_path = input.imagePath;
  if (input.note) args.p_note = input.note;
  const { error } = await supabase.rpc("approve_experience", args as never);
  if (error) rethrow(error);
}
export async function rejectExperience(id: string, expectedVersion: number, note: string): Promise<void> {
  requireOnline();
  const { error } = await supabase.rpc("reject_experience", { p_id: id, p_expected_version: expectedVersion, p_note: note });
  if (error) rethrow(error);
}
export async function reopenExperience(id: string, reason: string): Promise<void> {
  requireOnline();
  const { error } = await supabase.rpc("reopen_experience", { p_id: id, p_reason: reason });
  if (error) rethrow(error);
}

// ---------- Konflikte ----------
export async function keepMyExperience(id: string): Promise<void> {
  const db = currentDb();
  const row = db ? await db.experience_reports.get(id) : undefined;
  if (!db || !row?._server) return;
  await db.outbox.where("record").equals(`experience:${id}`).modify({ status: "waiting", attempts: 0, next_at: 0, error: null });
  await db.experience_reports.put({ ...row, _base_version: row._server.version, _sync: "pending", _server: null });
  if (!(await hasOutbox(db, `experience:${id}`))) await enqueue({ record: `experience:${id}`, op: "experience.upsert", payload: { id }, title: saveTitle() });
  else changed();
}
export async function takeServerExperience(id: string): Promise<void> {
  const db = currentDb();
  const row = db ? await db.experience_reports.get(id) : undefined;
  if (!db || !row) return;
  await dropWaiting(db, `experience:${id}`);
  await db.lookups.put({ key: `exp-local-copy:${id}`, value: { title: row.title, area: row.area, body: row.body, reasoning: row.reasoning }, updated_at: nowIso() });
  if (row._server) await db.experience_reports.put({ ...row._server, _sync: "synced", _base_version: row._server.version, _submit_pending: false, _server: null });
  else await db.experience_reports.delete(id);
  changed();
}
export async function experienceLocalCopy(id: string): Promise<{ title: string; area: string; body: string; reasoning: string } | null> {
  return ((await currentDb()?.lookups.get(`exp-local-copy:${id}`))?.value as never) ?? null;
}

// ---------- Anhänge ----------
export async function addExperienceAttachment(input: {
  report: { id: string; azubi_id: string }; blob: Blob; thumb?: Blob | undefined; fileName: string; mimeType: string;
  width?: number | undefined; height?: number | undefined; sha256?: string | undefined; sortOrder: number;
}): Promise<void> {
  const db = currentDb();
  if (!db) throw new Error("Lokaler Speicher ist nicht bereit.");
  const id = crypto.randomUUID();
  const isPdf = input.mimeType === "application/pdf";
  const base = `${input.report.azubi_id}/${input.report.id}/${id}`;
  const row: LocalExperienceAttachment = {
    id, experience_id: input.report.id, azubi_id: input.report.azubi_id, storage_path: `${base}.${isPdf ? "pdf" : "jpg"}`,
    thumb_path: input.thumb ? `${base}_thumb.jpg` : null, file_name: input.fileName, mime_type: input.mimeType, size_bytes: input.blob.size,
    width: input.width ?? null, height: input.height ?? null, sha256: input.sha256 ?? null, sort_order: input.sortOrder, caption: null,
    created_at: nowIso(), _sync: "pending", _base_version: null,
  };
  const now = Date.now();
  await db.transaction("rw", db.files, db.experience_attachments, async () => {
    await db.files.put({ key: `expatt:${id}:original`, blob: input.blob, kind: "original", synced: false, size: input.blob.size, last_used_at: now });
    if (input.thumb) await db.files.put({ key: `expatt:${id}:thumb`, blob: input.thumb, kind: "thumb", synced: false, size: input.thumb.size, last_used_at: now });
    await db.experience_attachments.put(row);
  });
  await enqueue({ record: `exp_attachment:${id}`, op: "experience_attachment.upload", payload: { id }, title: `${isPdf ? "PDF" : "Foto"} hochladen (${formatMb(input.blob.size)})`, size: input.blob.size });
}

export async function updateExperienceAttachment(id: string, patch: { caption?: string; sort_order?: number }): Promise<void> {
  const db = currentDb();
  const row = db ? await db.experience_attachments.get(id) : undefined;
  if (!db || !row) throw new Error("Anhang nicht gefunden.");
  await db.experience_attachments.update(id, { ...patch, _sync: "pending" });
  if (row._base_version === null && (await hasOutbox(db, `exp_attachment:${id}`))) { changed(); return; }
  await enqueue({ record: `exp_attachment:${id}`, op: "experience_attachment.update", payload: { id, patch }, title: "Anhang ändern" });
}

export async function deleteExperienceAttachment(a: { id: string; storage_path: string; thumb_path: string | null }): Promise<void> {
  const db = currentDb();
  if (!db) throw new Error("Lokaler Speicher ist nicht bereit.");
  const row = await db.experience_attachments.get(a.id);
  await dropWaiting(db, `exp_attachment:${a.id}`);
  await db.experience_attachments.delete(a.id);
  await db.files.bulkDelete([`expatt:${a.id}:original`, `expatt:${a.id}:thumb`]);
  if (row?._base_version === null && !(await hasOutbox(db, `exp_attachment:${a.id}`))) { changed(); return; }
  await enqueue({ record: `exp_attachment:${a.id}`, op: "experience_attachment.delete", payload: { id: a.id, storage_path: a.storage_path, thumb_path: a.thumb_path }, title: "Anhang löschen" });
}

/** Signierte URL (5 Minuten, erst beim Öffnen erzeugt). */
export async function getAttachmentUrl(path: string): Promise<string> {
  return signedUrl("experience-files", path);
}

export async function experienceAttachmentUrl(a: { id: string; storage_path: string; thumb_path: string | null }, kind: "thumb" | "original"): Promise<string> {
  const db = currentDb();
  const useKind = kind === "thumb" && !a.thumb_path ? "original" : kind;
  const key = `expatt:${a.id}:${useKind}`;
  const hit = db ? await db.files.get(key) : undefined;
  if (db && hit) {
    await db.files.update(key, { last_used_at: Date.now() });
    return URL.createObjectURL(hit.blob);
  }
  return getAttachmentUrl(useKind === "thumb" ? a.thumb_path! : a.storage_path);
}
export async function openExperienceAttachment(a: { id: string; storage_path: string; thumb_path: string | null }): Promise<void> {
  openExternal(await experienceAttachmentUrl(a, "original"));
}

// ---------- Kommentare ----------
export async function listComments(experienceId: string): Promise<ExperienceComment[]> {
  const db = currentDb();
  if (db && (await db.experience_reports.get(experienceId))) {
    return (await db.experience_comments.where("experience_id").equals(experienceId).toArray()).sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  const { data, error } = await supabase.from("experience_comments").select("*").eq("experience_id", experienceId).order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function addComment(experienceId: string, section: ExperienceSection, body: string): Promise<void> {
  const db = currentDb();
  const uid = myId();
  if (db && uid && (await db.experience_reports.get(experienceId))) {
    const id = crypto.randomUUID();
    await db.experience_comments.put({ id, experience_id: experienceId, azubi_id: uid, author_id: uid, section, body: body.trim(), kind: "comment", created_at: nowIso(), _sync: "pending", _base_version: null });
    await enqueue({ record: `exp_comment:${id}`, op: "experience_comment.insert", payload: { id }, title: "Kommentar senden" });
    return;
  }
  requireOnline();
  const { error } = await supabase.from("experience_comments").insert({ id: crypto.randomUUID(), experience_id: experienceId, section, body: body.trim() } as never);
  if (error) throw new Error(error.message);
}

export function subscribeToComments(experienceId: string, onChange: () => void): () => void {
  const channel = supabase.channel(`experience-comments-${experienceId}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "experience_comments", filter: `experience_id=eq.${experienceId}` }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

// ---------- Prüfen, Team, Verlauf ----------
export const getReviewQueue = () => cachedOnline("experience-queue", async () => {
  const { data, error } = await supabase.rpc("experience_review_queue", {});
  if (error) throw error;
  return data ?? [];
});

export async function listExperiencesByIds(ids: string[]): Promise<ExperienceRow[]> {
  if (!ids.length) return [];
  return cachedOnline(`experience-by-ids:${ids.join(",")}`, async () => {
    const { data, error } = await supabase.from("experience_reports").select("*").in("id", ids);
    if (error) throw error;
    return data ?? [];
  });
}

export const getTeamOverview = (azubiId?: string) => cachedOnline(`experience-team:${azubiId ?? "all"}`, async () => {
  const { data, error } = await supabase.rpc("team_experience_overview", azubiId ? { p_azubi: azubiId } : {});
  if (error) throw error;
  return (data ?? []) as TeamExperienceRow[];
});

export async function verifyExperience(id: string) {
  requireOnline();
  const { data, error } = await supabase.rpc("verify_experience", { p_id: id });
  if (error) throw new Error(error.message);
  return (data ?? [])[0] ?? null;
}

export async function listExperienceVersions(id: string): Promise<ExperienceVersion[]> {
  requireOnline();
  const { data, error } = await supabase.from("experience_versions").select("*").eq("experience_id", id).order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function logExperienceExport(azubiId: string, kind: "single" | "bulk" | "zip", count: number, from: string | null, to: string | null): Promise<void> {
  const { error } = await supabase.rpc("log_experience_export", { p_azubi: azubiId, p_kind: kind, p_count: count, p_from: from as string, p_to: to as string });
  if (error) throw error;
}

// ---------- Personen und Rechte (online) ----------
export interface AzubiHeader { id: string; name: string; profession: string | null }

/** Name und Beruf einer Azubi-Person für Kopfzeilen (nur sichtbare Personen). */
export const getAzubiHeader = (azubiId: string) => cachedOnline(`experience-azubi:${azubiId}`, async (): Promise<AzubiHeader | null> => {
  const { data, error } = await supabase.from("profiles").select("id, full_name, professions(name)").eq("id", azubiId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, name: data.full_name, profession: (data.professions as { name: string } | null)?.name ?? null };
});

/** Namen mehrerer Personen (z. B. für das Prüfportal). */
export async function experienceNames(ids: string[]): Promise<Map<string, AzubiHeader>> {
  const unique = [...new Set(ids)].filter(Boolean);
  const out = new Map<string, AzubiHeader>();
  if (!unique.length || !getNetworkStatus().online) return out;
  const { data } = await supabase.from("profiles").select("id, full_name, professions(name)").in("id", unique);
  for (const p of data ?? []) out.set(p.id, { id: p.id, name: p.full_name, profession: (p.professions as { name: string } | null)?.name ?? null });
  return out;
}

export async function canReviewExperience(azubiId: string): Promise<boolean> {
  const uid = myId();
  if (!uid || uid === azubiId || !getNetworkStatus().online) return false;
  const { data } = await supabase.rpc("can_review_for", { _reviewer: uid, _azubi: azubiId });
  return data === true;
}

export async function canCommentExperience(azubiId: string): Promise<boolean> {
  const uid = myId();
  if (!uid) return false;
  if (uid === azubiId) return true;
  if (!getNetworkStatus().online) return false;
  const { data } = await supabase.rpc("can_comment_for", { _user: uid, _azubi: azubiId });
  return data === true;
}

/** Personen, deren Erfahrungsberichte ich sehen darf (aus der Team-Übersicht). */
export async function listVisibleAzubis(): Promise<AzubiHeader[]> {
  const rows = await getTeamOverview();
  const names = await experienceNames(rows.map((r) => r.azubi_id));
  return [...names.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** Für wen die angemeldete Person gerade prüft (eigene Zuständigkeit oder Vertretung). */
export async function experienceActingPrincipal(azubiId: string): Promise<string | null> {
  const uid = myId();
  if (!uid || !getNetworkStatus().online) return null;
  const { data } = await supabase.rpc("acting_principal", { _reviewer: uid, _azubi: azubiId });
  return data ?? null;
}

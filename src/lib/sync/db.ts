import Dexie, { type Table } from "dexie";
import type { Database } from "@/integrations/supabase/types";

export type SyncState = "synced" | "pending" | "conflict" | "failed";
export interface SyncFields {
  _sync: SyncState;
  /** Letzte vom Server bekannte version; null = noch nie auf dem Server. */
  _base_version: number | null;
  _error?: string | null;
}

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type LocalReport = Row<"reports"> & SyncFields & {
  /** Einreichen wartet auf die Synchronisation (lokal gesperrt). */
  _submit_pending?: boolean;
  /** Serverstand bei Konflikt. */
  _server?: Row<"reports"> | null;
};
export type LocalAttachment = Row<"report_attachments"> & SyncFields;
export type LocalAbsence = Row<"absences"> & SyncFields;
export type LocalGrade = Row<"school_grades"> & SyncFields;
export type LocalComment = Row<"report_comments"> & SyncFields;

type PlanRow<T extends "training_plans" | "plan_sections" | "plan_groups" | "plan_items"> = Row<T>;
export interface PlanGroupNode extends PlanRow<"plan_groups"> { items: PlanRow<"plan_items">[] }
export interface PlanSectionNode extends PlanRow<"plan_sections"> { groups: PlanGroupNode[] }
/** Aufgelöster Plan mit Abschnitten, Gruppen und Punkten (sortiert). */
export interface PlanTree { plan: PlanRow<"training_plans">; sections: PlanSectionNode[] }
export interface LocalPlan { id: string; tree: PlanTree; fetched_at: string }
export type LocalProgress = Pick<Row<"plan_progress">, "azubi_id" | "item_id" | "year" | "planned" | "mastered" | "updated_at"> & { _sync: SyncState };
export type LocalTopic = Row<"training_topics">;
export type LocalReportTopic = Row<"report_topics">;
export type LocalReportPlanItem = Row<"report_plan_items">;

type InstrRow<T extends "instruction_catalogs" | "instruction_topics" | "instruction_points"> = Row<T>;
export interface InstructionTopicNode extends InstrRow<"instruction_topics"> { points: InstrRow<"instruction_points">[] }
/** Aufgelöster Unterweisungskatalog mit Themen und Punkten (sortiert). */
export interface InstructionCatalogTree { catalog: InstrRow<"instruction_catalogs">; topics: InstructionTopicNode[] }
export interface LocalInstructionCatalog { id: string; tree: InstructionCatalogTree; fetched_at: string }
export type LocalInstructionRecord = Row<"instruction_records"> & SyncFields;
export type LocalInstructionRecordPoint = Row<"instruction_record_points">;

export interface LookupRow { key: string; value: unknown; updated_at: string }
export interface FileRow { key: string; blob: Blob; kind: "original" | "thumb" | "signature"; synced: boolean; size: number; last_used_at: number }
export interface LocalSignature { id: string; report_id: string; blob: Blob; created_at: string }

export type OutboxOp =
  | "report.upsert" | "report.delete" | "report.submit"
  | "attachment.upload" | "attachment.update" | "attachment.delete"
  | "absence.upsert" | "absence.delete"
  | "grade.upsert" | "grade.delete"
  | "comment.insert" | "profile.update"
  | "progress.upsert" | "report.links"
  | "instruction.upsert" | "instruction.delete";

export interface OutboxPayload {
  id?: string | undefined;
  method?: string | undefined;
  signatureId?: string | undefined;
  clientSignedAt?: string | undefined;
  patch?: Record<string, unknown> | undefined;
  storage_path?: string | null | undefined;
  thumb_path?: string | null | undefined;
}

export type OutboxStatus = "waiting" | "sending" | "failed" | "conflict";
export interface OutboxEntry {
  id?: number;
  /** Datensatz-Schlüssel, z. B. "report:<uuid>" – je Schlüssel strikt der Reihe nach. */
  record: string;
  op: OutboxOp;
  payload: OutboxPayload;
  title: string;
  size?: number;
  status: OutboxStatus;
  attempts: number;
  next_at: number;
  error?: string | null;
  created_at: number;
}
export interface MetaRow { key: string; value: unknown }
export interface SyncLogRow { id?: number; at: number; level: "info" | "warn" | "error"; message: string }

export class AzuveraDB extends Dexie {
  reports!: Table<LocalReport, string>;
  report_attachments!: Table<LocalAttachment, string>;
  absences!: Table<LocalAbsence, string>;
  school_grades!: Table<LocalGrade, string>;
  report_comments!: Table<LocalComment, string>;
  lookups!: Table<LookupRow, string>;
  files!: Table<FileRow, string>;
  local_signatures!: Table<LocalSignature, string>;
  outbox!: Table<OutboxEntry, number>;
  meta!: Table<MetaRow, string>;
  sync_log!: Table<SyncLogRow, number>;
  plans!: Table<LocalPlan, string>;
  plan_progress!: Table<LocalProgress, [string, string, number]>;
  training_topics!: Table<LocalTopic, string>;
  report_topics!: Table<LocalReportTopic, [string, string]>;
  report_plan_items!: Table<LocalReportPlanItem, [string, string]>;
  instruction_catalogs!: Table<LocalInstructionCatalog, string>;
  instruction_records!: Table<LocalInstructionRecord, string>;
  instruction_record_points!: Table<LocalInstructionRecordPoint, [string, string]>;

  constructor(name: string) {
    super(name);
    // Schema-Version 1. Spätere Bausteine hängen mit this.version(2).stores({...}).upgrade(...) an.
    this.version(1).stores({
      reports: "id, azubi_id, report_date, status, _sync, [azubi_id+report_type]",
      report_attachments: "id, report_id, azubi_id, _sync",
      absences: "id, azubi_id, date_from, _sync",
      school_grades: "id, azubi_id, grade_date, _sync",
      report_comments: "id, report_id, azubi_id, created_at, _sync",
      lookups: "key",
      files: "key, synced, last_used_at",
      local_signatures: "id, report_id",
      outbox: "++id, record, status, next_at",
      meta: "key",
      sync_log: "++id, at",
    });
    // Version 2 (Daten-Prompt A1): Ausbildungsplan, Fortschritt, Themen, Berichtsverknüpfungen.
    this.version(2).stores({
      plans: "id",
      plan_progress: "[azubi_id+item_id+year], azubi_id, item_id, _sync",
      training_topics: "id, profession_id",
      report_topics: "[report_id+topic_id], report_id, topic_id",
      report_plan_items: "[report_id+item_id], report_id, item_id",
    });
    // Version 3 (Daten-Prompt B2): Unterweisungskataloge, Nachweise und besprochene Inhalte.
    this.version(3).stores({
      instruction_catalogs: "id",
      instruction_records: "id, azubi_id, topic_id, given_on, status, _sync",
      instruction_record_points: "[record_id+point_id], record_id, point_id",
    });
  }
}

export const dbName = (userId: string) => `azuvera-${userId}`;

let current: { userId: string; db: AzuveraDB } | null = null;

/** Lokale Datenbank des angemeldeten Kontos öffnen (eine je Nutzer:in). */
export function openUserDb(userId: string): AzuveraDB {
  if (current?.userId === userId) return current.db;
  current?.db.close();
  current = { userId, db: new AzuveraDB(dbName(userId)) };
  return current.db;
}
export function currentDb(): AzuveraDB | null {
  return current?.db ?? null;
}
export function currentUserId(): string | null {
  return current?.userId ?? null;
}
export async function deleteUserDb(userId: string): Promise<void> {
  if (current?.userId === userId) {
    current.db.close();
    current = null;
  }
  await Dexie.delete(dbName(userId));
}

export const QUOTA_MESSAGE = "Der Speicher auf diesem Gerät ist voll. Synchronisiere und lösche alte Anhänge aus dem Zwischenspeicher.";
export function isQuotaError(e: unknown): boolean {
  const name = (e as { name?: string; inner?: { name?: string } })?.name;
  const inner = (e as { inner?: { name?: string } })?.inner?.name;
  return name === "QuotaExceededError" || inner === "QuotaExceededError";
}

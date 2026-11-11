import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { generateReportText, type ReportTextResult } from "./report-text.functions";

export type AiField = "activities" | "school_content" | "instructions" | "summary";
export interface AiTextInput {
  bullets: string;
  field: AiField;
  reportType: "daily" | "weekly";
  weeklyMode?: "activities" | "topics" | undefined;
}

export function useGenerateReportText() {
  const serverFn = useServerFn(generateReportText);
  return async (input: AiTextInput): Promise<ReportTextResult> => serverFn({ data: input });
}

export async function getAiEnabled(): Promise<boolean> {
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", "ai_enabled").maybeSingle();
  if (error) throw error;
  return data?.value === true;
}

export interface AdminAiSettings {
  enabled: boolean;
  dailyLimit: number;
}

export async function getAdminAiSettings(): Promise<AdminAiSettings> {
  const { data, error } = await supabase.from("app_settings").select("key, value").in("key", ["ai_enabled", "ai_daily_limit"]);
  if (error) throw error;
  const enabled = data?.find((row) => row.key === "ai_enabled")?.value;
  const limit = data?.find((row) => row.key === "ai_daily_limit")?.value;
  return { enabled: enabled === true, dailyLimit: typeof limit === "number" ? limit : 500 };
}

export async function saveAdminAiSettings(settings: AdminAiSettings): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("app_settings").upsert([
    { key: "ai_enabled", value: settings.enabled, is_public: true, updated_by: user?.id ?? null },
    { key: "ai_daily_limit", value: settings.dailyLimit, is_public: false, updated_by: user?.id ?? null },
  ]);
  if (error) throw error;
}

export async function logAiAssist(reportId: string, field: AiField): Promise<void> {
  const { error } = await supabase.rpc("log_ai_assist", { _report_id: reportId, _field: field });
  if (error) throw error;
}

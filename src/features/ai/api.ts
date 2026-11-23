import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { apiUrl, isNativeBuild } from "@/lib/platform";
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
  return async (input: AiTextInput): Promise<ReportTextResult> => {
    // Apple-Apps haben keinen eigenen Server: dort direkt den Endpunkt der Web-App aufrufen.
    if (!isNativeBuild() && !apiUrl("/").startsWith("http")) return serverFn({ data: input });
    const { data } = await supabase.auth.getSession();
    try {
      const res = await fetch(apiUrl("/api/report-text"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
        body: JSON.stringify(input),
      });
      const body = (await res.json().catch(() => null)) as ReportTextResult | null;
      return body ?? { ok: false, message: "Die KI konnte den Text nicht erstellen. Bitte versuche es erneut." };
    } catch {
      return { ok: false, message: "Für die KI-Hilfe brauchst du eine Internetverbindung." };
    }
  };
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

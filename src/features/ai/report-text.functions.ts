import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ReportTextResult } from "./report-text.server";

export type { ReportTextResult } from "./report-text.server";

export const generateReportText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input)
  .handler(async ({ data, context }): Promise<ReportTextResult> => {
    const { runReportText } = await import("./report-text.server");
    return runReportText(context.supabase, context.userId, data, setResponseStatus);
  });

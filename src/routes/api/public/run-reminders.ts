import { createFileRoute } from "@tanstack/react-router";

async function safeEqual(a: string, b: string) {
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const d = (v: string) => createHash("sha256").update(v, "utf8").digest();
  return timingSafeEqual(d(a), d(b));
}

// Ersatz-Zeitplan: nur mit gültigem x-cron-secret, ruft generate_reminders() auf.
export const Route = createFileRoute("/api/public/run-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const header = request.headers.get("x-cron-secret");
        if (!header) return Response.json({ error: "unauthorized" }, { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin.from("internal_config").select("value").eq("key", "cron_secret").maybeSingle();
        const env = process.env["CRON_SECRET"];
        const ok = (!!data?.value && (await safeEqual(header, data.value))) || (!!env && (await safeEqual(header, env)));
        if (!ok) return Response.json({ error: "unauthorized" }, { status: 401 });
        const { data: created, error } = await supabaseAdmin.rpc("generate_reminders", {});
        if (error) return Response.json({ error: "failed" }, { status: 500 });
        return Response.json({ created: created ?? 0 });
      },
    },
  },
});

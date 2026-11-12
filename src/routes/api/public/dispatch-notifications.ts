import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

async function safeEqual(a: string, b: string) {
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const d = (v: string) => createHash("sha256").update(v, "utf8").digest();
  return timingSafeEqual(d(a), d(b));
}

export const Route = createFileRoute("/api/public/dispatch-notifications")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const header = request.headers.get("x-cron-secret");
        let authorized = false;
        if (header) {
          const { data } = await supabaseAdmin.from("internal_config").select("value").eq("key", "cron_secret").maybeSingle();
          const env = process.env["CRON_SECRET"];
          authorized = (!!data?.value && (await safeEqual(header, data.value))) || (!!env && (await safeEqual(header, env)));
        } else if (request.headers.get("authorization")) {
          authorized = (await authenticateCronRequest(request)) === null;
        }
        if (!authorized) return Response.json({ error: "unauthorized" }, { status: 401 });

        const { deliveryText } = await import("@/lib/notify/texts");
        const { pushConfigured, sendPush } = await import("@/lib/notify/push.server");
        const { sendEmail, EmailNotConfigured } = await import("@/lib/notify/email.server");
        const { renderTemplate } = await import("@/lib/notify/render.server");

        const { data: rows, error } = await supabaseAdmin.rpc("claim_deliveries", { p_limit: 25 });
        if (error) return Response.json({ error: "claim_failed" }, { status: 500 });
        const out = { claimed: rows?.length ?? 0, sent: 0, failed: 0, skipped: 0 };
        const finish = async (id: number, ok: boolean, err: string | null, skip = false) => {
          await supabaseAdmin.rpc("finish_delivery", { p_id: id, p_ok: ok, p_error: err ?? "", p_skip: skip });
          if (ok) out.sent++; else if (skip) out.skipped++; else out.failed++;
        };

        for (const r of rows ?? []) {
          try {
            if (r.channel === "push") {
              if (!pushConfigured()) { await finish(r.id, false, "not_configured", true); continue; }
              const { data: subs } = await supabaseAdmin.from("push_subscriptions")
                .select("id, endpoint, p256dh, auth, failure_count").eq("user_id", r.user_id);
              if (!subs?.length) { await finish(r.id, false, "no_device", true); continue; }
              const t = deliveryText(r.type);
              let anyOk = false, remaining = subs.length;
              for (const s of subs) {
                let status = 0;
                try { status = await sendPush(s, { ...t, url: r.link ?? "/notifications", tag: r.type }); } catch { status = 0; }
                if (status === 404 || status === 410) {
                  await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id); remaining--;
                } else if (status >= 200 && status < 300) {
                  anyOk = true;
                  await supabaseAdmin.from("push_subscriptions").update({ last_used_at: new Date().toISOString(), failure_count: 0 }).eq("id", s.id);
                } else if (s.failure_count + 1 >= 10) {
                  await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id); remaining--;
                } else {
                  await supabaseAdmin.from("push_subscriptions").update({ failure_count: s.failure_count + 1 }).eq("id", s.id);
                }
              }
              if (anyOk) await finish(r.id, true, null);
              else if (remaining === 0) await finish(r.id, false, "no_device", true);
              else await finish(r.id, false, "push_failed");
            } else {
              const { data: p } = await supabaseAdmin.from("profiles").select("email").eq("id", r.user_id).maybeSingle();
              if (!p?.email) { await finish(r.id, false, "no_email", true); continue; }
              try {
                await sendEmail({ to: p.email, ...(await renderTemplate(r.type, r.link)) });
                await finish(r.id, true, null);
              } catch (e) {
                if (e instanceof EmailNotConfigured) await finish(r.id, false, "not_configured", true);
                else await finish(r.id, false, `email_${(e as { code?: string }).code ?? "error"}`.slice(0, 200));
              }
            }
          } catch (e) {
            await finish(r.id, false, `error_${(e as Error).name}`.slice(0, 200));
          }
        }
        return Response.json(out);
      },
    },
  },
});

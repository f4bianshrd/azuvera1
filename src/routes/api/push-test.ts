import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { userFromRequest, json } from "@/lib/notify/auth.server";

const Body = z.object({ endpoint: z.string().url().max(2000).startsWith("https://") });

export const Route = createFileRoute("/api/push-test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const me = await userFromRequest(request);
        if (!me) return json({ error: "Nicht angemeldet." }, 401);
        const { pushConfigured, sendPush } = await import("@/lib/notify/push.server");
        if (!pushConfigured()) return json({ error: "Push ist noch nicht eingerichtet." }, 503);
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Dieses Gerät ist nicht angemeldet." }, 400);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: sub } = await supabaseAdmin.from("push_subscriptions")
          .select("id, endpoint, p256dh, auth").eq("endpoint", parsed.data.endpoint).eq("user_id", me.user.id).maybeSingle();
        if (!sub) return json({ error: "Dieses Gerät ist nicht angemeldet." }, 404);
        const { data: ok } = await supabaseAdmin.rpc("check_call_limit", {
          p_user: me.user.id, p_fn: "push-test", p_max: 5, p_window: "1 hour",
        });
        if (!ok) return json({ error: "Du hast zu viele Tests gemacht. Versuche es später erneut." }, 429);
        try {
          const status = await sendPush(sub, {
            title: "Azuvera", body: "Test erfolgreich. Push-Nachrichten kommen auf diesem Gerät an.", url: "/notifications", tag: "push_test",
          });
          if (status === 404 || status === 410) {
            await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
            return json({ error: "Dieses Gerät ist nicht angemeldet." }, 410);
          }
          if (status >= 300) return json({ error: "Die Push-Nachricht konnte nicht gesendet werden." }, 502);
          await supabaseAdmin.from("push_subscriptions").update({ last_used_at: new Date().toISOString(), failure_count: 0 }).eq("id", sub.id);
          return json({ ok: true });
        } catch (e) {
          console.error("push-test failed:", (e as Error).name);
          return json({ error: "Die Push-Nachricht konnte nicht gesendet werden." }, 502);
        }
      },
    },
  },
});

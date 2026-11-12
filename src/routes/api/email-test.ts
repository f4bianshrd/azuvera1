import { createFileRoute } from "@tanstack/react-router";
import { userFromRequest, json } from "@/lib/notify/auth.server";

export const Route = createFileRoute("/api/email-test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const me = await userFromRequest(request);
        if (!me?.user.email) return json({ error: "Nicht angemeldet." }, 401);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: ok } = await supabaseAdmin.rpc("check_call_limit", {
          p_user: me.user.id, p_fn: "email-test", p_max: 3, p_window: "1 hour",
        });
        if (!ok) return json({ error: "Du hast zu viele Tests gemacht. Versuche es später erneut." }, 429);

        const { sendEmail, EmailNotConfigured } = await import("@/lib/notify/email.server");
        try {
          const { renderTemplate } = await import("@/lib/notify/render.server");
          await sendEmail({ to: me.user.email, ...(await renderTemplate("email_test", "/notifications")) });
          return json({ ok: true });
        } catch (e) {
          if (e instanceof EmailNotConfigured) return json({ error: "E-Mail ist noch nicht eingerichtet." }, 503);
          console.error("email-test failed:", (e as { code?: string }).code ?? (e as Error).name);
          return json({ error: "Die E-Mail konnte nicht gesendet werden." }, 502);
        }
      },
    },
  },
});

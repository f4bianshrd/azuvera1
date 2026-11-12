import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const recent = new Map<string, number[]>();

export const Route = createFileRoute("/api/email-test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!token) return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
        const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await sb.auth.getUser(token);
        const user = data?.user;
        if (error || !user?.email) return Response.json({ error: "Nicht angemeldet." }, { status: 401 });

        const now = Date.now();
        const hits = (recent.get(user.id) ?? []).filter((t) => now - t < 3_600_000);
        if (hits.length >= 3) return Response.json({ error: "Du hast zu viele Tests gemacht. Versuche es später erneut." }, { status: 429 });
        recent.set(user.id, [...hits, now]);

        const { sendEmail, EmailNotConfigured } = await import("@/lib/notify/email.server");
        try {
          const React = await import("react");
          const { render } = await import("@react-email/render");
          const { TEMPLATES } = await import("@/lib/email-templates/registry");
          const tpl = TEMPLATES["email_test"];
          const el = React.createElement(tpl.component, { link: "/notifications" });
          await sendEmail({
            to: user.email,
            subject: typeof tpl.subject === "string" ? tpl.subject : tpl.subject({}),
            html: await render(el),
            text: await render(el, { plainText: true }),
          });
          return Response.json({ ok: true });
        } catch (e) {
          if (e instanceof EmailNotConfigured) return Response.json({ error: "E-Mail ist noch nicht eingerichtet." }, { status: 503 });
          console.error("email-test failed:", (e as { code?: string }).code ?? (e as Error).name);
          return Response.json({ error: "Die E-Mail konnte nicht gesendet werden." }, { status: 502 });
        }
      },
    },
  },
});

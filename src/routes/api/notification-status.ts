import { createFileRoute } from "@tanstack/react-router";
import { userFromRequest, json } from "@/lib/notify/auth.server";

export const Route = createFileRoute("/api/notification-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const me = await userFromRequest(request);
        if (!me) return json({ error: "Nicht angemeldet." }, 401);
        const { data: leitung } = await me.sb.rpc("is_leitung", { _user_id: me.user.id });
        if (!leitung) return json({ error: "Keine Berechtigung." }, 403);
        const { data, error } = await me.sb.rpc("delivery_health");
        if (error) return json({ error: "Status nicht verfügbar." }, 500);
        const { pushConfigured } = await import("@/lib/notify/push.server");
        const { emailConfigured } = await import("@/lib/notify/email.server");
        const row = data?.[0];
        return json({
          push: pushConfigured(), email: emailConfigured(),
          pending: row?.pending ?? 0, failed7d: row?.failed_7d ?? 0, lastSentAt: row?.last_sent_at ?? null,
        });
      },
    },
  },
});

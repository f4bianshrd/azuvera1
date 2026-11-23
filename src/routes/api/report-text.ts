import { createFileRoute } from "@tanstack/react-router";
import { userFromRequest } from "@/lib/notify/auth.server";

// KI-Formulierhilfe für die Apple-Apps: Sie laufen ohne eigenen Server und rufen diesen Endpunkt
// mit ihrem Anmelde-Token auf. Prüfungen, Limits und Protokoll sind dieselben wie in der Web-App.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const Route = createFileRoute("/api/report-text")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let status = 200;
        try {
          const me = await userFromRequest(request);
          if (!me) return Response.json({ ok: false, message: "Nicht angemeldet." }, { status: 401, headers: CORS });
          const { runReportText } = await import("@/features/ai/report-text.server");
          const body = await request.json().catch(() => null);
          const result = await runReportText(me.sb, me.user.id, body, (s) => { status = s; });
          return Response.json(result, { status, headers: { ...CORS, "Cache-Control": "no-store" } });
        } catch (e) {
          console.error("report-text", e instanceof Error ? e.message : e);
          return Response.json({ ok: false, message: "Die KI konnte den Text nicht erstellen. Bitte versuche es erneut." }, { status: 500, headers: CORS });
        }
      },
    },
  },
});

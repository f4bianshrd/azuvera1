import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { userFromRequest } from "@/lib/notify/auth.server";
import { emailConfigured, sendEmail } from "@/lib/notify/email.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });

const Body = z.object({
  ziel: z.string().uuid(),
  action: z.enum(["password_reset", "email_change"]),
  newEmail: z.string().trim().email().max(320).optional(),
});

const APP_URL = "https://get.azuvera.de";

function mail(title: string, text: string, link: string) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return {
    text: `${text}\n\n${link}\n\nWarst du das nicht, ignoriere diese E-Mail und melde dich bei info@azuvera.de.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px"><h2 style="margin:0 0 12px">${esc(title)}</h2><p>${esc(text)}</p><p><a href="${esc(link)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#0f4c81;color:#fff;text-decoration:none">Bestätigen</a></p><p style="color:#666;font-size:13px">Warst du das nicht, ignoriere diese E-Mail und melde dich bei info@azuvera.de.</p></div>`,
  };
}

/**
 * Support-Aktionen, die über die Anmeldung laufen. Die Berechtigung prüft die Datenbank
 * (support_begin_action, als angemeldete IT/Technik-Person mit Zwei-Faktor-Anmeldung) und protokolliert sie.
 */
export const Route = createFileRoute("/api/support-action")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const me = await userFromRequest(request);
          if (!me) return reply({ error: "Nicht angemeldet." }, 401);
          const parsed = Body.safeParse(await request.json().catch(() => null));
          if (!parsed.success) return reply({ error: "Die Angaben sind unvollständig." }, 400);
          const { ziel, action, newEmail } = parsed.data;
          if (action === "email_change" && !newEmail) return reply({ error: "Bitte gib die neue E-Mail-Adresse an." }, 400);
          if (action === "email_change" && !emailConfigured()) return reply({ error: "Der E-Mail-Versand ist noch nicht eingerichtet." }, 503);

          const { data, error } = await me.sb.rpc("support_begin_action", { p_ziel: ziel, p_action: action, p_new_email: newEmail ?? "" });
          if (error) return reply({ error: error.message || "Dazu fehlt dir die Berechtigung." }, 403);
          const info = data as unknown as { email: string; new_email: string | null };

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          if (action === "password_reset") {
            const { error: e } = await supabaseAdmin.auth.resetPasswordForEmail(info.email, { redirectTo: `${APP_URL}/reset-password` });
            if (e) throw e;
            return reply({ ok: true });
          }

          const target = info.new_email!;
          const [cur, neu] = await Promise.all([
            supabaseAdmin.auth.admin.generateLink({ type: "email_change_current", email: info.email, newEmail: target, options: { redirectTo: `${APP_URL}/profil` } }),
            supabaseAdmin.auth.admin.generateLink({ type: "email_change_new", email: info.email, newEmail: target, options: { redirectTo: `${APP_URL}/profil` } }),
          ]);
          if (cur.error || neu.error) throw cur.error ?? neu.error;
          const a = mail("E-Mail-Adresse ändern?", `Der Azuvera-Support hat auf deinen Wunsch die Änderung deiner E-Mail-Adresse auf ${target} vorbereitet. Bitte bestätige sie mit dieser (bisherigen) Adresse.`, cur.data.properties.action_link);
          const b = mail("Neue E-Mail-Adresse bestätigen", "Bitte bestätige, dass diese Adresse künftig für dein Azuvera-Konto gilt. Die Änderung wird erst wirksam, wenn beide Adressen bestätigt sind.", neu.data.properties.action_link);
          await sendEmail({ to: info.email, subject: "Azuvera: E-Mail-Adresse ändern", ...a });
          await sendEmail({ to: target, subject: "Azuvera: Neue E-Mail-Adresse bestätigen", ...b });
          return reply({ ok: true });
        } catch (e) {
          console.error("support-action failed:", (e as { code?: string }).code ?? (e as Error).name);
          return reply({ error: "Das hat nicht geklappt. Bitte versuche es erneut." }, 500);
        }
      },
    },
  },
});

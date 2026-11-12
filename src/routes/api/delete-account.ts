import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { userFromRequest } from "@/lib/notify/auth.server";
import { closedEmail, groupStoragePaths, isClosedAccount, sameEmail } from "@/features/account/rules";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });

const Body = z.object({ userId: z.string().uuid(), confirmEmail: z.string().trim().min(3).max(320) });

export const Route = createFileRoute("/api/delete-account")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const me = await userFromRequest(request);
          if (!me) return reply({ error: "Nicht angemeldet." }, 401);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: myRole } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", me.user.id).maybeSingle();
          if (myRole?.role !== "ausbildungsleitung") return reply({ error: "Dazu fehlt dir die Berechtigung." }, 403);

          const parsed = Body.safeParse(await request.json().catch(() => null));
          if (!parsed.success) return reply({ error: "Die Angaben sind unvollständig." }, 400);
          const { userId, confirmEmail } = parsed.data;

          const [{ data: target }, { data: targetRole }] = await Promise.all([
            supabaseAdmin.from("profiles").select("id, email").eq("id", userId).maybeSingle(),
            supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
          ]);
          if (!target || !targetRole) return reply({ error: "Konto nicht gefunden." }, 404);
          if (!sameEmail(confirmEmail, target.email)) return reply({ error: "Die E-Mail-Adresse stimmt nicht." }, 400);
          if (userId === me.user.id) return reply({ error: "Das eigene Konto lässt sich hier nicht löschen." }, 400);
          if (targetRole.role === "ausbildungsleitung") {
            const { data: leads } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "ausbildungsleitung");
            const ids = (leads ?? []).map((l) => l.user_id);
            const { data: leadProfiles } = ids.length
              ? await supabaseAdmin.from("profiles").select("id, email").in("id", ids)
              : { data: [] as { id: string; email: string }[] };
            const active = (leadProfiles ?? []).filter((p) => !isClosedAccount(p.email));
            if (active.length <= 1) return reply({ error: "Die letzte Ausbildungsleitung kann nicht gelöscht werden." }, 400);
          }

          if (targetRole.role === "azubi") {
            const { data: paths, error: pathErr } = await supabaseAdmin.rpc("account_removal_paths", { p_user: userId });
            if (pathErr) throw pathErr;
            const { error: delErr } = await supabaseAdmin.rpc("admin_delete_azubi_data", { p_user: userId, p_actor: me.user.id });
            if (delErr) throw delErr;
            let filesRemoved = 0, filesFailed = 0;
            for (const [bucket, list] of groupStoragePaths(paths ?? [])) {
              for (let i = 0; i < list.length; i += 100) {
                const batch = list.slice(i, i + 100);
                try {
                  const { data, error } = await supabaseAdmin.storage.from(bucket).remove(batch);
                  if (error) filesFailed += batch.length;
                  else { filesRemoved += data?.length ?? 0; filesFailed += batch.length - (data?.length ?? 0); }
                } catch { filesFailed += batch.length; }
              }
            }
            const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
            if (authErr) console.error("delete-account: auth delete failed", authErr.status);
            return reply({ ok: true, mode: "deleted", filesRemoved, filesFailed });
          }

          const { error: anonErr } = await supabaseAdmin.rpc("admin_anonymize_user", { p_user: userId, p_actor: me.user.id });
          if (anonErr) throw anonErr;
          const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            email: closedEmail(userId), email_confirm: true, ban_duration: "876000h",
          });
          if (banErr) console.error("delete-account: ban failed", banErr.status);
          return reply({ ok: true, mode: "anonymized", filesRemoved: 0, filesFailed: 0 });
        } catch (e) {
          console.error("delete-account failed:", (e as { code?: string }).code ?? (e as Error).name);
          return reply({ error: "Das Konto konnte nicht gelöscht werden. Bitte versuche es erneut." }, 500);
        }
      },
    },
  },
});

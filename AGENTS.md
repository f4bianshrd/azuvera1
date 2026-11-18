<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Client-only SPA (TanStack Start `spa.enabled`); no SSR so the app can be wrapped with Capacitor and run offline.
- Features live in `src/features/<module>`; shared UI (PageHeader, StatusBadge, dialogs…) in `src/components` for reuse across modules.
- Privacy policy sections are a data list (`privacySections(texts)`) so later modules append sections instead of editing markup; location/provider wording comes only from public app_settings via `src/features/public/api.ts` and the "Stand" date from `PRIVACY_UPDATED_AT` in `src/lib/legal.ts`, so legal text changes need no code edits for providers.
- No web fonts (offline + privacy); colors only via oklch tokens in `src/styles.css`.
- Lovable Cloud backend: schema changes only via the migration tool (drizzle/migrations is managed); RLS + tight GRANTs on every public table, privileged writes only through SECURITY DEFINER functions in `public`.
- Signed-in pages live under `src/routes/_authenticated/` behind the client-side auth gate and the shared `AppShell` (mobile tab bar / collapsible sidebar); nav items in `src/features/app/nav.ts` appear only when their route exists, so later Bausteine append entries there.
- Roles come from `user_roles` via `useMyProfile()` (`src/features/app/session.ts`); never from user-editable metadata. `audit_log` is append-only with a hash chain — never update or delete rows.
- Feature modules access the database only through their own data-access layer (`src/features/<module>/api.ts`); components never import supabase directly. New records get their UUID on the device (`crypto.randomUUID()`), writes send the expected `version` (optimistic concurrency) — this keeps Baustein 4's offline sync possible without UI changes.
- Guard triggers that allow writes only from SECURITY DEFINER functions must read the bypass flag with `coalesce(current_setting('app.bypass_guard', true), '') = 'on'` — without coalesce the check is silently skipped when the setting was never set in the session.

- Team, deputy, reminder and notification features keep all database and realtime access in their module api.ts; shared dialogs reuse these APIs to preserve offline-ready boundaries.
- The staff dashboard and team list use team_week_overview as their common weekly-status source; missing_weeks is the sole reminder backlog source so role visibility and counts stay consistent.
- Settings at /admin/einstellungen use an unnested admin_ route because the administration content page does not render an Outlet.

- Own trainee data (reports, attachments, absences, grades, comments) is read from and written to the per-user Dexie DB via module api.ts; the outbox/sync engine in src/lib/sync is the only path to the backend for those writes, so offline and online behave the same.
- Browser/device APIs (network, storage, install, clipboard, push, window.open) go through src/lib/platform.ts so Capacitor plugins can replace them later.
- The service worker is built from src/sw.ts (vite-plugin-pwa injectManifest, manifest static in public/) and registered only via src/features/sync/pwa-update.ts, never in previews/iframes/dev; it never caches backend requests.
- Push/e-mail delivery: the notifications AFTER INSERT trigger fills delivery_queue; /api/public/dispatch-notifications (managed cron each minute, or x-cron-secret) is the only sender, using src/lib/notify/* (WebCrypto push lib, nodemailer SMTP) — keeps one auditable send path that runs on Workers.
- Push device logic lives in src/features/notifications/push.ts on top of platform.ts push helpers; the notification center route is /notifications (/benachrichtigungen only redirects) so push links and email links share one target.
- Automatic reminders are generated only by the SQL function generate_reminders (pg_cron every 15 min, /api/public/run-reminders as fallback); reminder_log dedupes so reruns are safe.
- PDF/ZIP exports are generated in the browser only (pdf-lib + fflate in src/features/export); report content never leaves the device except via existing storage reads, and every export calls log_export for the audit trail.
- Report/attachment audit events are written only by DB triggers via write_audit, and draft privacy is enforced in the audit_log SELECT policy; the audit UI (src/features/audit, page /protokoll, /aenderungsprotokoll redirects) only reads, so the log stays complete regardless of client path.
- Account export/deletion lives in src/features/account; deleting or closing accounts runs only through /api/delete-account (Ausbildungsleitung, service_role) calling admin_delete_azubi_data/admin_anonymize_user, and guard triggers allow those deletes only with the transaction-local azuvera.account_removal flag — so no client can bypass immutability.
- Training plans (src/features/plan) are read through resolve_plan and written only via SECURITY DEFINER functions (set_azubi_plan, admin_save_plan…); own progress and report links go through Dexie + outbox ops progress.upsert/report.links, and plan PDF/ODT are built in the browser like other exports — keeps offline behaviour and the audit trail uniform.
- Trainees change their own profession/company only via set_my_training (profiles_guard_protected blocks direct writes); changing profession drops the explicit plan assignment so a matching plan is resolved again.
- Access to a trainee goes only through invitations → access_grants (src/features/access, pages /zugriff and public /einladung; /verknuepfungen redirects): can_view_azubi/can_review_for read grants plus the Ausbildungsleitung exception, the guard trigger derives can_review from the role, and QR images/scanning stay in the browser — so no client can grant itself more than the invited role allows.
- Instructions (src/features/instructions): own drafts go through Dexie + outbox ops instruction.upsert/delete (src/lib/sync/instruction-sync.ts); submit/confirm/reject/reopen, catalog editor and export are online RPCs; the due rule exists twice (instruction_overview_core in SQL and due.ts) and both must stay in sync with the tests — keeps offline drafts and one consistent deadline rule.
- generate_reminders and export_my_data are thin wrappers over *_base functions; later modules add their rule/section in the wrapper instead of rewriting the base — avoids copying long functions.
- Experience reports (src/features/experience): own drafts/attachments/comments go through Dexie + outbox (src/lib/sync/experience-sync.ts); review, requirements admin, export and history are online; the counting rule exists in progress.ts and experience_year_counts and must stay in sync with the tests — keeps offline use and one consistent count.

- Platform administration checks is_team (team_members or Ausbildungsleitung) in SQL and UI; e-mail sign-up must send role (+organization for non-trainees), while OAuth sign-ups without a role become trainees in handle_new_user so social login keeps working.
- Leittexte (src/features/leittexte): catalog rows come only from admin_import_leittexte (team) or the hash-whitelisted seed_leittext_catalog; own works go through Dexie + outbox, review/export are online, and every view/PDF shows issuer + source link — keeps offline use and mandatory attribution.
- "Angemeldet bleiben" lives in src/features/auth/remember.ts (currentSession) and is enforced in the _authenticated gate and /auth; the session itself always stays in the generated client storage — so reloads never sign out.
- Profile email changes go through supabase.auth.updateUser + sync_my_email (profiles.email stays guard-protected); provider "linking" relies on same-email automatic identity linking because managed OAuth has no explicit link API.

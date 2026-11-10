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
- Privacy policy sections are a data list (`privacySections`) so later modules append sections instead of editing markup.
- No web fonts (offline + privacy); colors only via oklch tokens in `src/styles.css`.
- Lovable Cloud backend: schema changes only via the migration tool (drizzle/migrations is managed); RLS + tight GRANTs on every public table, privileged writes only through SECURITY DEFINER functions in `public`.
- Signed-in pages live under `src/routes/_authenticated/` behind the client-side auth gate and the shared `AppShell` (mobile tab bar / collapsible sidebar); nav items in `src/features/app/nav.ts` appear only when their route exists, so later Bausteine append entries there.
- Roles come from `user_roles` via `useMyProfile()` (`src/features/app/session.ts`); never from user-editable metadata. `audit_log` is append-only with a hash chain — never update or delete rows.
- Feature modules access the database only through their own data-access layer (`src/features/<module>/api.ts`); components never import supabase directly. New records get their UUID on the device (`crypto.randomUUID()`), writes send the expected `version` (optimistic concurrency) — this keeps Baustein 4's offline sync possible without UI changes.
- Guard triggers that allow writes only from SECURITY DEFINER functions must read the bypass flag with `coalesce(current_setting('app.bypass_guard', true), '') = 'on'` — without coalesce the check is silently skipped when the setting was never set in the session.

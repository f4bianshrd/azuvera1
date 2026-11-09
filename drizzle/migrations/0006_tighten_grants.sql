-- Grants auf die vorgesehenen Rechte einschränken (RLS bleibt zusätzlich aktiv)
revoke all on public.profiles from anon, authenticated;
revoke all on public.user_roles from anon, authenticated;
revoke all on public.companies from anon, authenticated;
revoke all on public.professions from anon, authenticated;
revoke all on public.company_professions from anon, authenticated;
revoke all on public.azubi_viewers from anon, authenticated;
revoke all on public.invite_codes from anon, authenticated;
revoke all on public.app_settings from anon, authenticated;
revoke all on public.notifications from anon, authenticated;
revoke all on public.audit_log from anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select, insert, update, delete on public.companies to authenticated;
grant select, insert, update, delete on public.professions to authenticated;
grant select, insert, delete on public.company_professions to authenticated;
grant select, insert, delete on public.azubi_viewers to authenticated;
grant select on public.invite_codes to authenticated;
grant select on public.app_settings to anon;
grant select, insert, update, delete on public.app_settings to authenticated;
grant select, update, delete on public.notifications to authenticated;
grant select on public.audit_log to authenticated;
-- Baustein 1B, Teil 2: Rollen-/Rechtefunktionen und RLS

-- Rollen-Helfer (SECURITY DEFINER: umgehen RLS, verhindern Rekursion)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create or replace function public.is_leitung(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(_user_id, 'ausbildungsleitung')
$$;

create or replace function public.is_reviewer_role(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('ausbilder', 'betriebsleiter', 'ausbildungsleitung')
  )
$$;

-- Prüfrecht: zuständige:r Ausbilder:in mit prüfender Rolle oder Ausbildungsleitung
create or replace function public.can_review_for(_reviewer uuid, _azubi uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_leitung(_reviewer)
    or (
      public.is_reviewer_role(_reviewer)
      and exists (
        select 1 from public.profiles
        where id = _azubi and ausbilder_id = _reviewer
      )
    )
$$;

-- Leserecht auf Azubi-Daten
create or replace function public.can_view_azubi(_viewer uuid, _azubi uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _viewer = _azubi
    or public.can_review_for(_viewer, _azubi)
    or exists (
      select 1 from public.azubi_viewers
      where azubi_id = _azubi and viewer_id = _viewer
    )
    or (
      public.has_role(_viewer, 'betriebsleiter')
      and exists (
        select 1 from public.profiles pa
        join public.profiles pv on pv.id = _viewer
        where pa.id = _azubi
          and pa.company_id is not null
          and pa.company_id = pv.company_id
      )
    )
$$;

-- Nur Anzeigenamen anderer Personen
create or replace function public.display_names(_ids uuid[])
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name from public.profiles p where p.id = any(_ids)
$$;

revoke all on function public.has_role(uuid, public.app_role) from public, anon;
revoke all on function public.is_leitung(uuid) from public, anon;
revoke all on function public.is_reviewer_role(uuid) from public, anon;
revoke all on function public.can_review_for(uuid, uuid) from public, anon;
revoke all on function public.can_view_azubi(uuid, uuid) from public, anon;
revoke all on function public.display_names(uuid[]) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_leitung(uuid) to authenticated;
grant execute on function public.is_reviewer_role(uuid) to authenticated;
grant execute on function public.can_review_for(uuid, uuid) to authenticated;
grant execute on function public.can_view_azubi(uuid, uuid) to authenticated;
grant execute on function public.display_names(uuid[]) to authenticated;

-- RLS aktivieren
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.companies enable row level security;
alter table public.professions enable row level security;
alter table public.company_professions enable row level security;
alter table public.azubi_viewers enable row level security;
alter table public.invite_codes enable row level security;
alter table public.app_settings enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.can_view_azubi(auth.uid(), id) or public.is_leitung(auth.uid()));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_leitung(auth.uid()))
  with check (id = auth.uid() or public.is_leitung(auth.uid()));

-- user_roles: nur lesen, kein Client-Schreiben
create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_leitung(auth.uid()));

-- companies
create policy companies_select on public.companies for select to authenticated using (true);
create policy companies_insert on public.companies for insert to authenticated
  with check (public.is_leitung(auth.uid()));
create policy companies_update on public.companies for update to authenticated
  using (public.is_leitung(auth.uid())) with check (public.is_leitung(auth.uid()));
create policy companies_delete on public.companies for delete to authenticated
  using (public.is_leitung(auth.uid()));

-- professions
create policy professions_select on public.professions for select to authenticated using (true);
create policy professions_insert on public.professions for insert to authenticated
  with check (public.is_leitung(auth.uid()));
create policy professions_update on public.professions for update to authenticated
  using (public.is_leitung(auth.uid())) with check (public.is_leitung(auth.uid()));
create policy professions_delete on public.professions for delete to authenticated
  using (public.is_leitung(auth.uid()));

-- company_professions
create policy company_professions_select on public.company_professions for select to authenticated using (true);
create policy company_professions_insert on public.company_professions for insert to authenticated
  with check (public.is_leitung(auth.uid()));
create policy company_professions_delete on public.company_professions for delete to authenticated
  using (public.is_leitung(auth.uid()));

-- azubi_viewers
create policy azubi_viewers_select on public.azubi_viewers for select to authenticated
  using (azubi_id = auth.uid() or viewer_id = auth.uid() or public.is_leitung(auth.uid()));
create policy azubi_viewers_insert on public.azubi_viewers for insert to authenticated
  with check (public.is_leitung(auth.uid()));
create policy azubi_viewers_delete on public.azubi_viewers for delete to authenticated
  using (public.is_leitung(auth.uid()));

-- invite_codes: nur Ausbildungsleitung lesen; Schreiben nur über Funktionen
create policy invite_codes_select on public.invite_codes for select to authenticated
  using (public.is_leitung(auth.uid()));

-- app_settings: öffentliche Schlüssel für alle, Rest nur Leitung
create policy app_settings_select_public on public.app_settings for select to anon
  using (is_public);
create policy app_settings_select on public.app_settings for select to authenticated
  using (is_public or public.is_leitung(auth.uid()));
create policy app_settings_insert on public.app_settings for insert to authenticated
  with check (public.is_leitung(auth.uid()));
create policy app_settings_update on public.app_settings for update to authenticated
  using (public.is_leitung(auth.uid())) with check (public.is_leitung(auth.uid()));
create policy app_settings_delete on public.app_settings for delete to authenticated
  using (public.is_leitung(auth.uid()));

-- notifications: nur der Empfänger
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- audit_log: lesen, nie schreiben
create policy audit_log_select on public.audit_log for select to authenticated
  using (
    azubi_id = auth.uid()
    or (azubi_id is not null and public.can_view_azubi(auth.uid(), azubi_id))
    or public.is_leitung(auth.uid())
  );
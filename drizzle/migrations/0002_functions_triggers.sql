-- Baustein 1B, Teil 3: Signup-Trigger, Verwaltungsfunktionen, Audit-Kette, Realtime

-- ============ Registrierung: Profil + Rolle + Code-Einlösung ============
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full text := coalesce(new.raw_user_meta_data ->> 'full_name', '');
  v_code text := nullif(upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', ''))), '');
  v_role public.app_role := 'azubi';
  v_invite public.invite_codes%rowtype;
begin
  if v_code is not null then
    select * into v_invite from public.invite_codes where code = v_code for update;
    if not found or v_invite.used_by is not null or v_invite.expires_at <= now() then
      raise exception 'Der Einladungs-Code ist ungültig, abgelaufen oder bereits eingelöst.';
    end if;
    v_role := v_invite.role;
    update public.invite_codes
      set used_by = new.id, used_at = now()
      where id = v_invite.id;
  end if;

  insert into public.profiles (id, vorname, nachname, email)
  values (
    new.id,
    coalesce(nullif(split_part(v_full, ' ', 1), ''), ''),
    coalesce(nullif(substring(v_full from '\s+\S.*$'), ''), ''),
    coalesce(new.email, '')
  );

  insert into public.user_roles (user_id, role) values (new.id, v_role);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ Audit: Hash-Kette ============
create or replace function public.audit_hash(
  _prev_hash text, _created_at timestamptz, _actor_id uuid,
  _entity_type text, _entity_id uuid, _action text, _details jsonb
)
returns text
language sql
immutable
as $$
  select encode(digest(
    coalesce(_prev_hash, '') || '|' ||
    to_char(_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '|' ||
    coalesce(_actor_id::text, '') || '|' ||
    coalesce(_entity_type, '') || '|' ||
    coalesce(_entity_id::text, '') || '|' ||
    coalesce(_action, '') || '|' ||
    coalesce(_details::text, ''),
    'sha256'
  ), 'hex')
$$;

create or replace function public.audit_log_chain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text;
begin
  perform pg_advisory_xact_lock(hashtext(new.chain_key::text));
  select row_hash into v_prev from public.audit_log
    where chain_key = new.chain_key
    order by id desc limit 1;
  new.prev_hash := coalesce(v_prev, 'GENESIS');
  new.row_hash := public.audit_hash(
    new.prev_hash, new.created_at, new.actor_id,
    new.entity_type, new.entity_id, new.action, new.details
  );
  return new;
end;
$$;

create trigger trg_audit_chain before insert on public.audit_log
  for each row execute function public.audit_log_chain();

create or replace function public.audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Das Änderungsprotokoll kann nicht geändert oder gelöscht werden.';
end;
$$;

create trigger trg_audit_no_update before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
create trigger trg_audit_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

create or replace function public.write_audit(
  _entity_type text, _entity_id uuid, _action text, _azubi_id uuid default null, _details jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_role public.app_role;
begin
  select role into v_role from public.user_roles where user_id = auth.uid();
  insert into public.audit_log (chain_key, actor_id, actor_role, azubi_id, entity_type, entity_id, action, details)
  values (coalesce(_azubi_id, '00000000-0000-0000-0000-000000000000'), auth.uid(), v_role, _azubi_id, _entity_type, _entity_id, _action, _details)
  returning id into v_id;
  return v_id;
end;
$$;

-- ============ Verwaltungsfunktionen ============
create or replace function public.admin_list_users()
returns table (
  id uuid, full_name text, email text, role public.app_role,
  ausbilder_id uuid, company_id uuid, profession_id uuid, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_leitung(auth.uid()) then
    raise exception 'Nur die Ausbildungsleitung darf das.';
  end if;
  return query
    select p.id, p.full_name, p.email, ur.role, p.ausbilder_id, p.company_id, p.profession_id, p.created_at
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    order by p.created_at;
end;
$$;

create or replace function public.admin_set_user_role(_user_id uuid, _role public.app_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.app_role;
begin
  if not public.is_leitung(auth.uid()) then
    raise exception 'Nur die Ausbildungsleitung darf das.';
  end if;
  if _user_id = auth.uid() then
    raise exception 'Die eigene Rolle kann nicht geändert werden.';
  end if;
  select role into v_old from public.user_roles where user_id = _user_id for update;
  if not found then
    raise exception 'Nutzer nicht gefunden.';
  end if;
  if v_old = 'ausbildungsleitung' and _role <> 'ausbildungsleitung'
     and (select count(*) from public.user_roles where role = 'ausbildungsleitung') <= 1 then
    raise exception 'Die letzte Ausbildungsleitung kann nicht herabgestuft werden.';
  end if;
  update public.user_roles set role = _role where user_id = _user_id;
  perform public.write_audit('user_role', _user_id, 'role_changed', _user_id,
    jsonb_build_object('from', v_old, 'to', _role));
end;
$$;

create or replace function public.admin_update_azubi(_azubi_id uuid, _patch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_reviewer uuid;
begin
  if not public.is_leitung(auth.uid()) then
    raise exception 'Nur die Ausbildungsleitung darf das.';
  end if;
  if not exists (select 1 from public.profiles where id = _azubi_id) then
    raise exception 'Azubi nicht gefunden.';
  end if;
  if _patch ? 'ausbilder_id' then
    v_reviewer := nullif(_patch ->> 'ausbilder_id', '')::uuid;
    if v_reviewer is not null and not public.is_reviewer_role(v_reviewer) then
      raise exception 'Die zuständige Person muss eine prüfende Rolle haben.';
    end if;
  end if;
  perform set_config('app.allow_protected_profile_write', 'on', true);
  update public.profiles set
    ausbilder_id = case when _patch ? 'ausbilder_id' then nullif(_patch ->> 'ausbilder_id', '')::uuid else ausbilder_id end,
    company_id = case when _patch ? 'company_id' then nullif(_patch ->> 'company_id', '')::uuid else company_id end,
    profession_id = case when _patch ? 'profession_id' then nullif(_patch ->> 'profession_id', '')::uuid else profession_id end
  where id = _azubi_id;
  perform public.write_audit('profile', _azubi_id, 'azubi_assignment_changed', _azubi_id,
    jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(_patch) k)));
end;
$$;

create or replace function public.admin_set_viewers(_azubi_id uuid, _viewer_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_leitung(auth.uid()) then
    raise exception 'Nur die Ausbildungsleitung darf das.';
  end if;
  delete from public.azubi_viewers where azubi_id = _azubi_id;
  insert into public.azubi_viewers (azubi_id, viewer_id, created_by)
    select _azubi_id, v, auth.uid() from unnest(coalesce(_viewer_ids, '{}'::uuid[])) v
    on conflict do nothing;
  perform public.write_audit('azubi_viewers', _azubi_id, 'viewers_changed', _azubi_id,
    jsonb_build_object('count', coalesce(array_length(_viewer_ids, 1), 0)));
end;
$$;

create or replace function public.create_invite_code(_role public.app_role, _valid_days integer default 14, _note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not public.is_leitung(auth.uid()) then
    raise exception 'Nur die Ausbildungsleitung darf das.';
  end if;
  if _role = 'azubi' then
    raise exception 'Einladungs-Codes gibt es nicht für die Azubi-Rolle.';
  end if;
  if _valid_days is null or _valid_days < 1 or _valid_days > 60 then
    raise exception 'Die Gültigkeit muss zwischen 1 und 60 Tagen liegen.';
  end if;
  loop
    v_code := upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 10));
    exit when not exists (select 1 from public.invite_codes where code = v_code);
  end loop;
  insert into public.invite_codes (code, role, note, expires_at, created_by)
  values (v_code, _role, _note, now() + make_interval(days => _valid_days), auth.uid());
  perform public.write_audit('invite_code', null, 'invite_code_created', null,
    jsonb_build_object('role', _role, 'valid_days', _valid_days));
  return v_code;
end;
$$;

create or replace function public.revoke_invite_code(_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_leitung(auth.uid()) then
    raise exception 'Nur die Ausbildungsleitung darf das.';
  end if;
  delete from public.invite_codes where code = upper(trim(_code)) and used_by is null;
  if not found then
    raise exception 'Code nicht gefunden oder bereits eingelöst.';
  end if;
  perform public.write_audit('invite_code', null, 'invite_code_revoked', null, '{}'::jsonb);
end;
$$;

create or replace function public.redeem_invite_code(_code text)
returns public.app_role
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invite_codes%rowtype;
  v_current public.app_role;
begin
  select role into v_current from public.user_roles where user_id = auth.uid();
  if v_current is null then
    raise exception 'Kein Konto gefunden.';
  end if;
  if v_current = 'azubi' then
    raise exception 'Die Azubi-Rolle ist endgültig und kann nicht geändert werden.';
  end if;
  select * into v_invite from public.invite_codes where code = upper(trim(_code)) for update;
  if not found or v_invite.used_by is not null or v_invite.expires_at <= now() then
    raise exception 'Der Einladungs-Code ist ungültig, abgelaufen oder bereits eingelöst.';
  end if;
  if v_current = 'ausbildungsleitung' and v_invite.role <> 'ausbildungsleitung'
     and (select count(*) from public.user_roles where role = 'ausbildungsleitung') <= 1 then
    raise exception 'Die letzte Ausbildungsleitung kann nicht herabgestuft werden.';
  end if;
  update public.invite_codes set used_by = auth.uid(), used_at = now() where id = v_invite.id;
  update public.user_roles set role = v_invite.role where user_id = auth.uid();
  perform public.write_audit('user_role', auth.uid(), 'invite_code_redeemed', null,
    jsonb_build_object('from', v_current, 'to', v_invite.role));
  return v_invite.role;
end;
$$;

create or replace function public.set_my_profession(_profession_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.professions where id = _profession_id) then
    raise exception 'Beruf nicht gefunden.';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and profession_id is not null) then
    raise exception 'Der Beruf ist bereits gesetzt und kann nur von der Ausbildungsleitung geändert werden.';
  end if;
  perform set_config('app.allow_protected_profile_write', 'on', true);
  update public.profiles set profession_id = _profession_id where id = auth.uid();
  perform public.write_audit('profile', auth.uid(), 'profession_set', auth.uid(),
    jsonb_build_object('profession_id', _profession_id));
end;
$$;

-- EXECUTE-Rechte
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.audit_hash(text, timestamptz, uuid, text, uuid, text, jsonb) from public, anon;
revoke all on function public.audit_log_chain() from public, anon, authenticated;
revoke all on function public.audit_log_immutable() from public, anon, authenticated;
revoke all on function public.write_audit(text, uuid, text, uuid, jsonb) from public, anon;
revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_set_user_role(uuid, public.app_role) from public, anon;
revoke all on function public.admin_update_azubi(uuid, jsonb) from public, anon;
revoke all on function public.admin_set_viewers(uuid, uuid[]) from public, anon;
revoke all on function public.create_invite_code(public.app_role, integer, text) from public, anon;
revoke all on function public.revoke_invite_code(text) from public, anon;
revoke all on function public.redeem_invite_code(text) from public, anon;
revoke all on function public.set_my_profession(uuid) from public, anon;

grant execute on function public.audit_hash(text, timestamptz, uuid, text, uuid, text, jsonb) to authenticated;
grant execute on function public.write_audit(text, uuid, text, uuid, jsonb) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_user_role(uuid, public.app_role) to authenticated;
grant execute on function public.admin_update_azubi(uuid, jsonb) to authenticated;
grant execute on function public.admin_set_viewers(uuid, uuid[]) to authenticated;
grant execute on function public.create_invite_code(public.app_role, integer, text) to authenticated;
grant execute on function public.revoke_invite_code(text) to authenticated;
grant execute on function public.redeem_invite_code(text) to authenticated;
grant execute on function public.set_my_profession(uuid) to authenticated;

-- Realtime für Benachrichtigungen
alter publication supabase_realtime add table public.notifications;
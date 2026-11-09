-- Namensbildung ohne doppelte Leerzeichen
create or replace function public.profiles_full_name()
returns trigger
language plpgsql
as $$
begin
  new.full_name := trim(both ' ' from concat_ws(' ', nullif(trim(new.vorname), ''), nullif(trim(new.nachname), '')));
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full text := trim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
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
    coalesce(nullif(trim(substring(v_full from '\s+\S.*$')), ''), ''),
    coalesce(new.email, '')
  );

  insert into public.user_roles (user_id, role) values (new.id, v_role);
  return new;
end;
$$;

update public.profiles set vorname = vorname where full_name like '%  %';
-- Baustein 1B, Teil 1: Enum, Tabellen, Grants, Basis-Trigger

create type public.app_role as enum (
  'azubi', 'ausbilder', 'betriebsleiter', 'ausbildungsberater', 'lehrer', 'ausbildungsleitung'
);

-- updated_at-Helfer
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  vorname text not null default '',
  nachname text not null default '',
  full_name text not null default '',
  email text not null default '',
  telefon text,
  geburtsdatum date,
  personalnummer text,
  strasse text,
  plz text,
  ort text,
  land text not null default 'Deutschland',
  notfallkontakt_name text,
  notfallkontakt_telefon text,
  profession_id uuid,
  company_id uuid,
  ausbilder_id uuid,
  ausbildungsbeginn date,
  ausbildungsende date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- user_roles: genau eine Rolle je Nutzer, kein Client-Schreibrecht
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now()
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

-- companies
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  legal_form text,
  address text,
  contact_person text,
  training_number text,
  chamber text,
  logo_url text,
  contact_email text,
  contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.companies to authenticated;
grant all on public.companies to service_role;

-- professions
create table public.professions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 200),
  code text unique,
  description text,
  chamber text,
  duration_months integer not null default 36 check (duration_months between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.professions to authenticated;
grant all on public.professions to service_role;

-- company_professions
create table public.company_professions (
  company_id uuid not null references public.companies(id) on delete cascade,
  profession_id uuid not null references public.professions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (company_id, profession_id)
);
grant select, insert, delete on public.company_professions to authenticated;
grant all on public.company_professions to service_role;

-- azubi_viewers
create table public.azubi_viewers (
  azubi_id uuid not null references public.profiles(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (azubi_id, viewer_id)
);
grant select, insert, delete on public.azubi_viewers to authenticated;
grant all on public.azubi_viewers to service_role;

-- invite_codes
create table public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-F0-9]{10}$'),
  role public.app_role not null check (role <> 'azubi'),
  note text,
  expires_at timestamptz not null,
  created_by uuid,
  used_by uuid,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
grant select on public.invite_codes to authenticated;
grant all on public.invite_codes to service_role;

-- app_settings
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
grant select on public.app_settings to anon;
grant select, insert, update, delete on public.app_settings to authenticated;
grant all on public.app_settings to service_role;

insert into public.app_settings (key, value, is_public)
values ('hosting_location_text', '"innerhalb der EU"'::jsonb, true);

-- notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null default 'info',
  title text not null,
  body text,
  link text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;

-- audit_log (nur anhängen, Hash-Kette)
create table public.audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  chain_key uuid not null default '00000000-0000-0000-0000-000000000000',
  actor_id uuid,
  actor_role public.app_role,
  azubi_id uuid,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  prev_hash text,
  row_hash text
);
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
revoke update, delete, truncate on public.audit_log from anon, authenticated, service_role;

-- Fremdschlüssel auf profiles nachziehen (Tabellen existieren jetzt alle)
alter table public.profiles
  add constraint profiles_profession_fk foreign key (profession_id) references public.professions(id) on delete set null,
  add constraint profiles_company_fk foreign key (company_id) references public.companies(id) on delete set null,
  add constraint profiles_ausbilder_fk foreign key (ausbilder_id) references public.profiles(id) on delete set null;

-- updated_at-Trigger
create trigger trg_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger trg_companies_updated before update on public.companies for each row execute function public.set_updated_at();
create trigger trg_professions_updated before update on public.professions for each row execute function public.set_updated_at();
create trigger trg_app_settings_updated before update on public.app_settings for each row execute function public.set_updated_at();

-- full_name aus vorname/nachname
create or replace function public.profiles_full_name()
returns trigger
language plpgsql
as $$
begin
  new.full_name := trim(both ' ' from concat_ws(' ', new.vorname, new.nachname));
  return new;
end;
$$;
create trigger trg_profiles_full_name before insert or update of vorname, nachname on public.profiles
  for each row execute function public.profiles_full_name();

-- Geschützte Profil-Spalten: nur über Funktionen änderbar
create or replace function public.profiles_guard_protected()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.allow_protected_profile_write', true), '') <> 'on' then
    if new.profession_id is distinct from old.profession_id
       or new.company_id is distinct from old.company_id
       or new.ausbilder_id is distinct from old.ausbilder_id
       or new.email is distinct from old.email then
      raise exception 'Diese Felder kann nur die Ausbildungsleitung ändern.';
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard_protected();
create extension if not exists pgcrypto with schema extensions;

create or replace function public.audit_hash(
  _prev_hash text, _created_at timestamptz, _actor_id uuid,
  _entity_type text, _entity_id uuid, _action text, _details jsonb
)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(
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
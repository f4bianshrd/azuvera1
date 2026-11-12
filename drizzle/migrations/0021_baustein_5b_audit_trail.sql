-- Baustein 5B: Änderungshistorie und Integritätsprüfung
-- 1.1: audit_hash ist bereits ausgelagert (0002/0004) und wird von audit_log_chain genutzt; alle vorhandenen Ketten
-- wurden vor dieser Migration nachgerechnet und stimmen, eine Neuberechnung ist nicht nötig.

-- 1.2 Neue Protokoll-Ereignisse
create or replace function public.audit_reports_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fields text[] := '{}';
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('report', new.id, 'create', new.azubi_id,
      jsonb_build_object('report_type', new.report_type, 'report_date', new.report_date));
    return new;
  elsif tg_op = 'DELETE' then
    if old.status = 'draft' then
      perform public.write_audit('report', old.id, 'delete', old.azubi_id,
        jsonb_build_object('report_type', old.report_type, 'report_date', old.report_date));
    end if;
    return old;
  end if;
  -- UPDATE
  if new.activities is distinct from old.activities then v_fields := v_fields || 'activities'; end if;
  if new.school_content is distinct from old.school_content then v_fields := v_fields || 'school_content'; end if;
  if new.instructions is distinct from old.instructions then v_fields := v_fields || 'instructions'; end if;
  if new.summary is distinct from old.summary then v_fields := v_fields || 'summary'; end if;
  if new.weekly_mode is distinct from old.weekly_mode then v_fields := v_fields || 'weekly_mode'; end if;
  if new.report_date is distinct from old.report_date then v_fields := v_fields || 'report_date'; end if;
  if cardinality(v_fields) = 0 then return new; end if;
  if exists (
    select 1 from public.audit_log a
    where a.entity_type = 'report' and a.entity_id = new.id and a.action = 'edit'
      and a.created_at > now() - interval '60 minutes'
  ) then
    return new;
  end if;
  perform public.write_audit('report', new.id, 'edit', new.azubi_id,
    jsonb_build_object('version', new.version, 'fields', to_jsonb(v_fields)));
  return new;
end;
$$;

create or replace function public.audit_attachments_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('report', new.report_id, 'attachment_add', new.azubi_id,
      jsonb_build_object('attachment_id', new.id, 'mime_type', new.mime_type, 'size_bytes', new.size_bytes, 'sha256', new.sha256));
    return new;
  end if;
  perform public.write_audit('report', old.report_id, 'attachment_delete', old.azubi_id,
    jsonb_build_object('attachment_id', old.id, 'mime_type', old.mime_type, 'size_bytes', old.size_bytes, 'sha256', old.sha256));
  return old;
end;
$$;

revoke all on function public.audit_reports_change() from public, anon, authenticated;
revoke all on function public.audit_attachments_change() from public, anon, authenticated;

create trigger reports_zz_audit_insert after insert on public.reports
  for each row execute function public.audit_reports_change();
create trigger reports_zz_audit_update after update on public.reports
  for each row
  when (
    new.activities is distinct from old.activities
    or new.school_content is distinct from old.school_content
    or new.instructions is distinct from old.instructions
    or new.summary is distinct from old.summary
    or new.weekly_mode is distinct from old.weekly_mode
    or new.report_date is distinct from old.report_date
  )
  execute function public.audit_reports_change();
create trigger reports_zz_audit_delete after delete on public.reports
  for each row execute function public.audit_reports_change();

create trigger report_attachments_zz_audit after insert or delete on public.report_attachments
  for each row execute function public.audit_attachments_change();

create index if not exists audit_log_entity_idx on public.audit_log (entity_id, id desc);
create index if not exists audit_log_created_idx on public.audit_log (created_at);

-- 1.3 Prüffunktion
create or replace function public.verify_audit_chain(p_chain uuid default null)
returns table (chain_key uuid, entries int, ok boolean, first_bad_id bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_zero constant uuid := '00000000-0000-0000-0000-000000000000';
  rec record;
  v_cur uuid := null;
  v_prev text;
  v_n int := 0;
  v_bad bigint := null;
  v_any boolean := false;
begin
  if v_uid is null then
    raise exception 'Dazu fehlt dir die Berechtigung.';
  end if;
  if p_chain is null or p_chain = v_zero then
    if not public.is_leitung(v_uid) then
      raise exception 'Dazu fehlt dir die Berechtigung.';
    end if;
  elsif not (public.can_view_azubi(v_uid, p_chain) or public.is_leitung(v_uid)) then
    raise exception 'Dazu fehlt dir die Berechtigung.';
  end if;

  for rec in
    select a.id, a.chain_key as ck, a.created_at, a.actor_id, a.entity_type, a.entity_id, a.action, a.details,
           a.prev_hash, a.row_hash
    from public.audit_log a
    where p_chain is null or a.chain_key = p_chain
    order by a.chain_key, a.id
  loop
    v_any := true;
    if v_cur is distinct from rec.ck then
      if v_cur is not null then
        chain_key := v_cur; entries := v_n; ok := v_bad is null; first_bad_id := v_bad;
        return next;
      end if;
      v_cur := rec.ck; v_prev := 'GENESIS'; v_n := 0; v_bad := null;
    end if;
    v_n := v_n + 1;
    if v_bad is null and (
      rec.prev_hash is distinct from v_prev
      or rec.row_hash is distinct from public.audit_hash(v_prev, rec.created_at, rec.actor_id, rec.entity_type, rec.entity_id, rec.action, rec.details)
    ) then
      v_bad := rec.id;
    end if;
    v_prev := rec.row_hash;
  end loop;

  if v_cur is not null then
    chain_key := v_cur; entries := v_n; ok := v_bad is null; first_bad_id := v_bad;
    return next;
  elsif not v_any and p_chain is not null then
    chain_key := p_chain; entries := 0; ok := true; first_bad_id := null;
    return next;
  end if;
end;
$$;

revoke all on function public.verify_audit_chain(uuid) from public, anon;
grant execute on function public.verify_audit_chain(uuid) to authenticated;

-- 1.4 Leserechte (Draft-Privatsphäre)
create or replace function public.audit_report_visible(p_report uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.reports r where r.id = p_report and r.status <> 'draft')
$$;
revoke all on function public.audit_report_visible(uuid) from public, anon;
grant execute on function public.audit_report_visible(uuid) to authenticated;

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using (
    azubi_id = auth.uid()
    or public.is_leitung(auth.uid())
    or (
      azubi_id is not null
      and public.can_view_azubi(auth.uid(), azubi_id)
      and entity_type <> 'consent'
      and (
        action not in ('create', 'edit', 'delete', 'attachment_add', 'attachment_delete', 'ai_assist')
        or public.audit_report_visible(entity_id)
      )
    )
  );

-- Auswahl „Azubi“ auf /protokoll: nur sichtbare Azubis
create or replace function public.audit_azubi_options()
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id and ur.role = 'azubi'
  where auth.uid() is not null
    and (public.is_leitung(auth.uid()) or public.can_view_azubi(auth.uid(), p.id))
  order by p.full_name
$$;
revoke all on function public.audit_azubi_options() from public, anon;
grant execute on function public.audit_azubi_options() to authenticated;

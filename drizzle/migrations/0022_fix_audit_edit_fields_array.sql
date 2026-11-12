create or replace function public.audit_reports_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fields text[] := array[]::text[];
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
  if new.activities is distinct from old.activities then v_fields := array_append(v_fields, 'activities'::text); end if;
  if new.school_content is distinct from old.school_content then v_fields := array_append(v_fields, 'school_content'::text); end if;
  if new.instructions is distinct from old.instructions then v_fields := array_append(v_fields, 'instructions'::text); end if;
  if new.summary is distinct from old.summary then v_fields := array_append(v_fields, 'summary'::text); end if;
  if new.weekly_mode is distinct from old.weekly_mode then v_fields := array_append(v_fields, 'weekly_mode'::text); end if;
  if new.report_date is distinct from old.report_date then v_fields := array_append(v_fields, 'report_date'::text); end if;
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
revoke all on function public.audit_reports_change() from public, anon, authenticated;

create extension if not exists pgcrypto with schema extensions;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 2000 and endpoint like 'https://%'),
  p256dh text not null,
  auth text not null,
  device_label text check (device_label is null or char_length(device_label) <= 80),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  failure_count int not null default 0,
  endpoint_hash text generated always as (encode(sha256(endpoint::bytea), 'hex')) stored
);
create index on public.push_subscriptions(user_id);
revoke all on public.push_subscriptions from anon, authenticated;
grant select (id, device_label, created_at, last_used_at, endpoint_hash) on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
alter table public.push_subscriptions enable row level security;
create policy "own devices read" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());

create table public.notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  groups jsonb not null,
  quiet_hours_enabled boolean not null default true,
  quiet_from time not null default '21:00',
  quiet_to time not null default '07:00',
  daily_nudge_enabled boolean not null default false,
  daily_nudge_time time not null default '17:00',
  updated_at timestamptz not null default now()
);
revoke all on public.notification_prefs from anon, authenticated;
grant select on public.notification_prefs to authenticated;
grant all on public.notification_prefs to service_role;
alter table public.notification_prefs enable row level security;
create policy "own prefs read" on public.notification_prefs for select to authenticated using (user_id = auth.uid());

create table public.delivery_queue (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null,
  channel text not null check (channel in ('push','email')),
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','skipped')),
  attempts int not null default 0,
  scheduled_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 200),
  created_at timestamptz not null default now()
);
create index on public.delivery_queue(status, scheduled_at);
revoke all on public.delivery_queue from anon, authenticated;
grant all on public.delivery_queue to service_role;
alter table public.delivery_queue enable row level security;

create table public.internal_config (key text primary key, value text not null);
revoke all on public.internal_config from anon, authenticated;
grant all on public.internal_config to service_role;
alter table public.internal_config enable row level security;
insert into public.internal_config(key, value) values
  ('cron_secret', encode(extensions.gen_random_bytes(32), 'hex')),
  ('functions_base_url', 'https://get.azuvera.de/api/public')
on conflict do nothing;

create table public.function_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  fn text not null,
  created_at timestamptz not null default now()
);
create index on public.function_calls(user_id, fn, created_at);
revoke all on public.function_calls from anon, authenticated;
grant all on public.function_calls to service_role;
alter table public.function_calls enable row level security;

create or replace function public.default_notification_groups() returns jsonb language sql immutable as $$
  select '{"reports":{"push":true,"email":false},"absences":{"push":true,"email":false},"reminders":{"push":true,"email":true},"deputy":{"push":true,"email":true}}'::jsonb
$$;

create or replace function public.notification_group(_type text) returns text language sql immutable as $$
  select case
    when _type in ('report_submitted','report_approved','report_rejected','report_reopened','comment') then 'reports'
    when _type in ('absence_requested','absence_approved','absence_rejected') then 'absences'
    when _type in ('report_reminder','deadline_soon','deadline_today','deadline_overdue','review_pending','daily_nudge','instruction_due') then 'reminders'
    when _type in ('deputy_assigned','deputy_ended') then 'deputy'
    else null end
$$;

create or replace function public.effective_prefs(_uid uuid)
returns table(groups jsonb, quiet_hours_enabled boolean, quiet_from time, quiet_to time, daily_nudge_enabled boolean, daily_nudge_time time)
language sql stable security definer set search_path = public as $$
  select coalesce(p.groups, public.default_notification_groups()),
         coalesce(p.quiet_hours_enabled, true), coalesce(p.quiet_from, '21:00'::time), coalesce(p.quiet_to, '07:00'::time),
         coalesce(p.daily_nudge_enabled, false), coalesce(p.daily_nudge_time, '17:00'::time)
  from (select 1) d left join public.notification_prefs p on p.user_id = _uid
$$;

create or replace function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_label text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_endpoint is null or char_length(p_endpoint) > 2000 or p_endpoint not like 'https://%' then raise exception 'invalid_endpoint'; end if;
  if coalesce(char_length(p_p256dh),0) not between 1 and 200 or coalesce(char_length(p_auth),0) not between 1 and 100 then raise exception 'invalid_keys'; end if;
  if p_label is not null and char_length(p_label) > 80 then raise exception 'invalid_label'; end if;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, device_label, last_used_at, failure_count)
  values (v_uid, p_endpoint, p_p256dh, p_auth, p_label, now(), 0)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    device_label = excluded.device_label, failure_count = 0, last_used_at = now()
  returning id into v_id;
  delete from public.push_subscriptions where id in (
    select id from public.push_subscriptions where user_id = v_uid
    order by coalesce(last_used_at, created_at) desc offset 10);
  return v_id;
end $$;

create or replace function public.remove_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()
$$;

create or replace function public.remove_push_device(p_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where id = p_id and user_id = auth.uid()
$$;

create or replace function public.get_my_notification_prefs()
returns table(groups jsonb, quiet_hours_enabled boolean, quiet_from time, quiet_to time, daily_nudge_enabled boolean, daily_nudge_time time)
language sql stable security definer set search_path = public as $$
  select * from public.effective_prefs(auth.uid())
$$;

create or replace function public.save_my_notification_prefs(p_groups jsonb, p_quiet_enabled boolean, p_quiet_from time, p_quiet_to time, p_nudge_enabled boolean, p_nudge_time time)
returns void language plpgsql security definer set search_path = public as $$
declare g text; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if jsonb_typeof(p_groups) <> 'object' or (select array_agg(k order by k) from jsonb_object_keys(p_groups) k) <> array['absences','deputy','reminders','reports'] then
    raise exception 'invalid_groups'; end if;
  foreach g in array array['absences','deputy','reminders','reports'] loop
    if jsonb_typeof(p_groups->g) <> 'object'
       or (select array_agg(k order by k) from jsonb_object_keys(p_groups->g) k) <> array['email','push']
       or jsonb_typeof(p_groups->g->'push') <> 'boolean' or jsonb_typeof(p_groups->g->'email') <> 'boolean' then
      raise exception 'invalid_groups'; end if;
  end loop;
  if p_quiet_from is null or p_quiet_to is null or p_quiet_from = p_quiet_to or p_nudge_time is null then raise exception 'invalid_times'; end if;
  if not public.has_role(v_uid, 'azubi') then p_nudge_enabled := false; end if;
  insert into public.notification_prefs(user_id, groups, quiet_hours_enabled, quiet_from, quiet_to, daily_nudge_enabled, daily_nudge_time, updated_at)
  values (v_uid, p_groups, coalesce(p_quiet_enabled,true), p_quiet_from, p_quiet_to, coalesce(p_nudge_enabled,false), p_nudge_time, now())
  on conflict (user_id) do update set groups = excluded.groups, quiet_hours_enabled = excluded.quiet_hours_enabled,
    quiet_from = excluded.quiet_from, quiet_to = excluded.quiet_to, daily_nudge_enabled = excluded.daily_nudge_enabled,
    daily_nudge_time = excluded.daily_nudge_time, updated_at = now();
end $$;

create or replace function public.check_call_limit(p_user uuid, p_fn text, p_max int, p_window interval)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text || p_fn));
  if (select count(*) from public.function_calls where user_id = p_user and fn = p_fn and created_at > now() - p_window) >= p_max then
    return false; end if;
  insert into public.function_calls(user_id, fn) values (p_user, p_fn);
  return true;
end $$;

create or replace function public.claim_deliveries(p_limit int)
returns table(id bigint, channel text, user_id uuid, notification_id uuid, type text, link text, attempts int)
language plpgsql security definer set search_path = public as $$
begin
  update public.delivery_queue q set status = 'pending' where q.status = 'sending' and q.claimed_at < now() - interval '10 minutes';
  update public.delivery_queue q set status = 'skipped' from public.notifications n
    where n.id = q.notification_id and q.status = 'pending' and n.read_at is not null;
  return query
  with picked as (
    select q.id from public.delivery_queue q
    where q.status = 'pending' and q.scheduled_at <= now()
    order by q.scheduled_at limit p_limit for update skip locked
  ), upd as (
    update public.delivery_queue q set status = 'sending', claimed_at = now(), attempts = q.attempts + 1
    from picked where q.id = picked.id
    returning q.id, q.channel, q.user_id, q.notification_id, q.attempts
  )
  select u.id, u.channel, u.user_id, u.notification_id, n.type, n.link, u.attempts
  from upd u join public.notifications n on n.id = u.notification_id;
end $$;

create or replace function public.finish_delivery(p_id bigint, p_ok boolean, p_error text, p_skip boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_att int;
begin
  select attempts into v_att from public.delivery_queue where id = p_id;
  if p_ok then
    update public.delivery_queue set status = 'sent', sent_at = now(), last_error = null where id = p_id;
  elsif p_skip then
    update public.delivery_queue set status = 'skipped', last_error = left(p_error, 200) where id = p_id;
  elsif v_att < 5 then
    update public.delivery_queue set status = 'pending', last_error = left(p_error, 200),
      scheduled_at = now() + (case v_att when 1 then 1 when 2 then 5 when 3 then 30 else 120 end) * interval '1 minute'
    where id = p_id;
  else
    update public.delivery_queue set status = 'failed', last_error = left(p_error, 200) where id = p_id;
  end if;
end $$;

create or replace function public.delivery_health()
returns table(pending int, failed_7d int, last_sent_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_leitung(auth.uid()) then raise exception 'forbidden'; end if;
  return query select
    (select count(*)::int from public.delivery_queue where status in ('pending','sending')),
    (select count(*)::int from public.delivery_queue where status = 'failed' and created_at > now() - interval '7 days'),
    (select max(sent_at) from public.delivery_queue where status = 'sent');
end $$;

create or replace function public.enqueue_deliveries() returns trigger
language plpgsql security definer set search_path = public as $$
declare g text; p record; v_local timestamp; v_now_t time; v_in_quiet boolean; v_sched timestamptz;
begin
  begin
    g := public.notification_group(new.type);
    if g is null then return new; end if;
    select * into p from public.effective_prefs(new.user_id);
    if coalesce((p.groups->g->>'push')::boolean, false)
       and exists (select 1 from public.push_subscriptions s where s.user_id = new.user_id) then
      v_sched := now();
      if p.quiet_hours_enabled then
        v_local := now() at time zone 'Europe/Berlin';
        v_now_t := v_local::time;
        if p.quiet_from > p.quiet_to then
          v_in_quiet := v_now_t >= p.quiet_from or v_now_t < p.quiet_to;
        else
          v_in_quiet := v_now_t >= p.quiet_from and v_now_t < p.quiet_to;
        end if;
        if v_in_quiet then
          v_sched := ((v_local::date + case when v_now_t >= p.quiet_to then 1 else 0 end) + p.quiet_to) at time zone 'Europe/Berlin';
        end if;
      end if;
      insert into public.delivery_queue(notification_id, user_id, channel, scheduled_at) values (new.id, new.user_id, 'push', v_sched);
    end if;
    if coalesce((p.groups->g->>'email')::boolean, false)
       and exists (select 1 from public.profiles pr where pr.id = new.user_id and coalesce(pr.email,'') <> '') then
      insert into public.delivery_queue(notification_id, user_id, channel) values (new.id, new.user_id, 'email');
    end if;
  exception when others then
    raise warning 'enqueue_deliveries failed: %', sqlstate;
  end;
  return new;
end $$;

create trigger enqueue_deliveries after insert on public.notifications for each row execute function public.enqueue_deliveries();

revoke all on function public.default_notification_groups(), public.notification_group(text), public.effective_prefs(uuid),
  public.check_call_limit(uuid,text,int,interval), public.claim_deliveries(int), public.finish_delivery(bigint,boolean,text,boolean),
  public.enqueue_deliveries() from public, anon, authenticated;
grant execute on function public.check_call_limit(uuid,text,int,interval), public.claim_deliveries(int),
  public.finish_delivery(bigint,boolean,text,boolean), public.effective_prefs(uuid) to service_role;
revoke all on function public.register_push_subscription(text,text,text,text), public.remove_push_subscription(text),
  public.remove_push_device(uuid), public.get_my_notification_prefs(),
  public.save_my_notification_prefs(jsonb,boolean,time,time,boolean,time), public.delivery_health() from public, anon;
grant execute on function public.register_push_subscription(text,text,text,text), public.remove_push_subscription(text),
  public.remove_push_device(uuid), public.get_my_notification_prefs(),
  public.save_my_notification_prefs(jsonb,boolean,time,time,boolean,time), public.delivery_health() to authenticated;
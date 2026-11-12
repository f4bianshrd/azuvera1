-- Ende der Ruhezeit, wenn _at für diese Person in der Push-Ruhezeit liegt (Europe/Berlin), sonst NULL.
CREATE OR REPLACE FUNCTION public.push_quiet_until(_uid uuid, _at timestamptz DEFAULT now())
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; v_local timestamp; v_t time; v_in boolean;
BEGIN
  SELECT * INTO p FROM public.effective_prefs(_uid);
  IF NOT coalesce(p.quiet_hours_enabled, false) OR p.quiet_from = p.quiet_to THEN RETURN NULL; END IF;
  v_local := _at AT TIME ZONE 'Europe/Berlin';
  v_t := v_local::time;
  IF p.quiet_from > p.quiet_to THEN v_in := v_t >= p.quiet_from OR v_t < p.quiet_to;
  ELSE v_in := v_t >= p.quiet_from AND v_t < p.quiet_to; END IF;
  IF NOT v_in THEN RETURN NULL; END IF;
  RETURN ((v_local::date + CASE WHEN v_t >= p.quiet_to THEN 1 ELSE 0 END) + p.quiet_to) AT TIME ZONE 'Europe/Berlin';
END $$;
REVOKE EXECUTE ON FUNCTION public.push_quiet_until(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- Ruhezeit auch beim Versand prüfen: Wiederholungen, Rückstau und später geänderte Ruhezeiten landen sonst nachts auf dem Handy.
CREATE OR REPLACE FUNCTION public.claim_deliveries(p_limit integer)
 RETURNS TABLE(id bigint, channel text, user_id uuid, notification_id uuid, type text, link text, attempts integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  update public.delivery_queue q set status = 'pending' where q.status = 'sending' and q.claimed_at < now() - interval '10 minutes';
  update public.delivery_queue q set status = 'skipped' from public.notifications n
    where n.id = q.notification_id and q.status = 'pending' and n.read_at is not null;
  update public.delivery_queue q set scheduled_at = public.push_quiet_until(q.user_id, now())
    where q.status = 'pending' and q.channel = 'push' and q.scheduled_at <= now()
      and public.push_quiet_until(q.user_id, now()) is not null;
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
end $function$;
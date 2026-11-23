CREATE OR REPLACE FUNCTION public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_label text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_uid uuid := auth.uid(); v_host text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_endpoint is null or char_length(p_endpoint) > 2000 or p_endpoint !~ '^https://[A-Za-z0-9.-]+(:443)?/' then raise exception 'invalid_endpoint'; end if;
  v_host := lower(substring(p_endpoint from '^https://([A-Za-z0-9.-]+)'));
  -- Nur bekannte Web-Push-Dienste (gleiche Liste wie src/lib/notify/push-endpoint.ts)
  if v_host !~ '^(fcm\.googleapis\.com|android\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)$' then
    raise exception 'invalid_endpoint';
  end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.find_possible_deputy(p_email text)
 RETURNS TABLE(id uuid, full_name text, role app_role)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE me uuid := auth.uid(); v_n int := 0;
BEGIN
  IF me IS NULL OR NOT public.is_reviewer_role(me) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF (SELECT count(*) FROM public.audit_log a WHERE a.actor_id = me AND a.entity_type = 'deputy' AND a.action = 'lookup'
      AND a.created_at > now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'Zu viele Versuche. Bitte versuche es später erneut.';
  END IF;
  -- Eine selbst gewählte Rolle reicht nicht: gefunden wird nur, wer bereits nachweislich mit dir zusammenarbeitet
  -- (gemeinsamer Azubi über aktive Zugriffe oder bestehende Vertretung). Ausbildungsleitung bleibt ausgenommen.
  RETURN QUERY SELECT p.id, p.full_name, ur.role FROM auth.users u
    JOIN public.profiles p ON p.id = u.id JOIN public.user_roles ur ON ur.user_id = u.id
    WHERE lower(u.email) = lower(btrim(coalesce(p_email, ''))) AND (u.email_confirmed_at IS NOT NULL OR u.confirmed_at IS NOT NULL)
      AND public.is_reviewer_role(u.id) AND u.id <> me
      AND (
        public.is_leitung(me)
        OR EXISTS (
          SELECT 1 FROM public.access_grants g1 JOIN public.access_grants g2 ON g2.azubi_id = g1.azubi_id
          WHERE g1.grantee_id = me AND g2.grantee_id = u.id
            AND g1.revoked_at IS NULL AND (g1.valid_until IS NULL OR g1.valid_until > now())
            AND g2.revoked_at IS NULL AND (g2.valid_until IS NULL OR g2.valid_until > now()))
        OR EXISTS (
          SELECT 1 FROM public.deputies d
          WHERE ((d.principal_id = me AND d.deputy_id = u.id) OR (d.principal_id = u.id AND d.deputy_id = me)))
      )
    LIMIT 1;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM public.write_audit('deputy', NULL, 'lookup', NULL, jsonb_build_object('found', v_n > 0));
END $function$;
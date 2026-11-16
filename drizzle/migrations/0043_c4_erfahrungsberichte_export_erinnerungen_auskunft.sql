CREATE OR REPLACE FUNCTION public.log_experience_export(p_azubi uuid, p_kind text, p_count int, p_from date, p_to date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_view_azubi(auth.uid(), p_azubi) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF p_kind NOT IN ('single','bulk','zip') OR p_count IS NULL OR p_count < 0 THEN RAISE EXCEPTION 'Ungültiger Export.'; END IF;
  PERFORM public.write_audit('export', NULL, 'pdf_export', p_azubi,
    jsonb_build_object('kind', p_kind, 'count', p_count, 'from', p_from, 'to', p_to, 'scope', 'experience'));
END $$;
REVOKE ALL ON FUNCTION public.log_experience_export(uuid, text, int, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_experience_export(uuid, text, int, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.audit_experience_visible(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.experience_reports e WHERE e.id = p_id AND e.status <> 'draft')
$$;
REVOKE ALL ON FUNCTION public.audit_experience_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_experience_visible(uuid) TO authenticated;
DROP POLICY IF EXISTS audit_log_select ON public.audit_log;
CREATE POLICY audit_log_select ON public.audit_log FOR SELECT TO authenticated
  USING ((azubi_id = auth.uid()) OR public.is_leitung(auth.uid()) OR ((azubi_id IS NOT NULL) AND public.can_view_azubi(auth.uid(), azubi_id)
    AND (entity_type <> 'consent') AND ((action <> ALL (ARRAY['create','edit','delete','attachment_add','attachment_delete','ai_assist']))
      OR (entity_type = 'experience' AND public.audit_experience_visible(entity_id))
      OR (entity_type <> 'experience' AND public.audit_report_visible(entity_id)))));

CREATE OR REPLACE FUNCTION public.notification_group(_type text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  select case
    when _type in ('report_submitted','report_approved','report_rejected','report_reopened','comment',
                   'instruction_submitted','instruction_confirmed','instruction_rejected',
                   'experience_submitted','experience_approved','experience_rejected','experience_reopened','experience_comment') then 'reports'
    when _type in ('absence_requested','absence_approved','absence_rejected') then 'absences'
    when _type in ('report_reminder','deadline_soon','deadline_today','deadline_overdue','review_pending','daily_nudge','instruction_due','experience_due') then 'reminders'
    when _type in ('deputy_assigned','deputy_ended') then 'deputy'
    else null end
$$;

CREATE OR REPLACE FUNCTION public.default_reminder_rules() RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT '{"enabled":true,"deadline_weekday":1,"deadline_time":"12:00","soon_enabled":true,"soon_weekday":5,"soon_time":"14:00","today_enabled":true,"today_time":"08:00","overdue_enabled":true,"overdue_time":"08:00","overdue_every_days":3,"overdue_max":3,"review_enabled":true,"review_weekdays":[1,4],"review_time":"08:00","review_after_days":7,"instruction_enabled":true,"instruction_weekday":1,"instruction_time":"08:00","experience_enabled":true,"experience_days_before":[60,30,14],"experience_time":"08:00"}'::jsonb $$;

CREATE OR REPLACE FUNCTION public.validate_reminder_rules() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v jsonb := NEW.value; k text; e jsonb;
BEGIN
IF NEW.key<>'reminder_rules' THEN RETURN NEW; END IF;
IF jsonb_typeof(v)<>'object' THEN RAISE EXCEPTION 'Die Erinnerungsregeln sind ungültig.'; END IF;
FOREACH k IN ARRAY ARRAY['enabled','soon_enabled','today_enabled','overdue_enabled','review_enabled','instruction_enabled','experience_enabled'] LOOP
 IF jsonb_typeof(v->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Ungültiger Wert für %.', k; END IF; END LOOP;
FOREACH k IN ARRAY ARRAY['deadline_time','soon_time','today_time','overdue_time','review_time','instruction_time','experience_time'] LOOP
 IF jsonb_typeof(v->k) IS DISTINCT FROM 'string' OR (v->>k) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'Ungültige Uhrzeit für %.', k; END IF; END LOOP;
FOREACH k IN ARRAY ARRAY['deadline_weekday','soon_weekday','instruction_weekday'] LOOP
 IF jsonb_typeof(v->k) IS DISTINCT FROM 'number' OR (v->>k)::numeric NOT IN (1,2,3,4,5) THEN RAISE EXCEPTION 'Der Wochentag muss zwischen Montag und Freitag liegen.'; END IF; END LOOP;
IF jsonb_typeof(v->'overdue_every_days') IS DISTINCT FROM 'number' OR (v->>'overdue_every_days')::numeric NOT BETWEEN 1 AND 14 OR (v->>'overdue_every_days')::numeric<>trunc((v->>'overdue_every_days')::numeric) THEN RAISE EXCEPTION 'Der Abstand muss 1 bis 14 Tage betragen.'; END IF;
IF jsonb_typeof(v->'overdue_max') IS DISTINCT FROM 'number' OR (v->>'overdue_max')::numeric NOT BETWEEN 1 AND 10 OR (v->>'overdue_max')::numeric<>trunc((v->>'overdue_max')::numeric) THEN RAISE EXCEPTION 'Es sind 1 bis 10 Erinnerungen erlaubt.'; END IF;
IF jsonb_typeof(v->'review_after_days') IS DISTINCT FROM 'number' OR (v->>'review_after_days')::numeric NOT BETWEEN 1 AND 30 OR (v->>'review_after_days')::numeric<>trunc((v->>'review_after_days')::numeric) THEN RAISE EXCEPTION 'Die Wartezeit muss 1 bis 30 Tage betragen.'; END IF;
IF jsonb_typeof(v->'review_weekdays') IS DISTINCT FROM 'array' OR jsonb_array_length(v->'review_weekdays')=0 THEN RAISE EXCEPTION 'Wähle mindestens einen Wochentag für wartende Prüfungen.'; END IF;
FOR e IN SELECT * FROM jsonb_array_elements(v->'review_weekdays') LOOP
 IF jsonb_typeof(e)<>'number' OR e::text::numeric NOT IN (1,2,3,4,5) THEN RAISE EXCEPTION 'Wochentage müssen zwischen Montag und Freitag liegen.'; END IF; END LOOP;
IF jsonb_typeof(v->'experience_days_before') IS DISTINCT FROM 'array' OR jsonb_array_length(v->'experience_days_before') NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Gib 1 bis 5 Tage vor Ende des Lehrjahres an.'; END IF;
FOR e IN SELECT * FROM jsonb_array_elements(v->'experience_days_before') LOOP
 IF jsonb_typeof(e)<>'number' OR e::text::numeric NOT BETWEEN 1 AND 365 OR e::text::numeric<>trunc(e::text::numeric) THEN RAISE EXCEPTION 'Die Tage vor Ende des Lehrjahres müssen ganze Zahlen von 1 bis 365 sein.'; END IF; END LOOP;
RETURN NEW;
END $$;

UPDATE public.app_settings
   SET value = jsonb_build_object('experience_enabled', true, 'experience_days_before', '[60,30,14]'::jsonb, 'experience_time', '08:00') || value
 WHERE key = 'reminder_rules'
   AND NOT (value ? 'experience_enabled' AND value ? 'experience_days_before' AND value ? 'experience_time');

CREATE OR REPLACE FUNCTION public.generate_experience_reminders(p_now timestamptz)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rules jsonb := public.default_reminder_rules() || coalesce((SELECT value FROM public.app_settings WHERE key = 'reminder_rules'), '{}'::jsonb);
  lt timestamp := p_now AT TIME ZONE 'Europe/Berlin'; d date := lt::date; t time := lt::time;
  r record; c record; lid uuid; created int := 0; cur int; left_days int; missing int; txt text;
BEGIN
  IF NOT coalesce((rules->>'enabled')::boolean, false) OR NOT coalesce((rules->>'experience_enabled')::boolean, false) THEN RETURN 0; END IF;
  IF t < (rules->>'experience_time')::time OR t - (rules->>'experience_time')::time >= interval '6 hours' THEN RETURN 0; END IF;
  FOR r IN
    SELECT p.id, p.ausbildungsbeginn, p.ausbildungsende FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'azubi'
     WHERE p.ausbildungsbeginn IS NOT NULL AND p.created_at <= p_now - interval '7 days'
  LOOP
    cur := public.training_year_clamped(r.ausbildungsbeginn, r.ausbildungsende, d);
    SELECT * INTO c FROM public.experience_year_counts(r.id) x WHERE x.year_no = cur;
    CONTINUE WHEN NOT FOUND;
    left_days := c.year_end - d;
    missing := greatest(0, c.required - c.approved - c.submitted);
    CONTINUE WHEN missing = 0 OR left_days < 1 OR NOT ((rules->'experience_days_before') @> to_jsonb(left_days));
    lid := NULL;
    INSERT INTO public.reminder_log (user_id, rule, period_key, created_at) VALUES (r.id, 'experience_due', cur || ':' || left_days, p_now)
    ON CONFLICT DO NOTHING RETURNING id INTO lid;
    IF lid IS NOT NULL THEN
      txt := format('Im %s. Lehrjahr fehlen noch %s Erfahrungsbericht(e). ', cur, missing) ||
        CASE WHEN left_days = 1 THEN format('Das Lehrjahr endet morgen, am %s.', to_char(c.year_end, 'DD.MM.YYYY'))
             ELSE format('Das Lehrjahr endet in %s Tagen am %s.', left_days, to_char(c.year_end, 'DD.MM.YYYY')) END;
      INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
      VALUES (r.id, 'experience_due', 'Erfahrungsberichte fehlen noch', txt, '/erfahrungsberichte', 'reminder', lid);
      created := created + 1;
    END IF;
  END LOOP;
  RETURN created;
END $$;
REVOKE ALL ON FUNCTION public.generate_experience_reminders(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_experience_reminders(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.generate_reminders(p_now timestamptz DEFAULT now()) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.generate_reminders_base(p_now) + public.generate_instruction_reminders(p_now) + public.generate_experience_reminders(p_now);
END $$;

CREATE OR REPLACE FUNCTION public.export_my_data() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
  RETURN public.export_my_data_base() || jsonb_build_object(
    'instruction_records', coalesce((SELECT jsonb_agg(to_jsonb(r) - 'reviewer_id' - 'on_behalf_of' || jsonb_build_object(
        'point_keys', coalesce((SELECT jsonb_agg(p.key ORDER BY p.key) FROM public.instruction_record_points rp
          JOIN public.instruction_points p ON p.id = rp.point_id WHERE rp.record_id = r.id), '[]'::jsonb))
      ORDER BY r.given_on NULLS LAST, r.created_at) FROM public.instruction_records r WHERE r.azubi_id = me), '[]'::jsonb),
    'experience_reports', coalesce((SELECT jsonb_agg(to_jsonb(e) - 'reviewer_id' ORDER BY e.written_on, e.created_at)
      FROM public.experience_reports e WHERE e.azubi_id = me), '[]'::jsonb),
    'experience_attachments', coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.experience_id, a.sort_order)
      FROM public.experience_attachments a WHERE a.azubi_id = me), '[]'::jsonb),
    'experience_versions', coalesce((SELECT jsonb_agg(to_jsonb(v) - 'changed_by' ORDER BY v.experience_id, v.created_at)
      FROM public.experience_versions v JOIN public.experience_reports e ON e.id = v.experience_id WHERE e.azubi_id = me), '[]'::jsonb),
    'experience_signatures', coalesce((SELECT jsonb_agg(to_jsonb(s) - 'signer_id' - 'on_behalf_of' ORDER BY s.signed_at)
      FROM public.experience_signatures s WHERE s.signer_id = me
         OR EXISTS (SELECT 1 FROM public.experience_reports e WHERE e.id = s.experience_id AND e.azubi_id = me)), '[]'::jsonb),
    'experience_comments', coalesce((SELECT jsonb_agg(to_jsonb(c) - 'author_id' || jsonb_build_object(
        'author_name', coalesce((SELECT p.full_name FROM public.profiles p WHERE p.id = c.author_id), 'Gelöschte Person'),
        'own', c.author_id = me) ORDER BY c.created_at)
      FROM public.experience_comments c WHERE c.azubi_id = me OR c.author_id = me), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.account_removal_paths(p_user uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(DISTINCT x.path), '{}') FROM (
    SELECT 'report-files/' || a.storage_path AS path FROM public.report_attachments a WHERE a.azubi_id = p_user
    UNION SELECT 'report-files/' || a.thumb_path FROM public.report_attachments a WHERE a.azubi_id = p_user AND a.thumb_path IS NOT NULL
    UNION SELECT 'signatures/' || s.image_path FROM public.report_signatures s JOIN public.reports r ON r.id = s.report_id
      WHERE r.azubi_id = p_user AND s.role = 'azubi' AND s.image_path IS NOT NULL
    UNION SELECT 'signatures/' || u.image_path FROM public.user_signatures u WHERE u.user_id = p_user AND u.image_path IS NOT NULL
    UNION SELECT 'experience-files/' || a.storage_path FROM public.experience_attachments a WHERE a.azubi_id = p_user
    UNION SELECT 'experience-files/' || a.thumb_path FROM public.experience_attachments a WHERE a.azubi_id = p_user AND a.thumb_path IS NOT NULL
    UNION SELECT 'signatures/' || s.image_path FROM public.experience_signatures s JOIN public.experience_reports e ON e.id = s.experience_id
      WHERE e.azubi_id = p_user AND s.role = 'azubi' AND s.image_path IS NOT NULL
    UNION SELECT o.bucket_id || '/' || o.name FROM storage.objects o
      WHERE o.bucket_id IN ('report-files', 'signatures', 'experience-files') AND split_part(o.name, '/', 1) = p_user::text
  ) x
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_azubi_data(p_user uuid, p_actor uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(p_user, 'azubi') THEN RAISE EXCEPTION 'Nur Konten von Auszubildenden können gelöscht werden.'; END IF;
  PERFORM set_config('azuvera.account_removal', 'on', true);
  DELETE FROM public.report_signatures
   WHERE report_id IN (SELECT id FROM public.reports WHERE azubi_id = p_user)
      OR signer_id = p_user OR on_behalf_of = p_user;
  DELETE FROM public.report_comments
   WHERE report_id IN (SELECT id FROM public.reports WHERE azubi_id = p_user)
      OR author_id = p_user;
  DELETE FROM public.report_versions
   WHERE report_id IN (SELECT id FROM public.reports WHERE azubi_id = p_user);
  DELETE FROM public.report_attachments WHERE azubi_id = p_user;
  DELETE FROM public.reports WHERE azubi_id = p_user;
  DELETE FROM public.experience_signatures
   WHERE experience_id IN (SELECT id FROM public.experience_reports WHERE azubi_id = p_user)
      OR signer_id = p_user OR on_behalf_of = p_user;
  DELETE FROM public.experience_comments
   WHERE experience_id IN (SELECT id FROM public.experience_reports WHERE azubi_id = p_user)
      OR author_id = p_user;
  DELETE FROM public.experience_versions
   WHERE experience_id IN (SELECT id FROM public.experience_reports WHERE azubi_id = p_user);
  DELETE FROM public.experience_attachments WHERE azubi_id = p_user;
  DELETE FROM public.experience_reports WHERE azubi_id = p_user;
  DELETE FROM public.ai_usage WHERE user_id = p_user;
  DELETE FROM public.function_calls WHERE user_id = p_user;
  DELETE FROM public.profiles WHERE id = p_user;
  PERFORM set_config('azuvera.account_removal', '', true);
  INSERT INTO public.audit_log (chain_key, actor_id, actor_role, azubi_id, entity_type, entity_id, action, details)
  VALUES ('00000000-0000-0000-0000-000000000000', p_actor,
    (SELECT role FROM public.user_roles WHERE user_id = p_actor), NULL, 'account', p_user, 'account_deleted',
    jsonb_build_object('mode', 'deleted'));
END $$;

DO $do$
DECLARE def text; a int; b int;
BEGIN
  def := pg_get_functiondef('public.generate_reminders_base(timestamptz)'::regprocedure);
  a := strpos(def, $s$IF (rules->>'review_enabled')::boolean$s$);
  b := strpos(def, 'RETURN created;');
  IF a = 0 OR b = 0 OR b < a THEN RAISE EXCEPTION 'generate_reminders_base: Abschnitt nicht gefunden'; END IF;
  def := left(def, a - 1) || $n$IF (rules->>'review_enabled')::boolean AND (rules->'review_weekdays') @> to_jsonb(dow) AND t>=(rules->>'review_time')::time AND t-(rules->>'review_time')::time<interval '6 hours' THEN
 FOR r IN SELECT x.user_id, count(*)::int c, (count(*) FILTER (WHERE x.k='e'))::int ce FROM (
   SELECT DISTINCT nr.user_id, 'r'::text k, rp.id FROM public.reports rp CROSS JOIN LATERAL public.notification_recipients(rp.azubi_id) nr
     WHERE rp.status='submitted' AND rp.submitted_at<p_now-((rules->>'review_after_days')::int*interval '1 day')
   UNION
   SELECT DISTINCT nr.user_id, 'e'::text k, er.id FROM public.experience_reports er CROSS JOIN LATERAL public.notification_recipients(er.azubi_id) nr
     WHERE er.status='submitted' AND er.submitted_at<p_now-((rules->>'review_after_days')::int*interval '1 day')
   ) x GROUP BY x.user_id LOOP
  lid:=NULL; INSERT INTO public.reminder_log(user_id,rule,period_key,created_at) VALUES(r.user_id,'review_pending',d::text,p_now) ON CONFLICT DO NOTHING RETURNING id INTO lid;
  IF lid IS NOT NULL THEN
   IF r.ce = 0 THEN
    INSERT INTO public.notifications(user_id,type,title,body,link,entity_type,entity_id) VALUES(r.user_id,'review_pending','Berichte warten auf Prüfung',format('%s Bericht(e) warten seit mehr als %s Tagen auf deine Prüfung.',r.c,rules->>'review_after_days'),'/ausbilder?tab=pruefen','reminder',lid);
   ELSE
    INSERT INTO public.notifications(user_id,type,title,body,link,entity_type,entity_id) VALUES(r.user_id,'review_pending','Berichte warten auf Prüfung',format('%s Einreichung(en) warten seit mehr als %s Tagen auf deine Prüfung (davon %s Erfahrungsbericht(e)).',r.c,rules->>'review_after_days',r.ce),CASE WHEN r.c = r.ce THEN '/ausbilder?tab=erfahrungsberichte' ELSE '/ausbilder?tab=pruefen' END,'reminder',lid);
   END IF;
   created:=created+1;
  END IF;
 END LOOP;
END IF;
$n$ || substr(def, b);
  EXECUTE def;
END $do$;
CREATE TABLE public.reminder_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,rule text NOT NULL,period_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,rule,period_key));
GRANT ALL ON public.reminder_log TO service_role;
ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.default_reminder_rules() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT '{"enabled":true,"deadline_weekday":1,"deadline_time":"12:00","soon_enabled":true,"soon_weekday":5,"soon_time":"14:00","today_enabled":true,"today_time":"08:00","overdue_enabled":true,"overdue_time":"08:00","overdue_every_days":3,"overdue_max":3,"review_enabled":true,"review_weekdays":[1,4],"review_time":"08:00","review_after_days":7}'::jsonb $$;

INSERT INTO public.app_settings(key,value,is_public) VALUES('reminder_rules',public.default_reminder_rules(),false) ON CONFLICT(key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.validate_reminder_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v jsonb := NEW.value; k text; e jsonb;
BEGIN
IF NEW.key<>'reminder_rules' THEN RETURN NEW; END IF;
IF jsonb_typeof(v)<>'object' THEN RAISE EXCEPTION 'Die Erinnerungsregeln sind ungültig.'; END IF;
FOREACH k IN ARRAY ARRAY['enabled','soon_enabled','today_enabled','overdue_enabled','review_enabled'] LOOP
 IF jsonb_typeof(v->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Ungültiger Wert für %.', k; END IF; END LOOP;
FOREACH k IN ARRAY ARRAY['deadline_time','soon_time','today_time','overdue_time','review_time'] LOOP
 IF jsonb_typeof(v->k) IS DISTINCT FROM 'string' OR (v->>k) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'Ungültige Uhrzeit für %.', k; END IF; END LOOP;
FOREACH k IN ARRAY ARRAY['deadline_weekday','soon_weekday'] LOOP
 IF jsonb_typeof(v->k) IS DISTINCT FROM 'number' OR (v->>k)::numeric NOT IN (1,2,3,4,5) THEN RAISE EXCEPTION 'Der Wochentag muss zwischen Montag und Freitag liegen.'; END IF; END LOOP;
IF jsonb_typeof(v->'overdue_every_days') IS DISTINCT FROM 'number' OR (v->>'overdue_every_days')::numeric NOT BETWEEN 1 AND 14 OR (v->>'overdue_every_days')::numeric<>trunc((v->>'overdue_every_days')::numeric) THEN RAISE EXCEPTION 'Der Abstand muss 1 bis 14 Tage betragen.'; END IF;
IF jsonb_typeof(v->'overdue_max') IS DISTINCT FROM 'number' OR (v->>'overdue_max')::numeric NOT BETWEEN 1 AND 10 OR (v->>'overdue_max')::numeric<>trunc((v->>'overdue_max')::numeric) THEN RAISE EXCEPTION 'Es sind 1 bis 10 Erinnerungen erlaubt.'; END IF;
IF jsonb_typeof(v->'review_after_days') IS DISTINCT FROM 'number' OR (v->>'review_after_days')::numeric NOT BETWEEN 1 AND 30 OR (v->>'review_after_days')::numeric<>trunc((v->>'review_after_days')::numeric) THEN RAISE EXCEPTION 'Die Wartezeit muss 1 bis 30 Tage betragen.'; END IF;
IF jsonb_typeof(v->'review_weekdays') IS DISTINCT FROM 'array' OR jsonb_array_length(v->'review_weekdays')=0 THEN RAISE EXCEPTION 'Wähle mindestens einen Wochentag für wartende Prüfungen.'; END IF;
FOR e IN SELECT * FROM jsonb_array_elements(v->'review_weekdays') LOOP
 IF jsonb_typeof(e)<>'number' OR e::text::numeric NOT IN (1,2,3,4,5) THEN RAISE EXCEPTION 'Wochentage müssen zwischen Montag und Freitag liegen.'; END IF; END LOOP;
RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_reminder_rules BEFORE INSERT OR UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.validate_reminder_rules();

CREATE OR REPLACE FUNCTION public.week_deadline_at(week_end date, rules jsonb) RETURNS timestamptz LANGUAGE sql STABLE SET search_path=public AS $$
SELECT ((date_trunc('week',week_end)::date+7+((rules->>'deadline_weekday')::int-1))+(rules->>'deadline_time')::time) AT TIME ZONE 'Europe/Berlin' $$;
REVOKE ALL ON FUNCTION public.week_deadline_at(date,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.kw_list(weeks date[]) RETURNS text LANGUAGE sql IMMUTABLE AS $$
WITH l AS (SELECT array_agg('KW '||extract(week FROM w)::int ORDER BY w) a FROM (SELECT w FROM unnest(weeks) w ORDER BY w LIMIT 5) s)
SELECT CASE WHEN array_length(a,1)=1 THEN a[1] ELSE array_to_string(a[1:array_length(a,1)-1],', ')||' und '||a[array_length(a,1)] END FROM l $$;
REVOKE ALL ON FUNCTION public.kw_list(date[]) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.generate_reminders(p_now timestamptz DEFAULT now()) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 rules jsonb := coalesce((SELECT value FROM public.app_settings WHERE key='reminder_rules'),public.default_reminder_rules());
 lt timestamp := p_now AT TIME ZONE 'Europe/Berlin'; d date := lt::date; t time := lt::time; dow int := extract(isodow FROM lt)::int;
 mon date := date_trunc('week',lt)::date; created int := 0; r record; lid uuid; dl timestamptz; txt text; n int; last_at timestamptz; k int; lst text;
 wd text[] := ARRAY['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
BEGIN
IF NOT coalesce((rules->>'enabled')::boolean,false) THEN RETURN 0; END IF;
IF (rules->>'soon_enabled')::boolean AND dow=(rules->>'soon_weekday')::int AND t>=(rules->>'soon_time')::time AND t-(rules->>'soon_time')::time<interval '6 hours' THEN
 dl := public.week_deadline_at(mon+6,rules);
 FOR r IN SELECT m.azubi_id,m.week_start FROM public.compute_missing_weeks(NULL,mon+7) m JOIN public.profiles p ON p.id=m.azubi_id WHERE m.week_start=mon AND m.week_start>=date_trunc('week',p.created_at AT TIME ZONE 'Europe/Berlin')::date LOOP
  lid:=NULL; INSERT INTO public.reminder_log(user_id,rule,period_key,created_at) VALUES(r.azubi_id,'deadline_soon',r.week_start::text,p_now) ON CONFLICT DO NOTHING RETURNING id INTO lid;
  IF lid IS NOT NULL THEN
   txt := format('Dein Bericht für KW %s ist noch nicht eingereicht. Abgabefrist: %s, %s, %s Uhr.',extract(week FROM r.week_start)::int,wd[extract(isodow FROM dl AT TIME ZONE 'Europe/Berlin')::int],to_char(dl AT TIME ZONE 'Europe/Berlin','DD.MM.YYYY'),rules->>'deadline_time');
   INSERT INTO public.notifications(user_id,type,title,body,link,entity_type,entity_id) VALUES(r.azubi_id,'deadline_soon','Abgabefrist rückt näher',txt,'/reports/new','reminder',lid); created:=created+1;
  END IF; END LOOP;
END IF;
IF (rules->>'today_enabled')::boolean AND dow=(rules->>'deadline_weekday')::int AND t>=(rules->>'today_time')::time AND t-(rules->>'today_time')::time<interval '6 hours' AND p_now<public.week_deadline_at(mon-1,rules) THEN
 FOR r IN SELECT m.azubi_id,m.week_start FROM public.compute_missing_weeks(NULL,d) m JOIN public.profiles p ON p.id=m.azubi_id WHERE m.week_start=mon-7 AND m.week_start>=date_trunc('week',p.created_at AT TIME ZONE 'Europe/Berlin')::date LOOP
  lid:=NULL; INSERT INTO public.reminder_log(user_id,rule,period_key,created_at) VALUES(r.azubi_id,'deadline_today',r.week_start::text,p_now) ON CONFLICT DO NOTHING RETURNING id INTO lid;
  IF lid IS NOT NULL THEN
   txt := format('Heute um %s Uhr läuft die Frist für deinen Bericht der KW %s ab.',rules->>'deadline_time',extract(week FROM r.week_start)::int);
   INSERT INTO public.notifications(user_id,type,title,body,link,entity_type,entity_id) VALUES(r.azubi_id,'deadline_today','Heute ist Abgabefrist',txt,'/reports/new','reminder',lid); created:=created+1;
  END IF; END LOOP;
END IF;
IF (rules->>'overdue_enabled')::boolean AND dow<=5 AND t>=(rules->>'overdue_time')::time AND t-(rules->>'overdue_time')::time<interval '6 hours' THEN
 FOR r IN SELECT m.azubi_id,array_agg(m.week_start ORDER BY m.week_start) weeks FROM public.compute_missing_weeks(NULL,d) m JOIN public.profiles p ON p.id=m.azubi_id
   WHERE m.week_start>=date_trunc('week',p.created_at AT TIME ZONE 'Europe/Berlin')::date AND public.week_deadline_at(m.week_end,rules)<p_now AND (public.week_deadline_at(m.week_end,rules) AT TIME ZONE 'Europe/Berlin')::date<d GROUP BY m.azubi_id LOOP
  SELECT count(*)+1,max(l.created_at) INTO n,last_at FROM public.reminder_log l WHERE l.user_id=r.azubi_id AND l.rule='deadline_overdue' AND l.period_key LIKE r.weeks[1]::text||'#%';
  IF n<=(rules->>'overdue_max')::int AND (n=1 OR last_at<=p_now-((rules->>'overdue_every_days')::int*interval '1 day'-interval '2 hours')) THEN
   lid:=NULL; INSERT INTO public.reminder_log(user_id,rule,period_key,created_at) VALUES(r.azubi_id,'deadline_overdue',r.weeks[1]::text||'#'||n,p_now) ON CONFLICT DO NOTHING RETURNING id INTO lid;
   IF lid IS NOT NULL THEN
    k := array_length(r.weeks,1); lst := public.kw_list(r.weeks);
    txt := format('Für %s Woche(n) fehlt noch der Bericht: %s. Bitte trage sie nach.',k,lst);
    INSERT INTO public.notifications(user_id,type,title,body,link,entity_type,entity_id) VALUES(r.azubi_id,'deadline_overdue','Bericht überfällig',txt,'/reports/new','reminder',lid);
    INSERT INTO public.report_reminders(azubi_id,sender_id,period_label,message,channel) VALUES(r.azubi_id,NULL,format('%s offene Woche(n) · zuletzt %s',k,lst),txt,'app');
    created:=created+1;
   END IF;
  END IF; END LOOP;
END IF;
IF dow<=5 THEN
 FOR r IN SELECT p.id FROM public.profiles p JOIN public.user_roles ur ON ur.user_id=p.id AND ur.role='azubi' CROSS JOIN LATERAL public.effective_prefs(p.id) ep
   WHERE p.ausbildungsbeginn IS NOT NULL AND ep.daily_nudge_enabled AND t>=ep.daily_nudge_time AND t-ep.daily_nudge_time<interval '6 hours'
   AND d>=p.ausbildungsbeginn AND (p.ausbildungsende IS NULL OR d<=p.ausbildungsende)
   AND NOT EXISTS(SELECT 1 FROM public.absences a WHERE a.azubi_id=p.id AND a.status<>'rejected' AND d BETWEEN a.date_from AND a.date_to)
   AND NOT EXISTS(SELECT 1 FROM public.reports rp WHERE rp.azubi_id=p.id AND ((rp.report_type='daily' AND rp.report_date=d) OR (rp.report_type='weekly' AND rp.report_date=mon))) LOOP
  lid:=NULL; INSERT INTO public.reminder_log(user_id,rule,period_key,created_at) VALUES(r.id,'daily_nudge',d::text,p_now) ON CONFLICT DO NOTHING RETURNING id INTO lid;
  IF lid IS NOT NULL THEN INSERT INTO public.notifications(user_id,type,title,body,link,entity_type,entity_id) VALUES(r.id,'daily_nudge','Berichtseintrag nicht vergessen','Du hast heute noch keinen Berichtseintrag angelegt.','/reports/new','reminder',lid); created:=created+1; END IF;
 END LOOP;
END IF;
IF (rules->>'review_enabled')::boolean AND (rules->'review_weekdays') @> to_jsonb(dow) AND t>=(rules->>'review_time')::time AND t-(rules->>'review_time')::time<interval '6 hours' THEN
 FOR r IN SELECT nr.user_id,count(DISTINCT rp.id)::int c FROM public.reports rp CROSS JOIN LATERAL public.notification_recipients(rp.azubi_id) nr
   WHERE rp.status='submitted' AND rp.submitted_at<p_now-((rules->>'review_after_days')::int*interval '1 day') GROUP BY nr.user_id LOOP
  lid:=NULL; INSERT INTO public.reminder_log(user_id,rule,period_key,created_at) VALUES(r.user_id,'review_pending',d::text,p_now) ON CONFLICT DO NOTHING RETURNING id INTO lid;
  IF lid IS NOT NULL THEN INSERT INTO public.notifications(user_id,type,title,body,link,entity_type,entity_id) VALUES(r.user_id,'review_pending','Berichte warten auf Prüfung',format('%s Bericht(e) warten seit mehr als %s Tagen auf deine Prüfung.',r.c,rules->>'review_after_days'),'/ausbilder?tab=pruefen','reminder',lid); created:=created+1; END IF;
 END LOOP;
END IF;
RETURN created;
END $$;
REVOKE ALL ON FUNCTION public.generate_reminders(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.generate_reminders(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.save_reminder_rules(p_rules jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old jsonb; changed text[];
BEGIN
IF auth.uid() IS NULL OR NOT public.is_leitung(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
old := coalesce((SELECT value FROM public.app_settings WHERE key='reminder_rules'),public.default_reminder_rules());
SELECT array_agg(k ORDER BY k) INTO changed FROM (SELECT jsonb_object_keys(p_rules) k) s WHERE old->k IS DISTINCT FROM p_rules->k;
INSERT INTO public.app_settings(key,value,is_public,updated_by) VALUES('reminder_rules',p_rules,false,auth.uid()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,is_public=false,updated_by=auth.uid(),updated_at=now();
IF changed IS NOT NULL THEN PERFORM public.write_audit('settings',NULL,'reminder_rules_changed',NULL,jsonb_build_object('changed',to_jsonb(changed))); END IF;
END $$;
REVOKE ALL ON FUNCTION public.save_reminder_rules(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_reminder_rules(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_reminder_rules() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT CASE WHEN public.is_leitung(auth.uid()) THEN coalesce((SELECT value FROM public.app_settings WHERE key='reminder_rules'),public.default_reminder_rules()) END $$;
REVOKE ALL ON FUNCTION public.get_reminder_rules() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_reminder_rules() TO authenticated;

CREATE OR REPLACE FUNCTION public.send_report_reminder(azubi_id uuid,period_label text,message text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid; principal uuid; person text;
BEGIN
IF auth.uid() IS NULL OR NOT public.can_review_for(auth.uid(),azubi_id) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
IF message IS NULL OR char_length(btrim(message)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Die Nachricht muss 1 bis 500 Zeichen enthalten.'; END IF;
IF period_label IS NULL OR char_length(period_label)>200 THEN RAISE EXCEPTION 'Der Zeitraum ist ungültig.'; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended(azubi_id::text,0));
IF EXISTS(SELECT 1 FROM public.report_reminders r WHERE r.azubi_id=send_report_reminder.azubi_id AND r.sender_id IS NOT NULL AND r.created_at>now()-interval '12 hours') THEN RAISE EXCEPTION 'Heute wurde schon eine Erinnerung gesendet.'; END IF;
INSERT INTO public.report_reminders(azubi_id,sender_id,period_label,message) VALUES(azubi_id,auth.uid(),period_label,btrim(message)) RETURNING id INTO rid;
INSERT INTO public.notifications(user_id,type,title,body,link,entity_type,entity_id) VALUES(azubi_id,'report_reminder','Erinnerung: Bericht fehlt',btrim(message),'/reports/new','reminder',rid);
SELECT p.ausbilder_id,p.full_name INTO principal,person FROM public.profiles p WHERE p.id=azubi_id;
IF principal IS NOT NULL AND principal<>auth.uid() THEN INSERT INTO public.notifications(user_id,type,title,body,link,entity_type,entity_id) VALUES(principal,'report_reminder','Erinnerung versendet · '||person,btrim(message),'/erinnerungen','reminder',rid); END IF;
PERFORM public.write_audit('reminder',rid,'reminder_sent',azubi_id,jsonb_build_object('weeks',period_label));
RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.send_report_reminder(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.send_report_reminder(uuid,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.list_possible_deputies() RETURNS TABLE(id uuid, full_name text, role public.app_role) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT p.id,p.full_name,r.role FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id WHERE public.is_reviewer_role(auth.uid()) AND p.id<>auth.uid() AND r.role IN ('ausbilder','betriebsleiter','ausbildungsleitung') ORDER BY p.full_name $$;
REVOKE ALL ON FUNCTION public.list_possible_deputies() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_possible_deputies() TO authenticated;
CREATE POLICY deputy_setting_read ON public.app_settings FOR SELECT TO authenticated USING(key='deputy_self_service' AND public.is_reviewer_role(auth.uid()));
CREATE OR REPLACE FUNCTION public.team_week_overview(week_start date) RETURNS TABLE(azubi_id uuid,week_status text,to_review int,approved_total int,can_review boolean) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE m date := date_trunc('week',week_start)::date; p record; s text; allowed boolean;
BEGIN
IF m IS NULL THEN RETURN; END IF;
FOR p IN SELECT pr.id FROM public.profiles pr JOIN public.user_roles ur ON ur.user_id=pr.id WHERE ur.role='azubi' AND public.can_view_azubi(auth.uid(),pr.id) LOOP
allowed := public.can_review_for(auth.uid(),p.id);
s := NULL;
SELECT r.status::text INTO s FROM public.reports r WHERE r.azubi_id=p.id AND r.report_type='weekly' AND r.report_date=m AND (allowed OR r.status<>'draft') ORDER BY CASE r.status WHEN 'approved' THEN 0 WHEN 'submitted' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END LIMIT 1;
IF s IS NULL THEN SELECT r.status::text INTO s FROM public.reports r WHERE r.azubi_id=p.id AND r.report_type='daily' AND r.report_date BETWEEN m AND m+6 AND (allowed OR r.status<>'draft') ORDER BY CASE r.status WHEN 'approved' THEN 0 WHEN 'submitted' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END LIMIT 1; END IF;
IF s IS NULL THEN IF NOT allowed THEN s:='unknown'; ELSIF (SELECT count(DISTINCT d) FROM public.absent_days(p.id,m,m+4) d)=5 THEN s:='absent'; ELSE s:='missing'; END IF; END IF;
azubi_id:=p.id; week_status:=s; can_review:=allowed;
SELECT count(*) FILTER(WHERE r.status='submitted')::int,count(*) FILTER(WHERE r.status='approved')::int INTO to_review,approved_total FROM public.reports r WHERE r.azubi_id=p.id;
RETURN NEXT;
END LOOP; END $$;
REVOKE ALL ON FUNCTION public.team_week_overview(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.team_week_overview(date) TO authenticated;
DROP FUNCTION public.team_week_status(date);
CREATE TABLE public.report_reminders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),azubi_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,period_label text NOT NULL CHECK(char_length(period_label)<=200),message text NOT NULL CHECK(char_length(message) BETWEEN 1 AND 500),channel text NOT NULL DEFAULT 'app' CHECK(channel IN ('app','email','push')),created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.report_reminders TO authenticated;
GRANT ALL ON public.report_reminders TO service_role;
ALTER TABLE public.report_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY reminders_read ON public.report_reminders FOR SELECT TO authenticated USING(azubi_id=auth.uid() OR public.can_review_for(auth.uid(),azubi_id));
CREATE INDEX reminders_azubi_time ON public.report_reminders(azubi_id,created_at DESC);
CREATE OR REPLACE FUNCTION public.compute_missing_weeks(p_azubi uuid,p_as_of date) RETURNS TABLE(azubi_id uuid,week_start date,week_end date,days_overdue int,days_missing int) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH weeks AS (
SELECT p.id,p.ausbildungsbeginn,p.ausbildungsende,g::date AS monday FROM public.profiles p JOIN public.user_roles ur ON ur.user_id=p.id AND ur.role='azubi' CROSS JOIN LATERAL generate_series(greatest(date_trunc('week',p.ausbildungsbeginn)::date,date_trunc('week',p_as_of)::date-182),date_trunc('week',least(coalesce(p.ausbildungsende,p_as_of),p_as_of))::date,interval '7 days') g WHERE p.ausbildungsbeginn IS NOT NULL AND (p_azubi IS NULL OR p.id=p_azubi) AND g::date+6<p_as_of
), gaps AS (
SELECT w.id,w.monday,count(*)::int AS missing FROM weeks w CROSS JOIN LATERAL generate_series(w.monday,w.monday+4,interval '1 day') d WHERE d::date>=w.ausbildungsbeginn AND (w.ausbildungsende IS NULL OR d::date<=w.ausbildungsende) AND NOT EXISTS(SELECT 1 FROM public.reports r WHERE r.azubi_id=w.id AND r.status IN ('submitted','approved') AND ((r.report_type='weekly' AND r.report_date=w.monday) OR (r.report_type='daily' AND r.report_date=d::date))) AND NOT EXISTS(SELECT 1 FROM public.absences a WHERE a.azubi_id=w.id AND a.status<>'rejected' AND d::date BETWEEN a.date_from AND a.date_to) GROUP BY w.id,w.monday
) SELECT id,monday,monday+6,p_as_of-(monday+6),missing FROM gaps ORDER BY monday
$$;
REVOKE ALL ON FUNCTION public.compute_missing_weeks(uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.compute_missing_weeks(uuid,date) TO service_role;
CREATE OR REPLACE FUNCTION public.missing_weeks(p_azubi uuid DEFAULT NULL) RETURNS TABLE(azubi_id uuid,week_start date,week_end date,days_overdue int,days_missing int) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT m.* FROM public.compute_missing_weeks(p_azubi,(now() AT TIME ZONE 'Europe/Berlin')::date) m WHERE public.can_review_for(auth.uid(),m.azubi_id) $$;
REVOKE ALL ON FUNCTION public.missing_weeks(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.missing_weeks(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.send_report_reminder(azubi_id uuid,period_label text,message text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid; principal uuid; person text;
BEGIN
IF auth.uid() IS NULL OR NOT public.can_review_for(auth.uid(),azubi_id) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
IF message IS NULL OR char_length(btrim(message)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Die Nachricht muss 1 bis 500 Zeichen enthalten.'; END IF;
IF period_label IS NULL OR char_length(period_label)>200 THEN RAISE EXCEPTION 'Der Zeitraum ist ungültig.'; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended(azubi_id::text,0));
IF EXISTS(SELECT 1 FROM public.report_reminders r WHERE r.azubi_id=send_report_reminder.azubi_id AND r.created_at>now()-interval '12 hours') THEN RAISE EXCEPTION 'Heute wurde schon eine Erinnerung gesendet.'; END IF;
INSERT INTO public.report_reminders(azubi_id,sender_id,period_label,message) VALUES(azubi_id,auth.uid(),period_label,btrim(message)) RETURNING id INTO rid;
INSERT INTO public.notifications(user_id,type,title,body,link,entity_type,entity_id) VALUES(azubi_id,'report_reminder','Erinnerung: Bericht fehlt',btrim(message),'/reports/new','reminder',rid);
SELECT p.ausbilder_id,p.full_name INTO principal,person FROM public.profiles p WHERE p.id=azubi_id;
IF principal IS NOT NULL AND principal<>auth.uid() THEN INSERT INTO public.notifications(user_id,type,title,body,link,entity_type,entity_id) VALUES(principal,'report_reminder','Erinnerung versendet · '||person,btrim(message),'/erinnerungen','reminder',rid); END IF;
PERFORM public.write_audit('reminder',rid,'reminder_sent',azubi_id,jsonb_build_object('weeks',period_label));
RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.send_report_reminder(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.send_report_reminder(uuid,text,text) TO authenticated;
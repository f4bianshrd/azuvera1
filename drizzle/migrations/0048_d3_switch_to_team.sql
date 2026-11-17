-- D3: Umstellung früherer Bausteine (Verwaltung -> is_team, Rechte der Leitung entfallen)
CREATE OR REPLACE FUNCTION pg_temp.rewrite(p_name text, p_pairs text[]) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE s text; i int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO s FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = p_name;
  IF s IS NULL THEN RAISE EXCEPTION 'Funktion % fehlt', p_name; END IF;
  FOR i IN 1..array_length(p_pairs, 1) BY 2 LOOP
    IF position(p_pairs[i] IN s) = 0 THEN RAISE EXCEPTION 'Stelle in % nicht gefunden: %', p_name, left(p_pairs[i], 60); END IF;
    s := replace(s, p_pairs[i], p_pairs[i + 1]);
  END LOOP;
  EXECUTE s;
END $f$;

DO $d$
DECLARE n text; org constant text := $o$public.role_label(v_role) || coalesce(' (' || nullif(btrim((SELECT pp.organization FROM public.profiles pp WHERE pp.id = auth.uid())), '') || ')', '');$o$;
  s text;
BEGIN
  FOREACH n IN ARRAY ARRAY['admin_save_plan','admin_set_plan_status','log_export','delivery_health','save_reminder_rules','get_reminder_rules',
    'admin_save_instruction_catalog','admin_set_catalog_status','admin_duplicate_catalog','export_catalog_json','reject_account_deletion',
    'plan_visible','admin_plan_item_usage','admin_duplicate_plan','export_plan_json'] LOOP
    PERFORM pg_temp.rewrite(n, ARRAY['is_leitung(', 'is_team(']);
  END LOOP;
  PERFORM pg_temp.rewrite('audit_azubi_options', ARRAY['public.is_leitung(auth.uid()) or ', '']);
  PERFORM pg_temp.rewrite('resolve_plan', ARRAY[' OR public.is_leitung(auth.uid())', '']);
  PERFORM pg_temp.rewrite('list_selectable_plans', ARRAY[' OR public.is_leitung(auth.uid())', '']);
  PERFORM pg_temp.rewrite('set_azubi_plan', ARRAY[
    'IF NOT public.is_leitung(v_uid) THEN', 'IF NOT (v_uid <> p_azubi AND public.can_review_for(v_uid, p_azubi)) THEN',
    'Den Plan kann jetzt nur die Ausbildungsleitung ändern.', 'Den Plan kann jetzt nur eine Person mit Prüfrecht ändern.']);
  PERFORM pg_temp.rewrite('reopen_report', ARRAY[
    $x$IF NOT public.is_leitung(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;$x$,
    $x$IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;$x$,
    $x$IF NOT FOUND THEN RAISE EXCEPTION 'Bericht nicht gefunden.'; END IF;$x$,
    $x$IF NOT FOUND THEN RAISE EXCEPTION 'Bericht nicht gefunden.'; END IF;
  IF auth.uid() = r.azubi_id OR NOT public.can_review_for(auth.uid(), r.azubi_id) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;$x$]);
  PERFORM pg_temp.rewrite('reopen_experience', ARRAY[
    'IF auth.uid() IS NULL OR NOT public.is_leitung(auth.uid()) THEN', 'IF auth.uid() IS NULL THEN',
    $x$IF NOT FOUND THEN RAISE EXCEPTION 'Erfahrungsbericht nicht gefunden.'; END IF;$x$,
    $x$IF NOT FOUND THEN RAISE EXCEPTION 'Erfahrungsbericht nicht gefunden.'; END IF;
  IF auth.uid() = e.azubi_id OR NOT public.can_review_for(auth.uid(), e.azubi_id) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;$x$]);
  PERFORM pg_temp.rewrite('instruction_role_label', ARRAY[
    $x$WHEN 'ausbildungsleitung' THEN 'Ausbildungsleitung' WHEN 'ausbildungsberater' THEN 'Ausbildungsberater:in'$x$,
    $x$WHEN 'ausbildungsberater' THEN 'Ausbildungsberater:in' WHEN 'pruefer' THEN 'Prüfer:in'$x$]);
  -- Unterschrift: Rolle und Organisation
  SELECT pg_get_functiondef('public.approve_report'::regproc) INTO s;
  IF s !~ 'v_role_label := CASE v_role .*?END;' THEN RAISE EXCEPTION 'approve_report: Stelle fehlt'; END IF;
  EXECUTE regexp_replace(s, 'v_role_label := CASE v_role .*?END;', 'v_role_label := ' || replace(org, '\', '\\'));
  SELECT pg_get_functiondef('public.approve_experience'::regproc) INTO s;
  IF s !~ 'v_label := CASE v_role .*?END;' THEN RAISE EXCEPTION 'approve_experience: Stelle fehlt'; END IF;
  EXECUTE regexp_replace(s, 'v_label := CASE v_role .*?END;', 'v_label := ' || replace(org, '\', '\\'));
  PERFORM pg_temp.rewrite('request_account_deletion', ARRAY[
    $x$FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'ausbildungsleitung' AND p.email$x$,
    $x$FROM public.team_members ur JOIN public.profiles p ON p.id = ur.user_id
  WHERE p.email$x$]);
  PERFORM pg_temp.rewrite('export_header', ARRAY[
    E'c.address,p.ausbildungsbeginn,p.ausbildungsende,a.full_name\n',
    E'c.address,p.ausbildungsbeginn,p.ausbildungsende,(SELECT string_agg(gp.full_name, \', \' ORDER BY g.created_at) FROM public.access_grants g JOIN public.profiles gp ON gp.id=g.grantee_id WHERE g.azubi_id=p.id AND g.can_review AND g.revoked_at IS NULL AND (g.valid_until IS NULL OR g.valid_until>now()))\n',
    ' LEFT JOIN public.profiles a ON a.id=p.ausbilder_id', '']);
  PERFORM pg_temp.rewrite('send_report_reminder', ARRAY[
    'DECLARE rid uuid; principal uuid; person text;', 'DECLARE rid uuid; rec record; person text;',
    $x$SELECT p.ausbilder_id,p.full_name INTO principal,person FROM public.profiles p WHERE p.id=azubi_id;
IF principal IS NOT NULL AND principal<>auth.uid() THEN INSERT INTO public.notifications(user_id,type,title,body,link,entity_type,entity_id) VALUES(principal,'report_reminder','Erinnerung versendet · '||person,btrim(message),'/erinnerungen','reminder',rid); END IF;$x$,
    $x$SELECT p.full_name INTO person FROM public.profiles p WHERE p.id=send_report_reminder.azubi_id;
FOR rec IN SELECT DISTINCT nr.user_id FROM public.notification_recipients(send_report_reminder.azubi_id) nr WHERE nr.user_id<>auth.uid() LOOP
  INSERT INTO public.notifications(user_id,type,title,body,link,entity_type,entity_id) VALUES(rec.user_id,'report_reminder','Erinnerung versendet · '||person,btrim(message),'/erinnerungen','reminder',rid);
END LOOP;$x$]);
  PERFORM pg_temp.rewrite('admin_anonymize_user', ARRAY[
    'UPDATE public.profiles SET ausbilder_id = NULL WHERE ausbilder_id = p_user;',
    'UPDATE public.access_grants SET revoked_at = now() WHERE grantee_id = p_user AND revoked_at IS NULL;']);
  PERFORM pg_temp.rewrite('account_removal_paths', ARRAY[
    $x$('report-files', 'signatures', 'experience-files')$x$, $x$('report-files', 'signatures', 'experience-files', 'company-logos')$x$]);
END $d$;

-- Richtlinien
DROP POLICY IF EXISTS azubi_plans_select ON public.azubi_plans;
CREATE POLICY azubi_plans_select ON public.azubi_plans FOR SELECT TO authenticated USING (((azubi_id = auth.uid()) OR can_view_azubi(auth.uid(), azubi_id)));
DROP POLICY IF EXISTS company_professions_delete ON public.company_professions;
CREATE POLICY company_professions_delete ON public.company_professions FOR DELETE TO authenticated USING (is_team(auth.uid()));
DROP POLICY IF EXISTS company_professions_insert ON public.company_professions;
CREATE POLICY company_professions_insert ON public.company_professions FOR INSERT TO authenticated WITH CHECK (is_team(auth.uid()));
DROP POLICY IF EXISTS company_professions_select ON public.company_professions;
CREATE POLICY company_professions_select ON public.company_professions FOR SELECT TO authenticated USING ((is_team(auth.uid()) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.company_id = company_professions.company_id) AND ((p.id = auth.uid()) OR can_view_azubi(auth.uid(), p.id)))))));
DROP POLICY IF EXISTS deletion_requests_select ON public.deletion_requests;
CREATE POLICY deletion_requests_select ON public.deletion_requests FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR is_team(auth.uid())));
DROP POLICY IF EXISTS experience_requirements_delete ON public.experience_requirements;
CREATE POLICY experience_requirements_delete ON public.experience_requirements FOR DELETE TO authenticated USING (is_team(auth.uid()));
DROP POLICY IF EXISTS experience_requirements_insert ON public.experience_requirements;
CREATE POLICY experience_requirements_insert ON public.experience_requirements FOR INSERT TO authenticated WITH CHECK (is_team(auth.uid()));
DROP POLICY IF EXISTS experience_requirements_select ON public.experience_requirements;
CREATE POLICY experience_requirements_select ON public.experience_requirements FOR SELECT TO authenticated USING ((is_active OR is_team(auth.uid())));
DROP POLICY IF EXISTS experience_requirements_update ON public.experience_requirements;
CREATE POLICY experience_requirements_update ON public.experience_requirements FOR UPDATE TO authenticated USING (is_team(auth.uid())) WITH CHECK (is_team(auth.uid()));
DROP POLICY IF EXISTS instruction_catalogs_select ON public.instruction_catalogs;
CREATE POLICY instruction_catalogs_select ON public.instruction_catalogs FOR SELECT TO authenticated USING (((status = 'published'::text) OR is_team(auth.uid())));
DROP POLICY IF EXISTS report_files_select ON storage.objects;
CREATE POLICY report_files_select ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'report-files'::text) AND ((split_part(name, '/'::text, 1) = (auth.uid())::text) OR (EXISTS ( SELECT 1 FROM reports r WHERE ((r.id = (split_part(objects.name, '/'::text, 2))::uuid) AND (r.status <> 'draft'::report_status) AND (can_view_azubi(auth.uid(), r.azubi_id))))))));
DROP POLICY IF EXISTS signatures_select ON storage.objects;
CREATE POLICY signatures_select ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'signatures'::text) AND ((split_part(name, '/'::text, 1) = (auth.uid())::text) OR (EXISTS ( SELECT 1 FROM (report_signatures s JOIN reports r ON ((r.id = s.report_id))) WHERE ((s.image_path = objects.name) AND ((r.azubi_id = auth.uid()) OR ((r.status <> 'draft'::report_status) AND (can_view_azubi(auth.uid(), r.azubi_id))))))) OR (EXISTS ( SELECT 1 FROM (experience_signatures s JOIN experience_reports e ON ((e.id = s.experience_id))) WHERE ((s.image_path = objects.name) AND ((e.azubi_id = auth.uid()) OR ((e.status <> 'draft'::report_status) AND can_view_azubi(auth.uid(), e.azubi_id)))))))));
DROP POLICY IF EXISTS plan_progress_select ON public.plan_progress;
CREATE POLICY plan_progress_select ON public.plan_progress FOR SELECT TO authenticated USING (((azubi_id = auth.uid()) OR can_view_azubi(auth.uid(), azubi_id)));
DROP POLICY IF EXISTS report_attachments_select ON public.report_attachments;
CREATE POLICY report_attachments_select ON public.report_attachments FOR SELECT TO authenticated USING (((azubi_id = auth.uid()) OR ((can_view_azubi(auth.uid(), azubi_id)) AND (EXISTS ( SELECT 1 FROM reports r WHERE ((r.id = report_attachments.report_id) AND (r.status <> 'draft'::report_status)))))));
DROP POLICY IF EXISTS report_signatures_select ON public.report_signatures;
CREATE POLICY report_signatures_select ON public.report_signatures FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM reports r WHERE ((r.id = report_signatures.report_id) AND ((r.azubi_id = auth.uid()) OR ((r.status <> 'draft'::report_status) AND (can_view_azubi(auth.uid(), r.azubi_id))))))));
DROP POLICY IF EXISTS report_versions_select ON public.report_versions;
CREATE POLICY report_versions_select ON public.report_versions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM reports r WHERE ((r.id = report_versions.report_id) AND ((r.azubi_id = auth.uid()) OR ((r.status <> 'draft'::report_status) AND (can_view_azubi(auth.uid(), r.azubi_id))))))));
DROP POLICY IF EXISTS reports_select ON public.reports;
CREATE POLICY reports_select ON public.reports FOR SELECT TO authenticated USING (((azubi_id = auth.uid()) OR ((status <> 'draft'::report_status) AND (can_view_azubi(auth.uid(), azubi_id)))));
DROP POLICY IF EXISTS training_plans_select ON public.training_plans;
CREATE POLICY training_plans_select ON public.training_plans FOR SELECT TO authenticated USING ((is_team(auth.uid()) OR ((status = 'published'::text) AND (NOT is_template))));
DROP POLICY IF EXISTS training_topics_delete ON public.training_topics;
CREATE POLICY training_topics_delete ON public.training_topics FOR DELETE TO authenticated USING (is_team(auth.uid()));
DROP POLICY IF EXISTS training_topics_insert ON public.training_topics;
CREATE POLICY training_topics_insert ON public.training_topics FOR INSERT TO authenticated WITH CHECK (is_team(auth.uid()));
DROP POLICY IF EXISTS training_topics_select ON public.training_topics;
CREATE POLICY training_topics_select ON public.training_topics FOR SELECT TO authenticated USING ((is_team(auth.uid()) OR (profession_id = ( SELECT p.profession_id FROM profiles p WHERE (p.id = auth.uid()))) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.profession_id = training_topics.profession_id) AND (p.id <> auth.uid()) AND can_view_azubi(auth.uid(), p.id))))));
DROP POLICY IF EXISTS training_topics_update ON public.training_topics;
CREATE POLICY training_topics_update ON public.training_topics FOR UPDATE TO authenticated USING (is_team(auth.uid())) WITH CHECK (is_team(auth.uid()));

DROP FUNCTION IF EXISTS public.is_leitung(uuid);
COMMENT ON COLUMN public.profiles.ausbilder_id IS 'DEPRECATED: replaced by access_grants';
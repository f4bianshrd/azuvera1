-- Ausbildungsleitung wiederherstellen
CREATE OR REPLACE FUNCTION public.is_leitung(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'ausbildungsleitung')
$$;
CREATE OR REPLACE FUNCTION public.is_team(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_leitung(_uid) OR EXISTS (SELECT 1 FROM public.team_members WHERE user_id = _uid)
$$;
REVOKE EXECUTE ON FUNCTION public.is_leitung(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_leitung(uuid) TO authenticated, service_role;

-- frühere Ausbildungsleitung (jetzt Team) bekommt ihre Rolle zurück
UPDATE public.user_roles ur SET role = 'ausbildungsleitung'
  FROM public.team_members t WHERE t.user_id = ur.user_id AND ur.role = 'ausbilder';

CREATE OR REPLACE FUNCTION public.role_label(_role public.app_role) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _role
    WHEN 'azubi' THEN 'Auszubildende:r' WHEN 'ausbilder' THEN 'Ausbilder:in'
    WHEN 'betriebsleiter' THEN 'Betriebsleiter:in' WHEN 'ausbildungsberater' THEN 'Ausbildungsberater:in'
    WHEN 'pruefer' THEN 'Prüfer:in' WHEN 'lehrer' THEN 'Lehrer:in' WHEN 'ausbildungsleitung' THEN 'Ausbildungsleitung' ELSE 'Person' END
$$;

-- Prüfende Rollen: Ausbilder:in, Betriebsleiter:in, Ausbildungsberater:in, Ausbildungsleitung
CREATE OR REPLACE FUNCTION public.is_reviewer_role(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('ausbilder','betriebsleiter','ausbildungsberater','ausbildungsleitung'))
$$;

CREATE OR REPLACE FUNCTION public.access_grants_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.can_review := NEW.role IN ('ausbilder','betriebsleiter','ausbildungsberater');
  IF TG_OP = 'INSERT' OR NEW.azubi_id IS DISTINCT FROM OLD.azubi_id OR NEW.grantee_id IS DISTINCT FROM OLD.grantee_id OR NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.has_role(NEW.azubi_id, 'azubi') THEN RAISE EXCEPTION 'Zugriff ist nur auf Berichtshefte von Auszubildenden möglich.'; END IF;
    IF NOT public.has_role(NEW.grantee_id, NEW.role) THEN RAISE EXCEPTION 'Die Rolle der eingeladenen Person passt nicht.'; END IF;
  END IF;
  RETURN NEW;
END $$;
UPDATE public.access_grants SET can_review = true WHERE role = 'ausbildungsberater' AND NOT can_review;

CREATE OR REPLACE FUNCTION public.can_review_for(_reviewer uuid, _azubi uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _reviewer IS NOT NULL AND _reviewer <> _azubi AND (
    public.is_leitung(_reviewer)
    OR public.has_active_grant(_azubi, _reviewer, true)
    OR EXISTS (SELECT 1 FROM public.access_grants g
      WHERE g.azubi_id = _azubi AND g.revoked_at IS NULL AND (g.valid_until IS NULL OR g.valid_until > now())
        AND g.can_review AND g.deputy_allowed AND g.grantee_id <> _reviewer
        AND public.is_active_deputy(_reviewer, g.grantee_id)))
$$;

-- Vertretungen: vertretene Person selbst oder die Ausbildungsleitung
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
DO $d$ BEGIN
  PERFORM pg_temp.rewrite('set_deputy', ARRAY[
    $x$IF auth.uid() <> _principal THEN RAISE EXCEPTION$x$, $x$IF auth.uid() <> _principal AND NOT public.is_leitung(auth.uid()) THEN RAISE EXCEPTION$x$]);
  PERFORM pg_temp.rewrite('revoke_deputy', ARRAY[
    $x$IF auth.uid() IS DISTINCT FROM v_deputy.principal_id THEN$x$, $x$IF auth.uid() IS DISTINCT FROM v_deputy.principal_id AND NOT public.is_leitung(auth.uid()) THEN$x$]);
  PERFORM pg_temp.rewrite('find_possible_deputy', ARRAY[
    $x$AND ur.role IN ('ausbilder','betriebsleiter') AND u.id <> me$x$, $x$AND public.is_reviewer_role(u.id) AND u.id <> me$x$]);
  PERFORM pg_temp.rewrite('request_account_deletion', ARRAY[
    $x$FROM public.team_members ur JOIN$x$,
    $x$FROM (SELECT t.user_id FROM public.team_members t UNION SELECT r.user_id FROM public.user_roles r WHERE r.role = 'ausbildungsleitung') ur JOIN$x$]);
  PERFORM pg_temp.rewrite('redeem_invitation', ARRAY[
    $x$IF v_role IS NULL OR v_role IN ('azubi','ausbildungsleitung') THEN$x$,
    $x$IF v_role = 'ausbildungsleitung' THEN
    ok := false; error := 'Die Ausbildungsleitung sieht alle Berichtshefte bereits.'; RETURN NEXT; RETURN;
  END IF;
  IF v_role IS NULL OR v_role = 'azubi' THEN$x$]);
END $d$;

DROP POLICY IF EXISTS deputies_select ON public.deputies;
CREATE POLICY deputies_select ON public.deputies FOR SELECT TO authenticated
  USING (principal_id = auth.uid() OR deputy_id = auth.uid() OR public.is_leitung(auth.uid()));
DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
CREATE POLICY user_roles_select ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_leitung(auth.uid()));

-- Rollen vergeben: Ausbildungsleitung (auch Ausbildungsleitung selbst), nie Azubi
CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user uuid, p_role public.app_role) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.app_role;
BEGIN
  IF NOT public.is_team(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF p_role = 'azubi' THEN RAISE EXCEPTION 'Diese Rolle lässt sich nicht vergeben.'; END IF;
  IF p_role = 'ausbildungsleitung' AND NOT public.is_leitung(auth.uid()) THEN RAISE EXCEPTION 'Diese Rolle lässt sich nicht vergeben.'; END IF;
  IF p_user = auth.uid() THEN RAISE EXCEPTION 'Die eigene Rolle lässt sich hier nicht ändern.'; END IF;
  SELECT role INTO v_old FROM public.user_roles WHERE user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Konto nicht gefunden.'; END IF;
  IF v_old = 'azubi' THEN RAISE EXCEPTION 'Die Rolle einer Auszubildenden Person lässt sich nicht ändern.'; END IF;
  IF v_old = p_role THEN RETURN; END IF;
  UPDATE public.access_grants SET revoked_at = now(), revoked_by = auth.uid() WHERE grantee_id = p_user AND revoked_at IS NULL;
  UPDATE public.deputies SET revoked_at = now() WHERE (principal_id = p_user OR deputy_id = p_user) AND revoked_at IS NULL AND date_to >= (now() AT TIME ZONE 'Europe/Berlin')::date;
  UPDATE public.user_roles SET role = p_role WHERE user_id = p_user;
  PERFORM public.write_audit('role', p_user, 'role_change', NULL, jsonb_build_object('user_id', p_user, 'from', v_old, 'to', p_role));
END $$;

CREATE OR REPLACE FUNCTION public.admin_stats() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_team(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  RETURN jsonb_build_object(
    'users_total', (SELECT count(*) FROM public.profiles),
    'users_by_role', (SELECT jsonb_object_agg(r, (SELECT count(*) FROM public.user_roles ur WHERE ur.role::text = r))
       FROM unnest(ARRAY['azubi','ausbilder','betriebsleiter','ausbildungsberater','pruefer','lehrer','ausbildungsleitung']) r),
    'new_7d', (SELECT count(*) FROM public.profiles WHERE created_at > now() - interval '7 days'),
    'new_30d', (SELECT count(*) FROM public.profiles WHERE created_at > now() - interval '30 days'),
    'active_grants', (SELECT count(*) FROM public.access_grants WHERE revoked_at IS NULL AND (valid_until IS NULL OR valid_until > now())),
    'open_invitations', (SELECT count(*) FROM public.invitations WHERE used_by IS NULL AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()),
    'open_deletion_requests', (SELECT count(*) FROM public.deletion_requests WHERE status = 'open'));
END $$;

-- Betriebe bleiben Stammdaten der Ausbildungsleitung; Azubis wählen oder legen ihren Betrieb an
GRANT INSERT, UPDATE, DELETE ON public.companies TO authenticated;
DROP POLICY IF EXISTS companies_select ON public.companies;
CREATE POLICY companies_select ON public.companies FOR SELECT TO authenticated
  USING (public.is_leitung(auth.uid()) OR owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.company_id = companies.id AND (p.id = auth.uid() OR public.can_view_azubi(auth.uid(), p.id))));
CREATE POLICY companies_insert ON public.companies FOR INSERT TO authenticated WITH CHECK (public.is_leitung(auth.uid()));
CREATE POLICY companies_update ON public.companies FOR UPDATE TO authenticated USING (public.is_leitung(auth.uid())) WITH CHECK (public.is_leitung(auth.uid()));
CREATE POLICY companies_delete ON public.companies FOR DELETE TO authenticated USING (public.is_leitung(auth.uid()));

DROP POLICY IF EXISTS company_logos_read ON storage.objects;
DROP POLICY IF EXISTS company_logos_insert ON storage.objects;
DROP POLICY IF EXISTS company_logos_update ON storage.objects;
DROP POLICY IF EXISTS company_logos_delete ON storage.objects;
CREATE POLICY company_logos_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'company-logos' AND (public.is_leitung(auth.uid())
    OR EXISTS (SELECT 1 FROM public.companies c JOIN public.profiles p ON p.company_id = c.id
               WHERE c.logo_url = objects.name AND (p.id = auth.uid() OR public.can_view_azubi(auth.uid(), p.id)))));
CREATE POLICY company_logos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-logos' AND public.is_leitung(auth.uid()));
CREATE POLICY company_logos_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'company-logos' AND public.is_leitung(auth.uid()))
  WITH CHECK (bucket_id = 'company-logos' AND public.is_leitung(auth.uid()));
CREATE POLICY company_logos_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'company-logos' AND public.is_leitung(auth.uid()));

DROP FUNCTION IF EXISTS public.save_my_company(jsonb);

CREATE OR REPLACE FUNCTION public.set_my_training(p_profession uuid, p_company uuid DEFAULT NULL, p_new_company_name text DEFAULT NULL, p_new_company_address text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_company uuid := p_company; v_old record; v_name text := btrim(coalesce(p_new_company_name, ''));
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'azubi') THEN
    RAISE EXCEPTION 'Nur Auszubildende können Beruf und Betrieb selbst festlegen.';
  END IF;
  IF p_profession IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.professions WHERE id = p_profession) THEN
    RAISE EXCEPTION 'Diesen Ausbildungsberuf gibt es nicht.';
  END IF;
  IF v_name <> '' THEN
    IF length(v_name) < 2 OR length(v_name) > 200 THEN RAISE EXCEPTION 'Der Name des Betriebs muss 2 bis 200 Zeichen lang sein.'; END IF;
    IF length(coalesce(p_new_company_address, '')) > 500 THEN RAISE EXCEPTION 'Die Anschrift ist zu lang.'; END IF;
    SELECT id INTO v_company FROM public.companies WHERE lower(name) = lower(v_name) LIMIT 1;
    IF v_company IS NULL THEN
      INSERT INTO public.companies (id, name, address, owner_id) VALUES (gen_random_uuid(), v_name, nullif(btrim(coalesce(p_new_company_address, '')), ''), v_uid) RETURNING id INTO v_company;
    END IF;
  ELSIF p_company IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company) THEN
    RAISE EXCEPTION 'Diesen Betrieb gibt es nicht.';
  END IF;
  SELECT profession_id, company_id INTO v_old FROM public.profiles WHERE id = v_uid;
  PERFORM set_config('app.allow_protected_profile_write', 'on', true);
  UPDATE public.profiles SET profession_id = p_profession, company_id = v_company WHERE id = v_uid;
  IF v_old.profession_id IS DISTINCT FROM p_profession THEN
    DELETE FROM public.azubi_plans WHERE azubi_id = v_uid;
  END IF;
  IF v_old.profession_id IS DISTINCT FROM p_profession OR v_old.company_id IS DISTINCT FROM v_company THEN
    PERFORM public.write_audit('profile', v_uid, 'azubi_assignment_changed', v_uid,
      jsonb_build_object('fields', to_jsonb(array_remove(ARRAY[
        CASE WHEN v_old.profession_id IS DISTINCT FROM p_profession THEN 'profession_id' END,
        CASE WHEN v_old.company_id IS DISTINCT FROM v_company THEN 'company_id' END], NULL)), 'self', true));
  END IF;
END $$;
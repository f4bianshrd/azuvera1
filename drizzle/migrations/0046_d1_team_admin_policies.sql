-- D1 Teil 3: Verwaltung durch das Team
DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE FUNCTION public.admin_list_users()
RETURNS TABLE(id uuid, full_name text, email text, role public.app_role, organization text, is_team boolean, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_team(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  RETURN QUERY SELECT p.id, p.full_name, p.email, ur.role, p.organization,
    EXISTS (SELECT 1 FROM public.team_members t WHERE t.user_id = p.id), p.created_at
  FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id ORDER BY p.created_at;
END $$;

DROP FUNCTION IF EXISTS public.admin_set_user_role(uuid, public.app_role);
CREATE FUNCTION public.admin_set_user_role(p_user uuid, p_role public.app_role) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.app_role;
BEGIN
  IF NOT public.is_team(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF p_role IN ('azubi','ausbildungsleitung') THEN RAISE EXCEPTION 'Diese Rolle lässt sich nicht vergeben.'; END IF;
  IF p_user = auth.uid() THEN RAISE EXCEPTION 'Die eigene Rolle lässt sich hier nicht ändern.'; END IF;
  SELECT role INTO v_old FROM public.user_roles WHERE user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Konto nicht gefunden.'; END IF;
  IF v_old = 'azubi' THEN RAISE EXCEPTION 'Die Rolle einer Auszubildenden Person lässt sich nicht ändern.'; END IF;
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
       FROM unnest(ARRAY['azubi','ausbilder','betriebsleiter','ausbildungsberater','pruefer','lehrer']) r),
    'new_7d', (SELECT count(*) FROM public.profiles WHERE created_at > now() - interval '7 days'),
    'new_30d', (SELECT count(*) FROM public.profiles WHERE created_at > now() - interval '30 days'),
    'active_grants', (SELECT count(*) FROM public.access_grants WHERE revoked_at IS NULL AND (valid_until IS NULL OR valid_until > now())),
    'open_invitations', (SELECT count(*) FROM public.invitations WHERE used_by IS NULL AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()),
    'open_deletion_requests', (SELECT count(*) FROM public.deletion_requests WHERE status = 'open'));
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_team() RETURNS TABLE(user_id uuid, full_name text, email text, is_owner boolean, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_team(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  RETURN QUERY SELECT t.user_id, p.full_name, p.email, t.is_owner, t.created_at
    FROM public.team_members t LEFT JOIN public.profiles p ON p.id = t.user_id ORDER BY t.is_owner DESC, t.created_at;
END $$;

CREATE OR REPLACE FUNCTION public.admin_add_team_member(p_email text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
  IF NOT public.is_team_owner(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  SELECT u.id INTO v_user FROM auth.users u
   WHERE lower(u.email) = lower(btrim(coalesce(p_email, ''))) AND (u.email_confirmed_at IS NOT NULL OR u.confirmed_at IS NOT NULL)
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id) LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Zu dieser E-Mail-Adresse gibt es kein bestätigtes Konto.'; END IF;
  IF EXISTS (SELECT 1 FROM public.team_members WHERE user_id = v_user) THEN RAISE EXCEPTION 'Diese Person gehört schon zum Team.'; END IF;
  INSERT INTO public.team_members (user_id, is_owner, added_by) VALUES (v_user, false, auth.uid());
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_user, 'team_added', 'Du gehörst jetzt zum Azuvera-Team',
    'Du kannst Konten, Berufe, Pläne und Einstellungen verwalten. Berichte von Auszubildenden siehst du nicht.', '/admin');
  PERFORM public.write_audit('team', v_user, 'team_add', NULL, jsonb_build_object('user_id', v_user));
END $$;

CREATE OR REPLACE FUNCTION public.admin_remove_team_member(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_team_owner(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF public.is_team_owner(p_user) THEN RAISE EXCEPTION 'Der Inhaber lässt sich nicht entfernen.'; END IF;
  DELETE FROM public.team_members WHERE user_id = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Diese Person gehört nicht zum Team.'; END IF;
  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (p_user, 'team_removed', 'Team-Zugehörigkeit beendet', 'Du hast keine Verwaltungsrechte mehr.');
  PERFORM public.write_audit('team', p_user, 'team_remove', NULL, jsonb_build_object('user_id', p_user));
END $$;

-- Vertretungen
CREATE OR REPLACE FUNCTION public.set_deputy(_principal uuid, _deputy uuid, _date_from date, _date_to date, _reason text, _note text DEFAULT NULL::text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_principal_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
  IF auth.uid() <> _principal THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF _reason NOT IN ('urlaub', 'krank', 'sonstiges') THEN RAISE EXCEPTION 'Ungültiger Vertretungsgrund.'; END IF;
  INSERT INTO public.deputies (principal_id, deputy_id, date_from, date_to, reason, note, created_by)
  VALUES (_principal, _deputy, _date_from, _date_to, _reason, NULLIF(btrim(coalesce(_note, '')), ''), auth.uid())
  RETURNING id INTO v_id;
  SELECT full_name INTO v_principal_name FROM public.profiles WHERE id = _principal;
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (_deputy, 'deputy_assigned', 'Vertretung eingetragen',
    'Du vertrittst ' || v_principal_name || ' vom ' || to_char(_date_from, 'DD.MM.YYYY') || ' bis ' || to_char(_date_to, 'DD.MM.YYYY') || '.',
    '/ausbilder?tab=vertretung', 'deputy', v_id);
  PERFORM public.write_audit('deputy', v_id, 'deputy_set', NULL,
    jsonb_build_object('principal_id', _principal, 'deputy_id', _deputy, 'date_from', _date_from, 'date_to', _date_to));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_deputy(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deputy public.deputies%ROWTYPE;
BEGIN
  SELECT * INTO v_deputy FROM public.deputies WHERE id = _id AND revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vertretung nicht gefunden.'; END IF;
  IF auth.uid() IS DISTINCT FROM v_deputy.principal_id THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  UPDATE public.deputies SET revoked_at = now() WHERE id = _id;
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (v_deputy.deputy_id, 'deputy_ended', 'Vertretung beendet', NULL, '/ausbilder?tab=vertretung', 'deputy', _id);
  PERFORM public.write_audit('deputy', _id, 'deputy_revoke', NULL,
    jsonb_build_object('principal_id', v_deputy.principal_id, 'deputy_id', v_deputy.deputy_id));
END $$;

CREATE OR REPLACE FUNCTION public.find_possible_deputy(p_email text) RETURNS TABLE(id uuid, full_name text, role public.app_role)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); v_n int := 0;
BEGIN
  IF me IS NULL OR NOT public.is_reviewer_role(me) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF (SELECT count(*) FROM public.audit_log a WHERE a.actor_id = me AND a.entity_type = 'deputy' AND a.action = 'lookup'
      AND a.created_at > now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'Zu viele Versuche. Bitte versuche es später erneut.';
  END IF;
  RETURN QUERY SELECT p.id, p.full_name, ur.role FROM auth.users u
    JOIN public.profiles p ON p.id = u.id JOIN public.user_roles ur ON ur.user_id = u.id
    WHERE lower(u.email) = lower(btrim(coalesce(p_email, ''))) AND (u.email_confirmed_at IS NOT NULL OR u.confirmed_at IS NOT NULL)
      AND ur.role IN ('ausbilder','betriebsleiter') AND u.id <> me LIMIT 1;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM public.write_audit('deputy', NULL, 'lookup', NULL, jsonb_build_object('found', v_n > 0));
END $$;
-- D1 Teil 4: Profil, Betriebe, Richtlinien, Export
CREATE OR REPLACE FUNCTION public.try_uuid(_t text) RETURNS uuid
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN RETURN _t::uuid; EXCEPTION WHEN others THEN RETURN NULL; END $$;
CREATE OR REPLACE FUNCTION public.profiles_guard_protected() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('app.allow_protected_profile_write', true), '') <> 'on' THEN
    IF new.profession_id IS DISTINCT FROM old.profession_id
       OR new.company_id IS DISTINCT FROM old.company_id
       OR new.email IS DISTINCT FROM old.email THEN
      RAISE EXCEPTION 'Diese Felder lassen sich hier nicht ändern.';
    END IF;
  END IF;
  RETURN new;
END $$;

CREATE OR REPLACE FUNCTION public.set_my_profession(_profession_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'azubi') THEN RAISE EXCEPTION 'Nur Auszubildende können ihren Beruf festlegen.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.professions WHERE id = _profession_id) THEN RAISE EXCEPTION 'Beruf nicht gefunden.'; END IF;
  SELECT profession_id INTO v_old FROM public.profiles WHERE id = auth.uid();
  IF v_old IS NOT DISTINCT FROM _profession_id THEN RETURN; END IF;
  PERFORM set_config('app.allow_protected_profile_write', 'on', true);
  UPDATE public.profiles SET profession_id = _profession_id WHERE id = auth.uid();
  DELETE FROM public.azubi_plans WHERE azubi_id = auth.uid();
  PERFORM public.write_audit('profile', auth.uid(), 'profession_set', auth.uid(), jsonb_build_object('profession_id', _profession_id));
END $$;

-- set_my_training: Betrieb wird nur noch über save_my_company gesetzt
CREATE OR REPLACE FUNCTION public.set_my_training(p_profession uuid, p_company uuid DEFAULT NULL, p_new_company_name text DEFAULT NULL, p_new_company_address text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_profession IS NULL THEN RAISE EXCEPTION 'Bitte wähle einen Beruf.'; END IF;
  PERFORM public.set_my_profession(p_profession);
END $$;

-- Betriebe gehören der Azubi-Person
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS companies_owner_idx ON public.companies (owner_id);

CREATE OR REPLACE FUNCTION public.save_my_company(p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); v_id uuid; v_name text := btrim(coalesce(p_data->>'name', ''));
  f text; v text;
BEGIN
  IF me IS NULL OR NOT public.has_role(me, 'azubi') THEN RAISE EXCEPTION 'Nur Auszubildende können einen Betrieb eintragen.'; END IF;
  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN RAISE EXCEPTION 'Der Name des Betriebs muss 2 bis 120 Zeichen lang sein.'; END IF;
  FOREACH f IN ARRAY ARRAY['legal_form','address','contact_person','training_number','chamber','contact_email','contact_phone','logo_url'] LOOP
    v := p_data->>f;
    IF v IS NOT NULL AND char_length(v) > 500 THEN RAISE EXCEPTION 'Eine Angabe ist zu lang.'; END IF;
  END LOOP;
  IF nullif(btrim(coalesce(p_data->>'logo_url', '')), '') IS NOT NULL AND split_part(p_data->>'logo_url', '/', 1) <> me::text THEN
    RAISE EXCEPTION 'Ungültiges Logo.';
  END IF;
  SELECT c.id INTO v_id FROM public.companies c JOIN public.profiles p ON p.company_id = c.id WHERE p.id = me AND c.owner_id = me;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM public.companies WHERE owner_id = me ORDER BY created_at LIMIT 1; END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.companies (id, name, owner_id) VALUES (gen_random_uuid(), v_name, me) RETURNING id INTO v_id;
  END IF;
  UPDATE public.companies SET
    name = v_name,
    legal_form = nullif(btrim(coalesce(p_data->>'legal_form', '')), ''),
    address = nullif(btrim(coalesce(p_data->>'address', '')), ''),
    contact_person = nullif(btrim(coalesce(p_data->>'contact_person', '')), ''),
    training_number = nullif(btrim(coalesce(p_data->>'training_number', '')), ''),
    chamber = nullif(btrim(coalesce(p_data->>'chamber', '')), ''),
    contact_email = nullif(btrim(coalesce(p_data->>'contact_email', '')), ''),
    contact_phone = nullif(btrim(coalesce(p_data->>'contact_phone', '')), ''),
    logo_url = nullif(btrim(coalesce(p_data->>'logo_url', '')), ''),
    updated_at = now()
  WHERE id = v_id;
  PERFORM set_config('app.allow_protected_profile_write', 'on', true);
  UPDATE public.profiles SET company_id = v_id WHERE id = me AND company_id IS DISTINCT FROM v_id;
  PERFORM public.write_audit('company', v_id, 'company_save', me, '{}'::jsonb);
  RETURN v_id;
END $$;

DROP POLICY IF EXISTS companies_select ON public.companies;
DROP POLICY IF EXISTS companies_insert ON public.companies;
DROP POLICY IF EXISTS companies_update ON public.companies;
DROP POLICY IF EXISTS companies_delete ON public.companies;
CREATE POLICY companies_select ON public.companies FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.company_id = companies.id AND public.can_view_azubi(auth.uid(), p.id)));
REVOKE INSERT, UPDATE, DELETE ON public.companies FROM authenticated, anon;

DROP POLICY IF EXISTS company_logos_read ON storage.objects;
DROP POLICY IF EXISTS company_logos_insert ON storage.objects;
DROP POLICY IF EXISTS company_logos_update ON storage.objects;
DROP POLICY IF EXISTS company_logos_delete ON storage.objects;
CREATE POLICY company_logos_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'company-logos' AND ((storage.foldername(name))[1] = auth.uid()::text
    OR public.can_view_azubi(auth.uid(), public.try_uuid((storage.foldername(name))[1]))));
CREATE POLICY company_logos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-logos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY company_logos_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'company-logos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'company-logos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY company_logos_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'company-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Profile, Rollen, Vertretungen
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.can_view_azubi(auth.uid(), id));
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
CREATE POLICY user_roles_select ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS deputies_select ON public.deputies;
CREATE POLICY deputies_select ON public.deputies FOR SELECT TO authenticated
  USING (principal_id = auth.uid() OR deputy_id = auth.uid());
DROP POLICY IF EXISTS deputy_setting_read ON public.app_settings;
DELETE FROM public.app_settings WHERE key = 'deputy_self_service';
DROP FUNCTION IF EXISTS public.set_deputy_self_service(boolean);

-- Einstellungen und Berufe: Team
DROP POLICY IF EXISTS app_settings_select ON public.app_settings;
DROP POLICY IF EXISTS app_settings_insert ON public.app_settings;
DROP POLICY IF EXISTS app_settings_update ON public.app_settings;
DROP POLICY IF EXISTS app_settings_delete ON public.app_settings;
CREATE POLICY app_settings_select ON public.app_settings FOR SELECT TO authenticated USING (is_public OR public.is_team(auth.uid()));
CREATE POLICY app_settings_insert ON public.app_settings FOR INSERT TO authenticated WITH CHECK (public.is_team(auth.uid()));
CREATE POLICY app_settings_update ON public.app_settings FOR UPDATE TO authenticated USING (public.is_team(auth.uid())) WITH CHECK (public.is_team(auth.uid()));
CREATE POLICY app_settings_delete ON public.app_settings FOR DELETE TO authenticated USING (public.is_team(auth.uid()));
DROP POLICY IF EXISTS professions_insert ON public.professions;
DROP POLICY IF EXISTS professions_update ON public.professions;
DROP POLICY IF EXISTS professions_delete ON public.professions;
CREATE POLICY professions_insert ON public.professions FOR INSERT TO authenticated WITH CHECK (public.is_team(auth.uid()));
CREATE POLICY professions_update ON public.professions FOR UPDATE TO authenticated USING (public.is_team(auth.uid())) WITH CHECK (public.is_team(auth.uid()));
CREATE POLICY professions_delete ON public.professions FOR DELETE TO authenticated USING (public.is_team(auth.uid()));

-- Protokoll
DROP POLICY IF EXISTS audit_log_select ON public.audit_log;
CREATE POLICY audit_log_select ON public.audit_log FOR SELECT TO authenticated USING (
  actor_id = auth.uid() OR azubi_id = auth.uid()
  OR (azubi_id IS NULL AND public.is_team(auth.uid()))
  OR (azubi_id IS NOT NULL AND public.can_view_azubi(auth.uid(), azubi_id)
      AND entity_type NOT IN ('consent','access','invitation')
      AND ((action <> ALL (ARRAY['create','edit','delete','attachment_add','attachment_delete','ai_assist']))
           OR (entity_type = 'experience' AND public.audit_experience_visible(entity_id))
           OR (entity_type <> 'experience' AND public.audit_report_visible(entity_id)))));

CREATE OR REPLACE FUNCTION public.verify_audit_chain(p_chain uuid DEFAULT NULL::uuid)
 RETURNS TABLE(chain_key uuid, entries integer, ok boolean, first_bad_id bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_zero constant uuid := '00000000-0000-0000-0000-000000000000';
  rec record; v_cur uuid := null; v_prev text; v_n int := 0; v_bad bigint := null; v_any boolean := false;
begin
  if v_uid is null then raise exception 'Dazu fehlt dir die Berechtigung.'; end if;
  if p_chain is null or p_chain = v_zero then
    if not public.is_team(v_uid) then raise exception 'Dazu fehlt dir die Berechtigung.'; end if;
  elsif not public.can_view_azubi(v_uid, p_chain) then
    raise exception 'Dazu fehlt dir die Berechtigung.';
  end if;
  for rec in
    select a.id, a.chain_key as ck, a.created_at, a.actor_id, a.entity_type, a.entity_id, a.action, a.details, a.prev_hash, a.row_hash
    from public.audit_log a where p_chain is null or a.chain_key = p_chain order by a.chain_key, a.id
  loop
    v_any := true;
    if v_cur is distinct from rec.ck then
      if v_cur is not null then
        chain_key := v_cur; entries := v_n; ok := v_bad is null; first_bad_id := v_bad; return next;
      end if;
      v_cur := rec.ck; v_prev := 'GENESIS'; v_n := 0; v_bad := null;
    end if;
    v_n := v_n + 1;
    if v_bad is null and (rec.prev_hash is distinct from v_prev
      or rec.row_hash is distinct from public.audit_hash(v_prev, rec.created_at, rec.actor_id, rec.entity_type, rec.entity_id, rec.action, rec.details)) then
      v_bad := rec.id;
    end if;
    v_prev := rec.row_hash;
  end loop;
  if v_cur is not null then
    chain_key := v_cur; entries := v_n; ok := v_bad is null; first_bad_id := v_bad; return next;
  elsif not v_any and p_chain is not null then
    chain_key := p_chain; entries := 0; ok := true; first_bad_id := null; return next;
  end if;
end;
$function$;

-- Export eigener Daten
CREATE OR REPLACE FUNCTION public.export_my_data() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
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
      FROM public.experience_comments c WHERE c.azubi_id = me OR c.author_id = me), '[]'::jsonb),
    'invitations', coalesce((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'role', i.role, 'code', i.code, 'note', i.note,
        'expires_at', i.expires_at, 'access_days', i.access_days, 'used_at', i.used_at, 'revoked_at', i.revoked_at, 'created_at', i.created_at)
      ORDER BY i.created_at) FROM public.invitations i WHERE i.azubi_id = me), '[]'::jsonb),
    'access_grants', coalesce((SELECT jsonb_agg(jsonb_build_object('id', g.id, 'role', g.role, 'can_review', g.can_review,
        'deputy_allowed', g.deputy_allowed, 'valid_until', g.valid_until, 'revoked_at', g.revoked_at, 'created_at', g.created_at,
        'as', CASE WHEN g.azubi_id = me THEN 'azubi' ELSE 'grantee' END,
        'other_name', coalesce((SELECT p.full_name FROM public.profiles p WHERE p.id = CASE WHEN g.azubi_id = me THEN g.grantee_id ELSE g.azubi_id END), 'Gelöschte Person'))
      ORDER BY g.created_at) FROM public.access_grants g WHERE g.azubi_id = me OR g.grantee_id = me), '[]'::jsonb),
    'team_member', (SELECT jsonb_build_object('member', true, 'since', t.created_at) FROM public.team_members t WHERE t.user_id = me));
END $function$;
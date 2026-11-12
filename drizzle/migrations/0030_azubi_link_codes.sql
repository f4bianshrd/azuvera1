CREATE TABLE public.link_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  azubi_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  access text NOT NULL CHECK (access IN ('read','feedback','review')),
  expires_at timestamptz NOT NULL,
  used_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX link_codes_azubi_idx ON public.link_codes (azubi_id, created_at DESC);
GRANT SELECT ON public.link_codes TO authenticated;
GRANT ALL ON public.link_codes TO service_role;
ALTER TABLE public.link_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY link_codes_select ON public.link_codes FOR SELECT TO authenticated USING (azubi_id = auth.uid());

CREATE TABLE public.azubi_links (
  azubi_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  access text NOT NULL CHECK (access IN ('read','feedback','review')),
  is_primary boolean NOT NULL DEFAULT false,
  code_id uuid REFERENCES public.link_codes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (azubi_id, member_id),
  CHECK (azubi_id <> member_id)
);
CREATE INDEX azubi_links_member_idx ON public.azubi_links (member_id);
GRANT SELECT ON public.azubi_links TO authenticated;
GRANT ALL ON public.azubi_links TO service_role;
ALTER TABLE public.azubi_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY azubi_links_select ON public.azubi_links FOR SELECT TO authenticated
  USING (azubi_id = auth.uid() OR member_id = auth.uid() OR public.is_leitung(auth.uid()));

-- Höchste Zugriffsstufe, die eine Rolle per Code erhalten kann.
CREATE OR REPLACE FUNCTION public.link_access_rank(_access text) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _access WHEN 'read' THEN 1 WHEN 'feedback' THEN 2 WHEN 'review' THEN 3 ELSE 0 END
$$;

CREATE OR REPLACE FUNCTION public.link_role_max(_user uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(max(CASE role
    WHEN 'lehrer' THEN 1
    WHEN 'ausbildungsberater' THEN 2
    WHEN 'ausbilder' THEN 3 WHEN 'betriebsleiter' THEN 3 WHEN 'ausbildungsleitung' THEN 3
    ELSE 0 END), 0) FROM public.user_roles WHERE user_id = _user
$$;

CREATE OR REPLACE FUNCTION public.has_link(_member uuid, _azubi uuid, _min text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.azubi_links l
    WHERE l.azubi_id = _azubi AND l.member_id = _member
      AND public.link_access_rank(l.access) >= public.link_access_rank(_min)
      AND public.link_role_max(_member) >= public.link_access_rank(l.access))
$$;

CREATE OR REPLACE FUNCTION public.can_review_for(_reviewer uuid, _azubi uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.is_leitung(_reviewer) OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _azubi AND p.ausbilder_id IS NOT NULL AND (
      (p.ausbilder_id = _reviewer AND public.is_reviewer_role(_reviewer))
      OR public.is_active_deputy(_reviewer, p.ausbilder_id)
    )
  ) OR (public.is_reviewer_role(_reviewer) AND public.has_link(_reviewer, _azubi, 'review'))
$function$;

CREATE OR REPLACE FUNCTION public.can_view_azubi(_viewer uuid, _azubi uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select _viewer = _azubi
    or public.can_review_for(_viewer, _azubi)
    or exists (select 1 from public.azubi_viewers where azubi_id = _azubi and viewer_id = _viewer)
    or public.has_link(_viewer, _azubi, 'read')
    or (
      public.has_role(_viewer, 'betriebsleiter')
      and exists (
        select 1 from public.profiles pa
        join public.profiles pv on pv.id = _viewer
        where pa.id = _azubi and pa.company_id is not null and pa.company_id = pv.company_id
      )
    )
$function$;

CREATE OR REPLACE FUNCTION public.can_comment_for(_user uuid, _azubi uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_review_for(_user, _azubi) OR public.has_link(_user, _azubi, 'feedback')
$$;
GRANT EXECUTE ON FUNCTION public.can_comment_for(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS report_comments_insert ON public.report_comments;
CREATE POLICY report_comments_insert ON public.report_comments FOR INSERT TO authenticated WITH CHECK (
  author_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.id = report_comments.report_id AND r.status <> 'draft'
      AND (r.azubi_id = auth.uid() OR public.can_comment_for(auth.uid(), r.azubi_id))
  )
);

CREATE OR REPLACE FUNCTION public.link_code_new() RETURNS text
LANGUAGE plpgsql VOLATILE SET search_path = public AS $$
DECLARE a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea; c text := ''; i int;
BEGIN
  b := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  FOREACH i IN ARRAY ARRAY[0,1,2,3,4,5,10,11] LOOP
    c := c || substr(a, (get_byte(b, i) % 32) + 1, 1);
  END LOOP;
  RETURN c;
END $$;

CREATE OR REPLACE FUNCTION public.create_link_code(p_access text, p_hours integer DEFAULT 168)
RETURNS TABLE(id uuid, code text, access text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_code text; v_id uuid; v_exp timestamptz;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'azubi') THEN
    RAISE EXCEPTION 'Nur Auszubildende können Verknüpfungscodes erstellen.';
  END IF;
  IF p_access NOT IN ('read','feedback','review') THEN RAISE EXCEPTION 'Diese Zugriffsart gibt es nicht.'; END IF;
  IF p_hours NOT IN (24, 168, 720) THEN RAISE EXCEPTION 'Diese Gültigkeit ist nicht vorgesehen.'; END IF;
  IF (SELECT count(*) FROM public.link_codes c WHERE c.azubi_id = v_uid AND c.used_at IS NULL AND c.revoked_at IS NULL AND c.expires_at > now()) >= 10 THEN
    RAISE EXCEPTION 'Du hast schon 10 offene Codes. Widerrufe zuerst einen alten Code.';
  END IF;
  LOOP
    v_code := public.link_code_new();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.link_codes c WHERE c.code = v_code);
  END LOOP;
  v_exp := now() + make_interval(hours => p_hours);
  INSERT INTO public.link_codes (azubi_id, code, access, expires_at) VALUES (v_uid, v_code, p_access, v_exp) RETURNING link_codes.id INTO v_id;
  PERFORM public.write_audit('link', v_id, 'link_code_created', v_uid, jsonb_build_object('access', p_access, 'hours', p_hours));
  RETURN QUERY SELECT v_id, v_code, p_access, v_exp;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_link_code(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.link_codes SET revoked_at = now()
   WHERE id = p_id AND azubi_id = auth.uid() AND used_at IS NULL AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dieser Code ist nicht mehr offen.'; END IF;
  PERFORM public.write_audit('link', p_id, 'link_code_revoked', auth.uid(), '{}'::jsonb);
END $$;

-- Vorschau vor dem Einlösen: nur Vorname + Zugriffsart, damit die Person weiß, womit sie sich verknüpft.
CREATE OR REPLACE FUNCTION public.preview_link_code(p_code text)
RETURNS TABLE(azubi_name text, access text, expires_at timestamptz, allowed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); c public.link_codes%ROWTYPE; v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Bitte melde dich an.'; END IF;
  IF NOT public.check_call_limit(v_uid, 'link_code', 30, interval '10 minutes') THEN
    RAISE EXCEPTION 'Zu viele Versuche. Bitte warte ein paar Minuten.';
  END IF;
  SELECT * INTO c FROM public.link_codes WHERE code = v_code;
  IF NOT FOUND OR c.revoked_at IS NOT NULL OR c.used_at IS NOT NULL OR c.expires_at <= now() THEN
    RAISE EXCEPTION 'Dieser Code ist ungültig, abgelaufen oder schon eingelöst.';
  END IF;
  RETURN QUERY SELECT p.full_name, c.access, c.expires_at, public.link_role_max(v_uid) >= public.link_access_rank(c.access)
    FROM public.profiles p WHERE p.id = c.azubi_id;
END $$;

CREATE OR REPLACE FUNCTION public.redeem_link_code(p_code text)
RETURNS TABLE(azubi_id uuid, azubi_name text, access text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); c public.link_codes%ROWTYPE; v_primary boolean := false;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')); v_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Bitte melde dich an.'; END IF;
  IF NOT public.check_call_limit(v_uid, 'link_code', 30, interval '10 minutes') THEN
    RAISE EXCEPTION 'Zu viele Versuche. Bitte warte ein paar Minuten.';
  END IF;
  IF public.has_role(v_uid, 'azubi') THEN
    RAISE EXCEPTION 'Verknüpfungscodes lösen Ausbilder:innen, Prüfer:innen, Lehrkräfte und die Ausbildungsberatung ein.';
  END IF;
  SELECT * INTO c FROM public.link_codes WHERE code = v_code FOR UPDATE;
  IF NOT FOUND OR c.revoked_at IS NOT NULL OR c.used_at IS NOT NULL OR c.expires_at <= now() THEN
    RAISE EXCEPTION 'Dieser Code ist ungültig, abgelaufen oder schon eingelöst.';
  END IF;
  IF public.link_role_max(v_uid) < public.link_access_rank(c.access) THEN
    RAISE EXCEPTION '%', CASE c.access
      WHEN 'review' THEN 'Dieser Code gibt Prüf- und Freigaberechte. Ihn können nur Ausbilder:innen und die Betriebsleitung einlösen.'
      ELSE 'Dieser Code gibt Rückmelderechte. Ihn können nur die Ausbildungsberatung und Ausbilder:innen einlösen.' END;
  END IF;
  UPDATE public.link_codes SET used_by = v_uid, used_at = now() WHERE id = c.id;
  IF c.access = 'review' AND (SELECT p.ausbilder_id FROM public.profiles p WHERE p.id = c.azubi_id) IS NULL THEN
    PERFORM set_config('app.allow_protected_profile_write', 'on', true);
    UPDATE public.profiles SET ausbilder_id = v_uid WHERE id = c.azubi_id;
    PERFORM set_config('app.allow_protected_profile_write', 'off', true);
    v_primary := true;
  END IF;
  INSERT INTO public.azubi_links (azubi_id, member_id, access, is_primary, code_id)
  VALUES (c.azubi_id, v_uid, c.access, v_primary, c.id)
  ON CONFLICT ON CONSTRAINT azubi_links_pkey DO UPDATE
    SET access = EXCLUDED.access, code_id = EXCLUDED.code_id,
        is_primary = azubi_links.is_primary OR EXCLUDED.is_primary;
  PERFORM public.write_audit('link', c.id, 'link_created', c.azubi_id, jsonb_build_object('access', c.access, 'member', v_uid, 'primary', v_primary));
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (c.azubi_id, 'link_redeemed', 'Neue Verknüpfung', 'Dein Verknüpfungscode wurde eingelöst. Unter „Verknüpfungen“ siehst du, wer jetzt Zugriff hat.', '/verknuepfungen', 'link', c.id);
  SELECT p.full_name INTO v_name FROM public.profiles p WHERE p.id = c.azubi_id;
  RETURN QUERY SELECT c.azubi_id, v_name, c.access;
END $$;

CREATE OR REPLACE FUNCTION public.remove_link(p_azubi uuid, p_member uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); l public.azubi_links%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT (v_uid = p_azubi OR v_uid = p_member OR public.is_leitung(v_uid)) THEN
    RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.';
  END IF;
  DELETE FROM public.azubi_links WHERE azubi_id = p_azubi AND member_id = p_member RETURNING * INTO l;
  IF NOT FOUND THEN RAISE EXCEPTION 'Diese Verknüpfung gibt es nicht mehr.'; END IF;
  IF l.is_primary THEN
    PERFORM set_config('app.allow_protected_profile_write', 'on', true);
    UPDATE public.profiles SET ausbilder_id = NULL WHERE id = p_azubi AND ausbilder_id = p_member;
    PERFORM set_config('app.allow_protected_profile_write', 'off', true);
  END IF;
  PERFORM public.write_audit('link', p_azubi, 'link_removed', p_azubi, jsonb_build_object('access', l.access, 'member', p_member, 'by_self', v_uid = p_member));
END $$;

CREATE OR REPLACE FUNCTION public.list_links()
RETURNS TABLE(azubi_id uuid, azubi_name text, member_id uuid, member_name text, member_role app_role, access text, is_primary boolean, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.azubi_id, pa.full_name, l.member_id, pm.full_name,
         (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = l.member_id LIMIT 1),
         l.access, l.is_primary, l.created_at
    FROM public.azubi_links l
    JOIN public.profiles pa ON pa.id = l.azubi_id
    JOIN public.profiles pm ON pm.id = l.member_id
   WHERE l.azubi_id = auth.uid() OR l.member_id = auth.uid()
   ORDER BY l.created_at DESC
$$;

REVOKE EXECUTE ON FUNCTION public.link_code_new() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_link_code(text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_link_code(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.preview_link_code(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.redeem_link_code(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_link(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_links() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_link_code(text, integer), public.revoke_link_code(uuid), public.preview_link_code(text),
  public.redeem_link_code(text), public.remove_link(uuid, uuid), public.list_links() TO authenticated;
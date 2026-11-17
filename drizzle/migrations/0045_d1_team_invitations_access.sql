-- D1 Teil 1: Team, Einladungen, Zugriffe, Rechte
CREATE TABLE IF NOT EXISTS public.team_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_owner boolean NOT NULL DEFAULT false,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS team_members_one_owner ON public.team_members (is_owner) WHERE is_owner;
GRANT SELECT ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_team(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.team_members WHERE user_id = _uid)
$$;
CREATE OR REPLACE FUNCTION public.is_team_owner(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.team_members WHERE user_id = _uid AND is_owner)
$$;
REVOKE EXECUTE ON FUNCTION public.is_team(uuid), public.is_team_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_team(uuid), public.is_team_owner(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS team_members_select ON public.team_members;
CREATE POLICY team_members_select ON public.team_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_team(auth.uid()));

-- veraltet: liefert immer false
CREATE OR REPLACE FUNCTION public.is_leitung(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.is_reviewer_role(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('ausbilder','betriebsleiter'))
$$;

CREATE OR REPLACE FUNCTION public.role_label(_role public.app_role) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _role
    WHEN 'azubi' THEN 'Auszubildende:r' WHEN 'ausbilder' THEN 'Ausbilder:in'
    WHEN 'betriebsleiter' THEN 'Betriebsleiter:in' WHEN 'ausbildungsberater' THEN 'Ausbildungsberater:in'
    WHEN 'pruefer' THEN 'Prüfer:in' WHEN 'lehrer' THEN 'Lehrer:in' ELSE 'Person' END
$$;

-- Profil: Organisation
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_organization_len') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_organization_len CHECK (organization IS NULL OR char_length(organization) <= 120);
  END IF;
END $$;

-- Einladungen
CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  azubi_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL CHECK (role IN ('ausbilder','betriebsleiter','ausbildungsberater','pruefer','lehrer')),
  code text NOT NULL UNIQUE CHECK (char_length(code) = 12 AND code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$'),
  note text CHECK (note IS NULL OR char_length(note) <= 80),
  expires_at timestamptz NOT NULL,
  access_days int CHECK (access_days IS NULL OR access_days BETWEEN 7 AND 365),
  used_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitations_pruefer_days CHECK (role <> 'pruefer' OR (access_days IS NOT NULL AND access_days <= 180))
);
CREATE INDEX IF NOT EXISTS invitations_azubi_idx ON public.invitations (azubi_id, created_at DESC);
GRANT SELECT ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invitations_select ON public.invitations;
CREATE POLICY invitations_select ON public.invitations FOR SELECT TO authenticated USING (azubi_id = auth.uid());

-- Zugriffe
CREATE TABLE IF NOT EXISTS public.access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  azubi_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  grantee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL CHECK (role IN ('ausbilder','betriebsleiter','ausbildungsberater','pruefer','lehrer')),
  can_review boolean NOT NULL DEFAULT false,
  deputy_allowed boolean NOT NULL DEFAULT true,
  invitation_id uuid REFERENCES public.invitations(id) ON DELETE SET NULL,
  valid_until timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_grants_not_self CHECK (azubi_id <> grantee_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS access_grants_active_pair ON public.access_grants (azubi_id, grantee_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS access_grants_grantee_idx ON public.access_grants (grantee_id) WHERE revoked_at IS NULL;
GRANT SELECT ON public.access_grants TO authenticated;
GRANT ALL ON public.access_grants TO service_role;
ALTER TABLE public.access_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS access_grants_select ON public.access_grants;
CREATE POLICY access_grants_select ON public.access_grants FOR SELECT TO authenticated
  USING (azubi_id = auth.uid() OR grantee_id = auth.uid());

CREATE OR REPLACE FUNCTION public.access_grants_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.can_review := NEW.role IN ('ausbilder','betriebsleiter');
  IF TG_OP = 'INSERT' OR NEW.azubi_id IS DISTINCT FROM OLD.azubi_id OR NEW.grantee_id IS DISTINCT FROM OLD.grantee_id OR NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.has_role(NEW.azubi_id, 'azubi') THEN RAISE EXCEPTION 'Zugriff ist nur auf Berichtshefte von Auszubildenden möglich.'; END IF;
    IF NOT public.has_role(NEW.grantee_id, NEW.role) THEN RAISE EXCEPTION 'Die Rolle der eingeladenen Person passt nicht.'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS access_grants_guard ON public.access_grants;
CREATE TRIGGER access_grants_guard BEFORE INSERT OR UPDATE ON public.access_grants
  FOR EACH ROW EXECUTE FUNCTION public.access_grants_guard();

CREATE OR REPLACE FUNCTION public.has_active_grant(p_azubi uuid, p_grantee uuid, p_review boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.access_grants g
    WHERE g.azubi_id = p_azubi AND g.grantee_id = p_grantee AND g.revoked_at IS NULL
      AND (g.valid_until IS NULL OR g.valid_until > now()) AND (NOT p_review OR g.can_review))
$$;

-- Rechtefunktionen
CREATE OR REPLACE FUNCTION public.can_review_for(_reviewer uuid, _azubi uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _reviewer IS NOT NULL AND _reviewer <> _azubi AND (
    public.has_active_grant(_azubi, _reviewer, true)
    OR EXISTS (SELECT 1 FROM public.access_grants g
      WHERE g.azubi_id = _azubi AND g.revoked_at IS NULL AND (g.valid_until IS NULL OR g.valid_until > now())
        AND g.can_review AND g.deputy_allowed AND g.grantee_id <> _reviewer
        AND public.is_active_deputy(_reviewer, g.grantee_id)))
$$;
CREATE OR REPLACE FUNCTION public.can_view_azubi(_viewer uuid, _azubi uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _viewer = _azubi OR public.can_review_for(_viewer, _azubi) OR public.has_active_grant(_azubi, _viewer)
$$;
CREATE OR REPLACE FUNCTION public.can_comment_for(_user uuid, _azubi uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_review_for(_user, _azubi)
$$;
CREATE OR REPLACE FUNCTION public.acting_principal(_reviewer uuid, _azubi uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.grantee_id FROM public.access_grants g
  WHERE g.azubi_id = _azubi AND g.revoked_at IS NULL AND (g.valid_until IS NULL OR g.valid_until > now())
    AND g.can_review AND g.deputy_allowed AND g.grantee_id <> _reviewer
    AND public.is_active_deputy(_reviewer, g.grantee_id)
  ORDER BY g.created_at LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.notification_recipients(_azubi uuid) RETURNS TABLE(user_id uuid, deputy_for uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.grantee_id, NULL::uuid FROM public.access_grants g
  WHERE g.azubi_id = _azubi AND g.revoked_at IS NULL AND (g.valid_until IS NULL OR g.valid_until > now()) AND g.can_review
  UNION
  SELECT d.deputy_id, g.grantee_id FROM public.access_grants g
  JOIN public.deputies d ON d.principal_id = g.grantee_id AND d.revoked_at IS NULL
    AND (now() AT TIME ZONE 'Europe/Berlin')::date BETWEEN d.date_from AND d.date_to
  WHERE g.azubi_id = _azubi AND g.revoked_at IS NULL AND (g.valid_until IS NULL OR g.valid_until > now())
    AND g.can_review AND g.deputy_allowed AND public.is_reviewer_role(d.deputy_id) AND d.deputy_id <> _azubi
$$;

CREATE OR REPLACE FUNCTION public.name_visible(_me uuid, _id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _me IS NOT NULL AND (
    _id = _me
    OR EXISTS (SELECT 1 FROM public.access_grants g WHERE (g.azubi_id = _me AND g.grantee_id = _id) OR (g.grantee_id = _me AND g.azubi_id = _id))
    OR EXISTS (SELECT 1 FROM public.deputies d WHERE (d.principal_id = _me AND d.deputy_id = _id) OR (d.deputy_id = _me AND d.principal_id = _id))
    OR EXISTS (SELECT 1 FROM public.reports r WHERE r.reviewer_id = _id AND public.can_view_azubi(_me, r.azubi_id) AND (r.azubi_id = _me OR r.status <> 'draft'))
    OR EXISTS (SELECT 1 FROM public.report_comments c WHERE c.author_id = _id AND public.can_view_azubi(_me, c.azubi_id))
    OR EXISTS (SELECT 1 FROM public.report_signatures s JOIN public.reports r ON r.id = s.report_id
               WHERE (s.signer_id = _id OR s.on_behalf_of = _id) AND public.can_view_azubi(_me, r.azubi_id))
    OR EXISTS (SELECT 1 FROM public.experience_reports e WHERE e.reviewer_id = _id AND public.can_view_azubi(_me, e.azubi_id) AND (e.azubi_id = _me OR e.status <> 'draft'))
    OR EXISTS (SELECT 1 FROM public.experience_comments c WHERE c.author_id = _id AND public.can_view_azubi(_me, c.azubi_id))
    OR EXISTS (SELECT 1 FROM public.experience_signatures s JOIN public.experience_reports e ON e.id = s.experience_id
               WHERE (s.signer_id = _id OR s.on_behalf_of = _id) AND public.can_view_azubi(_me, e.azubi_id))
    OR EXISTS (SELECT 1 FROM public.instruction_records ir WHERE (ir.reviewer_id = _id OR ir.on_behalf_of = _id) AND public.can_view_azubi(_me, ir.azubi_id))
    OR EXISTS (SELECT 1 FROM public.absences a WHERE a.reviewer_id = _id AND public.can_view_azubi(_me, a.azubi_id))
  )
$$;
REVOKE EXECUTE ON FUNCTION public.name_visible(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.display_names(_ids uuid[]) RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, CASE WHEN p.id IS NOT NULL AND public.name_visible(auth.uid(), i.id) THEN p.full_name ELSE 'Unbekannt' END
  FROM unnest(_ids) AS i(id) LEFT JOIN public.profiles p ON p.id = i.id
$$;
CREATE OR REPLACE FUNCTION public.display_people(_ids uuid[]) RETURNS TABLE(id uuid, full_name text, role public.app_role, organization text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id,
    CASE WHEN v.ok THEN p.full_name ELSE 'Unbekannt' END,
    CASE WHEN v.ok THEN ur.role END,
    CASE WHEN v.ok THEN p.organization END
  FROM unnest(_ids) AS i(id)
  LEFT JOIN public.profiles p ON p.id = i.id
  LEFT JOIN public.user_roles ur ON ur.user_id = i.id
  CROSS JOIN LATERAL (SELECT p.id IS NOT NULL AND public.name_visible(auth.uid(), i.id) AS ok) v
$$;
CREATE OR REPLACE FUNCTION public.display_roles(_ids uuid[]) RETURNS TABLE(user_id uuid, role public.app_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ur.user_id, ur.role FROM public.user_roles ur WHERE ur.user_id = ANY(_ids) AND public.name_visible(auth.uid(), ur.user_id)
$$;
-- D1 Teil 2: Einladen, Einlösen, Registrierung
CREATE OR REPLACE FUNCTION public.invitation_code_new() RETURNS text
LANGUAGE plpgsql VOLATILE SET search_path = public, extensions AS $$
DECLARE a constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea; c text; i int;
BEGIN
  LOOP
    b := extensions.gen_random_bytes(12); c := '';
    FOR i IN 0..11 LOOP c := c || substr(a, (get_byte(b, i) % 31) + 1, 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.invitations WHERE code = c);
  END LOOP;
  RETURN c;
END $$;
REVOKE EXECUTE ON FUNCTION public.invitation_code_new() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.redeem_invitation_core(p_user uuid, p_code text, p_role public.app_role)
RETURNS TABLE(grant_id uuid, azubi_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g')); v_inv public.invitations%ROWTYPE;
  v_grant uuid; v_name text; v_org text;
BEGIN
  SELECT * INTO v_inv FROM public.invitations i WHERE i.code = v_code FOR UPDATE;
  IF NOT FOUND OR v_inv.used_by IS NOT NULL OR v_inv.revoked_at IS NOT NULL OR v_inv.expires_at <= now() THEN
    RAISE EXCEPTION 'Der Einladungs-Code ist ungültig, abgelaufen oder bereits eingelöst.';
  END IF;
  IF p_role IS DISTINCT FROM v_inv.role THEN
    RAISE EXCEPTION 'Dieser Code ist für die Rolle % vorgesehen.', public.role_label(v_inv.role);
  END IF;
  IF p_user = v_inv.azubi_id THEN RAISE EXCEPTION 'Du kannst dich nicht selbst einladen.'; END IF;
  IF public.has_active_grant(v_inv.azubi_id, p_user) THEN RAISE EXCEPTION 'Du hast bereits Zugriff auf dieses Berichtsheft.'; END IF;
  -- beendete/abgelaufene, aber nicht widerrufene Zeile schließen, damit der Teil-Index frei ist
  UPDATE public.access_grants g SET revoked_at = now()
    WHERE g.azubi_id = v_inv.azubi_id AND g.grantee_id = p_user AND g.revoked_at IS NULL;
  UPDATE public.invitations SET used_by = p_user, used_at = now() WHERE id = v_inv.id;
  INSERT INTO public.access_grants (azubi_id, grantee_id, role, invitation_id, valid_until)
  VALUES (v_inv.azubi_id, p_user, v_inv.role, v_inv.id,
    CASE WHEN v_inv.access_days IS NOT NULL THEN now() + make_interval(days => v_inv.access_days) END)
  RETURNING id INTO v_grant;
  SELECT p.full_name, p.organization INTO v_name, v_org FROM public.profiles p WHERE p.id = p_user;
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (v_inv.azubi_id, 'access_granted', 'Neuer Zugriff',
    coalesce(nullif(v_name, ''), 'Eine Person') || CASE WHEN nullif(v_org, '') IS NOT NULL THEN ' (' || v_org || ')' ELSE '' END
      || ' hat deinen Einladungs-Code eingelöst und sieht jetzt deine Berichte.',
    '/zugriff', 'access', v_grant);
  INSERT INTO public.audit_log (chain_key, actor_id, actor_role, azubi_id, entity_type, entity_id, action, details)
  VALUES (v_inv.azubi_id, p_user, p_role, v_inv.azubi_id, 'access', v_grant, 'access_grant',
    jsonb_build_object('grant_id', v_grant, 'role', v_inv.role));
  grant_id := v_grant; azubi_id := v_inv.azubi_id; RETURN NEXT;
END $$;
REVOKE EXECUTE ON FUNCTION public.redeem_invitation_core(uuid, text, public.app_role) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.redeem_invitation(p_code text)
RETURNS TABLE(ok boolean, error text, grant_id uuid, azubi_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); v_role public.app_role; v_res record; v_fails int;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
  SELECT ur.role INTO v_role FROM public.user_roles ur WHERE ur.user_id = me;
  IF v_role IS NULL OR v_role IN ('azubi','ausbildungsleitung') THEN
    ok := false; error := 'Mit einem Azubi-Konto lässt sich kein Einladungs-Code einlösen.'; RETURN NEXT; RETURN;
  END IF;
  SELECT count(*) INTO v_fails FROM public.audit_log a
    WHERE a.actor_id = me AND a.entity_type = 'invitation' AND a.action = 'redeem_failed' AND a.created_at > now() - interval '1 hour';
  IF v_fails >= 10 THEN
    ok := false; error := 'Zu viele Versuche. Bitte versuche es später erneut.'; RETURN NEXT; RETURN;
  END IF;
  BEGIN
    SELECT * INTO v_res FROM public.redeem_invitation_core(me, p_code, v_role);
    ok := true; error := NULL; grant_id := v_res.grant_id; azubi_id := v_res.azubi_id; RETURN NEXT;
  EXCEPTION WHEN raise_exception THEN
    PERFORM public.write_audit('invitation', NULL, 'redeem_failed', NULL, '{}'::jsonb);
    ok := false; error := SQLERRM; grant_id := NULL; azubi_id := NULL; RETURN NEXT;
  END;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_full text := trim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  v_role_txt text := trim(coalesce(new.raw_user_meta_data ->> 'role', ''));
  v_org text := trim(coalesce(new.raw_user_meta_data ->> 'organization', ''));
  v_code text := nullif(upper(regexp_replace(coalesce(new.raw_user_meta_data ->> 'invitation_code', ''), '[\s-]', '', 'g')), '');
  v_role public.app_role;
BEGIN
  IF v_role_txt NOT IN ('azubi','ausbilder','betriebsleiter','ausbildungsberater','pruefer','lehrer') THEN
    RAISE EXCEPTION 'Bitte wähle deine Rolle.';
  END IF;
  v_role := v_role_txt::public.app_role;
  IF v_role = 'azubi' THEN
    v_org := NULL;
    IF v_code IS NOT NULL THEN RAISE EXCEPTION 'Mit einem Azubi-Konto lässt sich kein Einladungs-Code einlösen.'; END IF;
  ELSIF char_length(v_org) < 2 OR char_length(v_org) > 120 THEN
    RAISE EXCEPTION 'Bitte gib deine Organisation an.';
  END IF;

  INSERT INTO public.profiles (id, vorname, nachname, email, organization)
  VALUES (
    new.id,
    coalesce(nullif(split_part(v_full, ' ', 1), ''), ''),
    coalesce(nullif(trim(substring(v_full from '\s+\S.*$')), ''), ''),
    coalesce(new.email, ''),
    v_org
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, v_role);
  IF v_code IS NOT NULL THEN
    PERFORM public.redeem_invitation_core(new.id, v_code, v_role);
  END IF;
  RETURN new;
END $$;

CREATE OR REPLACE FUNCTION public.create_invitation(p_role public.app_role, p_note text, p_valid_days int DEFAULT 14, p_access_days int DEFAULT NULL)
RETURNS TABLE(id uuid, code text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); v_days int := coalesce(p_valid_days, 14); v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid; v_code text; v_exp timestamptz;
BEGIN
  IF me IS NULL OR NOT public.has_role(me, 'azubi') THEN RAISE EXCEPTION 'Nur Auszubildende können einladen.'; END IF;
  IF p_role IS NULL OR p_role NOT IN ('ausbilder','betriebsleiter','ausbildungsberater','pruefer','lehrer') THEN
    RAISE EXCEPTION 'Diese Rolle lässt sich nicht einladen.';
  END IF;
  IF v_days < 1 OR v_days > 60 THEN RAISE EXCEPTION 'Der Code kann 1 bis 60 Tage gültig sein.'; END IF;
  IF p_role = 'pruefer' AND (p_access_days IS NULL OR p_access_days < 7 OR p_access_days > 180) THEN
    RAISE EXCEPTION 'Für Prüfer:innen ist eine Dauer von 7 bis 180 Tagen nötig.';
  END IF;
  IF p_access_days IS NOT NULL AND (p_access_days < 7 OR p_access_days > 365) THEN
    RAISE EXCEPTION 'Der Zugriff kann 7 bis 365 Tage dauern.';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 80 THEN RAISE EXCEPTION 'Die Notiz darf höchstens 80 Zeichen lang sein.'; END IF;
  IF (SELECT count(*) FROM public.invitations i WHERE i.azubi_id = me AND i.used_by IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()) >= 10 THEN
    RAISE EXCEPTION 'Du hast schon 10 offene Einladungen. Widerrufe eine oder warte, bis sie ablaufen.';
  END IF;
  v_code := public.invitation_code_new();
  v_exp := now() + make_interval(days => v_days);
  INSERT INTO public.invitations (azubi_id, role, code, note, expires_at, access_days)
  VALUES (me, p_role, v_code, v_note, v_exp, p_access_days) RETURNING invitations.id INTO v_id;
  PERFORM public.write_audit('invitation', v_id, 'invitation_create', me,
    jsonb_build_object('role', p_role, 'valid_days', v_days, 'access_days', p_access_days));
  id := v_id; code := v_code; expires_at := v_exp; RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_invitation(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid();
BEGIN
  UPDATE public.invitations SET revoked_at = now()
   WHERE id = p_id AND azubi_id = me AND used_by IS NULL AND revoked_at IS NULL AND expires_at > now();
  IF NOT FOUND THEN RAISE EXCEPTION 'Diese Einladung ist nicht mehr offen.'; END IF;
  PERFORM public.write_audit('invitation', p_id, 'invitation_revoke', me, '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.end_access(p_grant uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); g public.access_grants%ROWTYPE; v_name text;
BEGIN
  SELECT * INTO g FROM public.access_grants WHERE id = p_grant AND revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND OR me IS NULL OR me NOT IN (g.azubi_id, g.grantee_id) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  UPDATE public.access_grants SET revoked_at = now(), revoked_by = me WHERE id = p_grant;
  IF me = g.azubi_id THEN
    SELECT full_name INTO v_name FROM public.profiles WHERE id = g.azubi_id;
    INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
    VALUES (g.grantee_id, 'access_ended', 'Zugriff beendet', 'Dein Zugriff auf die Berichte von ' || coalesce(nullif(v_name, ''), 'einer Person') || ' wurde beendet.', '/zugriff', 'access', p_grant);
  ELSE
    SELECT full_name INTO v_name FROM public.profiles WHERE id = g.grantee_id;
    INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
    VALUES (g.azubi_id, 'access_ended', 'Zugriff beendet', coalesce(nullif(v_name, ''), 'Eine Person') || ' hat den Zugriff aufgegeben.', '/zugriff', 'access', p_grant);
  END IF;
  PERFORM public.write_audit('access', p_grant, 'access_end', g.azubi_id, jsonb_build_object('grant_id', p_grant));
END $$;

CREATE OR REPLACE FUNCTION public.set_deputy_allowed(p_grant uuid, p_allowed boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid();
BEGIN
  UPDATE public.access_grants SET deputy_allowed = coalesce(p_allowed, true)
   WHERE id = p_grant AND azubi_id = me AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  PERFORM public.write_audit('access', p_grant, 'access_deputy_setting', me, jsonb_build_object('grant_id', p_grant, 'allowed', p_allowed));
END $$;

CREATE OR REPLACE FUNCTION public.grant_status(g public.access_grants) RETURNS text
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE WHEN g.revoked_at IS NOT NULL THEN 'ended' WHEN g.valid_until IS NOT NULL AND g.valid_until <= now() THEN 'expired' ELSE 'active' END
$$;

CREATE OR REPLACE FUNCTION public.my_access_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); v_azubi boolean;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
  v_azubi := public.has_role(me, 'azubi');
  IF v_azubi THEN
    RETURN jsonb_build_object('as_azubi', jsonb_build_object(
      'grants', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'id', g.id, 'grantee_name', p.full_name, 'organization', p.organization, 'role', g.role,
          'can_review', g.can_review, 'deputy_allowed', g.deputy_allowed, 'created_at', g.created_at,
          'valid_until', g.valid_until, 'revoked_at', g.revoked_at, 'status', public.grant_status(g),
          'deputies', CASE WHEN g.deputy_allowed AND g.can_review AND public.grant_status(g) = 'active' THEN coalesce((
              SELECT jsonb_agg(jsonb_build_object('name', dp.full_name, 'date_from', d.date_from, 'date_to', d.date_to) ORDER BY d.date_to)
              FROM public.deputies d JOIN public.profiles dp ON dp.id = d.deputy_id
              WHERE d.principal_id = g.grantee_id AND d.revoked_at IS NULL
                AND (now() AT TIME ZONE 'Europe/Berlin')::date BETWEEN d.date_from AND d.date_to), '[]'::jsonb) ELSE '[]'::jsonb END)
        ORDER BY g.created_at DESC)
        FROM public.access_grants g LEFT JOIN public.profiles p ON p.id = g.grantee_id WHERE g.azubi_id = me), '[]'::jsonb),
      'invitations', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'id', i.id, 'role', i.role, 'note', i.note, 'code', i.code, 'expires_at', i.expires_at, 'access_days', i.access_days,
          'used_by_name', u.full_name, 'used_at', i.used_at, 'revoked_at', i.revoked_at,
          'status', CASE WHEN i.used_by IS NOT NULL OR i.used_at IS NOT NULL THEN 'redeemed' WHEN i.revoked_at IS NOT NULL THEN 'revoked'
                         WHEN i.expires_at <= now() THEN 'expired' ELSE 'open' END)
        ORDER BY i.created_at DESC)
        FROM public.invitations i LEFT JOIN public.profiles u ON u.id = i.used_by WHERE i.azubi_id = me), '[]'::jsonb)));
  END IF;
  RETURN jsonb_build_object('as_grantee', jsonb_build_object(
    'grants', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'azubi_id', g.azubi_id, 'azubi_name', p.full_name, 'profession_name', pr.name, 'role', g.role,
        'can_review', g.can_review, 'created_at', g.created_at, 'valid_until', g.valid_until, 'revoked_at', g.revoked_at,
        'status', public.grant_status(g)) ORDER BY g.created_at DESC)
      FROM public.access_grants g LEFT JOIN public.profiles p ON p.id = g.azubi_id
      LEFT JOIN public.professions pr ON pr.id = p.profession_id WHERE g.grantee_id = me), '[]'::jsonb)));
END $$;
-- D1 Teil 5: Übernahme vorhandener Daten
DO $$
DECLARE v_grants int := 0; v_n int; v_companies int := 0; v_team int := 0; c record; a record; v_new uuid; v_first boolean;
BEGIN
  INSERT INTO public.access_grants (azubi_id, grantee_id, role)
  SELECT p.id, p.ausbilder_id, ur.role FROM public.profiles p
  JOIN public.user_roles ua ON ua.user_id = p.id AND ua.role = 'azubi'
  JOIN public.user_roles ur ON ur.user_id = p.ausbilder_id AND ur.role IN ('ausbilder','betriebsleiter')
  WHERE p.ausbilder_id IS NOT NULL AND p.ausbilder_id <> p.id
    AND NOT EXISTS (SELECT 1 FROM public.access_grants g WHERE g.azubi_id = p.id AND g.grantee_id = p.ausbilder_id AND g.revoked_at IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_grants := v_grants + v_n;

  IF to_regclass('public.azubi_viewers') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO public.access_grants (azubi_id, grantee_id, role)
      SELECT v.azubi_id, v.viewer_id, ur.role FROM public.azubi_viewers v
      JOIN public.user_roles ua ON ua.user_id = v.azubi_id AND ua.role = 'azubi'
      JOIN public.user_roles ur ON ur.user_id = v.viewer_id AND ur.role IN ('ausbildungsberater','lehrer')
      WHERE NOT EXISTS (SELECT 1 FROM public.access_grants g WHERE g.azubi_id = v.azubi_id AND g.grantee_id = v.viewer_id AND g.revoked_at IS NULL)$q$;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_grants := v_grants + v_n;
  END IF;

  IF to_regclass('public.azubi_links') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO public.access_grants (azubi_id, grantee_id, role)
      SELECT l.azubi_id, l.member_id, ur.role FROM public.azubi_links l
      JOIN public.user_roles ua ON ua.user_id = l.azubi_id AND ua.role = 'azubi'
      JOIN public.user_roles ur ON ur.user_id = l.member_id AND ur.role IN ('ausbilder','betriebsleiter','ausbildungsberater','lehrer')
      WHERE NOT EXISTS (SELECT 1 FROM public.access_grants g WHERE g.azubi_id = l.azubi_id AND g.grantee_id = l.member_id AND g.revoked_at IS NULL)$q$;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_grants := v_grants + v_n;
  END IF;

  -- Betriebe
  FOR c IN SELECT * FROM public.companies WHERE owner_id IS NULL LOOP
    v_first := true;
    FOR a IN SELECT p.id FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'azubi'
             WHERE p.company_id = c.id ORDER BY p.created_at LOOP
      IF v_first THEN
        UPDATE public.companies SET owner_id = a.id WHERE id = c.id; v_first := false;
      ELSE
        INSERT INTO public.companies (id, name, legal_form, address, contact_person, training_number, chamber, logo_url, contact_email, contact_phone, bundesland, owner_id)
        VALUES (gen_random_uuid(), c.name, c.legal_form, c.address, c.contact_person, c.training_number, c.chamber, c.logo_url, c.contact_email, c.contact_phone, c.bundesland, a.id)
        RETURNING id INTO v_new;
        PERFORM set_config('app.allow_protected_profile_write', 'on', true);
        UPDATE public.profiles SET company_id = v_new WHERE id = a.id;
      END IF;
      v_companies := v_companies + 1;
    END LOOP;
    IF v_first THEN
      DELETE FROM public.company_professions WHERE company_id = c.id;
      PERFORM set_config('app.allow_protected_profile_write', 'on', true);
      UPDATE public.profiles SET company_id = NULL WHERE company_id = c.id;
      DELETE FROM public.companies WHERE id = c.id;
    END IF;
  END LOOP;

  -- Ausbildungsleitung wird Team
  INSERT INTO public.team_members (user_id, is_owner, added_by)
  SELECT ur.user_id, false, NULL FROM public.user_roles ur
  WHERE ur.role = 'ausbildungsleitung' AND NOT EXISTS (SELECT 1 FROM public.team_members t WHERE t.user_id = ur.user_id);
  GET DIAGNOSTICS v_team = ROW_COUNT;
  IF NOT EXISTS (SELECT 1 FROM public.team_members WHERE is_owner) THEN
    UPDATE public.team_members SET is_owner = true WHERE user_id = (
      SELECT t.user_id FROM public.team_members t JOIN public.profiles p ON p.id = t.user_id ORDER BY p.created_at LIMIT 1);
  END IF;
  UPDATE public.user_roles SET role = 'ausbilder' WHERE role = 'ausbildungsleitung';

  INSERT INTO public.audit_log (chain_key, actor_id, actor_role, azubi_id, entity_type, entity_id, action, details)
  VALUES ('00000000-0000-0000-0000-000000000000', NULL, NULL, NULL, 'team', NULL, 'migrated',
    jsonb_build_object('grants', v_grants, 'companies', v_companies, 'team', v_team));
END $$;

-- Entfallene Funktionen
DROP FUNCTION IF EXISTS public.admin_update_azubi(uuid, jsonb);
DROP FUNCTION IF EXISTS public.admin_set_viewers(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.create_invite_code(public.app_role, integer, text);
DROP FUNCTION IF EXISTS public.revoke_invite_code(text);
DROP FUNCTION IF EXISTS public.redeem_invite_code(text);
DROP FUNCTION IF EXISTS public.list_possible_deputies();
DROP FUNCTION IF EXISTS public.redeem_link_code(text);
DROP FUNCTION IF EXISTS public.preview_link_code(text);
DROP FUNCTION IF EXISTS public.create_link_code(text, integer);
DROP FUNCTION IF EXISTS public.list_links();
DROP FUNCTION IF EXISTS public.remove_link(uuid, uuid);
DROP FUNCTION IF EXISTS public.revoke_link_code(uuid);
DROP FUNCTION IF EXISTS public.has_link(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.link_role_max(uuid);
DROP FUNCTION IF EXISTS public.link_access_rank(text);
DROP FUNCTION IF EXISTS public.link_code_new();

-- Stillgelegte Tabellen: für niemanden mehr erreichbar
DROP POLICY IF EXISTS invite_codes_select ON public.invite_codes;
DROP POLICY IF EXISTS azubi_viewers_select ON public.azubi_viewers;
DROP POLICY IF EXISTS azubi_viewers_insert ON public.azubi_viewers;
DROP POLICY IF EXISTS azubi_viewers_delete ON public.azubi_viewers;
DROP POLICY IF EXISTS azubi_links_select ON public.azubi_links;
DROP POLICY IF EXISTS link_codes_select ON public.link_codes;
REVOKE ALL ON public.invite_codes, public.azubi_viewers, public.azubi_links, public.link_codes FROM authenticated, anon;
COMMENT ON TABLE public.invite_codes IS 'DEPRECATED: replaced by invitations';
COMMENT ON TABLE public.azubi_viewers IS 'DEPRECATED: replaced by access_grants';
COMMENT ON TABLE public.azubi_links IS 'DEPRECATED: replaced by access_grants';
COMMENT ON TABLE public.link_codes IS 'DEPRECATED: replaced by invitations';

-- Ausführungsrechte
REVOKE EXECUTE ON FUNCTION public.has_active_grant(uuid, uuid, boolean), public.display_people(uuid[]),
  public.redeem_invitation(text), public.create_invitation(public.app_role, text, int, int), public.revoke_invitation(uuid),
  public.end_access(uuid), public.set_deputy_allowed(uuid, boolean), public.my_access_overview(),
  public.admin_list_users(), public.admin_set_user_role(uuid, public.app_role), public.admin_stats(), public.admin_list_team(),
  public.admin_add_team_member(text), public.admin_remove_team_member(uuid), public.find_possible_deputy(text),
  public.save_my_company(jsonb), public.can_review_for(uuid, uuid), public.can_view_azubi(uuid, uuid),
  public.acting_principal(uuid, uuid), public.notification_recipients(uuid), public.display_names(uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_grant(uuid, uuid, boolean), public.display_people(uuid[]),
  public.redeem_invitation(text), public.create_invitation(public.app_role, text, int, int), public.revoke_invitation(uuid),
  public.end_access(uuid), public.set_deputy_allowed(uuid, boolean), public.my_access_overview(),
  public.admin_list_users(), public.admin_set_user_role(uuid, public.app_role), public.admin_stats(), public.admin_list_team(),
  public.admin_add_team_member(text), public.admin_remove_team_member(uuid), public.find_possible_deputy(text),
  public.save_my_company(jsonb), public.can_review_for(uuid, uuid), public.can_view_azubi(uuid, uuid),
  public.acting_principal(uuid, uuid), public.notification_recipients(uuid), public.display_names(uuid[])
  TO authenticated, service_role;
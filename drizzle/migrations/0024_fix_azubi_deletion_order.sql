CREATE OR REPLACE FUNCTION public.admin_delete_azubi_data(p_user uuid, p_actor uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(p_user, 'azubi') THEN RAISE EXCEPTION 'Nur Konten von Auszubildenden können gelöscht werden.'; END IF;
  PERFORM set_config('azuvera.account_removal', 'on', true);
  -- Rows that reference the profile without ON DELETE CASCADE must go first;
  -- otherwise the NO ACTION check can fire before the cascade through reports.
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
  DELETE FROM public.ai_usage WHERE user_id = p_user;
  DELETE FROM public.function_calls WHERE user_id = p_user;
  DELETE FROM public.profiles WHERE id = p_user;
  PERFORM set_config('azuvera.account_removal', '', true);
  INSERT INTO public.audit_log (chain_key, actor_id, actor_role, azubi_id, entity_type, entity_id, action, details)
  VALUES ('00000000-0000-0000-0000-000000000000', p_actor,
    (SELECT role FROM public.user_roles WHERE user_id = p_actor), NULL, 'account', p_user, 'account_deleted',
    jsonb_build_object('mode', 'deleted'));
END $$;

REVOKE ALL ON FUNCTION public.admin_delete_azubi_data(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_azubi_data(uuid, uuid) TO service_role;
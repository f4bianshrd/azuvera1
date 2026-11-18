CREATE OR REPLACE FUNCTION public.sync_my_email() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); v_new text; v_old text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
  SELECT email INTO v_new FROM auth.users WHERE id = me;
  SELECT email INTO v_old FROM public.profiles WHERE id = me;
  IF v_new IS NULL OR v_new IS NOT DISTINCT FROM v_old THEN RETURN v_old; END IF;
  PERFORM set_config('app.allow_protected_profile_write', 'on', true);
  UPDATE public.profiles SET email = v_new WHERE id = me;
  PERFORM set_config('app.allow_protected_profile_write', 'off', true);
  PERFORM public.write_audit('profile', me, 'email_changed', me, jsonb_build_object('changed', true));
  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION public.sync_my_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_my_email() TO authenticated;
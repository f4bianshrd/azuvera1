CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_full text := trim(coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.raw_user_meta_data ->> 'name', ''));
  v_role_txt text := trim(coalesce(new.raw_user_meta_data ->> 'role', ''));
  v_org text := trim(coalesce(new.raw_user_meta_data ->> 'organization', ''));
  v_code text := nullif(upper(regexp_replace(coalesce(new.raw_user_meta_data ->> 'invitation_code', ''), '[\s-]', '', 'g')), '');
  v_provider text := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
  v_role public.app_role;
BEGIN
  -- Anmeldung über Apple/Google/Microsoft liefert keine Rolle: wie bisher Azubi-Konto
  IF v_role_txt = '' AND v_provider <> 'email' THEN
    v_role_txt := 'azubi';
  END IF;
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
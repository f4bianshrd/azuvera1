-- Azubis wählen Beruf und Betrieb selbst (nur über diese Funktionen; Schutz-Trigger bleibt für direkte Schreibzugriffe).
CREATE OR REPLACE FUNCTION public.list_company_choices()
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name FROM public.companies c WHERE auth.uid() IS NOT NULL ORDER BY c.name
$$;
REVOKE ALL ON FUNCTION public.list_company_choices() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_company_choices() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_my_training(p_profession uuid, p_company uuid, p_new_company_name text DEFAULT NULL, p_new_company_address text DEFAULT NULL)
RETURNS void
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
      INSERT INTO public.companies (id, name, address) VALUES (gen_random_uuid(), v_name, nullif(btrim(coalesce(p_new_company_address, '')), '')) RETURNING id INTO v_company;
    END IF;
  ELSIF p_company IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company) THEN
    RAISE EXCEPTION 'Diesen Betrieb gibt es nicht.';
  END IF;
  SELECT profession_id, company_id INTO v_old FROM public.profiles WHERE id = v_uid;
  PERFORM set_config('app.allow_protected_profile_write', 'on', true);
  UPDATE public.profiles SET profession_id = p_profession, company_id = v_company WHERE id = v_uid;
  -- Fest zugeordneter Plan eines anderen Berufs passt nicht mehr.
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
REVOKE ALL ON FUNCTION public.set_my_training(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_training(uuid, uuid, text, text) TO authenticated;

-- Themen nur für Beteiligte des Berufs lesbar (statt für alle angemeldeten Personen).
DROP POLICY IF EXISTS training_topics_select ON public.training_topics;
CREATE POLICY training_topics_select ON public.training_topics FOR SELECT TO authenticated USING (
  public.is_leitung(auth.uid())
  OR profession_id = (SELECT p.profession_id FROM public.profiles p WHERE p.id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.profession_id = training_topics.profession_id AND p.id <> auth.uid() AND public.can_view_azubi(auth.uid(), p.id))
);
CREATE OR REPLACE FUNCTION public.resolve_plan(p_azubi uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_plan uuid; v_prof uuid; v_date date; v_ids uuid[];
BEGIN
  IF auth.uid() IS NULL OR NOT (public.can_view_azubi(auth.uid(), p_azubi) OR public.is_leitung(auth.uid())) THEN RETURN NULL; END IF;
  SELECT plan_id INTO v_plan FROM public.azubi_plans WHERE azubi_id = p_azubi;
  IF v_plan IS NOT NULL THEN RETURN v_plan; END IF;
  SELECT profession_id, coalesce(ausbildungsbeginn, current_date) INTO v_prof, v_date FROM public.profiles WHERE id = p_azubi;
  IF v_prof IS NULL THEN RETURN NULL; END IF;
  SELECT array_agg(id) INTO v_ids FROM public.training_plans
   WHERE profession_id = v_prof AND status = 'published' AND NOT is_template
     AND (valid_from IS NULL OR valid_from <= v_date) AND (valid_until IS NULL OR valid_until >= v_date);
  IF coalesce(array_length(v_ids, 1), 0) = 1 THEN RETURN v_ids[1]; END IF;
  -- Mehrere Pläne passen: den Plan nehmen, in dem schon Fortschritt gespeichert ist, damit nichts verschwindet.
  IF coalesce(array_length(v_ids, 1), 0) > 1 THEN
    SELECT i.plan_id INTO v_plan FROM public.plan_progress pp JOIN public.plan_items i ON i.id = pp.item_id
     WHERE pp.azubi_id = p_azubi AND i.plan_id = ANY (v_ids)
     GROUP BY i.plan_id ORDER BY count(*) DESC, i.plan_id LIMIT 1;
    RETURN v_plan;
  END IF;
  RETURN NULL;
END $function$;
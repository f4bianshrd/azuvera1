CREATE OR REPLACE FUNCTION public.log_export(p_azubi uuid, p_kind text, p_count integer, p_from date, p_to date)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
IF auth.uid() IS NULL OR NOT (public.can_view_azubi(auth.uid(),p_azubi) OR (p_kind IN ('plan_pdf','plan_odt','folder') AND public.is_leitung(auth.uid()))) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
IF p_kind NOT IN ('single','bulk','zip','plan_pdf','plan_odt','folder') OR p_count IS NULL OR p_count<0 THEN RAISE EXCEPTION 'Ungültiger Export.'; END IF;
PERFORM public.write_audit('export',NULL,CASE WHEN p_kind IN ('plan_pdf','plan_odt') THEN 'plan_export' WHEN p_kind = 'folder' THEN 'folder_export' ELSE 'pdf_export' END,p_azubi,jsonb_build_object('kind',p_kind,'count',p_count,'from',p_from,'to',p_to));
END $function$;
CREATE OR REPLACE FUNCTION public.support_delete_attachment(p_ziel uuid, p_kind text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s public.support_sessions; v_path text; v_thumb text; v_status public.report_status; v_bucket text; v_table text;
BEGIN
  s := public.support_require(p_ziel, 'anhaenge_verwalten');
  IF p_kind = 'report' THEN
    SELECT a.storage_path, a.thumb_path, r.status INTO v_path, v_thumb, v_status FROM public.report_attachments a JOIN public.reports r ON r.id = a.report_id WHERE a.id = p_id AND a.azubi_id = p_ziel;
    v_bucket := 'report-files'; v_table := 'report_attachments';
  ELSIF p_kind = 'experience' THEN
    SELECT a.storage_path, a.thumb_path, e.status INTO v_path, v_thumb, v_status FROM public.experience_attachments a JOIN public.experience_reports e ON e.id = a.experience_id WHERE a.id = p_id AND a.azubi_id = p_ziel;
    v_bucket := 'experience-files'; v_table := 'experience_attachments';
  ELSIF p_kind = 'leittext' THEN
    SELECT a.storage_path, a.thumb_path, w.status INTO v_path, v_thumb, v_status FROM public.leittext_attachments a JOIN public.leittext_works w ON w.id = a.work_id WHERE a.id = p_id AND a.azubi_id = p_ziel;
    v_bucket := 'leittext-files'; v_table := 'leittext_attachments';
  ELSE RAISE EXCEPTION 'Unbekannte Art.'; END IF;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Anhang nicht gefunden.'; END IF;
  IF v_status NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'Anhänge eingereichter oder freigegebener Einträge lassen sich nicht löschen.'; END IF;
  -- Feste Befehle statt zusammengesetztem SQL
  IF p_kind = 'report' THEN
    DELETE FROM public.report_attachments WHERE id = p_id AND azubi_id = p_ziel;
  ELSIF p_kind = 'experience' THEN
    DELETE FROM public.experience_attachments WHERE id = p_id AND azubi_id = p_ziel;
  ELSE
    DELETE FROM public.leittext_attachments WHERE id = p_id AND azubi_id = p_ziel;
  END IF;
  PERFORM public.support_log(s.id, p_ziel, 'loeschen', v_table, p_id);
  RETURN jsonb_build_object('bucket', v_bucket, 'paths', to_jsonb(array_remove(ARRAY[v_path, v_thumb], NULL)));
END $function$;
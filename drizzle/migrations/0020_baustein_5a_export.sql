CREATE OR REPLACE FUNCTION public.export_header(p_azubi uuid) RETURNS TABLE(azubi_name text, personalnummer text, profession_name text, company_name text, company_address text, training_start date, training_end date, ausbilder_name text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
IF auth.uid() IS NULL OR NOT public.can_view_azubi(auth.uid(),p_azubi) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
RETURN QUERY SELECT p.full_name,p.personalnummer,pr.name,c.name,c.address,p.ausbildungsbeginn,p.ausbildungsende,a.full_name
FROM public.profiles p LEFT JOIN public.professions pr ON pr.id=p.profession_id LEFT JOIN public.companies c ON c.id=p.company_id LEFT JOIN public.profiles a ON a.id=p.ausbilder_id WHERE p.id=p_azubi;
END $$;
REVOKE ALL ON FUNCTION public.export_header(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.export_header(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.verify_report(p_report uuid) RETURNS TABLE(report_id uuid, version integer, stored_hash text, computed_hash text, hash_ok boolean, signatures_ok boolean) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.reports%ROWTYPE; ch text;
BEGIN
SELECT * INTO r FROM public.reports x WHERE x.id=p_report;
IF NOT FOUND OR auth.uid() IS NULL OR NOT (r.azubi_id=auth.uid() OR (public.can_view_azubi(auth.uid(),r.azubi_id) AND r.status<>'draft')) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
ch := public.report_hash(r.id);
report_id:=r.id; version:=r.version; stored_hash:=r.content_hash; computed_hash:=ch;
IF r.content_hash IS NULL THEN hash_ok:=NULL; signatures_ok:=NULL;
ELSE hash_ok := r.content_hash=ch;
 signatures_ok := NOT EXISTS(SELECT 1 FROM public.report_signatures s WHERE s.report_id=r.id AND s.report_version=r.version AND s.content_hash IS DISTINCT FROM r.content_hash);
END IF;
RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.verify_report(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verify_report(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.log_export(p_azubi uuid, p_kind text, p_count integer, p_from date, p_to date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
IF auth.uid() IS NULL OR NOT public.can_view_azubi(auth.uid(),p_azubi) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
IF p_kind NOT IN ('single','bulk','zip') OR p_count IS NULL OR p_count<0 THEN RAISE EXCEPTION 'Ungültiger Export.'; END IF;
PERFORM public.write_audit('export',NULL,'pdf_export',p_azubi,jsonb_build_object('kind',p_kind,'count',p_count,'from',p_from,'to',p_to));
END $$;
REVOKE ALL ON FUNCTION public.log_export(uuid,text,integer,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.log_export(uuid,text,integer,date,date) TO authenticated;
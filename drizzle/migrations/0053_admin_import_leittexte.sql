CREATE OR REPLACE FUNCTION public.admin_import_leittexte(p_items jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it jsonb; n int := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_team(auth.uid()) THEN RAISE EXCEPTION 'Nur die Plattform-Verwaltung darf Leittexte einspielen.'; END IF;
  IF jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'Ungültige Daten.'; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF coalesce(it->>'code', '') = '' OR coalesce(it->>'source_url', '') = '' OR jsonb_typeof(it->'content'->'sections') <> 'array' THEN
      RAISE EXCEPTION 'Leittext ohne Kennung, Quelle oder Aufgaben.';
    END IF;
    INSERT INTO public.leittexts (code, title, topic, profession_codes, source_url, stand, order_no, content, sort_order, published)
    VALUES (it->>'code', it->>'title', coalesce(it->>'topic', ''),
            ARRAY(SELECT jsonb_array_elements_text(coalesce(it->'profession_codes', '[]'::jsonb))),
            it->>'source_url', nullif(it->>'stand', ''), nullif(it->>'order_no', ''), it->'content',
            coalesce((it->>'sort_order')::int, 0), true)
    ON CONFLICT (code) DO UPDATE SET
      title = excluded.title, topic = excluded.topic, profession_codes = excluded.profession_codes,
      source_url = excluded.source_url, stand = excluded.stand, order_no = excluded.order_no,
      content = excluded.content, sort_order = excluded.sort_order;
    n := n + 1;
  END LOOP;
  PERFORM public.write_audit('leittext', NULL, 'catalog_import', NULL, jsonb_build_object('count', n));
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.admin_import_leittexte(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_import_leittexte(jsonb) TO authenticated;
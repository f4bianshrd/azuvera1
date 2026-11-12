-- Daten-Prompt A1: Ausbildungsplan
INSERT INTO public.professions (name, code, chamber, duration_months)
SELECT v.name, v.code, 'LWK', 36
FROM (VALUES ('Landwirt/in','landwirt'), ('Gärtner/in','gaertner'), ('Pferdewirt/in','pferdewirt')) AS v(name, code)
WHERE NOT EXISTS (SELECT 1 FROM public.professions p WHERE p.code = v.code OR p.name = v.name);

CREATE TABLE public.training_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profession_id uuid NOT NULL REFERENCES public.professions(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE CHECK (char_length(code) BETWEEN 1 AND 100),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  subtitle text CHECK (subtitle IS NULL OR char_length(subtitle) <= 300),
  source text CHECK (source IS NULL OR char_length(source) <= 1000),
  valid_from date,
  valid_until date,
  duration_years int NOT NULL DEFAULT 3 CHECK (duration_years BETWEEN 1 AND 4),
  is_template boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX training_plans_profession_idx ON public.training_plans(profession_id);

CREATE TABLE public.plan_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.training_plans(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 100),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  kind text NOT NULL DEFAULT 'content' CHECK (kind IN ('content','checklist')),
  hint text CHECK (hint IS NULL OR char_length(hint) <= 2000),
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (plan_id, key)
);

CREATE TABLE public.plan_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.plan_sections(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 100),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  reference text CHECK (reference IS NULL OR char_length(reference) <= 200),
  weeks_text text CHECK (weeks_text IS NULL OR char_length(weeks_text) <= 300),
  hint text CHECK (hint IS NULL OR char_length(hint) <= 2000),
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (section_id, key)
);

CREATE TABLE public.plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.plan_groups(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.training_plans(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 100),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 800),
  reference text CHECK (reference IS NULL OR char_length(reference) <= 50),
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (plan_id, key)
);
CREATE INDEX plan_items_group_idx ON public.plan_items(group_id);

CREATE TABLE public.azubi_plans (
  azubi_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.training_plans(id) ON DELETE CASCADE,
  set_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  set_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.plan_progress (
  azubi_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.plan_items(id) ON DELETE CASCADE,
  year int NOT NULL CHECK (year BETWEEN 1 AND 4),
  planned boolean NOT NULL DEFAULT false,
  mastered text NOT NULL DEFAULT '' CHECK (mastered IN ('','yes','no')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (azubi_id, item_id, year)
);
CREATE INDEX plan_progress_item_idx ON public.plan_progress(item_id);

CREATE TABLE public.training_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profession_id uuid NOT NULL REFERENCES public.professions(id) ON DELETE CASCADE,
  code text CHECK (code IS NULL OR char_length(code) <= 50),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  target_year int CHECK (target_year IS NULL OR target_year BETWEEN 1 AND 4),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX training_topics_profession_idx ON public.training_topics(profession_id);

CREATE TABLE public.report_topics (
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.training_topics(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, topic_id)
);
CREATE INDEX report_topics_topic_idx ON public.report_topics(topic_id);

CREATE TABLE public.report_plan_items (
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.plan_items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, item_id)
);
CREATE INDEX report_plan_items_item_idx ON public.report_plan_items(item_id);

GRANT SELECT ON public.training_plans, public.plan_sections, public.plan_groups, public.plan_items, public.azubi_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_progress, public.training_topics TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.report_topics, public.report_plan_items TO authenticated;
GRANT ALL ON public.training_plans, public.plan_sections, public.plan_groups, public.plan_items, public.azubi_plans,
  public.plan_progress, public.training_topics, public.report_topics, public.report_plan_items TO service_role;

ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.azubi_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_plan_items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.plan_visible(p_plan uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_leitung(auth.uid())
    OR EXISTS (SELECT 1 FROM public.training_plans p WHERE p.id = p_plan AND p.status = 'published' AND NOT p.is_template)
$$;
REVOKE ALL ON FUNCTION public.plan_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_visible(uuid) TO authenticated;

CREATE POLICY training_plans_select ON public.training_plans FOR SELECT TO authenticated
  USING (public.is_leitung(auth.uid()) OR (status = 'published' AND NOT is_template));
CREATE POLICY plan_sections_select ON public.plan_sections FOR SELECT TO authenticated
  USING (public.plan_visible(plan_id));
CREATE POLICY plan_groups_select ON public.plan_groups FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.plan_sections s WHERE s.id = section_id AND public.plan_visible(s.plan_id)));
CREATE POLICY plan_items_select ON public.plan_items FOR SELECT TO authenticated
  USING (public.plan_visible(plan_id));
CREATE POLICY azubi_plans_select ON public.azubi_plans FOR SELECT TO authenticated
  USING (azubi_id = auth.uid() OR public.can_view_azubi(auth.uid(), azubi_id) OR public.is_leitung(auth.uid()));

CREATE POLICY plan_progress_select ON public.plan_progress FOR SELECT TO authenticated
  USING (azubi_id = auth.uid() OR public.can_view_azubi(auth.uid(), azubi_id) OR public.is_leitung(auth.uid()));
CREATE POLICY plan_progress_insert ON public.plan_progress FOR INSERT TO authenticated
  WITH CHECK (azubi_id = auth.uid() AND public.has_role(auth.uid(), 'azubi'));
CREATE POLICY plan_progress_update ON public.plan_progress FOR UPDATE TO authenticated
  USING (azubi_id = auth.uid() AND public.has_role(auth.uid(), 'azubi'))
  WITH CHECK (azubi_id = auth.uid() AND public.has_role(auth.uid(), 'azubi'));
CREATE POLICY plan_progress_delete ON public.plan_progress FOR DELETE TO authenticated
  USING (azubi_id = auth.uid() AND public.has_role(auth.uid(), 'azubi'));

CREATE POLICY training_topics_select ON public.training_topics FOR SELECT TO authenticated USING (true);
CREATE POLICY training_topics_insert ON public.training_topics FOR INSERT TO authenticated WITH CHECK (public.is_leitung(auth.uid()));
CREATE POLICY training_topics_update ON public.training_topics FOR UPDATE TO authenticated
  USING (public.is_leitung(auth.uid())) WITH CHECK (public.is_leitung(auth.uid()));
CREATE POLICY training_topics_delete ON public.training_topics FOR DELETE TO authenticated USING (public.is_leitung(auth.uid()));

CREATE POLICY report_topics_select ON public.report_topics FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reports r WHERE r.id = report_id));
CREATE POLICY report_topics_insert ON public.report_topics FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.reports r WHERE r.id = report_id AND r.azubi_id = auth.uid() AND r.status IN ('draft','rejected')));
CREATE POLICY report_topics_delete ON public.report_topics FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reports r WHERE r.id = report_id AND r.azubi_id = auth.uid() AND r.status IN ('draft','rejected')));
CREATE POLICY report_plan_items_select ON public.report_plan_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reports r WHERE r.id = report_id));
CREATE POLICY report_plan_items_insert ON public.report_plan_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.reports r WHERE r.id = report_id AND r.azubi_id = auth.uid() AND r.status IN ('draft','rejected')));
CREATE POLICY report_plan_items_delete ON public.report_plan_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reports r WHERE r.id = report_id AND r.azubi_id = auth.uid() AND r.status IN ('draft','rejected')));

CREATE TRIGGER trg_training_plans_updated BEFORE UPDATE ON public.training_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_training_topics_updated BEFORE UPDATE ON public.training_topics FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.plan_items_set_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT s.plan_id INTO NEW.plan_id FROM public.plan_groups g JOIN public.plan_sections s ON s.id = g.section_id WHERE g.id = NEW.group_id;
  IF NEW.plan_id IS NULL THEN RAISE EXCEPTION 'Gruppe nicht gefunden.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER plan_items_00_set_plan BEFORE INSERT OR UPDATE OF group_id ON public.plan_items FOR EACH ROW EXECUTE FUNCTION public.plan_items_set_plan();

CREATE OR REPLACE FUNCTION public.resolve_plan(p_azubi uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.list_selectable_plans(p_azubi uuid)
RETURNS TABLE (id uuid, code text, title text, subtitle text, source text, valid_from date, valid_until date, duration_years int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.can_view_azubi(auth.uid(), p_azubi) OR public.is_leitung(auth.uid())) THEN RETURN; END IF;
  RETURN QUERY
    SELECT p.id, p.code, p.title, p.subtitle, p.source, p.valid_from, p.valid_until, p.duration_years
    FROM public.training_plans p JOIN public.profiles pr ON pr.id = p_azubi
    WHERE p.profession_id = pr.profession_id AND p.status = 'published' AND NOT p.is_template
    ORDER BY p.sort_order, p.title;
END $$;

CREATE OR REPLACE FUNCTION public.set_azubi_plan(p_azubi uuid, p_plan uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_current uuid; v_prof uuid; v_plan public.training_plans%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF NOT public.has_role(p_azubi, 'azubi') THEN RAISE EXCEPTION 'Ein Ausbildungsplan lässt sich nur Azubis zuordnen.'; END IF;
  IF NOT public.is_leitung(v_uid) THEN
    IF v_uid <> p_azubi THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
    v_current := public.resolve_plan(p_azubi);
    IF v_current IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.plan_progress pp JOIN public.plan_items i ON i.id = pp.item_id
      WHERE pp.azubi_id = p_azubi AND i.plan_id = v_current) THEN
      RAISE EXCEPTION 'Du hast schon Fortschritt gespeichert. Den Plan kann jetzt nur die Ausbildungsleitung ändern.';
    END IF;
  END IF;
  IF p_plan IS NULL THEN
    DELETE FROM public.azubi_plans WHERE azubi_id = p_azubi;
  ELSE
    SELECT * INTO v_plan FROM public.training_plans WHERE id = p_plan;
    IF NOT FOUND OR v_plan.status <> 'published' OR v_plan.is_template THEN RAISE EXCEPTION 'Dieser Plan steht nicht zur Auswahl.'; END IF;
    SELECT profession_id INTO v_prof FROM public.profiles WHERE id = p_azubi;
    IF v_prof IS DISTINCT FROM v_plan.profession_id THEN RAISE EXCEPTION 'Der Plan gehört zu einem anderen Beruf.'; END IF;
    INSERT INTO public.azubi_plans (azubi_id, plan_id, set_by, set_at) VALUES (p_azubi, p_plan, v_uid, now())
    ON CONFLICT (azubi_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, set_by = EXCLUDED.set_by, set_at = now();
  END IF;
  PERFORM public.write_audit('plan', coalesce(p_plan, p_azubi), 'plan_set', p_azubi, jsonb_build_object('plan_id', p_plan));
END $$;

CREATE OR REPLACE FUNCTION public.plan_progress_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan uuid; v_item_plan uuid; v_years int;
BEGIN
  NEW.updated_at := least(coalesce(NEW.updated_at, now()), now());
  IF TG_OP = 'UPDATE' THEN
    IF NEW.azubi_id <> OLD.azubi_id OR NEW.item_id <> OLD.item_id OR NEW.year <> OLD.year THEN
      RAISE EXCEPTION 'Ungültige Änderung.';
    END IF;
    IF NEW.updated_at < OLD.updated_at THEN RETURN OLD; END IF;
  END IF;
  v_plan := public.resolve_plan(NEW.azubi_id);
  SELECT i.plan_id, p.duration_years INTO v_item_plan, v_years
    FROM public.plan_items i JOIN public.training_plans p ON p.id = i.plan_id WHERE i.id = NEW.item_id;
  IF v_plan IS NULL OR v_item_plan IS DISTINCT FROM v_plan THEN
    RAISE EXCEPTION 'Dieser Punkt gehört nicht zu deinem Ausbildungsplan.';
  END IF;
  IF NEW.year > v_years THEN RAISE EXCEPTION 'Dieses Ausbildungsjahr gibt es im Plan nicht.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER plan_progress_00_guard BEFORE INSERT OR UPDATE ON public.plan_progress FOR EACH ROW EXECUTE FUNCTION public.plan_progress_guard();

CREATE OR REPLACE FUNCTION public.plan_progress_cleanup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.plan_progress WHERE azubi_id = NEW.azubi_id AND item_id = NEW.item_id AND year = NEW.year AND planned = false AND mastered = '';
  RETURN NULL;
END $$;
CREATE TRIGGER plan_progress_zz_cleanup AFTER INSERT OR UPDATE ON public.plan_progress FOR EACH ROW
  WHEN (NEW.planned = false AND NEW.mastered = '') EXECUTE FUNCTION public.plan_progress_cleanup();

CREATE OR REPLACE FUNCTION public.report_links_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM public.reports WHERE id = NEW.report_id FOR UPDATE;
  IF (SELECT count(*) FROM public.report_topics WHERE report_id = NEW.report_id)
   + (SELECT count(*) FROM public.report_plan_items WHERE report_id = NEW.report_id) >= 30 THEN
    RAISE EXCEPTION 'Höchstens 30 Ausbildungsinhalte je Bericht.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER report_topics_limit BEFORE INSERT ON public.report_topics FOR EACH ROW EXECUTE FUNCTION public.report_links_limit();
CREATE TRIGGER report_plan_items_limit BEFORE INSERT ON public.report_plan_items FOR EACH ROW EXECUTE FUNCTION public.report_links_limit();

CREATE OR REPLACE FUNCTION public.export_plan_json(p_plan uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_leitung(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  SELECT jsonb_build_object(
    'plan', jsonb_build_object('code', p.code, 'profession_code', pr.code, 'title', p.title, 'subtitle', p.subtitle, 'source', p.source,
      'valid_from', p.valid_from, 'valid_until', p.valid_until, 'duration_years', p.duration_years, 'is_template', p.is_template, 'status', p.status),
    'sections', coalesce((
      SELECT jsonb_agg(jsonb_build_object('key', s.key, 'title', s.title, 'kind', s.kind, 'hint', s.hint,
        'groups', coalesce((
          SELECT jsonb_agg(jsonb_build_object('key', g.key, 'title', g.title, 'reference', g.reference, 'weeks_text', g.weeks_text, 'hint', g.hint,
            'items', coalesce((
              SELECT jsonb_agg(jsonb_build_object('key', i.key, 'label', i.label, 'reference', i.reference) ORDER BY i.sort_order, i.key)
              FROM public.plan_items i WHERE i.group_id = g.id AND i.is_active), '[]'::jsonb)) ORDER BY g.sort_order, g.key)
          FROM public.plan_groups g WHERE g.section_id = s.id), '[]'::jsonb)) ORDER BY s.sort_order, s.key)
      FROM public.plan_sections s WHERE s.plan_id = p.id), '[]'::jsonb))
  INTO v
  FROM public.training_plans p JOIN public.professions pr ON pr.id = p.profession_id WHERE p.id = p_plan;
  IF v IS NULL THEN RAISE EXCEPTION 'Plan nicht gefunden.'; END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.admin_save_plan(p_plan jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pl jsonb; sec jsonb; grp jsonb; itm jsonb;
  v_prof uuid; v_plan uuid; v_sec uuid; v_grp uuid;
  v_code text; v_title text; v_years int; v_status text; v_tpl boolean; v_from date; v_until date;
  v_sec_keys text[] := '{}'; v_item_keys text[] := '{}'; v_grp_keys text[];
  v_kept_sections uuid[] := '{}'; v_kept_groups uuid[] := '{}';
  si int; gi int; ii int; n int; v_changed int := 0;
  t_key text; t_title text; t_kind text; t_label text;
BEGIN
  IF NOT public.is_leitung(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF p_plan IS NULL OR jsonb_typeof(p_plan) <> 'object' THEN RAISE EXCEPTION 'Die Datei hat kein gültiges Format.'; END IF;
  pl := p_plan -> 'plan';
  IF pl IS NULL OR jsonb_typeof(pl) <> 'object' THEN RAISE EXCEPTION 'Der Abschnitt „plan“ fehlt.'; END IF;
  IF jsonb_typeof(coalesce(p_plan -> 'sections', 'null'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Die Liste „sections“ fehlt.'; END IF;

  v_code := btrim(coalesce(pl ->> 'code', ''));
  IF char_length(v_code) NOT BETWEEN 1 AND 100 OR v_code !~ '^[A-Za-z0-9._-]+$' THEN
    RAISE EXCEPTION 'Der Plan-Code muss 1 bis 100 Zeichen lang sein (Buchstaben, Ziffern, Punkt, Binde- oder Unterstrich).';
  END IF;
  SELECT id INTO v_prof FROM public.professions WHERE code = btrim(coalesce(pl ->> 'profession_code', ''));
  IF v_prof IS NULL THEN RAISE EXCEPTION 'Unbekannter Beruf: „%“.', coalesce(pl ->> 'profession_code', ''); END IF;
  v_title := btrim(coalesce(pl ->> 'title', ''));
  IF char_length(v_title) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Der Plantitel muss 1 bis 200 Zeichen lang sein.'; END IF;
  IF char_length(coalesce(pl ->> 'subtitle', '')) > 300 THEN RAISE EXCEPTION 'Der Untertitel darf höchstens 300 Zeichen lang sein.'; END IF;
  IF char_length(coalesce(pl ->> 'source', '')) > 1000 THEN RAISE EXCEPTION 'Die Quelle darf höchstens 1000 Zeichen lang sein.'; END IF;
  BEGIN
    v_from := nullif(pl ->> 'valid_from', '')::date;
    v_until := nullif(pl ->> 'valid_until', '')::date;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'Gültigkeitsdaten müssen im Format JJJJ-MM-TT angegeben werden.';
  END;
  IF v_from IS NOT NULL AND v_until IS NOT NULL AND v_until < v_from THEN RAISE EXCEPTION 'Das Ende der Gültigkeit liegt vor dem Beginn.'; END IF;
  IF coalesce(pl ->> 'duration_years', '3') !~ '^[1-4]$' THEN RAISE EXCEPTION 'Die Ausbildungsdauer muss 1 bis 4 Jahre betragen.'; END IF;
  v_years := coalesce(pl ->> 'duration_years', '3')::int;
  v_status := coalesce(nullif(pl ->> 'status', ''), 'draft');
  IF v_status NOT IN ('draft','published') THEN RAISE EXCEPTION 'Der Status muss „draft“ oder „published“ sein.'; END IF;
  IF coalesce(pl ->> 'is_template', 'false') NOT IN ('true','false') THEN RAISE EXCEPTION '„is_template“ muss true oder false sein.'; END IF;
  v_tpl := coalesce((pl ->> 'is_template')::boolean, false);

  FOR sec, si IN SELECT e, o FROM jsonb_array_elements(p_plan -> 'sections') WITH ORDINALITY AS x(e, o) LOOP
    IF jsonb_typeof(sec) <> 'object' THEN RAISE EXCEPTION 'Abschnitt % hat kein gültiges Format.', si; END IF;
    t_key := btrim(coalesce(sec ->> 'key', ''));
    IF char_length(t_key) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Abschnitt %: Der Schlüssel muss 1 bis 100 Zeichen lang sein.', si; END IF;
    IF t_key = ANY (v_sec_keys) THEN RAISE EXCEPTION 'Doppelter Abschnitts-Schlüssel: „%“.', t_key; END IF;
    v_sec_keys := v_sec_keys || t_key;
    IF char_length(btrim(coalesce(sec ->> 'title', ''))) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Abschnitt „%“: Der Titel muss 1 bis 300 Zeichen lang sein.', t_key; END IF;
    IF coalesce(nullif(sec ->> 'kind', ''), 'content') NOT IN ('content','checklist') THEN RAISE EXCEPTION 'Abschnitt „%“: Die Art muss „content“ oder „checklist“ sein.', t_key; END IF;
    IF char_length(coalesce(sec ->> 'hint', '')) > 2000 THEN RAISE EXCEPTION 'Abschnitt „%“: Der Hinweis darf höchstens 2000 Zeichen lang sein.', t_key; END IF;
    IF jsonb_typeof(coalesce(sec -> 'groups', '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Abschnitt „%“: „groups“ muss eine Liste sein.', t_key; END IF;
    v_grp_keys := '{}';
    FOR grp, gi IN SELECT e, o FROM jsonb_array_elements(coalesce(sec -> 'groups', '[]'::jsonb)) WITH ORDINALITY AS x(e, o) LOOP
      IF jsonb_typeof(grp) <> 'object' THEN RAISE EXCEPTION 'Abschnitt „%“, Gruppe %: ungültiges Format.', t_key, gi; END IF;
      IF char_length(btrim(coalesce(grp ->> 'key', ''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Abschnitt „%“, Gruppe %: Der Schlüssel muss 1 bis 100 Zeichen lang sein.', t_key, gi; END IF;
      IF btrim(grp ->> 'key') = ANY (v_grp_keys) THEN RAISE EXCEPTION 'Doppelter Gruppen-Schlüssel in Abschnitt „%“: „%“.', t_key, btrim(grp ->> 'key'); END IF;
      v_grp_keys := v_grp_keys || btrim(grp ->> 'key');
      IF char_length(btrim(coalesce(grp ->> 'title', ''))) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Gruppe „%“: Der Titel muss 1 bis 300 Zeichen lang sein.', btrim(grp ->> 'key'); END IF;
      IF char_length(coalesce(grp ->> 'reference', '')) > 200 THEN RAISE EXCEPTION 'Gruppe „%“: Die Fundstelle darf höchstens 200 Zeichen lang sein.', btrim(grp ->> 'key'); END IF;
      IF char_length(coalesce(grp ->> 'weeks_text', '')) > 300 THEN RAISE EXCEPTION 'Gruppe „%“: Die Zeitangabe darf höchstens 300 Zeichen lang sein.', btrim(grp ->> 'key'); END IF;
      IF char_length(coalesce(grp ->> 'hint', '')) > 2000 THEN RAISE EXCEPTION 'Gruppe „%“: Der Hinweis darf höchstens 2000 Zeichen lang sein.', btrim(grp ->> 'key'); END IF;
      IF jsonb_typeof(coalesce(grp -> 'items', '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Gruppe „%“: „items“ muss eine Liste sein.', btrim(grp ->> 'key'); END IF;
      FOR itm, ii IN SELECT e, o FROM jsonb_array_elements(coalesce(grp -> 'items', '[]'::jsonb)) WITH ORDINALITY AS x(e, o) LOOP
        IF jsonb_typeof(itm) <> 'object' THEN RAISE EXCEPTION 'Gruppe „%“, Punkt %: ungültiges Format.', btrim(grp ->> 'key'), ii; END IF;
        IF char_length(btrim(coalesce(itm ->> 'key', ''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Gruppe „%“, Punkt %: Der Schlüssel muss 1 bis 100 Zeichen lang sein.', btrim(grp ->> 'key'), ii; END IF;
        IF btrim(itm ->> 'key') = ANY (v_item_keys) THEN RAISE EXCEPTION 'Doppelter Punkt-Schlüssel: „%“.', btrim(itm ->> 'key'); END IF;
        v_item_keys := v_item_keys || btrim(itm ->> 'key');
        IF char_length(btrim(coalesce(itm ->> 'label', ''))) NOT BETWEEN 1 AND 800 THEN RAISE EXCEPTION 'Punkt „%“: Der Text muss 1 bis 800 Zeichen lang sein.', btrim(itm ->> 'key'); END IF;
        IF char_length(coalesce(itm ->> 'reference', '')) > 50 THEN RAISE EXCEPTION 'Punkt „%“: Die Nummer darf höchstens 50 Zeichen lang sein.', btrim(itm ->> 'key'); END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  SELECT id INTO v_plan FROM public.training_plans WHERE code = v_code;
  IF v_plan IS NULL THEN
    INSERT INTO public.training_plans (profession_id, code, title, subtitle, source, valid_from, valid_until, duration_years, is_template, status)
    VALUES (v_prof, v_code, v_title, nullif(btrim(coalesce(pl ->> 'subtitle', '')), ''), nullif(btrim(coalesce(pl ->> 'source', '')), ''),
            v_from, v_until, v_years, v_tpl, v_status)
    RETURNING id INTO v_plan;
    v_changed := 1;
  ELSE
    UPDATE public.training_plans SET profession_id = v_prof, title = v_title,
      subtitle = nullif(btrim(coalesce(pl ->> 'subtitle', '')), ''), source = nullif(btrim(coalesce(pl ->> 'source', '')), ''),
      valid_from = v_from, valid_until = v_until, duration_years = v_years, is_template = v_tpl, status = v_status
    WHERE id = v_plan AND (profession_id, title, subtitle, source, valid_from, valid_until, duration_years, is_template, status)
      IS DISTINCT FROM (v_prof, v_title, nullif(btrim(coalesce(pl ->> 'subtitle', '')), ''), nullif(btrim(coalesce(pl ->> 'source', '')), ''),
                        v_from, v_until, v_years, v_tpl, v_status);
    GET DIAGNOSTICS n = ROW_COUNT; v_changed := v_changed + n;
  END IF;

  FOR sec, si IN SELECT e, o FROM jsonb_array_elements(p_plan -> 'sections') WITH ORDINALITY AS x(e, o) LOOP
    t_key := btrim(sec ->> 'key'); t_title := btrim(sec ->> 'title'); t_kind := coalesce(nullif(sec ->> 'kind', ''), 'content');
    INSERT INTO public.plan_sections AS s (plan_id, key, title, kind, hint, sort_order)
    VALUES (v_plan, t_key, t_title, t_kind, nullif(btrim(coalesce(sec ->> 'hint', '')), ''), si)
    ON CONFLICT (plan_id, key) DO UPDATE SET title = EXCLUDED.title, kind = EXCLUDED.kind, hint = EXCLUDED.hint, sort_order = EXCLUDED.sort_order
      WHERE (s.title, s.kind, s.hint, s.sort_order) IS DISTINCT FROM (EXCLUDED.title, EXCLUDED.kind, EXCLUDED.hint, EXCLUDED.sort_order);
    GET DIAGNOSTICS n = ROW_COUNT; v_changed := v_changed + n;
    SELECT id INTO v_sec FROM public.plan_sections WHERE plan_id = v_plan AND key = t_key;
    v_kept_sections := v_kept_sections || v_sec;
    FOR grp, gi IN SELECT e, o FROM jsonb_array_elements(coalesce(sec -> 'groups', '[]'::jsonb)) WITH ORDINALITY AS x(e, o) LOOP
      INSERT INTO public.plan_groups AS g (section_id, key, title, reference, weeks_text, hint, sort_order)
      VALUES (v_sec, btrim(grp ->> 'key'), btrim(grp ->> 'title'), nullif(btrim(coalesce(grp ->> 'reference', '')), ''),
              nullif(btrim(coalesce(grp ->> 'weeks_text', '')), ''), nullif(btrim(coalesce(grp ->> 'hint', '')), ''), gi)
      ON CONFLICT (section_id, key) DO UPDATE SET title = EXCLUDED.title, reference = EXCLUDED.reference, weeks_text = EXCLUDED.weeks_text,
        hint = EXCLUDED.hint, sort_order = EXCLUDED.sort_order
        WHERE (g.title, g.reference, g.weeks_text, g.hint, g.sort_order) IS DISTINCT FROM (EXCLUDED.title, EXCLUDED.reference, EXCLUDED.weeks_text, EXCLUDED.hint, EXCLUDED.sort_order);
      GET DIAGNOSTICS n = ROW_COUNT; v_changed := v_changed + n;
      SELECT id INTO v_grp FROM public.plan_groups WHERE section_id = v_sec AND key = btrim(grp ->> 'key');
      v_kept_groups := v_kept_groups || v_grp;
      FOR itm, ii IN SELECT e, o FROM jsonb_array_elements(coalesce(grp -> 'items', '[]'::jsonb)) WITH ORDINALITY AS x(e, o) LOOP
        t_label := btrim(itm ->> 'label');
        INSERT INTO public.plan_items AS i (group_id, plan_id, key, label, reference, is_active, sort_order)
        VALUES (v_grp, v_plan, btrim(itm ->> 'key'), t_label, nullif(btrim(coalesce(itm ->> 'reference', '')), ''), true, ii)
        ON CONFLICT (plan_id, key) DO UPDATE SET group_id = EXCLUDED.group_id, label = EXCLUDED.label, reference = EXCLUDED.reference,
          is_active = true, sort_order = EXCLUDED.sort_order
          WHERE (i.group_id, i.label, i.reference, i.is_active, i.sort_order) IS DISTINCT FROM (EXCLUDED.group_id, EXCLUDED.label, EXCLUDED.reference, true, EXCLUDED.sort_order);
        GET DIAGNOSTICS n = ROW_COUNT; v_changed := v_changed + n;
      END LOOP;
    END LOOP;
  END LOOP;

  UPDATE public.plan_items i SET is_active = false
   WHERE i.plan_id = v_plan AND i.is_active AND NOT (i.key = ANY (v_item_keys))
     AND (EXISTS (SELECT 1 FROM public.plan_progress pp WHERE pp.item_id = i.id) OR EXISTS (SELECT 1 FROM public.report_plan_items r WHERE r.item_id = i.id));
  GET DIAGNOSTICS n = ROW_COUNT; v_changed := v_changed + n;
  DELETE FROM public.plan_items i
   WHERE i.plan_id = v_plan AND NOT (i.key = ANY (v_item_keys))
     AND NOT EXISTS (SELECT 1 FROM public.plan_progress pp WHERE pp.item_id = i.id)
     AND NOT EXISTS (SELECT 1 FROM public.report_plan_items r WHERE r.item_id = i.id);
  GET DIAGNOSTICS n = ROW_COUNT; v_changed := v_changed + n;
  DELETE FROM public.plan_groups g USING public.plan_sections s
   WHERE g.section_id = s.id AND s.plan_id = v_plan AND NOT (g.id = ANY (v_kept_groups))
     AND NOT EXISTS (SELECT 1 FROM public.plan_items i WHERE i.group_id = g.id);
  GET DIAGNOSTICS n = ROW_COUNT; v_changed := v_changed + n;
  DELETE FROM public.plan_sections s
   WHERE s.plan_id = v_plan AND NOT (s.id = ANY (v_kept_sections))
     AND NOT EXISTS (SELECT 1 FROM public.plan_groups g WHERE g.section_id = s.id);
  GET DIAGNOSTICS n = ROW_COUNT; v_changed := v_changed + n;

  IF v_changed > 0 THEN
    PERFORM public.write_audit('plan', v_plan, 'plan_saved', NULL, jsonb_build_object('code', v_code));
  END IF;
  RETURN v_plan;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_plan_status(p_plan uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_leitung(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF p_status NOT IN ('draft','published') THEN RAISE EXCEPTION 'Ungültiger Status.'; END IF;
  UPDATE public.training_plans SET status = p_status WHERE id = p_plan;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan nicht gefunden.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_duplicate_plan(p_plan uuid, p_code text, p_title text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_leitung(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF EXISTS (SELECT 1 FROM public.training_plans WHERE code = btrim(coalesce(p_code, ''))) THEN RAISE EXCEPTION 'Diesen Plan-Code gibt es schon.'; END IF;
  v := public.export_plan_json(p_plan);
  v := jsonb_set(v, '{plan}', (v -> 'plan') || jsonb_build_object('code', btrim(coalesce(p_code, '')), 'title', btrim(coalesce(p_title, '')), 'status', 'draft'));
  RETURN public.admin_save_plan(v);
END $$;

CREATE OR REPLACE FUNCTION public.admin_plan_item_usage(p_plan uuid)
RETURNS TABLE (item_key text, used boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_leitung(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  RETURN QUERY SELECT i.key, (EXISTS (SELECT 1 FROM public.plan_progress pp WHERE pp.item_id = i.id)
                            OR EXISTS (SELECT 1 FROM public.report_plan_items r WHERE r.item_id = i.id))
    FROM public.plan_items i WHERE i.plan_id = p_plan;
END $$;

REVOKE ALL ON FUNCTION public.resolve_plan(uuid), public.list_selectable_plans(uuid), public.set_azubi_plan(uuid, uuid),
  public.admin_save_plan(jsonb), public.admin_set_plan_status(uuid, text), public.admin_duplicate_plan(uuid, text, text),
  public.export_plan_json(uuid), public.admin_plan_item_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_plan(uuid), public.list_selectable_plans(uuid), public.set_azubi_plan(uuid, uuid),
  public.admin_save_plan(jsonb), public.admin_set_plan_status(uuid, text), public.admin_duplicate_plan(uuid, text, text),
  public.export_plan_json(uuid), public.admin_plan_item_usage(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.plan_items_set_plan(), public.plan_progress_guard(), public.plan_progress_cleanup(), public.report_links_limit() FROM PUBLIC, anon, authenticated;
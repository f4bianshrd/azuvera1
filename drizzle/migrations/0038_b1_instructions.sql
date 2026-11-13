-- Daten-Prompt B1: Unterweisungen – Kataloge, Nachweise, Fälligkeit, Funktionen

-- 1 Tabellen
CREATE TABLE public.instruction_catalogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (char_length(code) BETWEEN 1 AND 100),
  profession_id uuid REFERENCES public.professions(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  subtitle text CHECK (char_length(subtitle) <= 300),
  source text CHECK (char_length(source) <= 2000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instruction_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id uuid NOT NULL REFERENCES public.instruction_catalogs(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 100),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  category text NOT NULL CHECK (char_length(category) BETWEEN 1 AND 80),
  legal_basis text CHECK (char_length(legal_basis) <= 300),
  interval_months int CHECK (interval_months BETWEEN 1 AND 36),
  when_text text CHECK (char_length(when_text) <= 200),
  hint text CHECK (char_length(hint) <= 600),
  is_optional boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (catalog_id, key)
);

CREATE TABLE public.instruction_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.instruction_topics(id) ON DELETE CASCADE,
  catalog_id uuid NOT NULL REFERENCES public.instruction_catalogs(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 100),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 600),
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (catalog_id, key)
);
CREATE INDEX instruction_points_topic_idx ON public.instruction_points(topic_id);

CREATE TABLE public.instruction_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  azubi_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES public.instruction_topics(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  given_on date,
  duration_minutes int CHECK (duration_minutes BETWEEN 5 AND 480),
  instructor_name text CHECK (char_length(btrim(instructor_name)) BETWEEN 1 AND 120),
  notes text CHECK (char_length(notes) <= 2000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'confirmed', 'rejected')),
  version int NOT NULL DEFAULT 0,
  content_hash text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_note text CHECK (char_length(review_note) <= 500),
  confirmed_by_name text,
  confirmed_role_label text,
  on_behalf_of uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX instruction_records_azubi_idx ON public.instruction_records(azubi_id, given_on);
CREATE INDEX instruction_records_topic_idx ON public.instruction_records(topic_id);
CREATE INDEX instruction_records_submitted_idx ON public.instruction_records(submitted_at) WHERE status = 'submitted';

CREATE TABLE public.instruction_record_points (
  record_id uuid NOT NULL REFERENCES public.instruction_records(id) ON DELETE CASCADE,
  point_id uuid NOT NULL REFERENCES public.instruction_points(id) ON DELETE CASCADE,
  PRIMARY KEY (record_id, point_id)
);
CREATE INDEX instruction_record_points_point_idx ON public.instruction_record_points(point_id);

GRANT SELECT ON public.instruction_catalogs, public.instruction_topics, public.instruction_points TO authenticated;
GRANT SELECT, DELETE ON public.instruction_records TO authenticated;
GRANT INSERT (id, azubi_id, topic_id, title, given_on, duration_minutes, instructor_name, notes) ON public.instruction_records TO authenticated;
GRANT UPDATE (topic_id, title, given_on, duration_minutes, instructor_name, notes) ON public.instruction_records TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.instruction_record_points TO authenticated;
GRANT ALL ON public.instruction_catalogs, public.instruction_topics, public.instruction_points,
  public.instruction_records, public.instruction_record_points TO service_role;

ALTER TABLE public.instruction_catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instruction_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instruction_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instruction_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instruction_record_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY instruction_catalogs_select ON public.instruction_catalogs FOR SELECT TO authenticated
  USING (status = 'published' OR public.is_leitung(auth.uid()));
CREATE POLICY instruction_topics_select ON public.instruction_topics FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.instruction_catalogs c WHERE c.id = catalog_id));
CREATE POLICY instruction_points_select ON public.instruction_points FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.instruction_catalogs c WHERE c.id = catalog_id));

CREATE POLICY instruction_records_select ON public.instruction_records FOR SELECT TO authenticated
  USING (azubi_id = auth.uid() OR (status <> 'draft' AND public.can_view_azubi(auth.uid(), azubi_id)));
CREATE POLICY instruction_records_insert ON public.instruction_records FOR INSERT TO authenticated
  WITH CHECK (azubi_id = auth.uid() AND public.has_role(auth.uid(), 'azubi') AND status = 'draft' AND version = 0);
CREATE POLICY instruction_records_update ON public.instruction_records FOR UPDATE TO authenticated
  USING (azubi_id = auth.uid() AND status IN ('draft', 'rejected'))
  WITH CHECK (azubi_id = auth.uid() AND status IN ('draft', 'rejected'));
CREATE POLICY instruction_records_delete ON public.instruction_records FOR DELETE TO authenticated
  USING (azubi_id = auth.uid() AND status = 'draft');

CREATE POLICY instruction_record_points_select ON public.instruction_record_points FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.instruction_records r WHERE r.id = record_id));
CREATE POLICY instruction_record_points_insert ON public.instruction_record_points FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.instruction_records r WHERE r.id = record_id AND r.azubi_id = auth.uid() AND r.status IN ('draft', 'rejected')));
CREATE POLICY instruction_record_points_delete ON public.instruction_record_points FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.instruction_records r WHERE r.id = record_id AND r.azubi_id = auth.uid() AND r.status IN ('draft', 'rejected')));

-- Trigger
CREATE TRIGGER instruction_catalogs_updated_at BEFORE UPDATE ON public.instruction_catalogs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE FUNCTION public.instruction_points_set_catalog()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT t.catalog_id INTO NEW.catalog_id FROM public.instruction_topics t WHERE t.id = NEW.topic_id;
  IF NEW.catalog_id IS NULL THEN RAISE EXCEPTION 'Thema nicht gefunden.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER instruction_points_00_set_catalog BEFORE INSERT OR UPDATE OF topic_id ON public.instruction_points
  FOR EACH ROW EXECUTE FUNCTION public.instruction_points_set_catalog();

CREATE FUNCTION public.instruction_records_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  act text := coalesce(current_setting('app.instruction_action', true), '');
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'confirmed' AND NOT public.account_removal_active() THEN
      RAISE EXCEPTION 'Bestätigte Unterweisungen können nicht gelöscht werden.';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF act = '' AND (NEW.status <> 'draft' OR NEW.version <> 0 OR NEW.content_hash IS NOT NULL OR NEW.submitted_at IS NOT NULL
      OR NEW.reviewed_at IS NOT NULL OR NEW.reviewer_id IS NOT NULL OR NEW.review_note IS NOT NULL
      OR NEW.confirmed_by_name IS NOT NULL OR NEW.confirmed_role_label IS NOT NULL OR NEW.on_behalf_of IS NOT NULL) THEN
      RAISE EXCEPTION 'Status und Prüffelder können nur vom System gesetzt werden.';
    END IF;
    IF NEW.topic_id IS NOT NULL AND btrim(coalesce(NEW.title, '')) = '' THEN
      SELECT t.title INTO NEW.title FROM public.instruction_topics t WHERE t.id = NEW.topic_id;
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'confirmed' AND act <> 'reopen' AND NOT public.account_removal_active() THEN
    -- Nur das automatische Leeren von Verweisen (gelöschtes Thema oder Konto) ist erlaubt.
    IF (to_jsonb(NEW) - 'topic_id' - 'reviewer_id' - 'updated_at') = (to_jsonb(OLD) - 'topic_id' - 'reviewer_id' - 'updated_at')
      AND (NEW.topic_id IS NULL OR NEW.topic_id = OLD.topic_id)
      AND (NEW.reviewer_id IS NULL OR NEW.reviewer_id = OLD.reviewer_id) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Bestätigte Unterweisungen sind unveränderlich.';
  END IF;
  IF act = '' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.content_hash IS DISTINCT FROM OLD.content_hash OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
    OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR (NEW.reviewer_id IS NOT NULL AND NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id)
    OR NEW.review_note IS DISTINCT FROM OLD.review_note OR NEW.confirmed_by_name IS DISTINCT FROM OLD.confirmed_by_name
    OR NEW.confirmed_role_label IS DISTINCT FROM OLD.confirmed_role_label OR NEW.on_behalf_of IS DISTINCT FROM OLD.on_behalf_of
    OR NEW.azubi_id IS DISTINCT FROM OLD.azubi_id) THEN
    RAISE EXCEPTION 'Status und Prüffelder können nur vom System geändert werden.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER instruction_records_a_guard BEFORE INSERT OR UPDATE OR DELETE ON public.instruction_records
  FOR EACH ROW EXECUTE FUNCTION public.instruction_records_guard();
CREATE TRIGGER instruction_records_z_updated_at BEFORE UPDATE ON public.instruction_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE FUNCTION public.instruction_records_topic_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.topic_id IS DISTINCT FROM OLD.topic_id AND NEW.status IN ('draft', 'rejected') THEN
    DELETE FROM public.instruction_record_points rp
     WHERE rp.record_id = NEW.id
       AND NOT EXISTS (SELECT 1 FROM public.instruction_points p WHERE p.id = rp.point_id AND p.topic_id = NEW.topic_id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER instruction_records_topic_changed AFTER UPDATE OF topic_id ON public.instruction_records
  FOR EACH ROW EXECUTE FUNCTION public.instruction_records_topic_changed();

CREATE FUNCTION public.instruction_record_points_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_topic uuid;
BEGIN
  SELECT r.topic_id INTO v_topic FROM public.instruction_records r WHERE r.id = NEW.record_id;
  IF v_topic IS NULL OR NOT EXISTS (SELECT 1 FROM public.instruction_points p WHERE p.id = NEW.point_id AND p.topic_id = v_topic) THEN
    RAISE EXCEPTION 'Dieser Inhaltspunkt gehört nicht zum Thema des Nachweises.';
  END IF;
  IF (SELECT count(*) FROM public.instruction_record_points rp WHERE rp.record_id = NEW.record_id) >= 40 THEN
    RAISE EXCEPTION 'Je Nachweis sind höchstens 40 Inhaltspunkte möglich.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER instruction_record_points_guard BEFORE INSERT ON public.instruction_record_points
  FOR EACH ROW EXECUTE FUNCTION public.instruction_record_points_guard();

-- 2/3 Fälligkeit (Vorlauf fest 14 Tage, wie src/features/instructions/due.ts)
CREATE FUNCTION public.instruction_overview_core(p_azubi uuid, p_as_of date)
RETURNS TABLE(topic_id uuid, catalog_id uuid, is_optional boolean, effective_months int, last_record_id uuid,
  last_given_on date, last_confirmed boolean, due_on date, state text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT p.profession_id, p.geburtsdatum FROM public.profiles p WHERE p.id = p_azubi
  ), cats AS (
    SELECT c.id, c.sort_order FROM public.instruction_catalogs c, me
     WHERE c.status = 'published' AND (c.profession_id IS NULL OR c.profession_id = me.profession_id)
  ), last AS (
    SELECT DISTINCT ON (r.topic_id) r.topic_id, r.id, r.given_on, r.status
      FROM public.instruction_records r
     WHERE r.azubi_id = p_azubi AND r.status IN ('submitted', 'confirmed') AND r.topic_id IS NOT NULL AND r.given_on IS NOT NULL
     ORDER BY r.topic_id, r.given_on DESC, (r.status = 'confirmed') DESC, r.submitted_at DESC NULLS LAST
  ), calc AS (
    SELECT t.id AS tid, t.catalog_id AS cid, t.is_optional AS opt, cats.sort_order AS csort, t.sort_order AS tsort,
      l.id AS rid, l.given_on AS gon, l.status AS lstatus,
      CASE WHEN t.interval_months IS NULL THEN NULL
           WHEN me.geburtsdatum IS NOT NULL AND age(coalesce(l.given_on, p_as_of), me.geburtsdatum) < interval '18 years'
             THEN least(t.interval_months, 6)
           ELSE t.interval_months END AS eff
      FROM public.instruction_topics t
      JOIN cats ON cats.id = t.catalog_id
      CROSS JOIN me
      LEFT JOIN last l ON l.topic_id = t.id
     WHERE t.is_active OR l.id IS NOT NULL
  )
  SELECT c.tid, c.cid, c.opt, c.eff, c.rid, c.gon, coalesce(c.lstatus = 'confirmed', false), d.due,
    CASE WHEN c.rid IS NULL THEN CASE WHEN c.opt THEN 'optional' ELSE 'open' END
         WHEN d.due IS NULL OR d.due > p_as_of + 14 THEN 'valid'
         WHEN d.due < p_as_of THEN 'overdue'
         ELSE 'due_soon' END
    FROM calc c
    CROSS JOIN LATERAL (SELECT CASE WHEN c.rid IS NOT NULL AND c.eff IS NOT NULL
      THEN (c.gon + make_interval(months => c.eff))::date END AS due) d
   ORDER BY c.csort, c.tsort
$$;

CREATE FUNCTION public.resolve_instruction_catalogs(p_azubi uuid)
RETURNS TABLE(id uuid, code text, profession_id uuid, title text, subtitle text, source text, sort_order int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_view_azubi(auth.uid(), p_azubi) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  RETURN QUERY
    SELECT c.id, c.code, c.profession_id, c.title, c.subtitle, c.source, c.sort_order
      FROM public.instruction_catalogs c
     WHERE c.status = 'published'
       AND (c.profession_id IS NULL OR c.profession_id = (SELECT p.profession_id FROM public.profiles p WHERE p.id = p_azubi))
     ORDER BY c.sort_order, c.title;
END $$;

CREATE FUNCTION public.instruction_overview(p_azubi uuid, p_as_of date DEFAULT ((now() AT TIME ZONE 'Europe/Berlin'))::date)
RETURNS TABLE(topic_id uuid, catalog_id uuid, is_optional boolean, effective_months int, last_record_id uuid,
  last_given_on date, last_confirmed boolean, due_on date, state text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_view_azubi(auth.uid(), p_azubi) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  RETURN QUERY SELECT * FROM public.instruction_overview_core(p_azubi, coalesce(p_as_of, (now() AT TIME ZONE 'Europe/Berlin')::date));
END $$;

CREATE FUNCTION public.instruction_hash(p_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT encode(extensions.digest(
    coalesce(r.azubi_id::text, '') || E'\n' || coalesce(r.title, '') || E'\n' || coalesce(r.given_on::text, '') || E'\n' ||
    coalesce(r.duration_minutes::text, '') || E'\n' || coalesce(r.instructor_name, '') || E'\n' || coalesce(r.notes, '') || E'\n' ||
    r.version::text || E'\n' ||
    coalesce((SELECT string_agg(p.key, E'\n' ORDER BY p.key) FROM public.instruction_record_points rp
               JOIN public.instruction_points p ON p.id = rp.point_id WHERE rp.record_id = r.id), ''),
    'sha256'), 'hex')
  FROM public.instruction_records r WHERE r.id = p_id
$$;

CREATE FUNCTION public.instruction_role_label(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE ur.role WHEN 'ausbilder' THEN 'Ausbilder:in' WHEN 'betriebsleiter' THEN 'Betriebsleiter:in'
    WHEN 'ausbildungsleitung' THEN 'Ausbildungsleitung' WHEN 'ausbildungsberater' THEN 'Ausbildungsberater:in'
    WHEN 'lehrer' THEN 'Lehrkraft' ELSE 'Prüfende Person' END
  FROM public.user_roles ur WHERE ur.user_id = p_user
$$;

CREATE FUNCTION public.submit_instruction(p_id uuid, p_expected_version int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.instruction_records%ROWTYPE; v_hash text; rec record;
BEGIN
  SELECT * INTO r FROM public.instruction_records WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nachweis nicht gefunden.'; END IF;
  IF auth.uid() IS NULL OR r.azubi_id <> auth.uid() THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF r.status NOT IN ('draft', 'rejected') THEN RAISE EXCEPTION 'Nur Entwürfe oder zurückgewiesene Nachweise können eingereicht werden.'; END IF;
  IF r.version <> p_expected_version THEN RAISE EXCEPTION 'Der Nachweis wurde inzwischen geändert.'; END IF;
  IF btrim(coalesce(r.title, '')) = '' OR r.given_on IS NULL OR btrim(coalesce(r.instructor_name, '')) = '' THEN
    RAISE EXCEPTION 'Bitte fülle alle Pflichtfelder aus.';
  END IF;
  IF r.given_on > (now() AT TIME ZONE 'Europe/Berlin')::date THEN RAISE EXCEPTION 'Das Datum darf nicht in der Zukunft liegen.'; END IF;
  PERFORM set_config('app.instruction_action', 'submit', true);
  UPDATE public.instruction_records SET version = version + 1, status = 'submitted', submitted_at = now(), review_note = NULL WHERE id = p_id;
  v_hash := public.instruction_hash(p_id);
  UPDATE public.instruction_records SET content_hash = v_hash WHERE id = p_id;
  PERFORM set_config('app.instruction_action', '', true);
  FOR rec IN SELECT * FROM public.notification_recipients(r.azubi_id) LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
    VALUES (rec.user_id, 'instruction_submitted', 'Neue Unterweisung zur Bestätigung', left(btrim(r.title), 80),
      '/unterweisungen?azubi=' || r.azubi_id || '&nachweis=' || p_id, 'instruction', p_id);
  END LOOP;
  PERFORM public.write_audit('instruction', p_id, 'instruction_submit', r.azubi_id,
    jsonb_build_object('version', r.version + 1, 'content_hash', v_hash));
END $$;

CREATE FUNCTION public.confirm_instruction(p_id uuid, p_expected_version int, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.instruction_records%ROWTYPE; v_behalf uuid; v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  SELECT * INTO r FROM public.instruction_records WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nachweis nicht gefunden.'; END IF;
  IF auth.uid() IS NULL OR auth.uid() = r.azubi_id OR NOT public.can_review_for(auth.uid(), r.azubi_id) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF r.status <> 'submitted' THEN RAISE EXCEPTION 'Der Nachweis ist nicht mehr zur Bestätigung vorgesehen.'; END IF;
  IF r.version <> p_expected_version THEN RAISE EXCEPTION 'Der Nachweis wurde inzwischen geändert.'; END IF;
  IF r.content_hash IS DISTINCT FROM public.instruction_hash(p_id) THEN RAISE EXCEPTION 'Die Prüfsumme des Nachweises stimmt nicht.'; END IF;
  IF char_length(coalesce(v_note, '')) > 500 THEN RAISE EXCEPTION 'Die Notiz darf höchstens 500 Zeichen lang sein.'; END IF;
  v_behalf := public.acting_principal(auth.uid(), r.azubi_id);
  PERFORM set_config('app.instruction_action', 'confirm', true);
  UPDATE public.instruction_records SET status = 'confirmed', reviewer_id = auth.uid(), reviewed_at = now(),
    confirmed_by_name = (SELECT full_name FROM public.profiles WHERE id = auth.uid()),
    confirmed_role_label = public.instruction_role_label(auth.uid()), on_behalf_of = v_behalf, review_note = v_note
   WHERE id = p_id;
  PERFORM set_config('app.instruction_action', '', true);
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (r.azubi_id, 'instruction_confirmed', 'Unterweisung bestätigt', left(btrim(r.title), 80), '/unterweisungen?nachweis=' || p_id, 'instruction', p_id);
  PERFORM public.write_audit('instruction', p_id, 'instruction_confirm', r.azubi_id,
    jsonb_build_object('version', r.version, 'content_hash', r.content_hash, 'on_behalf_of', v_behalf));
END $$;

CREATE FUNCTION public.reject_instruction(p_id uuid, p_expected_version int, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.instruction_records%ROWTYPE; v_note text := btrim(coalesce(p_note, ''));
BEGIN
  SELECT * INTO r FROM public.instruction_records WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nachweis nicht gefunden.'; END IF;
  IF auth.uid() IS NULL OR auth.uid() = r.azubi_id OR NOT public.can_review_for(auth.uid(), r.azubi_id) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF r.status <> 'submitted' THEN RAISE EXCEPTION 'Der Nachweis ist nicht mehr zur Bestätigung vorgesehen.'; END IF;
  IF r.version <> p_expected_version THEN RAISE EXCEPTION 'Der Nachweis wurde inzwischen geändert.'; END IF;
  IF char_length(v_note) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Bitte gib eine Begründung an (mindestens 3 Zeichen).'; END IF;
  PERFORM set_config('app.instruction_action', 'reject', true);
  UPDATE public.instruction_records SET status = 'rejected', reviewer_id = auth.uid(), reviewed_at = now(), review_note = v_note WHERE id = p_id;
  PERFORM set_config('app.instruction_action', '', true);
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (r.azubi_id, 'instruction_rejected', 'Unterweisung zurückgewiesen', left(btrim(r.title), 80), '/unterweisungen?nachweis=' || p_id, 'instruction', p_id);
  PERFORM public.write_audit('instruction', p_id, 'instruction_reject', r.azubi_id, jsonb_build_object('version', r.version));
END $$;

CREATE FUNCTION public.reopen_instruction(p_id uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.instruction_records%ROWTYPE; v_note text := btrim(coalesce(p_note, ''));
BEGIN
  SELECT * INTO r FROM public.instruction_records WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nachweis nicht gefunden.'; END IF;
  IF auth.uid() IS NULL OR auth.uid() = r.azubi_id OR NOT public.can_review_for(auth.uid(), r.azubi_id) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF r.status <> 'confirmed' THEN RAISE EXCEPTION 'Nur bestätigte Nachweise können wieder geöffnet werden.'; END IF;
  IF char_length(v_note) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Bitte gib eine Begründung an (mindestens 3 Zeichen).'; END IF;
  PERFORM set_config('app.instruction_action', 'reopen', true);
  UPDATE public.instruction_records SET status = 'rejected', review_note = v_note, reviewer_id = auth.uid(), reviewed_at = now(),
    confirmed_by_name = NULL, confirmed_role_label = NULL, on_behalf_of = NULL WHERE id = p_id;
  PERFORM set_config('app.instruction_action', '', true);
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (r.azubi_id, 'instruction_rejected', 'Unterweisung zurückgewiesen', left(btrim(r.title), 80), '/unterweisungen?nachweis=' || p_id, 'instruction', p_id);
  PERFORM public.write_audit('instruction', p_id, 'instruction_reopen', r.azubi_id, jsonb_build_object('version', r.version));
END $$;

CREATE FUNCTION public.instruction_pending()
RETURNS TABLE(record_id uuid, azubi_id uuid, azubi_name text, title text, given_on date, submitted_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.azubi_id, p.full_name, r.title, r.given_on, r.submitted_at
    FROM public.instruction_records r
    LEFT JOIN public.profiles p ON p.id = r.azubi_id
   WHERE r.status = 'submitted' AND auth.uid() IS NOT NULL AND auth.uid() <> r.azubi_id
     AND public.can_review_for(auth.uid(), r.azubi_id)
   ORDER BY r.submitted_at ASC NULLS LAST
$$;

CREATE FUNCTION public.log_instruction_export(p_azubi uuid, p_count int, p_from date, p_to date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_view_azubi(auth.uid(), p_azubi) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF p_count IS NULL OR p_count < 0 THEN RAISE EXCEPTION 'Ungültiger Export.'; END IF;
  PERFORM public.write_audit('export', NULL, 'pdf_export_instructions', p_azubi,
    jsonb_build_object('count', p_count, 'from', p_from, 'to', p_to));
END $$;

-- Katalog-Verwaltung (nur Ausbildungsleitung)
CREATE FUNCTION public.admin_save_instruction_catalog(p_catalog jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c jsonb; t jsonb; pt jsonb; ti int; pi int;
  v_cat uuid; v_prof uuid; v_topic uuid; v_code text; v_status text; v_int text;
  v_topic_keys text[] := '{}'; v_point_keys text[] := '{}'; t_key text; p_key text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_leitung(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF p_catalog IS NULL OR jsonb_typeof(p_catalog) <> 'object' THEN RAISE EXCEPTION 'Die Datei hat kein gültiges Format.'; END IF;
  c := p_catalog -> 'catalog';
  IF c IS NULL OR jsonb_typeof(c) <> 'object' THEN RAISE EXCEPTION 'Der Abschnitt „catalog“ fehlt.'; END IF;
  IF jsonb_typeof(coalesce(p_catalog -> 'topics', 'null'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Die Liste „topics“ fehlt.'; END IF;
  v_code := btrim(coalesce(c ->> 'code', ''));
  IF char_length(v_code) NOT BETWEEN 1 AND 100 OR v_code !~ '^[A-Za-z0-9._-]+$' THEN
    RAISE EXCEPTION 'Der Katalog-Code muss 1 bis 100 Zeichen lang sein (Buchstaben, Ziffern, Punkt, Binde- oder Unterstrich).';
  END IF;
  IF btrim(coalesce(c ->> 'profession_code', '')) <> '' THEN
    SELECT id INTO v_prof FROM public.professions WHERE code = btrim(c ->> 'profession_code');
    IF v_prof IS NULL THEN RAISE EXCEPTION 'Unbekannter Beruf: „%“.', c ->> 'profession_code'; END IF;
  END IF;
  IF char_length(btrim(coalesce(c ->> 'title', ''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Der Katalogtitel muss 1 bis 200 Zeichen lang sein.'; END IF;
  IF char_length(coalesce(c ->> 'subtitle', '')) > 300 THEN RAISE EXCEPTION 'Der Untertitel darf höchstens 300 Zeichen lang sein.'; END IF;
  IF char_length(coalesce(c ->> 'source', '')) > 2000 THEN RAISE EXCEPTION 'Die Quelle darf höchstens 2000 Zeichen lang sein.'; END IF;
  v_status := coalesce(nullif(c ->> 'status', ''), 'draft');
  IF v_status NOT IN ('draft', 'published') THEN RAISE EXCEPTION 'Der Status muss „draft“ oder „published“ sein.'; END IF;

  FOR t, ti IN SELECT e, o FROM jsonb_array_elements(p_catalog -> 'topics') WITH ORDINALITY AS x(e, o) LOOP
    IF jsonb_typeof(t) <> 'object' THEN RAISE EXCEPTION 'Thema % hat kein gültiges Format.', ti; END IF;
    t_key := btrim(coalesce(t ->> 'key', ''));
    IF char_length(t_key) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Thema %: Der Schlüssel muss 1 bis 100 Zeichen lang sein.', ti; END IF;
    IF t_key = ANY (v_topic_keys) THEN RAISE EXCEPTION 'Doppelter Themen-Schlüssel: „%“.', t_key; END IF;
    v_topic_keys := v_topic_keys || t_key;
    IF char_length(btrim(coalesce(t ->> 'title', ''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Thema „%“: Der Titel muss 1 bis 200 Zeichen lang sein.', t_key; END IF;
    IF char_length(btrim(coalesce(t ->> 'category', ''))) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Thema „%“: Die Kategorie muss 1 bis 80 Zeichen lang sein.', t_key; END IF;
    IF char_length(coalesce(t ->> 'legal_basis', '')) > 300 THEN RAISE EXCEPTION 'Thema „%“: Die Rechtsgrundlage darf höchstens 300 Zeichen lang sein.', t_key; END IF;
    IF char_length(coalesce(t ->> 'when_text', '')) > 200 THEN RAISE EXCEPTION 'Thema „%“: Der Zeitpunkt darf höchstens 200 Zeichen lang sein.', t_key; END IF;
    IF char_length(coalesce(t ->> 'hint', '')) > 600 THEN RAISE EXCEPTION 'Thema „%“: Der Hinweis darf höchstens 600 Zeichen lang sein.', t_key; END IF;
    v_int := nullif(btrim(coalesce(t ->> 'interval_months', '')), '');
    IF v_int IS NOT NULL AND (v_int !~ '^[0-9]{1,2}$' OR v_int::int NOT BETWEEN 1 AND 36) THEN
      RAISE EXCEPTION 'Thema „%“: Das Intervall muss 1 bis 36 Monate betragen oder leer sein.', t_key;
    END IF;
    IF coalesce(t ->> 'is_optional', 'false') NOT IN ('true', 'false') THEN RAISE EXCEPTION 'Thema „%“: „is_optional“ muss true oder false sein.', t_key; END IF;
    IF jsonb_typeof(coalesce(t -> 'points', '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Thema „%“: „points“ muss eine Liste sein.', t_key; END IF;
    FOR pt, pi IN SELECT e, o FROM jsonb_array_elements(coalesce(t -> 'points', '[]'::jsonb)) WITH ORDINALITY AS x(e, o) LOOP
      IF jsonb_typeof(pt) <> 'object' THEN RAISE EXCEPTION 'Thema „%“, Punkt %: ungültiges Format.', t_key, pi; END IF;
      p_key := btrim(coalesce(pt ->> 'key', ''));
      IF char_length(p_key) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Thema „%“, Punkt %: Der Schlüssel muss 1 bis 100 Zeichen lang sein.', t_key, pi; END IF;
      IF p_key = ANY (v_point_keys) THEN RAISE EXCEPTION 'Doppelter Punkt-Schlüssel: „%“.', p_key; END IF;
      v_point_keys := v_point_keys || p_key;
      IF char_length(btrim(coalesce(pt ->> 'label', ''))) NOT BETWEEN 1 AND 600 THEN RAISE EXCEPTION 'Punkt „%“: Der Text muss 1 bis 600 Zeichen lang sein.', p_key; END IF;
    END LOOP;
  END LOOP;

  INSERT INTO public.instruction_catalogs (code, profession_id, title, subtitle, source, status)
  VALUES (v_code, v_prof, btrim(c ->> 'title'), nullif(c ->> 'subtitle', ''), nullif(c ->> 'source', ''), v_status)
  ON CONFLICT (code) DO UPDATE SET profession_id = EXCLUDED.profession_id, title = EXCLUDED.title,
    subtitle = EXCLUDED.subtitle, source = EXCLUDED.source, status = EXCLUDED.status
  RETURNING id INTO v_cat;

  FOR t, ti IN SELECT e, o FROM jsonb_array_elements(p_catalog -> 'topics') WITH ORDINALITY AS x(e, o) LOOP
    INSERT INTO public.instruction_topics (catalog_id, key, title, category, legal_basis, interval_months, when_text, hint, is_optional, is_active, sort_order)
    VALUES (v_cat, btrim(t ->> 'key'), btrim(t ->> 'title'), btrim(t ->> 'category'), nullif(t ->> 'legal_basis', ''),
      nullif(btrim(coalesce(t ->> 'interval_months', '')), '')::int, nullif(t ->> 'when_text', ''), nullif(t ->> 'hint', ''),
      coalesce((t ->> 'is_optional')::boolean, false), true, ti)
    ON CONFLICT (catalog_id, key) DO UPDATE SET title = EXCLUDED.title, category = EXCLUDED.category,
      legal_basis = EXCLUDED.legal_basis, interval_months = EXCLUDED.interval_months, when_text = EXCLUDED.when_text,
      hint = EXCLUDED.hint, is_optional = EXCLUDED.is_optional, is_active = true, sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_topic;
    FOR pt, pi IN SELECT e, o FROM jsonb_array_elements(coalesce(t -> 'points', '[]'::jsonb)) WITH ORDINALITY AS x(e, o) LOOP
      INSERT INTO public.instruction_points (topic_id, catalog_id, key, label, is_active, sort_order)
      VALUES (v_topic, v_cat, btrim(pt ->> 'key'), btrim(pt ->> 'label'), true, pi)
      ON CONFLICT (catalog_id, key) DO UPDATE SET topic_id = EXCLUDED.topic_id, label = EXCLUDED.label,
        is_active = true, sort_order = EXCLUDED.sort_order;
    END LOOP;
  END LOOP;

  UPDATE public.instruction_points p SET is_active = false
   WHERE p.catalog_id = v_cat AND NOT (p.key = ANY (v_point_keys)) AND p.is_active
     AND EXISTS (SELECT 1 FROM public.instruction_record_points rp WHERE rp.point_id = p.id);
  DELETE FROM public.instruction_points p
   WHERE p.catalog_id = v_cat AND NOT (p.key = ANY (v_point_keys))
     AND NOT EXISTS (SELECT 1 FROM public.instruction_record_points rp WHERE rp.point_id = p.id);
  UPDATE public.instruction_topics t SET is_active = false
   WHERE t.catalog_id = v_cat AND NOT (t.key = ANY (v_topic_keys)) AND t.is_active
     AND (EXISTS (SELECT 1 FROM public.instruction_records r WHERE r.topic_id = t.id)
       OR EXISTS (SELECT 1 FROM public.instruction_points p WHERE p.topic_id = t.id));
  DELETE FROM public.instruction_topics t
   WHERE t.catalog_id = v_cat AND NOT (t.key = ANY (v_topic_keys))
     AND NOT EXISTS (SELECT 1 FROM public.instruction_records r WHERE r.topic_id = t.id)
     AND NOT EXISTS (SELECT 1 FROM public.instruction_points p WHERE p.topic_id = t.id);

  PERFORM public.write_audit('catalog', v_cat, 'catalog_saved', NULL, jsonb_build_object('code', v_code));
  RETURN v_cat;
END $$;

CREATE FUNCTION public.admin_set_catalog_status(p_catalog uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_leitung(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF p_status NOT IN ('draft', 'published') THEN RAISE EXCEPTION 'Ungültiger Status.'; END IF;
  UPDATE public.instruction_catalogs SET status = p_status WHERE id = p_catalog;
  IF NOT FOUND THEN RAISE EXCEPTION 'Katalog nicht gefunden.'; END IF;
END $$;

CREATE FUNCTION public.admin_duplicate_catalog(p_catalog uuid, p_code text, p_title text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_new uuid; t record; v_topic uuid; v_code text := btrim(coalesce(p_code, '')); v_title text := btrim(coalesce(p_title, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_leitung(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF char_length(v_code) NOT BETWEEN 1 AND 100 OR v_code !~ '^[A-Za-z0-9._-]+$' THEN
    RAISE EXCEPTION 'Der Katalog-Code muss 1 bis 100 Zeichen lang sein (Buchstaben, Ziffern, Punkt, Binde- oder Unterstrich).';
  END IF;
  IF char_length(v_title) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Der Katalogtitel muss 1 bis 200 Zeichen lang sein.'; END IF;
  IF EXISTS (SELECT 1 FROM public.instruction_catalogs WHERE code = v_code) THEN RAISE EXCEPTION 'Dieser Code ist schon vergeben.'; END IF;
  INSERT INTO public.instruction_catalogs (code, profession_id, title, subtitle, source, status, sort_order)
  SELECT v_code, profession_id, v_title, subtitle, source, 'draft', sort_order FROM public.instruction_catalogs WHERE id = p_catalog
  RETURNING id INTO v_new;
  IF v_new IS NULL THEN RAISE EXCEPTION 'Katalog nicht gefunden.'; END IF;
  FOR t IN SELECT * FROM public.instruction_topics WHERE catalog_id = p_catalog ORDER BY sort_order LOOP
    INSERT INTO public.instruction_topics (catalog_id, key, title, category, legal_basis, interval_months, when_text, hint, is_optional, is_active, sort_order)
    VALUES (v_new, t.key, t.title, t.category, t.legal_basis, t.interval_months, t.when_text, t.hint, t.is_optional, t.is_active, t.sort_order)
    RETURNING id INTO v_topic;
    INSERT INTO public.instruction_points (topic_id, catalog_id, key, label, is_active, sort_order)
    SELECT v_topic, v_new, p.key, p.label, p.is_active, p.sort_order FROM public.instruction_points p WHERE p.topic_id = t.id;
  END LOOP;
  RETURN v_new;
END $$;

CREATE FUNCTION public.export_catalog_json(p_catalog uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_leitung(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  SELECT jsonb_build_object(
    'catalog', jsonb_build_object('code', c.code, 'profession_code', coalesce(pr.code, ''), 'title', c.title,
      'subtitle', coalesce(c.subtitle, ''), 'source', coalesce(c.source, ''), 'status', c.status),
    'topics', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'key', t.key, 'title', t.title, 'category', t.category, 'legal_basis', coalesce(t.legal_basis, ''),
        'interval_months', t.interval_months, 'when_text', coalesce(t.when_text, ''), 'hint', coalesce(t.hint, ''),
        'is_optional', t.is_optional,
        'points', coalesce((SELECT jsonb_agg(jsonb_build_object('key', p.key, 'label', p.label) ORDER BY p.sort_order)
                   FROM public.instruction_points p WHERE p.topic_id = t.id AND p.is_active), '[]'::jsonb))
      ORDER BY t.sort_order) FROM public.instruction_topics t WHERE t.catalog_id = c.id AND t.is_active), '[]'::jsonb))
  INTO v
  FROM public.instruction_catalogs c LEFT JOIN public.professions pr ON pr.id = c.profession_id
  WHERE c.id = p_catalog;
  IF v IS NULL THEN RAISE EXCEPTION 'Katalog nicht gefunden.'; END IF;
  RETURN v;
END $$;

-- 4 Benachrichtigungsgruppen
CREATE OR REPLACE FUNCTION public.notification_group(_type text)
RETURNS text LANGUAGE sql IMMUTABLE AS $function$
  select case
    when _type in ('report_submitted','report_approved','report_rejected','report_reopened','comment',
                   'instruction_submitted','instruction_confirmed','instruction_rejected') then 'reports'
    when _type in ('absence_requested','absence_approved','absence_rejected') then 'absences'
    when _type in ('report_reminder','deadline_soon','deadline_today','deadline_overdue','review_pending','daily_nudge','instruction_due') then 'reminders'
    when _type in ('deputy_assigned','deputy_ended') then 'deputy'
    else null end
$function$;

-- 5 Erinnerungen: Regel 6
CREATE OR REPLACE FUNCTION public.default_reminder_rules()
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $function$ SELECT '{"enabled":true,"deadline_weekday":1,"deadline_time":"12:00","soon_enabled":true,"soon_weekday":5,"soon_time":"14:00","today_enabled":true,"today_time":"08:00","overdue_enabled":true,"overdue_time":"08:00","overdue_every_days":3,"overdue_max":3,"review_enabled":true,"review_weekdays":[1,4],"review_time":"08:00","review_after_days":7,"instruction_enabled":true,"instruction_weekday":1,"instruction_time":"08:00"}'::jsonb $function$;

CREATE OR REPLACE FUNCTION public.validate_reminder_rules()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE v jsonb := NEW.value; k text; e jsonb;
BEGIN
IF NEW.key<>'reminder_rules' THEN RETURN NEW; END IF;
IF jsonb_typeof(v)<>'object' THEN RAISE EXCEPTION 'Die Erinnerungsregeln sind ungültig.'; END IF;
FOREACH k IN ARRAY ARRAY['enabled','soon_enabled','today_enabled','overdue_enabled','review_enabled','instruction_enabled'] LOOP
 IF jsonb_typeof(v->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Ungültiger Wert für %.', k; END IF; END LOOP;
FOREACH k IN ARRAY ARRAY['deadline_time','soon_time','today_time','overdue_time','review_time','instruction_time'] LOOP
 IF jsonb_typeof(v->k) IS DISTINCT FROM 'string' OR (v->>k) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'Ungültige Uhrzeit für %.', k; END IF; END LOOP;
FOREACH k IN ARRAY ARRAY['deadline_weekday','soon_weekday','instruction_weekday'] LOOP
 IF jsonb_typeof(v->k) IS DISTINCT FROM 'number' OR (v->>k)::numeric NOT IN (1,2,3,4,5) THEN RAISE EXCEPTION 'Der Wochentag muss zwischen Montag und Freitag liegen.'; END IF; END LOOP;
IF jsonb_typeof(v->'overdue_every_days') IS DISTINCT FROM 'number' OR (v->>'overdue_every_days')::numeric NOT BETWEEN 1 AND 14 OR (v->>'overdue_every_days')::numeric<>trunc((v->>'overdue_every_days')::numeric) THEN RAISE EXCEPTION 'Der Abstand muss 1 bis 14 Tage betragen.'; END IF;
IF jsonb_typeof(v->'overdue_max') IS DISTINCT FROM 'number' OR (v->>'overdue_max')::numeric NOT BETWEEN 1 AND 10 OR (v->>'overdue_max')::numeric<>trunc((v->>'overdue_max')::numeric) THEN RAISE EXCEPTION 'Es sind 1 bis 10 Erinnerungen erlaubt.'; END IF;
IF jsonb_typeof(v->'review_after_days') IS DISTINCT FROM 'number' OR (v->>'review_after_days')::numeric NOT BETWEEN 1 AND 30 OR (v->>'review_after_days')::numeric<>trunc((v->>'review_after_days')::numeric) THEN RAISE EXCEPTION 'Die Wartezeit muss 1 bis 30 Tage betragen.'; END IF;
IF jsonb_typeof(v->'review_weekdays') IS DISTINCT FROM 'array' OR jsonb_array_length(v->'review_weekdays')=0 THEN RAISE EXCEPTION 'Wähle mindestens einen Wochentag für wartende Prüfungen.'; END IF;
FOR e IN SELECT * FROM jsonb_array_elements(v->'review_weekdays') LOOP
 IF jsonb_typeof(e)<>'number' OR e::text::numeric NOT IN (1,2,3,4,5) THEN RAISE EXCEPTION 'Wochentage müssen zwischen Montag und Freitag liegen.'; END IF; END LOOP;
RETURN NEW;
END $function$;

UPDATE public.app_settings
   SET value = jsonb_build_object('instruction_enabled', true, 'instruction_weekday', 1, 'instruction_time', '08:00') || value
 WHERE key = 'reminder_rules';

CREATE OR REPLACE FUNCTION public.save_reminder_rules(p_rules jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE old jsonb; merged jsonb; changed text[];
BEGIN
IF auth.uid() IS NULL OR NOT public.is_leitung(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
old := public.default_reminder_rules() || coalesce((SELECT value FROM public.app_settings WHERE key='reminder_rules'),'{}'::jsonb);
merged := old || coalesce(p_rules, '{}'::jsonb);
SELECT array_agg(k ORDER BY k) INTO changed FROM (SELECT jsonb_object_keys(merged) k) s WHERE old->k IS DISTINCT FROM merged->k;
INSERT INTO public.app_settings(key,value,is_public,updated_by) VALUES('reminder_rules',merged,false,auth.uid()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,is_public=false,updated_by=auth.uid(),updated_at=now();
IF changed IS NOT NULL THEN PERFORM public.write_audit('settings',NULL,'reminder_rules_changed',NULL,jsonb_build_object('changed',to_jsonb(changed))); END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.get_reminder_rules()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
SELECT CASE WHEN public.is_leitung(auth.uid()) THEN public.default_reminder_rules() || coalesce((SELECT value FROM public.app_settings WHERE key='reminder_rules'),'{}'::jsonb) END $function$;

CREATE FUNCTION public.generate_instruction_reminders(p_now timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rules jsonb := public.default_reminder_rules() || coalesce((SELECT value FROM public.app_settings WHERE key = 'reminder_rules'), '{}'::jsonb);
  lt timestamp := p_now AT TIME ZONE 'Europe/Berlin'; d date := lt::date; t time := lt::time; dow int := extract(isodow FROM lt)::int;
  r record; lid uuid; created int := 0;
BEGIN
  IF NOT coalesce((rules->>'enabled')::boolean, false) OR NOT coalesce((rules->>'instruction_enabled')::boolean, false) THEN RETURN 0; END IF;
  IF dow <> (rules->>'instruction_weekday')::int OR t < (rules->>'instruction_time')::time
     OR t - (rules->>'instruction_time')::time >= interval '6 hours' THEN RETURN 0; END IF;
  FOR r IN
    SELECT p.id, (SELECT count(*) FROM public.instruction_overview_core(p.id, d) o
                   WHERE o.state IN ('due_soon', 'overdue') OR (o.state = 'open' AND p.created_at < p_now - interval '14 days'))::int AS n
      FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'azubi'
     WHERE p.ausbildungsbeginn IS NOT NULL
  LOOP
    CONTINUE WHEN r.n = 0;
    lid := NULL;
    INSERT INTO public.reminder_log (user_id, rule, period_key, created_at) VALUES (r.id, 'instruction_due', d::text, p_now)
    ON CONFLICT DO NOTHING RETURNING id INTO lid;
    IF lid IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
      VALUES (r.id, 'instruction_due', 'Unterweisung fällig', format('%s Unterweisung(en) sind fällig oder bald fällig.', r.n), '/unterweisungen', 'reminder', lid);
      created := created + 1;
    END IF;
  END LOOP;
  RETURN created;
END $$;

ALTER FUNCTION public.generate_reminders(timestamptz) RENAME TO generate_reminders_base;
CREATE FUNCTION public.generate_reminders(p_now timestamptz DEFAULT now())
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.generate_reminders_base(p_now) + public.generate_instruction_reminders(p_now);
END $$;

-- 6 Datenexport (5C)
ALTER FUNCTION public.export_my_data() RENAME TO export_my_data_base;
CREATE FUNCTION public.export_my_data()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
  RETURN public.export_my_data_base() || jsonb_build_object(
    'instruction_records', coalesce((SELECT jsonb_agg(to_jsonb(r) - 'reviewer_id' - 'on_behalf_of' || jsonb_build_object(
        'point_keys', coalesce((SELECT jsonb_agg(p.key ORDER BY p.key) FROM public.instruction_record_points rp
          JOIN public.instruction_points p ON p.id = rp.point_id WHERE rp.record_id = r.id), '[]'::jsonb))
      ORDER BY r.given_on NULLS LAST, r.created_at) FROM public.instruction_records r WHERE r.azubi_id = me), '[]'::jsonb));
END $$;

-- Rechte
REVOKE ALL ON FUNCTION public.instruction_points_set_catalog(), public.instruction_records_guard(), public.instruction_records_topic_changed(),
  public.instruction_record_points_guard(), public.instruction_overview_core(uuid, date), public.instruction_hash(uuid),
  public.instruction_role_label(uuid), public.generate_instruction_reminders(timestamptz), public.generate_reminders_base(timestamptz),
  public.generate_reminders(timestamptz), public.export_my_data_base()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_reminders(timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.resolve_instruction_catalogs(uuid), public.instruction_overview(uuid, date),
  public.submit_instruction(uuid, int), public.confirm_instruction(uuid, int, text), public.reject_instruction(uuid, int, text),
  public.reopen_instruction(uuid, text), public.instruction_pending(), public.log_instruction_export(uuid, int, date, date),
  public.admin_save_instruction_catalog(jsonb), public.admin_set_catalog_status(uuid, text), public.admin_duplicate_catalog(uuid, text, text),
  public.export_catalog_json(uuid), public.export_my_data()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_instruction_catalogs(uuid), public.instruction_overview(uuid, date),
  public.submit_instruction(uuid, int), public.confirm_instruction(uuid, int, text), public.reject_instruction(uuid, int, text),
  public.reopen_instruction(uuid, text), public.instruction_pending(), public.log_instruction_export(uuid, int, date, date),
  public.admin_save_instruction_catalog(jsonb), public.admin_set_catalog_status(uuid, text), public.admin_duplicate_catalog(uuid, text, text),
  public.export_catalog_json(uuid), public.export_my_data()
  TO authenticated;
CREATE TYPE public.consent_kind AS ENUM ('dictation', 'ai_text');
CREATE TYPE public.absence_type AS ENUM ('urlaub', 'krank', 'berufsschule', 'sonstiges');
CREATE TYPE public.absence_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.grade_kind AS ENUM ('klausur', 'muendlich', 'test', 'sonstige');

ALTER TABLE public.professions ADD COLUMN ai_hints text NOT NULL DEFAULT '' CHECK (char_length(ai_hints) <= 4000);

CREATE TABLE public.consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind public.consent_kind NOT NULL,
  text_version text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
GRANT SELECT ON public.consents TO authenticated;
GRANT ALL ON public.consents TO service_role;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY consents_select_own ON public.consents FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE UNIQUE INDEX consents_one_active ON public.consents (user_id, kind) WHERE revoked_at IS NULL;

CREATE TABLE public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  field text NOT NULL CHECK (field IN ('activities', 'school_content', 'instructions', 'summary')),
  input_chars integer NOT NULL CHECK (input_chars >= 0),
  output_chars integer NOT NULL DEFAULT 0 CHECK (output_chars >= 0),
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  ok boolean NOT NULL DEFAULT false
);
REVOKE ALL ON public.ai_usage FROM anon, authenticated;
GRANT ALL ON public.ai_usage TO service_role;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
CREATE INDEX ai_usage_user_created_idx ON public.ai_usage (user_id, created_at DESC);
CREATE INDEX ai_usage_created_idx ON public.ai_usage (created_at DESC);

CREATE TABLE public.absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  azubi_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type public.absence_type NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  note text CHECK (char_length(note) <= 500),
  status public.absence_status NOT NULL DEFAULT 'pending',
  reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text CHECK (char_length(review_note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from),
  CHECK (date_to <= date_from + 365)
);
GRANT SELECT, DELETE ON public.absences TO authenticated;
GRANT INSERT (id, azubi_id, type, date_from, date_to, note) ON public.absences TO authenticated;
GRANT UPDATE (type, date_from, date_to, note) ON public.absences TO authenticated;
GRANT ALL ON public.absences TO service_role;
ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;
CREATE POLICY absences_select ON public.absences FOR SELECT TO authenticated USING (
  azubi_id = auth.uid()
  OR public.can_review_for(auth.uid(), azubi_id)
  OR (type <> 'krank' AND public.can_view_azubi(auth.uid(), azubi_id))
);
CREATE POLICY absences_insert ON public.absences FOR INSERT TO authenticated WITH CHECK (
  azubi_id = auth.uid() AND public.has_role(auth.uid(), 'azubi') AND status = 'pending'
);
CREATE POLICY absences_update ON public.absences FOR UPDATE TO authenticated
  USING (azubi_id = auth.uid() AND status = 'pending' AND public.has_role(auth.uid(), 'azubi'))
  WITH CHECK (azubi_id = auth.uid() AND status = 'pending' AND public.has_role(auth.uid(), 'azubi'));
CREATE POLICY absences_delete ON public.absences FOR DELETE TO authenticated USING (
  azubi_id = auth.uid() AND status IN ('pending', 'rejected') AND public.has_role(auth.uid(), 'azubi')
);
CREATE INDEX absences_azubi_date_idx ON public.absences (azubi_id, date_from DESC);
CREATE TRIGGER absences_updated_at BEFORE UPDATE ON public.absences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.school_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  azubi_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 1 AND 80),
  grade numeric(2,1) NOT NULL CHECK (grade BETWEEN 1.0 AND 6.0),
  grade_date date NOT NULL,
  kind public.grade_kind NOT NULL DEFAULT 'klausur',
  note text CHECK (char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.school_grades TO authenticated;
GRANT INSERT (id, azubi_id, subject, grade, grade_date, kind, note) ON public.school_grades TO authenticated;
GRANT UPDATE (subject, grade, grade_date, kind, note) ON public.school_grades TO authenticated;
GRANT ALL ON public.school_grades TO service_role;
ALTER TABLE public.school_grades ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_grades_select ON public.school_grades FOR SELECT TO authenticated USING (
  azubi_id = auth.uid() OR public.can_view_azubi(auth.uid(), azubi_id)
);
CREATE POLICY school_grades_insert ON public.school_grades FOR INSERT TO authenticated WITH CHECK (
  azubi_id = auth.uid() AND public.has_role(auth.uid(), 'azubi')
);
CREATE POLICY school_grades_update ON public.school_grades FOR UPDATE TO authenticated
  USING (azubi_id = auth.uid() AND public.has_role(auth.uid(), 'azubi'))
  WITH CHECK (azubi_id = auth.uid() AND public.has_role(auth.uid(), 'azubi'));
CREATE POLICY school_grades_delete ON public.school_grades FOR DELETE TO authenticated USING (
  azubi_id = auth.uid() AND public.has_role(auth.uid(), 'azubi')
);
CREATE INDEX school_grades_azubi_date_idx ON public.school_grades (azubi_id, grade_date DESC);
CREATE TRIGGER school_grades_updated_at BEFORE UPDATE ON public.school_grades FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.school_grades_date_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.grade_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Das Datum darf nicht in der Zukunft liegen.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER school_grades_date_guard BEFORE INSERT OR UPDATE OF grade_date ON public.school_grades
  FOR EACH ROW EXECUTE FUNCTION public.school_grades_date_guard();

CREATE OR REPLACE FUNCTION public.grant_consent(_kind public.consent_kind, _text_version text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_azubi uuid;
BEGIN
  IF auth.uid() IS NULL OR btrim(coalesce(_text_version, '')) = '' THEN
    RAISE EXCEPTION 'Ungültige Einwilligung.';
  END IF;
  IF _kind = 'ai_text' AND NOT public.has_role(auth.uid(), 'azubi') THEN
    RAISE EXCEPTION 'Der KI-Text ist nur für Auszubildende verfügbar.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text || ':' || _kind::text));
  SELECT id INTO v_id FROM public.consents WHERE user_id = auth.uid() AND kind = _kind AND revoked_at IS NULL;
  IF v_id IS NOT NULL THEN
    UPDATE public.consents SET text_version = btrim(_text_version), granted_at = now() WHERE id = v_id;
  ELSE
    INSERT INTO public.consents (user_id, kind, text_version) VALUES (auth.uid(), _kind, btrim(_text_version)) RETURNING id INTO v_id;
  END IF;
  IF public.has_role(auth.uid(), 'azubi') THEN v_azubi := auth.uid(); END IF;
  PERFORM public.write_audit('consent', v_id, 'consent_granted', v_azubi, jsonb_build_object('kind', _kind, 'text_version', btrim(_text_version)));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_consent(_kind public.consent_kind)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_version text;
  v_azubi uuid;
BEGIN
  UPDATE public.consents SET revoked_at = now()
  WHERE user_id = auth.uid() AND kind = _kind AND revoked_at IS NULL
  RETURNING id, text_version INTO v_id, v_version;
  IF v_id IS NOT NULL THEN
    IF public.has_role(auth.uid(), 'azubi') THEN v_azubi := auth.uid(); END IF;
    PERFORM public.write_audit('consent', v_id, 'consent_revoked', v_azubi, jsonb_build_object('kind', _kind, 'text_version', v_version));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.has_my_consent(_kind public.consent_kind)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.consents WHERE user_id = auth.uid() AND kind = _kind AND revoked_at IS NULL)
$$;

REVOKE ALL ON FUNCTION public.grant_consent(public.consent_kind, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_consent(public.consent_kind) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_my_consent(public.consent_kind) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_consent(public.consent_kind, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_consent(public.consent_kind) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_my_consent(public.consent_kind) TO authenticated;

CREATE OR REPLACE FUNCTION public.absence_notify_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
  v_reviewer uuid;
  v_kind text;
BEGIN
  SELECT full_name, ausbilder_id INTO v_name, v_reviewer FROM public.profiles WHERE id = NEW.azubi_id;
  IF v_reviewer IS NULL THEN RETURN NEW; END IF;
  v_kind := CASE NEW.type WHEN 'urlaub' THEN 'Urlaub' WHEN 'krank' THEN 'Krankheit' WHEN 'berufsschule' THEN 'Berufsschule' ELSE 'Sonstiges' END;
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (v_reviewer, 'absence_requested', 'Neue Abwesenheit', v_name || ': ' || v_kind || ', ' || to_char(NEW.date_from, 'DD.MM.YYYY') || ' – ' || to_char(NEW.date_to, 'DD.MM.YYYY'), '/abwesenheiten?id=' || NEW.id, 'absence', NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER absences_notify_request AFTER INSERT ON public.absences FOR EACH ROW EXECUTE FUNCTION public.absence_notify_request();

CREATE OR REPLACE FUNCTION public.review_absence(_absence_id uuid, _decision public.absence_status, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_absence public.absences%ROWTYPE;
  v_kind text;
  v_body text;
BEGIN
  SELECT * INTO v_absence FROM public.absences WHERE id = _absence_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Abwesenheit nicht gefunden.'; END IF;
  IF auth.uid() = v_absence.azubi_id OR NOT public.can_review_for(auth.uid(), v_absence.azubi_id) THEN
    RAISE EXCEPTION 'Du darfst diese Abwesenheit nicht prüfen.';
  END IF;
  IF _decision = 'rejected' AND char_length(btrim(coalesce(_note, ''))) < 3 THEN
    RAISE EXCEPTION 'Bitte gib eine Begründung mit mindestens 3 Zeichen ein.';
  END IF;
  UPDATE public.absences SET
    status = _decision,
    reviewer_id = CASE WHEN _decision = 'pending' THEN NULL ELSE auth.uid() END,
    reviewed_at = CASE WHEN _decision = 'pending' THEN NULL ELSE now() END,
    review_note = NULLIF(btrim(coalesce(_note, '')), '')
  WHERE id = _absence_id;
  v_kind := CASE v_absence.type WHEN 'urlaub' THEN 'Urlaub' WHEN 'krank' THEN 'Krankheit' WHEN 'berufsschule' THEN 'Berufsschule' ELSE 'Sonstiges' END;
  v_body := v_kind || ', ' || to_char(v_absence.date_from, 'DD.MM.YYYY') || ' – ' || to_char(v_absence.date_to, 'DD.MM.YYYY');
  IF _decision = 'approved' THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
    VALUES (v_absence.azubi_id, 'absence_approved', 'Abwesenheit genehmigt', v_body, '/abwesenheiten?id=' || _absence_id, 'absence', _absence_id);
  ELSIF _decision = 'rejected' THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
    VALUES (v_absence.azubi_id, 'absence_rejected', 'Abwesenheit abgelehnt', v_body || ': ' || btrim(_note), '/abwesenheiten?id=' || _absence_id, 'absence', _absence_id);
  END IF;
  PERFORM public.write_audit('absence', _absence_id, 'review', v_absence.azubi_id, jsonb_build_object('status', _decision));
END $$;

CREATE OR REPLACE FUNCTION public.absent_days(_azubi uuid, _from_date date, _to_date date)
RETURNS SETOF date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT generate_series(
    GREATEST(a.date_from, _from_date),
    LEAST(a.date_to, _to_date),
    interval '1 day'
  )::date
  FROM public.absences a
  WHERE a.azubi_id = _azubi
    AND a.status <> 'rejected'
    AND a.date_from <= _to_date
    AND a.date_to >= _from_date
    AND _from_date IS NOT NULL AND _to_date IS NOT NULL
    AND _to_date >= _from_date AND _to_date <= _from_date + 799
    AND public.can_view_azubi(auth.uid(), _azubi)
$$;

CREATE OR REPLACE FUNCTION public.log_ai_assist(_report_id uuid, _field text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_azubi uuid;
BEGIN
  IF _field NOT IN ('activities', 'school_content', 'instructions', 'summary') THEN
    RAISE EXCEPTION 'Ungültiger Abschnitt.';
  END IF;
  SELECT azubi_id INTO v_azubi FROM public.reports
  WHERE id = _report_id AND azubi_id = auth.uid() AND status IN ('draft', 'rejected');
  IF v_azubi IS NULL THEN RAISE EXCEPTION 'Bericht nicht verfügbar.'; END IF;
  PERFORM public.write_audit('report', _report_id, 'ai_assist', v_azubi, jsonb_build_object('field', _field));
END $$;

REVOKE ALL ON FUNCTION public.absence_notify_request() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.school_grades_date_guard() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_absence(uuid, public.absence_status, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.absent_days(uuid, date, date) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_ai_assist(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_absence(uuid, public.absence_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.absent_days(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_ai_assist(uuid, text) TO authenticated;

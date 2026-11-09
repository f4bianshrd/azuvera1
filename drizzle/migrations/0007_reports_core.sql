-- Baustein 2A: Berichte, Anhänge, Versionen, Signaturen

CREATE TYPE public.report_type AS ENUM ('daily', 'weekly');
CREATE TYPE public.report_status AS ENUM ('draft', 'submitted', 'approved', 'rejected');

-- ============ reports ============
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  azubi_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  report_type public.report_type NOT NULL,
  weekly_mode text NOT NULL DEFAULT 'activities' CHECK (weekly_mode IN ('activities', 'topics')),
  report_date date NOT NULL,
  week_number int,
  year int,
  activities text CHECK (char_length(activities) <= 20000),
  school_content text CHECK (char_length(school_content) <= 20000),
  instructions text CHECK (char_length(instructions) <= 20000),
  summary text CHECK (char_length(summary) <= 20000),
  status public.report_status NOT NULL DEFAULT 'draft',
  version int NOT NULL DEFAULT 1,
  content_hash text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewer_id uuid REFERENCES public.profiles(id),
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY reports_select ON public.reports FOR SELECT TO authenticated
  USING (azubi_id = auth.uid() OR (status <> 'draft' AND (public.can_view_azubi(auth.uid(), azubi_id) OR public.is_leitung(auth.uid()))));
CREATE POLICY reports_insert ON public.reports FOR INSERT TO authenticated
  WITH CHECK (azubi_id = auth.uid() AND status = 'draft');
CREATE POLICY reports_update ON public.reports FOR UPDATE TO authenticated
  USING (azubi_id = auth.uid() AND status IN ('draft', 'rejected'))
  WITH CHECK (azubi_id = auth.uid() AND status IN ('draft', 'rejected'));
CREATE POLICY reports_delete ON public.reports FOR DELETE TO authenticated
  USING (azubi_id = auth.uid() AND status = 'draft');

-- Eindeutigkeit: ein Tagesbericht pro Tag, ein Wochenbericht pro ISO-Woche
CREATE UNIQUE INDEX reports_unique_daily ON public.reports (azubi_id, report_date) WHERE report_type = 'daily';
CREATE UNIQUE INDEX reports_unique_weekly ON public.reports (azubi_id, year, week_number) WHERE report_type = 'weekly';
CREATE INDEX reports_azubi_date_idx ON public.reports (azubi_id, report_date DESC);

-- KW/Jahr aus report_date, kein Zukunftsdatum
CREATE OR REPLACE FUNCTION public.reports_derive_fields() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.report_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Das Datum darf nicht in der Zukunft liegen.';
  END IF;
  IF NEW.report_type = 'weekly' THEN
    NEW.week_number := EXTRACT(WEEK FROM NEW.report_date)::int;
    NEW.year := EXTRACT(ISOYEAR FROM NEW.report_date)::int;
  ELSE
    NEW.week_number := NULL;
    NEW.year := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER reports_derive_fields BEFORE INSERT OR UPDATE OF report_type, report_date ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.reports_derive_fields();

-- version steigt bei Änderung der Inhaltsspalten
CREATE OR REPLACE FUNCTION public.reports_bump_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.weekly_mode IS DISTINCT FROM OLD.weekly_mode
     OR NEW.report_date IS DISTINCT FROM OLD.report_date
     OR NEW.activities IS DISTINCT FROM OLD.activities
     OR NEW.school_content IS DISTINCT FROM OLD.school_content
     OR NEW.instructions IS DISTINCT FROM OLD.instructions
     OR NEW.summary IS DISTINCT FROM OLD.summary THEN
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER reports_bump_version BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.reports_bump_version();

CREATE TRIGGER reports_updated_at BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Schutz systemseitiger Spalten + Statusübergänge + approved unveränderlich
CREATE OR REPLACE FUNCTION public.reports_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  bypass boolean := current_setting('app.bypass_guard', true) = 'on';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'approved' AND NOT bypass THEN
      RAISE EXCEPTION 'Freigegebene Berichte können nicht gelöscht werden.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT bypass AND (NEW.status <> 'draft' OR NEW.version <> 1 OR NEW.content_hash IS NOT NULL
       OR NEW.submitted_at IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.reviewer_id IS NOT NULL
       OR NEW.review_note IS NOT NULL) THEN
      RAISE EXCEPTION 'Status und Prüffelder können nur vom System gesetzt werden.';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.status = 'approved' AND NOT bypass THEN
    RAISE EXCEPTION 'Freigegebene Berichte sind unveränderlich.';
  END IF;

  IF NOT bypass THEN
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
       OR NEW.review_note IS DISTINCT FROM OLD.review_note THEN
      RAISE EXCEPTION 'Status und Prüffelder können nur vom System geändert werden.';
    END IF;
  ELSE
    -- erlaubte Statusübergänge auch für Funktionen prüfen
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status = 'draft' AND NEW.status = 'submitted')
      OR (OLD.status = 'rejected' AND NEW.status = 'submitted')
      OR (OLD.status = 'submitted' AND NEW.status IN ('approved', 'rejected'))
      OR (OLD.status = 'approved' AND NEW.status = 'draft')
    ) THEN
      RAISE EXCEPTION 'Dieser Statusübergang ist nicht erlaubt.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER reports_guard BEFORE INSERT OR UPDATE OR DELETE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.reports_guard();

-- ============ report_attachments ============
CREATE TABLE public.report_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  azubi_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  thumb_path text,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes int NOT NULL,
  width int,
  height int,
  sha256 text,
  caption text CHECK (char_length(caption) <= 200),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_attachments TO authenticated;
GRANT ALL ON public.report_attachments TO service_role;

ALTER TABLE public.report_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_attachments_select ON public.report_attachments FOR SELECT TO authenticated
  USING (azubi_id = auth.uid() OR (public.can_view_azubi(auth.uid(), azubi_id) OR public.is_leitung(auth.uid()))
         AND EXISTS (SELECT 1 FROM public.reports r WHERE r.id = report_id AND r.status <> 'draft'));
CREATE POLICY report_attachments_insert ON public.report_attachments FOR INSERT TO authenticated
  WITH CHECK (azubi_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.reports r WHERE r.id = report_id AND r.azubi_id = auth.uid() AND r.status IN ('draft', 'rejected')));
CREATE POLICY report_attachments_update ON public.report_attachments FOR UPDATE TO authenticated
  USING (azubi_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.reports r WHERE r.id = report_id AND r.status IN ('draft', 'rejected')))
  WITH CHECK (azubi_id = auth.uid());
CREATE POLICY report_attachments_delete ON public.report_attachments FOR DELETE TO authenticated
  USING (azubi_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.reports r WHERE r.id = report_id AND r.status IN ('draft', 'rejected')));

CREATE OR REPLACE FUNCTION public.report_attachments_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.azubi_id := (SELECT azubi_id FROM public.reports WHERE id = NEW.report_id);
    IF NEW.azubi_id IS NULL THEN
      RAISE EXCEPTION 'Bericht nicht gefunden.';
    END IF;
    IF (SELECT count(*) FROM public.report_attachments WHERE report_id = NEW.report_id) >= 10 THEN
      RAISE EXCEPTION 'Höchstens 10 Anhänge je Bericht.';
    END IF;
  END IF;
  IF NEW.size_bytes > 10485760 THEN
    RAISE EXCEPTION 'Dateien dürfen höchstens 10 MB groß sein.';
  END IF;
  IF NEW.mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') THEN
    RAISE EXCEPTION 'Dieser Dateityp ist nicht erlaubt.';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER report_attachments_guard BEFORE INSERT OR UPDATE ON public.report_attachments
  FOR EACH ROW EXECUTE FUNCTION public.report_attachments_guard();

-- ============ report_versions ============
CREATE TABLE public.report_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  version int NOT NULL,
  status public.report_status NOT NULL,
  snapshot jsonb NOT NULL,
  content_hash text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.report_versions TO authenticated;
GRANT ALL ON public.report_versions TO service_role;

ALTER TABLE public.report_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_versions_select ON public.report_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.reports r WHERE r.id = report_id
      AND (r.azubi_id = auth.uid() OR (r.status <> 'draft' AND (public.can_view_azubi(auth.uid(), r.azubi_id) OR public.is_leitung(auth.uid()))))));

CREATE OR REPLACE FUNCTION public.report_versions_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Berichtsversionen können nicht geändert oder gelöscht werden.';
END $$;

CREATE TRIGGER report_versions_immutable BEFORE UPDATE OR DELETE ON public.report_versions
  FOR EACH ROW EXECUTE FUNCTION public.report_versions_immutable();

-- Schnappschuss bei jedem Statuswechsel
CREATE OR REPLACE FUNCTION public.reports_snapshot_on_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.report_versions (report_id, version, status, snapshot, content_hash, changed_by)
    VALUES (
      NEW.id,
      NEW.version,
      NEW.status,
      jsonb_build_object(
        'type', NEW.report_type,
        'date', NEW.report_date,
        'mode', NEW.weekly_mode,
        'activities', coalesce(NEW.activities, ''),
        'school', coalesce(NEW.school_content, ''),
        'instructions', coalesce(NEW.instructions, ''),
        'summary', coalesce(NEW.summary, ''),
        'attachments', coalesce((
          SELECT jsonb_agg(jsonb_build_object('id', a.id, 'file_name', a.file_name, 'sha256', a.sha256, 'caption', a.caption) ORDER BY a.sort_order)
          FROM public.report_attachments a WHERE a.report_id = NEW.id
        ), '[]'::jsonb)
      ),
      NEW.content_hash,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER reports_snapshot_on_status AFTER UPDATE OF status ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.reports_snapshot_on_status();

-- ============ canonical / hash ============
CREATE OR REPLACE FUNCTION public.report_canonical(_report_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'type', r.report_type,
    'date', r.report_date,
    'mode', r.weekly_mode,
    'activities', coalesce(r.activities, ''),
    'school', coalesce(r.school_content, ''),
    'instructions', coalesce(r.instructions, ''),
    'summary', coalesce(r.summary, ''),
    'attachments', coalesce((
      SELECT jsonb_agg(a.sha256 ORDER BY a.sha256)
      FROM public.report_attachments a WHERE a.report_id = r.id
    ), '[]'::jsonb)
  )::text
  FROM public.reports r WHERE r.id = _report_id
$$;

CREATE OR REPLACE FUNCTION public.report_hash(_report_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT encode(extensions.digest(public.report_canonical(_report_id), 'sha256'), 'hex')
$$;

-- ============ report_signatures ============
CREATE TABLE public.report_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('azubi', 'ausbilder')),
  signer_id uuid NOT NULL REFERENCES public.profiles(id),
  signer_name text NOT NULL,
  signer_role_label text,
  on_behalf_of uuid REFERENCES public.profiles(id),
  method text NOT NULL CHECK (method IN ('draw', 'saved', 'click')),
  image_path text,
  content_hash text,
  report_version int NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  client_signed_at timestamptz,
  UNIQUE (report_id, role, report_version)
);

GRANT SELECT ON public.report_signatures TO authenticated;
GRANT ALL ON public.report_signatures TO service_role;

ALTER TABLE public.report_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_signatures_select ON public.report_signatures FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.reports r WHERE r.id = report_id
      AND (r.azubi_id = auth.uid() OR (r.status <> 'draft' AND (public.can_view_azubi(auth.uid(), r.azubi_id) OR public.is_leitung(auth.uid()))))));

CREATE TRIGGER report_signatures_immutable BEFORE UPDATE OR DELETE ON public.report_signatures
  FOR EACH ROW EXECUTE FUNCTION public.report_versions_immutable();

-- ============ team_week_status ============
CREATE OR REPLACE FUNCTION public.team_week_status(_week_start date)
RETURNS TABLE (azubi_id uuid, status public.report_status)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, r.status
  FROM public.profiles p
  LEFT JOIN public.reports r
    ON r.azubi_id = p.id AND r.report_type = 'weekly'
   AND r.year = EXTRACT(ISOYEAR FROM _week_start)::int
   AND r.week_number = EXTRACT(WEEK FROM _week_start)::int
  WHERE p.id = auth.uid()
     OR public.can_view_azubi(auth.uid(), p.id)
     OR public.is_leitung(auth.uid())
$$;

-- ============ submit_report ============
CREATE OR REPLACE FUNCTION public.submit_report(
  _report_id uuid,
  _expected_version int,
  _method text,
  _image_path text DEFAULT NULL,
  _client_signed_at timestamptz DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.reports%ROWTYPE;
  new_version int;
  new_hash text;
  signer text;
  reviewer uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet.';
  END IF;
  IF _method NOT IN ('draw', 'click') THEN
    RAISE EXCEPTION 'Ungültige Bestätigungsmethode.';
  END IF;

  SELECT * INTO r FROM public.reports WHERE id = _report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bericht nicht gefunden.';
  END IF;
  IF r.azubi_id <> auth.uid() THEN
    RAISE EXCEPTION 'Nur die Eigentümerin oder der Eigentümer kann einreichen.';
  END IF;
  IF r.status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'Nur Entwürfe oder zurückgewiesene Berichte können eingereicht werden.';
  END IF;
  IF r.version <> _expected_version THEN
    RAISE EXCEPTION 'Der Bericht wurde inzwischen geändert.';
  END IF;
  IF btrim(coalesce(r.activities, '')) = '' THEN
    RAISE EXCEPTION 'Der Abschnitt Tätigkeiten darf nicht leer sein.';
  END IF;

  new_version := r.version + 1;
  new_hash := public.report_hash(_report_id);

  PERFORM set_config('app.bypass_guard', 'on', true);
  UPDATE public.reports
  SET status = 'submitted',
      version = new_version,
      content_hash = new_hash,
      submitted_at = now(),
      reviewed_at = NULL,
      reviewer_id = NULL,
      review_note = NULL
  WHERE id = _report_id;

  SELECT full_name INTO signer FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.report_signatures
    (report_id, role, signer_id, signer_name, signer_role_label, method, image_path, content_hash, report_version, client_signed_at)
  VALUES
    (_report_id, 'azubi', auth.uid(), coalesce(signer, ''), 'Auszubildende/r', _method, _image_path, new_hash, new_version, _client_signed_at);

  -- prüfende Person benachrichtigen: Ausbilder, sonst Ausbildungsleitung
  SELECT ausbilder_id INTO reviewer FROM public.profiles WHERE id = auth.uid();
  IF reviewer IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
    VALUES (reviewer, 'report_submitted', 'Bericht eingereicht',
            signer || ' hat einen Bericht eingereicht.', '/reports/' || _report_id, 'report', _report_id);
  ELSE
    INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
    SELECT ur.user_id, 'report_submitted', 'Bericht eingereicht',
           signer || ' hat einen Bericht eingereicht.', '/reports/' || _report_id, 'report', _report_id
    FROM public.user_roles ur WHERE ur.role = 'ausbildungsleitung';
  END IF;

  PERFORM public.write_audit('report', _report_id, 'submit', auth.uid(),
    jsonb_build_object('version', new_version, 'content_hash', new_hash, 'method', _method));
END $$;

REVOKE ALL ON FUNCTION public.submit_report(uuid, int, text, text, timestamptz) FROM anon;
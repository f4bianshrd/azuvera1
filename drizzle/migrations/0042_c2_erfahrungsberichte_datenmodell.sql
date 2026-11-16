-- ============ experience_reports ============
CREATE TABLE IF NOT EXISTS public.experience_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  azubi_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'erfahrungsbericht' CHECK (kind IN ('erfahrungsbericht','projektbericht','leittext')),
  title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 150),
  area text NOT NULL DEFAULT '' CHECK (char_length(area) <= 80),
  written_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'Europe/Berlin')::date),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 20000),
  reasoning text NOT NULL DEFAULT '' CHECK (char_length(reasoning) <= 20000),
  status public.report_status NOT NULL DEFAULT 'draft',
  version int NOT NULL DEFAULT 1,
  content_hash text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS experience_reports_azubi_written_idx ON public.experience_reports (azubi_id, written_on DESC);
CREATE INDEX IF NOT EXISTS experience_reports_submitted_idx ON public.experience_reports (status, submitted_at) WHERE status = 'submitted';
GRANT SELECT, DELETE ON public.experience_reports TO authenticated;
GRANT INSERT (id, azubi_id, kind, title, area, written_on, body, reasoning) ON public.experience_reports TO authenticated;
GRANT UPDATE (kind, title, area, written_on, body, reasoning) ON public.experience_reports TO authenticated;
GRANT ALL ON public.experience_reports TO service_role;
ALTER TABLE public.experience_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS experience_reports_select ON public.experience_reports;
CREATE POLICY experience_reports_select ON public.experience_reports FOR SELECT TO authenticated
  USING (azubi_id = auth.uid() OR (status <> 'draft' AND public.can_view_azubi(auth.uid(), azubi_id)));
DROP POLICY IF EXISTS experience_reports_insert ON public.experience_reports;
CREATE POLICY experience_reports_insert ON public.experience_reports FOR INSERT TO authenticated
  WITH CHECK (azubi_id = auth.uid() AND status = 'draft' AND public.has_role(auth.uid(), 'azubi'));
DROP POLICY IF EXISTS experience_reports_update ON public.experience_reports;
CREATE POLICY experience_reports_update ON public.experience_reports FOR UPDATE TO authenticated
  USING (azubi_id = auth.uid() AND status IN ('draft','rejected'))
  WITH CHECK (azubi_id = auth.uid() AND status IN ('draft','rejected'));
DROP POLICY IF EXISTS experience_reports_delete ON public.experience_reports;
CREATE POLICY experience_reports_delete ON public.experience_reports FOR DELETE TO authenticated
  USING (azubi_id = auth.uid() AND status = 'draft');

DROP TRIGGER IF EXISTS experience_reports_updated ON public.experience_reports;
CREATE TRIGGER experience_reports_updated BEFORE UPDATE ON public.experience_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.experience_reports_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  tr boolean := coalesce(current_setting('azuvera.experience_transition', true), '') = 'on';
  today date := (now() AT TIME ZONE 'Europe/Berlin')::date;
  content_changed boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' AND NOT public.account_removal_active() THEN
      RAISE EXCEPTION 'Nur Entwürfe lassen sich löschen.';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT tr AND (NEW.status <> 'draft' OR NEW.version <> 1 OR NEW.content_hash IS NOT NULL OR NEW.submitted_at IS NOT NULL
      OR NEW.reviewed_at IS NOT NULL OR NEW.reviewer_id IS NOT NULL OR NEW.review_note IS NOT NULL) THEN
      RAISE EXCEPTION 'Status und Prüffelder können nur vom System gesetzt werden.';
    END IF;
    IF NEW.written_on > today THEN RAISE EXCEPTION 'Das Datum darf nicht in der Zukunft liegen.'; END IF;
    RETURN NEW;
  END IF;
  content_changed := NEW.kind IS DISTINCT FROM OLD.kind OR NEW.title IS DISTINCT FROM OLD.title OR NEW.area IS DISTINCT FROM OLD.area
    OR NEW.written_on IS DISTINCT FROM OLD.written_on OR NEW.body IS DISTINCT FROM OLD.body OR NEW.reasoning IS DISTINCT FROM OLD.reasoning;
  IF NOT tr THEN
    IF OLD.reviewer_id IS NOT NULL AND NEW.reviewer_id IS NULL AND NOT content_changed
      AND NEW.status = OLD.status AND NEW.version = OLD.version AND NEW.content_hash IS NOT DISTINCT FROM OLD.content_hash
      AND NEW.submitted_at IS NOT DISTINCT FROM OLD.submitted_at AND NEW.reviewed_at IS NOT DISTINCT FROM OLD.reviewed_at
      AND NEW.review_note IS NOT DISTINCT FROM OLD.review_note THEN
      RETURN NEW;
    END IF;
    IF OLD.status = 'approved' THEN RAISE EXCEPTION 'Freigegebene Erfahrungsberichte sind unveränderlich.'; END IF;
    IF OLD.status = 'submitted' THEN RAISE EXCEPTION 'Eingereichte Erfahrungsberichte lassen sich nicht ändern.'; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.content_hash IS DISTINCT FROM OLD.content_hash OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
      OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
      OR NEW.review_note IS DISTINCT FROM OLD.review_note THEN
      RAISE EXCEPTION 'Status und Prüffelder können nur vom System geändert werden.';
    END IF;
    IF content_changed THEN NEW.version := OLD.version + 1; END IF;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status IN ('draft','rejected') AND NEW.status = 'submitted')
      OR (OLD.status = 'submitted' AND NEW.status IN ('approved','rejected'))
      OR (OLD.status = 'approved' AND NEW.status = 'draft')) THEN
      RAISE EXCEPTION 'Dieser Statusübergang ist nicht erlaubt.';
    END IF;
    IF content_changed THEN RAISE EXCEPTION 'Der Inhalt kann dabei nicht geändert werden.'; END IF;
  END IF;
  IF NEW.written_on IS DISTINCT FROM OLD.written_on AND NEW.written_on > today THEN
    RAISE EXCEPTION 'Das Datum darf nicht in der Zukunft liegen.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS experience_reports_guard ON public.experience_reports;
CREATE TRIGGER experience_reports_guard BEFORE INSERT OR UPDATE OR DELETE ON public.experience_reports
  FOR EACH ROW EXECUTE FUNCTION public.experience_reports_guard();

CREATE OR REPLACE FUNCTION public.experience_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND public.account_removal_active() THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Diese Einträge können nicht geändert oder gelöscht werden.';
END $$;

-- ============ experience_attachments ============
CREATE TABLE IF NOT EXISTS public.experience_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id uuid NOT NULL REFERENCES public.experience_reports(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS experience_attachments_exp_idx ON public.experience_attachments (experience_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.experience_attachments TO authenticated;
GRANT ALL ON public.experience_attachments TO service_role;
ALTER TABLE public.experience_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS experience_attachments_select ON public.experience_attachments;
CREATE POLICY experience_attachments_select ON public.experience_attachments FOR SELECT TO authenticated
  USING (azubi_id = auth.uid() OR (public.can_view_azubi(auth.uid(), azubi_id)
    AND EXISTS (SELECT 1 FROM public.experience_reports e WHERE e.id = experience_id AND e.status <> 'draft')));
DROP POLICY IF EXISTS experience_attachments_insert ON public.experience_attachments;
CREATE POLICY experience_attachments_insert ON public.experience_attachments FOR INSERT TO authenticated
  WITH CHECK (azubi_id = auth.uid() AND EXISTS (SELECT 1 FROM public.experience_reports e
    WHERE e.id = experience_id AND e.azubi_id = auth.uid() AND e.status IN ('draft','rejected')));
DROP POLICY IF EXISTS experience_attachments_update ON public.experience_attachments;
CREATE POLICY experience_attachments_update ON public.experience_attachments FOR UPDATE TO authenticated
  USING (azubi_id = auth.uid() AND EXISTS (SELECT 1 FROM public.experience_reports e WHERE e.id = experience_id AND e.status IN ('draft','rejected')))
  WITH CHECK (azubi_id = auth.uid());
DROP POLICY IF EXISTS experience_attachments_delete ON public.experience_attachments;
CREATE POLICY experience_attachments_delete ON public.experience_attachments FOR DELETE TO authenticated
  USING (azubi_id = auth.uid() AND EXISTS (SELECT 1 FROM public.experience_reports e WHERE e.id = experience_id AND e.status IN ('draft','rejected')));

CREATE OR REPLACE FUNCTION public.experience_attachments_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.azubi_id := (SELECT azubi_id FROM public.experience_reports WHERE id = NEW.experience_id);
    IF NEW.azubi_id IS NULL THEN RAISE EXCEPTION 'Erfahrungsbericht nicht gefunden.'; END IF;
    IF (SELECT count(*) FROM public.experience_attachments WHERE experience_id = NEW.experience_id) >= 10 THEN
      RAISE EXCEPTION 'Höchstens 10 Anhänge je Erfahrungsbericht.';
    END IF;
  ELSIF NEW.experience_id IS DISTINCT FROM OLD.experience_id OR NEW.azubi_id IS DISTINCT FROM OLD.azubi_id
    OR NEW.storage_path IS DISTINCT FROM OLD.storage_path OR NEW.sha256 IS DISTINCT FROM OLD.sha256 THEN
    RAISE EXCEPTION 'Nur Beschriftung und Reihenfolge lassen sich ändern.';
  END IF;
  IF NEW.size_bytes > 10485760 THEN RAISE EXCEPTION 'Dateien dürfen höchstens 10 MB groß sein.'; END IF;
  IF NEW.mime_type NOT IN ('image/jpeg','image/png','image/webp','application/pdf') THEN RAISE EXCEPTION 'Dieser Dateityp ist nicht erlaubt.'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS experience_attachments_guard ON public.experience_attachments;
CREATE TRIGGER experience_attachments_guard BEFORE INSERT OR UPDATE ON public.experience_attachments
  FOR EACH ROW EXECUTE FUNCTION public.experience_attachments_guard();

-- ============ experience_versions ============
CREATE TABLE IF NOT EXISTS public.experience_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id uuid NOT NULL REFERENCES public.experience_reports(id) ON DELETE CASCADE,
  version int NOT NULL,
  status text NOT NULL CHECK (status IN ('submitted','approved','rejected','reopened')),
  snapshot jsonb NOT NULL,
  content_hash text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS experience_versions_exp_idx ON public.experience_versions (experience_id, created_at);
GRANT SELECT ON public.experience_versions TO authenticated;
GRANT ALL ON public.experience_versions TO service_role;
ALTER TABLE public.experience_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS experience_versions_select ON public.experience_versions;
CREATE POLICY experience_versions_select ON public.experience_versions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.experience_reports e WHERE e.id = experience_id
    AND (e.azubi_id = auth.uid() OR (e.status <> 'draft' AND public.can_view_azubi(auth.uid(), e.azubi_id)))));
DROP TRIGGER IF EXISTS experience_versions_immutable ON public.experience_versions;
CREATE TRIGGER experience_versions_immutable BEFORE UPDATE OR DELETE ON public.experience_versions
  FOR EACH ROW EXECUTE FUNCTION public.experience_immutable();

CREATE OR REPLACE FUNCTION public.experience_snapshot_on_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.experience_versions (experience_id, version, status, snapshot, content_hash, changed_by)
    VALUES (NEW.id, NEW.version,
      CASE WHEN OLD.status = 'approved' AND NEW.status = 'draft' THEN 'reopened' ELSE NEW.status::text END,
      jsonb_build_object('title', NEW.title, 'area', NEW.area, 'kind', NEW.kind, 'written_on', NEW.written_on,
        'body', NEW.body, 'reasoning', NEW.reasoning,
        'attachments', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'file_name', a.file_name, 'sha256', a.sha256) ORDER BY a.sort_order, a.created_at)
          FROM public.experience_attachments a WHERE a.experience_id = NEW.id), '[]'::jsonb)),
      NEW.content_hash, auth.uid());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS experience_snapshot_on_status ON public.experience_reports;
CREATE TRIGGER experience_snapshot_on_status AFTER UPDATE OF status ON public.experience_reports
  FOR EACH ROW EXECUTE FUNCTION public.experience_snapshot_on_status();

-- ============ experience_signatures ============
CREATE TABLE IF NOT EXISTS public.experience_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id uuid NOT NULL REFERENCES public.experience_reports(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('azubi','ausbilder')),
  signer_id uuid NOT NULL REFERENCES public.profiles(id),
  signer_name text NOT NULL,
  signer_role_label text,
  on_behalf_of uuid REFERENCES public.profiles(id),
  method text NOT NULL CHECK (method IN ('draw','saved','click')),
  image_path text,
  content_hash text,
  experience_version int NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  client_signed_at timestamptz,
  UNIQUE (experience_id, role, experience_version)
);
GRANT SELECT ON public.experience_signatures TO authenticated;
GRANT ALL ON public.experience_signatures TO service_role;
ALTER TABLE public.experience_signatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS experience_signatures_select ON public.experience_signatures;
CREATE POLICY experience_signatures_select ON public.experience_signatures FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.experience_reports e WHERE e.id = experience_id
    AND (e.azubi_id = auth.uid() OR (e.status <> 'draft' AND public.can_view_azubi(auth.uid(), e.azubi_id)))));
DROP TRIGGER IF EXISTS experience_signatures_immutable ON public.experience_signatures;
CREATE TRIGGER experience_signatures_immutable BEFORE UPDATE OR DELETE ON public.experience_signatures
  FOR EACH ROW EXECUTE FUNCTION public.experience_immutable();

DROP POLICY IF EXISTS signatures_select ON storage.objects;
CREATE POLICY signatures_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'signatures' AND (
    split_part(name, '/', 1) = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.report_signatures s JOIN public.reports r ON r.id = s.report_id
      WHERE s.image_path = objects.name AND (r.azubi_id = auth.uid()
        OR (r.status <> 'draft' AND (public.can_view_azubi(auth.uid(), r.azubi_id) OR public.is_leitung(auth.uid())))))
    OR EXISTS (SELECT 1 FROM public.experience_signatures s JOIN public.experience_reports e ON e.id = s.experience_id
      WHERE s.image_path = objects.name AND (e.azubi_id = auth.uid()
        OR (e.status <> 'draft' AND public.can_view_azubi(auth.uid(), e.azubi_id))))));

DROP POLICY IF EXISTS experience_files_insert ON storage.objects;
CREATE POLICY experience_files_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'experience-files' AND split_part(name, '/', 1) = auth.uid()::text AND EXISTS (
    SELECT 1 FROM public.experience_reports e WHERE e.id::text = split_part(objects.name, '/', 2)
      AND e.azubi_id = auth.uid() AND e.status IN ('draft','rejected')));
DROP POLICY IF EXISTS experience_files_delete ON storage.objects;
CREATE POLICY experience_files_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'experience-files' AND split_part(name, '/', 1) = auth.uid()::text AND EXISTS (
    SELECT 1 FROM public.experience_reports e WHERE e.id::text = split_part(objects.name, '/', 2)
      AND e.azubi_id = auth.uid() AND e.status IN ('draft','rejected')));
DROP POLICY IF EXISTS experience_files_select ON storage.objects;
CREATE POLICY experience_files_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'experience-files' AND (split_part(name, '/', 1) = auth.uid()::text OR EXISTS (
    SELECT 1 FROM public.experience_reports e WHERE e.id::text = split_part(objects.name, '/', 2)
      AND e.azubi_id::text = split_part(objects.name, '/', 1) AND e.status <> 'draft'
      AND public.can_view_azubi(auth.uid(), e.azubi_id))));

-- ============ experience_comments ============
CREATE TABLE IF NOT EXISTS public.experience_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id uuid NOT NULL REFERENCES public.experience_reports(id) ON DELETE CASCADE,
  azubi_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) DEFAULT auth.uid(),
  kind text NOT NULL DEFAULT 'comment' CHECK (kind IN ('comment','rejection','approval','reopen')),
  section text NOT NULL DEFAULT '' CHECK (section IN ('','body','reasoning')),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS experience_comments_exp_idx ON public.experience_comments (experience_id, created_at);
GRANT SELECT ON public.experience_comments TO authenticated;
GRANT INSERT (id, experience_id, section, body) ON public.experience_comments TO authenticated;
GRANT ALL ON public.experience_comments TO service_role;
ALTER TABLE public.experience_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS experience_comments_select ON public.experience_comments;
CREATE POLICY experience_comments_select ON public.experience_comments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.experience_reports e WHERE e.id = experience_id AND e.status <> 'draft'
    AND (e.azubi_id = auth.uid() OR public.can_view_azubi(auth.uid(), e.azubi_id))));
DROP POLICY IF EXISTS experience_comments_insert ON public.experience_comments;
CREATE POLICY experience_comments_insert ON public.experience_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND EXISTS (SELECT 1 FROM public.experience_reports e WHERE e.id = experience_id AND e.status <> 'draft'
    AND (e.azubi_id = auth.uid() OR public.can_review_for(auth.uid(), e.azubi_id))));

CREATE OR REPLACE FUNCTION public.experience_comments_derive() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT e.azubi_id INTO NEW.azubi_id FROM public.experience_reports e WHERE e.id = NEW.experience_id;
  IF NEW.azubi_id IS NULL THEN RAISE EXCEPTION 'Erfahrungsbericht nicht gefunden.'; END IF;
  IF NEW.author_id IS NULL THEN NEW.author_id := auth.uid(); END IF;
  NEW.section := coalesce(NEW.section, '');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS experience_comments_derive ON public.experience_comments;
CREATE TRIGGER experience_comments_derive BEFORE INSERT ON public.experience_comments
  FOR EACH ROW EXECUTE FUNCTION public.experience_comments_derive();
DROP TRIGGER IF EXISTS experience_comments_immutable ON public.experience_comments;
CREATE TRIGGER experience_comments_immutable BEFORE UPDATE OR DELETE ON public.experience_comments
  FOR EACH ROW EXECUTE FUNCTION public.experience_immutable();
DROP TRIGGER IF EXISTS experience_comments_no_truncate ON public.experience_comments;
CREATE TRIGGER experience_comments_no_truncate BEFORE TRUNCATE ON public.experience_comments
  FOR EACH STATEMENT EXECUTE FUNCTION public.report_comments_immutable();

CREATE OR REPLACE FUNCTION public.experience_comments_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v RECORD;
BEGIN
  IF NEW.kind <> 'comment' THEN RETURN NEW; END IF;
  IF NEW.author_id = NEW.azubi_id THEN
    FOR v IN SELECT * FROM public.notification_recipients(NEW.azubi_id) LOOP
      INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
      VALUES (v.user_id, 'experience_comment', 'Neuer Kommentar', left(NEW.body, 140), '/erfahrungsberichte/' || NEW.experience_id || '#kommentare', 'experience', NEW.experience_id);
    END LOOP;
  ELSE
    INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
    VALUES (NEW.azubi_id, 'experience_comment', 'Neuer Kommentar', left(NEW.body, 140), '/erfahrungsberichte/' || NEW.experience_id || '#kommentare', 'experience', NEW.experience_id);
  END IF;
  PERFORM public.write_audit('experience', NEW.experience_id, 'comment', NEW.azubi_id,
    jsonb_build_object('comment_id', NEW.id, 'section', NEW.section));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS experience_comments_notify ON public.experience_comments;
CREATE TRIGGER experience_comments_notify AFTER INSERT ON public.experience_comments
  FOR EACH ROW EXECUTE FUNCTION public.experience_comments_notify();
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'experience_comments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.experience_comments;
  END IF;
END $$;

-- ============ Hilfsfunktionen ============
CREATE OR REPLACE FUNCTION public.experience_canonical(p_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('type', 'experience', 'kind', e.kind, 'title', coalesce(e.title, ''), 'area', coalesce(e.area, ''),
    'date', e.written_on, 'body', coalesce(e.body, ''), 'reasoning', coalesce(e.reasoning, ''),
    'attachments', coalesce((SELECT jsonb_agg(a.sha256 ORDER BY a.sha256) FROM public.experience_attachments a WHERE a.experience_id = e.id), '[]'::jsonb))::text
  FROM public.experience_reports e WHERE e.id = p_id
$$;
CREATE OR REPLACE FUNCTION public.experience_hash(p_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT encode(extensions.digest(public.experience_canonical(p_id), 'sha256'), 'hex')
$$;
CREATE OR REPLACE FUNCTION public.experience_title(p_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN btrim(e.title) = '' THEN k.label || ' (ohne Titel)' ELSE k.label || ': ' || btrim(e.title) END
  FROM public.experience_reports e
  CROSS JOIN LATERAL (SELECT CASE e.kind WHEN 'projektbericht' THEN 'Projektbericht' WHEN 'leittext' THEN 'Leittext' ELSE 'Erfahrungsbericht' END AS label) k
  WHERE e.id = p_id
$$;
REVOKE ALL ON FUNCTION public.experience_canonical(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.experience_hash(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.experience_title(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.experience_canonical(uuid), public.experience_hash(uuid), public.experience_title(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.experience_canonical(uuid), public.experience_hash(uuid), public.experience_title(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.verify_experience(p_id uuid)
RETURNS TABLE (experience_id uuid, version int, stored_hash text, computed_hash text, hash_ok boolean, signatures_ok boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.experience_reports%ROWTYPE; ch text;
BEGIN
  SELECT * INTO e FROM public.experience_reports x WHERE x.id = p_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (e.azubi_id = auth.uid() OR (e.status <> 'draft' AND public.can_view_azubi(auth.uid(), e.azubi_id))) THEN
    RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.';
  END IF;
  ch := public.experience_hash(e.id);
  experience_id := e.id; version := e.version; stored_hash := e.content_hash; computed_hash := ch;
  IF e.content_hash IS NULL THEN hash_ok := NULL; signatures_ok := NULL;
  ELSE
    hash_ok := e.content_hash = ch;
    signatures_ok := NOT EXISTS (SELECT 1 FROM public.experience_signatures s WHERE s.experience_id = e.id
      AND s.experience_version = e.version AND s.content_hash IS DISTINCT FROM e.content_hash);
  END IF;
  RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.verify_experience(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_experience(uuid) TO authenticated;

-- ============ Einreichen, Freigeben, Zurückweisen, Wieder öffnen ============
CREATE OR REPLACE FUNCTION public.submit_experience(p_id uuid, p_expected_version int, p_method text, p_image_path text DEFAULT NULL, p_client_signed_at timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.experience_reports%ROWTYPE; nv int; h text; signer text; rc RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF p_method NOT IN ('draw','click') THEN RAISE EXCEPTION 'Ungültige Bestätigungsmethode.'; END IF;
  SELECT * INTO e FROM public.experience_reports WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR e.azubi_id <> auth.uid() THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF e.status NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'Dieser Erfahrungsbericht lässt sich nicht einreichen.'; END IF;
  IF e.version <> p_expected_version THEN RAISE EXCEPTION 'Der Erfahrungsbericht wurde inzwischen geändert.'; END IF;
  IF char_length(btrim(e.title)) NOT BETWEEN 3 AND 150 THEN RAISE EXCEPTION 'Bitte gib einen Titel an (mindestens 3 Zeichen).'; END IF;
  IF char_length(btrim(e.body)) < 200 THEN RAISE EXCEPTION 'Der Bericht ist noch zu kurz. Schreibe mindestens 200 Zeichen.'; END IF;
  IF p_method = 'draw' THEN
    IF p_image_path IS NULL OR p_image_path NOT LIKE auth.uid()::text || '/%' OR NOT EXISTS (
      SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'signatures' AND o.name = p_image_path) THEN
      RAISE EXCEPTION 'Die Unterschriftsdatei wurde nicht gefunden.';
    END IF;
  END IF;
  nv := e.version + 1;
  h := public.experience_hash(p_id);
  PERFORM set_config('azuvera.experience_transition', 'on', true);
  UPDATE public.experience_reports SET status = 'submitted', version = nv, content_hash = h, submitted_at = now(),
    reviewed_at = NULL, reviewer_id = NULL, review_note = NULL WHERE id = p_id;
  SELECT full_name INTO signer FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.experience_signatures (experience_id, role, signer_id, signer_name, signer_role_label, method, image_path, content_hash, experience_version, client_signed_at)
  VALUES (p_id, 'azubi', auth.uid(), coalesce(signer, ''), 'Auszubildende:r', p_method, CASE WHEN p_method = 'draw' THEN p_image_path END, h, nv, p_client_signed_at);
  FOR rc IN SELECT * FROM public.notification_recipients(auth.uid()) LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
    VALUES (rc.user_id, 'experience_submitted',
      'Neuer Erfahrungsbericht zur Prüfung' || CASE WHEN rc.deputy_for IS NOT NULL THEN ' (Vertretung für ' || coalesce((SELECT full_name FROM public.profiles WHERE id = rc.deputy_for), '') || ')' ELSE '' END,
      public.experience_title(p_id), '/erfahrungsberichte/' || p_id, 'experience', p_id);
  END LOOP;
  PERFORM public.write_audit('experience', p_id, 'submit', auth.uid(), jsonb_build_object('version', nv, 'content_hash', h, 'method', p_method));
  PERFORM set_config('azuvera.experience_transition', '', true);
END $$;

CREATE OR REPLACE FUNCTION public.approve_experience(p_id uuid, p_expected_version int, p_method text, p_image_path text DEFAULT NULL, p_note text DEFAULT NULL, p_client_signed_at timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.experience_reports%ROWTYPE; v_path text; v_name text; v_role public.app_role; v_label text; v_behalf uuid; v_note text := btrim(coalesce(p_note, ''));
BEGIN
  IF p_method NOT IN ('draw','saved','click') THEN RAISE EXCEPTION 'Ungültige Bestätigungsmethode.'; END IF;
  SELECT * INTO e FROM public.experience_reports WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR auth.uid() = e.azubi_id OR NOT public.can_review_for(auth.uid(), e.azubi_id) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF e.status <> 'submitted' THEN RAISE EXCEPTION 'Der Erfahrungsbericht ist nicht mehr zur Prüfung vorgesehen.'; END IF;
  IF e.version <> p_expected_version THEN RAISE EXCEPTION 'Der Erfahrungsbericht wurde inzwischen geändert.'; END IF;
  IF e.content_hash IS DISTINCT FROM public.experience_hash(p_id) THEN RAISE EXCEPTION 'Die Prüfsumme stimmt nicht mehr. Bitte weise den Erfahrungsbericht zurück.'; END IF;
  IF char_length(v_note) > 2000 THEN RAISE EXCEPTION 'Die Notiz darf höchstens 2000 Zeichen lang sein.'; END IF;
  IF p_method = 'draw' THEN
    IF p_image_path IS NULL OR p_image_path NOT LIKE auth.uid()::text || '/%' OR NOT EXISTS (
      SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'signatures' AND o.name = p_image_path) THEN
      RAISE EXCEPTION 'Die Unterschriftsdatei wurde nicht gefunden.';
    END IF;
    v_path := p_image_path;
  ELSIF p_method = 'saved' THEN
    SELECT us.image_path INTO v_path FROM public.user_signatures us WHERE us.user_id = auth.uid();
    IF v_path IS NULL THEN RAISE EXCEPTION 'Du hast noch keine gespeicherte Unterschrift.'; END IF;
  END IF;
  v_behalf := public.acting_principal(auth.uid(), e.azubi_id);
  SELECT p.full_name, ur.role INTO v_name, v_role FROM public.profiles p LEFT JOIN public.user_roles ur ON ur.user_id = p.id WHERE p.id = auth.uid();
  v_label := CASE v_role WHEN 'ausbilder' THEN 'Ausbilder:in' WHEN 'betriebsleiter' THEN 'Betriebsleiter:in' WHEN 'ausbildungsleitung' THEN 'Ausbildungsleitung' WHEN 'ausbildungsberater' THEN 'Ausbildungsberater:in' WHEN 'lehrer' THEN 'Lehrer:in' ELSE 'Prüfende Person' END;
  PERFORM set_config('azuvera.experience_transition', 'on', true);
  UPDATE public.experience_reports SET status = 'approved', reviewed_at = now(), reviewer_id = auth.uid(), review_note = v_note WHERE id = p_id;
  INSERT INTO public.experience_signatures (experience_id, role, signer_id, signer_name, signer_role_label, on_behalf_of, method, image_path, content_hash, experience_version, client_signed_at)
  VALUES (p_id, 'ausbilder', auth.uid(), coalesce(v_name, ''), v_label, v_behalf, p_method, v_path, e.content_hash, e.version, p_client_signed_at);
  IF v_note <> '' THEN
    INSERT INTO public.experience_comments (experience_id, author_id, kind, body) VALUES (p_id, auth.uid(), 'approval', v_note);
  END IF;
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (e.azubi_id, 'experience_approved', 'Erfahrungsbericht freigegeben', public.experience_title(p_id), '/erfahrungsberichte/' || p_id, 'experience', p_id);
  PERFORM public.write_audit('experience', p_id, 'approve', e.azubi_id,
    jsonb_build_object('version', e.version, 'content_hash', e.content_hash, 'method', p_method, 'on_behalf_of', v_behalf));
  PERFORM set_config('azuvera.experience_transition', '', true);
END $$;

CREATE OR REPLACE FUNCTION public.reject_experience(p_id uuid, p_expected_version int, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.experience_reports%ROWTYPE; v_note text := btrim(coalesce(p_note, ''));
BEGIN
  SELECT * INTO e FROM public.experience_reports WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR auth.uid() = e.azubi_id OR NOT public.can_review_for(auth.uid(), e.azubi_id) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF e.status <> 'submitted' THEN RAISE EXCEPTION 'Der Erfahrungsbericht ist nicht mehr zur Prüfung vorgesehen.'; END IF;
  IF e.version <> p_expected_version THEN RAISE EXCEPTION 'Der Erfahrungsbericht wurde inzwischen geändert.'; END IF;
  IF char_length(v_note) NOT BETWEEN 3 AND 2000 THEN RAISE EXCEPTION 'Bitte eine Begründung angeben.'; END IF;
  PERFORM set_config('azuvera.experience_transition', 'on', true);
  UPDATE public.experience_reports SET status = 'rejected', reviewed_at = now(), reviewer_id = auth.uid(), review_note = v_note WHERE id = p_id;
  INSERT INTO public.experience_comments (experience_id, author_id, kind, body) VALUES (p_id, auth.uid(), 'rejection', v_note);
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (e.azubi_id, 'experience_rejected', 'Erfahrungsbericht zurückgewiesen', left(v_note, 140), '/erfahrungsberichte/' || p_id, 'experience', p_id);
  PERFORM public.write_audit('experience', p_id, 'reject', e.azubi_id, jsonb_build_object('version', e.version, 'content_hash', e.content_hash));
  PERFORM set_config('azuvera.experience_transition', '', true);
END $$;

CREATE OR REPLACE FUNCTION public.reopen_experience(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.experience_reports%ROWTYPE; v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_leitung(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  SELECT * INTO e FROM public.experience_reports WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Erfahrungsbericht nicht gefunden.'; END IF;
  IF e.status <> 'approved' THEN RAISE EXCEPTION 'Nur freigegebene Erfahrungsberichte können wieder geöffnet werden.'; END IF;
  IF char_length(v_reason) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Bitte eine Begründung mit 10 bis 1000 Zeichen angeben.'; END IF;
  PERFORM set_config('azuvera.experience_transition', 'on', true);
  UPDATE public.experience_reports SET status = 'draft', version = version + 1, reviewed_at = NULL, reviewer_id = NULL, review_note = NULL WHERE id = p_id;
  INSERT INTO public.experience_comments (experience_id, author_id, kind, body) VALUES (p_id, auth.uid(), 'reopen', v_reason);
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (e.azubi_id, 'experience_reopened', 'Erfahrungsbericht wieder geöffnet', left(v_reason, 140), '/erfahrungsberichte/' || p_id, 'experience', p_id);
  PERFORM public.write_audit('experience', p_id, 'reopen', e.azubi_id, jsonb_build_object('version', e.version + 1));
  PERFORM set_config('azuvera.experience_transition', '', true);
END $$;
REVOKE ALL ON FUNCTION public.submit_experience(uuid, int, text, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_experience(uuid, int, text, text, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_experience(uuid, int, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reopen_experience(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_experience(uuid, int, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_experience(uuid, int, text, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_experience(uuid, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_experience(uuid, text) TO authenticated;

-- ============ Abfragen ============
CREATE OR REPLACE FUNCTION public.experience_review_queue(statuses public.report_status[] DEFAULT '{submitted}')
RETURNS TABLE (experience_id uuid, azubi_id uuid, status public.report_status, submitted_at timestamptz, deputy_for uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.azubi_id, e.status, e.submitted_at, public.acting_principal(auth.uid(), e.azubi_id)
  FROM public.experience_reports e
  WHERE e.status = ANY (statuses) AND e.azubi_id <> auth.uid() AND public.can_review_for(auth.uid(), e.azubi_id)
  ORDER BY e.submitted_at ASC NULLS LAST
$$;
REVOKE ALL ON FUNCTION public.experience_review_queue(public.report_status[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.experience_review_queue(public.report_status[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.experience_year_counts(p_azubi uuid)
RETURNS TABLE (azubi_id uuid, year_no int, year_start date, year_end date, is_current boolean, required int, approved int, submitted int,
  requirement_id uuid, bundesland text, profession_code text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  p RECORD; req public.experience_requirements; total int; cur int; n int; b RECORD; bl text;
  today date := (now() AT TIME ZONE 'Europe/Berlin')::date;
BEGIN
  SELECT pr.id, pr.ausbildungsbeginn AS beginn, pr.ausbildungsende AS ende, pf.code AS pcode INTO p
  FROM public.profiles pr LEFT JOIN public.professions pf ON pf.id = pr.profession_id
  WHERE pr.id = p_azubi AND pr.ausbildungsbeginn IS NOT NULL AND public.has_role(pr.id, 'azubi');
  IF NOT FOUND THEN RETURN; END IF;
  bl := public.effective_bundesland(p_azubi);
  req := public.experience_requirement_for(bl, p.pcode);
  total := public.training_year_count(p.beginn, p.ende);
  cur := public.training_year_clamped(p.beginn, p.ende, today);
  FOR n IN 1..total LOOP
    SELECT * INTO b FROM public.training_year_bounds(p.beginn, p.ende, n);
    azubi_id := p_azubi; year_no := n; year_start := b.year_start; year_end := b.year_end; is_current := (n = cur);
    required := req.required_per_year; requirement_id := req.id; bundesland := bl; profession_code := p.pcode;
    SELECT coalesce(sum(x.pts) FILTER (WHERE x.st = 'approved'), 0)::int, coalesce(sum(x.pts) FILTER (WHERE x.st = 'submitted'), 0)::int
      INTO approved, submitted
    FROM (SELECT er.status AS st, CASE WHEN er.kind = 'leittext' THEN req.leittext_weight ELSE 1 END AS pts
          FROM public.experience_reports er
          WHERE er.azubi_id = p_azubi AND er.status IN ('approved','submitted')
            AND public.training_year_clamped(p.beginn, p.ende, er.written_on) = n) x;
    RETURN NEXT;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.experience_year_counts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.experience_year_counts(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.team_experience_overview(p_azubi uuid DEFAULT NULL)
RETURNS TABLE (azubi_id uuid, year_no int, year_start date, year_end date, is_current boolean, required int, approved int, submitted int,
  requirement_id uuid, bundesland text, profession_code text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF p_azubi IS NOT NULL THEN
    IF NOT public.can_view_azubi(auth.uid(), p_azubi) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
    RETURN QUERY SELECT * FROM public.experience_year_counts(p_azubi);
    RETURN;
  END IF;
  RETURN QUERY SELECT c.* FROM public.user_roles ur CROSS JOIN LATERAL public.experience_year_counts(ur.user_id) c
    WHERE ur.role = 'azubi' AND public.can_view_azubi(auth.uid(), ur.user_id);
END $$;
REVOKE ALL ON FUNCTION public.team_experience_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_experience_overview(uuid) TO authenticated;

-- ============ Protokoll ============
CREATE OR REPLACE FUNCTION public.audit_experience_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fields text[] := ARRAY[]::text[];
BEGIN
  IF public.account_removal_active() THEN RETURN coalesce(NEW, OLD); END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('experience', NEW.id, 'create', NEW.azubi_id, jsonb_build_object('kind', NEW.kind, 'written_on', NEW.written_on));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'draft' THEN
      PERFORM public.write_audit('experience', OLD.id, 'delete', OLD.azubi_id, jsonb_build_object('kind', OLD.kind, 'written_on', OLD.written_on));
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.kind IS DISTINCT FROM OLD.kind THEN v_fields := array_append(v_fields, 'kind'::text); END IF;
  IF NEW.title IS DISTINCT FROM OLD.title THEN v_fields := array_append(v_fields, 'title'::text); END IF;
  IF NEW.area IS DISTINCT FROM OLD.area THEN v_fields := array_append(v_fields, 'area'::text); END IF;
  IF NEW.written_on IS DISTINCT FROM OLD.written_on THEN v_fields := array_append(v_fields, 'written_on'::text); END IF;
  IF NEW.body IS DISTINCT FROM OLD.body THEN v_fields := array_append(v_fields, 'body'::text); END IF;
  IF NEW.reasoning IS DISTINCT FROM OLD.reasoning THEN v_fields := array_append(v_fields, 'reasoning'::text); END IF;
  IF cardinality(v_fields) = 0 THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.audit_log a WHERE a.entity_type = 'experience' AND a.entity_id = NEW.id AND a.action = 'edit'
    AND a.created_at > now() - interval '60 minutes') THEN RETURN NEW; END IF;
  PERFORM public.write_audit('experience', NEW.id, 'edit', NEW.azubi_id, jsonb_build_object('version', NEW.version, 'fields', to_jsonb(v_fields)));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_experience_change ON public.experience_reports;
CREATE TRIGGER audit_experience_change AFTER INSERT OR UPDATE OR DELETE ON public.experience_reports
  FOR EACH ROW EXECUTE FUNCTION public.audit_experience_change();

CREATE OR REPLACE FUNCTION public.audit_experience_attachments_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.account_removal_active() THEN RETURN coalesce(NEW, OLD); END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('experience', NEW.experience_id, 'attachment_add', NEW.azubi_id,
      jsonb_build_object('attachment_id', NEW.id, 'mime_type', NEW.mime_type, 'size_bytes', NEW.size_bytes, 'sha256', NEW.sha256));
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.experience_reports e WHERE e.id = OLD.experience_id) THEN
    PERFORM public.write_audit('experience', OLD.experience_id, 'attachment_delete', OLD.azubi_id,
      jsonb_build_object('attachment_id', OLD.id, 'mime_type', OLD.mime_type, 'size_bytes', OLD.size_bytes, 'sha256', OLD.sha256));
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS audit_experience_attachments_change ON public.experience_attachments;
CREATE TRIGGER audit_experience_attachments_change AFTER INSERT OR DELETE ON public.experience_attachments
  FOR EACH ROW EXECUTE FUNCTION public.audit_experience_attachments_change();
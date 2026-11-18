-- ============ Leittexte: Katalog ============
CREATE TABLE IF NOT EXISTS public.leittexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 200),
  profession_codes text[] NOT NULL DEFAULT '{}',
  topic text NOT NULL DEFAULT '',
  issuer text NOT NULL DEFAULT 'Bundesanstalt für Landwirtschaft und Ernährung (BLE)',
  stand text,
  order_no text,
  source_url text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  published boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leittexts_professions_idx ON public.leittexts USING gin (profession_codes);
GRANT SELECT ON public.leittexts TO authenticated;
GRANT ALL ON public.leittexts TO service_role;
ALTER TABLE public.leittexts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leittexts_select ON public.leittexts;
CREATE POLICY leittexts_select ON public.leittexts FOR SELECT TO authenticated
  USING (published OR public.is_team(auth.uid()));
DROP TRIGGER IF EXISTS leittexts_updated ON public.leittexts;
CREATE TRIGGER leittexts_updated BEFORE UPDATE ON public.leittexts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Bearbeitungen ============
CREATE TABLE IF NOT EXISTS public.leittext_works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  azubi_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leittext_id uuid NOT NULL REFERENCES public.leittexts(id) ON DELETE RESTRICT,
  header jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(header::text) <= 4000),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(answers::text) <= 600000),
  status public.report_status NOT NULL DEFAULT 'draft',
  version int NOT NULL DEFAULT 1,
  content_hash text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (azubi_id, leittext_id)
);
CREATE INDEX IF NOT EXISTS leittext_works_submitted_idx ON public.leittext_works (status, submitted_at) WHERE status = 'submitted';
GRANT SELECT, DELETE ON public.leittext_works TO authenticated;
GRANT INSERT (id, azubi_id, leittext_id, header, answers) ON public.leittext_works TO authenticated;
GRANT UPDATE (header, answers) ON public.leittext_works TO authenticated;
GRANT ALL ON public.leittext_works TO service_role;
ALTER TABLE public.leittext_works ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leittext_works_select ON public.leittext_works;
CREATE POLICY leittext_works_select ON public.leittext_works FOR SELECT TO authenticated
  USING (azubi_id = auth.uid() OR (status <> 'draft' AND public.can_view_azubi(auth.uid(), azubi_id)));
DROP POLICY IF EXISTS leittext_works_insert ON public.leittext_works;
CREATE POLICY leittext_works_insert ON public.leittext_works FOR INSERT TO authenticated
  WITH CHECK (azubi_id = auth.uid() AND status = 'draft' AND public.has_role(auth.uid(), 'azubi'));
DROP POLICY IF EXISTS leittext_works_update ON public.leittext_works;
CREATE POLICY leittext_works_update ON public.leittext_works FOR UPDATE TO authenticated
  USING (azubi_id = auth.uid() AND status IN ('draft','rejected'))
  WITH CHECK (azubi_id = auth.uid() AND status IN ('draft','rejected'));
DROP POLICY IF EXISTS leittext_works_delete ON public.leittext_works;
CREATE POLICY leittext_works_delete ON public.leittext_works FOR DELETE TO authenticated
  USING (azubi_id = auth.uid() AND status = 'draft');
DROP TRIGGER IF EXISTS leittext_works_updated ON public.leittext_works;
CREATE TRIGGER leittext_works_updated BEFORE UPDATE ON public.leittext_works FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.leittext_works_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  tr boolean := coalesce(current_setting('azuvera.leittext_transition', true), '') = 'on';
  content_changed boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' AND NOT public.account_removal_active() THEN RAISE EXCEPTION 'Nur Entwürfe lassen sich löschen.'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT tr AND (NEW.status <> 'draft' OR NEW.version <> 1 OR NEW.content_hash IS NOT NULL OR NEW.submitted_at IS NOT NULL
      OR NEW.reviewed_at IS NOT NULL OR NEW.reviewer_id IS NOT NULL OR NEW.review_note IS NOT NULL) THEN
      RAISE EXCEPTION 'Status und Prüffelder können nur vom System gesetzt werden.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.leittexts l WHERE l.id = NEW.leittext_id AND l.published) THEN
      RAISE EXCEPTION 'Dieser Leittext ist nicht verfügbar.';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.azubi_id IS DISTINCT FROM OLD.azubi_id OR NEW.leittext_id IS DISTINCT FROM OLD.leittext_id THEN
    RAISE EXCEPTION 'Leittext und Person lassen sich nicht ändern.';
  END IF;
  content_changed := NEW.header IS DISTINCT FROM OLD.header OR NEW.answers IS DISTINCT FROM OLD.answers;
  IF NOT tr THEN
    IF OLD.reviewer_id IS NOT NULL AND NEW.reviewer_id IS NULL AND NOT content_changed
      AND NEW.status = OLD.status AND NEW.version = OLD.version AND NEW.content_hash IS NOT DISTINCT FROM OLD.content_hash
      AND NEW.submitted_at IS NOT DISTINCT FROM OLD.submitted_at AND NEW.reviewed_at IS NOT DISTINCT FROM OLD.reviewed_at
      AND NEW.review_note IS NOT DISTINCT FROM OLD.review_note THEN
      RETURN NEW;
    END IF;
    IF OLD.status = 'approved' THEN RAISE EXCEPTION 'Freigegebene Leittexte sind unveränderlich.'; END IF;
    IF OLD.status = 'submitted' THEN RAISE EXCEPTION 'Eingereichte Leittexte lassen sich nicht ändern.'; END IF;
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
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS leittext_works_guard ON public.leittext_works;
CREATE TRIGGER leittext_works_guard BEFORE INSERT OR UPDATE OR DELETE ON public.leittext_works
  FOR EACH ROW EXECUTE FUNCTION public.leittext_works_guard();

-- ============ Fotos und Skizzen ============
CREATE TABLE IF NOT EXISTS public.leittext_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.leittext_works(id) ON DELETE CASCADE,
  azubi_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  field_key text NOT NULL CHECK (char_length(field_key) BETWEEN 1 AND 80),
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
CREATE INDEX IF NOT EXISTS leittext_attachments_work_idx ON public.leittext_attachments (work_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leittext_attachments TO authenticated;
GRANT ALL ON public.leittext_attachments TO service_role;
ALTER TABLE public.leittext_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leittext_attachments_select ON public.leittext_attachments;
CREATE POLICY leittext_attachments_select ON public.leittext_attachments FOR SELECT TO authenticated
  USING (azubi_id = auth.uid() OR (public.can_view_azubi(auth.uid(), azubi_id)
    AND EXISTS (SELECT 1 FROM public.leittext_works w WHERE w.id = work_id AND w.status <> 'draft')));
DROP POLICY IF EXISTS leittext_attachments_insert ON public.leittext_attachments;
CREATE POLICY leittext_attachments_insert ON public.leittext_attachments FOR INSERT TO authenticated
  WITH CHECK (azubi_id = auth.uid() AND EXISTS (SELECT 1 FROM public.leittext_works w
    WHERE w.id = work_id AND w.azubi_id = auth.uid() AND w.status IN ('draft','rejected')));
DROP POLICY IF EXISTS leittext_attachments_update ON public.leittext_attachments;
CREATE POLICY leittext_attachments_update ON public.leittext_attachments FOR UPDATE TO authenticated
  USING (azubi_id = auth.uid() AND EXISTS (SELECT 1 FROM public.leittext_works w WHERE w.id = work_id AND w.status IN ('draft','rejected')))
  WITH CHECK (azubi_id = auth.uid());
DROP POLICY IF EXISTS leittext_attachments_delete ON public.leittext_attachments;
CREATE POLICY leittext_attachments_delete ON public.leittext_attachments FOR DELETE TO authenticated
  USING (azubi_id = auth.uid() AND EXISTS (SELECT 1 FROM public.leittext_works w WHERE w.id = work_id AND w.status IN ('draft','rejected')));

CREATE OR REPLACE FUNCTION public.leittext_attachments_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.azubi_id := (SELECT azubi_id FROM public.leittext_works WHERE id = NEW.work_id);
    IF NEW.azubi_id IS NULL THEN RAISE EXCEPTION 'Leittext nicht gefunden.'; END IF;
    IF (SELECT count(*) FROM public.leittext_attachments WHERE work_id = NEW.work_id) >= 60 THEN
      RAISE EXCEPTION 'Höchstens 60 Bilder je Leittext.';
    END IF;
  ELSIF NEW.work_id IS DISTINCT FROM OLD.work_id OR NEW.azubi_id IS DISTINCT FROM OLD.azubi_id
    OR NEW.storage_path IS DISTINCT FROM OLD.storage_path OR NEW.sha256 IS DISTINCT FROM OLD.sha256 OR NEW.field_key IS DISTINCT FROM OLD.field_key THEN
    RAISE EXCEPTION 'Nur Beschriftung und Reihenfolge lassen sich ändern.';
  END IF;
  IF NEW.size_bytes > 10485760 THEN RAISE EXCEPTION 'Dateien dürfen höchstens 10 MB groß sein.'; END IF;
  IF NEW.mime_type NOT IN ('image/jpeg','image/png','image/webp') THEN RAISE EXCEPTION 'Erlaubt sind nur Fotos und Bilder.'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS leittext_attachments_guard ON public.leittext_attachments;
CREATE TRIGGER leittext_attachments_guard BEFORE INSERT OR UPDATE ON public.leittext_attachments
  FOR EACH ROW EXECUTE FUNCTION public.leittext_attachments_guard();

DROP POLICY IF EXISTS leittext_files_insert ON storage.objects;
CREATE POLICY leittext_files_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'leittext-files' AND split_part(name, '/', 1) = auth.uid()::text AND EXISTS (
    SELECT 1 FROM public.leittext_works w WHERE w.id::text = split_part(objects.name, '/', 2)
      AND w.azubi_id = auth.uid() AND w.status IN ('draft','rejected')));
DROP POLICY IF EXISTS leittext_files_delete ON storage.objects;
CREATE POLICY leittext_files_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'leittext-files' AND split_part(name, '/', 1) = auth.uid()::text AND EXISTS (
    SELECT 1 FROM public.leittext_works w WHERE w.id::text = split_part(objects.name, '/', 2)
      AND w.azubi_id = auth.uid() AND w.status IN ('draft','rejected')));
DROP POLICY IF EXISTS leittext_files_select ON storage.objects;
CREATE POLICY leittext_files_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'leittext-files' AND (split_part(name, '/', 1) = auth.uid()::text OR EXISTS (
    SELECT 1 FROM public.leittext_works w WHERE w.id::text = split_part(objects.name, '/', 2)
      AND w.azubi_id::text = split_part(objects.name, '/', 1) AND w.status <> 'draft'
      AND public.can_view_azubi(auth.uid(), w.azubi_id))));

-- ============ Kommentare ============
CREATE TABLE IF NOT EXISTS public.leittext_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.leittext_works(id) ON DELETE CASCADE,
  azubi_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) DEFAULT auth.uid(),
  kind text NOT NULL DEFAULT 'comment' CHECK (kind IN ('comment','rejection','approval','reopen')),
  task_key text NOT NULL DEFAULT '' CHECK (char_length(task_key) <= 80),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leittext_comments_work_idx ON public.leittext_comments (work_id, created_at);
GRANT SELECT ON public.leittext_comments TO authenticated;
GRANT INSERT (id, work_id, task_key, body) ON public.leittext_comments TO authenticated;
GRANT ALL ON public.leittext_comments TO service_role;
ALTER TABLE public.leittext_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leittext_comments_select ON public.leittext_comments;
CREATE POLICY leittext_comments_select ON public.leittext_comments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leittext_works w WHERE w.id = work_id AND w.status <> 'draft'
    AND (w.azubi_id = auth.uid() OR public.can_view_azubi(auth.uid(), w.azubi_id))));
DROP POLICY IF EXISTS leittext_comments_insert ON public.leittext_comments;
CREATE POLICY leittext_comments_insert ON public.leittext_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND EXISTS (SELECT 1 FROM public.leittext_works w WHERE w.id = work_id AND w.status <> 'draft'
    AND (w.azubi_id = auth.uid() OR public.can_review_for(auth.uid(), w.azubi_id))));

CREATE OR REPLACE FUNCTION public.leittext_comments_derive() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT w.azubi_id INTO NEW.azubi_id FROM public.leittext_works w WHERE w.id = NEW.work_id;
  IF NEW.azubi_id IS NULL THEN RAISE EXCEPTION 'Leittext nicht gefunden.'; END IF;
  IF NEW.author_id IS NULL THEN NEW.author_id := auth.uid(); END IF;
  NEW.task_key := coalesce(NEW.task_key, '');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS leittext_comments_derive ON public.leittext_comments;
CREATE TRIGGER leittext_comments_derive BEFORE INSERT ON public.leittext_comments
  FOR EACH ROW EXECUTE FUNCTION public.leittext_comments_derive();
DROP TRIGGER IF EXISTS leittext_comments_immutable ON public.leittext_comments;
CREATE TRIGGER leittext_comments_immutable BEFORE UPDATE OR DELETE ON public.leittext_comments
  FOR EACH ROW EXECUTE FUNCTION public.experience_immutable();
DROP TRIGGER IF EXISTS leittext_comments_no_truncate ON public.leittext_comments;
CREATE TRIGGER leittext_comments_no_truncate BEFORE TRUNCATE ON public.leittext_comments
  FOR EACH STATEMENT EXECUTE FUNCTION public.report_comments_immutable();

CREATE OR REPLACE FUNCTION public.leittext_title(p_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'Leittext: ' || l.title FROM public.leittext_works w JOIN public.leittexts l ON l.id = w.leittext_id WHERE w.id = p_id
$$;

CREATE OR REPLACE FUNCTION public.leittext_comments_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v RECORD;
BEGIN
  IF NEW.kind <> 'comment' THEN RETURN NEW; END IF;
  IF NEW.author_id = NEW.azubi_id THEN
    FOR v IN SELECT * FROM public.notification_recipients(NEW.azubi_id) LOOP
      INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
      VALUES (v.user_id, 'leittext_comment', 'Neuer Kommentar', left(NEW.body, 140), '/leittexte/arbeit/' || NEW.work_id || '#kommentare', 'leittext', NEW.work_id);
    END LOOP;
  ELSE
    INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
    VALUES (NEW.azubi_id, 'leittext_comment', 'Neuer Kommentar', left(NEW.body, 140), '/leittexte/arbeit/' || NEW.work_id || '#kommentare', 'leittext', NEW.work_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS leittext_comments_notify ON public.leittext_comments;
CREATE TRIGGER leittext_comments_notify AFTER INSERT ON public.leittext_comments
  FOR EACH ROW EXECUTE FUNCTION public.leittext_comments_notify();
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'leittext_comments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leittext_comments;
  END IF;
END $$;

-- ============ Prüfsumme ============
CREATE OR REPLACE FUNCTION public.leittext_hash(p_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT encode(extensions.digest(jsonb_build_object('type', 'leittext', 'leittext', w.leittext_id, 'header', w.header, 'answers', w.answers,
    'attachments', coalesce((SELECT jsonb_agg(coalesce(a.sha256, a.id::text) ORDER BY coalesce(a.sha256, a.id::text)) FROM public.leittext_attachments a WHERE a.work_id = w.id), '[]'::jsonb))::text, 'sha256'), 'hex')
  FROM public.leittext_works w WHERE w.id = p_id
$$;
REVOKE ALL ON FUNCTION public.leittext_hash(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.leittext_title(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leittext_hash(uuid), public.leittext_title(uuid) TO service_role;

-- ============ Einreichen, Freigeben, Zurückgeben, Wieder öffnen ============
CREATE OR REPLACE FUNCTION public.submit_leittext(p_id uuid, p_expected_version int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.leittext_works%ROWTYPE; nv int; h text; rc RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  SELECT * INTO w FROM public.leittext_works WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR w.azubi_id <> auth.uid() THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF w.status NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'Dieser Leittext lässt sich nicht einreichen.'; END IF;
  IF w.version <> p_expected_version THEN RAISE EXCEPTION 'Der Leittext wurde inzwischen geändert.'; END IF;
  IF w.answers = '{}'::jsonb THEN RAISE EXCEPTION 'Bitte bearbeite zuerst mindestens eine Aufgabe.'; END IF;
  nv := w.version + 1;
  h := public.leittext_hash(p_id);
  PERFORM set_config('azuvera.leittext_transition', 'on', true);
  UPDATE public.leittext_works SET status = 'submitted', version = nv, content_hash = h, submitted_at = now(),
    reviewed_at = NULL, reviewer_id = NULL, review_note = NULL WHERE id = p_id;
  FOR rc IN SELECT * FROM public.notification_recipients(auth.uid()) LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
    VALUES (rc.user_id, 'leittext_submitted',
      'Neuer Leittext zur Prüfung' || CASE WHEN rc.deputy_for IS NOT NULL THEN ' (Vertretung für ' || coalesce((SELECT full_name FROM public.profiles WHERE id = rc.deputy_for), '') || ')' ELSE '' END,
      public.leittext_title(p_id), '/leittexte/arbeit/' || p_id, 'leittext', p_id);
  END LOOP;
  PERFORM public.write_audit('leittext', p_id, 'submit', auth.uid(), jsonb_build_object('version', nv, 'content_hash', h));
  PERFORM set_config('azuvera.leittext_transition', '', true);
END $$;

CREATE OR REPLACE FUNCTION public.approve_leittext(p_id uuid, p_expected_version int, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.leittext_works%ROWTYPE; v_note text := btrim(coalesce(p_note, '')); v_behalf uuid;
BEGIN
  SELECT * INTO w FROM public.leittext_works WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR auth.uid() = w.azubi_id OR NOT public.can_review_for(auth.uid(), w.azubi_id) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF w.status <> 'submitted' THEN RAISE EXCEPTION 'Der Leittext ist nicht mehr zur Prüfung vorgesehen.'; END IF;
  IF w.version <> p_expected_version THEN RAISE EXCEPTION 'Der Leittext wurde inzwischen geändert.'; END IF;
  IF w.content_hash IS DISTINCT FROM public.leittext_hash(p_id) THEN RAISE EXCEPTION 'Die Prüfsumme stimmt nicht mehr. Bitte gib den Leittext zurück.'; END IF;
  IF char_length(v_note) > 2000 THEN RAISE EXCEPTION 'Die Notiz darf höchstens 2000 Zeichen lang sein.'; END IF;
  v_behalf := public.acting_principal(auth.uid(), w.azubi_id);
  PERFORM set_config('azuvera.leittext_transition', 'on', true);
  UPDATE public.leittext_works SET status = 'approved', reviewed_at = now(), reviewer_id = auth.uid(), review_note = nullif(v_note, '') WHERE id = p_id;
  IF v_note <> '' THEN
    INSERT INTO public.leittext_comments (work_id, author_id, kind, body) VALUES (p_id, auth.uid(), 'approval', v_note);
  END IF;
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (w.azubi_id, 'leittext_approved', 'Leittext freigegeben', public.leittext_title(p_id), '/leittexte/arbeit/' || p_id, 'leittext', p_id);
  PERFORM public.write_audit('leittext', p_id, 'approve', w.azubi_id, jsonb_build_object('version', w.version, 'content_hash', w.content_hash, 'on_behalf_of', v_behalf));
  PERFORM set_config('azuvera.leittext_transition', '', true);
END $$;

CREATE OR REPLACE FUNCTION public.reject_leittext(p_id uuid, p_expected_version int, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.leittext_works%ROWTYPE; v_note text := btrim(coalesce(p_note, ''));
BEGIN
  SELECT * INTO w FROM public.leittext_works WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR auth.uid() = w.azubi_id OR NOT public.can_review_for(auth.uid(), w.azubi_id) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF w.status <> 'submitted' THEN RAISE EXCEPTION 'Der Leittext ist nicht mehr zur Prüfung vorgesehen.'; END IF;
  IF w.version <> p_expected_version THEN RAISE EXCEPTION 'Der Leittext wurde inzwischen geändert.'; END IF;
  IF char_length(v_note) NOT BETWEEN 3 AND 2000 THEN RAISE EXCEPTION 'Bitte eine Begründung angeben.'; END IF;
  PERFORM set_config('azuvera.leittext_transition', 'on', true);
  UPDATE public.leittext_works SET status = 'rejected', reviewed_at = now(), reviewer_id = auth.uid(), review_note = v_note WHERE id = p_id;
  INSERT INTO public.leittext_comments (work_id, author_id, kind, body) VALUES (p_id, auth.uid(), 'rejection', v_note);
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (w.azubi_id, 'leittext_rejected', 'Leittext zurückgegeben', left(v_note, 140), '/leittexte/arbeit/' || p_id, 'leittext', p_id);
  PERFORM public.write_audit('leittext', p_id, 'reject', w.azubi_id, jsonb_build_object('version', w.version, 'content_hash', w.content_hash));
  PERFORM set_config('azuvera.leittext_transition', '', true);
END $$;

CREATE OR REPLACE FUNCTION public.reopen_leittext(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.leittext_works%ROWTYPE; v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  SELECT * INTO w FROM public.leittext_works WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR auth.uid() = w.azubi_id OR NOT public.can_review_for(auth.uid(), w.azubi_id) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF w.status <> 'approved' THEN RAISE EXCEPTION 'Nur freigegebene Leittexte können wieder geöffnet werden.'; END IF;
  IF char_length(v_reason) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Bitte eine Begründung mit 10 bis 1000 Zeichen angeben.'; END IF;
  PERFORM set_config('azuvera.leittext_transition', 'on', true);
  UPDATE public.leittext_works SET status = 'draft', version = version + 1, reviewed_at = NULL, reviewer_id = NULL, review_note = NULL WHERE id = p_id;
  INSERT INTO public.leittext_comments (work_id, author_id, kind, body) VALUES (p_id, auth.uid(), 'reopen', v_reason);
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (w.azubi_id, 'leittext_reopened', 'Leittext wieder geöffnet', left(v_reason, 140), '/leittexte/arbeit/' || p_id, 'leittext', p_id);
  PERFORM public.write_audit('leittext', p_id, 'reopen', w.azubi_id, jsonb_build_object('version', w.version + 1));
  PERFORM set_config('azuvera.leittext_transition', '', true);
END $$;
REVOKE ALL ON FUNCTION public.submit_leittext(uuid, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_leittext(uuid, int, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_leittext(uuid, int, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reopen_leittext(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_leittext(uuid, int), public.approve_leittext(uuid, int, text),
  public.reject_leittext(uuid, int, text), public.reopen_leittext(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.leittext_review_queue()
RETURNS TABLE (id uuid, azubi_id uuid, azubi_name text, leittext_id uuid, title text, submitted_at timestamptz, version int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id, w.azubi_id, p.full_name, w.leittext_id, l.title, w.submitted_at, w.version
  FROM public.leittext_works w JOIN public.leittexts l ON l.id = w.leittext_id JOIN public.profiles p ON p.id = w.azubi_id
  WHERE w.status = 'submitted' AND auth.uid() IS NOT NULL AND w.azubi_id <> auth.uid() AND public.can_review_for(auth.uid(), w.azubi_id)
  ORDER BY w.submitted_at
$$;
REVOKE ALL ON FUNCTION public.leittext_review_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leittext_review_queue() TO authenticated;

-- ============ Protokoll ============
CREATE OR REPLACE FUNCTION public.audit_leittext_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.account_removal_active() THEN RETURN coalesce(NEW, OLD); END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('leittext', NEW.id, 'create', NEW.azubi_id, jsonb_build_object('leittext_id', NEW.leittext_id));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'draft' THEN PERFORM public.write_audit('leittext', OLD.id, 'delete', OLD.azubi_id, jsonb_build_object('leittext_id', OLD.leittext_id)); END IF;
    RETURN OLD;
  END IF;
  IF NEW.header IS NOT DISTINCT FROM OLD.header AND NEW.answers IS NOT DISTINCT FROM OLD.answers THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.audit_log a WHERE a.entity_type = 'leittext' AND a.entity_id = NEW.id AND a.action = 'edit'
    AND a.created_at > now() - interval '60 minutes') THEN RETURN NEW; END IF;
  PERFORM public.write_audit('leittext', NEW.id, 'edit', NEW.azubi_id, jsonb_build_object('version', NEW.version));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_leittext_change ON public.leittext_works;
CREATE TRIGGER audit_leittext_change AFTER INSERT OR UPDATE OR DELETE ON public.leittext_works
  FOR EACH ROW EXECUTE FUNCTION public.audit_leittext_change();

CREATE OR REPLACE FUNCTION public.audit_leittext_attachments_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.account_removal_active() THEN RETURN coalesce(NEW, OLD); END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('leittext', NEW.work_id, 'attachment_add', NEW.azubi_id,
      jsonb_build_object('attachment_id', NEW.id, 'mime_type', NEW.mime_type, 'size_bytes', NEW.size_bytes, 'sha256', NEW.sha256));
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.leittext_works w WHERE w.id = OLD.work_id) THEN
    PERFORM public.write_audit('leittext', OLD.work_id, 'attachment_delete', OLD.azubi_id,
      jsonb_build_object('attachment_id', OLD.id, 'mime_type', OLD.mime_type, 'size_bytes', OLD.size_bytes, 'sha256', OLD.sha256));
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS audit_leittext_attachments_change ON public.leittext_attachments;
CREATE TRIGGER audit_leittext_attachments_change AFTER INSERT OR DELETE ON public.leittext_attachments
  FOR EACH ROW EXECUTE FUNCTION public.audit_leittext_attachments_change();

-- ============ Benachrichtigungsgruppen ============
CREATE OR REPLACE FUNCTION public.notification_group(_type text)
 RETURNS text LANGUAGE sql IMMUTABLE AS $function$
  select case
    when _type in ('report_submitted','report_approved','report_rejected','report_reopened','comment',
                   'instruction_submitted','instruction_confirmed','instruction_rejected',
                   'experience_submitted','experience_approved','experience_rejected','experience_reopened','experience_comment',
                   'leittext_submitted','leittext_approved','leittext_rejected','leittext_reopened','leittext_comment') then 'reports'
    when _type in ('absence_requested','absence_approved','absence_rejected') then 'absences'
    when _type in ('report_reminder','deadline_soon','deadline_today','deadline_overdue','review_pending','daily_nudge','instruction_due','experience_due') then 'reminders'
    when _type in ('deputy_assigned','deputy_ended') then 'deputy'
    else null end
$function$;

-- ============ Export-Protokoll ============
CREATE OR REPLACE FUNCTION public.log_export(p_azubi uuid, p_kind text, p_count integer, p_from date, p_to date)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
IF auth.uid() IS NULL OR NOT (public.can_view_azubi(auth.uid(),p_azubi) OR (p_kind IN ('plan_pdf','plan_odt','folder') AND public.is_team(auth.uid()))) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
IF p_kind NOT IN ('single','bulk','zip','plan_pdf','plan_odt','folder','leittext') OR p_count IS NULL OR p_count<0 THEN RAISE EXCEPTION 'Ungültiger Export.'; END IF;
PERFORM public.write_audit('export',NULL,CASE WHEN p_kind IN ('plan_pdf','plan_odt') THEN 'plan_export' WHEN p_kind = 'folder' THEN 'folder_export' WHEN p_kind = 'leittext' THEN 'leittext_export' ELSE 'pdf_export' END,p_azubi,jsonb_build_object('kind',p_kind,'count',p_count,'from',p_from,'to',p_to));
END $function$;

-- ============ Kontolöschung ============
CREATE OR REPLACE FUNCTION public.admin_delete_azubi_data(p_user uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.has_role(p_user, 'azubi') THEN RAISE EXCEPTION 'Nur Konten von Auszubildenden können gelöscht werden.'; END IF;
  PERFORM set_config('azuvera.account_removal', 'on', true);
  DELETE FROM public.report_signatures
   WHERE report_id IN (SELECT id FROM public.reports WHERE azubi_id = p_user)
      OR signer_id = p_user OR on_behalf_of = p_user;
  DELETE FROM public.report_comments
   WHERE report_id IN (SELECT id FROM public.reports WHERE azubi_id = p_user)
      OR author_id = p_user;
  DELETE FROM public.report_versions
   WHERE report_id IN (SELECT id FROM public.reports WHERE azubi_id = p_user);
  DELETE FROM public.report_attachments WHERE azubi_id = p_user;
  DELETE FROM public.reports WHERE azubi_id = p_user;
  DELETE FROM public.experience_signatures
   WHERE experience_id IN (SELECT id FROM public.experience_reports WHERE azubi_id = p_user)
      OR signer_id = p_user OR on_behalf_of = p_user;
  DELETE FROM public.experience_comments
   WHERE experience_id IN (SELECT id FROM public.experience_reports WHERE azubi_id = p_user)
      OR author_id = p_user;
  DELETE FROM public.experience_versions
   WHERE experience_id IN (SELECT id FROM public.experience_reports WHERE azubi_id = p_user);
  DELETE FROM public.experience_attachments WHERE azubi_id = p_user;
  DELETE FROM public.experience_reports WHERE azubi_id = p_user;
  DELETE FROM public.leittext_comments WHERE azubi_id = p_user OR author_id = p_user;
  DELETE FROM public.leittext_attachments WHERE azubi_id = p_user;
  DELETE FROM public.leittext_works WHERE azubi_id = p_user;
  DELETE FROM public.ai_usage WHERE user_id = p_user;
  DELETE FROM public.function_calls WHERE user_id = p_user;
  DELETE FROM public.profiles WHERE id = p_user;
  PERFORM set_config('azuvera.account_removal', '', true);
  INSERT INTO public.audit_log (chain_key, actor_id, actor_role, azubi_id, entity_type, entity_id, action, details)
  VALUES ('00000000-0000-0000-0000-000000000000', p_actor,
    (SELECT role FROM public.user_roles WHERE user_id = p_actor), NULL, 'account', p_user, 'account_deleted',
    jsonb_build_object('mode', 'deleted'));
END $function$;

CREATE OR REPLACE FUNCTION public.account_removal_paths(p_user uuid)
 RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT coalesce(array_agg(DISTINCT x.path), '{}') FROM (
    SELECT 'report-files/' || a.storage_path AS path FROM public.report_attachments a WHERE a.azubi_id = p_user
    UNION SELECT 'report-files/' || a.thumb_path FROM public.report_attachments a WHERE a.azubi_id = p_user AND a.thumb_path IS NOT NULL
    UNION SELECT 'signatures/' || s.image_path FROM public.report_signatures s JOIN public.reports r ON r.id = s.report_id
      WHERE r.azubi_id = p_user AND s.role = 'azubi' AND s.image_path IS NOT NULL
    UNION SELECT 'signatures/' || u.image_path FROM public.user_signatures u WHERE u.user_id = p_user AND u.image_path IS NOT NULL
    UNION SELECT 'experience-files/' || a.storage_path FROM public.experience_attachments a WHERE a.azubi_id = p_user
    UNION SELECT 'experience-files/' || a.thumb_path FROM public.experience_attachments a WHERE a.azubi_id = p_user AND a.thumb_path IS NOT NULL
    UNION SELECT 'signatures/' || s.image_path FROM public.experience_signatures s JOIN public.experience_reports e ON e.id = s.experience_id
      WHERE e.azubi_id = p_user AND s.role = 'azubi' AND s.image_path IS NOT NULL
    UNION SELECT 'leittext-files/' || a.storage_path FROM public.leittext_attachments a WHERE a.azubi_id = p_user
    UNION SELECT 'leittext-files/' || a.thumb_path FROM public.leittext_attachments a WHERE a.azubi_id = p_user AND a.thumb_path IS NOT NULL
    UNION SELECT o.bucket_id || '/' || o.name FROM storage.objects o
      WHERE o.bucket_id IN ('report-files', 'signatures', 'experience-files', 'leittext-files', 'company-logos') AND split_part(o.name, '/', 1) = p_user::text
  ) x
$function$;

-- ============ Datenauskunft ============
CREATE OR REPLACE FUNCTION public.export_my_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
  RETURN public.export_my_data_base() || jsonb_build_object(
    'instruction_records', coalesce((SELECT jsonb_agg(to_jsonb(r) - 'reviewer_id' - 'on_behalf_of' || jsonb_build_object(
        'point_keys', coalesce((SELECT jsonb_agg(p.key ORDER BY p.key) FROM public.instruction_record_points rp
          JOIN public.instruction_points p ON p.id = rp.point_id WHERE rp.record_id = r.id), '[]'::jsonb))
      ORDER BY r.given_on NULLS LAST, r.created_at) FROM public.instruction_records r WHERE r.azubi_id = me), '[]'::jsonb),
    'experience_reports', coalesce((SELECT jsonb_agg(to_jsonb(e) - 'reviewer_id' ORDER BY e.written_on, e.created_at)
      FROM public.experience_reports e WHERE e.azubi_id = me), '[]'::jsonb),
    'experience_attachments', coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.experience_id, a.sort_order)
      FROM public.experience_attachments a WHERE a.azubi_id = me), '[]'::jsonb),
    'experience_versions', coalesce((SELECT jsonb_agg(to_jsonb(v) - 'changed_by' ORDER BY v.experience_id, v.created_at)
      FROM public.experience_versions v JOIN public.experience_reports e ON e.id = v.experience_id WHERE e.azubi_id = me), '[]'::jsonb),
    'experience_signatures', coalesce((SELECT jsonb_agg(to_jsonb(s) - 'signer_id' - 'on_behalf_of' ORDER BY s.signed_at)
      FROM public.experience_signatures s WHERE s.signer_id = me
         OR EXISTS (SELECT 1 FROM public.experience_reports e WHERE e.id = s.experience_id AND e.azubi_id = me)), '[]'::jsonb),
    'experience_comments', coalesce((SELECT jsonb_agg(to_jsonb(c) - 'author_id' || jsonb_build_object(
        'author_name', coalesce((SELECT p.full_name FROM public.profiles p WHERE p.id = c.author_id), 'Gelöschte Person'),
        'own', c.author_id = me) ORDER BY c.created_at)
      FROM public.experience_comments c WHERE c.azubi_id = me OR c.author_id = me), '[]'::jsonb),
    'leittext_works', coalesce((SELECT jsonb_agg(to_jsonb(w) - 'reviewer_id' || jsonb_build_object('leittext_title', l.title, 'leittext_source', l.source_url)
      ORDER BY w.created_at) FROM public.leittext_works w JOIN public.leittexts l ON l.id = w.leittext_id WHERE w.azubi_id = me), '[]'::jsonb),
    'leittext_attachments', coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.work_id, a.sort_order)
      FROM public.leittext_attachments a WHERE a.azubi_id = me), '[]'::jsonb),
    'leittext_comments', coalesce((SELECT jsonb_agg(to_jsonb(c) - 'author_id' || jsonb_build_object(
        'author_name', coalesce((SELECT p.full_name FROM public.profiles p WHERE p.id = c.author_id), 'Gelöschte Person'),
        'own', c.author_id = me) ORDER BY c.created_at)
      FROM public.leittext_comments c WHERE c.azubi_id = me OR c.author_id = me), '[]'::jsonb),
    'invitations', coalesce((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'role', i.role, 'code', i.code, 'note', i.note,
        'expires_at', i.expires_at, 'access_days', i.access_days, 'used_at', i.used_at, 'revoked_at', i.revoked_at, 'created_at', i.created_at)
      ORDER BY i.created_at) FROM public.invitations i WHERE i.azubi_id = me), '[]'::jsonb),
    'access_grants', coalesce((SELECT jsonb_agg(jsonb_build_object('id', g.id, 'role', g.role, 'can_review', g.can_review,
        'deputy_allowed', g.deputy_allowed, 'valid_until', g.valid_until, 'revoked_at', g.revoked_at, 'created_at', g.created_at,
        'as', CASE WHEN g.azubi_id = me THEN 'azubi' ELSE 'grantee' END,
        'other_name', coalesce((SELECT p.full_name FROM public.profiles p WHERE p.id = CASE WHEN g.azubi_id = me THEN g.grantee_id ELSE g.azubi_id END), 'Gelöschte Person'))
      ORDER BY g.created_at) FROM public.access_grants g WHERE g.azubi_id = me OR g.grantee_id = me), '[]'::jsonb),
    'team_member', (SELECT jsonb_build_object('member', true, 'since', t.created_at) FROM public.team_members t WHERE t.user_id = me));
END $function$;
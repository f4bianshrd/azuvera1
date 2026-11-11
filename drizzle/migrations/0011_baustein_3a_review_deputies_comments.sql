CREATE TABLE public.deputies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  deputy_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date_from date NOT NULL,
  date_to date NOT NULL,
  reason text NOT NULL CHECK (reason IN ('urlaub', 'krank', 'sonstiges')),
  note text CHECK (char_length(note) <= 300),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (principal_id <> deputy_id),
  CHECK (date_to >= date_from),
  CHECK (date_to <= date_from + 179)
);
GRANT SELECT ON public.deputies TO authenticated;
GRANT ALL ON public.deputies TO service_role;
ALTER TABLE public.deputies ENABLE ROW LEVEL SECURITY;
CREATE POLICY deputies_select ON public.deputies FOR SELECT TO authenticated
  USING (principal_id = auth.uid() OR deputy_id = auth.uid() OR public.is_leitung(auth.uid()));
CREATE INDEX deputies_principal_active_idx ON public.deputies (principal_id, date_from, date_to) WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION public.deputies_roles_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT public.is_reviewer_role(NEW.principal_id) OR NOT public.is_reviewer_role(NEW.deputy_id) THEN
    RAISE EXCEPTION 'Beide Personen müssen eine prüfende Rolle haben.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER deputies_roles_guard BEFORE INSERT OR UPDATE ON public.deputies
  FOR EACH ROW EXECUTE FUNCTION public.deputies_roles_guard();

CREATE OR REPLACE FUNCTION public.is_active_deputy(_deputy uuid, _principal uuid, _on_date date DEFAULT (now() AT TIME ZONE 'Europe/Berlin')::date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_reviewer_role(_deputy) AND EXISTS (
    SELECT 1 FROM public.deputies d
    WHERE d.deputy_id = _deputy AND d.principal_id = _principal
      AND d.revoked_at IS NULL AND _on_date BETWEEN d.date_from AND d.date_to
  )
$$;

CREATE OR REPLACE FUNCTION public.can_review_for(_reviewer uuid, _azubi uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_leitung(_reviewer) OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _azubi AND p.ausbilder_id IS NOT NULL AND (
      (p.ausbilder_id = _reviewer AND public.is_reviewer_role(_reviewer))
      OR public.is_active_deputy(_reviewer, p.ausbilder_id)
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.acting_principal(_reviewer uuid, _azubi uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p.ausbilder_id IS NOT NULL AND p.ausbilder_id <> _reviewer
      AND NOT public.is_leitung(_reviewer)
      AND public.is_active_deputy(_reviewer, p.ausbilder_id)
    THEN p.ausbilder_id ELSE NULL END
  FROM public.profiles p WHERE p.id = _azubi
$$;

CREATE OR REPLACE FUNCTION public.notification_recipients(_azubi uuid)
RETURNS TABLE (user_id uuid, deputy_for uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_principal uuid;
  v_deputy RECORD;
BEGIN
  SELECT p.ausbilder_id INTO v_principal FROM public.profiles p WHERE p.id = _azubi;
  IF v_principal IS NULL THEN
    RETURN QUERY SELECT ur.user_id, NULL::uuid FROM public.user_roles ur WHERE ur.role = 'ausbildungsleitung';
    RETURN;
  END IF;
  IF public.is_reviewer_role(v_principal) THEN
    user_id := v_principal; deputy_for := NULL; RETURN NEXT;
  END IF;
  FOR v_deputy IN
    SELECT d.deputy_id FROM public.deputies d
    WHERE d.principal_id = v_principal AND d.revoked_at IS NULL
      AND (now() AT TIME ZONE 'Europe/Berlin')::date BETWEEN d.date_from AND d.date_to
  LOOP
    IF public.is_reviewer_role(v_deputy.deputy_id) THEN
      user_id := v_deputy.deputy_id; deputy_for := v_principal; RETURN NEXT;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.set_deputy(
  _principal uuid, _deputy uuid, _date_from date, _date_to date,
  _reason text, _note text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_self boolean := coalesce((SELECT (value #>> '{}')::boolean FROM public.app_settings WHERE key = 'deputy_self_service'), true);
  v_principal_name text;
  v_deputy_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
  IF NOT public.is_leitung(auth.uid()) AND NOT (auth.uid() = _principal AND v_self) THEN
    RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.';
  END IF;
  IF _reason NOT IN ('urlaub', 'krank', 'sonstiges') THEN RAISE EXCEPTION 'Ungültiger Vertretungsgrund.'; END IF;
  INSERT INTO public.deputies (principal_id, deputy_id, date_from, date_to, reason, note, created_by)
  VALUES (_principal, _deputy, _date_from, _date_to, _reason, NULLIF(btrim(coalesce(_note, '')), ''), auth.uid())
  RETURNING id INTO v_id;
  SELECT full_name INTO v_principal_name FROM public.profiles WHERE id = _principal;
  SELECT full_name INTO v_deputy_name FROM public.profiles WHERE id = _deputy;
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (_deputy, 'deputy_assigned', 'Vertretung eingetragen',
    'Du vertrittst ' || v_principal_name || ' vom ' || to_char(_date_from, 'DD.MM.YYYY') || ' bis ' || to_char(_date_to, 'DD.MM.YYYY') || '.',
    '/ausbilder?tab=vertretung', 'deputy', v_id);
  IF public.is_leitung(auth.uid()) AND auth.uid() <> _principal THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
    VALUES (_principal, 'deputy_assigned', 'Vertretung eingetragen',
      'Für dich wurde eine Vertretung eingetragen: ' || v_deputy_name || ', ' || to_char(_date_from, 'DD.MM.YYYY') || ' – ' || to_char(_date_to, 'DD.MM.YYYY') || '.',
      '/ausbilder?tab=vertretung', 'deputy', v_id);
  END IF;
  PERFORM public.write_audit('deputy', v_id, 'deputy_set', NULL,
    jsonb_build_object('principal_id', _principal, 'deputy_id', _deputy, 'date_from', _date_from, 'date_to', _date_to));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_deputy(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deputy public.deputies%ROWTYPE;
BEGIN
  SELECT * INTO v_deputy FROM public.deputies WHERE id = _id AND revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vertretung nicht gefunden.'; END IF;
  IF auth.uid() <> v_deputy.principal_id AND NOT public.is_leitung(auth.uid()) THEN
    RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.';
  END IF;
  UPDATE public.deputies SET revoked_at = now() WHERE id = _id;
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (v_deputy.deputy_id, 'deputy_ended', 'Vertretung beendet', NULL, '/ausbilder?tab=vertretung', 'deputy', _id);
  PERFORM public.write_audit('deputy', _id, 'deputy_revoke', NULL,
    jsonb_build_object('principal_id', v_deputy.principal_id, 'deputy_id', v_deputy.deputy_id));
END $$;

CREATE OR REPLACE FUNCTION public.review_queue(_statuses public.report_status[] DEFAULT ARRAY['submitted']::public.report_status[])
RETURNS TABLE (report_id uuid, azubi_id uuid, status public.report_status, submitted_at timestamptz, deputy_for uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.azubi_id, r.status, r.submitted_at, public.acting_principal(auth.uid(), r.azubi_id)
  FROM public.reports r
  WHERE r.status = ANY(_statuses) AND r.status <> 'draft'
    AND public.can_review_for(auth.uid(), r.azubi_id)
  ORDER BY r.submitted_at ASC NULLS LAST, r.created_at ASC
$$;
CREATE INDEX reports_submitted_queue_idx ON public.reports (status, submitted_at) WHERE status = 'submitted';

CREATE OR REPLACE FUNCTION public.report_title(_report_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN r.report_type = 'weekly'
    THEN 'Wochenbericht KW ' || r.week_number || '/' || r.year || ' – ' || CASE WHEN r.weekly_mode = 'topics' THEN 'Themenbericht' ELSE 'Tätigkeitsbericht' END
    ELSE 'Tagesbericht' END
  FROM public.reports r WHERE r.id = _report_id
$$;

CREATE TABLE public.user_signatures (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  image_path text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_signatures TO authenticated;
GRANT ALL ON public.user_signatures TO service_role;
ALTER TABLE public.user_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_signatures_select ON public.user_signatures FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_reviewer_role(auth.uid()));
CREATE POLICY user_signatures_insert ON public.user_signatures FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_reviewer_role(auth.uid()) AND image_path LIKE auth.uid()::text || '/%');
CREATE POLICY user_signatures_update ON public.user_signatures FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_reviewer_role(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_reviewer_role(auth.uid()) AND image_path LIKE auth.uid()::text || '/%');
CREATE POLICY user_signatures_delete ON public.user_signatures FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.is_reviewer_role(auth.uid()));
CREATE TRIGGER user_signatures_updated_at BEFORE UPDATE ON public.user_signatures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.report_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  azubi_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) DEFAULT auth.uid(),
  kind text NOT NULL DEFAULT 'comment' CHECK (kind IN ('comment', 'rejection', 'approval', 'reopen')),
  section text CHECK (section IS NULL OR section IN ('activities', 'school_content', 'instructions', 'summary')),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.report_comments TO authenticated;
GRANT INSERT (id, report_id, section, body) ON public.report_comments TO authenticated;
GRANT ALL ON public.report_comments TO service_role;
ALTER TABLE public.report_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_comments_select ON public.report_comments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.reports r WHERE r.id = report_id AND r.status <> 'draft'
      AND (r.azubi_id = auth.uid() OR public.can_view_azubi(auth.uid(), r.azubi_id))
  ));
CREATE POLICY report_comments_insert ON public.report_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.reports r WHERE r.id = report_id AND r.status <> 'draft'
      AND (r.azubi_id = auth.uid() OR public.can_review_for(auth.uid(), r.azubi_id))
  ));
CREATE INDEX report_comments_report_created_idx ON public.report_comments (report_id, created_at);

CREATE OR REPLACE FUNCTION public.report_comments_derive() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT r.azubi_id INTO NEW.azubi_id FROM public.reports r WHERE r.id = NEW.report_id;
  IF NEW.azubi_id IS NULL THEN RAISE EXCEPTION 'Bericht nicht gefunden.'; END IF;
  IF NEW.author_id IS NULL THEN NEW.author_id := auth.uid(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER report_comments_derive BEFORE INSERT ON public.report_comments
  FOR EACH ROW EXECUTE FUNCTION public.report_comments_derive();

CREATE OR REPLACE FUNCTION public.report_comments_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Kommentare können nicht geändert oder gelöscht werden.'; END $$;
CREATE TRIGGER report_comments_no_update BEFORE UPDATE OR DELETE ON public.report_comments
  FOR EACH ROW EXECUTE FUNCTION public.report_comments_immutable();
CREATE TRIGGER report_comments_no_truncate BEFORE TRUNCATE ON public.report_comments
  FOR EACH STATEMENT EXECUTE FUNCTION public.report_comments_immutable();

CREATE OR REPLACE FUNCTION public.report_comments_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recipient RECORD;
BEGIN
  IF NEW.kind <> 'comment' THEN RETURN NEW; END IF;
  IF NEW.author_id = NEW.azubi_id THEN
    FOR v_recipient IN SELECT * FROM public.notification_recipients(NEW.azubi_id) LOOP
      INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
      VALUES (v_recipient.user_id, 'comment', 'Neuer Kommentar', left(NEW.body, 140), '/reports/' || NEW.report_id || '#kommentare', 'report', NEW.report_id);
    END LOOP;
  ELSE
    INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
    VALUES (NEW.azubi_id, 'comment', 'Neuer Kommentar', left(NEW.body, 140), '/reports/' || NEW.report_id || '#kommentare', 'report', NEW.report_id);
  END IF;
  PERFORM public.write_audit('report', NEW.report_id, 'comment', NEW.azubi_id,
    jsonb_build_object('comment_id', NEW.id, 'section', NEW.section));
  RETURN NEW;
END $$;
CREATE TRIGGER report_comments_notify AFTER INSERT ON public.report_comments
  FOR EACH ROW EXECUTE FUNCTION public.report_comments_notify();
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'report_comments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.report_comments;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.reports_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  bypass boolean := coalesce(current_setting('app.bypass_guard', true), '') = 'on';
  review_action text := coalesce(current_setting('app.review_action', true), '');
  system_write boolean := bypass OR review_action IN ('approve', 'reject', 'reopen');
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'approved' AND NOT system_write THEN RAISE EXCEPTION 'Freigegebene Berichte können nicht gelöscht werden.'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT system_write AND (NEW.status <> 'draft' OR NEW.version <> 1 OR NEW.content_hash IS NOT NULL
      OR NEW.submitted_at IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.reviewer_id IS NOT NULL OR NEW.review_note IS NOT NULL) THEN
      RAISE EXCEPTION 'Status und Prüffelder können nur vom System gesetzt werden.';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'approved' AND NOT system_write THEN RAISE EXCEPTION 'Freigegebene Berichte sind unveränderlich.'; END IF;
  IF NOT system_write THEN
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.content_hash IS DISTINCT FROM OLD.content_hash OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
      OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
      OR NEW.review_note IS DISTINCT FROM OLD.review_note THEN
      RAISE EXCEPTION 'Status und Prüffelder können nur vom System geändert werden.';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'draft' AND NEW.status = 'submitted') OR (OLD.status = 'rejected' AND NEW.status = 'submitted')
    OR (OLD.status = 'submitted' AND NEW.status IN ('approved', 'rejected'))
    OR (OLD.status = 'approved' AND NEW.status = 'draft')) THEN
    RAISE EXCEPTION 'Dieser Statusübergang ist nicht erlaubt.';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.reports_snapshot_on_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.report_versions (report_id, version, status, snapshot, content_hash, changed_by)
    VALUES (NEW.id, NEW.version, NEW.status,
      jsonb_build_object(
        'type', NEW.report_type, 'date', NEW.report_date, 'mode', NEW.weekly_mode,
        'activities', coalesce(NEW.activities, ''), 'school', coalesce(NEW.school_content, ''),
        'instructions', coalesce(NEW.instructions, ''), 'summary', coalesce(NEW.summary, ''),
        'attachments', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'file_name', a.file_name, 'sha256', a.sha256, 'caption', a.caption) ORDER BY a.sort_order) FROM public.report_attachments a WHERE a.report_id = NEW.id), '[]'::jsonb)
      ) || CASE WHEN coalesce(current_setting('app.review_action', true), '') = 'reopen' THEN jsonb_build_object('status', 'reopened') ELSE '{}'::jsonb END,
      NEW.content_hash, auth.uid());
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.submit_report(
  _report_id uuid, _expected_version int, _method text, _image_path text DEFAULT NULL, _client_signed_at timestamptz DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.reports%ROWTYPE;
  new_version int;
  new_hash text;
  signer text;
  recipient RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
  IF _method NOT IN ('draw', 'click') THEN RAISE EXCEPTION 'Ungültige Bestätigungsmethode.'; END IF;
  SELECT * INTO r FROM public.reports WHERE id = _report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bericht nicht gefunden.'; END IF;
  IF r.azubi_id <> auth.uid() THEN RAISE EXCEPTION 'Nur die Eigentümerin oder der Eigentümer kann einreichen.'; END IF;
  IF r.status NOT IN ('draft', 'rejected') THEN RAISE EXCEPTION 'Nur Entwürfe oder zurückgewiesene Berichte können eingereicht werden.'; END IF;
  IF r.version <> _expected_version THEN RAISE EXCEPTION 'Der Bericht wurde inzwischen geändert.'; END IF;
  IF btrim(coalesce(r.activities, '')) = '' THEN RAISE EXCEPTION 'Der Abschnitt Tätigkeiten darf nicht leer sein.'; END IF;
  new_version := r.version + 1;
  new_hash := public.report_hash(_report_id);
  PERFORM set_config('app.bypass_guard', 'on', true);
  UPDATE public.reports SET status = 'submitted', version = new_version, content_hash = new_hash,
    submitted_at = now(), reviewed_at = NULL, reviewer_id = NULL, review_note = NULL WHERE id = _report_id;
  SELECT full_name INTO signer FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.report_signatures
    (report_id, role, signer_id, signer_name, signer_role_label, method, image_path, content_hash, report_version, client_signed_at)
  VALUES (_report_id, 'azubi', auth.uid(), coalesce(signer, ''), 'Auszubildende/r', _method, _image_path, new_hash, new_version, _client_signed_at);
  FOR recipient IN SELECT * FROM public.notification_recipients(auth.uid()) LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
    VALUES (recipient.user_id, 'report_submitted',
      'Bericht eingereicht' || CASE WHEN recipient.deputy_for IS NOT NULL THEN ' (Vertretung für ' || (SELECT full_name FROM public.profiles WHERE id = recipient.deputy_for) || ')' ELSE '' END,
      signer || ' hat einen Bericht eingereicht.', '/reports/' || _report_id, 'report', _report_id);
  END LOOP;
  PERFORM public.write_audit('report', _report_id, 'submit', auth.uid(),
    jsonb_build_object('version', new_version, 'content_hash', new_hash, 'method', _method));
END $$;

CREATE OR REPLACE FUNCTION public.absence_notify_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
  v_kind text;
  v_recipient RECORD;
BEGIN
  SELECT full_name INTO v_name FROM public.profiles WHERE id = NEW.azubi_id;
  v_kind := CASE NEW.type WHEN 'urlaub' THEN 'Urlaub' WHEN 'krank' THEN 'Krankheit' WHEN 'berufsschule' THEN 'Berufsschule' ELSE 'Sonstiges' END;
  FOR v_recipient IN SELECT * FROM public.notification_recipients(NEW.azubi_id) LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
    VALUES (v_recipient.user_id, 'absence_requested',
      'Neue Abwesenheit' || CASE WHEN v_recipient.deputy_for IS NOT NULL THEN ' (Vertretung für ' || (SELECT full_name FROM public.profiles WHERE id = v_recipient.deputy_for) || ')' ELSE '' END,
      v_name || ': ' || v_kind || ', ' || to_char(NEW.date_from, 'DD.MM.YYYY') || ' – ' || to_char(NEW.date_to, 'DD.MM.YYYY'),
      '/abwesenheiten?id=' || NEW.id, 'absence', NEW.id);
  END LOOP;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.approve_report(
  _report_id uuid, _expected_version int, _method text, _image_path text DEFAULT NULL,
  _note text DEFAULT NULL, _client_signed_at timestamptz DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.reports%ROWTYPE;
  v_path text;
  v_name text;
  v_role public.app_role;
  v_role_label text;
  v_on_behalf uuid;
BEGIN
  IF _method NOT IN ('draw', 'saved', 'click') THEN RAISE EXCEPTION 'Ungültige Bestätigungsmethode.'; END IF;
  SELECT * INTO r FROM public.reports WHERE id = _report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bericht nicht gefunden.'; END IF;
  IF auth.uid() = r.azubi_id OR NOT public.can_review_for(auth.uid(), r.azubi_id) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF r.status <> 'submitted' THEN RAISE EXCEPTION 'Der Bericht ist nicht mehr zur Prüfung vorgesehen.'; END IF;
  IF r.version <> _expected_version THEN RAISE EXCEPTION 'Der Bericht wurde inzwischen geändert.'; END IF;
  IF r.content_hash IS DISTINCT FROM public.report_hash(_report_id) THEN RAISE EXCEPTION 'Die Prüfsumme stimmt nicht mehr. Bitte weise den Bericht zurück.'; END IF;
  IF _method = 'draw' THEN
    IF _image_path IS NULL OR _image_path NOT LIKE auth.uid()::text || '/%' OR NOT EXISTS (
      SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'signatures' AND o.name = _image_path
    ) THEN RAISE EXCEPTION 'Die Unterschriftsdatei wurde nicht gefunden.'; END IF;
    v_path := _image_path;
  ELSIF _method = 'saved' THEN
    SELECT us.image_path INTO v_path FROM public.user_signatures us WHERE us.user_id = auth.uid();
    IF v_path IS NULL THEN RAISE EXCEPTION 'Du hast noch keine gespeicherte Unterschrift.'; END IF;
  END IF;
  v_on_behalf := public.acting_principal(auth.uid(), r.azubi_id);
  SELECT p.full_name, ur.role INTO v_name, v_role FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id WHERE p.id = auth.uid();
  v_role_label := CASE v_role WHEN 'ausbilder' THEN 'Ausbilder:in' WHEN 'betriebsleiter' THEN 'Betriebsleiter:in' WHEN 'ausbildungsleitung' THEN 'Ausbildungsleitung' ELSE 'Prüfende Person' END;
  PERFORM set_config('app.review_action', 'approve', true);
  UPDATE public.reports SET status = 'approved', reviewed_at = now(), reviewer_id = auth.uid(), review_note = NULLIF(btrim(coalesce(_note, '')), '') WHERE id = _report_id;
  INSERT INTO public.report_signatures
    (report_id, role, signer_id, signer_name, signer_role_label, on_behalf_of, method, image_path, content_hash, report_version, client_signed_at)
  VALUES (_report_id, 'ausbilder', auth.uid(), coalesce(v_name, ''), v_role_label, v_on_behalf, _method, v_path, r.content_hash, r.version, _client_signed_at);
  IF btrim(coalesce(_note, '')) <> '' THEN
    INSERT INTO public.report_comments (report_id, author_id, kind, body) VALUES (_report_id, auth.uid(), 'approval', btrim(_note));
  END IF;
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (r.azubi_id, 'report_approved', 'Bericht freigegeben', public.report_title(_report_id), '/reports/' || _report_id, 'report', _report_id);
  PERFORM public.write_audit('report', _report_id, 'approve', r.azubi_id,
    jsonb_build_object('version', r.version, 'content_hash', r.content_hash, 'method', _method, 'on_behalf_of', v_on_behalf));
END $$;

CREATE OR REPLACE FUNCTION public.reject_report(_report_id uuid, _expected_version int, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.reports%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.reports WHERE id = _report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bericht nicht gefunden.'; END IF;
  IF auth.uid() = r.azubi_id OR NOT public.can_review_for(auth.uid(), r.azubi_id) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF r.status <> 'submitted' THEN RAISE EXCEPTION 'Der Bericht ist nicht mehr zur Prüfung vorgesehen.'; END IF;
  IF r.version <> _expected_version THEN RAISE EXCEPTION 'Der Bericht wurde inzwischen geändert.'; END IF;
  IF char_length(btrim(coalesce(_note, ''))) NOT BETWEEN 3 AND 2000 THEN RAISE EXCEPTION 'Bitte eine Begründung angeben.'; END IF;
  PERFORM set_config('app.review_action', 'reject', true);
  UPDATE public.reports SET status = 'rejected', reviewed_at = now(), reviewer_id = auth.uid(), review_note = btrim(_note) WHERE id = _report_id;
  INSERT INTO public.report_comments (report_id, author_id, kind, body) VALUES (_report_id, auth.uid(), 'rejection', btrim(_note));
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (r.azubi_id, 'report_rejected', 'Bericht zurückgewiesen', left(btrim(_note), 140), '/reports/' || _report_id, 'report', _report_id);
  PERFORM public.write_audit('report', _report_id, 'reject', r.azubi_id,
    jsonb_build_object('version', r.version, 'content_hash', r.content_hash));
END $$;

CREATE OR REPLACE FUNCTION public.reopen_report(_report_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.reports%ROWTYPE;
BEGIN
  IF NOT public.is_leitung(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  SELECT * INTO r FROM public.reports WHERE id = _report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bericht nicht gefunden.'; END IF;
  IF r.status <> 'approved' THEN RAISE EXCEPTION 'Nur freigegebene Berichte können wieder geöffnet werden.'; END IF;
  IF char_length(btrim(coalesce(_reason, ''))) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Bitte eine Begründung mit 10 bis 1000 Zeichen angeben.'; END IF;
  PERFORM set_config('app.review_action', 'reopen', true);
  UPDATE public.reports SET status = 'draft', version = version + 1, reviewed_at = NULL, reviewer_id = NULL, review_note = NULL WHERE id = _report_id;
  INSERT INTO public.report_comments (report_id, author_id, kind, body) VALUES (_report_id, auth.uid(), 'reopen', btrim(_reason));
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (r.azubi_id, 'report_reopened', 'Bericht wieder geöffnet', left(btrim(_reason), 140), '/reports/' || _report_id, 'report', _report_id);
  PERFORM public.write_audit('report', _report_id, 'reopen', r.azubi_id, jsonb_build_object('version', r.version + 1));
END $$;

REVOKE ALL ON FUNCTION public.is_active_deputy(uuid, uuid, date) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.acting_principal(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_recipients(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_deputy(uuid, uuid, date, date, text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_deputy(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_queue(public.report_status[]) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_title(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_report(uuid, int, text, text, text, timestamptz) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_report(uuid, int, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.reopen_report(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_deputy(uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acting_principal(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notification_recipients(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_deputy(uuid, uuid, date, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_deputy(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_queue(public.report_status[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_title(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_report(uuid, int, text, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_report(uuid, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_report(uuid, text) TO authenticated;

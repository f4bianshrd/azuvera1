-- ============ Ausbildungszeugnis ============
CREATE TABLE IF NOT EXISTS public.training_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  azubi_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'qualifiziert' CHECK (kind IN ('einfach','qualifiziert')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','draft','issued')),
  request_note text CHECK (request_note IS NULL OR char_length(request_note) <= 1000),
  requested_at timestamptz,
  content jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(content::text) <= 60000),
  issuer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  issued_at timestamptz,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.training_certificates TO service_role;
ALTER TABLE public.training_certificates ENABLE ROW LEVEL SECURITY;
-- Keine Policies für Clients: Lesen und Schreiben nur über die Funktionen unten.
DROP TRIGGER IF EXISTS training_certificates_updated ON public.training_certificates;
CREATE TRIGGER training_certificates_updated BEFORE UPDATE ON public.training_certificates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.get_training_certificate(p_azubi uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.training_certificates%ROWTYPE; me uuid := auth.uid(); v_review boolean; r jsonb;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  v_review := me <> p_azubi AND public.can_review_for(me, p_azubi);
  IF me <> p_azubi AND NOT v_review AND NOT public.can_view_azubi(me, p_azubi) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  SELECT * INTO c FROM public.training_certificates WHERE azubi_id = p_azubi;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF me <> p_azubi AND NOT v_review AND c.status <> 'issued' THEN RETURN NULL; END IF;
  r := to_jsonb(c) || jsonb_build_object('issuer_name', (SELECT full_name FROM public.profiles WHERE id = c.issuer_id), 'can_edit', v_review);
  IF me = p_azubi AND c.status <> 'issued' THEN r := r || jsonb_build_object('content', '{}'::jsonb); END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.request_training_certificate(p_kind text, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); c public.training_certificates%ROWTYPE; v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_id uuid; rc RECORD;
BEGIN
  IF me IS NULL OR NOT public.has_role(me, 'azubi') THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF p_kind NOT IN ('einfach','qualifiziert') THEN RAISE EXCEPTION 'Bitte wähle die Art des Zeugnisses.'; END IF;
  IF char_length(coalesce(v_note, '')) > 1000 THEN RAISE EXCEPTION 'Die Notiz darf höchstens 1000 Zeichen lang sein.'; END IF;
  SELECT * INTO c FROM public.training_certificates WHERE azubi_id = me FOR UPDATE;
  IF FOUND AND c.status IN ('requested','draft') THEN RAISE EXCEPTION 'Dein Zeugnis ist schon beantragt.'; END IF;
  IF FOUND THEN
    UPDATE public.training_certificates SET kind = p_kind, status = 'requested', request_note = v_note, requested_at = now(), version = version + 1
      WHERE id = c.id RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.training_certificates (azubi_id, kind, status, request_note, requested_at) VALUES (me, p_kind, 'requested', v_note, now()) RETURNING id INTO v_id;
  END IF;
  FOR rc IN SELECT * FROM public.notification_recipients(me) LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
    VALUES (rc.user_id, 'certificate_requested', 'Ausbildungszeugnis beantragt',
      coalesce((SELECT full_name FROM public.profiles WHERE id = me), '') || ' bittet um ein ' || CASE WHEN p_kind = 'einfach' THEN 'einfaches' ELSE 'qualifiziertes' END || ' Zeugnis.',
      '/zeugnis/' || me, 'certificate', v_id);
  END LOOP;
  PERFORM public.write_audit('certificate', v_id, 'certificate_request', me, jsonb_build_object('kind', p_kind));
END $$;

CREATE OR REPLACE FUNCTION public.save_training_certificate(p_azubi uuid, p_kind text, p_content jsonb, p_expected_version int)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); c public.training_certificates%ROWTYPE; v_id uuid; nv int;
BEGIN
  IF me IS NULL OR me = p_azubi OR NOT public.can_review_for(me, p_azubi) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF NOT public.has_role(p_azubi, 'azubi') THEN RAISE EXCEPTION 'Zeugnisse gibt es nur für Auszubildende.'; END IF;
  IF p_kind NOT IN ('einfach','qualifiziert') THEN RAISE EXCEPTION 'Bitte wähle die Art des Zeugnisses.'; END IF;
  IF p_content IS NULL OR jsonb_typeof(p_content) <> 'object' OR octet_length(p_content::text) > 60000 THEN RAISE EXCEPTION 'Der Zeugnistext ist zu lang.'; END IF;
  SELECT * INTO c FROM public.training_certificates WHERE azubi_id = p_azubi FOR UPDATE;
  IF FOUND THEN
    IF c.version <> p_expected_version THEN RAISE EXCEPTION 'Das Zeugnis wurde inzwischen geändert. Bitte neu laden.'; END IF;
    nv := c.version + 1;
    UPDATE public.training_certificates SET kind = p_kind, content = p_content, status = 'draft', version = nv,
      issued_at = CASE WHEN c.status = 'issued' THEN NULL ELSE issued_at END WHERE id = c.id RETURNING id INTO v_id;
    IF c.status = 'issued' THEN
      PERFORM public.write_audit('certificate', v_id, 'certificate_revise', p_azubi, jsonb_build_object('version', nv));
    END IF;
  ELSE
    IF p_expected_version <> 0 THEN RAISE EXCEPTION 'Das Zeugnis wurde inzwischen geändert. Bitte neu laden.'; END IF;
    nv := 1;
    INSERT INTO public.training_certificates (azubi_id, kind, status, content) VALUES (p_azubi, p_kind, 'draft', p_content) RETURNING id INTO v_id;
  END IF;
  RETURN nv;
END $$;

CREATE OR REPLACE FUNCTION public.issue_training_certificate(p_azubi uuid, p_expected_version int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); c public.training_certificates%ROWTYPE; k text; missing text[] := '{}';
BEGIN
  IF me IS NULL OR me = p_azubi OR NOT public.can_review_for(me, p_azubi) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  SELECT * INTO c FROM public.training_certificates WHERE azubi_id = p_azubi FOR UPDATE;
  IF NOT FOUND OR c.status <> 'draft' THEN RAISE EXCEPTION 'Bitte speichere das Zeugnis zuerst.'; END IF;
  IF c.version <> p_expected_version THEN RAISE EXCEPTION 'Das Zeugnis wurde inzwischen geändert. Bitte neu laden.'; END IF;
  FOREACH k IN ARRAY ARRAY['beruf','betrieb','beginn','ende','art_ziel','fertigkeiten','ort','datum','aussteller_name'] ||
    CASE WHEN c.kind = 'qualifiziert' THEN ARRAY['verhalten','leistung'] ELSE ARRAY[]::text[] END LOOP
    IF btrim(coalesce(c.content ->> k, '')) = '' THEN missing := missing || k; END IF;
  END LOOP;
  IF array_length(missing, 1) > 0 THEN RAISE EXCEPTION 'Bitte fülle alle Pflichtfelder aus.'; END IF;
  UPDATE public.training_certificates SET status = 'issued', issuer_id = me, issued_at = now() WHERE id = c.id;
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (p_azubi, 'certificate_issued', 'Ausbildungszeugnis ausgestellt', 'Dein Ausbildungszeugnis ist fertig.', '/zeugnis', 'certificate', c.id);
  PERFORM public.write_audit('certificate', c.id, 'certificate_issue', p_azubi, jsonb_build_object('version', c.version, 'kind', c.kind));
END $$;

REVOKE ALL ON FUNCTION public.get_training_certificate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_training_certificate(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_training_certificate(uuid, text, jsonb, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.issue_training_certificate(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_training_certificate(uuid), public.request_training_certificate(text, text),
  public.save_training_certificate(uuid, text, jsonb, int), public.issue_training_certificate(uuid, int) TO authenticated;

-- ============ Antrag auf Zulassung zur Abschlussprüfung ============
CREATE TABLE IF NOT EXISTS public.exam_applications (
  id uuid PRIMARY KEY,
  azubi_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exam_term text NOT NULL DEFAULT '' CHECK (char_length(exam_term) <= 60),
  data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(data::text) <= 60000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','confirmed','returned')),
  version int NOT NULL DEFAULT 1,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  confirmer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exam_applications_azubi_idx ON public.exam_applications (azubi_id, created_at);
GRANT SELECT ON public.exam_applications TO authenticated;
GRANT ALL ON public.exam_applications TO service_role;
ALTER TABLE public.exam_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exam_applications_select ON public.exam_applications;
CREATE POLICY exam_applications_select ON public.exam_applications FOR SELECT TO authenticated
  USING (azubi_id = auth.uid() OR (status <> 'draft' AND public.can_view_azubi(auth.uid(), azubi_id)));
DROP TRIGGER IF EXISTS exam_applications_updated ON public.exam_applications;
CREATE TRIGGER exam_applications_updated BEFORE UPDATE ON public.exam_applications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.save_exam_application(p_id uuid, p_term text, p_data jsonb, p_expected_version int)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); a public.exam_applications%ROWTYPE; nv int; v_term text := btrim(coalesce(p_term, ''));
BEGIN
  IF me IS NULL OR NOT public.has_role(me, 'azubi') THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF char_length(v_term) > 60 THEN RAISE EXCEPTION 'Der Prüfungstermin ist zu lang.'; END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 60000 THEN RAISE EXCEPTION 'Die Angaben sind zu lang.'; END IF;
  SELECT * INTO a FROM public.exam_applications WHERE id = p_id FOR UPDATE;
  IF FOUND THEN
    IF a.azubi_id <> me THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
    IF a.status NOT IN ('draft','returned') THEN RAISE EXCEPTION 'Ein eingereichter Antrag lässt sich nicht mehr ändern.'; END IF;
    IF a.version <> p_expected_version THEN RAISE EXCEPTION 'Der Antrag wurde inzwischen geändert. Bitte neu laden.'; END IF;
    nv := a.version + 1;
    UPDATE public.exam_applications SET exam_term = v_term, data = p_data, version = nv WHERE id = p_id;
  ELSE
    IF p_expected_version <> 0 THEN RAISE EXCEPTION 'Der Antrag wurde inzwischen geändert. Bitte neu laden.'; END IF;
    nv := 1;
    INSERT INTO public.exam_applications (id, azubi_id, exam_term, data) VALUES (p_id, me, v_term, p_data);
  END IF;
  RETURN nv;
END $$;

CREATE OR REPLACE FUNCTION public.delete_exam_application(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.exam_applications%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.exam_applications WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR a.azubi_id <> auth.uid() THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF a.status <> 'draft' THEN RAISE EXCEPTION 'Nur Entwürfe lassen sich löschen.'; END IF;
  DELETE FROM public.exam_applications WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION public.submit_exam_application(p_id uuid, p_expected_version int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); a public.exam_applications%ROWTYPE; k text; rc RECORD;
BEGIN
  SELECT * INTO a FROM public.exam_applications WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR me IS NULL OR a.azubi_id <> me THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF a.status NOT IN ('draft','returned') THEN RAISE EXCEPTION 'Dieser Antrag ist schon eingereicht.'; END IF;
  IF a.version <> p_expected_version THEN RAISE EXCEPTION 'Der Antrag wurde inzwischen geändert. Bitte neu laden.'; END IF;
  IF btrim(a.exam_term) = '' THEN RAISE EXCEPTION 'Bitte fülle alle Pflichtfelder aus.'; END IF;
  FOREACH k IN ARRAY ARRAY['geburtsdatum','geburtsort','anschrift','beruf','betrieb','beginn','ende','zustaendige_stelle','berufsschule'] LOOP
    IF btrim(coalesce(a.data ->> k, '')) = '' THEN RAISE EXCEPTION 'Bitte fülle alle Pflichtfelder aus.'; END IF;
  END LOOP;
  IF coalesce((a.data ->> 'bestaetigung_richtig')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'Bitte bestätige, dass deine Angaben richtig sind.'; END IF;
  UPDATE public.exam_applications SET status = 'submitted', version = version + 1, submitted_at = now(), confirmed_at = NULL, confirmer_id = NULL, review_note = NULL WHERE id = p_id;
  FOR rc IN SELECT * FROM public.notification_recipients(me) LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
    VALUES (rc.user_id, 'exam_application_submitted', 'Prüfungsantrag zur Bestätigung',
      coalesce((SELECT full_name FROM public.profiles WHERE id = me), '') || ' – ' || a.exam_term, '/pruefungsantrag/' || me, 'exam_application', p_id);
  END LOOP;
  PERFORM public.write_audit('exam_application', p_id, 'submit', me, jsonb_build_object('version', a.version + 1, 'term', a.exam_term));
END $$;

CREATE OR REPLACE FUNCTION public.confirm_exam_application(p_id uuid, p_expected_version int, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); a public.exam_applications%ROWTYPE; v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  SELECT * INTO a FROM public.exam_applications WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR me IS NULL OR me = a.azubi_id OR NOT public.can_review_for(me, a.azubi_id) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF a.status <> 'submitted' THEN RAISE EXCEPTION 'Der Antrag wartet nicht auf eine Bestätigung.'; END IF;
  IF a.version <> p_expected_version THEN RAISE EXCEPTION 'Der Antrag wurde inzwischen geändert. Bitte neu laden.'; END IF;
  IF char_length(coalesce(v_note, '')) > 2000 THEN RAISE EXCEPTION 'Die Notiz darf höchstens 2000 Zeichen lang sein.'; END IF;
  UPDATE public.exam_applications SET status = 'confirmed', confirmed_at = now(), confirmer_id = me, review_note = v_note WHERE id = p_id;
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (a.azubi_id, 'exam_application_confirmed', 'Prüfungsantrag bestätigt', a.exam_term, '/pruefungsantrag', 'exam_application', p_id);
  PERFORM public.write_audit('exam_application', p_id, 'approve', a.azubi_id, jsonb_build_object('version', a.version));
END $$;

CREATE OR REPLACE FUNCTION public.return_exam_application(p_id uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); a public.exam_applications%ROWTYPE; v_note text := btrim(coalesce(p_note, ''));
BEGIN
  SELECT * INTO a FROM public.exam_applications WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR me IS NULL OR me = a.azubi_id OR NOT public.can_review_for(me, a.azubi_id) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF a.status NOT IN ('submitted','confirmed') THEN RAISE EXCEPTION 'Der Antrag lässt sich nicht zurückgeben.'; END IF;
  IF char_length(v_note) NOT BETWEEN 3 AND 2000 THEN RAISE EXCEPTION 'Bitte eine Begründung angeben.'; END IF;
  UPDATE public.exam_applications SET status = 'returned', version = version + 1, confirmed_at = NULL, confirmer_id = me, review_note = v_note WHERE id = p_id;
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (a.azubi_id, 'exam_application_returned', 'Prüfungsantrag zurückgegeben', left(v_note, 140), '/pruefungsantrag', 'exam_application', p_id);
  PERFORM public.write_audit('exam_application', p_id, 'reject', a.azubi_id, jsonb_build_object('version', a.version + 1));
END $$;

REVOKE ALL ON FUNCTION public.save_exam_application(uuid, text, jsonb, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_exam_application(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_exam_application(uuid, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_exam_application(uuid, int, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.return_exam_application(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_exam_application(uuid, text, jsonb, int), public.delete_exam_application(uuid),
  public.submit_exam_application(uuid, int), public.confirm_exam_application(uuid, int, text), public.return_exam_application(uuid, text) TO authenticated;

-- ============ Datenexport (Art. 15/20 DSGVO) um beide Bereiche erweitern ============
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
    'training_certificates', coalesce((SELECT jsonb_agg(CASE WHEN c.status = 'issued' THEN to_jsonb(c) - 'issuer_id' ELSE to_jsonb(c) - 'issuer_id' - 'content' END ORDER BY c.created_at)
      FROM public.training_certificates c WHERE c.azubi_id = me), '[]'::jsonb),
    'exam_applications', coalesce((SELECT jsonb_agg(to_jsonb(a) - 'confirmer_id' ORDER BY a.created_at)
      FROM public.exam_applications a WHERE a.azubi_id = me), '[]'::jsonb),
    'team_member', (SELECT jsonb_build_object('member', true, 'since', t.created_at) FROM public.team_members t WHERE t.user_id = me));
END $function$;
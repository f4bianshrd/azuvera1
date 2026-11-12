-- Baustein 5C: Auskunft, Datenexport, Löschantrag, Löschung/Schließung

-- 1 Fehlender Fremdschlüssel: Benachrichtigungen hängen an der Person
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2 Löschanträge
CREATE TABLE public.deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','rejected','withdrawn','done')),
  handled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  handled_at timestamptz,
  handled_note text CHECK (handled_note IS NULL OR char_length(handled_note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX deletion_requests_one_open ON public.deletion_requests(user_id) WHERE status = 'open';
GRANT SELECT ON public.deletion_requests TO authenticated;
GRANT ALL ON public.deletion_requests TO service_role;
ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY deletion_requests_select ON public.deletion_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_leitung(auth.uid()));

-- 3 Sperr-Trigger: DELETE nur bei laufender Kontolöschung (azuvera.account_removal = 'on')
CREATE OR REPLACE FUNCTION public.account_removal_active()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('azuvera.account_removal', true), '') = 'on'
$$;

CREATE OR REPLACE FUNCTION public.reports_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  bypass boolean := coalesce(current_setting('app.bypass_guard', true), '') = 'on';
  review_action text := coalesce(current_setting('app.review_action', true), '');
  system_write boolean := bypass OR review_action IN ('approve', 'reject', 'reopen');
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'approved' AND NOT system_write AND NOT public.account_removal_active() THEN
      RAISE EXCEPTION 'Freigegebene Berichte können nicht gelöscht werden.';
    END IF;
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
END $function$;

-- report_attachments: Der Sperr-Trigger prüft nur INSERT/UPDATE; DELETE folgt den RLS-Regeln und der Kaskade.

CREATE OR REPLACE FUNCTION public.report_versions_immutable()
 RETURNS trigger LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' AND public.account_removal_active() THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Berichtsversionen können nicht geändert oder gelöscht werden.';
END $function$;

CREATE OR REPLACE FUNCTION public.report_comments_immutable()
 RETURNS trigger LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' AND public.account_removal_active() THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Kommentare können nicht geändert oder gelöscht werden.';
END $function$;

-- Protokoll-Trigger aus 5B schreiben während der Kontolöschung nichts
CREATE OR REPLACE FUNCTION public.audit_attachments_change()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if public.account_removal_active() then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    perform public.write_audit('report', new.report_id, 'attachment_add', new.azubi_id,
      jsonb_build_object('attachment_id', new.id, 'mime_type', new.mime_type, 'size_bytes', new.size_bytes, 'sha256', new.sha256));
    return new;
  end if;
  perform public.write_audit('report', old.report_id, 'attachment_delete', old.azubi_id,
    jsonb_build_object('attachment_id', old.id, 'mime_type', old.mime_type, 'size_bytes', old.size_bytes, 'sha256', old.sha256));
  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION public.audit_reports_change()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_fields text[] := array[]::text[];
begin
  if public.account_removal_active() then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    perform public.write_audit('report', new.id, 'create', new.azubi_id,
      jsonb_build_object('report_type', new.report_type, 'report_date', new.report_date));
    return new;
  elsif tg_op = 'DELETE' then
    if old.status = 'draft' then
      perform public.write_audit('report', old.id, 'delete', old.azubi_id,
        jsonb_build_object('report_type', old.report_type, 'report_date', old.report_date));
    end if;
    return old;
  end if;
  if new.activities is distinct from old.activities then v_fields := array_append(v_fields, 'activities'::text); end if;
  if new.school_content is distinct from old.school_content then v_fields := array_append(v_fields, 'school_content'::text); end if;
  if new.instructions is distinct from old.instructions then v_fields := array_append(v_fields, 'instructions'::text); end if;
  if new.summary is distinct from old.summary then v_fields := array_append(v_fields, 'summary'::text); end if;
  if new.weekly_mode is distinct from old.weekly_mode then v_fields := array_append(v_fields, 'weekly_mode'::text); end if;
  if new.report_date is distinct from old.report_date then v_fields := array_append(v_fields, 'report_date'::text); end if;
  if cardinality(v_fields) = 0 then return new; end if;
  if exists (
    select 1 from public.audit_log a
    where a.entity_type = 'report' and a.entity_id = new.id and a.action = 'edit'
      and a.created_at > now() - interval '60 minutes'
  ) then
    return new;
  end if;
  perform public.write_audit('report', new.id, 'edit', new.azubi_id,
    jsonb_build_object('version', new.version, 'fields', to_jsonb(v_fields)));
  return new;
end;
$function$;

-- 4 Auskunft
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  v_role public.app_role;
  v_reports uuid[];
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = me;
  SELECT coalesce(array_agg(id), '{}') INTO v_reports FROM public.reports WHERE azubi_id = me;
  RETURN jsonb_build_object(
    'generated_at', now(),
    'profile', (SELECT to_jsonb(p) || jsonb_build_object(
        'company_name', (SELECT c.name FROM public.companies c WHERE c.id = p.company_id),
        'profession_name', (SELECT pr.name FROM public.professions pr WHERE pr.id = p.profession_id))
      FROM public.profiles p WHERE p.id = me),
    'role', v_role,
    'consents', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.granted_at) FROM public.consents c WHERE c.user_id = me), '[]'),
    'notification_prefs', (SELECT to_jsonb(n) FROM public.notification_prefs n WHERE n.user_id = me),
    'push_devices', coalesce((SELECT jsonb_agg(jsonb_build_object('device_label', s.device_label, 'created_at', s.created_at, 'last_used_at', s.last_used_at) ORDER BY s.created_at)
      FROM public.push_subscriptions s WHERE s.user_id = me), '[]'),
    'reports', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.report_date, r.report_type) FROM public.reports r WHERE r.azubi_id = me), '[]'),
    'report_attachments', coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.report_id, a.sort_order) FROM public.report_attachments a WHERE a.azubi_id = me), '[]'),
    'report_versions', coalesce((SELECT jsonb_agg(to_jsonb(v) - 'changed_by' || jsonb_build_object('changed_by_me', v.changed_by = me) ORDER BY v.report_id, v.version)
      FROM public.report_versions v WHERE v.report_id = ANY (v_reports)), '[]'),
    'report_signatures', coalesce((SELECT jsonb_agg(to_jsonb(s) - 'signer_id' - 'on_behalf_of' || jsonb_build_object('own', s.signer_id = me) ORDER BY s.signed_at)
      FROM public.report_signatures s WHERE s.report_id = ANY (v_reports) OR s.signer_id = me), '[]'),
    'report_comments', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'report_id', c.report_id, 'kind', c.kind, 'section', c.section, 'body', c.body, 'created_at', c.created_at,
        'author_name', coalesce((SELECT p.full_name FROM public.profiles p WHERE p.id = c.author_id), 'Gelöschte Person'),
        'own', c.author_id = me) ORDER BY c.created_at)
      FROM public.report_comments c WHERE c.azubi_id = me OR c.author_id = me), '[]'),
    'absences', coalesce((SELECT jsonb_agg(to_jsonb(a) - 'reviewer_id' ORDER BY a.date_from) FROM public.absences a WHERE a.azubi_id = me), '[]'),
    'school_grades', coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.grade_date) FROM public.school_grades g WHERE g.azubi_id = me), '[]'),
    'notifications', coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.created_at) FROM public.notifications n WHERE n.user_id = me), '[]'),
    'deputies', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'my_role', CASE WHEN d.principal_id = me THEN 'vertreten' ELSE 'vertretung' END,
        'date_from', d.date_from, 'date_to', d.date_to, 'reason', d.reason, 'note', d.note,
        'created_at', d.created_at, 'revoked_at', d.revoked_at) ORDER BY d.date_from)
      FROM public.deputies d WHERE d.principal_id = me OR d.deputy_id = me), '[]'),
    'user_signatures', coalesce((SELECT jsonb_agg(jsonb_build_object('image_path', u.image_path, 'updated_at', u.updated_at)) FROM public.user_signatures u WHERE u.user_id = me), '[]'),
    'ai_usage', coalesce((SELECT jsonb_agg(to_jsonb(a) - 'user_id' ORDER BY a.created_at) FROM public.ai_usage a WHERE a.user_id = me), '[]'),
    'deletion_requests', coalesce((SELECT jsonb_agg(to_jsonb(r) - 'handled_by' ORDER BY r.created_at) FROM public.deletion_requests r WHERE r.user_id = me), '[]'),
    'audit', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', x.id, 'created_at', x.created_at, 'actor_role', x.actor_role, 'by_me', x.actor_id = me,
        'entity_type', x.entity_type, 'entity_id', x.entity_id, 'action', x.action, 'details', x.details, 'row_hash', x.row_hash) ORDER BY x.id DESC)
      FROM (SELECT * FROM public.audit_log a WHERE a.azubi_id = me OR a.actor_id = me ORDER BY a.id DESC LIMIT 5000) x), '[]')
  );
END $$;

CREATE OR REPLACE FUNCTION public.log_data_export()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
  PERFORM public.write_audit('account', auth.uid(), 'data_export',
    CASE WHEN public.has_role(auth.uid(), 'azubi') THEN auth.uid() END, '{}'::jsonb);
END $$;

-- 5 Löschantrag
CREATE OR REPLACE FUNCTION public.request_account_deletion(p_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  v_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN RAISE EXCEPTION 'Die Anmerkung darf höchstens 500 Zeichen lang sein.'; END IF;
  IF EXISTS (SELECT 1 FROM public.deletion_requests WHERE user_id = me AND status = 'open') THEN
    RAISE EXCEPTION 'Es gibt bereits einen offenen Antrag.';
  END IF;
  INSERT INTO public.deletion_requests(user_id, note) VALUES (me, v_note) RETURNING id INTO v_id;
  INSERT INTO public.notifications(user_id, type, title, body, link, entity_type, entity_id)
  SELECT ur.user_id, 'deletion_requested', 'Löschantrag', 'Ein Konto soll gelöscht werden.', '/admin#loeschantraege', 'deletion_request', v_id
  FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'ausbildungsleitung' AND p.email NOT LIKE '%@azuvera.invalid';
  PERFORM public.write_audit('account', me, 'deletion_requested',
    CASE WHEN public.has_role(me, 'azubi') THEN me END, jsonb_build_object('request_id', v_id));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.withdraw_account_deletion(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
  UPDATE public.deletion_requests SET status = 'withdrawn'
  WHERE id = p_id AND user_id = auth.uid() AND status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'Es gibt keinen offenen Antrag.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.reject_account_deletion(p_id uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_note text := btrim(coalesce(p_note, ''));
  v_user uuid;
BEGIN
  IF NOT public.is_leitung(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF char_length(v_note) < 3 OR char_length(v_note) > 500 THEN RAISE EXCEPTION 'Die Begründung muss 3 bis 500 Zeichen lang sein.'; END IF;
  UPDATE public.deletion_requests
     SET status = 'rejected', handled_by = auth.uid(), handled_at = now(), handled_note = v_note
   WHERE id = p_id AND status = 'open'
  RETURNING user_id INTO v_user;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Es gibt keinen offenen Antrag.'; END IF;
  INSERT INTO public.notifications(user_id, type, title, body, link, entity_type, entity_id)
  VALUES (v_user, 'deletion_rejected', 'Löschantrag abgelehnt', v_note, '/profil#meine-daten', 'deletion_request', p_id);
  PERFORM public.write_audit('account', v_user, 'deletion_rejected',
    CASE WHEN public.has_role(v_user, 'azubi') THEN v_user END, jsonb_build_object('request_id', p_id));
END $$;

-- 6 Löschen und Schließen (nur service_role, aufgerufen von /api/delete-account)
CREATE OR REPLACE FUNCTION public.account_removal_paths(p_user uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT x.path), '{}') FROM (
    SELECT 'report-files/' || a.storage_path AS path FROM public.report_attachments a WHERE a.azubi_id = p_user
    UNION SELECT 'report-files/' || a.thumb_path FROM public.report_attachments a WHERE a.azubi_id = p_user AND a.thumb_path IS NOT NULL
    UNION SELECT 'signatures/' || s.image_path FROM public.report_signatures s JOIN public.reports r ON r.id = s.report_id
      WHERE r.azubi_id = p_user AND s.role = 'azubi' AND s.image_path IS NOT NULL
    UNION SELECT 'signatures/' || u.image_path FROM public.user_signatures u WHERE u.user_id = p_user AND u.image_path IS NOT NULL
    UNION SELECT o.bucket_id || '/' || o.name FROM storage.objects o
      WHERE o.bucket_id IN ('report-files', 'signatures') AND split_part(o.name, '/', 1) = p_user::text
  ) x
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_azubi_data(p_user uuid, p_actor uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(p_user, 'azubi') THEN RAISE EXCEPTION 'Nur Konten von Auszubildenden können gelöscht werden.'; END IF;
  PERFORM set_config('azuvera.account_removal', 'on', true);
  DELETE FROM public.ai_usage WHERE user_id = p_user;
  DELETE FROM public.function_calls WHERE user_id = p_user;
  DELETE FROM public.profiles WHERE id = p_user;
  PERFORM set_config('azuvera.account_removal', '', true);
  INSERT INTO public.audit_log (chain_key, actor_id, actor_role, azubi_id, entity_type, entity_id, action, details)
  VALUES ('00000000-0000-0000-0000-000000000000', p_actor,
    (SELECT role FROM public.user_roles WHERE user_id = p_actor), NULL, 'account', p_user, 'account_deleted',
    jsonb_build_object('mode', 'deleted'));
END $$;

CREATE OR REPLACE FUNCTION public.admin_anonymize_user(p_user uuid, p_actor uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user) THEN RAISE EXCEPTION 'Konto nicht gefunden.'; END IF;
  IF public.has_role(p_user, 'azubi') THEN RAISE EXCEPTION 'Konten von Auszubildenden werden gelöscht, nicht geschlossen.'; END IF;
  PERFORM set_config('app.allow_protected_profile_write', 'on', true);
  UPDATE public.profiles SET
    vorname = 'Gelöschte', nachname = 'Person',
    email = 'geloescht-' || p_user::text || '@azuvera.invalid',
    telefon = NULL, geburtsdatum = NULL, personalnummer = NULL,
    strasse = NULL, plz = NULL, ort = NULL, land = 'Deutschland',
    notfallkontakt_name = NULL, notfallkontakt_telefon = NULL
  WHERE id = p_user;
  UPDATE public.profiles SET ausbilder_id = NULL WHERE ausbilder_id = p_user;
  PERFORM set_config('app.allow_protected_profile_write', '', true);
  DELETE FROM public.push_subscriptions WHERE user_id = p_user;
  DELETE FROM public.notification_prefs WHERE user_id = p_user;
  DELETE FROM public.notifications WHERE user_id = p_user;
  DELETE FROM public.user_signatures WHERE user_id = p_user;
  DELETE FROM public.function_calls WHERE user_id = p_user;
  DELETE FROM public.ai_usage WHERE user_id = p_user;
  UPDATE public.deputies SET revoked_at = now()
   WHERE (principal_id = p_user OR deputy_id = p_user) AND revoked_at IS NULL AND date_to >= current_date;
  UPDATE public.deletion_requests SET status = 'done', handled_at = now(), handled_by = p_actor
   WHERE user_id = p_user AND status = 'open';
  INSERT INTO public.audit_log (chain_key, actor_id, actor_role, azubi_id, entity_type, entity_id, action, details)
  VALUES ('00000000-0000-0000-0000-000000000000', p_actor,
    (SELECT role FROM public.user_roles WHERE user_id = p_actor), NULL, 'account', p_user, 'account_deleted',
    jsonb_build_object('mode', 'anonymized'));
END $$;

-- 7 Rechte
REVOKE ALL ON FUNCTION public.export_my_data() FROM public, anon;
REVOKE ALL ON FUNCTION public.log_data_export() FROM public, anon;
REVOKE ALL ON FUNCTION public.request_account_deletion(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.withdraw_account_deletion(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.reject_account_deletion(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.export_my_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_data_export() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_account_deletion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_account_deletion(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.account_removal_paths(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_azubi_data(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_anonymize_user(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_removal_paths(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_azubi_data(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_anonymize_user(uuid, uuid) TO service_role;

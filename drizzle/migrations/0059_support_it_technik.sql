-- ============ Grundfunktionen ============
CREATE OR REPLACE FUNCTION public.support_all_scopes() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT ARRAY['profil_bearbeiten','berichte_bearbeiten','berichte_loeschen','ausbildung_bearbeiten','anhaenge_verwalten','team_verwalten','email_aendern']::text[]
$$;

CREATE OR REPLACE FUNCTION public.support_random_code(_len integer) RETURNS text
LANGUAGE plpgsql VOLATILE SET search_path = public AS $$
DECLARE a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea := extensions.gen_random_bytes(_len); r text := ''; i int;
BEGIN
  FOR i IN 0.._len - 1 LOOP r := r || substr(a, (get_byte(b, i) % 32) + 1, 1); END LOOP;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.support_random_code(integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_support_agent(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid, 'it_technik')
$$;

CREATE OR REPLACE FUNCTION public.support_mfa_ok() RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

CREATE OR REPLACE FUNCTION public.support_agent_ok() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.is_support_agent(auth.uid()) AND public.support_mfa_ok()
$$;

-- Verwaltung: IT/Technik gehört nie zum Verwaltungs-Team
CREATE OR REPLACE FUNCTION public.is_team(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (public.is_leitung(_uid) OR EXISTS (SELECT 1 FROM public.team_members WHERE user_id = _uid))
    AND NOT public.is_support_agent(_uid)
$$;

-- ============ Support-IDs ============
CREATE TABLE public.support_refs (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  ref text NOT NULL UNIQUE CHECK (ref ~ '^U-[A-HJ-NP-Z2-9]{8}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.support_refs TO authenticated;
GRANT ALL ON public.support_refs TO service_role;
ALTER TABLE public.support_refs ENABLE ROW LEVEL SECURITY;
CREATE POLICY support_refs_select_own ON public.support_refs FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.support_assign_ref(_uid uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v text; i int := 0;
BEGIN
  SELECT ref INTO v FROM public.support_refs WHERE user_id = _uid;
  IF v IS NOT NULL THEN RETURN v; END IF;
  LOOP
    i := i + 1;
    v := 'U-' || public.support_random_code(8);
    BEGIN
      INSERT INTO public.support_refs (user_id, ref) VALUES (_uid, v);
      RETURN v;
    EXCEPTION WHEN unique_violation THEN
      SELECT ref INTO v FROM public.support_refs WHERE user_id = _uid;
      IF v IS NOT NULL THEN RETURN v; END IF;
      IF i > 20 THEN RAISE; END IF;
    END;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.support_assign_ref(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.support_refs_on_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public.support_assign_ref(NEW.id);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'support_ref failed: %', SQLSTATE;
  END;
  RETURN NEW;
END $$;
CREATE TRIGGER support_refs_on_profile AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.support_refs_on_profile();

INSERT INTO public.support_refs (user_id, ref)
SELECT p.id, 'U-' || public.support_random_code(8) FROM public.profiles p
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.support_my_ref() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
  RETURN public.support_assign_ref(auth.uid());
END $$;

-- ============ Support-Konten ============
CREATE TABLE public.support_agents (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  previous_role public.app_role NOT NULL,
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.support_agents TO service_role;
ALTER TABLE public.support_agents ENABLE ROW LEVEL SECURITY;

-- ============ Tickets ============
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  betreff text NOT NULL CHECK (char_length(betreff) BETWEEN 3 AND 120),
  beschreibung text NOT NULL DEFAULT '' CHECK (char_length(beschreibung) <= 2000),
  scopes text[] NOT NULL DEFAULT '{}',
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','eingeloest','geschlossen','abgelaufen','widerrufen')),
  gueltig_bis timestamptz NOT NULL,
  fehlversuche integer NOT NULL DEFAULT 0,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  eingeloest_von uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  eingeloest_am timestamptz
);
CREATE INDEX support_tickets_user_idx ON public.support_tickets (user_id, erstellt_am DESC);
GRANT SELECT (id, user_id, betreff, beschreibung, scopes, status, gueltig_bis, fehlversuche, erstellt_am, eingeloest_am)
  ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY support_tickets_select_own ON public.support_tickets FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============ Sitzungen ============
CREATE TABLE public.support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ziel_user_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  methode text NOT NULL CHECK (methode IN ('ticket','identitaet')),
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  schreiben_erlaubt boolean NOT NULL DEFAULT false,
  grund text NOT NULL DEFAULT '',
  gestartet_am timestamptz NOT NULL DEFAULT now(),
  laeuft_ab_am timestamptz NOT NULL,
  beendet_am timestamptz
);
CREATE INDEX support_sessions_agent_idx ON public.support_sessions (agent_id, gestartet_am DESC);
CREATE INDEX support_sessions_ziel_idx ON public.support_sessions (ziel_user_id);
GRANT SELECT ON public.support_sessions TO authenticated;
GRANT ALL ON public.support_sessions TO service_role;
ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY support_sessions_select ON public.support_sessions FOR SELECT TO authenticated
  USING (agent_id = auth.uid() OR ziel_user_id = auth.uid() OR public.is_team(auth.uid()));

-- ============ Prüfversuche (keine eingegebenen Personendaten) ============
CREATE TABLE public.support_identity_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  ziel_user_id uuid,
  erfolg boolean NOT NULL DEFAULT false,
  art text NOT NULL DEFAULT 'identitaet' CHECK (art IN ('identitaet','code')),
  erstellt_am timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_attempts_agent_idx ON public.support_identity_attempts (agent_id, art, erstellt_am DESC);
CREATE INDEX support_attempts_ziel_idx ON public.support_identity_attempts (ziel_user_id, erstellt_am DESC);
GRANT SELECT ON public.support_identity_attempts TO authenticated;
GRANT ALL ON public.support_identity_attempts TO service_role;
ALTER TABLE public.support_identity_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY support_attempts_select_team ON public.support_identity_attempts FOR SELECT TO authenticated
  USING (public.is_team(auth.uid()));

-- ============ Support-Protokoll (nur anhängen) ============
CREATE TABLE public.support_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid,
  agent_id uuid NOT NULL,
  ziel_user_id uuid NOT NULL,
  aktion text NOT NULL CHECK (aktion IN ('lesen','aendern','loeschen','sitzung_start','sitzung_ende')),
  tabelle text,
  datensatz_id uuid,
  geaenderte_felder text[] NOT NULL DEFAULT '{}',
  erstellt_am timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_audit_ziel_idx ON public.support_audit_log (ziel_user_id, erstellt_am DESC);
GRANT SELECT ON public.support_audit_log TO authenticated;
GRANT SELECT, INSERT ON public.support_audit_log TO service_role;
ALTER TABLE public.support_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY support_audit_select ON public.support_audit_log FOR SELECT TO authenticated
  USING (ziel_user_id = auth.uid() OR public.is_team(auth.uid()));

CREATE OR REPLACE FUNCTION public.support_audit_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Das Support-Protokoll kann nicht verändert werden.';
END $$;
CREATE TRIGGER support_audit_no_update BEFORE UPDATE OR DELETE ON public.support_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.support_audit_immutable();
CREATE TRIGGER support_audit_no_truncate BEFORE TRUNCATE ON public.support_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.support_audit_immutable();

CREATE OR REPLACE FUNCTION public.support_log(_session uuid, _ziel uuid, _aktion text, _tabelle text, _datensatz uuid, _felder text[] DEFAULT '{}')
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.support_audit_log (session_id, agent_id, ziel_user_id, aktion, tabelle, datensatz_id, geaenderte_felder)
  VALUES (_session, auth.uid(), _ziel, _aktion, _tabelle, _datensatz, coalesce(_felder, '{}'))
$$;
REVOKE ALL ON FUNCTION public.support_log(uuid, uuid, text, text, uuid, text[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.support_notify(_uid uuid, _type text, _title text, _body text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications (user_id, type, title, body, link) VALUES (_uid, _type, _title, _body, '/hilfe')
$$;
REVOKE ALL ON FUNCTION public.support_notify(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

-- ============ Berechtigungsprüfung ============
CREATE OR REPLACE FUNCTION public.support_session_for(_ziel uuid) RETURNS public.support_sessions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.* FROM public.support_sessions s
  WHERE public.support_agent_ok() AND s.agent_id = auth.uid() AND s.ziel_user_id = _ziel
    AND s.beendet_am IS NULL AND s.laeuft_ab_am > now()
  ORDER BY s.gestartet_am DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.support_session_for(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.support_any_session() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.support_sessions s
    WHERE s.agent_id = auth.uid() AND s.beendet_am IS NULL AND s.laeuft_ab_am > now()
  ) AND public.support_agent_ok()
$$;

CREATE OR REPLACE FUNCTION public.support_can_read(ziel uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (public.support_session_for(ziel)).id IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.support_can_write(ziel uuid, scope text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.support_sessions s
    WHERE public.support_agent_ok() AND s.agent_id = auth.uid() AND s.ziel_user_id = ziel
      AND s.beendet_am IS NULL AND s.laeuft_ab_am > now()
      AND s.schreiben_erlaubt AND scope = ANY (s.scopes) AND scope = ANY (public.support_all_scopes())
      AND (scope <> 'email_aendern' OR s.methode = 'ticket')
  )
$$;

CREATE OR REPLACE FUNCTION public.support_path_owner(_name text) RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN split_part(_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(_name, '/', 1)::uuid END
$$;

-- Zusätzliche Lese-Policies: nur in einer aktiven Sitzung, nur Datensätze der Zielperson
CREATE POLICY support_read ON public.profiles FOR SELECT TO authenticated USING ((SELECT public.support_any_session()) AND public.support_can_read(id));
CREATE POLICY support_read ON public.reports FOR SELECT TO authenticated USING ((SELECT public.support_any_session()) AND public.support_can_read(azubi_id));
CREATE POLICY support_read ON public.report_attachments FOR SELECT TO authenticated USING ((SELECT public.support_any_session()) AND public.support_can_read(azubi_id));
CREATE POLICY support_read ON public.experience_reports FOR SELECT TO authenticated USING ((SELECT public.support_any_session()) AND public.support_can_read(azubi_id));
CREATE POLICY support_read ON public.experience_attachments FOR SELECT TO authenticated USING ((SELECT public.support_any_session()) AND public.support_can_read(azubi_id));
CREATE POLICY support_read ON public.leittext_works FOR SELECT TO authenticated USING ((SELECT public.support_any_session()) AND public.support_can_read(azubi_id));
CREATE POLICY support_read ON public.leittext_attachments FOR SELECT TO authenticated USING ((SELECT public.support_any_session()) AND public.support_can_read(azubi_id));
CREATE POLICY support_read ON public.absences FOR SELECT TO authenticated USING ((SELECT public.support_any_session()) AND public.support_can_read(azubi_id));
CREATE POLICY support_read ON public.school_grades FOR SELECT TO authenticated USING ((SELECT public.support_any_session()) AND public.support_can_read(azubi_id));
CREATE POLICY support_read ON public.instruction_records FOR SELECT TO authenticated USING ((SELECT public.support_any_session()) AND public.support_can_read(azubi_id));
CREATE POLICY support_read ON public.plan_progress FOR SELECT TO authenticated USING ((SELECT public.support_any_session()) AND public.support_can_read(azubi_id));
CREATE POLICY support_read ON public.azubi_plans FOR SELECT TO authenticated USING ((SELECT public.support_any_session()) AND public.support_can_read(azubi_id));
CREATE POLICY support_read ON public.exam_applications FOR SELECT TO authenticated USING ((SELECT public.support_any_session()) AND public.support_can_read(azubi_id));
CREATE POLICY support_read ON public.access_grants FOR SELECT TO authenticated USING ((SELECT public.support_any_session()) AND public.support_can_read(azubi_id));

CREATE POLICY support_files_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('report-files','experience-files','leittext-files')
    AND (SELECT public.support_any_session()) AND public.support_can_read(public.support_path_owner(name)));
CREATE POLICY support_files_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('report-files','experience-files','leittext-files')
    AND (SELECT public.support_any_session())
    AND (public.support_can_write(public.support_path_owner(name), 'anhaenge_verwalten')
      OR public.support_can_write(public.support_path_owner(name), 'berichte_loeschen')));

-- ============ Benachrichtigungen: Sicherheits-Hinweise immer zustellen ============
CREATE OR REPLACE FUNCTION public.notification_group(_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when _type in ('report_submitted','report_approved','report_rejected','report_reopened','comment',
                   'instruction_submitted','instruction_confirmed','instruction_rejected',
                   'experience_submitted','experience_approved','experience_rejected','experience_reopened','experience_comment',
                   'leittext_submitted','leittext_approved','leittext_rejected','leittext_reopened','leittext_comment',
                   'certificate_requested','certificate_issued',
                   'exam_application_submitted','exam_application_confirmed','exam_application_returned') then 'reports'
    when _type in ('absence_requested','absence_approved','absence_rejected') then 'absences'
    when _type in ('report_reminder','deadline_soon','deadline_today','deadline_overdue','review_pending','daily_nudge','instruction_due','experience_due') then 'reminders'
    when _type in ('deputy_assigned','deputy_ended') then 'deputy'
    when _type in ('support_session_started','support_session_ended','support_identity_failed') then 'security'
    else null end
$function$;

create or replace function public.enqueue_deliveries() returns trigger
language plpgsql security definer set search_path = public as $$
declare g text; p record; v_local timestamp; v_now_t time; v_in_quiet boolean; v_sched timestamptz;
begin
  begin
    g := public.notification_group(new.type);
    if g is null then return new; end if;
    if g = 'security' then
      -- Sicherheits-Hinweise (Support-Zugriff) gehen immer sofort raus
      if exists (select 1 from public.push_subscriptions s where s.user_id = new.user_id) then
        insert into public.delivery_queue(notification_id, user_id, channel, scheduled_at) values (new.id, new.user_id, 'push', now());
      end if;
      if exists (select 1 from public.profiles pr where pr.id = new.user_id and coalesce(pr.email,'') <> '') then
        insert into public.delivery_queue(notification_id, user_id, channel) values (new.id, new.user_id, 'email');
      end if;
      return new;
    end if;
    select * into p from public.effective_prefs(new.user_id);
    if coalesce((p.groups->g->>'push')::boolean, false)
       and exists (select 1 from public.push_subscriptions s where s.user_id = new.user_id) then
      v_sched := now();
      if p.quiet_hours_enabled then
        v_local := now() at time zone 'Europe/Berlin';
        v_now_t := v_local::time;
        if p.quiet_from > p.quiet_to then
          v_in_quiet := v_now_t >= p.quiet_from or v_now_t < p.quiet_to;
        else
          v_in_quiet := v_now_t >= p.quiet_from and v_now_t < p.quiet_to;
        end if;
        if v_in_quiet then
          v_sched := ((v_local::date + case when v_now_t >= p.quiet_to then 1 else 0 end) + p.quiet_to) at time zone 'Europe/Berlin';
        end if;
      end if;
      insert into public.delivery_queue(notification_id, user_id, channel, scheduled_at) values (new.id, new.user_id, 'push', v_sched);
    end if;
    if coalesce((p.groups->g->>'email')::boolean, false)
       and exists (select 1 from public.profiles pr where pr.id = new.user_id and coalesce(pr.email,'') <> '') then
      insert into public.delivery_queue(notification_id, user_id, channel) values (new.id, new.user_id, 'email');
    end if;
  exception when others then
    raise warning 'enqueue_deliveries failed: %', sqlstate;
  end;
  return new;
end $$;

-- ============ Tickets (Person) ============
CREATE OR REPLACE FUNCTION public.support_create_ticket(p_betreff text, p_beschreibung text, p_scopes text[], p_hours integer, p_code_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_scopes text[]; v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet.'; END IF;
  IF public.is_support_agent(v_uid) THEN RAISE EXCEPTION 'Support-Konten können keine Tickets erstellen.'; END IF;
  IF p_hours IS NULL OR p_hours NOT IN (1, 24, 168) THEN RAISE EXCEPTION 'Bitte wähle eine gültige Laufzeit.'; END IF;
  IF char_length(btrim(coalesce(p_betreff, ''))) < 3 THEN RAISE EXCEPTION 'Bitte gib einen Betreff mit mindestens 3 Zeichen an.'; END IF;
  v_scopes := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_scopes, '{}'::text[])) x ORDER BY 1);
  IF NOT (v_scopes <@ public.support_all_scopes()) THEN RAISE EXCEPTION 'Unbekannte Freigabe.'; END IF;
  IF lower(coalesce(p_code_hash, '')) !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Ungültiger Code.'; END IF;
  IF (SELECT count(*) FROM public.support_tickets WHERE user_id = v_uid AND status IN ('offen','eingeloest') AND gueltig_bis > now()) >= 5 THEN
    RAISE EXCEPTION 'Du hast schon 5 aktive Tickets. Beende zuerst eines.';
  END IF;
  INSERT INTO public.support_tickets (user_id, betreff, beschreibung, scopes, code_hash, gueltig_bis)
  VALUES (v_uid, btrim(p_betreff), btrim(coalesce(p_beschreibung, '')), v_scopes, lower(p_code_hash), now() + make_interval(hours => p_hours))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.support_my_tickets()
RETURNS TABLE(id uuid, betreff text, beschreibung text, scopes text[], status text, gueltig_bis timestamptz, erstellt_am timestamptz, eingeloest_am timestamptz, sitzung_aktiv boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.betreff, t.beschreibung, t.scopes,
    CASE WHEN t.status IN ('offen','eingeloest') AND t.gueltig_bis <= now() THEN 'abgelaufen' ELSE t.status END,
    t.gueltig_bis, t.erstellt_am, t.eingeloest_am,
    EXISTS (SELECT 1 FROM public.support_sessions s WHERE s.ticket_id = t.id AND s.beendet_am IS NULL AND s.laeuft_ab_am > now())
  FROM public.support_tickets t WHERE t.user_id = auth.uid() ORDER BY t.erstellt_am DESC LIMIT 50
$$;

CREATE OR REPLACE FUNCTION public.support_revoke_ticket(p_ticket uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record;
BEGIN
  UPDATE public.support_tickets SET status = 'widerrufen'
   WHERE id = p_ticket AND user_id = auth.uid() AND status IN ('offen','eingeloest');
  IF NOT FOUND THEN RAISE EXCEPTION 'Dieses Ticket ist schon beendet.'; END IF;
  FOR s IN UPDATE public.support_sessions SET beendet_am = now() WHERE ticket_id = p_ticket AND beendet_am IS NULL RETURNING * LOOP
    INSERT INTO public.support_audit_log (session_id, agent_id, ziel_user_id, aktion, tabelle, datensatz_id)
    VALUES (s.id, s.agent_id, s.ziel_user_id, 'sitzung_ende', 'support_tickets', p_ticket);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.support_my_access_log()
RETURNS TABLE(id bigint, erstellt_am timestamptz, aktion text, tabelle text, geaenderte_felder text[], agent_name text, methode text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.erstellt_am, a.aktion, a.tabelle, a.geaenderte_felder,
    coalesce(nullif(p.full_name, ''), 'Azuvera-Support'), s.methode
  FROM public.support_audit_log a
  LEFT JOIN public.profiles p ON p.id = a.agent_id
  LEFT JOIN public.support_sessions s ON s.id = a.session_id
  WHERE a.ziel_user_id = auth.uid() ORDER BY a.erstellt_am DESC LIMIT 200
$$;

-- ============ IT/Technik: Status, Liste, Sitzungen ============
CREATE OR REPLACE FUNCTION public.support_code_locked(_agent uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.support_identity_attempts a
    WHERE a.agent_id = _agent AND a.art = 'code' AND NOT a.erfolg AND a.erstellt_am > now() - interval '30 minutes'
      AND (SELECT count(*) FROM public.support_identity_attempts b
           WHERE b.agent_id = _agent AND b.art = 'code' AND NOT b.erfolg
             AND b.erstellt_am BETWEEN a.erstellt_am - interval '15 minutes' AND a.erstellt_am) >= 5)
$$;
REVOKE ALL ON FUNCTION public.support_code_locked(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.support_my_status() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'is_agent', public.is_support_agent(auth.uid()),
    'mfa_ok', public.support_mfa_ok(),
    'code_locked', public.is_support_agent(auth.uid()) AND public.support_code_locked(auth.uid()))
$$;

CREATE OR REPLACE FUNCTION public.support_directory()
RETURNS TABLE(ref text, role public.app_role, registriert_am timestamptz, status text, sitzung_aktiv boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.support_agent_ok() THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  RETURN QUERY
  SELECT r.ref, ur.role, p.created_at,
    CASE WHEN lower(p.email) LIKE '%@azuvera.invalid' THEN 'geschlossen'
         WHEN EXISTS (SELECT 1 FROM public.deletion_requests d WHERE d.user_id = p.id AND d.status IN ('open','offen','pending')) THEN 'Löschung beantragt'
         ELSE 'aktiv' END,
    EXISTS (SELECT 1 FROM public.support_sessions s WHERE s.agent_id = auth.uid() AND s.ziel_user_id = p.id AND s.beendet_am IS NULL AND s.laeuft_ab_am > now())
  FROM public.profiles p
  JOIN public.support_refs r ON r.user_id = p.id
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.id <> auth.uid()
  ORDER BY p.created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.support_active_session() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('id', s.id, 'ziel_user_id', s.ziel_user_id, 'ref', r.ref, 'methode', s.methode, 'scopes', to_jsonb(s.scopes),
    'schreiben_erlaubt', s.schreiben_erlaubt, 'grund', s.grund, 'gestartet_am', s.gestartet_am, 'laeuft_ab_am', s.laeuft_ab_am)
  FROM public.support_sessions s LEFT JOIN public.support_refs r ON r.user_id = s.ziel_user_id
  WHERE public.support_agent_ok() AND s.agent_id = auth.uid() AND s.beendet_am IS NULL AND s.laeuft_ab_am > now()
  ORDER BY s.gestartet_am DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.support_my_sessions()
RETURNS TABLE(id uuid, ref text, methode text, scopes text[], grund text, gestartet_am timestamptz, laeuft_ab_am timestamptz, beendet_am timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.support_agent_ok() THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  RETURN QUERY SELECT s.id, r.ref, s.methode, s.scopes, s.grund, s.gestartet_am, s.laeuft_ab_am, s.beendet_am
  FROM public.support_sessions s LEFT JOIN public.support_refs r ON r.user_id = s.ziel_user_id
  WHERE s.agent_id = auth.uid() ORDER BY s.gestartet_am DESC LIMIT 100;
END $$;

CREATE OR REPLACE FUNCTION public.support_end_other_sessions(_agent uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record;
BEGIN
  FOR s IN UPDATE public.support_sessions SET beendet_am = now()
    WHERE agent_id = _agent AND beendet_am IS NULL AND laeuft_ab_am > now() RETURNING * LOOP
    INSERT INTO public.support_audit_log (session_id, agent_id, ziel_user_id, aktion, tabelle)
    VALUES (s.id, s.agent_id, s.ziel_user_id, 'sitzung_ende', 'support_sessions');
    PERFORM public.support_notify(s.ziel_user_id, 'support_session_ended', 'Support-Sitzung beendet', 'Der Azuvera-Support hat die Sitzung zu deinem Konto beendet.');
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.support_end_other_sessions(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.support_end_session(p_session uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.support_sessions;
BEGIN
  IF NOT public.is_support_agent(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  UPDATE public.support_sessions SET beendet_am = now()
   WHERE id = p_session AND agent_id = auth.uid() AND beendet_am IS NULL RETURNING * INTO s;
  IF s.id IS NULL THEN RETURN; END IF;
  PERFORM public.support_log(s.id, s.ziel_user_id, 'sitzung_ende', 'support_sessions', s.id);
  PERFORM public.support_notify(s.ziel_user_id, 'support_session_ended', 'Support-Sitzung beendet', 'Der Azuvera-Support hat die Sitzung zu deinem Konto beendet.');
END $$;

-- Weg A: Ticket-Code einlösen
CREATE OR REPLACE FUNCTION public.support_redeem_ticket(p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_agent uuid := auth.uid(); v_norm text; v_hash text; t public.support_tickets; v_sid uuid;
  v_generic constant text := 'Code ungültig oder abgelaufen.';
BEGIN
  IF NOT public.support_agent_ok() THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF public.support_code_locked(v_agent) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Zu viele falsche Codes. Bitte warte 30 Minuten.');
  END IF;
  v_norm := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_hash := encode(extensions.digest(v_norm, 'sha256'), 'hex');
  SELECT * INTO t FROM public.support_tickets WHERE code_hash = v_hash FOR UPDATE;
  IF t.id IS NULL OR char_length(v_norm) <> 16 OR t.user_id = v_agent OR t.gueltig_bis <= now()
     OR t.status NOT IN ('offen','eingeloest') OR (t.status = 'eingeloest' AND t.eingeloest_von IS DISTINCT FROM v_agent) THEN
    INSERT INTO public.support_identity_attempts (agent_id, ziel_user_id, erfolg, art) VALUES (v_agent, NULL, false, 'code');
    IF t.id IS NOT NULL THEN UPDATE public.support_tickets SET fehlversuche = fehlversuche + 1 WHERE id = t.id; END IF;
    RETURN jsonb_build_object('ok', false, 'error', v_generic);
  END IF;
  INSERT INTO public.support_identity_attempts (agent_id, ziel_user_id, erfolg, art) VALUES (v_agent, t.user_id, true, 'code');
  SELECT id INTO v_sid FROM public.support_sessions
   WHERE ticket_id = t.id AND agent_id = v_agent AND beendet_am IS NULL AND laeuft_ab_am > now() LIMIT 1;
  IF v_sid IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'session_id', v_sid); END IF;
  PERFORM public.support_end_other_sessions(v_agent);
  UPDATE public.support_tickets SET status = 'eingeloest', eingeloest_von = v_agent, eingeloest_am = coalesce(eingeloest_am, now()) WHERE id = t.id;
  INSERT INTO public.support_sessions (ziel_user_id, agent_id, methode, ticket_id, scopes, schreiben_erlaubt, grund, laeuft_ab_am)
  VALUES (t.user_id, v_agent, 'ticket', t.id, t.scopes, cardinality(t.scopes) > 0, t.betreff, t.gueltig_bis)
  RETURNING id INTO v_sid;
  PERFORM public.support_log(v_sid, t.user_id, 'sitzung_start', 'support_tickets', t.id);
  PERFORM public.support_notify(t.user_id, 'support_session_started', 'Support-Sitzung gestartet',
    'Der Azuvera-Support hat dein Ticket „' || left(t.betreff, 80) || '“ eingelöst und kann jetzt deine Daten sehen.');
  RETURN jsonb_build_object('ok', true, 'session_id', v_sid);
END $$;

-- Weg B: manuelle Identitätsprüfung
CREATE OR REPLACE FUNCTION public.support_norm_text(_t text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT regexp_replace(normalize(lower(btrim(coalesce(_t, ''))), NFKC), '\s+', ' ', 'g')
$$;

CREATE OR REPLACE FUNCTION public.support_norm_phone(_t text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN d = '' THEN ''
    WHEN d LIKE '00%' THEN substr(d, 3)
    WHEN d LIKE '0%' THEN '49' || substr(d, 2)
    ELSE d END
  FROM (SELECT regexp_replace(coalesce(_t, ''), '\D', '', 'g') AS d) x
$$;

CREATE OR REPLACE FUNCTION public.support_verify_identity(p_vorname text, p_nachname text, p_geburtsdatum date, p_email text, p_telefon text, p_grund text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_agent uuid := auth.uid(); p public.profiles; v_ok boolean := false; v_sid uuid;
  v_generic constant text := 'Angaben stimmen nicht überein.';
BEGIN
  IF NOT public.support_agent_ok() THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF char_length(btrim(coalesce(p_grund, ''))) < 5 THEN RAISE EXCEPTION 'Bitte beschreibe den Grund (mindestens 5 Zeichen).'; END IF;
  IF (SELECT count(*) FROM public.support_identity_attempts
      WHERE agent_id = v_agent AND art = 'identitaet' AND NOT erfolg AND erstellt_am > now() - interval '1 hour') >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Zu viele Fehlversuche. Bitte versuche es später erneut.');
  END IF;
  SELECT * INTO p FROM public.profiles WHERE lower(email) = lower(btrim(coalesce(p_email, ''))) LIMIT 1;
  IF p.id IS NOT NULL AND p.id <> v_agent AND p.geburtsdatum IS NOT NULL
     AND (SELECT count(*) FROM public.support_identity_attempts
          WHERE ziel_user_id = p.id AND art = 'identitaet' AND NOT erfolg AND erstellt_am > now() - interval '24 hours') < 3 THEN
    v_ok := public.support_norm_text(p.vorname) = public.support_norm_text(p_vorname)
      AND public.support_norm_text(p.nachname) = public.support_norm_text(p_nachname)
      AND public.support_norm_text(p.vorname) <> ''
      AND p.geburtsdatum = p_geburtsdatum
      AND (public.support_norm_phone(p.telefon) = '' OR public.support_norm_phone(p.telefon) = public.support_norm_phone(p_telefon));
  END IF;
  IF NOT v_ok THEN
    INSERT INTO public.support_identity_attempts (agent_id, ziel_user_id, erfolg, art) VALUES (v_agent, CASE WHEN p.id <> v_agent THEN p.id END, false, 'identitaet');
    IF p.id IS NOT NULL AND p.id <> v_agent THEN
      PERFORM public.support_notify(p.id, 'support_identity_failed', 'Identitätsprüfung fehlgeschlagen',
        'Der Azuvera-Support hat versucht, deine Identität zu prüfen. Die Angaben stimmten nicht. Warst du das nicht, melde dich bitte bei info@azuvera.de.');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', v_generic);
  END IF;
  INSERT INTO public.support_identity_attempts (agent_id, ziel_user_id, erfolg, art) VALUES (v_agent, p.id, true, 'identitaet');
  PERFORM public.support_end_other_sessions(v_agent);
  INSERT INTO public.support_sessions (ziel_user_id, agent_id, methode, scopes, schreiben_erlaubt, grund, laeuft_ab_am)
  VALUES (p.id, v_agent, 'identitaet', array_remove(public.support_all_scopes(), 'email_aendern'), true, left(btrim(p_grund), 500), now() + interval '30 minutes')
  RETURNING id INTO v_sid;
  PERFORM public.support_log(v_sid, p.id, 'sitzung_start', 'support_sessions', v_sid);
  PERFORM public.support_notify(p.id, 'support_session_started', 'Der Support hat deine Identität geprüft',
    'Der Azuvera-Support hat deine Identität bestätigt und kann 30 Minuten lang auf dein Konto zugreifen.');
  RETURN jsonb_build_object('ok', true, 'session_id', v_sid);
END $$;

-- ============ Datenansicht (Lesen wird protokolliert) ============
CREATE OR REPLACE FUNCTION public.support_person_view(p_ziel uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.support_sessions; v jsonb;
BEGIN
  s := public.support_session_for(p_ziel);
  IF s.id IS NULL THEN RAISE EXCEPTION 'Keine aktive Support-Sitzung für diese Person.'; END IF;
  SELECT jsonb_build_object(
    'ref', (SELECT ref FROM public.support_refs WHERE user_id = p_ziel),
    'role', (SELECT role FROM public.user_roles WHERE user_id = p_ziel),
    'profile', (SELECT jsonb_build_object('vorname', p.vorname, 'nachname', p.nachname, 'email', p.email, 'telefon', p.telefon,
        'geburtsdatum', p.geburtsdatum, 'personalnummer', p.personalnummer, 'strasse', p.strasse, 'plz', p.plz, 'ort', p.ort, 'land', p.land,
        'notfallkontakt_name', p.notfallkontakt_name, 'notfallkontakt_telefon', p.notfallkontakt_telefon, 'organization', p.organization,
        'created_at', p.created_at) FROM public.profiles p WHERE p.id = p_ziel),
    'training', (SELECT jsonb_build_object('profession_id', p.profession_id, 'profession_name', pr.name, 'company_id', p.company_id,
        'company_name', c.name, 'ausbildungsbeginn', p.ausbildungsbeginn, 'ausbildungsende', p.ausbildungsende, 'bundesland', p.bundesland,
        'plan_title', (SELECT tp.title FROM public.azubi_plans ap JOIN public.training_plans tp ON tp.id = ap.plan_id WHERE ap.azubi_id = p_ziel))
      FROM public.profiles p LEFT JOIN public.professions pr ON pr.id = p.profession_id LEFT JOIN public.companies c ON c.id = p.company_id
      WHERE p.id = p_ziel),
    'reports', coalesce((SELECT jsonb_agg(q.x ORDER BY q.d DESC) FROM (
        SELECT r.report_date AS d, jsonb_build_object('id', r.id, 'report_type', r.report_type, 'report_date', r.report_date,
          'week_number', r.week_number, 'year', r.year, 'status', r.status, 'version', r.version, 'activities', r.activities,
          'school_content', r.school_content, 'instructions', r.instructions, 'summary', r.summary, 'updated_at', r.updated_at) AS x
        FROM public.reports r WHERE r.azubi_id = p_ziel ORDER BY r.report_date DESC LIMIT 300) q), '[]'::jsonb),
    'experience', coalesce((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'status', e.status, 'written_on', e.written_on) ORDER BY e.written_on DESC)
        FROM public.experience_reports e WHERE e.azubi_id = p_ziel), '[]'::jsonb),
    'leittexte', coalesce((SELECT jsonb_agg(jsonb_build_object('id', w.id, 'title', l.title, 'status', w.status, 'updated_at', w.updated_at) ORDER BY w.updated_at DESC)
        FROM public.leittext_works w JOIN public.leittexts l ON l.id = w.leittext_id WHERE w.azubi_id = p_ziel), '[]'::jsonb),
    'attachments', coalesce((SELECT jsonb_agg(a.x ORDER BY a.c DESC) FROM (
        SELECT ra.created_at AS c, jsonb_build_object('kind', 'report', 'id', ra.id, 'parent_id', ra.report_id, 'file_name', ra.file_name,
          'mime_type', ra.mime_type, 'size_bytes', ra.size_bytes, 'parent_status', r.status, 'created_at', ra.created_at) AS x
        FROM public.report_attachments ra JOIN public.reports r ON r.id = ra.report_id WHERE ra.azubi_id = p_ziel
        UNION ALL
        SELECT ea.created_at, jsonb_build_object('kind', 'experience', 'id', ea.id, 'parent_id', ea.experience_id, 'file_name', ea.file_name,
          'mime_type', ea.mime_type, 'size_bytes', ea.size_bytes, 'parent_status', e.status, 'created_at', ea.created_at)
        FROM public.experience_attachments ea JOIN public.experience_reports e ON e.id = ea.experience_id WHERE ea.azubi_id = p_ziel
        UNION ALL
        SELECT la.created_at, jsonb_build_object('kind', 'leittext', 'id', la.id, 'parent_id', la.work_id, 'file_name', la.file_name,
          'mime_type', la.mime_type, 'size_bytes', la.size_bytes, 'parent_status', w.status, 'created_at', la.created_at)
        FROM public.leittext_attachments la JOIN public.leittext_works w ON w.id = la.work_id WHERE la.azubi_id = p_ziel) a), '[]'::jsonb),
    'grants', coalesce((SELECT jsonb_agg(jsonb_build_object('id', g.id, 'role', g.role,
          'direction', CASE WHEN g.azubi_id = p_ziel THEN 'erteilt' ELSE 'erhalten' END,
          'other_ref', (SELECT ref FROM public.support_refs WHERE user_id = CASE WHEN g.azubi_id = p_ziel THEN g.grantee_id ELSE g.azubi_id END),
          'created_at', g.created_at, 'valid_until', g.valid_until, 'revoked_at', g.revoked_at) ORDER BY g.created_at DESC)
        FROM public.access_grants g WHERE g.azubi_id = p_ziel OR g.grantee_id = p_ziel), '[]'::jsonb),
    'counts', jsonb_build_object(
      'absences', (SELECT count(*) FROM public.absences WHERE azubi_id = p_ziel),
      'grades', (SELECT count(*) FROM public.school_grades WHERE azubi_id = p_ziel),
      'instructions', (SELECT count(*) FROM public.instruction_records WHERE azubi_id = p_ziel)),
    'professions', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY name) FROM public.professions), '[]'::jsonb),
    'companies', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY name) FROM (SELECT id, name FROM public.companies ORDER BY name LIMIT 1000) c), '[]'::jsonb),
    'bundeslaender', coalesce((SELECT jsonb_agg(jsonb_build_object('code', code, 'name', name) ORDER BY sort_order) FROM public.bundeslaender), '[]'::jsonb)
  ) INTO v;
  PERFORM public.support_log(s.id, p_ziel, 'lesen', 'uebersicht', NULL);
  RETURN v;
END $$;

-- ============ Änderungen (nur mit Freigabe, immer protokolliert) ============
CREATE OR REPLACE FUNCTION public.support_require(_ziel uuid, _scope text) RETURNS public.support_sessions
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.support_sessions;
BEGIN
  s := public.support_session_for(_ziel);
  IF s.id IS NULL THEN RAISE EXCEPTION 'Keine aktive Support-Sitzung für diese Person.'; END IF;
  IF NOT public.support_can_write(_ziel, _scope) THEN RAISE EXCEPTION 'Dafür hat die Person keine Freigabe erteilt. Neues Ticket nötig.'; END IF;
  RETURN s;
END $$;
REVOKE ALL ON FUNCTION public.support_require(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.support_update_profile(p_ziel uuid, p_fields jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.support_sessions; o jsonb; n jsonb; v_keys text[]; v_changed text[];
  allowed constant text[] := ARRAY['vorname','nachname','telefon','geburtsdatum','personalnummer','strasse','plz','ort','land','notfallkontakt_name','notfallkontakt_telefon','organization'];
BEGIN
  s := public.support_require(p_ziel, 'profil_bearbeiten');
  v_keys := ARRAY(SELECT jsonb_object_keys(coalesce(p_fields, '{}'::jsonb)));
  IF NOT (v_keys <@ allowed) THEN RAISE EXCEPTION 'Dieses Feld lässt sich hier nicht ändern.'; END IF;
  IF p_fields ? 'vorname' AND char_length(btrim(coalesce(p_fields->>'vorname', ''))) = 0 THEN RAISE EXCEPTION 'Der Vorname darf nicht leer sein.'; END IF;
  IF p_fields ? 'nachname' AND char_length(btrim(coalesce(p_fields->>'nachname', ''))) = 0 THEN RAISE EXCEPTION 'Der Nachname darf nicht leer sein.'; END IF;
  SELECT to_jsonb(p) INTO o FROM public.profiles p WHERE p.id = p_ziel FOR UPDATE;
  UPDATE public.profiles SET
    vorname = CASE WHEN p_fields ? 'vorname' THEN left(btrim(p_fields->>'vorname'), 100) ELSE vorname END,
    nachname = CASE WHEN p_fields ? 'nachname' THEN left(btrim(p_fields->>'nachname'), 100) ELSE nachname END,
    telefon = CASE WHEN p_fields ? 'telefon' THEN nullif(left(btrim(coalesce(p_fields->>'telefon', '')), 40), '') ELSE telefon END,
    geburtsdatum = CASE WHEN p_fields ? 'geburtsdatum' THEN nullif(btrim(coalesce(p_fields->>'geburtsdatum', '')), '')::date ELSE geburtsdatum END,
    personalnummer = CASE WHEN p_fields ? 'personalnummer' THEN nullif(left(btrim(coalesce(p_fields->>'personalnummer', '')), 40), '') ELSE personalnummer END,
    strasse = CASE WHEN p_fields ? 'strasse' THEN nullif(left(btrim(coalesce(p_fields->>'strasse', '')), 200), '') ELSE strasse END,
    plz = CASE WHEN p_fields ? 'plz' THEN nullif(left(btrim(coalesce(p_fields->>'plz', '')), 10), '') ELSE plz END,
    ort = CASE WHEN p_fields ? 'ort' THEN nullif(left(btrim(coalesce(p_fields->>'ort', '')), 100), '') ELSE ort END,
    land = CASE WHEN p_fields ? 'land' THEN coalesce(nullif(left(btrim(coalesce(p_fields->>'land', '')), 60), ''), land) ELSE land END,
    notfallkontakt_name = CASE WHEN p_fields ? 'notfallkontakt_name' THEN nullif(left(btrim(coalesce(p_fields->>'notfallkontakt_name', '')), 120), '') ELSE notfallkontakt_name END,
    notfallkontakt_telefon = CASE WHEN p_fields ? 'notfallkontakt_telefon' THEN nullif(left(btrim(coalesce(p_fields->>'notfallkontakt_telefon', '')), 40), '') ELSE notfallkontakt_telefon END,
    organization = CASE WHEN p_fields ? 'organization' THEN nullif(left(btrim(coalesce(p_fields->>'organization', '')), 120), '') ELSE organization END
  WHERE id = p_ziel;
  SELECT to_jsonb(p) INTO n FROM public.profiles p WHERE p.id = p_ziel;
  v_changed := ARRAY(SELECT k FROM unnest(v_keys) k WHERE o->k IS DISTINCT FROM n->k);
  PERFORM public.support_log(s.id, p_ziel, 'aendern', 'profiles', p_ziel, v_changed);
END $$;

CREATE OR REPLACE FUNCTION public.support_update_training(p_ziel uuid, p_fields jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.support_sessions; o jsonb; n jsonb; v_keys text[]; v_changed text[];
  allowed constant text[] := ARRAY['profession_id','company_id','ausbildungsbeginn','ausbildungsende','bundesland'];
BEGIN
  s := public.support_require(p_ziel, 'ausbildung_bearbeiten');
  v_keys := ARRAY(SELECT jsonb_object_keys(coalesce(p_fields, '{}'::jsonb)));
  IF NOT (v_keys <@ allowed) THEN RAISE EXCEPTION 'Dieses Feld lässt sich hier nicht ändern.'; END IF;
  IF nullif(p_fields->>'profession_id', '') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.professions WHERE id = (p_fields->>'profession_id')::uuid) THEN
    RAISE EXCEPTION 'Diesen Ausbildungsberuf gibt es nicht.'; END IF;
  IF nullif(p_fields->>'company_id', '') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.companies WHERE id = (p_fields->>'company_id')::uuid) THEN
    RAISE EXCEPTION 'Diesen Betrieb gibt es nicht.'; END IF;
  SELECT to_jsonb(p) INTO o FROM public.profiles p WHERE p.id = p_ziel FOR UPDATE;
  PERFORM set_config('app.allow_protected_profile_write', 'on', true);
  UPDATE public.profiles SET
    profession_id = CASE WHEN p_fields ? 'profession_id' THEN nullif(p_fields->>'profession_id', '')::uuid ELSE profession_id END,
    company_id = CASE WHEN p_fields ? 'company_id' THEN nullif(p_fields->>'company_id', '')::uuid ELSE company_id END,
    ausbildungsbeginn = CASE WHEN p_fields ? 'ausbildungsbeginn' THEN nullif(p_fields->>'ausbildungsbeginn', '')::date ELSE ausbildungsbeginn END,
    ausbildungsende = CASE WHEN p_fields ? 'ausbildungsende' THEN nullif(p_fields->>'ausbildungsende', '')::date ELSE ausbildungsende END,
    bundesland = CASE WHEN p_fields ? 'bundesland' THEN nullif(p_fields->>'bundesland', '') ELSE bundesland END
  WHERE id = p_ziel;
  PERFORM set_config('app.allow_protected_profile_write', 'off', true);
  SELECT to_jsonb(p) INTO n FROM public.profiles p WHERE p.id = p_ziel;
  IF o->'profession_id' IS DISTINCT FROM n->'profession_id' THEN
    DELETE FROM public.azubi_plans WHERE azubi_id = p_ziel;
  END IF;
  v_changed := ARRAY(SELECT k FROM unnest(v_keys) k WHERE o->k IS DISTINCT FROM n->k);
  PERFORM public.support_log(s.id, p_ziel, 'aendern', 'profiles', p_ziel, v_changed);
END $$;

CREATE OR REPLACE FUNCTION public.support_update_report(p_ziel uuid, p_report uuid, p_fields jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.support_sessions; r public.reports; o jsonb; n jsonb; v_keys text[]; v_changed text[];
  allowed constant text[] := ARRAY['activities','school_content','instructions','summary'];
BEGIN
  s := public.support_require(p_ziel, 'berichte_bearbeiten');
  v_keys := ARRAY(SELECT jsonb_object_keys(coalesce(p_fields, '{}'::jsonb)));
  IF NOT (v_keys <@ allowed) THEN RAISE EXCEPTION 'Dieses Feld lässt sich hier nicht ändern.'; END IF;
  SELECT * INTO r FROM public.reports WHERE id = p_report AND azubi_id = p_ziel FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Bericht nicht gefunden.'; END IF;
  IF r.status NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'Nur Entwürfe und zurückgewiesene Berichte lassen sich ändern.'; END IF;
  o := to_jsonb(r);
  PERFORM set_config('app.bypass_guard', 'on', true);
  UPDATE public.reports SET
    activities = CASE WHEN p_fields ? 'activities' THEN p_fields->>'activities' ELSE activities END,
    school_content = CASE WHEN p_fields ? 'school_content' THEN p_fields->>'school_content' ELSE school_content END,
    instructions = CASE WHEN p_fields ? 'instructions' THEN p_fields->>'instructions' ELSE instructions END,
    summary = CASE WHEN p_fields ? 'summary' THEN p_fields->>'summary' ELSE summary END,
    version = version + 1, updated_at = now()
  WHERE id = p_report;
  PERFORM set_config('app.bypass_guard', 'off', true);
  SELECT to_jsonb(x) INTO n FROM public.reports x WHERE x.id = p_report;
  v_changed := ARRAY(SELECT k FROM unnest(v_keys) k WHERE o->k IS DISTINCT FROM n->k);
  PERFORM public.support_log(s.id, p_ziel, 'aendern', 'reports', p_report, v_changed);
END $$;

CREATE OR REPLACE FUNCTION public.support_delete_report(p_ziel uuid, p_report uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.support_sessions; r public.reports; v_paths jsonb;
BEGIN
  s := public.support_require(p_ziel, 'berichte_loeschen');
  SELECT * INTO r FROM public.reports WHERE id = p_report AND azubi_id = p_ziel FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Bericht nicht gefunden.'; END IF;
  IF r.status NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'Nur Entwürfe und zurückgewiesene Berichte lassen sich löschen.'; END IF;
  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_paths FROM (
    SELECT storage_path AS x FROM public.report_attachments WHERE report_id = p_report
    UNION ALL SELECT thumb_path FROM public.report_attachments WHERE report_id = p_report AND thumb_path IS NOT NULL) q;
  DELETE FROM public.reports WHERE id = p_report;
  PERFORM public.support_log(s.id, p_ziel, 'loeschen', 'reports', p_report);
  RETURN jsonb_build_object('bucket', 'report-files', 'paths', v_paths);
END $$;

CREATE OR REPLACE FUNCTION public.support_delete_attachment(p_ziel uuid, p_kind text, p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.support_sessions; v_path text; v_thumb text; v_status public.report_status; v_bucket text; v_table text;
BEGIN
  s := public.support_require(p_ziel, 'anhaenge_verwalten');
  IF p_kind = 'report' THEN
    SELECT a.storage_path, a.thumb_path, r.status INTO v_path, v_thumb, v_status FROM public.report_attachments a JOIN public.reports r ON r.id = a.report_id WHERE a.id = p_id AND a.azubi_id = p_ziel;
    v_bucket := 'report-files'; v_table := 'report_attachments';
  ELSIF p_kind = 'experience' THEN
    SELECT a.storage_path, a.thumb_path, e.status INTO v_path, v_thumb, v_status FROM public.experience_attachments a JOIN public.experience_reports e ON e.id = a.experience_id WHERE a.id = p_id AND a.azubi_id = p_ziel;
    v_bucket := 'experience-files'; v_table := 'experience_attachments';
  ELSIF p_kind = 'leittext' THEN
    SELECT a.storage_path, a.thumb_path, w.status INTO v_path, v_thumb, v_status FROM public.leittext_attachments a JOIN public.leittext_works w ON w.id = a.work_id WHERE a.id = p_id AND a.azubi_id = p_ziel;
    v_bucket := 'leittext-files'; v_table := 'leittext_attachments';
  ELSE RAISE EXCEPTION 'Unbekannte Art.'; END IF;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Anhang nicht gefunden.'; END IF;
  IF v_status NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'Anhänge eingereichter oder freigegebener Einträge lassen sich nicht löschen.'; END IF;
  EXECUTE format('DELETE FROM public.%I WHERE id = $1', v_table) USING p_id;
  PERFORM public.support_log(s.id, p_ziel, 'loeschen', v_table, p_id);
  RETURN jsonb_build_object('bucket', v_bucket, 'paths', to_jsonb(array_remove(ARRAY[v_path, v_thumb], NULL)));
END $$;

CREATE OR REPLACE FUNCTION public.support_revoke_access(p_ziel uuid, p_grant uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.support_sessions; g public.access_grants; v_other uuid;
BEGIN
  s := public.support_require(p_ziel, 'team_verwalten');
  SELECT * INTO g FROM public.access_grants WHERE id = p_grant AND (azubi_id = p_ziel OR grantee_id = p_ziel) AND revoked_at IS NULL FOR UPDATE;
  IF g.id IS NULL THEN RAISE EXCEPTION 'Zugriff nicht gefunden oder schon beendet.'; END IF;
  UPDATE public.access_grants SET revoked_at = now(), revoked_by = auth.uid() WHERE id = p_grant;
  v_other := CASE WHEN g.azubi_id = p_ziel THEN g.grantee_id ELSE g.azubi_id END;
  INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  VALUES (v_other, 'access_ended', 'Zugriff beendet', 'Ein Zugriff auf ein Berichtsheft wurde auf Wunsch der betroffenen Person vom Azuvera-Support beendet.', '/zugriff', 'access', p_grant);
  PERFORM public.support_log(s.id, p_ziel, 'aendern', 'access_grants', p_grant, ARRAY['revoked_at']);
END $$;

-- Vorbereitung für Aktionen, die der Server über die Anmeldung ausführt (Passwort-Mail, E-Mail-Änderung)
CREATE OR REPLACE FUNCTION public.support_begin_action(p_ziel uuid, p_action text, p_new_email text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.support_sessions; v_email text; v_new text := lower(btrim(coalesce(p_new_email, '')));
BEGIN
  IF p_action = 'password_reset' THEN
    s := public.support_session_for(p_ziel);
    IF s.id IS NULL THEN RAISE EXCEPTION 'Keine aktive Support-Sitzung für diese Person.'; END IF;
  ELSIF p_action = 'email_change' THEN
    s := public.support_require(p_ziel, 'email_aendern');
    IF v_new !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(v_new) > 320 THEN RAISE EXCEPTION 'Bitte gib eine gültige E-Mail-Adresse an.'; END IF;
    IF EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = v_new) THEN RAISE EXCEPTION 'Diese E-Mail-Adresse wird schon verwendet.'; END IF;
  ELSE
    RAISE EXCEPTION 'Diese Aktion ist für den Support gesperrt.';
  END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = p_ziel;
  IF coalesce(v_email, '') = '' OR lower(v_email) LIKE '%@azuvera.invalid' THEN RAISE EXCEPTION 'Für dieses Konto ist keine E-Mail-Adresse hinterlegt.'; END IF;
  PERFORM public.support_log(s.id, p_ziel, 'aendern', 'auth',  p_ziel,
    CASE WHEN p_action = 'password_reset' THEN ARRAY['passwort_reset_mail'] ELSE ARRAY['email'] END);
  RETURN jsonb_build_object('email', v_email, 'new_email', nullif(v_new, ''));
END $$;

-- ============ Admin: Support-Konten ============
CREATE OR REPLACE FUNCTION public.support_admin_ok() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND NOT public.is_support_agent(auth.uid())
    AND (public.is_team_owner(auth.uid()) OR public.is_leitung(auth.uid()))
$$;

CREATE OR REPLACE FUNCTION public.admin_list_support_agents()
RETURNS TABLE(user_id uuid, full_name text, email text, previous_role public.app_role, added_at timestamptz, has_mfa boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_team(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  RETURN QUERY SELECT ur.user_id, p.full_name, p.email, coalesce(a.previous_role, 'azubi'::public.app_role), coalesce(a.added_at, ur.created_at),
    EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = ur.user_id AND f.status = 'verified')
  FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id LEFT JOIN public.support_agents a ON a.user_id = ur.user_id
  WHERE ur.role = 'it_technik' ORDER BY p.full_name;
END $$;

CREATE OR REPLACE FUNCTION public.admin_add_support_agent(p_email text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid; v_old public.app_role;
BEGIN
  IF NOT public.support_admin_ok() THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  SELECT u.id INTO v_user FROM auth.users u
   WHERE lower(u.email) = lower(btrim(coalesce(p_email, ''))) AND (u.email_confirmed_at IS NOT NULL OR u.confirmed_at IS NOT NULL)
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id) LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Zu dieser E-Mail-Adresse gibt es kein bestätigtes Konto.'; END IF;
  IF v_user = auth.uid() THEN RAISE EXCEPTION 'Das eigene Konto lässt sich hier nicht umstellen.'; END IF;
  IF EXISTS (SELECT 1 FROM public.team_members WHERE user_id = v_user) THEN RAISE EXCEPTION 'Team-Mitglieder erst aus dem Team entfernen.'; END IF;
  SELECT role INTO v_old FROM public.user_roles WHERE user_id = v_user FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Konto nicht gefunden.'; END IF;
  IF v_old = 'it_technik' THEN RAISE EXCEPTION 'Diese Person ist schon ein Support-Konto.'; END IF;
  IF v_old = 'ausbildungsleitung' THEN RAISE EXCEPTION 'Die Ausbildungsleitung kann kein Support-Konto werden.'; END IF;
  UPDATE public.access_grants SET revoked_at = now(), revoked_by = auth.uid() WHERE grantee_id = v_user AND revoked_at IS NULL;
  UPDATE public.deputies SET revoked_at = now() WHERE (principal_id = v_user OR deputy_id = v_user) AND revoked_at IS NULL;
  INSERT INTO public.support_agents (user_id, previous_role, added_by) VALUES (v_user, v_old, auth.uid())
    ON CONFLICT (user_id) DO UPDATE SET previous_role = EXCLUDED.previous_role, added_by = EXCLUDED.added_by, added_at = now();
  UPDATE public.user_roles SET role = 'it_technik' WHERE user_id = v_user;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_user, 'team_added', 'Du bist jetzt IT/Technik', 'Richte unter Support die Zwei-Faktor-Anmeldung ein, bevor du Anfragen bearbeitest.', '/support');
  PERFORM public.write_audit('role', v_user, 'role_change', NULL, jsonb_build_object('user_id', v_user, 'from', v_old, 'to', 'it_technik'));
END $$;

CREATE OR REPLACE FUNCTION public.admin_remove_support_agent(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev public.app_role; s record;
BEGIN
  IF NOT public.support_admin_ok() THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF NOT public.is_support_agent(p_user) THEN RAISE EXCEPTION 'Diese Person ist kein Support-Konto.'; END IF;
  SELECT previous_role INTO v_prev FROM public.support_agents WHERE user_id = p_user;
  v_prev := coalesce(v_prev, 'ausbilder');
  FOR s IN UPDATE public.support_sessions SET beendet_am = now() WHERE agent_id = p_user AND beendet_am IS NULL RETURNING * LOOP
    INSERT INTO public.support_audit_log (session_id, agent_id, ziel_user_id, aktion, tabelle) VALUES (s.id, s.agent_id, s.ziel_user_id, 'sitzung_ende', 'support_sessions');
  END LOOP;
  UPDATE public.user_roles SET role = v_prev WHERE user_id = p_user;
  DELETE FROM public.support_agents WHERE user_id = p_user;
  PERFORM public.write_audit('role', p_user, 'role_change', NULL, jsonb_build_object('user_id', p_user, 'from', 'it_technik', 'to', v_prev));
END $$;

-- Rollen-Änderung und Team: IT/Technik nur über „Support-Konten“
CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user uuid, p_role app_role)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_old public.app_role;
BEGIN
  IF NOT public.is_team(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  IF p_role = 'azubi' THEN RAISE EXCEPTION 'Diese Rolle lässt sich nicht vergeben.'; END IF;
  IF p_role = 'it_technik' THEN RAISE EXCEPTION 'IT/Technik wird unter „Support-Konten“ vergeben.'; END IF;
  IF p_role = 'ausbildungsleitung' AND NOT public.is_leitung(auth.uid()) THEN RAISE EXCEPTION 'Diese Rolle lässt sich nicht vergeben.'; END IF;
  IF p_user = auth.uid() THEN RAISE EXCEPTION 'Die eigene Rolle lässt sich hier nicht ändern.'; END IF;
  SELECT role INTO v_old FROM public.user_roles WHERE user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Konto nicht gefunden.'; END IF;
  IF v_old = 'azubi' THEN RAISE EXCEPTION 'Die Rolle einer Auszubildenden Person lässt sich nicht ändern.'; END IF;
  IF v_old = 'it_technik' THEN RAISE EXCEPTION 'Support-Konten werden unter „Support-Konten“ verwaltet.'; END IF;
  IF v_old = p_role THEN RETURN; END IF;
  UPDATE public.access_grants SET revoked_at = now(), revoked_by = auth.uid() WHERE grantee_id = p_user AND revoked_at IS NULL;
  UPDATE public.deputies SET revoked_at = now() WHERE (principal_id = p_user OR deputy_id = p_user) AND revoked_at IS NULL AND date_to >= (now() AT TIME ZONE 'Europe/Berlin')::date;
  UPDATE public.user_roles SET role = p_role WHERE user_id = p_user;
  PERFORM public.write_audit('role', p_user, 'role_change', NULL, jsonb_build_object('user_id', p_user, 'from', v_old, 'to', p_role));
END $function$;

CREATE OR REPLACE FUNCTION public.admin_add_team_member(p_email text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user uuid;
BEGIN
  IF NOT public.is_team_owner(auth.uid()) OR public.is_support_agent(auth.uid()) THEN RAISE EXCEPTION 'Dazu fehlt dir die Berechtigung.'; END IF;
  SELECT u.id INTO v_user FROM auth.users u
   WHERE lower(u.email) = lower(btrim(coalesce(p_email, ''))) AND (u.email_confirmed_at IS NOT NULL OR u.confirmed_at IS NOT NULL)
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id) LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Zu dieser E-Mail-Adresse gibt es kein bestätigtes Konto.'; END IF;
  IF public.is_support_agent(v_user) THEN RAISE EXCEPTION 'Support-Konten (IT/Technik) können nicht zum Team gehören.'; END IF;
  IF EXISTS (SELECT 1 FROM public.team_members WHERE user_id = v_user) THEN RAISE EXCEPTION 'Diese Person gehört schon zum Team.'; END IF;
  INSERT INTO public.team_members (user_id, is_owner, added_by) VALUES (v_user, false, auth.uid());
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_user, 'team_added', 'Du gehörst jetzt zum Azuvera-Team',
    'Du kannst Konten, Berufe, Pläne und Einstellungen verwalten. Berichte von Auszubildenden siehst du nicht.', '/admin');
  PERFORM public.write_audit('team', v_user, 'team_add', NULL, jsonb_build_object('user_id', v_user));
END $function$;

-- ============ Ausführungsrechte ============
REVOKE ALL ON FUNCTION public.support_create_ticket(text, text, text[], integer, text), public.support_my_tickets(), public.support_revoke_ticket(uuid),
  public.support_my_access_log(), public.support_my_status(), public.support_directory(), public.support_active_session(), public.support_my_sessions(),
  public.support_end_session(uuid), public.support_redeem_ticket(text), public.support_verify_identity(text, text, date, text, text, text),
  public.support_person_view(uuid), public.support_update_profile(uuid, jsonb), public.support_update_training(uuid, jsonb),
  public.support_update_report(uuid, uuid, jsonb), public.support_delete_report(uuid, uuid), public.support_delete_attachment(uuid, text, uuid),
  public.support_revoke_access(uuid, uuid), public.support_begin_action(uuid, text, text), public.support_my_ref(),
  public.admin_list_support_agents(), public.admin_add_support_agent(text), public.admin_remove_support_agent(uuid),
  public.support_can_read(uuid), public.support_can_write(uuid, text), public.support_any_session(), public.support_agent_ok(),
  public.is_support_agent(uuid), public.support_admin_ok()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_create_ticket(text, text, text[], integer, text), public.support_my_tickets(), public.support_revoke_ticket(uuid),
  public.support_my_access_log(), public.support_my_status(), public.support_directory(), public.support_active_session(), public.support_my_sessions(),
  public.support_end_session(uuid), public.support_redeem_ticket(text), public.support_verify_identity(text, text, date, text, text, text),
  public.support_person_view(uuid), public.support_update_profile(uuid, jsonb), public.support_update_training(uuid, jsonb),
  public.support_update_report(uuid, uuid, jsonb), public.support_delete_report(uuid, uuid), public.support_delete_attachment(uuid, text, uuid),
  public.support_revoke_access(uuid, uuid), public.support_begin_action(uuid, text, text), public.support_my_ref(),
  public.admin_list_support_agents(), public.admin_add_support_agent(text), public.admin_remove_support_agent(uuid),
  public.support_can_read(uuid), public.support_can_write(uuid, text), public.support_any_session(), public.support_agent_ok(),
  public.is_support_agent(uuid), public.support_admin_ok()
  TO authenticated, service_role;
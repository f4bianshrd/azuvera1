CREATE TABLE IF NOT EXISTS public.bundeslaender (
  code text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  sort_order int NOT NULL
);
GRANT SELECT ON public.bundeslaender TO authenticated;
GRANT ALL ON public.bundeslaender TO service_role;
ALTER TABLE public.bundeslaender ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bundeslaender_select ON public.bundeslaender;
CREATE POLICY bundeslaender_select ON public.bundeslaender FOR SELECT TO authenticated USING (true);
INSERT INTO public.bundeslaender (code, name, sort_order) VALUES
 ('BW','Baden-Württemberg',1),('BY','Bayern',2),('BE','Berlin',3),('BB','Brandenburg',4),('HB','Bremen',5),('HH','Hamburg',6),
 ('HE','Hessen',7),('MV','Mecklenburg-Vorpommern',8),('NI','Niedersachsen',9),('NW','Nordrhein-Westfalen',10),('RP','Rheinland-Pfalz',11),
 ('SL','Saarland',12),('SN','Sachsen',13),('ST','Sachsen-Anhalt',14),('SH','Schleswig-Holstein',15),('TH','Thüringen',16)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS bundesland text REFERENCES public.bundeslaender(code);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bundesland text REFERENCES public.bundeslaender(code);

CREATE OR REPLACE FUNCTION public.effective_bundesland(p_azubi uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(c.bundesland, p.bundesland)
  FROM public.profiles p LEFT JOIN public.companies c ON c.id = p.company_id
  WHERE p.id = p_azubi
$$;
REVOKE ALL ON FUNCTION public.effective_bundesland(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.effective_bundesland(uuid) TO service_role;

CREATE TABLE IF NOT EXISTS public.experience_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  bundesland text REFERENCES public.bundeslaender(code),
  profession_code text,
  required_per_year int NOT NULL DEFAULT 2 CHECK (required_per_year BETWEEN 0 AND 20),
  required_basis text NOT NULL DEFAULT 'default' CHECK (required_basis IN ('official','default')),
  hint_per_year int CHECK (hint_per_year BETWEEN 1 AND 100),
  hint_total int CHECK (hint_total BETWEEN 1 AND 100),
  hint_until_interim int CHECK (hint_until_interim BETWEEN 1 AND 100),
  hint_kind text CHECK (hint_kind IN ('official','recommended')),
  min_pages numeric(3,1) CHECK (min_pages BETWEEN 0.5 AND 10),
  page_unit text CHECK (page_unit IN ('a4','handwritten')),
  leittext_weight int NOT NULL DEFAULT 0 CHECK (leittext_weight BETWEEN 0 AND 5),
  note text CHECK (char_length(note) <= 800),
  source_title text,
  source_issuer text,
  source_url text CHECK (source_url LIKE 'https://%'),
  source_stand text,
  checked_on date,
  CONSTRAINT experience_requirements_official_source CHECK (required_basis <> 'official' OR (nullif(btrim(source_title),'') IS NOT NULL AND nullif(btrim(source_url),'') IS NOT NULL)),
  CONSTRAINT experience_requirements_hint_kind CHECK ((hint_per_year IS NULL AND hint_total IS NULL AND hint_until_interim IS NULL) OR hint_kind IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS experience_requirements_scope_uidx
  ON public.experience_requirements ((coalesce(bundesland,'*')), (coalesce(profession_code,'*')));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.experience_requirements TO authenticated;
GRANT ALL ON public.experience_requirements TO service_role;
ALTER TABLE public.experience_requirements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS experience_requirements_select ON public.experience_requirements;
CREATE POLICY experience_requirements_select ON public.experience_requirements FOR SELECT TO authenticated
  USING (is_active OR public.is_leitung(auth.uid()));
DROP POLICY IF EXISTS experience_requirements_insert ON public.experience_requirements;
CREATE POLICY experience_requirements_insert ON public.experience_requirements FOR INSERT TO authenticated
  WITH CHECK (public.is_leitung(auth.uid()));
DROP POLICY IF EXISTS experience_requirements_update ON public.experience_requirements;
CREATE POLICY experience_requirements_update ON public.experience_requirements FOR UPDATE TO authenticated
  USING (public.is_leitung(auth.uid())) WITH CHECK (public.is_leitung(auth.uid()));
DROP POLICY IF EXISTS experience_requirements_delete ON public.experience_requirements;
CREATE POLICY experience_requirements_delete ON public.experience_requirements FOR DELETE TO authenticated
  USING (public.is_leitung(auth.uid()));

DROP TRIGGER IF EXISTS experience_requirements_updated ON public.experience_requirements;
CREATE TRIGGER experience_requirements_updated BEFORE UPDATE ON public.experience_requirements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.experience_requirements_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.bundesland IS NULL AND OLD.profession_code IS NULL THEN
      RAISE EXCEPTION 'Die Standardzeile lässt sich nicht ändern.';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.bundesland IS NULL AND OLD.profession_code IS NULL THEN
    IF NEW.bundesland IS NOT NULL OR NEW.profession_code IS NOT NULL OR NOT NEW.is_active THEN
      RAISE EXCEPTION 'Die Standardzeile lässt sich nicht ändern.';
    END IF;
  END IF;
  NEW.profession_code := nullif(btrim(NEW.profession_code), '');
  IF NEW.bundesland IS NULL AND NEW.profession_code IS NULL THEN
    IF NOT NEW.is_active THEN RAISE EXCEPTION 'Die Standardzeile lässt sich nicht ändern.'; END IF;
    NEW.required_basis := 'default';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS experience_requirements_guard ON public.experience_requirements;
CREATE TRIGGER experience_requirements_guard BEFORE INSERT OR UPDATE OR DELETE ON public.experience_requirements
  FOR EACH ROW EXECUTE FUNCTION public.experience_requirements_guard();

CREATE OR REPLACE FUNCTION public.experience_requirements_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.experience_requirements%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  PERFORM public.write_audit('settings', r.id, 'experience_requirement_changed', NULL,
    jsonb_build_object('operation', lower(TG_OP), 'bundesland', r.bundesland, 'profession_code', r.profession_code, 'required_per_year', r.required_per_year));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS experience_requirements_audit ON public.experience_requirements;
CREATE TRIGGER experience_requirements_audit AFTER INSERT OR UPDATE OR DELETE ON public.experience_requirements
  FOR EACH ROW EXECUTE FUNCTION public.experience_requirements_audit();

CREATE OR REPLACE FUNCTION public.experience_requirement_for(p_bundesland text, p_profession_code text)
RETURNS public.experience_requirements
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT er.* FROM public.experience_requirements er
  WHERE er.is_active
    AND (er.bundesland IS NULL OR er.bundesland = p_bundesland)
    AND (er.profession_code IS NULL OR er.profession_code = p_profession_code)
  ORDER BY (er.bundesland IS NOT NULL) DESC, (er.profession_code IS NOT NULL) DESC
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.experience_requirement_for(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.experience_requirement_for(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.training_year_count(p_start date, p_end date) RETURNS int
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE n int := 0;
BEGIN
  IF p_end IS NULL OR p_start IS NULL THEN RETURN 3; END IF;
  LOOP
    EXIT WHEN (p_start + make_interval(years => n))::date > p_end OR n > 20;
    n := n + 1;
  END LOOP;
  RETURN greatest(n, 1);
END $$;

CREATE OR REPLACE FUNCTION public.training_year_bounds(p_start date, p_end date, n int)
RETURNS TABLE (year_start date, year_end date)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE e date := coalesce(p_end, (p_start + interval '3 years')::date - 1);
BEGIN
  year_start := (p_start + make_interval(years => n - 1))::date;
  year_end := least((p_start + make_interval(years => n))::date - 1, e);
  RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.training_year_clamped(p_start date, p_end date, p_date date) RETURNS int
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE total int; n int;
BEGIN
  IF p_start IS NULL THEN RETURN NULL; END IF;
  total := public.training_year_count(p_start, p_end);
  IF p_date < p_start THEN RETURN 1; END IF;
  FOR n IN 1..total LOOP
    IF p_date < (p_start + make_interval(years => n))::date THEN RETURN n; END IF;
  END LOOP;
  RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.training_year_count(date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_year_bounds(date, date, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_year_clamped(date, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.training_year_count(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.training_year_bounds(date, date, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.training_year_clamped(date, date, date) TO service_role;

INSERT INTO public.experience_requirements
 (bundesland, profession_code, required_per_year, required_basis, hint_per_year, hint_total, hint_until_interim, hint_kind, min_pages, page_unit, leittext_weight, note, source_title, source_issuer, source_url, source_stand, checked_on)
VALUES
 (NULL, NULL, 2, 'default', NULL, NULL, NULL, NULL, NULL, NULL, 0,
  $t$Für dein Bundesland und deinen Beruf ist in Azuvera noch keine Vorgabe der zuständigen Stelle hinterlegt. Es gilt die Standardvorgabe von Azuvera. Frage deine Ausbildungsberatung, was bei dir verlangt wird.$t$,
  NULL, NULL, NULL, NULL, DATE '2026-11-13'),
 ('NI', 'landwirt', 2, 'official', 2, NULL, NULL, 'official', 2, 'handwritten', 0,
  $t$Zusätzlich verlangt die Kammer je Lehrjahr mindestens 1 Leittext (nicht Teil dieses Moduls). Die Berichte werden in der betrieblichen Prüfung herangezogen und von der Ausbilderin oder dem Ausbilder mit Datum unterschrieben.$t$,
  $t$Erläuterungen zum Führen des Ausbildungsnachweises/Berichtsheftes für Auszubildende im Ausbildungsberuf Landwirt/Landwirtin$t$,
  $t$Landwirtschaftskammer Niedersachsen, Fachbereich 3.3$t$,
  $t$https://www.lwk-niedersachsen.de/lwk/downloadcenter/824_Landwirtin?dl=8689$t$, $t$07/2024$t$, DATE '2026-11-13'),
 ('BY', 'landwirt', 4, 'official', 4, NULL, NULL, 'official', NULL, NULL, 0,
  $t$Die Hinweise nennen je Ausbildungsjahr mindestens vier Erfahrungsberichte und zwei Leittexte im Teil II des Berichtshefts; Leittexte sind nicht Teil dieses Moduls. Für die Zulassung zur Abschlussprüfung nennt das Dokument nur den Informationsteil und Teil I.$t$,
  $t$Hinweise zur Führung und Bewertung des Berichtsheftes (Ausbildungsnachweis)$t$,
  $t$Bayerisches Staatsministerium für Ernährung, Landwirtschaft, Forsten und Tourismus$t$,
  $t$https://www.stmelf.bayern.de/mam/cms01/berufsbildung/dateien/hinweise_ausbildungsnachweis.pdf$t$, $t$06/2025$t$, DATE '2026-11-13'),
 ('SH', 'landwirt', 2, 'default', 5, NULL, NULL, 'recommended', NULL, NULL, 0,
  $t$Die Kammer empfiehlt 5 Erfahrungsberichte je Ausbildungsjahr als freiwilligen Teil. Dieser wird von der Kammer nicht kontrolliert, die Bearbeitung richtet sich nach den Vorgaben des Ausbilders.$t$,
  $t$Anleitung zur Führung des Ausbildungsnachweises (Berichtsheft) im Ausbildungsberuf Landwirt/Landwirtin in Schleswig-Holstein$t$,
  $t$Landwirtschaftskammer Schleswig-Holstein$t$,
  $t$https://www.lksh.de/fileadmin/PDFs/Bildung/Gruene_Berufe/Landwirt_Hinweise_zur_Fuehrung_von_Ausbildungsnachweisen__Berichtsheft_.pdf$t$, $t$07/2025$t$, DATE '2026-11-13'),
 ('SN', 'landwirt', 2, 'default', NULL, 15, 8, 'recommended', 1, 'a4', 1,
  $t$Die Zuständige Stelle empfiehlt 15 Erfahrungsberichte (mindestens eine A4-Seite), davon 8 bis zur Anmeldung zur Zwischenprüfung und den Rest bis zur Anmeldung zur Abschlussprüfung, dazu mindestens 1 Leittext oder Arbeitsvorhaben. Erfahrungsberichte können durch weitere Leittexte ersetzt werden.$t$,
  $t$Hinweise zur Berichtsheftführung / Führung des schriftlichen Ausbildungsnachweises für den Beruf Landwirt/in$t$,
  $t$Sächsische Zuständige Stelle für Berufsbildung, Dresden$t$,
  $t$https://gruene-berufe.sachsen.de/Merkblatt_Bhfuehrung_LW-2016_.pdf$t$, $t$05/2016$t$, DATE '2026-11-13'),
 ('BB', NULL, 2, 'default', NULL, NULL, NULL, NULL, NULL, NULL, 0,
  $t$Das Landesamt nennt Erfahrungsberichte nur als mögliche weitergehende Nachweise, die Ausbildende über die Mindestanforderung hinaus verlangen können, und nennt keine Zahl. Die Erfüllung ist keine Voraussetzung für die Zulassung zur Abschlussprüfung.$t$,
  $t$Führen von schriftlichen Ausbildungsnachweisen für alle Berufe der Land- und Hauswirtschaft$t$,
  $t$Zuständige Stelle Brandenburg (Landesamt für ländliche Entwicklung, Landwirtschaft und Flurneuordnung)$t$,
  $t$https://lelf.brandenburg.de/sixcms/media.php/9/Fuehren-von-schriftlichen-Ausbildungsnachweisen.pdf$t$, $t$01/2020$t$, DATE '2026-11-13'),
 ('NI', 'gaertner', 2, 'default', NULL, 25, NULL, 'recommended', NULL, NULL, 0,
  $t$Die Kammer empfiehlt während der Ausbildung 25 Erfahrungsberichte bzw. Projektbeschreibungen. Zulassungsvoraussetzung ist das Führen der Tagesberichte; Umfang, Fristen und Bewertung der Erfahrungsberichte sind dort nicht geregelt.$t$,
  $t$Richtlinien zur Führung des schriftlichen Ausbildungsnachweises/Berichtsheftes im Ausbildungsberuf Gärtner/Gärtnerin (alle Fachrichtungen)$t$,
  $t$Landwirtschaftskammer Niedersachsen$t$,
  $t$https://www.lwk-niedersachsen.de/lwk/downloadcenter/825_Gaertnerin?dl=11225$t$, $t$08/2025$t$, DATE '2026-11-13'),
 ('NI', 'pferdewirt', 2, 'default', NULL, NULL, NULL, NULL, NULL, NULL, 2,
  $t$In den Hinweisen der Kammer steht: „Ein Leittext zählt wie 2 Erfahrungsberichte.“ Eine Mindestzahl nennen sie nicht; Näheres steht im Merkblatt „Anforderungen an das Berichtsheft im Ausbildungsberuf Pferdewirt/Pferdewirtin“ der Kammer.$t$,
  $t$Hinweise zum Ausbildungsberuf Pferdewirt/Pferdewirtin$t$,
  $t$Landwirtschaftskammer Niedersachsen, Fachbereich 3.3$t$,
  $t$https://www.lwk-niedersachsen.de/lwk/downloadcenter/833_Pferdewirtin/?dl=10103$t$, $t$04/2025$t$, DATE '2026-11-13'),
 ('BE', 'gaertner', 2, 'default', NULL, 5, 2, 'official', 2, 'a4', 0,
  $t$Gilt laut Quelle für Gärtner/in, Fachrichtung Garten- und Landschaftsbau: 5 Erfahrungsberichte insgesamt (je 2 Seiten DIN A4), davon 2 bis zur Anmeldung zur Zwischenprüfung, als Mindestanforderung laut Beschluss des Berufsbildungsausschusses; dazu je 5 ausbildungsbegleitende Ausarbeitungen (nicht Teil dieses Moduls). Für andere Fachrichtungen frage die zuständige Stelle.$t$,
  $t$Vorgaben zum Führen des Berichtshefts im Ausbildungsberuf Gärtner/in, Fachrichtung Garten- und Landschaftsbau$t$,
  $t$SenASGIVA Berlin, zuständige Stelle für die Berufsbildung in der Landwirtschaft$t$,
  $t$https://berlin.de/sen/arbeit/ausbildung/berufsbildung-landwirtschaft/vorgaben-zur-berichtsheftfuehrung_galabau.pdf$t$, $t$05/2024$t$, DATE '2026-11-13'),
 ('SN', 'gaertner', 2, 'default', NULL, 25, 13, 'recommended', 1, 'a4', 1,
  $t$Gilt laut Quelle für Gärtner/in, Fachrichtung Garten- und Landschaftsbau: 25 Erfahrungsberichte (mindestens eine A4-Seite), davon 13 bis zur Anmeldung zur Zwischenprüfung; mindestens 2 davon zu betriebsbezogenen Problemstellungen im Umweltschutz. Statt Erfahrungsberichten können auch Leittexte bearbeitet werden. Die Zuständige Stelle empfiehlt, dies im Ausbildungsvertrag als Zusatzvereinbarung festzuhalten.$t$,
  $t$Hinweise zur Führung des schriftlichen Ausbildungsnachweises (Berichtsheft) für den Beruf Gärtner/Gärtnerin der Fachrichtung Garten- und Landschaftsbau$t$,
  $t$Sächsische Zuständige Stelle für Berufsbildung, Dresden$t$,
  $t$https://gruene-berufe.sachsen.de/Merkblatt_Berichtsheft_Gaertner_GaLa-Bau_2022.pdf$t$, $t$04/2022$t$, DATE '2026-11-13'),
 ('BY', 'gaertner', 2, 'default', NULL, 20, NULL, 'recommended', NULL, NULL, 0,
  $t$Die Hinweise empfehlen mindestens 20 Erfahrungs- bzw. Projektberichte während der Ausbildung und 50 Pflanzenbeschreibungen und gelten für alle Fachrichtungen. Als Zulassungsvoraussetzung nennt das Dokument den vollständig geführten Teil 2a (Ausbildungsnachweis), die Erfahrungsberichte dort nicht.$t$,
  $t$Hinweise zur Führung des Berichtsheftes Gärtnerin/Gärtner$t$,
  $t$Bayerisches Staatsministerium für Ernährung, Landwirtschaft und Forsten$t$,
  $t$https://www.ale-oberpfalz.bayern.de/mam/cms01/berufsbildung/dateien/hinweise_berichtsheft.pdf$t$, $t$09/2022$t$, DATE '2026-11-13'),
 ('NW', 'gaertner', 2, 'default', NULL, 25, NULL, 'recommended', NULL, NULL, 0,
  $t$Das Merkblatt zum Ausbildungsnachweis im Garten- und Landschaftsbau (ohne Datumsangabe) sagt: „Die Herausgeber des Berichtsheftes empfehlen 25 Erfahrungsberichte oder Projektbeschreibungen.“ Ohne Zusatzvereinbarung sind nur der Ausbildungsplan und der Ausbildungsnachweis verbindlich zu führen.$t$,
  $t$Merkblatt Ausbildungsnachweis Garten- und Landschaftsbau$t$,
  $t$Landwirtschaftskammer Nordrhein-Westfalen (laut Internetadresse landwirtschaftskammer.de)$t$,
  $t$https://www.landwirtschaftskammer.de/bildung/pdf/gb-mb-ausbildungsnachweis-galabau.pdf$t$, NULL, DATE '2026-11-13')
ON CONFLICT ((coalesce(bundesland,'*')), (coalesce(profession_code,'*'))) DO UPDATE SET
  required_per_year = EXCLUDED.required_per_year, required_basis = EXCLUDED.required_basis,
  hint_per_year = EXCLUDED.hint_per_year, hint_total = EXCLUDED.hint_total, hint_until_interim = EXCLUDED.hint_until_interim,
  hint_kind = EXCLUDED.hint_kind, min_pages = EXCLUDED.min_pages, page_unit = EXCLUDED.page_unit,
  leittext_weight = EXCLUDED.leittext_weight, note = EXCLUDED.note, source_title = EXCLUDED.source_title,
  source_issuer = EXCLUDED.source_issuer, source_url = EXCLUDED.source_url, source_stand = EXCLUDED.source_stand,
  checked_on = EXCLUDED.checked_on, is_active = true;
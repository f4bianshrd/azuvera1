-- Daten-Prompt A3: Gärtner/in, sieben Fachrichtungen (GärtnAusbV § 4)

CREATE FUNCTION public._seed_plan_lines(p_plan uuid, p_data text, p_section_sort int)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE
  v_line text; v_parts text[]; v_section uuid; v_group uuid; v_group_key text;
  v_s int := p_section_sort - 1; v_g int := 0; v_i int := 0;
BEGIN
  FOREACH v_line IN ARRAY string_to_array(p_data, E'\n') LOOP
    CONTINUE WHEN v_line = '';
    IF left(v_line, 10) = 'ABSCHNITT ' THEN
      v_parts := string_to_array(substr(v_line, 11), ' | ');
      IF array_length(v_parts, 1) <> 2 THEN RAISE EXCEPTION 'Abschnitt fehlerhaft: %', v_line; END IF;
      v_s := v_s + 1; v_g := 0;
      INSERT INTO plan_sections (plan_id, key, title, kind, hint, sort_order)
      VALUES (p_plan, v_parts[1], v_parts[2], 'content', NULL, v_s)
      ON CONFLICT (plan_id, key) DO UPDATE SET title = EXCLUDED.title, kind = EXCLUDED.kind,
        hint = EXCLUDED.hint, sort_order = EXCLUDED.sort_order
      RETURNING id INTO v_section;
    ELSIF left(v_line, 7) = 'GRUPPE ' THEN
      v_parts := string_to_array(substr(v_line, 8), ' | ');
      IF array_length(v_parts, 1) NOT BETWEEN 3 AND 5 THEN RAISE EXCEPTION 'Gruppe fehlerhaft: %', v_line; END IF;
      v_g := v_g + 1; v_i := 0; v_group_key := v_parts[1];
      INSERT INTO plan_groups (section_id, key, title, reference, weeks_text, hint, sort_order)
      VALUES (v_section, v_parts[1], v_parts[2], v_parts[3], v_parts[4], v_parts[5], v_g)
      ON CONFLICT (section_id, key) DO UPDATE SET title = EXCLUDED.title, reference = EXCLUDED.reference,
        weeks_text = EXCLUDED.weeks_text, hint = EXCLUDED.hint, sort_order = EXCLUDED.sort_order
      RETURNING id INTO v_group;
    ELSIF left(v_line, 2) = '  ' THEN
      v_parts := string_to_array(substr(v_line, 3), ' | ');
      IF array_length(v_parts, 1) <> 2 THEN RAISE EXCEPTION 'Punkt fehlerhaft: %', v_line; END IF;
      v_i := v_i + 1;
      INSERT INTO plan_items (group_id, plan_id, key, label, reference, is_active, sort_order)
      VALUES (v_group, p_plan, v_group_key || '.' || v_parts[1], v_parts[2],
              CASE WHEN v_parts[1] ~ '^[A-Za-z]+$' THEN v_parts[1] || ')' ELSE v_parts[1] END, true, v_i)
      ON CONFLICT (plan_id, key) DO UPDATE SET group_id = EXCLUDED.group_id, label = EXCLUDED.label,
        reference = EXCLUDED.reference, is_active = true, sort_order = EXCLUDED.sort_order;
    ELSE
      RAISE EXCEPTION 'Unbekannte Datenzeile: %', v_line;
    END IF;
  END LOOP;
END $fn$;

CREATE FUNCTION public._upsert_plan(p_prof uuid, p_code text, p_title text, p_subtitle text, p_source text, p_valid_from date, p_sort int)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE v_plan uuid;
BEGIN
  INSERT INTO training_plans (profession_id, code, title, subtitle, source, valid_from, valid_until, duration_years, is_template, status, sort_order)
  VALUES (p_prof, p_code, p_title, p_subtitle, p_source, p_valid_from, NULL, 3, false, 'published', p_sort)
  ON CONFLICT (code) DO UPDATE SET profession_id = EXCLUDED.profession_id, title = EXCLUDED.title,
    subtitle = EXCLUDED.subtitle, source = EXCLUDED.source, valid_from = EXCLUDED.valid_from,
    valid_until = EXCLUDED.valid_until, duration_years = EXCLUDED.duration_years,
    is_template = EXCLUDED.is_template, status = EXCLUDED.status, sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_plan;
  RETURN v_plan;
END $fn$;

DO $do$
DECLARE
  v_prof uuid; v_plan uuid;
  v_subtitle text := $t$Ausbildungsberufsbild nach § 4 GärtnAusbV$t$;
  v_source text := $t$Verordnung über die Berufsausbildung zum Gärtner/zur Gärtnerin (GärtnAusbV) vom 6. März 1996 (BGBl. I S. 376), § 4 Ausbildungsberufsbild; die Ausbildungsrahmenpläne der Anlagen 1a bis 7a sind in diesem Plan nicht enthalten$t$;
  v_from date := DATE '1996-08-01';
  v_common text := $plan$ABSCHNITT gemeinsam | Berufsbildpositionen für alle Fachrichtungen
GRUPPE P1 | Der Ausbildungsbetrieb, betriebliche Zusammenhänge und Beziehungen | § 4 Absatz 1 Nummer 1
  1.1 | Berufsbildung
  1.2 | Aufbau und Organisation des Ausbildungsbetriebes
  1.3 | Mitgestalten sozialer Beziehungen
  1.4 | Arbeits- und Tarifrecht; Arbeitsschutz und Arbeitssicherheit
GRUPPE P2 | Natur- und Umweltschutz; rationelle Energie- und Materialverwendung | § 4 Absatz 1 Nummer 2
  2 | Natur- und Umweltschutz; rationelle Energie- und Materialverwendung
GRUPPE P3 | Betriebliche Abläufe und wirtschaftliche Zusammenhänge | § 4 Absatz 1 Nummer 3
  3.1 | Wahrnehmen und Beurteilen von Vorgängen; Beschaffen und Auswerten von Informationen
  3.2 | Planen, Vorbereiten und Kontrollieren von Produktion, Dienstleistungen und Arbeit
  3.3 | Erfassen und Beurteilen betriebs- und marktwirtschaftlicher Zusammenhänge
GRUPPE P4 | Böden, Erden und Substrate | § 4 Absatz 1 Nummer 4
  4 | Böden, Erden und Substrate
GRUPPE P5 | Kultur und Verwendung von Pflanzen | § 4 Absatz 1 Nummer 5
  5.1 | Pflanzen und ihre Verwendung
  5.2 | Kultur- und Pflegemaßnahmen
  5.3 | Nutzung pflanzlicher Produkte
GRUPPE P6 | Maschinen, Geräte und Betriebseinrichtungen; Materialien und Werkstoffe | § 4 Absatz 1 Nummer 6
  6 | Maschinen, Geräte und Betriebseinrichtungen; Materialien und Werkstoffe$plan$;
BEGIN
  SELECT id INTO v_prof FROM public.professions WHERE code = 'gaertner';
  IF v_prof IS NULL THEN RAISE EXCEPTION 'Beruf gaertner fehlt'; END IF;
  v_plan := public._upsert_plan(v_prof, 'gaertner-baumschule', $t$Gärtner/in – Fachrichtung Baumschule$t$, v_subtitle, v_source, v_from, 1);
  PERFORM public._seed_plan_lines(v_plan, v_common || E'\n' || $plan$ABSCHNITT fachrichtung | Fachrichtung Baumschule
GRUPPE FR | Fertigkeiten und Kenntnisse der Fachrichtung Baumschule | § 4 Absatz 2 Nummer 1
  a | Kulturräume und Kultureinrichtungen
  b | Anlage von Baumschulquartieren und Flächen für Containerkulturen
  c | Vermehrung und Jungpflanzenanzucht
  d | Produktionsverfahren
  e | Roden, Sortieren, Kennzeichnen und Lagern
  f | Verkaufen und Beraten$plan$, 1);
  v_plan := public._upsert_plan(v_prof, 'gaertner-friedhofsgaertnerei', $t$Gärtner/in – Fachrichtung Friedhofsgärtnerei$t$, v_subtitle, v_source, v_from, 2);
  PERFORM public._seed_plan_lines(v_plan, v_common || E'\n' || $plan$ABSCHNITT fachrichtung | Fachrichtung Friedhofsgärtnerei
GRUPPE FR | Fertigkeiten und Kenntnisse der Fachrichtung Friedhofsgärtnerei | § 4 Absatz 2 Nummer 2
  a | Kulturräume und Kultureinrichtungen
  b | Vermehrung und Weiterkultur
  c | Grabstätten anlegen, pflegen und erneuern
  d | Trauerbinderei und Dekoration
  e | Verkaufen und Beraten$plan$, 1);
  v_plan := public._upsert_plan(v_prof, 'gaertner-galabau', $t$Gärtner/in – Fachrichtung Garten- und Landschaftsbau$t$, v_subtitle, v_source, v_from, 3);
  PERFORM public._seed_plan_lines(v_plan, v_common || E'\n' || $plan$ABSCHNITT fachrichtung | Fachrichtung Garten- und Landschaftsbau
GRUPPE FR | Fertigkeiten und Kenntnisse der Fachrichtung Garten- und Landschaftsbau | § 4 Absatz 2 Nummer 3
  a | Vorbereiten, Einrichten und Abwickeln von Baustellen
  b | Ausführen von Erdarbeiten sowie Be- und Entwässerungsmaßnahmen
  c | Herstellen von befestigten Flächen
  d | Herstellen von Bauwerken in Außenanlagen
  e | Ausführen von vegetationstechnischen Arbeiten$plan$, 1);
  v_plan := public._upsert_plan(v_prof, 'gaertner-gemuesebau', $t$Gärtner/in – Fachrichtung Gemüsebau$t$, v_subtitle, v_source, v_from, 4);
  PERFORM public._seed_plan_lines(v_plan, v_common || E'\n' || $plan$ABSCHNITT fachrichtung | Fachrichtung Gemüsebau
GRUPPE FR | Fertigkeiten und Kenntnisse der Fachrichtung Gemüsebau | § 4 Absatz 2 Nummer 4
  a | Produktionsräume und Produktionseinrichtungen
  b | Vermehrung und Jungpflanzenanzucht
  c | Produktionsverfahren
  d | Ernten, Aufbereiten und Lagern
  e | Vermarkten$plan$, 1);
  v_plan := public._upsert_plan(v_prof, 'gaertner-obstbau', $t$Gärtner/in – Fachrichtung Obstbau$t$, v_subtitle, v_source, v_from, 5);
  PERFORM public._seed_plan_lines(v_plan, v_common || E'\n' || $plan$ABSCHNITT fachrichtung | Fachrichtung Obstbau
GRUPPE FR | Fertigkeiten und Kenntnisse der Fachrichtung Obstbau | § 4 Absatz 2 Nummer 5
  a | Anlegen von Obstpflanzungen
  b | Produktionsverfahren
  c | Ernten, Aufbereiten und Lagern
  d | Vermarkten$plan$, 1);
  v_plan := public._upsert_plan(v_prof, 'gaertner-staudengaertnerei', $t$Gärtner/in – Fachrichtung Staudengärtnerei$t$, v_subtitle, v_source, v_from, 6);
  PERFORM public._seed_plan_lines(v_plan, v_common || E'\n' || $plan$ABSCHNITT fachrichtung | Fachrichtung Staudengärtnerei
GRUPPE FR | Fertigkeiten und Kenntnisse der Fachrichtung Staudengärtnerei | § 4 Absatz 2 Nummer 6
  a | Kulturräume und Kultureinrichtungen
  b | Vermehrung und Jungpflanzenanzucht
  c | Produktionsverfahren
  d | Auswählen und Aufbereiten
  e | Verkaufen und Beraten$plan$, 1);
  v_plan := public._upsert_plan(v_prof, 'gaertner-zierpflanzenbau', $t$Gärtner/in – Fachrichtung Zierpflanzenbau$t$, v_subtitle, v_source, v_from, 7);
  PERFORM public._seed_plan_lines(v_plan, v_common || E'\n' || $plan$ABSCHNITT fachrichtung | Fachrichtung Zierpflanzenbau
GRUPPE FR | Fertigkeiten und Kenntnisse der Fachrichtung Zierpflanzenbau | § 4 Absatz 2 Nummer 7
  a | Kulturräume und Kultureinrichtungen
  b | Vermehrung und Jungpflanzenanzucht
  c | Produktionsverfahren
  d | Ernten, Aufbereiten und Lagern
  e | Verkaufen und Beraten$plan$, 1);
  UPDATE public.professions SET ai_hints = $h$Für Gartenbau: Ordne die in den Stichpunkten genannten Tätigkeiten fachlich ein. Unterscheide je nach Tätigkeit z. B. Vermehrung und Jungpflanzenanzucht, Kulturführung und Pflege, Düngung und Pflanzenschutz, Ernte, Aufbereitung und Lagerung sowie Verkauf und Beratung; im Garten- und Landschaftsbau z. B. Baustelleneinrichtung, Erdarbeiten, Be- und Entwässerung, befestigte Flächen, Bauwerke in Außenanlagen und vegetationstechnische Arbeiten; in der Friedhofsgärtnerei z. B. Grabpflege und Trauerbinderei. Verwende solche Begriffe nur, wenn sie zur beschriebenen Tätigkeit passen. Erkläre bei Bedarf kurz den fachlichen Zweck oder die Bedeutung eines Begriffs im konkreten Zusammenhang, ohne einen nicht genannten Arbeitsvorgang zu behaupten. Unterscheide Beobachtung von Maßnahme, Planung von Durchführung und Kontrolle von Ergebnis. Beziehe Arbeitsschutz sowie Natur- und Umweltschutz nur ein, wenn aus den Angaben passend ableitbar.$h$
  WHERE code = 'gaertner' AND coalesce(btrim(ai_hints), '') = '';
END $do$;

DROP FUNCTION public._upsert_plan(uuid, text, text, text, text, date, int);
DROP FUNCTION public._seed_plan_lines(uuid, text, int);
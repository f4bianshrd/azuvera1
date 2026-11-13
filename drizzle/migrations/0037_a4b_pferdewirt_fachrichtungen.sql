-- Daten-Prompt A4b: Pferdewirt/in, vier weitere Fachrichtungen (PfWirtAusbV 2010)

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

CREATE FUNCTION public._copy_plan_section(p_src_plan uuid, p_dst_plan uuid, p_key text, p_sort int)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE s record; g record; v_section uuid; v_group uuid;
BEGIN
  SELECT * INTO s FROM plan_sections WHERE plan_id = p_src_plan AND key = p_key;
  INSERT INTO plan_sections (plan_id, key, title, kind, hint, sort_order)
  VALUES (p_dst_plan, s.key, s.title, s.kind, s.hint, p_sort)
  ON CONFLICT (plan_id, key) DO UPDATE SET title = EXCLUDED.title, kind = EXCLUDED.kind,
    hint = EXCLUDED.hint, sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_section;
  FOR g IN SELECT * FROM plan_groups WHERE section_id = s.id ORDER BY sort_order LOOP
    INSERT INTO plan_groups (section_id, key, title, reference, weeks_text, hint, sort_order)
    VALUES (v_section, g.key, g.title, g.reference, g.weeks_text, g.hint, g.sort_order)
    ON CONFLICT (section_id, key) DO UPDATE SET title = EXCLUDED.title, reference = EXCLUDED.reference,
      weeks_text = EXCLUDED.weeks_text, hint = EXCLUDED.hint, sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_group;
    INSERT INTO plan_items (group_id, plan_id, key, label, reference, is_active, sort_order)
    SELECT v_group, p_dst_plan, i.key, i.label, i.reference, i.is_active, i.sort_order
    FROM plan_items i WHERE i.group_id = g.id
    ON CONFLICT (plan_id, key) DO UPDATE SET group_id = EXCLUDED.group_id, label = EXCLUDED.label,
      reference = EXCLUDED.reference, is_active = EXCLUDED.is_active, sort_order = EXCLUDED.sort_order;
  END LOOP;
END $fn$;

DO $do$
DECLARE
  v_prof uuid; v_plan uuid;
  v_subtitle text := $t$Ausbildungsrahmenplan nach der PfWirtAusbV 2010$t$;
  v_source text := $t$Verordnung über die Berufsausbildung zum Pferdewirt/zur Pferdewirtin (PfWirtAusbV 2010) vom 7. Juni 2010, Ausbildungsrahmenplan$t$;
  v_from date := DATE '2010-08-01';
  v_src uuid; v_ag int; v_ai int; v_gg int; v_gi int;
BEGIN
  SELECT id INTO v_prof FROM public.professions WHERE code = 'pferdewirt';
  IF v_prof IS NULL THEN RAISE EXCEPTION 'Beruf pferdewirt fehlt'; END IF;
  SELECT id INTO v_src FROM public.training_plans WHERE code = 'pferdewirt-pferdehaltung';
  IF v_src IS NULL THEN RAISE EXCEPTION 'Quellplan pferdewirt-pferdehaltung fehlt (erst A4a einspielen)'; END IF;
  SELECT count(DISTINCT g.id), count(i.id) INTO v_ag, v_ai FROM plan_sections s JOIN plan_groups g ON g.section_id = s.id
    LEFT JOIN plan_items i ON i.group_id = g.id WHERE s.plan_id = v_src AND s.key = 'A';
  SELECT count(DISTINCT g.id), count(i.id) INTO v_gg, v_gi FROM plan_sections s JOIN plan_groups g ON g.section_id = s.id
    LEFT JOIN plan_items i ON i.group_id = g.id WHERE s.plan_id = v_src AND s.key = 'G';
  IF v_ag <> 7 OR v_ai <> 54 OR v_gg <> 6 OR v_gi <> 25 THEN
    RAISE EXCEPTION 'Quellplan pferdewirt-pferdehaltung unvollständig: A % Gruppen/% Punkte, G % Gruppen/% Punkte (erwartet 7/54 und 6/25)', v_ag, v_ai, v_gg, v_gi;
  END IF;
  v_plan := public._upsert_plan(v_prof, 'pferdewirt-pferdezucht', $t$Pferdewirt/in – Fachrichtung Pferdezucht$t$, v_subtitle, v_source, v_from, 2);
  PERFORM public._copy_plan_section(v_src, v_plan, 'A', 1);
  PERFORM public._seed_plan_lines(v_plan, $plan$ABSCHNITT C | Weitere berufsprofilgebende Fertigkeiten, Kenntnisse und Fähigkeiten in der Fachrichtung Pferdezucht
GRUPPE C1 | Zuchtmethoden, Zuchtplanung, Zuchthygiene | § 4 Absatz 2 Abschnitt C Nummer 1 | 25.–36. Monat: 12 Wochen
  a | Zuchtmethoden, insbesondere die Rein- und Kreuzungszucht an Hand von Pedigrees, bewerten
  b | Vererbungsvorgänge erläutern und in der Zucht anwenden
  c | Maßnahmen zur Zuchthygiene planen, durchführen, kontrollieren und dokumentieren
  d | Zuchtkriterien unter Einbeziehung genetischer Hintergründe bewerten und für die Zuchtplanung nutzen
  e | Kunden bei der Zuchtplanung und Zuchthygiene von Pferden beraten
GRUPPE C2 | Pferdebeurteilung, Pferderassen | § 4 Absatz 2 Abschnitt C Nummer 2 | 25.–36. Monat: 12 Wochen
  a | Zuchtziele und besondere Eignungen von Pferderassen erläutern
  b | Pferde hinsichtlich Eignung und Bedeutung für die züchterische Nutzung beurteilen, rangieren und auswählen
  c | Zusammenhang von Exterieurmerkmalen und Leistungsfähigkeit sowie Gesundheit erläutern
  d | Kunden bei der Auswahl geeigneter Pferde beraten
GRUPPE C3 | Reproduktion und Aufzucht | § 4 Absatz 2 Abschnitt C Nummer 3 | 25.–36. Monat: 14 Wochen
  a | Stuten abprobieren, Natursprung veranlassen und künstliche Besamung durchführen
  b | Stuten auf die Geburt vorbereiten und Geburtsvorgang unterstützen
  c | Stuten und Fohlen nach der Geburt versorgen
  d | rassespezifische Absetz- und Aufzuchtverfahren anwenden und Pferdegruppen zusammenstellen
  e | Gesundheitszustand bei Zucht- und Jungpferden feststellen, Krankheiten erkennen und Maßnahmen ergreifen
  f | Gesundheitsvorsorge bei Zucht- und Jungpferden durchführen
  g | Zucht- und Jungpferde füttern
  h | Futterproben nehmen, Analysen in Auftrag geben und auswerten
  i | Bewirtschaftung von Grünland unter Berücksichtigung von Wachstumsfaktoren organisieren und Pflegemaßnahmen durchführen
  j | Nährstoffbedarf unter Berücksichtigung von Analyseergebnissen ermitteln, Düngemaßnahmen planen, Düngung durchführen oder in Auftrag geben, Ergebnisse kontrollieren und dokumentieren
  k | Formen der Weidehaltung sowie der Aufstallung für Zucht- und Jungpferde planen, beurteilen und umsetzen
GRUPPE C4 | Vorstellung von Pferden bei Zuchtschauen und Prüfungen | § 4 Absatz 2 Abschnitt C Nummer 4 | 25.–36. Monat: 14 Wochen
  a | Zuchtprogramme von Zuchtorganisationen darstellen
  b | Pferde bei den jeweiligen Zuchtorganisationen entsprechend den Vorgaben registrieren lassen
  c | Zuchtpferde durch Ausbildung, Training und Haltungsbedingungen auf Zuchtveranstaltungen vorbereiten
  d | Pferde bei Zuchtveranstaltungen vorstellen
  e | Zuchtpferde den Kunden präsentieren$plan$, 2);
  PERFORM public._copy_plan_section(v_src, v_plan, 'G', 3);
  v_plan := public._upsert_plan(v_prof, 'pferdewirt-reitausbildung', $t$Pferdewirt/in – Fachrichtung Klassische Reitausbildung$t$, v_subtitle, v_source, v_from, 3);
  PERFORM public._copy_plan_section(v_src, v_plan, 'A', 1);
  PERFORM public._seed_plan_lines(v_plan, $plan$ABSCHNITT D | Weitere berufsprofilgebende Fertigkeiten, Kenntnisse und Fähigkeiten in der Fachrichtung Klassische Reitausbildung
GRUPPE D1 | Funktionelle Pferdebeurteilung | § 4 Absatz 2 Abschnitt D Nummer 1 | 25.–36. Monat: 10 Wochen
  a | Funktionen körperlicher Strukturen aus anatomischen und physiologischen Grundlagen ableiten und bei der Ausbildung berücksichtigen
  b | Bewegungsabläufe von Pferden beurteilen
  c | Eignung des Pferdes für spezifische Einsatzbereiche und Disziplinen anhand von Interieur- und Exterieurmerkmalen beurteilen
GRUPPE D2 | Vielseitige, klassische Grundausbildung des Pferdes | § 4 Absatz 2 Abschnitt D Nummer 2 | 25.–36. Monat: 16 Wochen
  a | Pferde durch Bodenarbeit, Longieren und Freispringen auf die weitere Ausbildung vorbereiten
  b | Pferde unter Berücksichtigung von Sicherheitsaspekten systematisch anreiten
  c | Pferde bis zur beginnenden Versammlung gemäß der Skala der Ausbildung ausbilden und gymnastizieren
  d | dressurmäßige Übungen und Lektionen, Bodenrickarbeit, springgymnastische Übungen sowie verschiedene Gegebenheiten und Hindernisse im Gelände systematisch einsetzen und kombinieren
  e | Ausbildungs- und Trainingsprozesse von Pferden entsprechend der Reit- und Trainingslehre planen, umsetzen, analysieren und korrigieren
  f | Gesundheit und Leistungsbereitschaft von Pferden im Training sicherstellen
  g | Wirkung und Zweckmäßigkeit von Ausrüstungsgegenständen beurteilen und diese der Situation angemessen anwenden
GRUPPE D3 | Zielgruppenorientierte, klassische Ausbildung von Reitern und Reiterinnen | § 4 Absatz 2 Abschnitt D Nummer 3 | 25.–36. Monat: 16 Wochen
  a | Pferdekunde und Zusammenhänge der Reitausbildung zielgruppenorientiert vermitteln
  b | arttypisches Verhalten des Pferdes erklären sowie tiergerechten und sicheren Umgang mit dem Pferd schulen
  c | Sitz und Einwirkung von Reitern und Reiterinnen in verschiedenen Sitzformen analysieren und unter Berücksichtigung der Trainings- und Bewegungslehre individuell schulen
  d | Reiten disziplinübergreifend in breitensportlicher wie in leistungssportlicher Ausrichtung unterrichten und trainieren
  e | Reiter und Reiterinnen auf ihrem Ausbildungsweg beraten sowie auf Veranstaltungen betreuen
GRUPPE D4 | Vorbereitung und Vorstellung von Pferden bei Leistungsprüfungen | § 4 Absatz 2 Abschnitt D Nummer 4 | 25.–36. Monat: 10 Wochen
  a | einschlägige Organisationen kennen, Regelwerke und Leitlinien anwenden
  b | Teilnahme an Leistungsprüfungen planen
  c | Pferde auf breitensportliche Wettbewerbe und leistungssportliche Prüfungen vorbereiten und situationsgerecht im Rahmen ihrer Leistungsfähigkeit präsentieren
  d | Pferde auf Zuchtveranstaltungen vorbereiten und situationsgerecht im Rahmen ihrer Leistungsfähigkeit präsentieren
  e | Erfahrungen und Ergebnisse aus Leistungsprüfungen analysieren und bewerten$plan$, 2);
  PERFORM public._copy_plan_section(v_src, v_plan, 'G', 3);
  v_plan := public._upsert_plan(v_prof, 'pferdewirt-pferderennen', $t$Pferdewirt/in – Fachrichtung Pferderennen$t$, v_subtitle, v_source, v_from, 4);
  PERFORM public._copy_plan_section(v_src, v_plan, 'A', 1);
  PERFORM public._seed_plan_lines(v_plan, $plan$ABSCHNITT E | Weitere berufsprofilgebende Fertigkeiten, Kenntnisse und Fähigkeiten in der Fachrichtung Pferderennen
GRUPPE E1 | Training von Rennpferden | § 4 Absatz 2 Abschnitt E Nummer 1 | 25.–36. Monat: 19 Wochen
  a | Ausbildung und Training unter Berücksichtigung der individuellen Voraussetzungen nach trainingswissenschaftlichen Gesichtspunkten planen, durchführen und kontrollieren
  b | Gesundheitszustand und Haltungsbedingungen beurteilen und Maßnahmen zur Gesunderhaltung des Pferdes unter besonderer Berücksichtigung der speziellen Anforderungen sowie des Entwicklungsstandes und Alters durchführen
  c | Rennpferde im Hinblick auf Trainingspläne leistungsgerecht füttern
  d | Wirkungen und Zweckmäßigkeit spezifischer Ausrüstung erklären, diese entsprechend Ausbildungsstand und Verwendung des Pferdes unter Tierschutzaspekten beurteilen, auswählen und einsetzen
GRUPPE E2 | Beurteilung des Leistungsvermögens von Rennpferden | § 4 Absatz 2 Abschnitt E Nummer 2 | 25.–36. Monat: 10 Wochen
  a | Zuchtziele und Zuchtstandards vor dem Hintergrund der Entwicklungsgeschichte der jeweiligen Rasse erklären
  b | die für das Leistungsvermögen des Pferdes wesentlichen Merkmale, insbesondere Pedigreeanalyse, Interieur, Exterieur, Trainingsverläufe und Rennergebnisse, beurteilen
  c | Bewegungsabläufe in den verschiedenen Gangarten beurteilen
  d | zur Beurteilung des Leistungsvermögens wesentliche physiologische Parameter messen und bewerten
  e | Trainer und Trainerinnen sowie Kunden über das Leistungsvermögen von Rennpferden informieren und dabei Kommunikationsregeln in verschiedenen beruflichen Situationen anwenden und zur Vermeidung von Kommunikationsstörungen beitragen
GRUPPE E3 | Vorbereitung und Teilnahme an Pferderennen | § 4 Absatz 2 Abschnitt E Nummer 3 | 25.–36. Monat: 16 Wochen
  a | geschichtliche Entwicklung des Rennsports darstellen und Regelwerke anwenden
  b | Hufbeschlag für den Renneinsatz beurteilen und Maßnahmen einleiten
  c | Pferde für das Rennen vorbereiten und nach dem Rennen versorgen
  d | Renneinsätze planen, durchführen und analysieren
  e | Transporte planen und durchführen
  f | an Rennen teilnehmen
GRUPPE E4 | Gesundheit, Ernährung und Fitness des Rennreiters und der Rennreiterin sowie des Rennfahrers und der Rennfahrerin | § 4 Absatz 2 Abschnitt E Nummer 4 | 25.–36. Monat: 7 Wochen
  a | den Zusammenhang von Ernährung, Körpermasse und Energieverbrauch erklären und den menschlichen Energiebedarf und -verbrauch individuell feststellen
  b | Fitness unter Berücksichtigung von gesundheitsverträglichen Maßnahmen zur Kontrolle und Steuerung der menschlichen Körpermasse aufbauen und erhalten
  c | Ergänzungstraining zur Förderung der Ausdauer, Beweglichkeit und Koordination durchführen
  d | Trainings- und Ernährungspläne aufstellen$plan$, 2);
  PERFORM public._copy_plan_section(v_src, v_plan, 'G', 3);
  v_plan := public._upsert_plan(v_prof, 'pferdewirt-spezialreitweisen', $t$Pferdewirt/in – Fachrichtung Spezialreitweisen$t$, v_subtitle, v_source, v_from, 5);
  PERFORM public._copy_plan_section(v_src, v_plan, 'A', 1);
  PERFORM public._seed_plan_lines(v_plan, $plan$ABSCHNITT F | Weitere berufsprofilgebende Fertigkeiten, Kenntnisse und Fähigkeiten in der Fachrichtung Spezialreitweisen
GRUPPE F1 | Beurteilung von Pferden in einer Spezialreitweise | § 4 Absatz 2 Abschnitt F Nummer 1 | 25.–36. Monat: 10 Wochen
  a | Geschichte der jeweiligen Spezialpferderassen im Hinblick auf das Einsatzgebiet erklären
  b | Zuchtziele und Zuchtstandards der jeweiligen Spezialpferderassen erklären
  c | Funktionen körperlicher Strukturen aus anatomischen und physiologischen Grundlagen ableiten und bei der Ausbildung berücksichtigen
  d | Bewegungsablauf eines Pferdes und die Qualität der Gangarten beurteilen
  e | Eignung für spezifische Einsatzbereiche, Disziplinen und Verwendungszwecke unter Berücksichtigung von Interieur und Exterieur beurteilen
GRUPPE F2 | Grunderziehung und -ausbildung von Pferden in einer Spezialreitweise | § 4 Absatz 2 Abschnitt F Nummer 2 | 25.–36. Monat: 16 Wochen
  a | Pferde durch Bodenarbeit erziehen und für das Reiten vorbereiten
  b | junge Pferde anreiten und die Grundausbildung in der Spezialreitweise durchführen
  c | Pferde unter Berücksichtigung des jeweiligen Lernverhaltens und der körperlichen Voraussetzungen für den späteren Verwendungszweck ausbilden
  d | Ausbildungs- und Trainingspläne für Pferde unter Berücksichtigung des Ausbildungsstandes im Breiten- und Leistungssport erstellen
  e | Wirkungen und Zweckmäßigkeit reitweisenspezifischer Ausrüstung erklären und entsprechend Ausbildungsstand und Verwendung des Pferdes auswählen und einsetzen
  f | Fehlentwicklungen in der Ausbildung von Pferden analysieren sowie Lösungswege planen und umsetzen
GRUPPE F3 | Arbeit mit Reitern und Reiterinnen in einer Spezialreitweise | § 4 Absatz 2 Abschnitt F Nummer 3 | 25.–36. Monat: 16 Wochen
  a | Pferdekunde und Zusammenhänge der Spezialreitweise vermitteln
  b | arttypisches Verhalten des Pferdes erklären sowie tiergerechten und sicheren Umgang mit Pferden schulen
  c | Bodenarbeit und Erziehung von Pferden erklären und vermitteln
  d | System der spezifischen Reitausbildung erklären
  e | Reitunterricht für den Breitensport planen und durchführen
  f | Ausritte und Angebote für den Breitensport planen und durchführen
  g | Reiter und Reiterinnen auf Wettbewerbe und für den Turniersport vorbereiten und bei Turnieren unterstützen
GRUPPE F4 | Wettbewerbsvorbereitung und Einsatz in Prüfungen einer Spezialreitweise | § 4 Absatz 2 Abschnitt F Nummer 4 | 25.–36. Monat: 10 Wochen
  a | einschlägige Organisationen kennen, Regelwerke und Leitlinien anwenden
  b | Vorstellung von Pferden im Rahmen von Wettbewerben und Prüfungen planen
  c | Pferde an der Hand und unter dem Sattel in den Kerndisziplinen der Spezialreitweise vorstellen
  d | wettbewerbsspezifische Ausrüstungen und Hufbeschläge auswählen und einsetzen$plan$, 2);
  PERFORM public._copy_plan_section(v_src, v_plan, 'G', 3);
END $do$;

DROP FUNCTION public._copy_plan_section(uuid, uuid, text, int);
DROP FUNCTION public._upsert_plan(uuid, text, text, text, text, date, int);
DROP FUNCTION public._seed_plan_lines(uuid, text, int);
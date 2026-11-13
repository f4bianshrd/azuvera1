-- Daten-Prompt A4a: Pferdewirt/in, Fachrichtung Pferdehaltung und Service (PfWirtAusbV 2010)

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
  v_subtitle text := $t$Ausbildungsrahmenplan nach der PfWirtAusbV 2010$t$;
  v_source text := $t$Verordnung über die Berufsausbildung zum Pferdewirt/zur Pferdewirtin (PfWirtAusbV 2010) vom 7. Juni 2010, Ausbildungsrahmenplan$t$;
  v_from date := DATE '2010-08-01';
BEGIN
  SELECT id INTO v_prof FROM public.professions WHERE code = 'pferdewirt';
  IF v_prof IS NULL THEN RAISE EXCEPTION 'Beruf pferdewirt fehlt'; END IF;
  v_plan := public._upsert_plan(v_prof, 'pferdewirt-pferdehaltung', $t$Pferdewirt/in – Fachrichtung Pferdehaltung und Service$t$, v_subtitle, v_source, v_from, 1);
  PERFORM public._seed_plan_lines(v_plan, $plan$ABSCHNITT A | Gemeinsame berufsprofilgebende Fertigkeiten, Kenntnisse und Fähigkeiten
GRUPPE A1 | Tiergerechte Pferdehaltung; Pferdefütterung | § 4 Absatz 2 Abschnitt A Nummer 1 | 1.–18. Monat: 22 Wochen; 19.–24. Monat: 6 Wochen
  a | Verhaltensweisen von Pferden analysieren und im Umgang berücksichtigen
  b | Pferde entsprechend Haltungsform und Verwendung pflegen und füttern
  c | Pferdehaltungssysteme und Stalltechnik beurteilen
  d | Pferdehaltungssysteme reinigen, insbesondere Einstreu auswählen, einsetzen und entfernen
  e | Futtermittel und Einstreu beurteilen und lagern
  f | Stallklima beurteilen
  g | Futterrationen gestalten und Fütterung überprüfen
GRUPPE A2 | Tierschutz und Tiergesundheit | § 4 Absatz 2 Abschnitt A Nummer 2 | 1.–18. Monat: 10 Wochen; 19.–24. Monat: 2 Wochen
  a | Gesundheitszustand feststellen, Gesundheitsvorsorge durchführen, Notfallpläne erstellen, Tierseuchenprophylaxe umsetzen, hygienische Bestimmungen anwenden sowie Impfpläne erstellen
  b | Desinfektionsmaßnahmen durchführen
  c | Sofortmaßnahmen ergreifen
  d | verletzte und kranke Pferde pflegen
  e | Hufe begutachten und pflegen
  f | mit Medikamenten nach tierärztlicher Anweisung umgehen
  g | Transporte planen, Pferde tiergerecht transportieren und die dafür geltenden rechtlichen Bestimmungen anwenden
GRUPPE A3 | Ausbildung und Vorbereitung von Pferden für Zucht- und Leistungsprüfungen | § 4 Absatz 2 Abschnitt A Nummer 3 | 1.–18. Monat: 20 Wochen; 19.–24. Monat: 8 Wochen
  a | grundlegende Ausbildungs- und Trainingsmethoden anwenden
  b | Grunderziehung durchführen
  c | Pferde bewegen
  d | Pferde zu Präsentationen vorbereiten
  e | Ausbildungsmaßnahmen für Pferde planen, durchführen und kontrollieren
GRUPPE A4 | Betriebliche Abläufe und Organisation; betriebswirtschaftliche Zusammenhänge | § 4 Absatz 2 Abschnitt A Nummer 4 | 1.–18. Monat: 8 Wochen; 19.–24. Monat: 5 Wochen
  a | Arbeits- und Betriebsanweisungen umsetzen
  b | Arbeitsabläufe nach rechtlichen, wirtschaftlichen und ergonomischen Anforderungen planen, durchführen und kontrollieren
  c | Arbeitsplatz vorbereiten und Maßnahmen zur Vermeidung von Personen-, Tier- und Sachschäden treffen
  d | Eingang und Verbrauch von Betriebsmitteln erfassen
  e | betriebliche Kommunikations- und Informationssysteme nutzen, dabei Standardsoftware und arbeitsplatzspezifische Software anwenden
  f | Informationen beschaffen und auswerten
  g | Aufgaben abstimmen und teamorientiert durchführen
  h | Gespräche situationsgerecht führen und Konflikte im Team lösen
  i | Personen bei Routinearbeiten anleiten und beaufsichtigen
  j | Arbeitsergebnisse dokumentieren, beurteilen und präsentieren
  k | gesetzliche und berufsbezogene Regelungen anwenden, insbesondere zu anzeigepflichtigen Tierseuchen, zur Tierkörperbeseitigung sowie zur gesetzlichen Haftung
  l | betriebliche Kosten und Leistungen erfassen und kalkulieren
  m | Markt- und Preisinformationen einholen, vergleichen und bewerten
  n | rechtliche Regelungen des An- und Verkaufs von Pferden erläutern
  o | bei Geschäftsvorgängen mitwirken, insbesondere Angebote vergleichen, Bestellungen vorbereiten, Rechnungen kontrollieren
GRUPPE A5 | Dienstleistungen, Kundenorientierung, Marketing | § 4 Absatz 2 Abschnitt A Nummer 5 | 1.–18. Monat: 6 Wochen; 19.–24. Monat: 3 Wochen
  a | die Wirkung des eigenen Erscheinungsbildes und Auftretens einschätzen und beim Umgang mit Kunden berücksichtigen
  b | Informationen, Wünsche und Reklamationen von Kunden entgegennehmen, Bearbeitung abstimmen und bei der Arbeitserledigung berücksichtigen
  c | Kundengespräche situationsgerecht führen
  d | betriebliches Leistungsangebot zur Gewinnung und Bindung von Kunden präsentieren
  e | bei der Planung von Werbemaßnahmen mitwirken, Werbemaßnahmen umsetzen
  f | Kunden in fachlichen Fragen beraten
GRUPPE A6 | Pferdezucht und -aufzucht | § 4 Absatz 2 Abschnitt A Nummer 6 | 1.–18. Monat: 6 Wochen; 19.–24. Monat: 2 Wochen
  a | Pferde identifizieren und beurteilen
  b | rassetypische Merkmale, insbesondere im Hinblick auf Anatomie und Physiologie, erläutern
  c | Organisation und Strukturen der Pferdezucht erläutern
  d | Grundlagen der Trächtigkeit und des Abfohlens erläutern und bei der Haltung, Versorgung und beim Bewegen von Pferden berücksichtigen
  e | Grundlagen der Aufzucht erläutern und bei der Haltung, Versorgung und beim Bewegen von Pferden berücksichtigen
GRUPPE A7 | Ausrüstung; Einsatz von Maschinen, Geräten und Betriebseinrichtungen | § 4 Absatz 2 Abschnitt A Nummer 7 | 1.–18. Monat: 6 Wochen
  a | Ausrüstung und Hilfsmittel auswählen und einsetzen
  b | Ausrüstung und Hilfsmittel reinigen, pflegen, prüfen und warten
  c | Mängel an Ausrüstung und Hilfsmitteln feststellen und Maßnahmen zur Instandsetzung ergreifen
  d | Maschinen und Geräte bedienen, dabei Werterhaltung beachten
  e | Schutzmaßnahmen an Maschinen und elektrischen Anlagen beachten
  f | Maschinen, Geräte und Betriebseinrichtungen reinigen, pflegen, prüfen und warten
  g | Störungen an Maschinen und Betriebseinrichtungen feststellen und Maßnahmen zur Instandsetzung ergreifen
  h | Erste-Hilfe-Maßnahmen anwenden
  i | Betriebs- und Werkstoffe einsetzen und lagern
ABSCHNITT B | Weitere berufsprofilgebende Fertigkeiten, Kenntnisse und Fähigkeiten in der Fachrichtung Pferdehaltung und Service
GRUPPE B1 | Individuelle Pferdefütterung; Futtergewinnung und -beschaffung | § 4 Absatz 2 Abschnitt B Nummer 1 | 25.–36. Monat: 13 Wochen
  a | Futtermittel beschaffen und dabei Faktoren der Preisbildung berücksichtigen
  b | bei der Ernte von Grundfutter mitwirken, Grundfutter einlagern
  c | Qualität von Futtermitteln beurteilen und Rückschlüsse auf Futterernte, -lagerung und -einsatz ziehen
  d | Futtermittellagerung organisieren, Lagertemperaturen überwachen und dokumentieren
  e | Futterproben nehmen, Trockenmasse bestimmen, Analysen in Auftrag geben und auswerten
  f | Futterrationen berechnen, Fütterungen durchführen und beurteilen
  g | Giftpflanzen identifizieren, Vergiftungen vermeiden und Notfallmaßnahmen organisieren
GRUPPE B2 | Stall- und Weidemanagement | § 4 Absatz 2 Abschnitt B Nummer 2 | 25.–36. Monat: 13 Wochen
  a | Bewirtschaftung von Pferdeweiden unter Berücksichtigung von Wachstumsfaktoren organisieren und Pflegemaßnahmen durchführen
  b | Nährstoffbedarf unter Berücksichtigung von Analyseergebnissen ermitteln, Düngemaßnahmen planen, Düngung durchführen oder in Auftrag geben, Ergebnisse kontrollieren und dokumentieren
  c | Ausläufe einrichten, pflegen und kontrollieren
  d | Pferdezäune planen, bauen, Kontrollen organisieren, durchführen und dokumentieren sowie Maßnahmen zur Beseitigung von Mängeln ergreifen
  e | Pferde in Herden zusammenstellen
  f | Belegungs- und Nutzungspläne erstellen
  g | Arbeitsabläufe organisieren und koordinieren
  h | Reitböden im Hinblick auf Standort und Nutzung beurteilen und instand halten
  i | Sicherheitsmaßnahmen durchsetzen
  j | Preise erfassen und Kosten kalkulieren
GRUPPE B3 | Bewegung von Pferden im Reiten oder Fahren, Arbeiten an der Longe | § 4 Absatz 2 Abschnitt B Nummer 3 | 25.–36. Monat: 13 Wochen
  a | Pferde an der Longe arbeiten
  b | Pferde bewegen und beschäftigen
  c | Kondition ausgebildeter Pferde erhalten
  d | Ausritte oder Ausfahrten organisieren und durchführen
  e | Pferde verladen und transportieren
GRUPPE B4 | Beratung von Kunden und kundenorientierte Anlagenbewirtschaftung | § 4 Absatz 2 Abschnitt B Nummer 4 | 25.–36. Monat: 13 Wochen
  a | Ausbildungsmaßnahmen für den Umgang mit und die Erziehung von Pferden sowie für Bodenarbeit und Bewegung durchführen
  b | Kunden im Verladen und Transportieren von Pferden ausbilden und bei Zucht- und Leistungsprüfungen sowie Wettbewerben unterstützen
  c | über tiergerechte Pferdefütterung beraten und auf Risiken hinweisen
  d | über tiergerechte Pferdehaltung und Gesundheitsvorsorge beraten, auf Risiken hinweisen und in Notfallmaßnahmen einweisen
  e | bei der Auswahl, Ausrüstung von Pferden, Reitern und Reiterinnen beraten
  f | Kundenwünsche ermitteln und darauf reagieren
  g | Informations- und Werbemaßnahmen sowie Veranstaltungen planen und umsetzen, dabei aktuelle Entwicklungen in der Pferdewirtschaft berücksichtigen
  h | über Möglichkeiten und Kosten der Pferdehaltung sowie Trainings- und Ausbildungsmöglichkeiten beraten
ABSCHNITT G | Gemeinsame integrative Fertigkeiten, Kenntnisse und Fähigkeiten
GRUPPE G1 | Aufbau und Organisation des Ausbildungsbetriebes | § 4 Absatz 2 Abschnitt G Nummer 1 | während der gesamten Ausbildung zu vermitteln
  a | Aufbau und Aufgaben des ausbildenden Betriebes erläutern
  b | Grundfunktionen des ausbildenden Betriebes, wie Beschaffung, Vermarktung und Verwaltung, erklären
  c | Beziehungen des ausbildenden Betriebes und seiner Beschäftigten zu Wirtschaftsorganisationen, Berufsvertretungen und Gewerkschaften nennen
  d | Grundlagen, Aufgabe und Arbeitsweise der betriebsverfassungs- und personalvertretungsrechtlichen Organe des ausbildenden Betriebes beschreiben
GRUPPE G2 | Berufsbildung, Arbeits- und Tarifrecht | § 4 Absatz 2 Abschnitt G Nummer 2 | während der gesamten Ausbildung zu vermitteln
  a | Bedeutung des Ausbildungsvertrages, insbesondere Abschluss, Dauer und Beendigung, erklären
  b | gegenseitige Rechte und Pflichten aus dem Ausbildungsvertrag nennen
  c | Möglichkeiten der beruflichen Fortbildung nennen
  d | wesentliche Teile des Arbeitsvertrages nennen
  e | wesentliche Bestimmungen der für den ausbildenden Betrieb geltenden Tarifverträge nennen
GRUPPE G3 | Sicherheit und Gesundheitsschutz bei der Arbeit | § 4 Absatz 2 Abschnitt G Nummer 3 | während der gesamten Ausbildung zu vermitteln
  a | Gefährdung von Sicherheit und Gesundheit am Arbeitsplatz feststellen und Maßnahmen zu ihrer Vermeidung ergreifen
  b | berufsbezogene Arbeitsschutz- und Unfallverhütungsvorschriften anwenden
  c | Verhaltensweisen bei Unfällen beschreiben sowie erste Maßnahmen einleiten
  d | Vorschriften des vorbeugenden Brandschutzes anwenden; Verhaltensweisen bei Bränden beschreiben und Maßnahmen zur Brandbekämpfung ergreifen
GRUPPE G4 | Umweltschutz | § 4 Absatz 2 Abschnitt G Nummer 4 | während der gesamten Ausbildung zu vermitteln | Zur Vermeidung betriebsbedingter Umweltbelastungen im beruflichen Einwirkungsbereich beitragen, insbesondere:
  a | über mögliche Umweltbelastungen durch den Ausbildungsbetrieb Auskunft geben und seinen Beitrag zum Umweltschutz an Beispielen erklären
  b | für den Ausbildungsbetrieb geltende Regelungen des Umweltschutzes anwenden
  c | Möglichkeiten der wirtschaftlichen und umweltschonenden Energie- und Materialverwendung nutzen
  d | Abfälle vermeiden, Stoffe und Materialien einer umweltschonenden Entsorgung zuführen
GRUPPE G5 | Naturschutz, ökologische Zusammenhänge, Nachhaltigkeit | § 4 Absatz 2 Abschnitt G Nummer 5 | während der gesamten Ausbildung zu vermitteln
  a | geltende Regelungen des Naturschutzes anwenden
  b | ökologische Zusammenhänge beachten
  c | Bedeutung von Lebensräumen für Mensch, Tier und Pflanzen erklären sowie Lebensräume an Beispielen beschreiben
  d | Bedeutung und Ziele des Naturschutzes bei der Arbeit beschreiben
  e | Nachhaltigkeitsaspekte bei der Pferdehaltung, der Pferdezucht sowie der Ausbildung von Pferden, Reitern und Reiterinnen beachten
GRUPPE G6 | Qualitätssichernde Maßnahmen | § 4 Absatz 2 Abschnitt G Nummer 6 | während der gesamten Ausbildung zu vermitteln
  a | Ziele und Aufgaben der betrieblichen Qualitätssicherung erläutern
  b | betriebliche Qualitätsstandards anwenden
  c | Ursachen von Fehlern und Qualitätsmängeln aufzeigen, dokumentieren und zu deren Behebung beitragen$plan$, 1);
  UPDATE public.professions SET ai_hints = $h$Für Pferdewirtschaft: Ordne die in den Stichpunkten genannten Tätigkeiten fachlich ein. Unterscheide je nach Tätigkeit z. B. Pferdehaltung und Stallarbeiten, Fütterung und Gesundheitsvorsorge, Umgang mit Pferden, Bodenarbeit und Ausbildung (Longieren, Reiten, Fahren), Zucht und Aufzucht, Weide- und Stallmanagement sowie Beratung und Kundenservice. Verwende solche Begriffe nur, wenn sie zur beschriebenen Tätigkeit passen. Erkläre bei Bedarf kurz den fachlichen Zweck oder die Bedeutung eines Begriffs im konkreten Zusammenhang, ohne einen nicht genannten Arbeitsvorgang zu behaupten. Unterscheide Beobachtung von Maßnahme, Planung von Durchführung und Kontrolle von Ergebnis. Beziehe Arbeitsschutz, Tierwohl, Hygiene sowie Natur- und Umweltschutz nur ein, wenn aus den Angaben passend ableitbar.$h$
  WHERE code = 'pferdewirt' AND coalesce(btrim(ai_hints), '') = '';
END $do$;

DROP FUNCTION public._upsert_plan(uuid, text, text, text, text, date, int);
DROP FUNCTION public._seed_plan_lines(uuid, text, int);
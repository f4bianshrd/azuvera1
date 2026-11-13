-- Daten-Prompt A2b: Landwirt/in, neue Fassung (LwAusbV, ab 1. August 2027)

CREATE FUNCTION public._a2_seed_plan(p_plan uuid, p_data text, p_new_format boolean)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE
  v_line text; v_parts text[]; v_section uuid; v_group uuid; v_group_key text;
  v_s int := 0; v_g int := 0; v_i int := 0;
BEGIN
  FOREACH v_line IN ARRAY string_to_array(p_data, E'\n') LOOP
    CONTINUE WHEN v_line = '';
    IF left(v_line, 10) = 'ABSCHNITT ' THEN
      v_parts := string_to_array(substr(v_line, 11), ' | ');
      v_s := v_s + 1; v_g := 0;
      INSERT INTO plan_sections (plan_id, key, title, kind, hint, sort_order)
      VALUES (p_plan, v_parts[1], v_parts[2],
              CASE WHEN v_parts[3] = 'checklist' THEN 'checklist' ELSE 'content' END,
              CASE WHEN v_parts[3] = 'checklist' THEN v_parts[4] END, v_s)
      ON CONFLICT (plan_id, key) DO UPDATE SET title = EXCLUDED.title, kind = EXCLUDED.kind,
        hint = EXCLUDED.hint, sort_order = EXCLUDED.sort_order
      RETURNING id INTO v_section;
    ELSIF left(v_line, 7) = 'GRUPPE ' THEN
      v_parts := string_to_array(substr(v_line, 8), ' | ');
      v_g := v_g + 1; v_i := 0; v_group_key := v_parts[1];
      INSERT INTO plan_groups (section_id, key, title, reference, weeks_text, hint, sort_order)
      VALUES (v_section, v_parts[1], v_parts[2],
              CASE WHEN p_new_format THEN v_parts[3] END,
              CASE WHEN p_new_format THEN v_parts[4] END, NULL, v_g)
      ON CONFLICT (section_id, key) DO UPDATE SET title = EXCLUDED.title, reference = EXCLUDED.reference,
        weeks_text = EXCLUDED.weeks_text, hint = EXCLUDED.hint, sort_order = EXCLUDED.sort_order
      RETURNING id INTO v_group;
    ELSIF left(v_line, 2) = '  ' THEN
      v_parts := string_to_array(substr(v_line, 3), ' | ');
      v_i := v_i + 1;
      INSERT INTO plan_items (group_id, plan_id, key, label, reference, is_active, sort_order)
      VALUES (v_group, p_plan,
              CASE WHEN p_new_format THEN v_group_key || '.' || v_parts[1] ELSE v_parts[1] END,
              v_parts[2],
              CASE WHEN p_new_format THEN v_parts[1] || ')' END, true, v_i)
      ON CONFLICT (plan_id, key) DO UPDATE SET group_id = EXCLUDED.group_id, label = EXCLUDED.label,
        reference = EXCLUDED.reference, is_active = true, sort_order = EXCLUDED.sort_order;
    ELSE
      RAISE EXCEPTION 'Unbekannte Datenzeile: %', v_line;
    END IF;
  END LOOP;
END $fn$;

DO $do$
DECLARE v_prof uuid; v_plan uuid;
BEGIN
  SELECT id INTO v_prof FROM public.professions WHERE code = 'landwirt';
  IF v_prof IS NULL THEN RAISE EXCEPTION 'Beruf landwirt fehlt'; END IF;
  INSERT INTO public.training_plans (profession_id, code, title, subtitle, source, valid_from, valid_until, duration_years, is_template, status, sort_order)
  VALUES (v_prof, 'landwirt-2027', $t$Ausbildungsrahmenplan Landwirt/in (neu, ab 1. August 2027)$t$, $t$Landwirt-Ausbildungsverordnung (LwAusbV)$t$, $t$Landwirt-Ausbildungsverordnung (LwAusbV), Artikel 1 der Verordnung vom 14. Oktober 2026 (BGBl. 2026 I Nr. 311): Ausbildungsberufsbild (§ 4) und Ausbildungsrahmenplan (Anlage zu § 3 Absatz 1), gültig ab 1. August 2027$t$, DATE '2027-08-01', NULL, 3, false, 'published', 2)
  ON CONFLICT (code) DO UPDATE SET profession_id = EXCLUDED.profession_id, title = EXCLUDED.title,
    subtitle = EXCLUDED.subtitle, source = EXCLUDED.source, valid_from = EXCLUDED.valid_from,
    valid_until = EXCLUDED.valid_until, duration_years = EXCLUDED.duration_years,
    is_template = EXCLUDED.is_template, status = EXCLUDED.status, sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_plan;
  PERFORM public._a2_seed_plan(v_plan, $plan$ABSCHNITT A | Berufsprofilgebende Fertigkeiten, Kenntnisse und Fähigkeiten
GRUPPE A1 | Arbeitsprozesse planen, ausführen, bewerten und dokumentieren | § 4 Absatz 2 Nummer 1 | 1.–18. Monat: 6 Wochen; 19.–36. Monat: 2 Wochen
  a | Arbeitsaufträge prüfen
  b | Arbeitsverfahren, Arbeitstechniken und Arbeitsmittel unter Beachtung rechtlicher Regelungen und unter Berücksichtigung betrieblicher Vorgaben auswählen
  c | Arbeitsprozesse und Arbeitsschritte unter Beachtung von Qualitätsvorgaben und der ökonomischen, ökologischen und sozialen Dimension von Nachhaltigkeit sowie terminlicher Vorgaben planen
  d | Arbeitsplätze unter Berücksichtigung von Arbeitsabläufen einrichten
  e | Arbeitsschritte unter Berücksichtigung betrieblicher Gegebenheiten durchführen
  f | Arbeitsergebnisse und Arbeitszeiten kontrollieren und dokumentieren
  g | Planung und Durchführung von Arbeitsprozessen an veränderte Bedingungen anpassen
  h | Arbeitsergebnisse und Arbeitszeiten anhand von Vorgaben bewerten
  i | Arbeitsprozesse und Arbeitsergebnisse auf der Grundlage von prozess- und produktbezogenen Daten auswerten und Maßnahmen zur Optimierung einleiten
  j | technische Entwicklungen, insbesondere im Zusammenhang mit digitalisierten und vernetzten Systemen sowie Nachhaltigkeit, verfolgen und Auswirkungen auf Arbeitsabläufe ableiten
GRUPPE A2 | Geräte, Maschinen und Betriebseinrichtungen bereitstellen und einsetzen | § 4 Absatz 2 Nummer 2 | 1.–18. Monat: 10 Wochen; 19.–36. Monat: 8 Wochen
  a | rechtliche Regelungen, Sicherheitsvorschriften, Herstellervorgaben und betriebliche Vorgaben einhalten
  b | Sicherheitsvorschriften im Umgang mit elektrischen Geräten, Maschinen und Betriebseinrichtungen einhalten
  c | persönliche Schutzausrüstung auswählen, überprüfen und einsetzen sowie weitere Maßnahmen zum Arbeits- und Gesundheitsschutz ergreifen
  d | Betriebsbereitschaft und Sicherheitseinrichtungen von Geräten, Maschinen und Betriebseinrichtungen prüfen und bei Abweichungen Korrekturmaßnahmen ergreifen
  e | Geräte, Maschinen und Betriebseinrichtungen unter Berücksichtigung von Funktion und Aufbau einsatzbezogen auswählen, bereitstellen und vorbereiten
  f | Geräte, Maschinen und Betriebseinrichtungen bedienen
  g | Vorschriften über das Führen landwirtschaftlicher Fahrzeuge im Straßenverkehr beachten
  h | Verbrauch von Betriebsstoffen erfassen und dokumentieren
  i | Betriebsstoffe einsatzbezogen bereitstellen und einsetzen sowie nach rechtlichen Regelungen und betrieblichen Vorgaben kennzeichnen, lagern und transportieren
  j | Verfahren zur Reinigung von Geräten, Maschinen und Betriebseinrichtungen auswählen und anwenden, dabei Maßnahmen zum Umweltschutz und zur Nachhaltigkeit ergreifen
  k | Ergebnisse von Reinigungsarbeiten bewerten und nach betrieblichen Vorgaben dokumentieren
  l | Daten für den Einsatz von Geräten, Maschinen und Betriebseinrichtungen prüfen und nutzen
  m | Störungen an Geräten, Maschinen und Betriebseinrichtungen feststellen und Ursachen eingrenzen sowie Maßnahmen zur Behebung veranlassen
  n | Verfügbarkeit von Betriebsstoffen prüfen und bei Abweichungen Maßnahmen ergreifen
  o | Rückstände von Betriebsstoffen nach rechtlichen Regelungen und betrieblichen Vorgaben einer umweltgerechten Entsorgung zuführen
  p | Verfahren zur Inspektion und Wartung von Geräten, Maschinen und Betriebseinrichtungen auswählen und anwenden, dabei Maßnahmen zum Umweltschutz und zur Nachhaltigkeit ergreifen
  q | Ergebnisse von Inspektions- und Wartungsarbeiten bewerten und nach betrieblichen Vorgaben dokumentieren
GRUPPE A3 | Böden bearbeiten und pflegen | § 4 Absatz 2 Nummer 3 | 1.–18. Monat: 10 Wochen; 19.–36. Monat: 8 Wochen
  a | Standortinformationen recherchieren und rechtliche Regelungen für die Bearbeitung und Pflege von Böden einhalten
  b | Bodenprofile anlegen und Bodenaufbau erläutern
  c | Bodenproben entnehmen und Analyseergebnisse beurteilen
  d | Bodentypen, Bodenarten und Bodenbeschaffenheit bestimmen sowie Bodenzustand und Bodenfruchtbarkeit beurteilen
  e | boden- und kulturartenspezifische Bodenbearbeitung durchführen
  f | Folgerungen für die Nutzungsmöglichkeiten anhand von Standortfaktoren und Standortinformationen ableiten, dabei sich verändernde Umweltbedingungen berücksichtigen
  g | Maßnahmen zum schonenden Umgang mit Ressourcen, insbesondere Wasser, ergreifen
  h | Folgerungen für Bodengesundheit, Bodenfruchtbarkeit und Kulturführung ableiten
  i | vorbeugende Maßnahmen zur Vermeidung von Bodenschäden ergreifen sowie Bodenschäden feststellen und Maßnahmen zu deren Beseitigung einleiten
GRUPPE A4 | Nutzpflanzen anbauen | § 4 Absatz 2 Nummer 4 | 1.–18. Monat: 12 Wochen; 19.–36. Monat: 14 Wochen
  a | landwirtschaftliche Nutzpflanzen und deren Pflanzenteile bestimmen sowie deren Verwendungszwecke erläutern
  b | bei der landwirtschaftlichen Produktion vorkommende Begleitflora bestimmen
  c | Witterungsabläufe beobachten und dokumentieren
  d | betriebliche Abläufe an Witterungsbedingungen anpassen
  e | persönliche Schutzausrüstung für pflanzenbauliche Maßnahmen auswählen, überprüfen und einsetzen sowie weitere Maßnahmen zum Arbeits- und Gesundheitsschutz ergreifen
  f | Aussaat und Pflanzungen vorbereiten und durchführen
  g | Maßnahmen zur Vermeidung der Verschleppung von Schadorganismen ergreifen
  h | Betriebsstoffe und Hilfsstoffe für die Bestandsführung umweltgerecht lagern
  i | beim Anbau von Nutzpflanzen den Umweltschutz berücksichtigen
  j | Fruchtfolgen planen
  k | Saat- und Pflanzgut auswählen und deren Beschaffenheit prüfen
  l | Bestandsentwicklung beobachten und aufzeichnen, Schäden an Pflanzen und deren Ursachen feststellen sowie Maßnahmen für die Bestandsführung und -verbesserung ableiten
  m | Bedarf an Pflegemaßnahmen ermitteln und Pflegemaßnahmen durchführen
  n | Nährstoffkreisläufe beschreiben, Bedarf an Nährstoffen ermitteln und bedarfsgerechte Düngemaßnahmen durchführen
  o | Bedarf an Pflanzenschutzmaßnahmen ermitteln und Pflanzenschutzmaßnahmen durchführen
  p | Pflanzenbestände durch bedarfsgerechte Pflege-, Dünge- und Pflanzenschutzmaßnahmen unter Berücksichtigung der Wirkungen auf die Umwelt führen, dabei rechtliche Regelungen einhalten
  q | Emissionen und Stoffeinträge im Pflanzenbau beschreiben und Maßnahmen zur Reduktion ergreifen
GRUPPE A5 | Pflanzliche Erzeugnisse ernten und lagern | § 4 Absatz 2 Nummer 5 | 1.–18. Monat: 4 Wochen; 19.–36. Monat: 4 Wochen
  a | Erntezeitpunkt, insbesondere unter Berücksichtigung des Reifezustandes, Verwendungszweckes und der Qualitätsanforderungen, festlegen
  b | Ernte durchführen
  c | Erntegut bergen und transportieren
  d | Lagerfähigkeit von Erntegut feststellen und Erntegut für die Lagerung vorbereiten
  e | Maßnahmen zur Durchführung der Ernte sowie zur Lagerung und Verwertung von Erntegut planen
  f | Lagermöglichkeiten beurteilen, Erntegut lagern und Maßnahmen zum Vorratsschutz ergreifen, dabei rechtliche Regelungen, insbesondere zum Gefahrstoffrecht, beachten
  g | Quantität und Qualität von Ernteerträgen sowie deren Verwertbarkeit beurteilen
GRUPPE A6 | Nutztiere halten und versorgen | § 4 Absatz 2 Nummer 6 | 1.–18. Monat: 14 Wochen; 19.–36. Monat: 14 Wochen
  a | Anatomie, Physiologie und Verhalten von Tieren erläutern
  b | Tiere, insbesondere unter Beachtung von Rasse- und Zuchtstandards, beurteilen
  c | Anforderungen an Haltung und Wohlergehen von Tieren beschreiben, insbesondere rechtliche und betriebliche Regelungen einhalten
  d | persönliche Schutzausrüstung für den Umgang mit Tieren auswählen, überprüfen und einsetzen sowie weitere Maßnahmen zum Arbeits- und Gesundheitsschutz ergreifen
  e | Tiere beobachten, Verhaltensänderungen feststellen und Maßnahmen ergreifen
  f | mit Tieren stressarm umgehen, insbesondere Tiere ansprechen sowie unter Beachtung der Arbeitssicherheit führen und bewegen
  g | Futtermittel bestimmen und beurteilen, insbesondere nach Inhaltsstoffen, Aussehen, Geruch und Konsistenz sowie deren Qualität und Einsatzmöglichkeiten beschreiben
  h | Tiere füttern und tränken, dabei Fütterungs- und Tränkeeinrichtungen bedienen und überwachen
  i | Stallungen und deren Einrichtungen reinigen und desinfizieren
  j | Tiere aufstallen sowie Haltungsklima überwachen und steuern
  k | Tiere pflegen und Hygienemaßnahmen durchführen
  l | Schädlings- und Parasitenbefall feststellen und Bekämpfungsmaßnahmen einleiten
  m | Maßnahmen zur Vermeidung von und zum Schutz vor übertragbaren Krankheiten und Tierseuchen ergreifen
  n | bei der Behandlung kranker Tiere mitwirken
  o | Jungtiere aufziehen
  p | Abfälle und Abwässer einer umweltschonenden Entsorgung zuführen
  q | Tierbestände erfassen und Bestandsverzeichnisse führen
  r | Zuchtziele und Zuchtverfahren erläutern und beurteilen
  s | Tiergesundheit und Wohlbefinden systematisch überwachen, Krankheitsanzeichen und atypisches Verhalten feststellen sowie Maßnahmen ergreifen
  t | Futterrationen berechnen, zusammenstellen und bewerten sowie Futteraufwand feststellen
  u | Bestände an Futtermitteln und Zusatzstoffen erfassen, bevorraten, qualitätserhaltend lagern und bei Abweichungen Maßnahmen ergreifen
  v | Vorgänge der Reproduktion erkennen, beschreiben und Maßnahmen ergreifen
  w | Maßnahmen der Geburtshilfe oder zum Schlupf durchführen
  x | Einfluss von Fütterung, Haltung und Erbanlagen auf Gesundheit und Leistung beurteilen
  y | rechtliche und betriebliche Regelungen einhalten, insbesondere im Bereich Tierhaltung, Futtermittel und Tiergesundheit sowie zum Gefahrstoffrecht
  z | Umweltschutz bei der Tierhaltung beachten, insbesondere organische Rückstände der tierischen Erzeugung nach den Grundsätzen der Kreislaufwirtschaft wirtschaftlich und umweltgerecht verwerten
  aa | Emissionen und Stoffeinträge aus der Tierhaltung beschreiben und Maßnahmen zur Reduktion ergreifen
GRUPPE A7 | Nutztiere und tierische Produkte erzeugen | § 4 Absatz 2 Nummer 7 | 1.–18. Monat: 12 Wochen; 19.–36. Monat: 12 Wochen
  a | Tiere oder tierische Produkte erzeugen
  b | Tiere oder tierische Produkte für die Vermarktung vorbereiten
  c | Transportfähigkeit feststellen und den Transport von Tieren unter Beachtung rechtlicher Regelungen durchführen
  d | persönliche Schutzausrüstung auswählen, überprüfen und einsetzen sowie weitere Maßnahmen zum Arbeits- und Gesundheitsschutz ergreifen
  e | Leistungen von Tieren feststellen und vergleichen
  f | Nutzungszeitpunkt unter Berücksichtigung des Verwertungszweckes und der Qualitätsanforderungen festlegen
  g | Qualität von Tieren und tierischen Erzeugnissen beurteilen
GRUPPE A8 | Qualitätssichernde Maßnahmen durchführen | § 4 Absatz 2 Nummer 8 | 19.–36. Monat: 4 Wochen
  a | Ziele, Aufgaben und Organisation von betrieblicher Qualitätssicherung erläutern
  b | prozess- und produktbezogene Standards zur Qualitätssicherung anwenden
  c | prozess- und produktbezogene Daten zur Qualitätssicherung auswerten
  d | Ursachen von Qualitätsmängeln und Fehlern systematisch identifizieren sowie Maßnahmen zur Beseitigung ergreifen
  e | Dokumentationen, insbesondere unter Einhaltung rechtlicher Regelungen und Berücksichtigung betrieblicher Vorgaben, erstellen
  f | zur kontinuierlichen Verbesserung von Prozessen und Produkten im eigenen Arbeitsbereich beitragen
GRUPPE A9 | Bei der Vermarktung von landwirtschaftlichen Erzeugnissen mitwirken | § 4 Absatz 2 Nummer 9 | 1.–18. Monat: 2 Wochen; 19.–36. Monat: 4 Wochen
  a | an betrieblicher Außendarstellung mitwirken
  b | am Verkauf landwirtschaftlicher Erzeugnisse mitwirken
  c | betriebliche Ausrichtung und Standortfaktoren bei der Planung von Vermarktungsmaßnahmen berücksichtigen
  d | Vermarktungswege und Vermarktungsformen einschätzen und Alternativen aufzeigen
  e | landwirtschaftliche Erzeugnisse anhand von Qualitätsmerkmalen für die Vermarktung vorbereiten
GRUPPE A10 | Marktwirtschaftliche Zusammenhänge erfassen und Geschäftsvorgänge abwickeln | § 4 Absatz 2 Nummer 10 | 1.–18. Monat: 2 Wochen; 19.–36. Monat: 4 Wochen
  a | Bestellungen annehmen, prüfen und dokumentieren sowie bei Abweichungen Maßnahmen ergreifen
  b | Verbrauch von Betriebsstoffen und Hilfsstoffen ermitteln und dokumentieren sowie Verfügbarkeit prüfen und bei Abweichungen Maßnahmen ergreifen
  c | Bestellungen durchführen und Liefertermine überwachen
  d | Rechnungen für landwirtschaftliche Erzeugnisse prüfen
  e | betrieblichen Schriftverkehr durchführen
  f | Marktpreisentwicklungen beobachten und bewerten
  g | Marktwert von betrieblichen Leistungen und betrieblichen Erzeugnissen ermitteln
  h | weitere betriebliche Einkommensquellen aufzeigen
  i | Bedeutung von betrieblichen Kooperationen für den Betriebserfolg erläutern
  j | an der Ermittlung von betrieblichen Kosten- und Leistungsdaten mitwirken und Schlussfolgerungen für das betriebliche Handeln ableiten
  k | Rechnungen für landwirtschaftliche Erzeugnisse erstellen
  l | Angebotsinformationen einholen, vergleichen und bewerten sowie Angebote auswählen
ABSCHNITT B | Integrativ zu vermittelnde Fertigkeiten, Kenntnisse und Fähigkeiten
GRUPPE B1 | Organisation des Ausbildungsbetriebes, Berufsbildung sowie Arbeits- und Tarifrecht | § 4 Absatz 3 Nummer 1 | während der gesamten Ausbildung
  a | den Aufbau und die grundlegenden Arbeits- und Geschäftsprozesse des Ausbildungsbetriebes erläutern
  b | Rechte und Pflichten aus dem Ausbildungsvertrag sowie Dauer und Beendigung des Ausbildungsverhältnisses erläutern und Aufgaben der im System der dualen Berufsausbildung Beteiligten beschreiben
  c | die Bedeutung, die Funktion und die Inhalte der Ausbildungsordnung und des betrieblichen Ausbildungsplans erläutern sowie zu deren Umsetzung beitragen
  d | die für den Ausbildungsbetrieb geltenden arbeits-, sozial-, tarif- und mitbestimmungsrechtlichen Vorschriften erläutern
  e | Grundlagen, Aufgaben und Arbeitsweise der betriebsverfassungs- oder personalvertretungsrechtlichen Organe des Ausbildungsbetriebes erläutern
  f | Beziehungen des Ausbildungsbetriebes und seiner Beschäftigten zu Wirtschaftsorganisationen und Gewerkschaften erläutern
  g | Positionen der eigenen Entgeltabrechnung erläutern
  h | wesentliche Inhalte von Arbeitsverträgen erläutern
  i | Möglichkeiten des beruflichen Aufstiegs und der beruflichen Weiterentwicklung erläutern
GRUPPE B2 | Sicherheit und Gesundheit bei der Arbeit | § 4 Absatz 3 Nummer 2 | während der gesamten Ausbildung
  a | Rechte und Pflichten aus den berufsbezogenen Arbeitsschutz- und Unfallverhütungsvorschriften kennen und diese Vorschriften anwenden
  b | Gefährdungen von Sicherheit und Gesundheit am Arbeitsplatz und auf dem Arbeitsweg prüfen und beurteilen
  c | sicheres und gesundheitsgerechtes Arbeiten erläutern
  d | technische und organisatorische Maßnahmen zur Vermeidung von Gefährdungen sowie von psychischen und physischen Belastungen für sich und andere, auch präventiv, ergreifen
  e | ergonomische Arbeitsweisen beachten und anwenden
  f | Verhaltensweisen bei Unfällen beschreiben und erste Maßnahmen bei Unfällen einleiten
  g | betriebsbezogene Vorschriften des vorbeugenden Brandschutzes anwenden, Verhaltensweisen bei Bränden beschreiben und erste Maßnahmen zur Brandbekämpfung ergreifen
GRUPPE B3 | Umweltschutz und Nachhaltigkeit | § 4 Absatz 3 Nummer 3 | während der gesamten Ausbildung
  a | Möglichkeiten zur Vermeidung betriebsbedingter Belastungen für Umwelt und Gesellschaft im eigenen Aufgabenbereich erkennen und zu deren Weiterentwicklung beitragen
  b | bei Arbeitsprozessen und im Hinblick auf Produkte, Waren oder Dienstleistungen Materialien und Energie unter wirtschaftlichen, umweltverträglichen und sozialen Gesichtspunkten der Nachhaltigkeit nutzen
  c | für den Ausbildungsbetrieb geltende Regelungen des Umweltschutzes einhalten
  d | Abfälle vermeiden sowie Stoffe und Materialien einer umweltschonenden Wiederverwertung oder Entsorgung zuführen
  e | Vorschläge für nachhaltiges Handeln für den eigenen Arbeitsbereich entwickeln
  f | unter Einhaltung betrieblicher Regelungen im Sinne einer ökonomischen, ökologischen und sozial nachhaltigen Entwicklung zusammenarbeiten und adressatengerecht kommunizieren
GRUPPE B4 | Digitalisierte Arbeitswelt | § 4 Absatz 3 Nummer 4 | während der gesamten Ausbildung
  a | mit eigenen und betriebsbezogenen Daten sowie mit Daten Dritter umgehen und dabei die Vorschriften zum Datenschutz und zur Datensicherheit einhalten
  b | Risiken bei der Nutzung von digitalen Medien und informationstechnischen Systemen einschätzen und bei deren Nutzung betriebliche Regelungen einhalten
  c | ressourcenschonend, adressatengerecht und effizient kommunizieren sowie Kommunikationsergebnisse dokumentieren
  d | Störungen in Kommunikationsprozessen erkennen und zu ihrer Lösung beitragen
  e | Informationen in digitalen Netzen recherchieren und aus digitalen Netzen beschaffen sowie Informationen, auch fremde, prüfen, bewerten und auswählen
  f | Lern- und Arbeitstechniken sowie Methoden des selbstgesteuerten Lernens anwenden, digitale Lernmedien nutzen und Erfordernisse des lebensbegleitenden Lernens erkennen und ableiten
  g | Aufgaben zusammen mit Beteiligten, einschließlich der Beteiligten anderer Arbeits- und Geschäftsbereiche, auch unter Nutzung digitaler Medien, planen, bearbeiten und gestalten
  h | Wertschätzung anderer unter Berücksichtigung gesellschaftlicher Vielfalt praktizieren
GRUPPE B5 | Berufliches Selbst- und Rollenverständnis | § 4 Absatz 3 Nummer 5 | 1.–18. Monat: 2 Wochen; 19.–36. Monat: 2 Wochen
  a | Vielfalt der beruflichen Rollen wahrnehmen und berufliches Selbstverständnis auf Grundlage der eigenen Werte und Ziele reflektieren
  b | Belastungssituationen und individuelle Grenzen erkennen sowie Maßnahmen zur Verbesserung der Arbeitssituation ergreifen
  c | Bedeutung landwirtschaftlicher Veranstaltungen und beruflicher Wettbewerbe sowie von Fortbildung und Weiterbildung erläutern
  d | Auswirkungen beruflichen Handelns im Zusammenwirken ökonomischer, ökologischer und sozialer Ziele erläutern
  e | Bedeutung von Lebensräumen und Artenvielfalt für Menschen, Tiere und Pflanzen sowie Einfluss der Landbewirtschaftung auf Ökosysteme erläutern und Maßnahmen zur Erhaltung und Verbesserung vorschlagen
  f | Landschaftselemente erhalten und Pflegemaßnahmen durchführen, insbesondere Feldraine, Hecken und Gehölze
GRUPPE B6 | Kommunikation und Kooperation | § 4 Absatz 3 Nummer 6 | 1.–18. Monat: 4 Wochen; 19.–36. Monat: 2 Wochen
  a | im Team wertschätzend, respektvoll und vertrauensvoll sowie zuverlässig arbeiten
  b | Diskriminierungen erkennen und zu einem gleichberechtigten Miteinander beitragen
  c | innerbetriebliche Gespräche unter Beachtung von Kommunikationsregeln lösungsorientiert führen, dabei Fachbegriffe anwenden
  d | betriebliche Informationssysteme nutzen
  e | betriebliche Software anwenden
  f | außerbetriebliche Gespräche unter Beachtung von Kommunikationsregeln adressatengerecht und situationsgerecht führen
  g | den Erzeuger-Verbraucher-Dialog mitgestalten
  h | Kooperationen benennen sowie deren Vor- und Nachteile beurteilen$plan$, true);
END $do$;

DROP FUNCTION public._a2_seed_plan(uuid, text, boolean);

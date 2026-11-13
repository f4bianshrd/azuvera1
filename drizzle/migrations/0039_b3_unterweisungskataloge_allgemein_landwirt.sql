-- Daten-Prompt B3: Unterweisungskataloge „allgemein“ und „landwirt“ (wiederholbar).
-- Die Daten stehen unverändert im Zeilenformat aus B3 Abschnitt 2; eine temporäre Hilfsfunktion schreibt sie mit
-- ON CONFLICT ... DO UPDATE in instruction_catalogs, instruction_topics und instruction_points.
CREATE FUNCTION public._seed_instruction_text(p_text text, p_sorts jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE l text; f text[]; v_cat uuid; v_topic uuid; v_tkey text; tn int := 0; pn int := 0; v_code text;
BEGIN
  FOREACH l IN ARRAY string_to_array(p_text, E'\n') LOOP
    CONTINUE WHEN l = '';
    IF l LIKE 'KATALOG %' THEN
      f := string_to_array(substr(l, 9), ' | ');
      IF array_length(f, 1) <> 5 THEN RAISE EXCEPTION 'KATALOG-Zeile ungültig: %', l; END IF;
      v_code := f[1];
      INSERT INTO public.instruction_catalogs (code, profession_id, title, subtitle, source, status, sort_order)
      VALUES (v_code, CASE WHEN f[2] = '-' THEN NULL ELSE (SELECT id FROM public.professions WHERE code = f[2]) END,
        f[3], nullif(f[4], '-'), nullif(f[5], '-'), 'published', (p_sorts ->> v_code)::int)
      ON CONFLICT (code) DO UPDATE SET profession_id = EXCLUDED.profession_id, title = EXCLUDED.title, subtitle = EXCLUDED.subtitle,
        source = EXCLUDED.source, status = EXCLUDED.status, sort_order = EXCLUDED.sort_order
      RETURNING id INTO v_cat;
      IF f[2] <> '-' AND NOT EXISTS (SELECT 1 FROM public.professions WHERE code = f[2]) THEN RAISE EXCEPTION 'Beruf % fehlt.', f[2]; END IF;
      tn := 0;
    ELSIF l LIKE 'THEMA %' THEN
      f := string_to_array(substr(l, 7), ' | ');
      IF array_length(f, 1) <> 6 OR f[5] NOT IN ('ja', 'nein') THEN RAISE EXCEPTION 'THEMA-Zeile ungültig: %', l; END IF;
      tn := tn + 1; pn := 0; v_tkey := f[1];
      INSERT INTO public.instruction_topics (catalog_id, key, title, category, legal_basis, interval_months, when_text, hint, is_optional, is_active, sort_order)
      VALUES (v_cat, v_tkey, f[2], f[3], nullif(f[6], '-'), nullif(f[4], '-')::int, NULL, NULL, f[5] = 'ja', true, tn)
      ON CONFLICT (catalog_id, key) DO UPDATE SET title = EXCLUDED.title, category = EXCLUDED.category, legal_basis = EXCLUDED.legal_basis,
        interval_months = EXCLUDED.interval_months, when_text = NULL, hint = NULL, is_optional = EXCLUDED.is_optional,
        is_active = true, sort_order = EXCLUDED.sort_order
      RETURNING id INTO v_topic;
    ELSIF l LIKE '  %' AND v_topic IS NOT NULL THEN
      pn := pn + 1;
      INSERT INTO public.instruction_points (topic_id, catalog_id, key, label, is_active, sort_order)
      VALUES (v_topic, v_cat, v_tkey || '-' || pn, substr(l, 3), true, pn)
      ON CONFLICT (catalog_id, key) DO UPDATE SET topic_id = EXCLUDED.topic_id, label = EXCLUDED.label, is_active = true, sort_order = EXCLUDED.sort_order;
    ELSE
      RAISE EXCEPTION 'Unbekannte Zeile: %', l;
    END IF;
  END LOOP;
END $fn$;

SELECT public._seed_instruction_text($az$KATALOG allgemein | - | Allgemeine Unterweisungen | Für alle Ausbildungsberufe | Rechtsgrundlagen: ArbSchG, JArbSchG, ArbStättV, BetrSichV, GefStoffV und PSA-Benutzungsverordnung sowie die Unfallverhütungsvorschriften des Unfallversicherungsträgers. Unterweisung vor Aufnahme der Tätigkeit und danach mindestens einmal jährlich, bei Jugendlichen unter 18 Jahren mindestens halbjährlich. Entwurf, Stand November 2026: Vor dem Einsatz fachlich prüfen lassen; verbindlich ist die Gefährdungsbeurteilung des Betriebs.
THEMA erstunterweisung | Erstunterweisung und Gefährdungen am Arbeitsplatz | Grundlagen | 12 | nein | § 12 ArbSchG, § 29 JArbSchG, Grundsätze der Prävention
  Rundgang durch den Betrieb: Arbeitsbereiche, Gefahrenstellen, Rettungs- und Fluchtwege
  Gefährdungen der eigenen Tätigkeiten und die Schutzmaßnahmen des Betriebs
  Betriebsanweisungen und Unfallverhütungsvorschriften: Fundort und Bedeutung
  Sicherheitskennzeichen: Gebots-, Verbots-, Warn- und Rettungszeichen
  Melden von Unfällen, Beinaheunfällen und Mängeln: wann und wem
  Betriebsregeln: Rauchverbot, Alkohol- und Drogenverbot, Handynutzung bei gefährlichen Arbeiten
  Ansprechpersonen: Ausbilder:in, Sicherheitsbeauftragte, Ersthelfer:innen, Fachkraft für Arbeitssicherheit
  Regeln für Jugendliche: Arbeitszeiten, verbotene gefährliche Arbeiten und Ausnahmen in der Ausbildung (§ 22 JArbSchG)
THEMA brandschutz | Brandschutz und Verhalten im Brandfall | Grundlagen | 12 | nein | § 10 ArbSchG, ArbStättV, ASR A2.2
  Fluchtwege, Notausgänge und Sammelstelle: Rundgang, Wege frei halten
  Standorte der Feuerlöscher und ihre Bedienung, möglichst mit praktischer Übung
  Alarmierung: Notruf 112, Alarmweg im Betrieb, Verhalten bei Alarm
  Brandgefahren im Betrieb: Heu, Stroh, Staub, Treibstoffe, Gas, Elektrik, Selbstentzündung
  Heiße Arbeiten (Schweißen, Trennschleifen) nur mit Freigabe und Löschmittel in Reichweite
  Rauchverbot, offenes Feuer und Brandschutzordnung des Betriebs
THEMA erste-hilfe | Erste Hilfe und Notruf | Grundlagen | 12 | nein | § 10 ArbSchG, Grundsätze der Prävention
  Notruf 112: wo, was, wie viele Verletzte, welche Verletzungen, Rückfragen abwarten
  Standorte von Verbandkasten, Augenspülung und Telefon; Eintrag ins Verbandbuch
  Ersthelfer:innen im Betrieb und Aushang mit den Notrufnummern
  Sofortmaßnahmen bei Bewusstlosigkeit, Atemstillstand und starker Blutung
  Verhalten bei Verletzungen durch Tiere, Maschinen, Gefahrstoffe und Stromschlag
  Meldung und Dokumentation von Unfällen; Auffrischung des Erste-Hilfe-Kurses alle 2 Jahre
THEMA psa | Persönliche Schutzausrüstung | Grundlagen | 12 | nein | § 3 PSA-Benutzungsverordnung, § 12 ArbSchG
  Welche Schutzausrüstung bei welcher Tätigkeit vorgeschrieben ist: Schuhe, Handschuhe, Brille, Gehörschutz, Atemschutz
  Richtig anlegen, anpassen und tragen; passende Größe und Anprobe
  Pflege, Reinigung, Lagerung und Prüfung vor jeder Benutzung
  Beschädigte oder abgelaufene Ausrüstung melden und ersetzen lassen
  Der Betrieb stellt die Schutzausrüstung kostenlos; sie muss bestimmungsgemäß getragen werden
THEMA gefahrstoffe | Gefahrstoffe und Betriebsanweisungen | Gefahrstoffe | 12 | nein | § 14 GefStoffV, CLP-Verordnung
  Gefahrenpiktogramme, Signalwörter sowie H- und P-Sätze lesen und verstehen
  Betriebsanweisung und Sicherheitsdatenblatt: Fundort und Inhalt
  Lagern, Kennzeichnen und Umfüllen, nie in Lebensmittel- oder Getränkebehälter
  Hautschutz, Handschuhauswahl und Hygiene; Essen und Trinken nur außerhalb des Arbeitsbereichs
  Verhalten bei Verschütten, Hautkontakt, Einatmen und Verschlucken; Giftnotruf
  Entsorgung von Resten und leeren Behältern
THEMA elektrik | Elektrische Anlagen und Geräte | Arbeitsmittel | 12 | nein | BetrSichV, Unfallverhütungsvorschrift zu elektrischen Anlagen
  Sichtprüfung vor jeder Benutzung: Kabel, Stecker, Gehäuse; defekte Geräte sofort sperren und melden
  Reparaturen an elektrischen Anlagen nur durch Elektrofachkräfte
  Verlängerungsleitungen und Kabeltrommeln: abrollen, nicht überlasten, im Feuchten nur geeignete Ausführung
  FI-Schutzschalter und Steckdosen im Freien und in Ställen
  Verhalten bei Stromunfall: Anlage abschalten, Eigenschutz, Notruf
  Abstand zu Freileitungen bei Arbeiten mit Maschinen, Leitern und Fahrzeugen
THEMA leitern | Leitern, Tritte und Absturzgefahr | Arbeitsmittel | 12 | nein | BetrSichV, TRBS 2121 Teil 2
  Leiter vor jeder Benutzung auf Mängel prüfen: Holme, Sprossen, Fußkappen
  Sicher aufstellen: fester Untergrund, Anstellwinkel 65 bis 75 Grad, gegen Wegrutschen und Umkippen sichern
  Dreipunktkontakt halten, nur leichte Werkzeuge mitnehmen, nicht seitlich hinauslehnen
  Absturzsicherung bei Dächern, Silos, Heuböden, Luken und Gerüsten beachten
  Nicht tragfähige Flächen nie betreten: Lichtplatten, Glas, Wellplatten
  Keine Leiterarbeiten bei starkem Wind, Nässe oder Eis
THEMA heben-tragen | Heben, Tragen und Körperhaltung | Gesundheitsschutz | 12 | nein | Lastenhandhabungsverordnung, § 22 JArbSchG
  Rückengerecht heben: Last nah am Körper, aus den Beinen heben, nicht verdrehen
  Hilfsmittel nutzen (Sackkarre, Hubwagen) und schwere Lasten zu zweit tragen
  Belastungsgrenzen kennen; Jugendliche nicht mit Arbeiten über ihrer Leistungsfähigkeit beschäftigen (§ 22 JArbSchG)
  Einseitige Belastung vermeiden, Pausen und Tätigkeitswechsel einplanen
  Rücken- und Gelenkbeschwerden früh melden
THEMA laerm-hitze-uv | Lärm, Hitze, Kälte und Sonnenschutz | Gesundheitsschutz | 12 | nein | Lärm- und Vibrations-Arbeitsschutzverordnung, § 5 ArbSchG
  Lärm: Gehörschutz ab 80 dB(A) bereitstellen und ab 85 dB(A) tragen; Lärmbereiche erkennen
  Hitze: viel trinken, Schattenpausen, leichte Kleidung, Warnzeichen für Hitzeerschöpfung und Hitzschlag
  Sonne: Kopfbedeckung, Sonnenschutzmittel, lange Kleidung, Mittagshitze meiden
  Kälte und Nässe: Kleidung in Schichten, Aufwärmpausen, Rutschgefahr bei Eis
  Zecken: Schutzkleidung, Absuchen nach der Arbeit, Impfschutz gegen FSME prüfen
THEMA strassenverkehr | Straßenverkehr und Fahrzeuge im Betrieb | Fahrzeuge | 12 | nein | StVO, StVZO, FeV
  Nur mit gültiger Fahrerlaubnis und Einweisung fahren
  Vor Fahrtantritt Beleuchtung, Bremsen, Reifen und Anhängerkupplung prüfen
  Zulässige Maße, Gewichte und Geschwindigkeiten einhalten; Ladung sichern
  Verschmutzung der Straße vermeiden, Gefahrenstellen absichern
  Kein Mobiltelefon am Steuer; keine Fahrt bei Müdigkeit, Alkohol oder Medikamenten
  Mitfahren nur auf zugelassenen Sitzplätzen und angeschnallt
THEMA umweltschutz | Umweltschutz und Abfälle | Umwelt | 12 | nein | Wasserhaushaltsgesetz, Kreislaufwirtschaftsgesetz, Düngeverordnung
  Betriebsstoffe, Öle, Reinigungs- und Pflanzenschutzmittel sicher lagern: dicht, verschlossen, Auffangwanne
  Bei Leckagen sofort Bindemittel einsetzen, Gewässer und Kanalisation schützen, Vorgesetzte informieren
  Abfälle trennen; Altöl, Batterien und Gefahrstoffe getrennt sammeln und entsorgen
  Abstände zu Gewässern bei Düngung und Pflanzenschutz beachten
  Boden schonen: nicht bei nassem Boden fahren, Verdichtung und Erosion vermeiden
THEMA alleinarbeit | Alleinarbeit und Notfallorganisation | Grundlagen | 12 | nein | § 5 ArbSchG, DGUV Regel 112-139
  Gefährliche Arbeiten nicht allein: Güllegruben, Baumfällung, elektrische Anlagen, Arbeit am schwierigen Tier
  Absprachen: wo, wie lange, wer ist erreichbar; Rückmeldung nach Abschluss
  Erreichbarkeit sicherstellen: Mobiltelefon mit Empfang oder Notsignalgerät
  Notrufnummern, Adresse des Einsatzortes und Rettungspunkte kennen
  Auszubildende nie ohne Aufsicht mit gefährlichen Arbeiten betrauen
KATALOG landwirt | landwirt | Unterweisungen Landwirt/in | Pflanzenbau und Tierhaltung | Rechtsgrundlagen: PflSchG, BetrSichV, GefStoffV, BioStoffV, TierSchG sowie die Unfallverhütungsvorschriften der SVLFG (zum Beispiel VSG 1.1). Stand November 2026. Entwurf: Vor dem Einsatz fachlich prüfen lassen; verbindlich ist die Gefährdungsbeurteilung des Betriebs.
THEMA schlepper | Schlepper und Anbaugeräte | Fahrzeuge und Maschinen | 12 | nein | BetrSichV, StVO, Vorschriften der SVLFG zu Zug- und Arbeitsmaschinen
  Auf öffentlichen Straßen nur mit Fahrerlaubnis (Klasse L oder T) fahren; im Betrieb nur nach Einweisung und Beauftragung
  Rundgang vor dem Start: Bremsen, Beleuchtung, Reifen, Schutzeinrichtungen, Flüssigkeitsstände
  Sicherheitsgurt anlegen, Überrollschutz nicht abbauen, Mitfahren nur auf einem zugelassenen Beifahrersitz
  Anbauen: Motor aus, Feststellbremse, niemand zwischen Schlepper und Gerät, Hydraulik drucklos
  Zapfwelle: Gelenkwelle mit vollständigem Schutz, Schutzkette, passende Drehzahl, Motor aus beim Abbauen
  Hang und Böschung: Geschwindigkeit anpassen, nicht quer zum Hang wenden, Kippgefahr
  Abstellen: Gerät absenken, Motor aus, Schlüssel abziehen, Feststellbremse
THEMA erntemaschinen | Erntemaschinen und Arbeitsmaschinen | Fahrzeuge und Maschinen | 12 | ja | BetrSichV, Betriebsanleitung des Herstellers
  Betriebsanleitung lesen und Einweisung durch eine unterwiesene Person
  Vor jedem Eingriff (Reinigen, Einstellen, Störung beheben): Antrieb und Motor aus, Schlüssel abziehen, Auslaufen abwarten
  Schutzeinrichtungen nie entfernen oder überbrücken; fehlende Verkleidungen sofort melden
  Einzugs- und Quetschstellen an Pressen, Häckslern, Mähdreschern und Ladewagen
  Hochgeklappte Teile und Schneidwerke gegen Absenken sichern
  Brandgefahr bei der Ernte: Staub und Ablagerungen entfernen, Feuerlöscher mitführen
THEMA pflanzenschutz | Pflanzenschutzmittel anwenden | Pflanzenbau | 12 | nein | Pflanzenschutzgesetz, Pflanzenschutz-Anwendungsverordnung, § 14 GefStoffV
  Anwendung nur mit Sachkundenachweis; Auszubildende nur unter Aufsicht einer sachkundigen Person
  Gebrauchsanleitung, Anwendungsbestimmungen und Auflagen lesen (zum Beispiel Abstände, Bienenschutz)
  Schutzausrüstung nach Gebrauchsanleitung tragen; Kleidung nach der Anwendung wechseln und reinigen
  Mittel nur in Originalbehältern lagern und transportieren; Lager verschlossen und gekennzeichnet
  Befüllen und Reinigen der Spritze so, dass nichts in Gewässer oder Abflüsse gelangt
  Wartezeiten, Wiederbetretungsfristen und Aufzeichnungen beachten
  Bei Vergiftungsverdacht: Giftnotruf und Notruf, Verpackung und Gebrauchsanleitung bereithalten
THEMA hoflader | Hoflader, Radlader und Teleskoplader | Fahrzeuge und Maschinen | 12 | ja | BetrSichV, Vorschriften der SVLFG, Betriebsanleitung des Herstellers
  Nur mit Einweisung und Beauftragung durch den Betrieb fahren
  Sichtprüfung vor dem Start: Reifen, Hydraulikschläuche, Gabeln oder Schaufel, Sicherheitsgurt
  Last tief tragen, Schwerpunkt und Tragfähigkeit beachten
  Nie unter angehobenen Lasten aufhalten; Schwenkbereich frei halten
  Auf Gefälle und Rampen geradeaus fahren und freie Sicht sichern
  Beim Verlassen Last absenken, Motor aus, Feststellbremse
THEMA rinder | Umgang mit Rindern | Tierhaltung | 12 | ja | Tierschutzgesetz, Tierschutz-Nutztierhaltungsverordnung
  Verhalten und Fluchtdistanz der Tiere kennen; ruhig und sichtbar annähern
  Nie zwischen Tier und Wand oder Gitter stehen; Fluchtweg frei halten
  Besondere Vorsicht bei Bullen, Kühen mit Kalb und frisch abgekalbten Tieren
  Fixieren, Treiben und Verladen mit geeigneten Einrichtungen (Fanggitter, Treibgang)
  Klauenpflege, Kalbung und Behandlungen nur nach Anleitung und mit Hilfsperson
  Feste Schuhe, tiergerechter Umgang und Tierschutz
THEMA schwein-gefluegel | Umgang mit Schweinen und Geflügel | Tierhaltung | 12 | ja | Tierschutzgesetz, Tierschutz-Nutztierhaltungsverordnung, BioStoffV
  Umgang mit Sauen, Ebern und Ferkeln: Bisse und Quetschungen vermeiden, Treibebrett nutzen
  Stallluft: Staub, Ammoniak und Endotoxine; Atemschutzmaske (FFP2) bei staubigen Arbeiten
  Hygiene: Händewaschen, Stallkleidung und -schuhe, Zoonosen wie Salmonellen
  Arbeiten an Güllekanälen und Spaltenböden: Gasgefahr und Absturz, nur mit Sicherung
  Geflügel: Fangen und Verladen, Federn und Staub, Hitzebelastung im Stall
  Kranke Tiere erkennen und melden; Tötung nur durch sachkundige Personen
THEMA guelle-biogas | Gülle, Gärreste und Biogasanlagen | Gefahrstoffe | 12 | ja | BioStoffV, GefStoffV, Vorschriften der SVLFG
  Gülle setzt Schwefelwasserstoff, Ammoniak, Methan und Kohlendioxid frei; schon wenige Atemzüge können tödlich sein
  Beim Rühren und Entleeren lüften, Tiere ausstallen, Abstand zu offenen Gruben halten
  Gruben, Schächte und Behälter nie betreten; Rettung nie ohne umluftunabhängigen Atemschutz und Sicherung
  Abdeckungen und Absperrungen an Gruben geschlossen halten, Unbefugte fernhalten
  Biogasanlagen nur unterwiesen und mit Erlaubnis betreten; Explosionsschutz, kein offenes Feuer
  Rührwerke und Pumpen: Antriebe sichern, Gelenkwellen mit Schutz
THEMA silo-lager | Silos, Getreidelager und Futterlager | Lagerung | 12 | ja | BetrSichV, Vorschriften der SVLFG
  Silos und Getreidelager nie allein und nie ohne Sicherung betreten: Verschüttung und Einsinken im Schüttgut
  Gärgase in Silos (Kohlendioxid, Stickoxide): lüften, in den ersten Wochen nach dem Befüllen nicht betreten
  Fahrsilo: senkrechter Anschnitt, nie unter überhängender Silage arbeiten, Absturzkante sichern
  Silofolien und Netze: Absturzgefahr beim Abdecken und Beschweren
  Staub in Getreide- und Futterlagern: Atemschutz, Staubexplosionen vermeiden
  Ballenstapel und Palettenlager: Standsicherheit prüfen, nicht klettern
THEMA motorsaege | Motorsäge und Waldarbeit | Forst | 12 | ja | DGUV Regel 114-018, DGUV Information 214-059, BetrSichV
  Motorsägenarbeiten nur nach Lehrgang oder unter Aufsicht einer qualifizierten Person
  Schutzausrüstung: Schutzhelm mit Visier und Gehörschutz, Schnittschutzhose, Schnittschutzstiefel, Handschuhe
  Vor dem Start prüfen: Kettenbremse, Kettenspannung, Gashebelsperre, Tankverschluss, Griffe
  Rückschlag vermeiden, sicher stehen, Abstand zu anderen Personen halten
  Fällen nur mit Fachkunde: Fallrichtung, Rückweichen, Hänger, Sicherheitsabstand von zwei Baumlängen
  Nicht allein arbeiten; Erste-Hilfe-Material und Notrufmöglichkeit mitführen
THEMA elektrozaun | Weidezäune und Elektrozaungeräte | Weide | 12 | ja | DIN EN 60335-2-76, BetrSichV
  Nur zugelassene Weidezaungeräte verwenden; Kontrollleuchte und Anschlüsse prüfen
  Elektrozäune mit Warnschildern kennzeichnen; Abstand zu Freileitungen halten
  Keine Verbindung zu Stacheldraht oder Maschendraht; nur isolierte Verbindungen und Weidezaunmaterial
  Vor Arbeiten am Zaun (Reparatur, Mähen) das Gerät ausschalten
  Bei Gewitter Arbeiten am Zaun unterbrechen
  Weidetore und Übergänge für Menschen sicher gestalten
THEMA tierseuchen | Tierseuchen, Biosicherheit und Hygiene | Tiergesundheit | 12 | ja | Tiergesundheitsgesetz, Schweinehaltungshygieneverordnung, Geflügelpest-Verordnung, BioStoffV
  Hygieneschleuse: Kleidung und Schuhe wechseln, Hände waschen und desinfizieren
  Betriebsfremde Personen und Fahrzeuge fernhalten; Besucherbuch führen
  Krankheitsanzeichen und Todesfälle sofort melden; Tierarzt informieren
  Bei Seuchenverdacht: Tierbewegungen stoppen und Anweisungen des Veterinäramts befolgen
  Reinigung und Desinfektion nach Plan; Mittel und Einwirkzeit beachten
  Zoonosen kennen und sich schützen (Salmonellen, Q-Fieber, Leptospirose)
THEMA melkanlage-chemie | Melkanlage und Reinigungsmittel | Tierhaltung | 12 | ja | GefStoffV, BioStoffV, Tierschutzgesetz
  Melkroutine und Melkhygiene: Handschuhe, saubere Zitzen, Dippmittel
  Säuren und Laugen zur Reinigung nur nach Betriebsanweisung verwenden und nie mischen
  Augen- und Hautschutz tragen; Augenspülung im Melkstand bereithalten
  Verhalten der Kühe im Melkstand: nicht hinter dem Tier stehen, Tritte vermeiden, Fluchtweg
  Elektrische Anlagen im Feuchtbereich: defekte Geräte melden, nicht selbst reparieren
  Rutschgefahr auf nassen Böden: rutschfeste Schuhe$az$, '{"allgemein":1,"landwirt":2}'::jsonb);

DROP FUNCTION public._seed_instruction_text(text, jsonb);

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.code, count(DISTINCT t.id) AS topics, count(p.id) AS points
             FROM public.instruction_catalogs c LEFT JOIN public.instruction_topics t ON t.catalog_id = c.id
             LEFT JOIN public.instruction_points p ON p.topic_id = t.id
            WHERE c.code IN ('allgemein', 'landwirt') GROUP BY c.code ORDER BY c.code LOOP
    RAISE NOTICE 'Katalog %: % Themen, % Punkte', r.code, r.topics, r.points;
  END LOOP;
END $$;
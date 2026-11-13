-- Daten-Prompt B4: Unterweisungskataloge „gaertner“ und „pferdewirt“ (wiederholbar), gleiches Zeilenformat wie B3.
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
      IF f[2] <> '-' AND NOT EXISTS (SELECT 1 FROM public.professions WHERE code = f[2]) THEN RAISE EXCEPTION 'Beruf % fehlt.', f[2]; END IF;
      INSERT INTO public.instruction_catalogs (code, profession_id, title, subtitle, source, status, sort_order)
      VALUES (v_code, CASE WHEN f[2] = '-' THEN NULL ELSE (SELECT id FROM public.professions WHERE code = f[2]) END,
        f[3], nullif(f[4], '-'), nullif(f[5], '-'), 'published', (p_sorts ->> v_code)::int)
      ON CONFLICT (code) DO UPDATE SET profession_id = EXCLUDED.profession_id, title = EXCLUDED.title, subtitle = EXCLUDED.subtitle,
        source = EXCLUDED.source, status = EXCLUDED.status, sort_order = EXCLUDED.sort_order
      RETURNING id INTO v_cat;
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

SELECT public._seed_instruction_text($az$KATALOG gaertner | gaertner | Unterweisungen Gärtner/in | Gartenbau, Garten- und Landschaftsbau | Rechtsgrundlagen: PflSchG, Düngeverordnung, BetrSichV, GefStoffV sowie die Unfallverhütungsvorschriften der SVLFG. Stand November 2026. Entwurf: Vor dem Einsatz fachlich prüfen lassen; verbindlich ist die Gefährdungsbeurteilung des Betriebs.
THEMA pflanzenschutz-duenger | Pflanzenschutzmittel und Dünger | Pflanzenschutz und Dünger | 12 | nein | Pflanzenschutzgesetz, Pflanzenschutz-Anwendungsverordnung, § 14 GefStoffV, Düngeverordnung
  Anwendung nur mit Sachkundenachweis; Auszubildende nur unter Aufsicht einer sachkundigen Person
  Gebrauchsanleitung, Anwendungsbestimmungen, Wartezeiten und Auflagen beachten (zum Beispiel Bienenschutz, Gewässerabstände)
  Schutzausrüstung nach Gebrauchsanleitung tragen; Arbeitskleidung nach der Anwendung wechseln und reinigen
  Mittel und Dünger nur in Originalbehältern lagern; Lager verschlossen und gekennzeichnet, getrennt von Lebensmitteln
  Dünger: Hautkontakt und Staub vermeiden; Ammoniumnitrat und brandfördernde Stoffe getrennt lagern
  Im Gewächshaus: lüften, Wiederbetretungsfristen einhalten, behandelte Flächen kennzeichnen
  Bei Vergiftungsverdacht: Giftnotruf und Notruf, Gebrauchsanleitung bereithalten
THEMA handmaschinen | Handgeführte Maschinen und Kleingeräte | Maschinen | 12 | nein | BetrSichV, Lärm- und Vibrations-Arbeitsschutzverordnung, Betriebsanleitung
  Rasenmäher, Freischneider, Heckenschere, Laubbläser, Trennschleifer: Betriebsanleitung lesen und Einweisung
  Sichtprüfung vor dem Start; Schutzeinrichtungen nie entfernen; Schneidwerkzeuge nur bei stillstehendem Motor wechseln oder reinigen
  Schutzausrüstung: Schutzbrille oder Visier, Gehörschutz, feste Schuhe, lange Hose; beim Freischneider Helm mit Visier
  Steinschlag, Rückschlag und Funkenflug: Abstand zu Personen, Fahrzeugen und Fenstern
  Kraftstoff nur bei ausgeschaltetem Motor und im Freien nachfüllen, nur in zugelassenen Behältern
  Vibration und Lärm: Pausen, Tätigkeitswechsel, Gehörschutz
  Aufsitzmäher: nicht quer am Hang fahren, keine Mitfahrer
THEMA giftpflanzen-haut | Giftpflanzen, Hautschutz und Allergien | Gesundheitsschutz | 12 | nein | GefStoffV, TRGS 401, Hautschutzplan des Betriebs
  Giftige und hautreizende Pflanzen erkennen, zum Beispiel Eisenhut, Engelstrompete, Goldregen, Wolfsmilch, Riesen-Bärenklau
  Riesen-Bärenklau: Hautkontakt vermeiden, bei Sonne Haut bedecken (Verbrennungen durch Pflanzensaft und Licht)
  Handschuhe, Hautschutzmittel und Hautpflege nach Hautschutzplan; Latex- und Pollenallergien beachten
  Hautveränderungen und Atembeschwerden früh melden
  Impfschutz prüfen (Tetanus) und arbeitsmedizinische Vorsorge wahrnehmen
  Kinder und Tiere von giftigen Pflanzen und Pflanzenschutzmitteln fernhalten
THEMA gewaechshaus | Arbeiten im Gewächshaus | Arbeitsplatz | 12 | ja | ArbStättV, BetrSichV, GefStoffV
  Hitze und Feuchte: Trinkpausen, Lüften, leichte Kleidung, Zeiten hoher Belastung meiden
  Glasdächer und Folien nicht betreten; Dacharbeiten nur mit Absturzsicherung und tragfähigen Laufstegen
  Glasbruch: Schutzhandschuhe tragen, Bruch sofort entfernen oder absperren
  Elektrik in feuchter Umgebung: nur geeignete Geräte mit FI-Schutz, defekte Leitungen melden
  Heizungs- und Kohlendioxid-Düngeanlagen: Einweisung, Gefahr in geschlossenen Räumen
  Rutschgefahr auf nassen Wegen; Stolperstellen an Schläuchen und Heizrohren
THEMA schlepper-gartenbau | Schlepper und Anbaugeräte im Gartenbau | Maschinen | 12 | ja | BetrSichV, StVO, Vorschriften der SVLFG
  Auf öffentlichen Straßen nur mit Fahrerlaubnis (Klasse L oder T) fahren; im Betrieb nur nach Einweisung und Beauftragung
  Rundgang vor dem Start: Bremsen, Beleuchtung, Reifen, Schutzeinrichtungen
  Sicherheitsgurt anlegen; Mitfahren nur auf einem zugelassenen Beifahrersitz
  Anbaugeräte und Anhänger kuppeln: Motor aus, Feststellbremse, niemand zwischen Fahrzeug und Gerät
  Gelenkwelle nur mit vollständigem Schutz, passende Drehzahl, Motor aus beim Abbauen
  Enge Durchfahrten, Hänge und Böschungen: Geschwindigkeit anpassen, auf Personen achten
  Abstellen: Gerät absenken, Motor aus, Schlüssel abziehen, Feststellbremse
THEMA baumpflege-hoehe | Baumpflege und Arbeiten in der Höhe | Arbeiten in der Höhe | 12 | ja | DGUV Regel 112-198, BetrSichV, Vorschriften der SVLFG
  Baumarbeiten und Fällungen nur durch ausgebildete Personen; Auszubildende nur unter Aufsicht
  Seilklettertechnik nur mit Ausbildung und passender Ausrüstung: Gurt, Seile, Karabiner, Helm
  Hubarbeitsbühnen: Einweisung, Standsicherheit, Absturzsicherung im Korb, Abstand zu Freileitungen
  Leitern nur für kurze Arbeiten mit geringem Risiko und gesichert aufgestellt
  Motorsäge und Astschere: Schnittschutz, Rückschlag, nicht über Schulterhöhe sägen
  Gefahrenbereich unter dem Baum absperren; Verständigung und Zeichen vereinbaren
  Bei Sturm, Nässe und Eis keine Arbeiten am Baum
THEMA erdarbeiten | Erdarbeiten, Gräben und Bagger | Garten- und Landschaftsbau | 12 | ja | DIN 4124, BetrSichV
  Vor dem Graben Leitungen erkunden (Strom, Gas, Wasser, Telekommunikation) und Pläne einholen
  Gräben ab 1,25 m Tiefe böschen oder verbauen; nie in ungesicherte Gräben steigen
  Aushub mit Abstand zum Grabenrand lagern; Absturzsicherung an Gruben
  Minibagger und Radlader nur mit Einweisung; Standsicherheit, Schwenkbereich freihalten
  Verdichtungsgeräte: Lärm, Vibration, Abgase, Einweisung
  Baustellen absichern: Absperrung, Beschilderung, Schutz für Dritte
THEMA flurfoerderzeuge | Stapler, Hubwagen und Flurförderzeuge | Fahrzeuge und Maschinen | 12 | ja | BetrSichV, DGUV Grundsatz 308-001
  Nur mit Ausbildung, Beauftragung und Einweisung fahren
  Sichtprüfung vor Schichtbeginn: Gabeln, Hubmast, Reifen, Bremsen, Hupe, Beleuchtung
  Tragfähigkeit und Lastschwerpunkt beachten; Lasten tief und mit geneigtem Mast fahren
  Fahrwege frei halten, Fußgänger beachten, Geschwindigkeit anpassen
  Keine Personen auf der Gabel oder der Last heben
  Abstellen: Gabel absenken, Motor aus, Feststellbremse, Schlüssel abziehen
THEMA friedhof | Friedhofsgärtnerei und Grabpflege | Friedhofsgärtnerei | 12 | ja | DIN 4124, BetrSichV, Friedhofssatzung
  Gräber nur mit Verbau oder Böschung ausheben; Abstand zu benachbarten Gräbern
  Grabsteine und Einfassungen: Standsicherheit prüfen, schwere Teile nur mit Hebehilfen bewegen
  Heben und Tragen: Hilfsmittel nutzen, zu zweit arbeiten
  Rücksicht auf Trauernde: Ruhe halten, keine Maschinen bei Trauerfeiern
  Hygiene und Infektionsschutz bei Grabräumungen nach den Vorgaben des Betriebs
  Satzung des Friedhofs und Vorgaben der Verwaltung beachten
KATALOG pferdewirt | pferdewirt | Unterweisungen Pferdewirt/in | Pferdehaltung, Reiten und Zucht | Rechtsgrundlagen: TierSchG, BioStoffV, GefStoffV, BetrSichV, Tierschutztransportverordnung sowie die Vorschriften der SVLFG und die Leitlinien der Deutschen Reiterlichen Vereinigung (FN). Stand November 2026. Entwurf: Vor dem Einsatz fachlich prüfen lassen; verbindlich ist die Gefährdungsbeurteilung des Betriebs.
THEMA umgang-pferde | Sicherer Umgang mit Pferden | Umgang mit Pferden | 12 | nein | Tierschutzgesetz, Vorschriften der SVLFG zur Pferdehaltung
  Fluchttier-Verhalten kennen: Körpersprache, Ohrenspiel, Warnzeichen für Beißen, Schlagen und Steigen
  Pferd ansprechen und von der Seite annähern; nie direkt von hinten, an der Hinterhand Körperkontakt halten
  Führen: Strick und Zügel nie um die Hand wickeln; feste Schuhe und Handschuhe tragen
  Anbinden nur mit Panikhaken oder Sollbruchstelle an stabilen Ringen in Widerristhöhe
  Putzen, Hufe auskratzen, Decken auflegen: sicherer Standort, Fluchtweg, Hilfsperson
  Im Stall nicht zwischen Pferd und Wand oder Tür stehen; Boxentür sichern
  Pferde nie unbeaufsichtigt in der Stallgasse lassen; Hunde und Kinder fernhalten
THEMA reitsicherheit | Reitsicherheit und Schutzausrüstung | Reiten | 12 | nein | Vorschriften der SVLFG, Leitlinien der Deutschen Reiterlichen Vereinigung (FN)
  Reithelm nach geltender Norm bei jedem Reiten; Sicherheitsweste empfohlen
  Reitstiefel mit Absatz, Sicherheitssteigbügel, geprüfter Sattel, Gurt und Zaumzeug
  Hallen- und Platzregeln: Abstand, Hufschlag, Anmelden beim Betreten, Tür schließen
  Ausritt und Straße: Verkehrsregeln, Reiten in der Gruppe, Reflektoren, Handy für Notfälle
  Junge oder schwierige Pferde nur nach Absprache und unter Aufsicht reiten
  Nach einem Sturz erst untersuchen lassen; nach einer Kopfverletzung nicht weiterreiten
THEMA longieren-bodenarbeit | Longieren und Bodenarbeit | Ausbildung der Pferde | 12 | nein | Tierschutzgesetz, Leitlinien der Deutschen Reiterlichen Vereinigung (FN)
  Ausrüstung: Longe, Longierpeitsche, Longiergurt, Ausbindezügel, Handschuhe, Helm
  Sicherer Standort mit Abstand zur Hinterhand; Longe nie um die Hand wickeln
  Zirkel oder Halle mit geschlossenem Zugang; Hilfsperson bei jungen Pferden
  Geht das Pferd durch oder steigt es: Longe loslassen, nicht festhalten
  Bodenarbeit und Freispringen: Abstand und Fluchtweg; nicht auf nassem oder vereistem Boden
  Überforderung, Ermüdung und Schmerzzeichen erkennen
THEMA hufpflege | Hufpflege und Hufbeschlag | Pferdepflege | 12 | nein | Tierschutzgesetz, BetrSichV
  Huf aufnehmen: Körperkontakt halten, Bein richtig fassen, Pferd gut festhalten lassen
  Hufmesser, Raspel und Zange: Schnittschutz, Handschuhe, Schutzbrille
  Beim Hufschmied oder Hufpfleger: Hilfsperson, Pferd ruhig halten, nie unbeaufsichtigt
  Beschlagene Hufe: Verletzungsgefahr bei Tritten und beim Entfernen der Eisen
  Hufprobleme erkennen (Hufabszess, Strahlfäule) und melden
  Mittel zur Hufpflege nur nach Betriebsanweisung verwenden
THEMA stall-staub | Stall, Staub, Heu und Brandschutz | Stallarbeit | 12 | nein | GefStoffV, BioStoffV, Brandschutzordnung
  Staub, Schimmel und Sporen in Heu, Stroh und Einstreu: Atemschutz (FFP2) bei Staub und Schimmel
  Heu und Stroh trocken lagern; Selbstentzündung von feuchtem Heu vermeiden
  Stallluft: Lüftung, Ammoniak, Mistlagerung und Entmistung
  Brandschutz im Stall: Rauchverbot, Elektrik, Fluchtwege für Pferde, Löschmittel
  Mist und Stallreinigung: Rutschgefahr, Hautschutz, Handschuhe
  Futterlager und Silos: Absturz- und Einsturzgefahr, Staubexplosion
THEMA weide-zaun | Weide, Koppel und Zäune | Weidehaltung | 12 | nein | Tierschutzgesetz, BetrSichV, DIN EN 60335-2-76
  Zäune und Tore täglich kontrollieren: Draht, Litze, Isolatoren, Pfähle, Verschlüsse
  Elektrozaun nur mit zugelassenen Geräten und Warnschildern; Gerät vor Arbeiten am Zaun ausschalten
  Giftpflanzen auf der Weide erkennen (zum Beispiel Jakobskreuzkraut, Eibe, Robinie) und entfernen
  Herdenmanagement: Rangordnung, Eingewöhnung neuer Pferde, Streit und Verletzungen vermeiden
  Pferde einfangen: Halfter, Hilfsperson, nie in die Herde hineinlaufen
  Schutz bei Hitze, Regen und Insekten; Wasserstelle und Unterstand prüfen
THEMA notfaelle | Notfälle bei Pferd und Reiter | Notfälle | 12 | nein | § 10 ArbSchG, Tierschutzgesetz
  Notfallplan: Telefonnummern von Tierarzt, Rettungsdienst und Betriebsleitung; Adresse für Rettungsfahrzeuge
  Kolik, Verletzungen und Hufrehe erkennen, Tierarzt rufen, Pferd nicht allein lassen
  Unfall mit Reiter: Rettungskette, Erste Hilfe, Helm nur bei Not abnehmen, Pferd sichern
  Stallbrand: Alarm, Pferde sofort ins Freie, Halfter griffbereit, nie zurück ins Feuer
  Ausbruch und freilaufende Pferde: Straße sichern, Polizei verständigen
  Einschläfern nur durch den Tierarzt; Umgang mit verstorbenen Tieren
THEMA hygiene-zoonosen | Hygiene und Zoonosen | Gesundheitsschutz | 12 | nein | BioStoffV, TRBA 230, Infektionsschutzgesetz
  Zoonosen kennen (Salmonellen, Leptospirose, Hautpilz, Borreliose, Tetanus) und ihre Infektionswege
  Händewaschen und Hautschutz nach dem Umgang mit Tieren und vor Essen und Trinken; kein Essen im Stall
  Schutzkleidung, Handschuhe und Atemschutz bei kranken Tieren und bei Geburten
  Kratzer, Bisse und Hautverletzungen reinigen, versorgen und melden
  Impfschutz (Tetanus) prüfen und arbeitsmedizinische Vorsorge wahrnehmen
  Reinigung und Desinfektion von Putzzeug, Sätteln und Stallgeräten nach Plan
THEMA fahren-gespann | Fahren und Gespanne | Fahren | 12 | ja | Straßenverkehrs-Ordnung, Leitlinien der Deutschen Reiterlichen Vereinigung (FN)
  Anspannen nur mit Hilfsperson und nach Einweisung; Geschirr, Wagen und Bremsen prüfen
  Pferd ruhig halten; Zugstränge und Leinen in der richtigen Reihenfolge anlegen und lösen
  Fahren auf Wegen und Straße: Verkehrsregeln, Warnweste, Beleuchtung am Wagen
  Gefahren durch Durchgehen, Scheuen und Kippen; Verhalten bei Unfall
  Auf- und Absteigen nur im Stand
  Kinder und Zuschauer in sicherem Abstand zum Gespann halten
THEMA zucht-hengste | Zucht, Hengste und Fohlen | Zucht | 12 | ja | Tierschutzgesetz, Tierzuchtgesetz, Vorschriften der SVLFG
  Umgang mit Hengsten nur durch erfahrene Personen; sichere Boxen und Paddocks, Türen doppelt sichern
  Decken und Besamung: Einweisung, Hilfspersonen, geschützter Bereich mit Fluchtwegen
  Stuten mit Fohlen: Abwehrverhalten, Abstand halten, nie zwischen Stute und Fohlen stehen
  Fohlengeburt: Hygiene, Geburtshilfe nur nach Anleitung, rechtzeitig Tierarzt rufen
  Absetzen, Gewöhnung und Erstausbildung der Fohlen mit Geduld und Hilfsperson
  Zoonosen und Hygiene bei Geburt und Besamung beachten
THEMA verladen-transport | Verladen und Transport von Pferden | Transport | 12 | ja | Tierschutztransportverordnung, Verordnung (EG) Nr. 1/2005, StVO
  Anhänger und Transporter prüfen: Boden, Rampe, Trennwände, Anschlüsse, Bremsen
  Verladen ruhig und mit Hilfsperson; Rampe rutschsicher; Pferd mit Halfter und Strick führen
  Gespann richtig kuppeln; Führerscheinklasse und zulässige Gesamtmasse beachten
  Fahrt vorausschauend, gleichmäßig und mit Pausen; Wasser und Kontrolle der Tiere
  Ladung und Pferde gegen Verrutschen sichern
  Gewerblicher Transport nur mit Befähigungsnachweis und Genehmigung
THEMA rennsport | Rennsport und Training auf der Bahn | Rennsport | 12 | ja | Rennordnung, Vorschriften der SVLFG
  Schutzausrüstung: Rennhelm, Rückenprotektor, Handschuhe, Brille
  Startmaschine oder Startbox: Einweisung, Verhalten beim Start, Hilfsperson
  Bahnregeln: Richtung, Abstände, Überholen und Verhalten bei Zwischenfällen
  Pferde im Galopp und im Rennen: Ermüdung und Lahmheit erkennen
  Aufwärmen, Abkühlen und Pflege nach Training und Rennen
  Dopingregeln und Medikationskontrollen kennen$az$, '{"gaertner":3,"pferdewirt":4}'::jsonb);

DROP FUNCTION public._seed_instruction_text(text, jsonb);

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.code, count(DISTINCT t.id) AS topics, count(p.id) AS points
             FROM public.instruction_catalogs c LEFT JOIN public.instruction_topics t ON t.catalog_id = c.id
             LEFT JOIN public.instruction_points p ON p.topic_id = t.id
            WHERE c.code IN ('gaertner', 'pferdewirt') GROUP BY c.code ORDER BY c.code LOOP
    RAISE NOTICE 'Katalog %: % Themen, % Punkte', r.code, r.topics, r.points;
  END LOOP;
END $$;
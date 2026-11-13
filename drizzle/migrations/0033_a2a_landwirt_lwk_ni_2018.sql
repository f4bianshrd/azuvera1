-- Daten-Prompt A2a: Landwirt/in, bisherige Fassung (LWK Niedersachsen, Stand März 2018)

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
  VALUES (v_prof, 'landwirt-lwk-ni-2018', $t$Ausbildungsplan Landwirt/in (bisher)$t$, $t$Landwirtschaftskammer Niedersachsen$t$, $t$Ausbildungsplan Landwirt/in der Landwirtschaftskammer Niedersachsen, Stand März 2018$t$, NULL, DATE '2027-07-31', 3, false, 'published', 1)
  ON CONFLICT (code) DO UPDATE SET profession_id = EXCLUDED.profession_id, title = EXCLUDED.title,
    subtitle = EXCLUDED.subtitle, source = EXCLUDED.source, valid_from = EXCLUDED.valid_from,
    valid_until = EXCLUDED.valid_until, duration_years = EXCLUDED.duration_years,
    is_template = EXCLUDED.is_template, status = EXCLUDED.status, sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_plan;
  PERFORM public._a2_seed_plan(v_plan, $plan$ABSCHNITT zweige_pflanze | Betriebszweige Pflanzenproduktion | checklist | Die Ausbildung muss in mindestens zwei Betriebszweigen über jeweils ein Jahr nachgewiesen werden.
GRUPPE zweige | Betriebszweige Pflanzenproduktion
  p_a | a) Getreidebau
  p_b | b) Zuckerrübenbau
  p_c | c) Kartoffelbau
  p_d | d) Körnermaisbau
  p_e | e) Ölfrüchtebau
  p_f | f) Hülsenfrüchtebau
  p_g | g) Ackerfutterbau / Silomais
  p_h | h) Grünland und Ackergras
  p_i | i) Waldbau
  p_j | j) Gemüsebau
  p_k | k) Sonstiges
ABSCHNITT zweige_tier | Betriebszweige Tierproduktion | checklist | Mindestens zwei Betriebszweige über je ein Jahr; einer davon muss Fortpflanzung (Geburt und Aufzucht) beinhalten.
GRUPPE zweige | Betriebszweige Tierproduktion
  t_l | l) Milchviehhaltung
  t_m | m) Rinderaufzucht oder Rindermast
  t_n | n) Sauenhaltung und Ferkelerzeugung
  t_o | o) Schweineaufzucht oder Schweinemast
  t_p | p) Legehennenhaltung
  t_q | q) Geflügelaufzucht oder Geflügelmast
  t_r | r) Schafhaltung mit Nachzucht
  t_s | s) Schafhaltung ohne Nachzucht
  t_t | t) Pferdehaltung mit Nachzucht
  t_u | u) Pferdehaltung ohne Nachzucht
  t_v | v) Mutterkuhhaltung
  t_w | w) Wildtierhaltung
  t_z | z) Sonstiges
ABSCHNITT pflanze | 1. Pflanzenproduktion
GRUPPE vorplanung | Vorplanung
  pf.v.1 | Fruchtfolge festlegen
  pf.v.2 | Sortenwahl vornehmen
GRUPPE boden | Bodenbearbeitung
  pf.b.1 | Bodenart bestimmen
  pf.b.2 | Stoppelbearbeitung
  pf.b.3 | Pflügen
  pf.b.4 | Pfluglose Bearbeitung
  pf.b.5 | Saatbettbereitung
GRUPPE bestellung | Bestellung
  pf.be.1 | Saatgut bestimmen
  pf.be.2 | Drillmaschine / Legegerät vorbereiten
  pf.be.3 | Drillen / Legen
GRUPPE duengung | Düngung
  pf.d.1 | Bodenprobe nehmen
  pf.d.2 | Düngerbedarf ermitteln
  pf.d.3 | Nährstoffgehalte organischer und mineralischer Dünger
  pf.d.4 | Düngerstreuer vorbereiten
  pf.d.5 | Mineralische Dünger ausbringen
  pf.d.6 | Organische Dünger ausbringen
GRUPPE bestand | Bestandesführung
  pf.bf.1 | Kulturarten erkennen
  pf.bf.2 | BBCH-Stadien bestimmen
  pf.bf.3 | Pflanzenbestand beurteilen
  pf.bf.4 | Gräser und Kräuter bestimmen
  pf.bf.5 | Pflanzenkrankheiten und Schädlinge erkennen
  pf.bf.6 | Schadschwellen überprüfen
GRUPPE pflege | Pflege und Pflanzenschutz
  pf.p.1 | Pflanzenschutzmittel, geeignete Produkte kennen
  pf.p.2 | Pflanzenschutzmittel lagern
  pf.p.3 | Feldspritze vorbereiten
  pf.p.4 | Feldspritze einsetzen
  pf.p.5 | Mechanische Pflegemaßnahmen durchführen
GRUPPE gruenland | Grünlandpflege
  pf.g.1 | Gräser bestimmen
  pf.g.2 | Narbenzusammensetzung beurteilen
  pf.g.3 | Weidepflege durchführen
  pf.g.4 | Neuansaat, Nachsaat vornehmen
GRUPPE ernte | Ernte und Verwertung
  pf.e.1 | Reifegrad bestimmen
  pf.e.2 | Erntetechnik vorbereiten
  pf.e.3 | Erntemaßnahmen durchführen
  pf.e.4 | Ernteprodukte transportieren
  pf.e.5 | Ernteprodukte lagern und aufbereiten
GRUPPE erg_pf | Betriebliche Ergebnisse
  pf.r.1 | Betriebsmittelaufwand festhalten
  pf.r.2 | Erntemengen beurteilen
  pf.r.3 | Preise und Erlöse beobachten
  pf.r.4 | Arbeitsaufwand ermitteln
  pf.r.5 | Dokumentation durchführen
ABSCHNITT tier | 2. Tierproduktion
GRUPPE beurteilung | Tierbeurteilung
  ti.b.1 | Tiere beurteilen
  ti.b.2 | Körperteile benennen
GRUPPE zucht | Zucht
  ti.z.1 | Rassen / Herkünfte benennen
  ti.z.2 | Brunstüberwachung durchführen
  ti.z.3 | Belegung / Künstliche Besamung
  ti.z.4 | Trächtigkeit kontrollieren
  ti.z.5 | Geburtsbetreuung vornehmen
  ti.z.6 | Muttertier nach der Geburt versorgen
  ti.z.7 | Versorgung der Jungtiere durchführen
GRUPPE haltung | Haltung, Management
  ti.h.1 | Tiere kennzeichnen
  ti.h.2 | Richtig mit Tieren umgehen
  ti.h.3 | Ställe und Stalleinrichtungen beurteilen
  ti.h.4 | Kleine Reparatur- und Wartungsarbeiten im Stall durchführen
  ti.h.5 | Stallklima beurteilen
GRUPPE fuetterung | Fütterung, Wasserversorgung
  ti.f.1 | Futtermittel bestimmen
  ti.f.2 | Futter- und Wasserqualität beurteilen
  ti.f.3 | Futterration zusammenstellen
  ti.f.4 | Fütterungstechnik bedienen
  ti.f.5 | Futtermittel lagern
  ti.f.6 | Wasserversorgung sicherstellen
GRUPPE gesundheit | Tierschutz, Tiergesundheit
  ti.g.1 | Gesetzliche Tierschutzvorgaben kennen
  ti.g.2 | Hygiene beachten
  ti.g.3 | Reinigung, Desinfektion durchführen
  ti.g.4 | Tierpflege durchführen
  ti.g.5 | Gesundheitskontrolle
  ti.g.6 | Erkrankungen erkennen und behandeln
  ti.g.7 | Erkrankungen vorbeugen
  ti.g.8 | Nottöten von Tieren vornehmen
GRUPPE vermarktung | Tierische Erzeugnisse, Vermarktung
  ti.v.1 | Melken, Milchqualität
  ti.v.2 | Tiere wiegen
  ti.v.3 | Schlachtreife Tiere auswählen
  ti.v.4 | Tiere für die Vermarktung vorbereiten
  ti.v.5 | Tiere verladen
  ti.v.6 | Tiere transportieren
  ti.v.7 | Eier sortieren
  ti.v.8 | Produkte lagern
  ti.v.9 | Qualität beurteilen
GRUPPE erg_ti | Betriebliche Ergebnisse
  ti.r.1 | Betriebsmittelaufwand festhalten
  ti.r.2 | Tierleistungen, Kennzahlen beurteilen
  ti.r.3 | Preise und Erlöse beobachten
  ti.r.4 | Arbeitsaufwand ermitteln
  ti.r.5 | Dokumentation durchführen
ABSCHNITT betrieb | 3. Betrieb und Organisation
GRUPPE betrieb_umwelt | Ausbildungsbetrieb, Berufsbildung, Umweltschutz
  bo.1 | Standort, Aufbau, Ausstattung und Aufgaben des Ausbildungsbetriebes erfassen
  bo.2 | Produkte und Dienstleistungen, Bezugs- und Absatzwege nennen
  bo.3 | Verbände, Berufsvertretung, Verwaltung
  bo.4 | Markt- und Geschäftspartner
  bo.5 | Überbetriebliche Zusammenarbeit
  bo.6 | Berufsausbildung, Ausbildungsvertrag, Fortbildungsmöglichkeiten
  bo.7 | Vertragsgestaltung, Tarifrecht
  bo.8 | Arbeitsschutz, Verhalten bei Arbeitsunfällen
  bo.9 | Aufgaben der Berufsgenossenschaft
  bo.10 | Brandschutz, Feuerverhütung, Verhalten im Brandfall
  bo.11 | Bedeutung, Ziele und Maßnahmen des Umweltschutzes
  bo.12 | Maßnahmen der Landschaftspflege durchführen
  bo.13 | Energie und Material rationell und umweltschonend einsetzen
GRUPPE technik | Technik, Arbeitsorganisation, Produktion und Vermarktung
  bo.t.1 | Werkstoffe und Werkzeuge auswählen und einsetzen
  bo.t.2 | Wartungs- und Instandsetzungsarbeiten durchführen
  bo.t.3 | Schlepper und Geräte unter Beachtung der Betriebs- und Verkehrssicherheit einsetzen und bedienen
  bo.t.4 | Betriebsstoffe lagern
  bo.t.5 | Witterungsabläufe beobachten und dokumentieren
  bo.t.6 | Fachinformationen beschaffen und umsetzen
  bo.t.7 | Produktionsdaten (Aufwandmengen, Gewichte, Rauminhalte, Größen)
  bo.t.8 | Betriebsgeschehen beobachten, Einfluss auf Betriebsorganisation einschätzen
  bo.t.9 | Produktions- und Arbeitsabläufe planen und vorbereiten
  bo.t.10 | Bestände erfassen, Bestandsverzeichnis führen
  bo.t.11 | Vermarktung, Verkaufsabrechnungen
  bo.t.12 | Geschäftsvorgänge abwickeln
ABSCHNITT extern | 4. Berufsausbildung außerhalb der Ausbildungsstätte
GRUPPE deula | DEULA-Lehrgänge (Ausgelagerter Berufsschulunterricht)
  ex.deula.a | a) Grundstufe
  ex.deula.b | b) Fachstufe I
  ex.deula.c | c) Fachstufe II
GRUPPE ueberbetrieb | Überbetriebliche Ausbildung
  ex.ueb.a | a) Einführung Berichtsheft (Informationsveranstaltung auf Kreisebene)
  ex.ueb.b | b) Grundkurs Rinderhaltung / Schweinehaltung (LBZ Echem)
  ex.ueb.c | c) Vertiefungskurs Rinder-, Schweine- oder Geflügelhaltung
  ex.ueb.d | d) Projekttag Integrierter Pflanzenschutz
  ex.ueb.e | e) Vorbereitung auf die Abschlussprüfung$plan$, false);
  UPDATE public.professions SET ai_hints = $h$Für Landwirtschaft: Ordne die in den Stichpunkten genannten Tätigkeiten fachlich ein. Beim Pflanzenbau unterscheide z. B. Aussaat, Bestandesführung, Bodenbearbeitung, Pflanzenschutz und Ernte; bei Tierhaltung Fütterung, Tierbeobachtung, Stallhygiene und Tierwohl; bei Maschineneinsatz Wartung, Einstellung, Anbau und sichere Bedienung. Verwende solche Begriffe nur, wenn sie zur beschriebenen Tätigkeit passen. Erkläre bei Bedarf kurz den fachlichen Zweck oder die Bedeutung eines Begriffs im konkreten Zusammenhang, ohne einen nicht genannten Arbeitsvorgang zu behaupten. Unterscheide Beobachtung von Maßnahme, Planung von Durchführung und Kontrolle von Ergebnis. Beziehe Arbeitsschutz, Hygiene, Tierwohl sowie Boden-, Gewässer- und Umweltschutz nur ein, wenn aus den Angaben passend ableitbar.$h$
  WHERE id = v_prof AND coalesce(btrim(ai_hints), '') = '';
END $do$;

DROP FUNCTION public._a2_seed_plan(uuid, text, boolean);

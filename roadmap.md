# Azuvera – Roadmap

# Neue Wünsche (18.11.2026)
- [ ] Prüfungsmappe enthält alles: Berichte, Erfahrungsberichte, Leittexte, Ausbildungszeugnis, Antrag Prüfungszulassung
- [ ] Ausbildungszeugnis: Azubi beantragt, Betrieb füllt in der App aus
- [ ] Antrag auf Zulassung zur Abschlussprüfung (Kammer) in der App vorbereiten
- [ ] Startseite für „Berichtsheft Landwirtschaft“, „Berichtsheft Pferdewirtschaft“, „Ausbildungsberichtsheft“ optimieren

## Baustein 4B – Benachrichtigungsversand
- [x] Tabellen, Einstellungen, Geräteschutz und Zustell-Warteschlange
- [x] push-config und email-test (SMTP 465)
- [x] push-test, notification-status, dispatch-notifications
- [x] Zeitplan, Bereinigung und Regel-/Berechtigungsprüfungen
- [ ] Echter Test-Push: wartet auf Geräteanmeldung (Baustein 4C)
- [ ] Zustell-Lauf im Live-Betrieb: wartet auf Veröffentlichen

## Baustein 4A – App-Fähigkeit und Offline
- [x] Offline-Start reparieren (Live: Service Worker installierte sich nicht; Abmelden offline nach 1 h) – nichts anderes löschen
- [x] PWA: Manifest, Icons, Service Worker (injectManifest), Update-Hinweis, Vorschau-Schutz
- [x] Lokaler Speicher je Konto (Dexie) und outbox mit Zusammenfassung
- [x] Sync-Engine (Senden, Holen, Abgleich, Wiederholungen, WLAN-Regeln)
- [x] Berichte, Anhänge, Abwesenheiten, Noten, Kommentare lokal zuerst
- [x] Konflikte (behalten, übernehmen, vergleichen)
- [x] Statuschip, Badges, /sync, Profilkarte „App & Offline“, Abmelde-Rückfrage
- [x] Online-only-Aktionen offline deaktiviert, Team/Portal mit „Stand: …“
- [ ] Live-Übernahme eigener Berichte/Abwesenheiten per Realtime (wartet auf Freigabe der Tabellen für Realtime)

# Baustein 3B

## Baustein 3B
- [x] Geschützte Team-, Vertretungs- und Erinnerungsfunktionen
- [x] Vertretungen und Einstellung zur Selbstverwaltung
- [x] Team und Azubi-Übersicht
- [x] Dashboard für Prüfende, Lesende und Leitung
- [x] Erinnerungen und Benachrichtigungs-Popover
- [x] Regeltests, Berechtigungsprüfung und mobile Abnahme

## Datenbank und Rechte
- [x] Vertretungen, Empfängerlogik und erweiterte Prüf-Berechtigung
- [x] Prüf-Warteschlange, Berichtstitel und gespeicherte Unterschriften
- [x] Unveränderliche Kommentare inklusive Realtime und Benachrichtigungen
- [x] Freigeben, Zurückweisen, Wiederöffnen und harte Status-Sperren

## Oberfläche
- [x] /ausbilder mit Kennzahlen, Tabs, Filtern, Master-Detail und Abwesenheiten
- [x] Freigabe mit drei Methoden, Zurückweisung und Sammelfreigabe
- [x] Berichtsdetails: Prüfung, Unterschriften, Kommentare und Wiederöffnen
- [x] Gespeicherte Unterschrift im Profil und Navigation mit Prüfzähler

## Anmeldung (neu)
- [x] Google-, Apple- und Microsoft-Anmeldung mit vorgesehenen Buttons und konfigurierten Anbietern

## Abnahme
- [x] Automatisierte Tests und Typprüfung
- [x] Freigabe, Zurückweisung, Manipulations- und Rechteprüfungen
- [x] Vertretung, Kommentare, Wiederöffnen und Audit-Kette
- [x] Responsive Abläufe bei 390, 820, 1180 und 1440 px

## Abnahme 3B
- [x] Sechs abgeschlossene Wochen, zwei eingereichte Wochenberichte und eine genehmigte Urlaubswoche ergeben exakt drei offene Wochen.
- [x] Wochenbericht, Tagesbericht, Abwesenheit und fehlende/unsichtbare Berichte geprüft.
- [x] Vertretung eintragen/beenden, Banner und Selbstverwaltungssperre geprüft.
- [x] Ausbilder-, Berater- und Leitungssicht; unberechtigter Detailzugriff und gesperrter interner Kern geprüft.
- [x] Erinnerungsverlauf, Benachrichtigung, Audit und 12-Stunden-Sperre geprüft.
- [x] Glocke live, Navigation und Gelesen-Markierung; 390/820/1180/1440 px ohne horizontalen Überlauf.
- [x] 33 Tests bestanden; Testrollen, Zeitraum und Zuständigkeit wiederhergestellt.

Signierte Testberichte, Kommentare und Erinnerungen bleiben revisionssicher erhalten. Automatische Erinnerungen und optionale Push-/E-Mail-Zustellung gehören zu Baustein 4.

- [x] Baustein 4C: Service-Worker-Push, Geräteanmeldung, /notifications, Profil-Karte, Leitungs-Status
- [ ] 4C Abnahme auf echtem Gerät (Test-Push, Klick-Ziel) – braucht veröffentlichte App und ein Handy
- [x] Baustein 4D: automatische Erinnerungen (Regeln, Zeitplan alle 15 Min., Ersatzweg, Admin-Block, Badge „Automatisch“)
- [x] Baustein 5A: PDF-Export und Unterschriften-Nachweis
- [ ] 5A Abnahme 4 (120 Testberichte) und 2 (Manipulation per SQL) noch nicht durchgespielt
- [x] Baustein 5B: Änderungshistorie (Verlauf, Versionen mit Wortvergleich, /protokoll, CSV, Kettenprüfung)
- [ ] 5B „Mehr laden“ erst ab 100 Einträgen im Browser prüfbar (derzeit 54)
- [x] Baustein 5C: Meine Daten (Export, Löschanträge, Konto löschen/schließen)
- [x] Baustein 5D: Datenschutzerklärung (14 Abschnitte, Anbieter-Einstellungen, festes Stand-Datum), Startseiten-Block, HTTPS-Prüfung
- [x] Daten-Prompt A1: Ausbildungsplan
  - [x] Datenbank: Pläne, Abschnitte, Gruppen, Punkte, Zuordnung, Fortschritt, Themen, Berichtsverknüpfungen, Berufe
  - [x] Funktionen: resolve_plan, list_selectable_plans, set_azubi_plan, admin_save_plan, Status, Duplizieren, JSON-Export
  - [x] Offline-Speicher und Sync für Fortschritt und Verknüpfungen
  - [x] Seite /ausbildungsplan (Kennzahlen, 7 Tabs, Drill-Down, Filter, gespeicherte Einstellungen)
  - [x] Export PDF (4 Vorlagen, Branding) und ODT
  - [x] Berichtseditor „Ausbildungsinhalte“, Chips in Detail/Prüfung, Abschnitt im Berichts-PDF
  - [x] Plan-Editor und JSON-Import unter /stammdaten/ausbildungsplaene, Spalte in Benutzertabelle, Navigation
  - [x] Abnahme 1–7
- [x] Azubis legen Ausbildungsberuf, Ausbildungsbetrieb und Lehrjahr im Profil selbst fest
- [x] Azubis erstellen Verknüpfungscodes für Prüfer:innen (nur lesen), Ausbilder/Betriebsleitung (einsehen, freigeben, zurückweisen, Rückmeldung), Ausbildungsberatung (lesen, Rückmeldung); Teilen per gestaltetem QR-Code und Scannen in der App
- [x] Prüfungsmappe als PDF: Ausbilder:innen stellen Prüfungen und Berichte einer Person in einem Dokument zusammen
- [x] Push-Ruhezeiten auch beim Versand prüfen (Wiederholungen, Rückstau)
- [ ] Echter Push-Test auf dem Handy – braucht ein Gerät, auf dem Push in der veröffentlichten App eingeschaltet ist (derzeit keins)
- [x] Daten-Prompt A2a: Landwirt/in (bisherige Fassung LWK Niedersachsen 2018, 140 Punkte)
- [x] Daten-Prompt A2b: Landwirt/in (neue Fassung ab 1. August 2027, 161 Punkte)

## Prompt-Paket Neustart (13.11.2026)
- [x] Abgleich 1A–A2b mit Paket: Wortlaut identisch, nur Zwischentexte neu
- [x] Daten-Prompt A3: Gärtner/in, sieben Fachrichtungen
- [x] Daten-Prompt A4a: Pferdewirt/in Pferdehaltung und Service
- [x] Daten-Prompt A4b: Pferdewirt/in vier weitere Fachrichtungen
- [x] Daten-Prompt B1: Unterweisungen – Datenbank, Fälligkeiten, Funktionen
- [x] Daten-Prompt B2: Unterweisungen – Oberfläche, Export, Katalog-Editor
- [x] Daten-Prompt B3: Unterweisungskataloge allgemein + Landwirt/in
- [x] Daten-Prompt B4: Unterweisungskataloge Gärtner/in + Pferdewirt/in
- [x] Zusatz C1–C4: Erfahrungsberichte (Vorgaben, Datenmodell, Seiten, Prüf-Tab, Verwaltung, Export, Protokoll, Erinnerungen, Datenschutz)
- [ ] C4 Rest: gemeinsamer Export „Berichte und Erfahrungsberichte“ in einem Dialog/Sammel-PDF (derzeit getrennte Exporte)
- [ ] C Abnahme im Browser: Einreichen/Freigeben mit zwei Konten, PDF-Export, Handy-Ansicht – noch nicht durchgespielt
- [x] Zusatz D1, D2, D3: offene Registrierung, Einladungen, Zugriff — mit Abweichungen des Nutzers:
  - [x] Ausbildungsleitung bleibt (verwaltet und sieht alles), Betriebe bleiben als Stammdaten
  - [x] Ausbildungsberater:innen prüfen und kommentieren wie Ausbilder:innen; Prüfer:innen/Lehrkräfte nur lesen
  - [x] QR-Code anzeigen und scannen für Einladungs-Codes
  - [x] Registrierung mit Rollenwahl, /einladung, /zugriff, „Meine Azubis“, Verwaltung anpassen
- [x] Leittexte von leittexte.de: 65 Leittexte (Landwirt/in, Pferdewirt/in) interaktiv ausfüllen, speichern, wieder bearbeiten oder nur ansehen, prüfen/freigeben, in der Prüfungsmappe und einzeln als PDF
- [ ] Leittexte: Nutzungserlaubnis der BLE liegt nicht vor (Nutzer trägt Risiko, Quelle + Link überall)
- [x] Profil: E-Mail-Adresse einsehen und ändern; Google/Apple/Microsoft verbinden (gleiche E-Mail); Passwort festlegen
- [ ] Verbinden mit Google/Apple/Microsoft und E-Mail-Änderung mit echter Bestätigungs-E-Mail testen – braucht echte Konten
- [x] Kurze Übersicht „Was fehlt noch“ für den Nutzer (Datei AzuVera_Uebersicht.md)
- [x] Angemeldet bleiben: Startseite/Anmeldeseite erkennen Anmeldung, Haken „Angemeldet bleiben“
- [ ] Abmeldung beim Neuladen in der Vorschau/Live-Seite vom Nutzer bestätigen lassen (lokal nicht nachstellbar)
- [x] Übersicht: Was fehlt zu einem professionellen, gesetzeskonformen Berichtsheft (BBiG/Ausbildungsnachweis)
- [ ] Abnahme-Prompt 1 und 2

- [x] SEO: Suchmaschinen für öffentliche Seiten zulassen, Seitenliste mit vollständigen Adressen
- [x] Datenschutzerklärung: neue Funktionen ergänzt (Anmeldemethoden, Besucherstatistik, Beschwerderecht) + formale Prüfung

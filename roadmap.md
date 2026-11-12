# Azuvera – Roadmap

## Baustein 4B – Benachrichtigungsversand
- [ ] Tabellen, Einstellungen, Geräteschutz und Zustell-Warteschlange
- [x] push-config und email-test (SMTP 465)
- [ ] push-test, notification-status, dispatch-notifications
- [ ] Zeitplan, Bereinigung und Regel-/Berechtigungsprüfungen
- [ ] Echter Push und E-Mail: wartet auf die abgelehnten Zugangsdaten und ein echtes Gerät

## Baustein 4A – App-Fähigkeit und Offline
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

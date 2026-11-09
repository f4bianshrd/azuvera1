# Azuvera – Baustein 2A Roadmap (Berichte, Anhänge, Einreichen, Dashboard)

## Datenbank
- [ ] Enums report_type/report_status; Tabelle reports (Teil-Indizes, Trigger: KW/Jahr, version, updated_at, kein Zukunftsdatum, Statusübergänge, approved unveränderlich, Schreibschutz systemseitiger Spalten)
- [ ] report_attachments (Trigger: max 10, 10 MB, MIME-Whitelist, azubi_id aus Bericht)
- [ ] report_versions (unveränderlich, Schnappschuss bei Statuswechsel)
- [ ] report_signatures (unveränderlich, kein Client-Schreiben)
- [ ] Funktionen: report_canonical, report_hash, team_week_status, submit_report
- [ ] RLS + Grants für alle neuen Tabellen
- [ ] Storage-Buckets report-files + signatures (privat) mit Policies

## Frontend
- [ ] src/features/reports/api.ts (Datenzugriffs-Schicht, Geräte-UUIDs, expected_version)
- [ ] /reports (Liste, Filter, Abdeckungs-Donut mit Drill-Down, „Als Tabelle anzeigen“)
- [ ] /reports/new (Art, Woche/Tag, Berichtsform, 4 Abschnitte, Fortschritt, Autosave, Duplikat-Abfrage)
- [ ] /reports/$id (Detail, Bearbeiten, Löschen, Einreichen, Korrekturnotiz, Zeitleiste)
- [ ] Anhänge: Upload (Kamera/Galerie/PDF/Drag&Drop), HEIC→JPEG, Resize 2048 + Thumb 320, sha256, Magic-Bytes-Prüfung, Bildunterschrift, Reihenfolge, Vollbildansicht
- [ ] Einreichen-Blatt: Kurzübersicht, Zeichnen (Pointer Events) oder Klick-Bestätigung, Signatur-Upload, submit_report
- [ ] /dashboard für Azubis (Hero, 5 Kennzahlen, Offene Aufgaben, Letzte Berichte, Schnellzugriff, Abdeckung)

## Abnahme (selbst prüfen)
- [ ] Anlegen/Autosave/Bearbeiten/Einreichen; Duplikate unmöglich
- [ ] Anhänge: Limits, Typen, EXIF entfernt
- [ ] Client kann status/version/content_hash nicht ändern; eingereicht = schreibgeschützt
- [ ] submit_report: Signatur, Hash, Version, audit_log, Benachrichtigung
- [ ] Abdeckung: 7 Tage/Woche, Doppelzählung vermieden, Drill-Down/Nachtragen
- [ ] Layout 390/820/1180/1440 px; supabase nur in api.ts

# Azuvera – Baustein 2A Roadmap (Berichte, Anhänge, Einreichen, Dashboard)

## Datenbank
- [x] Enums report_type/report_status; Tabelle reports (Teil-Indizes, Trigger: KW/Jahr, version, updated_at, kein Zukunftsdatum, Statusübergänge, approved unveränderlich, Schreibschutz systemseitiger Spalten)
- [x] report_attachments (Trigger: max 10, 10 MB, MIME-Whitelist, azubi_id aus Bericht)
- [x] report_versions (unveränderlich, Schnappschuss bei Statuswechsel)
- [x] report_signatures (unveränderlich, kein Client-Schreiben)
- [x] Funktionen: report_canonical, report_hash, team_week_status, submit_report
- [x] RLS + Grants für alle neuen Tabellen
- [x] Storage-Buckets report-files + signatures (privat) mit Policies
- [x] Fix: reports_guard NULL-bypass (current_setting ohne coalesce) – Migration 0009

## Frontend
- [x] src/features/reports/api.ts (Datenzugriffs-Schicht, Geräte-UUIDs, expected_version)
- [x] /reports (Liste, Filter, Abdeckungs-Donut mit Drill-Down, „Als Tabelle anzeigen“)
- [x] /reports/new (Art, Woche/Tag, Berichtsform, 4 Abschnitte, Fortschritt, Autosave, Duplikat-Abfrage)
- [x] /reports/$id (Detail, Bearbeiten, Löschen, Einreichen, Korrekturnotiz, Zeitleiste)
- [x] Anhänge: Upload (Kamera/Galerie/PDF/Drag&Drop), HEIC→JPEG, Resize 2048 + Thumb 320, sha256, Magic-Bytes-Prüfung, Bildunterschrift, Reihenfolge, Vollbildansicht
- [x] Einreichen-Blatt: Kurzübersicht, Zeichnen (Pointer Events) oder Klick-Bestätigung, Signatur-Upload, submit_report
- [x] /dashboard für Azubis (Hero, 5 Kennzahlen, Offene Aufgaben, Letzte Berichte, Schnellzugriff, Abdeckung)

## Abnahme (geprüft)
- [x] Anlegen/Autosave/Bearbeiten/Einreichen im Browser getestet; Duplikat-Hinweis erscheint, DB-Teil-Indizes verhindern Duplikate
- [x] Anhänge: Upload als JPEG neu codiert (EXIF entfernt), Thumb + sha256 gespeichert; Limits per DB-Trigger (max 10, 10 MB, MIME)
- [x] Client kann status/version/content_hash nicht ändern (Trigger blockiert, getestet); eingereicht = schreibgeschützt (RLS, getestet)
- [x] submit_report: Signatur, Hash, Version+1, audit_log, Versions-Schnappschuss – alle in DB verifiziert; Benachrichtigung entfällt, solange kein Ausbilder zugewiesen ist
- [x] Abdeckung: 7 Tage/Woche, beste-Status-Regel, Drill-Down-Dialog mit „Nachtragen“ (Unit-Tests + Browser)
- [x] Layout 390/820/1180/1440 px ohne horizontales Scrollen; supabase-Zugriffe nur in api.ts

## Offen / spätere Bausteine
- [ ] „Abwesend“-Segment der Abdeckung wartet auf die Abwesenheits-Tabelle (Baustein 2B)
- [ ] Diktat- und KI-Text-Buttons sind Platzhalter (Baustein 2B)
- [ ] Benachrichtigung beim Einreichen greift erst, sobald ein Ausbilder zugewiesen ist (oder Ausbildungsleitung existiert)
- [ ] Baustein 3: Prüfung (approve/reject), reopen_report, Kommentare, Vertretung

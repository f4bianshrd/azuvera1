# Azuvera – Baustein 1B Roadmap

## Backend (Lovable Cloud)
- [x] E-Mail-Auth aktivieren (enable_email_auth)
- [x] Auth-Einstellungen: HIBP-Passwortschutz, current_password für Passwortänderung
- [x] Migration: app_role-Enum, Tabellen, Grants, RLS
- [x] Migration: Funktionen, Trigger (Signup, Hash-Kette, updated_at, audit-Schutz)
- [x] Storage-Bucket company-logos (privat) + Policies
- [x] Realtime für notifications
- [x] app_settings-Startwert hosting_location_text (öffentlich)
- [x] Grants auf Mindestrechte eingeschränkt + per SQL verifiziert

## Frontend
- [x] /auth (Anmelden/Registrieren, ?mode=signup, Passwort-vergessen-Dialog, „Fast geschafft“)
- [x] /reset-password
- [x] App-Gerüst (_authenticated): Handy-Tab-Leiste, Tablet/PC-Sidebar, Glocke mit Realtime, Mehr-Sheet, ?-Kürzelübersicht
- [x] /dashboard (Begrüßung mit Vorname)
- [x] /profil (alle Karten + Erste Schritte für Azubis)
- [x] /admin (Benutzer & Rollen, Einladungs-Codes)
- [x] /stammdaten/betriebe, /stammdaten/berufe
- [x] /admin/einstellungen (hosting_location_text)
- [x] /benachrichtigungen, /aenderungsprotokoll
- [x] Datenschutzseite liest hosting_location_text aus app_settings

## Abnahme (geprüft)
- [x] Registrierung als Azubi klappt, Bestätigungs-E-Mail wird gesendet; ungültiger Code bricht mit der vorgegebenen Meldung ab
- [x] Zweites Konto kann user_roles und geschützte Profil-Felder nicht ändern (per API getestet)
- [x] Azubi sieht keine fremden Profile/Rollen (per API getestet)
- [x] audit_log unveränderlich (UPDATE blockiert), Hash-Kette verifiziert
- [x] Layout 390/820/1440 px ohne horizontales Scrollen; 1180 px nicht separat geprüft
- [x] Kein Standard-Admin, keine feste E-Mail im Code
- [x] Datenschutzseite zeigt Speicherort aus app_settings

## Offen / spätere Bausteine
- [ ] Tastenkürzel N und / werden aktiv, sobald die Berichte-Seiten existieren (Baustein 2)
- [ ] Baustein 2: Berichte; Baustein 3+: Team, Plan, Unterweisungen, Abwesenheiten, Schulnoten, Erinnerungen

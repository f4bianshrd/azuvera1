# Azuvera – Baustein 1B Roadmap

## Backend (Lovable Cloud)
- [ ] E-Mail-Auth aktivieren (enable_email_auth)
- [ ] Auth-Einstellungen: HIBP-Passwortschutz, current_password für Passwortänderung
- [ ] Migration: app_role-Enum, Tabellen (profiles, user_roles, companies, professions, company_professions, azubi_viewers, invite_codes, app_settings, notifications, audit_log), Grants, RLS
- [ ] Migration: Funktionen (has_role, is_leitung, is_reviewer_role, can_review_for, can_view_azubi, display_names, admin_*, invite-Code-Funktionen, set_my_profession, write_audit, audit_hash), Trigger (Signup, Hash-Kette, updated_at, audit-Schutz)
- [ ] Storage-Bucket company-logos (privat) + Policies
- [ ] Realtime für notifications
- [ ] app_settings-Startwert hosting_location_text (öffentlich)

## Frontend
- [ ] /auth (Anmelden/Registrieren, ?mode=signup, Passwort-vergessen-Dialog, „Fast geschafft“)
- [ ] /reset-password
- [ ] App-Gerüst (_authenticated): Handy-Tab-Leiste, Tablet-Sidebar, PC-Sidebar, Glocke mit Realtime-Zähler, Mehr-Sheet, Tastenkürzel
- [ ] /dashboard (Begrüßung mit Vorname)
- [ ] /profil (Rolle, Code einlösen, persönliche Daten, Anschrift, Notfallkontakt, Ausbildung, Sicherheit, Darstellung, Erste Schritte für Azubis)
- [ ] /admin (Benutzer & Rollen, Einladungs-Codes)
- [ ] /stammdaten/betriebe, /stammdaten/berufe
- [ ] /admin/einstellungen (hosting_location_text)
- [ ] Datenschutzseite liest hosting_location_text aus app_settings

## Abnahme
- [ ] Tests + SQL-Prüfung der Abnahmepunkte (Grants/Policies, Hash-Kette, kein Standard-Admin)
- [ ] Layout-Check 390/820/1180/1440 px

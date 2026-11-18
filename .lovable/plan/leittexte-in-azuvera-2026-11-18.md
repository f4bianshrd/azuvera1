# Leittexte in AzuVera

## Ziel
Azubis bearbeiten die Leittexte von leittexte.de direkt in der App: ausfüllen, speichern, später weiter bearbeiten oder nur ansehen. Fertige Leittexte kommen in die Prüfungsmappe und lassen sich einzeln als PDF exportieren.

## Was Azubis sehen
- Neuer Menüpunkt **„Leittexte“**: Liste aller Leittexte für den eigenen Beruf. Suche, Themenfilter (z. B. Rinder, Schweine, Ackerbau, Pferd) und Status („Nicht begonnen“, „In Bearbeitung“, „Eingereicht“, „Freigegeben“).
- **Bearbeiten-Ansicht**: genau wie im Heft, Schritt für Schritt:
  - Einleitung („Worum geht's?“, „Was kann ich hier lernen?“, „Was brauche ich?“)
  - jede nummerierte Aufgabe mit passenden Eingabefeldern: Freitext, Tabellen mit Einheiten (z. B. „Länge der Bucht … m“), Ankreuzfelder, Fotos und Skizzen (Foto aufnehmen oder Bild hochladen)
  - Fortschrittsbalken; jede Eingabe wird automatisch gespeichert, auch ohne Internet
- **Lese-Ansicht**: ein Knopf wechselt zwischen „Bearbeiten“ und „Ansehen“. Die Lese-Ansicht zeigt alles sauber wie ein fertiges Heft, ohne Eingabefelder.
- Kopfdaten (Name, Betrieb, Zeitraum, „Zusammenarbeit mit“) werden aus dem Profil vorausgefüllt.
- Bei jedem Leittext stehen Quelle (BLE / leittexte.de, Stand) und ein Link zum Original-PDF.

## Ausbilder:innen und Zugriff
- Eingeladene Personen sehen Leittexte im selben Umfang wie Berichte.
- Vorerst: Ausbilder:innen, Betriebsleitung und Berater:innen können einreichte Leittexte kommentieren, freigeben oder zurückgeben, wie bei Berichten. Prüfer:innen und Lehrkräfte lesen nur. Wird nach deiner Antwort angepasst.

## Export
- Einzelner Leittext als PDF im AzuVera-Design: Deckblatt, alle Aufgaben mit Antworten, Fotos, Freigabevermerk.
- Prüfungsmappe: neuer Abschnitt „Leittexte“ (an-/abwählbar), mit freigegebenen bzw. ausgewählten Leittexten.
- Jeder Export wird wie bisher im Änderungsprotokoll vermerkt.

## Inhalte
- Vorerst Landwirt/in und Pferdewirt/in (ca. 70 Leittexte). Wird angepasst, wenn du „alle acht Berufe“ wählst.
- Jedes Heft wird einmalig in die App-Struktur übertragen (Abschnitte, Aufgaben, Felder) und von mir stichprobenartig mit dem Original verglichen.
- Die Inhalte schalte ich erst frei, wenn die Frage zu den Nutzungsrechten geklärt ist. Funktionen und Aufbau baue ich vorher.

## Reihenfolge
1. Datenbank und Aufbau der Leittexte, Rechte wie bei Berichten
2. Liste, Bearbeiten- und Lese-Ansicht inkl. Offline-Speichern und Fotos
3. Einreichen, Kommentieren, Freigeben (falls gewünscht)
4. Einzel-Export und Prüfungsmappe
5. Übertragen der Hefte, Stichproben-Abgleich, Tests und Prüfung auf Handy und Computer, hell und dunkel

## Technische Details
- Tabellen: `leittexts` (Katalog: Beruf(e), Thema, Bestell-Nr., Stand, Quelle/URL, `content` jsonb mit Abschnitten/Aufgaben/Feldern, `published`), `leittext_works` (azubi_id, leittext_id, `answers` jsonb, Kopfdaten, status, version, submitted/approved-Felder), `leittext_attachments` (Storage-Bucket privat), Kommentare und Verlauf analog Erfahrungsberichte. RLS über `can_view_azubi` / `can_review_for` / `can_comment_for`; Statuswechsel nur über SECURITY-DEFINER-Funktionen; Audit über `write_audit`-Trigger.
- Katalog nur lesbar für angemeldete Personen, Schreiben nur Team; Veröffentlichung pro Leittext über `published`.
- Eigene Entwürfe und Anhänge über Dexie + Outbox (neue Ops `leittext.upsert`, `leittext.attachment`), wie bei Erfahrungsberichten; Review online.
- Feldtypen im `content`: `text`, `longtext`, `number` (mit Einheit), `table` (Spalten/Zeilen, ggf. frei erweiterbar), `checkbox_group`, `image` (Foto/Skizze), `info` (reiner Text).
- Übertragung: PDFs herunterladen, Text extrahieren, per Skript in das JSON-Format überführen (KI-gestützt), Ergebnis als Daten einspielen, Stichproben gegen das Original.
- Export mit pdf-lib im Browser (`src/features/export/pdf/leittext.ts`), Prüfungsmappe erweitert `folder.ts` und `FolderDialog`; `log_export` für das Protokoll.
- Neues Modul `src/features/leittexte` mit eigener `api.ts`; Routen `/leittexte`, `/leittexte/$id`; Navigation in `nav.ts`; Datenschutzerklärung und Datenexport um Leittexte ergänzt.

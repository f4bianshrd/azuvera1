# Azuvera als native App (iPhone, iPad, Mac)

Die Web-App (get.azuvera.de) bleibt unverändert und kostenlos. Aus demselben Code entsteht mit
Capacitor eine native App: `.ipa` für iPhone/iPad und eine notarisierte `.dmg` für den Mac
(Mac Catalyst: Apple Silicon, Intel oder Universal). Die App lädt ihre Dateien aus dem App-Paket.

## Lokal bauen

```bash
bun install
bun run build:native   # = VITE_NATIVE_BUILD=true vite build → index.html vorbereiten → npx cap sync ios
```

- `VITE_NATIVE_BUILD=true` schaltet die Lizenzprüfung und den nativen Modus ein (kein Service Worker,
  kein Installationshinweis, Start direkt in der App statt auf der Werbe-Startseite).
- Capacitor erkennt `isNative()` auch ohne die Variable (window.Capacitor / capacitor://).
- `scripts/native-prepare.mjs` kopiert `dist/client/_shell.html` nach `dist/client/index.html`
  (TanStack Start schreibt im SPA-Modus `_shell.html`; Capacitor braucht `index.html` und beantwortet
  unbekannte Pfade wie `/dashboard` automatisch mit `index.html`). Pfade wie `/assets/…` funktionieren
  im App-Paket, weil die App unter `capacitor://localhost/` läuft.
- Danach in Xcode öffnen: `ios/App/App.xcodeproj`, Ziel „App“, Gerät iPhone/iPad oder „My Mac (Mac Catalyst)“.

## Pflichten vor jeder nativen Version

1. `src/config/native-license.ts`: `APP_VERSION` erhöhen; `SHOW_PURCHASE_LINKS` passend zum Vertriebsweg
   (für den App Store ggf. `false`); öffentlicher Schlüssel in `LICENSE_PUBLIC_KEYS` eingetragen (nur kty/crv/x/y/kid).
2. Schlüsselwechsel nur so: erst eine App-Version ausliefern, die alten **und** neuen Schlüssel kennt, dann die Website umstellen.
3. Nach einer Neuinstallation braucht das Gerät einen neuen Platz: den alten Platz unter www.azuvera.de → Mein Konto entfernen.
4. Tag setzen, z. B. `native-v1.2.3` → der Workflow baut Version 1.2.3 (Build-Nummer = Laufnummer).

Die Lizenzprüfung ist eine ehrliche Prüfung, kein Kopierschutz. Sie greift nur in der nativen App,
nie im Browser; die Lizenz gehört zum Gerät (eigene Datenbank `azuvera-license`), nicht zum App-Konto.
Testhilfe im Browser: `?native=1` schaltet die Sperre ein, `?native=0` wieder aus.

## Automatischer Bau (GitHub Actions)

Datei: `.github/workflows/native-build.yml`. Start:
- **Manuell:** GitHub → Actions → „Native Build (iOS, iPadOS, macOS)“ → „Run workflow“ → Ziel wählen
  (`ios`, `mac-silicon`, `mac-intel`, `mac-universal`, `alle`).
- **Automatisch:** bei jedem Tag `native-v*` (baut `alle`: iPhone/iPad + Mac Universal).

Ergebnis: Artefakte `Azuvera-{version}-ios.ipa` bzw. `Azuvera-{version}-mac-universal.dmg` (usw.);
Version, SHA-256 und Architekturen stehen in der Job-Zusammenfassung. Der Mac-Job prüft mit `lipo -archs`
die Architekturen und mit `spctl --assess`, dass Gatekeeper die App annimmt – sonst schlägt er fehl.

### Secrets (GitHub → Settings → Secrets and variables → Actions)

| Name | Zweck |
|---|---|
| `APPLE_TEAM_ID` | 10-stellige Team-ID (developer.apple.com → Membership) |
| `APPLE_CERT_P12_BASE64` | **Eine** .p12 mit „Apple Distribution“ **und** „Developer ID Application“ (jeweils mit privatem Schlüssel), Base64 |
| `APPLE_CERT_PASSWORD` | Passwort der .p12 |
| `APPLE_PROVISIONING_PROFILE_IOS_BASE64` | App-Store-Profil für `de.azuvera.app` (iOS), Base64 |
| `APPLE_PROVISIONING_PROFILE_MAC_BASE64` | Developer-ID-Profil für `de.azuvera.app`, Plattform Mac Catalyst, Base64 |
| `APP_STORE_CONNECT_KEY_ID` | Schlüssel-ID des App-Store-Connect-API-Schlüssels |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer-ID (App Store Connect → Benutzer und Zugriff → Integrationen) |
| `APP_STORE_CONNECT_KEY_P8_BASE64` | Inhalt der `AuthKey_XXXX.p8`, Base64 |
| `TESTFLIGHT_UPLOAD` | optional: `true` lädt die .ipa automatisch zu TestFlight |

Base64 auf dem Mac in die Zwischenablage: `base64 -i datei | pbcopy` (für .p12, .mobileprovision,
.provisionprofile und .p8), dann im Secret einfügen.

### Zertifikate und Profile anlegen (developer.apple.com → Certificates, IDs & Profiles)

1. **Identifier:** App-ID `de.azuvera.app` (explizit), Fähigkeit „Mac Catalyst“ aktivieren.
2. **Zertifikate:** „Apple Distribution“ (iPhone/iPad, App Store/TestFlight) und „Developer ID Application“
   (Mac-Download außerhalb des App Stores; nur der Account Holder kann es erstellen). In der Schlüsselbund-
   verwaltung beide Zertifikate samt privatem Schlüssel markieren → „Exportieren“ → eine .p12.
3. **Profile:** „App Store Connect“ für iOS mit `de.azuvera.app`; „Developer ID“ mit Plattform macOS/Mac Catalyst
   für `de.azuvera.app`. Herunterladen und als Base64 hinterlegen.
4. **App-Store-Connect-API-Schlüssel:** App Store Connect → Benutzer und Zugriff → Integrationen →
   App Store Connect API → „+“ (Rolle „App-Manager“ oder „Entwickler“). `.p8` einmalig herunterladen,
   Schlüssel-ID und Issuer-ID notieren. Wird für TestFlight und für die Notarisierung genutzt.

### Fertige Datei weitergeben

GitHub → Actions → Lauf öffnen → unten „Artifacts“ → herunterladen (ZIP enthält die .ipa/.dmg) →
auf www.azuvera.de im Admin-Bereich hochladen.

**Hinweis:** Eine `.ipa` lässt sich auf iPhone/iPad nicht frei von einer Website installieren – nur über
App Store, TestFlight, Ad-hoc (registrierte Geräte) oder EU-Webvertrieb. Die notarisierte `.dmg` für den Mac
funktioniert als direkter Download.

## Typische Fehler

| Meldung | Lösung |
|---|---|
| „No signing certificate … found“ | .p12 enthält nicht beide Zertifikate mit privatem Schlüssel, oder falsches Passwort/Team. Neu exportieren. |
| „Provisioning profile … doesn't match the bundle identifier“ / Profil gehört nicht zu de.azuvera.app | Profil für genau `de.azuvera.app` neu erstellen (keine Wildcard), für Mac Plattform „Mac Catalyst“. |
| „Profile doesn't include signing certificate“ | Profil nach dem Erstellen des Zertifikats neu generieren und Secret aktualisieren. |
| Notarisierung „Invalid“ | Log steht im Job. Häufig: Hardened Runtime fehlt (ist gesetzt) oder falsches Zertifikat (muss „Developer ID Application“ sein). |
| `spctl` „rejected“ | Notarisierung/Heften fehlgeschlagen oder nicht mit Developer ID signiert. |
| Architekturen stimmen nicht | Ziel prüfen; Universal braucht `ARCHS="arm64 x86_64"` (macht der Workflow). |
| `bun install --frozen-lockfile` schlägt fehl | `bun.lock` passt nicht zu package.json – lokal `bun install` ausführen und committen. |

## Grenzen

- Funktionen, die einen Server der Web-App brauchen (KI-Formulierhilfe, Konto löschen über `/api/…`), rufen
  im App-Paket relative Adressen auf und funktionieren dort erst, wenn sie auf `https://get.azuvera.de` zeigen
  und der Server Aufrufe von `capacitor://localhost` erlaubt.
- Anmeldung mit Google/Apple/Microsoft leitet auf eine Web-Adresse zurück; in der nativen App ist das noch nicht
  eingerichtet. Anmeldung mit E-Mail und Passwort funktioniert.
- Push-Benachrichtigungen laufen über den Service Worker und sind in der nativen App aus.

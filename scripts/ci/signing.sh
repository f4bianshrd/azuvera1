#!/usr/bin/env bash
# Signier-Hilfen für .github/workflows/native-build.yml (läuft nur auf macOS-Runnern).
# Secrets kommen ausschließlich über Umgebungsvariablen und werden nie ausgegeben.
set -euo pipefail
set +x

KEYCHAIN="${RUNNER_TEMP:?}/azuvera-signing.keychain-db"
PROFILE_DIRS=("$HOME/Library/MobileDevice/Provisioning Profiles" "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles")

case "${1:-}" in
  setup)
    : "${APPLE_CERT_P12_BASE64:?Secret APPLE_CERT_P12_BASE64 fehlt}"
    : "${APPLE_CERT_PASSWORD:?Secret APPLE_CERT_PASSWORD fehlt}"
    kc_pass="$(openssl rand -hex 24)"
    printf '%s' "$APPLE_CERT_P12_BASE64" | base64 --decode > "$RUNNER_TEMP/cert.p12"
    security create-keychain -p "$kc_pass" "$KEYCHAIN"
    security set-keychain-settings -lut 21600 "$KEYCHAIN"
    security unlock-keychain -p "$kc_pass" "$KEYCHAIN"
    security import "$RUNNER_TEMP/cert.p12" -P "$APPLE_CERT_PASSWORD" -A -t cert -f pkcs12 -k "$KEYCHAIN" >/dev/null
    security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$kc_pass" "$KEYCHAIN" >/dev/null
    # Temporäre Keychain vorn in die Suchliste
    existing=$(security list-keychains -d user | sed -e 's/^ *"//' -e 's/" *$//')
    # shellcheck disable=SC2086
    security list-keychains -d user -s "$KEYCHAIN" $existing
    rm -f "$RUNNER_TEMP/cert.p12"
    echo "Zertifikate in temporärer Keychain:"
    security find-identity -v -p codesigning "$KEYCHAIN" | sed -E 's/[0-9A-F]{40}/<id>/'
    # App-Store-Connect-API-Schlüssel (für TestFlight und Notarisierung)
    if [ -n "${APP_STORE_CONNECT_KEY_P8_BASE64:-}" ] && [ -n "${APP_STORE_CONNECT_KEY_ID:-}" ]; then
      mkdir -p "$HOME/.appstoreconnect/private_keys"
      printf '%s' "$APP_STORE_CONNECT_KEY_P8_BASE64" | base64 --decode > "$HOME/.appstoreconnect/private_keys/AuthKey_${APP_STORE_CONNECT_KEY_ID}.p8"
      chmod 600 "$HOME/.appstoreconnect/private_keys/AuthKey_${APP_STORE_CONNECT_KEY_ID}.p8"
    fi
    ;;
  profile)
    # signing.sh profile <ios|mac> – liest das Profil aus APPLE_PROVISIONING_PROFILE_{IOS|MAC}_BASE64
    kind="${2:?ios oder mac}"
    if [ "$kind" = "ios" ]; then b64="${APPLE_PROVISIONING_PROFILE_IOS_BASE64:?Secret APPLE_PROVISIONING_PROFILE_IOS_BASE64 fehlt}"; ext="mobileprovision"; else b64="${APPLE_PROVISIONING_PROFILE_MAC_BASE64:?Secret APPLE_PROVISIONING_PROFILE_MAC_BASE64 fehlt}"; ext="provisionprofile"; fi
    tmp="$RUNNER_TEMP/profile-$kind.$ext"
    printf '%s' "$b64" | base64 --decode > "$tmp"
    security cms -D -i "$tmp" > "$RUNNER_TEMP/profile-$kind.plist"
    uuid=$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$RUNNER_TEMP/profile-$kind.plist")
    name=$(/usr/libexec/PlistBuddy -c 'Print :Name' "$RUNNER_TEMP/profile-$kind.plist")
    appid=$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' "$RUNNER_TEMP/profile-$kind.plist" 2>/dev/null || true)
    for d in "${PROFILE_DIRS[@]}"; do mkdir -p "$d"; cp "$tmp" "$d/$uuid.$ext"; done
    echo "Profil ($kind): $name – App-ID ${appid#*.}"
    case "$appid" in *".de.azuvera.app") ;; *) echo "::error::Das $kind-Profil gehört nicht zur Bundle-ID de.azuvera.app (gefunden: ${appid#*.})"; exit 1 ;; esac
    echo "uuid=$uuid" >> "$GITHUB_OUTPUT"
    echo "name=$name" >> "$GITHUB_OUTPUT"
    ;;
  cleanup)
    security delete-keychain "$KEYCHAIN" 2>/dev/null || true
    for d in "${PROFILE_DIRS[@]}"; do rm -f "$d"/*.mobileprovision "$d"/*.provisionprofile 2>/dev/null || true; done
    rm -rf "$HOME/.appstoreconnect/private_keys" "$RUNNER_TEMP"/profile-* "$RUNNER_TEMP"/cert.p12 2>/dev/null || true
    echo "Temporäre Keychain und Profile entfernt."
    ;;
  *)
    echo "Aufruf: signing.sh setup | profile <ios|mac> | cleanup" >&2
    exit 2
    ;;
esac

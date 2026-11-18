#!/usr/bin/env python3
"""Setzt manuelle Signierung nur für das App-Target (nicht für Swift-Pakete).

Aufruf: set-signing.py --team TEAMID [--ios-profile UUID] [--mac-profile UUID]
"""
import argparse
import re
import sys

PBX = "ios/App/App.xcodeproj/project.pbxproj"
# Build-Konfigurationen des App-Targets (aus der Capacitor-Vorlage)
TARGET_CONFIGS = ["504EC3171FED79650016851F /* Debug */", "504EC3181FED79650016851F /* Release */"]

ap = argparse.ArgumentParser()
ap.add_argument("--team", required=True)
ap.add_argument("--ios-profile", default="")
ap.add_argument("--mac-profile", default="")
a = ap.parse_args()

s = open(PBX, encoding="utf-8").read()
settings = {
    "CODE_SIGN_STYLE": "Manual",
    "DEVELOPMENT_TEAM": a.team,
    '"CODE_SIGN_IDENTITY[sdk=iphoneos*]"': '"Apple Distribution"',
    '"CODE_SIGN_IDENTITY[sdk=macosx*]"': '"Developer ID Application"',
}
if a.ios_profile:
    settings['"PROVISIONING_PROFILE_SPECIFIER[sdk=iphoneos*]"'] = a.ios_profile
if a.mac_profile:
    settings['"PROVISIONING_PROFILE_SPECIFIER[sdk=macosx*]"'] = a.mac_profile

for cfg in TARGET_CONFIGS:
    start = s.find(cfg + " = {")
    if start < 0:
        sys.exit(f"Build-Konfiguration {cfg} nicht gefunden – wurde ios/ neu erzeugt?")
    open_idx = s.index("buildSettings = {", start) + len("buildSettings = {")
    close_idx = s.index("\n\t\t\t};", open_idx)
    block = s[open_idx:close_idx]
    for key, value in settings.items():
        block = re.sub(r"\n\t+" + re.escape(key) + r" = [^;]*;", "", block)
        block = f"\n\t\t\t\t{key} = {value};" + block
    s = s[:open_idx] + block + s[close_idx:]

open(PBX, "w", encoding="utf-8").write(s)
print("Signierung für das App-Target gesetzt.")

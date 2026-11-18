import type { CapacitorConfig } from "@capacitor/cli";

// Native App für iPhone, iPad und Mac (Mac Catalyst). Die App lädt ihre Dateien aus dem
// App-Paket (kein server.url) – gebaut mit `bun run build:native` (setzt VITE_NATIVE_BUILD=true).
const config: CapacitorConfig = {
  appId: "de.azuvera.app",
  appName: "Azuvera",
  // Statischer Client-Build von TanStack Start (SPA-Modus), siehe scripts/native-prepare.mjs.
  webDir: "dist/client",
  ios: {
    // Inhalt reicht unter Statusleiste/Notch; die App setzt env(safe-area-inset-*) selbst.
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;

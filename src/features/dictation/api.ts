export const PUNCTUATION_STORAGE_KEY = "azuvera-dictation-punctuation";

export function readPunctuationPreference(): boolean {
  try {
    const value = window.localStorage.getItem(PUNCTUATION_STORAGE_KEY);
    return value === null ? true : value === "true";
  } catch {
    return true;
  }
}

export function writePunctuationPreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(PUNCTUATION_STORAGE_KEY, String(enabled));
  } catch {
    // Die Auswahl gilt dann nur für diese Sitzung.
  }
}

export const DICTATION_UNSUPPORTED = "Dein Browser unterstützt kein Diktat. Nutze die Mikrofon-Taste deiner Tastatur.";
export const DICTATION_OFFLINE = "Diktat braucht eine Internetverbindung. Die Mikrofon-Taste deiner Tastatur funktioniert oft auch offline.";

export const DICTATION_ERRORS: Record<string, string> = {
  "not-allowed": "Der Zugriff auf das Mikrofon ist blockiert. Erlaube ihn in den Browser-Einstellungen für azuvera.de.",
  "no-speech": "Ich habe nichts gehört.",
  network: "Die Spracherkennung ist gerade nicht erreichbar. Prüfe deine Internetverbindung.",
  "audio-capture": "Es wurde kein Mikrofon gefunden.",
  "language-not-supported": "Deutsch wird von deinem Browser nicht unterstützt.",
};

export function dictationErrorMessage(code: string): string {
  return DICTATION_ERRORS[code] ?? "Das Diktat ist fehlgeschlagen. Bitte versuche es erneut.";
}

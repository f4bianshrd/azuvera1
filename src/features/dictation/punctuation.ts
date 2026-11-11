const SPOKEN: Record<string, string> = {
  "neuer absatz": "\n\n",
  "neue zeile": "\n",
  fragezeichen: "?",
  ausrufezeichen: "!",
  doppelpunkt: ":",
  strichpunkt: ";",
  punkt: ".",
  komma: ",",
};

function upperFirst(text: string): string {
  return text.replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase("de-DE"));
}

/** Wandelt nur ganze gesprochene Befehle um und setzt die deutsche Satzschreibweise fort. */
export function applySpokenPunctuation(text: string, vorherigerText: string): string {
  let result = text.trim().replace(
    /\b(neuer\s+Absatz|neue\s+Zeile|Fragezeichen|Ausrufezeichen|Doppelpunkt|Strichpunkt|Punkt|Komma)\b/gi,
    (command) => SPOKEN[command.toLocaleLowerCase("de-DE").replace(/\s+/g, " ")] ?? command,
  );

  result = result
    .replace(/[ \t]+([.,!?;:])/g, "$1")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/([.?!])(?=\p{L})/gu, "$1 ")
    .replace(/([.?!]\s+|\n+)(\p{L})/gu, (_match, end: string, letter: string) => end + letter.toLocaleUpperCase("de-DE"));

  if (vorherigerText.trim() === "" || /[.?!\n]\s*$/.test(vorherigerText)) result = upperFirst(result);
  return result;
}

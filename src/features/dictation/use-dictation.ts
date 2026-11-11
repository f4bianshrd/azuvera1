import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { dictationErrorMessage } from "./api";

interface RecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEventLike extends Event {
  resultIndex: number;
  results: { length: number; [index: number]: RecognitionResultLike | undefined };
}
interface RecognitionErrorLike extends Event {
  error: string;
}
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionConstructor = new () => RecognitionLike;

function recognitionConstructor(): RecognitionConstructor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Web Speech API mit automatischem Neustart und hartem Ende nach fünf Minuten. */
export function useDictation({ onFinal, onInterim }: { onFinal: (text: string) => void; onInterim: (text: string) => void }) {
  const [supported, setSupported] = useState(true);
  const [online, setOnline] = useState(true);
  const [listening, setListening] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const listeningRef = useRef(false);
  const restartRef = useRef<() => void>(() => undefined);
  const stopRef = useRef<() => void>(() => undefined);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFinalRef = useRef(onFinal);
  const onInterimRef = useRef(onInterim);
  onFinalRef.current = onFinal;
  onInterimRef.current = onInterim;

  const clearTimers = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    intervalRef.current = null;
    timeoutRef.current = null;
  }, []);

  const stop = useCallback(() => {
    listeningRef.current = false;
    clearTimers();
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      try { recognition.stop(); } catch { /* bereits beendet */ }
    }
    setListening(false);
    setAnnouncement((current) => current === "Aufnahme läuft" ? "Aufnahme beendet" : current);
    onInterimRef.current("");
  }, [clearTimers]);
  stopRef.current = stop;

  const startRecognition = useCallback(() => {
    const Constructor = recognitionConstructor();
    if (!Constructor || !listeningRef.current) return;
    const recognition = new Constructor();
    recognitionRef.current = recognition;
    recognition.lang = "de-DE";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript ?? "";
        if (result?.isFinal) finalText += `${transcript} `;
        else interimText += `${transcript} `;
      }
      if (finalText.trim()) onFinalRef.current(finalText.trim());
      onInterimRef.current(interimText.trim());
    };
    recognition.onerror = (event) => {
      toast.error(dictationErrorMessage(event.error));
      if (["not-allowed", "audio-capture", "language-not-supported", "network"].includes(event.error)) stopRef.current();
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (listeningRef.current) window.setTimeout(() => restartRef.current(), 120);
    };
    try {
      recognition.start();
    } catch {
      stopRef.current();
      toast.error("Das Diktat ist fehlgeschlagen. Bitte versuche es erneut.");
    }
  }, []);
  restartRef.current = startRecognition;

  const start = useCallback(() => {
    if (listeningRef.current || !supported || !online || !recognitionConstructor()) return;
    listeningRef.current = true;
    setListening(true);
    setSeconds(0);
    setAnnouncement("Aufnahme läuft");
    const startedAt = Date.now();
    intervalRef.current = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    timeoutRef.current = setTimeout(() => stopRef.current(), 5 * 60 * 1000);
    startRecognition();
  }, [online, startRecognition, supported]);

  useEffect(() => {
    const Constructor = recognitionConstructor();
    setSupported(!!Constructor);
    const updateOnline = () => setOnline(navigator.onLine);
    const visibility = () => { if (document.hidden) stopRef.current(); };
    const pagehide = () => stopRef.current();
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    window.addEventListener("pagehide", pagehide);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener("pagehide", pagehide);
      document.removeEventListener("visibilitychange", visibility);
      stopRef.current();
    };
  }, []);

  return { supported, online, listening, seconds, announcement, start, stop };
}

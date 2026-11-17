import { useEffect, useRef, useState } from "react";
import { CameraOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cameraSupported, openCamera, stopCamera } from "@/lib/platform";
import { extractCode } from "../codes";

type ScanState = "starting" | "running" | "denied" | "unsupported" | "error";

interface Detector { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }

/** Vollbild-Scanner wie in Messenger-Apps: Kamera, Rahmen, Scanlinie. Meldet nur gültige Azuvera-Codes. */
export function QrScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ScanState>("starting");
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null, stopped = false, timer = 0;
    const canvas = document.createElement("canvas");
    const run = async () => {
      if (!cameraSupported()) { setState("unsupported"); return; }
      try { stream = await openCamera(); } catch (e) {
        setState(e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError") ? "denied" : "error");
        return;
      }
      if (stopped) { stopCamera(stream); return; }
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setState("running");
      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      const detector: Detector | null = BD ? new BD({ formats: ["qr_code"] }) : null;
      const jsQR = detector ? null : (await import("jsqr")).default;
      const tick = async () => {
        if (stopped) return;
        let value: string | null = null;
        if (video.readyState >= 2 && video.videoWidth) {
          try {
            if (detector) value = (await detector.detect(video))[0]?.rawValue ?? null;
            else if (jsQR) {
              const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
              canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
              const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              value = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
            }
          } catch { /* nächster Versuch */ }
        }
        if (value) {
          const code = extractCode(value);
          if (code) { stopped = true; stopCamera(stream); onCode(code); return; }
          setHint("Das ist kein Azuvera-Einladungs-Code.");
        }
        timer = window.setTimeout(() => void tick(), 160);
      };
      void tick();
    };
    void run();
    return () => { stopped = true; window.clearTimeout(timer); stopCamera(stream); };
  }, [onCode]);

  const problem = state === "denied"
    ? "Azuvera darf die Kamera nicht nutzen. Erlaube den Kamerazugriff in den Einstellungen deines Browsers oder gib den Code von Hand ein."
    : state === "unsupported" ? "Dieses Gerät bietet keine Kamera an. Gib den Code von Hand ein."
    : state === "error" ? "Die Kamera ließ sich nicht starten. Gib den Code von Hand ein." : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-sidebar text-sidebar-foreground" role="dialog" aria-modal="true" aria-label="QR-Code scannen">
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="text-base font-semibold">QR-Code scannen</p>
        <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground" aria-label="Scanner schließen" onClick={onClose}><X className="size-5" /></Button>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 size-full object-cover" playsInline muted aria-hidden />
        {problem ? (
          <div className="relative mx-6 max-w-sm space-y-4 rounded-2xl bg-sidebar-accent p-6 text-center">
            <CameraOff className="mx-auto size-10 opacity-80" aria-hidden />
            <p className="text-sm leading-relaxed">{problem}</p>
            <Button onClick={onClose}>Code eingeben</Button>
          </div>
        ) : (
          <>
            <div className="pointer-events-none absolute inset-0 bg-sidebar/45" aria-hidden />
            <div className="pointer-events-none relative aspect-square w-[min(72vw,320px)]" aria-hidden>
              <div className="absolute inset-0 rounded-3xl shadow-[0_0_0_9999px_color-mix(in_oklab,var(--sidebar)_55%,transparent)]" />
              {["left-0 top-0 border-l-4 border-t-4 rounded-tl-3xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-3xl", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-3xl", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-3xl"].map((c) => (
                <span key={c} className={`absolute size-12 border-brand-teal ${c}`} />
              ))}
              {state === "running" && <span className="absolute inset-x-6 top-6 h-0.5 animate-[scanline_2.2s_ease-in-out_infinite] rounded-full bg-brand-teal shadow-[0_0_16px_var(--brand-teal)]" />}
            </div>
          </>
        )}
      </div>
      <div className="space-y-1 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 text-center">
        <p className="text-sm font-medium">{state === "starting" ? "Kamera wird gestartet …" : "Halte den QR-Code in den Rahmen."}</p>
        <p className="min-h-5 text-xs opacity-75" aria-live="polite">{hint ?? "Der Code wird automatisch erkannt."}</p>
      </div>
    </div>
  );
}

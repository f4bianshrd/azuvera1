import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export const SIGNATURE_WIDTH = 600;
export const SIGNATURE_HEIGHT = 200;

interface Stroke {
  points: { x: number; y: number }[];
}

/**
 * Unterschriftsfeld mit Pointer Events (Touch, Stift, Maus), glatten Linien
 * und touch-action: none. Export: PNG 600×200, transparent, schwarze Tinte.
 */
export function SignaturePad({ onChange }: { onChange: (valid: boolean, png: Blob | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);

  const redraw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokesRef.current) {
      if (stroke.points.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        const prev = stroke.points[i - 1]!;
        const p = stroke.points[i]!;
        ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + p.x) / 2, (prev.y + p.y) / 2);
      }
      ctx.stroke();
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = SIGNATURE_WIDTH;
    canvas.height = SIGNATURE_HEIGHT;
  }, []);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const emit = () => {
    const strokes = strokesRef.current;
    const totalLength = strokes.reduce(
      (sum, s) =>
        sum +
        s.points.reduce((acc, p, i) => {
          if (i === 0) return 0;
          const prev = s.points[i - 1];
          return acc + Math.hypot(p.x - prev.x, p.y - prev.y);
        }, 0),
      0,
    );
    const valid = strokes.length >= 3 || totalLength > 120;
    setIsEmpty(strokes.length === 0);
    if (!valid) {
      onChange(false, null);
      return;
    }
    redraw();
    canvasRef.current?.toBlob((blob) => onChange(true, blob), "image/png");
  };

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border bg-background">
        <canvas
          ref={canvasRef}
          className="block h-40 w-full cursor-crosshair touch-none landscape:h-[70vh]"
          aria-label="Unterschriftsfeld"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawingRef.current = true;
            strokesRef.current.push({ points: [pointFromEvent(e)] });
          }}
          onPointerMove={(e) => {
            if (!drawingRef.current) return;
            const stroke = strokesRef.current[strokesRef.current.length - 1];
            stroke?.points.push(pointFromEvent(e));
            redraw();
          }}
          onPointerUp={() => {
            drawingRef.current = false;
            emit();
          }}
          onPointerCancel={() => {
            drawingRef.current = false;
            emit();
          }}
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {isEmpty ? "Mit Finger, Stift oder Maus unterschreiben (mind. 3 Striche)." : "Sieht gut aus."}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isEmpty}
          onClick={() => {
            strokesRef.current = [];
            redraw();
            setIsEmpty(true);
            onChange(false, null);
          }}
        >
          Löschen
        </Button>
      </div>
    </div>
  );
}

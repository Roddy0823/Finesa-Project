import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current!;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const w = c.offsetWidth;
    const h = c.offsetHeight;
    c.width = w * ratio;
    c.height = h * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0B2545";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    ref.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const p = pos(e);
    const ctx = ref.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(last.current!.x, last.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (empty) setEmpty(false);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(ref.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="relative rounded-md border-2 border-dashed border-input bg-card">
        <canvas
          ref={ref}
          className="h-48 w-full touch-none cursor-crosshair sm:h-56"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          aria-label="Área de firma"
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Firme aquí con el dedo o el mouse
          </span>
        )}
        <div className="pointer-events-none absolute bottom-10 left-6 right-6 border-b border-border" />
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={clear}>
        <Eraser className="mr-1 h-4 w-4" /> Borrar firma
      </Button>
    </div>
  );
}

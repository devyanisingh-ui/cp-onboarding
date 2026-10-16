import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';
import { Button } from '@/components/ui';

export interface SignaturePadHandle {
  /** PNG data URL of the drawing, or null if nothing was drawn. */
  toPng(): string | null;
  clear(): void;
}

/** Draw-with-finger/mouse/pen signature box (pointer events, crisp on high-DPI screens). */
export const SignaturePad = forwardRef<SignaturePadHandle, { onChange?: (hasInk: boolean) => void; label?: string }>(function SignaturePad({ onChange, label = 'Draw your signature' }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  const setup = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = c.getBoundingClientRect();
    c.width = Math.round(width * ratio);
    c.height = Math.round(height * ratio);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#0f1a3a';
  }, []);

  useEffect(() => {
    setup();
  }, [setup]);

  const mark = (v: boolean) => {
    setHasInk(v);
    onChange?.(v);
  };

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  useImperativeHandle(ref, () => ({
    toPng: () => (hasInk && canvas.current ? canvas.current.toDataURL('image/png') : null),
    clear: () => {
      setup();
      mark(false);
    },
  }));

  return (
    <div>
      <div className="relative">
        <canvas
          ref={canvas}
          aria-label={label}
          role="img"
          className="h-40 w-full touch-none rounded-lg border border-dashed border-line-strong bg-white"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            last.current = point(e);
          }}
          onPointerMove={(e) => {
            if (!drawing.current || !last.current) return;
            const ctx = e.currentTarget.getContext('2d');
            const p = point(e);
            if (!ctx) return;
            ctx.beginPath();
            ctx.moveTo(last.current.x, last.current.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            last.current = p;
            if (!hasInk) mark(true);
          }}
          onPointerUp={() => {
            drawing.current = false;
            last.current = null;
          }}
          onPointerLeave={() => {
            drawing.current = false;
            last.current = null;
          }}
        />
        {!hasInk && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-subtle">Sign here with your mouse, finger or stylus</p>}
        <span className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-line" aria-hidden />
      </div>
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="ghost" icon={<Eraser className="size-4" />} onClick={() => (setup(), mark(false))} disabled={!hasInk}>
          Clear
        </Button>
      </div>
    </div>
  );
});

export const SCRIPT_FONT = '"Segoe Script", "Brush Script MT", "Lucida Handwriting", "Apple Chancery", cursive';

/** Renders a typed name in a handwriting-style font to a PNG data URL. */
export function typedSignaturePng(name: string): string {
  const c = document.createElement('canvas');
  const ratio = 2;
  c.width = 600 * ratio;
  c.height = 160 * ratio;
  const ctx = c.getContext('2d')!;
  ctx.scale(ratio, ratio);
  ctx.fillStyle = '#0f1a3a';
  ctx.textBaseline = 'middle';
  let size = 54;
  do {
    ctx.font = `italic ${size}px ${SCRIPT_FONT}`;
    size -= 2;
  } while (ctx.measureText(name).width > 560 && size > 18);
  ctx.fillText(name, 20, 84);
  return c.toDataURL('image/png');
}

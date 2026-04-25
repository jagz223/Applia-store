import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const KNOB = 52;
const PAD = 6;
const THRESHOLD = 0.82;

type Props = {
  receiving: boolean;
  onReceivingChange: (next: boolean) => void;
  className?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  slideNeedsExtraPush?: boolean;
};

/**
 * Deslizamiento obligatorio para conectar/desconectar recepción de viajes Car Go.
 * Sin completar el gesto no cambia el estado.
 */
export function SlideToCargoOnline({
  receiving,
  onReceivingChange,
  className,
  disabled = false,
  style,
  slideNeedsExtraPush = false,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [maxX, setMaxX] = useState(0);
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const dragStartOffset = useRef(0);
  const dragStartClientX = useRef(0);
  const [dragging, setDragging] = useState(false);
  const activeDrag = useRef(false);

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const m = Math.max(0, w - KNOB - PAD * 2);
    setMaxX(m);
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  // Sincronizar antes de pintar para evitar “saltos” al medir/anchar el track.
  useLayoutEffect(() => {
    const next = receiving ? maxX : 0;
    setOffset(next);
    offsetRef.current = next;
  }, [receiving, maxX]);

  const onKnobPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    if (maxX <= 0) return;
    e.preventDefault();
    activeDrag.current = true;
    setDragging(true);
    dragStartOffset.current = offsetRef.current;
    dragStartClientX.current = e.clientX;
    (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
  };

  const onKnobPointerMove = (e: React.PointerEvent) => {
    if (!activeDrag.current || maxX <= 0) return;
    const dx = e.clientX - dragStartClientX.current;
    const next = Math.min(maxX, Math.max(0, dragStartOffset.current + dx));
    offsetRef.current = next;
    setOffset(next);
  };

  const finishDrag = useCallback(() => {
    activeDrag.current = false;
    setDragging(false);
    if (maxX <= 0) return;
    const off = offsetRef.current;
    const ratio = off / maxX;
    if (!receiving) {
      if (ratio >= THRESHOLD) onReceivingChange(true);
      else {
        offsetRef.current = 0;
        setOffset(0);
      }
    } else {
      if (ratio <= 1 - THRESHOLD) onReceivingChange(false);
      else {
        offsetRef.current = maxX;
        setOffset(maxX);
      }
    }
  }, [maxX, receiving, onReceivingChange]);

  const onKnobPointerUp = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLButtonElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    finishDrag();
  };

  const label = receiving
    ? "Desliza para dejar de recibir viajes Car Go"
    : "Desliza para recibir viajes Car Go";

  return (
    <div
      className={cn(
        "relative select-none touch-none rounded-full border-2 shadow-inner overflow-hidden ring-1 ring-black/5",
        disabled
          ? "border-muted-foreground/25 bg-muted/30 opacity-80"
          : receiving
            ? "border-amber-500/50 bg-amber-500/10"
            : "border-primary/40 bg-primary/10",
        className
      )}
      style={{ minHeight: KNOB + PAD * 2, ...style }}
    >
      <div ref={trackRef} className="relative h-[64px] w-full flex items-center" role="presentation">
        <p
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center justify-center px-14 text-center text-sm font-semibold leading-tight",
            disabled
              ? "text-muted-foreground"
              : receiving
                ? "text-amber-900 dark:text-amber-100/95"
                : "text-primary/90"
          )}
        >
            {disabled ? "Completa verificación y registra tu vehículo para recibir viajes" : label}
        </p>
        <div style={{ paddingBottom: slideNeedsExtraPush ? "10px" : "55px" }}>
          <button
            type="button"
            aria-label={receiving ? "Control para dejar de recibir viajes" : "Control para empezar a recibir viajes"}
            className={cn(
              "absolute top-1/2 z-[2] flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 bg-background shadow-lg ring-1 ring-black/10",
              disabled
                ? "cursor-not-allowed border-muted-foreground/30 text-muted-foreground"
                : "cursor-grab active:cursor-grabbing",
              !disabled && (receiving ? "border-amber-500 text-amber-700" : "border-primary text-primary")
            )}
            style={{
              left: PAD,
              transform: `translate3d(${offset}px, -50%, 0)`,
              transition: dragging ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
            onPointerDown={onKnobPointerDown}
            onPointerMove={onKnobPointerMove}
            onPointerUp={onKnobPointerUp}
            onPointerCancel={onKnobPointerUp}
            disabled={disabled}
          >
            <ChevronRight className="h-7 w-7 shrink-0" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

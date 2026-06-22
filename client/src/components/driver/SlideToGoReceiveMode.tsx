import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Car, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GoDriverReceiveMode } from "@/lib/cargo-driver-storage";
import { MOBILITY_UI } from "@shared/mobility-ui-labels";
import {
  RECEIVE_MODE_CAPTION_CLASS,
  RECEIVE_MODE_MAP_CAPTION_CLASS,
  receiveModeCaptionIsCompact,
  receiveModeCaptionTone,
  receiveModeHybridHintText,
  receiveModeOffGuideText,
  receiveModeShowsCaption,
} from "@/lib/driver-receive-mode-caption";

const KNOB = 52;
const PAD = 6;
const TRACK_H = 56;
const SNAP_THRESHOLD = 0.28;
const TAP_MOVE_PX = 10;

type Props = {
  mode: GoDriverReceiveMode;
  onModeChange: (next: GoDriverReceiveMode) => void;
  canTaxi: boolean;
  canDelivery: boolean;
  /** En mapa: sin panel; texto flotante con sombra y track semitransparente. */
  variant?: "default" | "mapOverlay";
  className?: string;
  disabled?: boolean;
  disabledHint?: string;
  style?: React.CSSProperties;
};

function offsetForMode(mode: GoDriverReceiveMode, maxX: number, canTaxi: boolean, canDelivery: boolean): number {
  if (maxX <= 0) return 0;
  if (mode === "taxi" && canTaxi) return 0;
  if (mode === "delivery" && canDelivery) return maxX;
  if (mode === "both" || mode === "off") return maxX / 2;
  return maxX / 2;
}

function nearestMode(
  ratio: number,
  maxX: number,
  canTaxi: boolean,
  canDelivery: boolean,
): GoDriverReceiveMode {
  if (maxX <= 0) return "off";
  const candidates: { mode: GoDriverReceiveMode; ratio: number }[] = [{ mode: "off", ratio: 0.5 }];
  if (canTaxi) candidates.push({ mode: "taxi", ratio: 0 });
  if (canDelivery) candidates.push({ mode: "delivery", ratio: 1 });
  let best = candidates[0]!;
  let bestDist = Math.abs(ratio - best.ratio);
  for (const c of candidates) {
    const d = Math.abs(ratio - c.ratio);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  if (bestDist > SNAP_THRESHOLD && ratio > 0.35 && ratio < 0.65) return "off";
  return best.mode;
}

/**
 * Control de 3 posiciones: izquierda = taxi, centro = apagado, derecha = delivery.
 * Toque rápido en el botón (sin deslizar) = modo híbrido (taxi + delivery) u off.
 */
export function SlideToGoReceiveMode({
  mode,
  onModeChange,
  canTaxi,
  canDelivery,
  variant = "default",
  className,
  disabled = false,
  disabledHint,
  style,
}: Props) {
  const mapOverlay = variant === "mapOverlay";
  const hybridTapEnabled = canTaxi && canDelivery;
  const trackRef = useRef<HTMLDivElement>(null);
  const [maxX, setMaxX] = useState(0);
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const dragStartOffset = useRef(0);
  const dragStartClientX = useRef(0);
  const pointerDownClientX = useRef(0);
  const pointerMovedRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const activeDrag = useRef(false);

  const captionTone = receiveModeCaptionTone(mode);
  const showCaption = receiveModeShowsCaption(mode, disabled);
  const compactCaption = receiveModeCaptionIsCompact(mode, disabled);

  const floatingCaption = useMemo(() => {
    if (disabled) {
      return disabledHint ?? "Completa verificación y registra tu vehículo para recibir servicios";
    }
    if (mode === "both") return receiveModeHybridHintText();
    if (mode === "off") return receiveModeOffGuideText(canTaxi, canDelivery);
    return null;
  }, [mode, disabled, disabledHint, canTaxi, canDelivery]);

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const w = el.clientWidth;
    setMaxX(Math.max(0, w - KNOB - PAD * 2));
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  useLayoutEffect(() => {
    const next = offsetForMode(mode, maxX, canTaxi, canDelivery);
    setOffset(next);
    offsetRef.current = next;
  }, [mode, maxX, canTaxi, canDelivery]);

  const snapToMode = useCallback(
    (next: GoDriverReceiveMode) => {
      const snap = offsetForMode(next, maxX, canTaxi, canDelivery);
      offsetRef.current = snap;
      setOffset(snap);
    },
    [maxX, canTaxi, canDelivery],
  );

  const onKnobPointerDown = (e: React.PointerEvent) => {
    if (disabled || maxX <= 0) return;
    e.preventDefault();
    activeDrag.current = true;
    setDragging(true);
    pointerMovedRef.current = false;
    pointerDownClientX.current = e.clientX;
    dragStartOffset.current = offsetRef.current;
    dragStartClientX.current = e.clientX;
    try {
      (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onKnobPointerMove = (e: React.PointerEvent) => {
    if (!activeDrag.current || maxX <= 0) return;
    const dxFromDown = e.clientX - pointerDownClientX.current;
    if (Math.abs(dxFromDown) > TAP_MOVE_PX) pointerMovedRef.current = true;
    const dx = e.clientX - dragStartClientX.current;
    const next = Math.min(maxX, Math.max(0, dragStartOffset.current + dx));
    offsetRef.current = next;
    setOffset(next);
  };

  const finishDrag = useCallback(() => {
    activeDrag.current = false;
    setDragging(false);
    if (maxX <= 0) return;
    const ratio = offsetRef.current / maxX;
    const next = nearestMode(ratio, maxX, canTaxi, canDelivery);
    if (next !== mode) onModeChange(next);
    snapToMode(next);
  }, [maxX, canTaxi, canDelivery, mode, onModeChange, snapToMode]);

  const releaseCaptureSafe = (el: HTMLButtonElement, pointerId: number) => {
    try {
      if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
    } catch {
      /* ignore */
    }
  };

  const onKnobPointerUp = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLButtonElement;
    const wasActive = activeDrag.current;
    releaseCaptureSafe(el, e.pointerId);
    if (!wasActive) return;

    if (hybridTapEnabled && !pointerMovedRef.current) {
      activeDrag.current = false;
      setDragging(false);
      const next: GoDriverReceiveMode = mode === "both" ? "off" : "both";
      if (next !== mode) onModeChange(next);
      snapToMode(next);
      return;
    }

    finishDrag();
  };

  const isHybridVisual = mode === "both";

  const showTaxiTrackHint = canTaxi && mode !== "taxi";
  const showDeliveryTrackHint = canDelivery && mode !== "delivery";

  const trackTone =
    mode === "taxi"
      ? "border-sky-600/45 bg-sky-500/15 dark:border-sky-500/50 dark:bg-sky-500/10"
      : mode === "delivery"
        ? "border-violet-600/45 bg-violet-500/15 dark:border-violet-500/50 dark:bg-violet-500/10"
        : isHybridVisual
          ? "border-sky-500/40 dark:border-transparent shadow-[0_0_0_2px_rgba(14,165,233,0.28),0_0_0_2px_rgba(139,92,246,0.28)] dark:shadow-[0_0_0_2px_rgba(14,165,233,0.35),0_0_0_2px_rgba(139,92,246,0.35)]"
          : "border-border/80 bg-muted/50 dark:border-muted-foreground/35 dark:bg-muted/25";

  const hybridTrackBackground =
    "linear-gradient(90deg, rgba(14,165,233,0.72) 0%, rgba(45,212,191,0.5) 42%, rgba(52,211,153,0.45) 50%, rgba(167,139,250,0.5) 58%, rgba(139,92,246,0.72) 100%)";

  const hybridKnobBackground =
    "linear-gradient(135deg, #0ea5e9 0%, #2dd4bf 42%, #34d399 50%, #a78bfa 58%, #8b5cf6 100%)";

  const knobTone =
    mode === "taxi"
      ? "border-sky-600 bg-background text-sky-800 shadow-md dark:border-sky-500 dark:bg-transparent dark:text-sky-200"
      : mode === "delivery"
        ? "border-violet-600 bg-background text-violet-800 shadow-md dark:border-violet-500 dark:bg-transparent dark:text-violet-200"
        : isHybridVisual
          ? "border-white/95 text-white shadow-[0_4px_14px_rgba(14,165,233,0.4),0_4px_14px_rgba(139,92,246,0.4)]"
          : "border-foreground/25 bg-background text-foreground/70 shadow-md dark:border-muted-foreground/50 dark:bg-transparent dark:text-muted-foreground";

  const knobAriaLabel =
    mode === "both"
      ? "Modo híbrido activo; toca para apagar o desliza a taxi o delivery"
      : mode === "taxi"
        ? "Recibiendo taxi; desliza al centro para apagar"
        : mode === "delivery"
          ? "Recibiendo delivery; desliza al centro para apagar"
          : hybridTapEnabled
            ? "Apagado; toca para modo híbrido o desliza a taxi o delivery"
            : "Apagado; desliza a taxi o delivery";

  const captionClass = disabled
    ? mapOverlay
      ? "text-muted-foreground dark:text-white/80"
      : "text-muted-foreground"
    : mapOverlay
      ? RECEIVE_MODE_MAP_CAPTION_CLASS[captionTone]
      : RECEIVE_MODE_CAPTION_CLASS[captionTone];

  return (
    <div className={cn("mx-auto w-full", showCaption ? "space-y-1" : "", className)} style={style}>
      {showCaption && floatingCaption ? (
        <div
          className={cn(
            compactCaption
              ? "px-0.5"
              : mapOverlay &&
                  "rounded-xl bg-background/92 px-2.5 py-1.5 shadow-md ring-1 ring-black/[0.08] backdrop-blur-md dark:bg-black/35 dark:ring-white/15 dark:shadow-lg",
          )}
        >
          <p
            className={cn(
              "text-center transition-colors duration-200",
              compactCaption
                ? "px-0.5 text-[10px] font-normal leading-tight text-muted-foreground dark:text-white/75"
                : cn(
                    "px-1 text-[11px] font-medium leading-snug sm:text-[12px]",
                    captionClass,
                  ),
            )}
            role="status"
            aria-live="polite"
          >
            {floatingCaption}
          </p>
        </div>
      ) : null}
      <div
        className={cn(
          "relative select-none touch-none rounded-full border-2",
          mapOverlay
            ? disabled
              ? "border-border/70 bg-background/75 opacity-90 shadow-md ring-1 ring-black/[0.06] backdrop-blur-md dark:border-white/25 dark:bg-black/25 dark:opacity-80 dark:ring-0"
              : cn(
                  trackTone,
                  isHybridVisual
                    ? "bg-white/88 shadow-lg ring-2 ring-sky-500/30 backdrop-blur-md dark:bg-slate-950/40 dark:ring-1 dark:ring-white/20"
                    : "bg-background/92 shadow-md ring-1 ring-black/[0.08] backdrop-blur-md dark:bg-background/70 dark:ring-black/10",
                )
            : cn(
                "shadow-inner ring-1 ring-black/5 dark:ring-black/5",
                disabled ? "border-muted-foreground/25 bg-muted/30 opacity-80" : trackTone,
                isHybridVisual && !disabled && "shadow-md",
              ),
        )}
        style={{
          minHeight: KNOB + PAD * 2,
          ...(!disabled && isHybridVisual
            ? {
                backgroundImage: hybridTrackBackground,
                backgroundColor: mapOverlay ? undefined : "rgba(255,255,255,0.94)",
              }
            : {}),
        }}
      >
        <div
          ref={trackRef}
          className="relative w-full flex items-center"
          style={{ height: TRACK_H }}
          role="presentation"
        >
          {!disabled ? (
            <>
              {showTaxiTrackHint ? (
                <span
                  className={cn(
                    "pointer-events-none absolute left-3 top-1/2 z-[1] flex -translate-y-1/2 items-center gap-1 text-[10px] font-semibold",
                    mapOverlay
                      ? "text-sky-900 dark:text-sky-100/90"
                      : "text-sky-800/90 dark:text-sky-100/75",
                  )}
                >
                  <Car className="h-3.5 w-3.5" aria-hidden />
                  Taxi
                </span>
              ) : null}
              {showDeliveryTrackHint ? (
                <span
                  className={cn(
                    "pointer-events-none absolute right-3 top-1/2 z-[1] flex -translate-y-1/2 items-center gap-1 text-[10px] font-semibold",
                    mapOverlay
                      ? "text-violet-900 dark:text-violet-100/90"
                      : "text-violet-800/90 dark:text-violet-100/75",
                  )}
                >
                  <Package className="h-3.5 w-3.5" aria-hidden />
                  {MOBILITY_UI.delivery}
                </span>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            aria-label={knobAriaLabel}
            className={cn(
              "absolute top-1/2 z-[2] flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 shadow-lg ring-1 ring-black/10 dark:ring-black/10",
              disabled ? "cursor-not-allowed border-muted-foreground/30 bg-background" : "cursor-grab active:cursor-grabbing",
              !disabled && knobTone,
              !disabled && isHybridVisual && "!bg-transparent",
            )}
            style={{
              left: PAD,
              transform: `translate3d(${offset}px, -50%, 0)`,
              transition: dragging ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
              ...(!disabled && isHybridVisual
                ? { backgroundImage: hybridKnobBackground, backgroundColor: "transparent" }
                : {}),
            }}
            onPointerDown={onKnobPointerDown}
            onPointerMove={onKnobPointerMove}
            onPointerUp={onKnobPointerUp}
            onPointerCancel={onKnobPointerUp}
            onLostPointerCapture={() => {
              if (!activeDrag.current) return;
              activeDrag.current = false;
              setDragging(false);
              snapToMode(mode);
            }}
            disabled={disabled}
          >
            {mode === "both" ? (
              <span className="flex items-center gap-0.5 drop-shadow-sm" aria-hidden>
                <Car className="h-5 w-5 shrink-0 text-white" />
                <Package className="h-5 w-5 shrink-0 text-white" />
              </span>
            ) : mode === "taxi" ? (
              <Car className="h-6 w-6 shrink-0" aria-hidden />
            ) : mode === "delivery" ? (
              <Package className="h-6 w-6 shrink-0" aria-hidden />
            ) : (
              <span
                className="h-2.5 w-2.5 rounded-full bg-foreground/55 dark:bg-muted-foreground/70"
                aria-hidden
              />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

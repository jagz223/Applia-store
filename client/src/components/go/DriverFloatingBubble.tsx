import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useGoDriverBubble } from "@/contexts/GoDriverBubbleContext";
import { driverBubbleGlowClassName } from "@/lib/driver-bubble-receive-accent";
import {
  defaultDriverBubblePosition,
  isDriverBubbleMainPath,
  readDriverBubblePosition,
  writeDriverBubblePosition,
  type DriverBubblePosition,
} from "@/lib/go-driver-bubble-mode";

const BUBBLE_SIZE = 72;

function clampPosition(pos: DriverBubblePosition): DriverBubblePosition {
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - BUBBLE_SIZE - margin);
  const maxY = Math.max(margin, window.innerHeight - BUBBLE_SIZE - margin);
  return {
    x: Math.min(Math.max(margin, pos.x), maxX),
    y: Math.min(Math.max(margin, pos.y), maxY),
  };
}

/**
 * Burbuja arrastrable en la pestaña (fallback) cuando el modo minimizado está activo.
 * En Android con PiP, la ventana flotante del sistema es la principal.
 */
export function DriverFloatingBubble() {
  const [location] = useLocation();
  const { supported, active, isMinimized, pipActive, receiveMode, receiving, expand } = useGoDriverBubble();
  const onDriverMainView = isDriverBubbleMainPath(location);
  const glowClass = driverBubbleGlowClassName(receiveMode, receiving);
  const [pos, setPos] = useState<DriverBubblePosition>(() =>
    clampPosition(readDriverBubblePosition() ?? defaultDriverBubblePosition()),
  );
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origin: DriverBubblePosition } | null>(
    null,
  );
  const movedRef = useRef(false);

  useEffect(() => {
    const onResize = () => setPos((p) => clampPosition(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      movedRef.current = false;
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origin: pos,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [pos],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.hypot(dx, dy) > 6) movedRef.current = true;
    const next = clampPosition({ x: drag.origin.x + dx, y: drag.origin.y + dy });
    setPos(next);
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      writeDriverBubblePosition(pos);
      if (!movedRef.current) {
        expand();
      }
    },
    [expand, pos],
  );

  if (!supported || !active || !onDriverMainView || !isMinimized || pipActive) return null;

  return createPortal(
    <button
      type="button"
      className={cn(
        "fixed z-[80] touch-none select-none overflow-hidden rounded-full bg-slate-950 p-0",
        glowClass,
      )}
      style={{ width: BUBBLE_SIZE, height: BUBBLE_SIZE, left: pos.x, top: pos.y }}
      aria-label={receiving ? "Conductor en línea. Toca para abrir el panel." : "Panel conductor. Toca para abrir."}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <img
        src="/genfeb-logo-new.png"
        alt=""
        className="h-full w-full object-cover"
        width={BUBBLE_SIZE}
        height={BUBBLE_SIZE}
        draggable={false}
      />
    </button>,
    document.body,
  );
}

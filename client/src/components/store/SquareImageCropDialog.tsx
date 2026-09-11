import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  computeSquareCropFromViewport,
  cropSquareImageToFile,
  loadImageElement,
} from "@/lib/square-image-crop";
import {
  storeAdminDialogBodyClass,
  storeAdminDialogContentClass,
  storeAdminDialogFooterClass,
  storeAdminDialogHeaderClass,
  storeAdminDialogShellClass,
  storeTransparentImageSurfaceStyle,
} from "@/components/store/store-admin-ui";

const VIEWPORT_SIZE = 320;
/** 1 = cubre el cuadrado; menos de 1 deja margen transparente alrededor. */
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.1;
const ZOOM_FIT = 1;

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
}

type SquareImageCropDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string | null;
  fileName?: string;
  fileMimeType?: string;
  onConfirm: (file: File) => void | Promise<void>;
};

export function SquareImageCropDialog({
  open,
  onOpenChange,
  imageSrc,
  fileName = "producto.png",
  fileMimeType,
  onConfirm,
}: SquareImageCropDialogProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const zoomRef = useRef(1);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  zoomRef.current = zoom;

  const applyZoom = useCallback((next: number) => {
    setZoom(clampZoom(next));
  }, []);

  useEffect(() => {
    if (!open || !imageSrc) {
      setImgSize(null);
      setZoom(ZOOM_FIT);
      setOffset({ x: 0, y: 0 });
      setError(null);
      return;
    }
    let cancelled = false;
    void loadImageElement(imageSrc)
      .then((img) => {
        if (cancelled) return;
        setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "No se pudo cargar la imagen.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, imageSrc]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !open) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const direction = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      applyZoom(zoomRef.current + direction);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, applyZoom]);

  const baseScale =
    imgSize != null
      ? Math.max(VIEWPORT_SIZE / imgSize.w, VIEWPORT_SIZE / imgSize.h)
      : 1;
  const scale = baseScale * zoom;
  const dispW = imgSize ? imgSize.w * scale : VIEWPORT_SIZE;
  const dispH = imgSize ? imgSize.h * scale : VIEWPORT_SIZE;
  const imgLeft = (VIEWPORT_SIZE - dispW) / 2 + offset.x;
  const imgTop = (VIEWPORT_SIZE - dispH) / 2 + offset.y;

  function pointerDistance(): number {
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!imgSize) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size >= 2) {
      dragRef.current = null;
      pinchRef.current = { distance: pointerDistance() || 1, zoom: zoomRef.current };
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, offsetX: offset.x, offsetY: offset.y };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const dist = pointerDistance();
      if (dist > 0 && pinchRef.current.distance > 0) {
        applyZoom(pinchRef.current.zoom * (dist / pinchRef.current.distance));
      }
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    setOffset({
      x: drag.offsetX + (e.clientX - drag.x),
      y: drag.offsetY + (e.clientY - drag.y),
    });
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) dragRef.current = null;
  }

  async function handleApply() {
    if (!imageSrc || !imgSize) return;
    setLoading(true);
    setError(null);
    try {
      const crop = computeSquareCropFromViewport(
        imgSize.w,
        imgSize.h,
        VIEWPORT_SIZE,
        zoom,
        offset.x,
        offset.y,
      );
      const file = await cropSquareImageToFile(imageSrc, crop, fileName, {
        mimeType: fileMimeType,
      });
      await onConfirm(file);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo recortar la imagen.");
    } finally {
      setLoading(false);
    }
  }

  const zoomDisabled = !imgSize || loading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        layer="elevated"
        shellClassName={storeAdminDialogShellClass}
        className={storeAdminDialogContentClass("max-w-md")}
      >
        <DialogHeader className={storeAdminDialogHeaderClass}>
          <DialogTitle>Recortar foto</DialogTitle>
          <DialogDescription>
            Ajusta la imagen dentro del cuadrado. Con − la haces más pequeña (el fondo transparente
            se conserva). Arrastra para mover; + acerca.
          </DialogDescription>
        </DialogHeader>

        <div className={storeAdminDialogBodyClass}>
          <div
            ref={viewportRef}
            className="relative mx-auto overflow-hidden rounded-xl border border-border touch-none"
            style={{
              width: VIEWPORT_SIZE,
              height: VIEWPORT_SIZE,
              touchAction: "none",
              ...storeTransparentImageSurfaceStyle,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {imageSrc && imgSize ? (
              <img
                src={imageSrc}
                alt=""
                draggable={false}
                className="absolute max-w-none select-none"
                style={{ left: imgLeft, top: imgTop, width: dispW, height: dispH }}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-primary/80" />
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border border-white/20" />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="crop-zoom" className="text-sm">
                Zoom
              </Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full"
                disabled={zoomDisabled || zoom <= ZOOM_MIN}
                aria-label="Alejar"
                onClick={() => applyZoom(zoom - ZOOM_STEP)}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <input
                id="crop-zoom"
                type="range"
                min={ZOOM_MIN}
                max={ZOOM_MAX}
                step={0.05}
                value={zoom}
                disabled={zoomDisabled}
                onChange={(e) => applyZoom(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full"
                disabled={zoomDisabled || zoom >= ZOOM_MAX}
                aria-label="Acercar"
                onClick={() => applyZoom(zoom + ZOOM_STEP)}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full"
                disabled={zoomDisabled || (zoom === ZOOM_FIT && offset.x === 0 && offset.y === 0)}
                aria-label="Llenar el cuadrado"
                title="Llenar el cuadrado"
                onClick={() => {
                  applyZoom(ZOOM_FIT);
                  setOffset({ x: 0, y: 0 });
                }}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className={storeAdminDialogFooterClass}>
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-full"
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="h-11 rounded-full font-semibold"
            disabled={loading || !imgSize}
            onClick={() => void handleApply()}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Usar recorte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

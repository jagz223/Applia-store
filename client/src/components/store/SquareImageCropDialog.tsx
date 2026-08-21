import { useEffect, useRef, useState } from "react";
import { Loader2, ZoomIn } from "lucide-react";
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
} from "@/components/store/store-admin-ui";

const VIEWPORT_SIZE = 320;

type SquareImageCropDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string | null;
  fileName?: string;
  onConfirm: (file: File) => void | Promise<void>;
};

export function SquareImageCropDialog({
  open,
  onOpenChange,
  imageSrc,
  fileName = "producto.jpg",
  onConfirm,
}: SquareImageCropDialogProps) {
  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !imageSrc) {
      setImgSize(null);
      setZoom(1);
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

  const baseScale =
    imgSize != null
      ? Math.max(VIEWPORT_SIZE / imgSize.w, VIEWPORT_SIZE / imgSize.h)
      : 1;
  const scale = baseScale * zoom;
  const dispW = imgSize ? imgSize.w * scale : VIEWPORT_SIZE;
  const dispH = imgSize ? imgSize.h * scale : VIEWPORT_SIZE;
  const imgLeft = (VIEWPORT_SIZE - dispW) / 2 + offset.x;
  const imgTop = (VIEWPORT_SIZE - dispH) / 2 + offset.y;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!imgSize) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, offsetX: offset.x, offsetY: offset.y };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    setOffset({
      x: drag.offsetX + (e.clientX - drag.x),
      y: drag.offsetY + (e.clientY - drag.y),
    });
  }

  function onPointerUp() {
    dragRef.current = null;
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
      const file = await cropSquareImageToFile(imageSrc, crop, fileName);
      await onConfirm(file);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo recortar la imagen.");
    } finally {
      setLoading(false);
    }
  }

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
            Ajusta la imagen dentro del cuadrado. Arrastra para mover y usa el zoom si necesitas.
          </DialogDescription>
        </DialogHeader>

        <div className={storeAdminDialogBodyClass}>
          <div
            className="relative mx-auto overflow-hidden rounded-xl border border-border bg-muted/30 touch-none"
            style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE }}
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
            <Label htmlFor="crop-zoom" className="flex items-center gap-2 text-sm">
              <ZoomIn className="h-4 w-4" />
              Zoom
            </Label>
            <input
              id="crop-zoom"
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              disabled={!imgSize || loading}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-primary"
            />
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

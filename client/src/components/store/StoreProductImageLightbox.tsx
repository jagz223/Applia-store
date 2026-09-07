import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { StoreProductDualImage } from "@/components/store/StoreProductDualImage";
import { cn } from "@/lib/utils";

type StoreProductImageLightboxProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  primaryUrl?: string | null;
  secondaryUrl?: string | null;
  title?: string;
};

/**
 * Vista ampliada a casi pantalla completa:
 * imagen grande + thumb inferior derecha; clic en thumb intercambia.
 */
export function StoreProductImageLightbox({
  open,
  onOpenChange,
  primaryUrl,
  secondaryUrl,
  title,
}: StoreProductImageLightboxProps) {
  const primary = primaryUrl?.trim() || null;
  const secondary = secondaryUrl?.trim() || null;
  const [swapped, setSwapped] = useState(false);

  useEffect(() => {
    if (open) setSwapped(false);
  }, [open, primary, secondary]);

  if (!primary) return null;

  const main = swapped && secondary ? secondary : primary;
  const thumb = swapped ? primary : secondary;
  const canSwap = Boolean(secondary && secondary !== primary);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[96vh] w-[min(96vw,48rem)] max-w-[96vw] flex-col gap-0 overflow-hidden border-border/80 bg-background p-2 sm:p-3",
          "[&>button]:right-2 [&>button]:top-2 [&>button]:z-20",
        )}
      >
        <DialogTitle className="sr-only">{title?.trim() || "Imagen del producto"}</DialogTitle>
        <StoreProductDualImage
          primaryUrl={main}
          secondaryUrl={canSwap ? thumb : null}
          alt={title}
          loading="eager"
          frameClassName="aspect-square w-full max-h-[min(85vh,40rem)] rounded-xl sm:rounded-2xl"
          secondaryClassName="!bottom-3 !right-3 h-16 w-16 sm:h-20 sm:w-20 border-[3px]"
          onSecondaryClick={canSwap ? () => setSwapped((v) => !v) : undefined}
        />
        {canSwap ? (
          <p className="px-1 pb-1 pt-2 text-center text-xs text-muted-foreground">
            Toca la imagen pequeña para intercambiarla con la grande.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

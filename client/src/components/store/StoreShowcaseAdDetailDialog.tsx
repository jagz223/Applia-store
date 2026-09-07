import { ExternalLink, Image as ImageIcon } from "lucide-react";
import { normalizeBannerCategoryVisibility } from "@shared/store-showcase-ads-schema";
import type { StoreShowcaseAdSummary } from "@/hooks/use-store-showcase-ads";
import {
  resolveShowcaseAdClickUrl,
  resolveShowcaseAdImageUrl,
} from "@/lib/store-showcase-ad-media";
import { STORE_SHOWCASE_BANNER_FRAME_CLASS } from "@/components/store/StoreShowcaseBannersCarousel";
import {
  storeAdminDialogBodyClass,
  storeAdminDialogContentClass,
  storeAdminDialogHeaderClass,
  storeAdminDialogShellClass,
} from "@/components/store/store-admin-ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function bannerVisibilityDescription(ad: StoreShowcaseAdSummary): string {
  const { categoryVisibilityMode, categoryIds } = normalizeBannerCategoryVisibility(
    ad.categoryVisibilityMode,
    ad.categoryIds,
  );
  if (categoryVisibilityMode === "all") {
    return "Visible en todas las categorías (incluido el filtro Todas).";
  }
  if (categoryVisibilityMode === "exclude") {
    return `Visible en todas menos ${categoryIds.length} categoría(s). También en el filtro Todas.`;
  }
  return `Solo en ${categoryIds.length} categoría(s). No se muestra en el filtro Todas.`;
}

export function StoreShowcaseAdDetailDialog({
  ad,
  open,
  onOpenChange,
}: {
  ad: StoreShowcaseAdSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!ad) return null;

  const imageUrl = resolveShowcaseAdImageUrl(ad);
  const clickUrl = resolveShowcaseAdClickUrl(ad);
  const isBanner = ad.kind === "banner";
  const title = isBanner ? "Vista previa del banner" : "Vista previa del popup";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        layer="elevated"
        overlayClassName={storeAdminDialogShellClass}
        className={storeAdminDialogContentClass("sm:max-w-xl")}
      >
        <DialogHeader className={storeAdminDialogHeaderClass}>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Así se verá aproximadamente en la vitrina
            {clickUrl ? " · con enlace al hacer clic" : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className={storeAdminDialogBodyClass}>
          {isBanner ? (
          <div
            className={cn(
              "relative overflow-hidden rounded-2xl border border-border/60 bg-muted/30",
              STORE_SHOWCASE_BANNER_FRAME_CLASS,
            )}
          >
            {imageUrl ? (
              <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="flex h-full min-h-[7rem] w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <ImageIcon className="h-6 w-6" aria-hidden />
                <p className="text-xs">Sin imagen</p>
              </div>
            )}
          </div>
          ) : (
            <div className="flex w-full items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-muted/30 p-4">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  className="max-h-[min(70dvh,28rem)] max-w-full object-contain"
                />
              ) : (
                <div className="flex h-40 w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <ImageIcon className="h-6 w-6" aria-hidden />
                  <p className="text-xs">Sin imagen</p>
                </div>
              )}
            </div>
          )}

          {isBanner ? (
            <p className="text-sm text-muted-foreground">{bannerVisibilityDescription(ad)}</p>
          ) : null}

          {clickUrl ? (
            <a
              href={clickUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 break-all text-sm text-primary underline-offset-4 hover:underline"
            >
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
              {clickUrl}
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">Sin link al hacer clic.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

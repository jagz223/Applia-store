import { ImageIcon, Loader2, Percent } from "lucide-react";
import type { StoreShowcasePromotion } from "@/hooks/use-store-showcase";
import {
  StoreShowcaseAddToCartButton,
  showcaseCartItemKey,
} from "@/components/store/StoreShowcaseAddToCartButton";
import { StoreShowcaseCardImage } from "@/components/store/StoreShowcaseCardImage";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function formatPrice(value: number) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
}

function ShowcasePromotionCard({
  promotion,
  onAddToCart,
  addBusyKey,
  large,
}: {
  promotion: StoreShowcasePromotion;
  onAddToCart?: () => void;
  addBusyKey?: string | null;
  large?: boolean;
}) {
  const imageUrl = (promotion.promotionImageUrl ?? promotion.imageUrl)?.trim();
  const itemKey = showcaseCartItemKey("promotion", promotion.id);
  const busy = addBusyKey === itemKey;

  if (large) {
    return (
      <Card className="overflow-hidden border-0 shadow-md bg-card flex flex-col rounded-2xl">
        <CardContent className="p-0 flex flex-col">
          <StoreShowcaseCardImage src={imageUrl} placeholderIcon={Percent} />
          <div className="p-3 flex flex-col gap-1.5">
            <p className="text-sm font-bold leading-snug line-clamp-2 text-foreground">{promotion.name}</p>
            {promotion.description ? (
              <p className="text-xs text-muted-foreground line-clamp-2">{promotion.description}</p>
            ) : null}
            {promotion.items.length > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                {promotion.items.length === 1
                  ? "1 producto incluido"
                  : `${promotion.items.length} productos incluidos`}
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-sm font-bold text-primary">{formatPrice(promotion.price)}</span>
              {onAddToCart ? (
                <StoreShowcaseAddToCartButton
                  variant="footer"
                  onClick={onAddToCart}
                  busy={busy}
                  ariaLabel={`Añadir promoción ${promotion.name} al carrito`}
                />
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border flex flex-col">
      <CardContent className="p-0 flex flex-col">
        <div className="relative">
          <StoreShowcaseCardImage src={imageUrl} aspect="square" placeholderIcon={Percent} />
          {onAddToCart ? (
            <StoreShowcaseAddToCartButton
              onClick={onAddToCart}
              busy={busy}
              ariaLabel={`Añadir promoción ${promotion.name} al carrito`}
            />
          ) : null}
        </div>
        <div className="p-3 flex flex-col gap-1">
          <p className="text-sm font-semibold leading-snug line-clamp-2 text-foreground">{promotion.name}</p>
          <p className="text-sm font-medium text-primary">{formatPrice(promotion.price)}</p>
          {promotion.description ? (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{promotion.description}</p>
          ) : null}
          {promotion.items.length > 0 ? (
            <p className="text-xs text-muted-foreground mt-1">
              {promotion.items.length === 1
                ? "1 producto incluido"
                : `${promotion.items.length} productos incluidos`}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

type StoreShowcasePromotionGridProps = {
  promotions: StoreShowcasePromotion[];
  isLoading?: boolean;
  error?: Error | null;
  emptyMessage?: string;
  className?: string;
  centered?: boolean;
  largeCards?: boolean;
  onAddPromotionToCart?: (promotionId: number) => void;
  addToCartBusyKey?: string | null;
};

export function StoreShowcasePromotionGrid({
  promotions,
  isLoading,
  error,
  emptyMessage = "No hay promociones activas en este momento.",
  className,
  centered = false,
  largeCards = false,
  onAddPromotionToCart,
  addToCartBusyKey,
}: StoreShowcasePromotionGridProps) {
  if (isLoading) {
    return (
      <div className={cn("py-12 flex justify-center", className)}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <p className={cn("text-sm text-destructive text-center py-8", className)}>{error.message}</p>
    );
  }

  if (promotions.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-border py-12 px-6 text-center",
          className,
        )}
      >
        <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground mb-3" aria-hidden />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  if (largeCards) {
    return (
      <div className={cn("grid grid-cols-2 md:grid-cols-3 gap-4", className)}>
        {promotions.map((promotion) => (
          <ShowcasePromotionCard
            key={promotion.id}
            promotion={promotion}
            large
            addBusyKey={addToCartBusyKey}
            onAddToCart={
              onAddPromotionToCart ? () => onAddPromotionToCart(promotion.id) : undefined
            }
          />
        ))}
      </div>
    );
  }

  if (centered) {
    return (
      <div className={cn("flex flex-wrap justify-center gap-4 max-w-2xl mx-auto", className)}>
        {promotions.map((promotion) => (
          <div key={promotion.id} className="w-[calc(50%-0.5rem)] sm:w-[180px]">
            <ShowcasePromotionCard
              promotion={promotion}
              addBusyKey={addToCartBusyKey}
              onAddToCart={
                onAddPromotionToCart ? () => onAddPromotionToCart(promotion.id) : undefined
              }
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4", className)}>
      {promotions.map((promotion) => (
        <ShowcasePromotionCard
          key={promotion.id}
          promotion={promotion}
          addBusyKey={addToCartBusyKey}
          onAddToCart={
            onAddPromotionToCart ? () => onAddPromotionToCart(promotion.id) : undefined
          }
        />
      ))}
    </div>
  );
}

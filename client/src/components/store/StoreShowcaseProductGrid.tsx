import { ImageIcon, Loader2, Package } from "lucide-react";
import type { StoreShowcaseProduct } from "@/hooks/use-store-showcase";
import {
  StoreShowcaseAddToCartButton,
  showcaseCartItemKey,
} from "@/components/store/StoreShowcaseAddToCartButton";
import { cn } from "@/lib/utils";

function formatPrice(value: number, currencyLabel?: string) {
  const amount = new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return currencyLabel ? `${amount} ${currencyLabel}` : amount;
}

function ShowcaseProductCard({
  product,
  onAddToCart,
  onSelect,
  addBusyKey,
  selected,
}: {
  product: StoreShowcaseProduct;
  onAddToCart?: () => void;
  onSelect?: () => void;
  addBusyKey?: string | null;
  selected?: boolean;
}) {
  const imageUrl = product.imageUrls[0]?.trim();
  const itemKey = showcaseCartItemKey("product", product.id);
  const busy = addBusyKey === itemKey;

  return (
    <article
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl sm:rounded-2xl border border-border/80 bg-white shadow-sm",
        "min-h-0 sm:min-h-[17.5rem]",
        "transition-all dark:bg-card dark:border-border",
        onSelect && "cursor-pointer hover:border-border hover:shadow-md",
        selected && "border-foreground/40 ring-2 ring-foreground/80 shadow-md",
      )}
    >
      <div className="relative bg-muted/20 p-2 sm:p-3 pb-0">
        <div className="relative aspect-square sm:aspect-[5/4] overflow-hidden rounded-lg sm:rounded-xl bg-muted/40">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageIcon className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/40" />
            </div>
          )}
          {onAddToCart && !onSelect ? (
            <div onClick={(e) => e.stopPropagation()}>
              <StoreShowcaseAddToCartButton
                onClick={onAddToCart}
                busy={busy}
                ariaLabel={`Añadir ${product.name} al carrito`}
              />
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 px-2.5 pb-3 pt-2 sm:gap-1 sm:px-3.5 sm:pb-4 sm:pt-3">
        <p className="text-[13px] sm:text-sm font-bold leading-snug line-clamp-2 text-foreground">
          {product.name}
        </p>
        <p className="text-[13px] sm:text-sm font-semibold text-foreground">
          {formatPrice(product.price, product.displayCurrencyLabel)}
        </p>
        {product.description ? (
          <p className="mt-0.5 line-clamp-1 sm:line-clamp-2 text-xs text-muted-foreground">
            {product.description}
          </p>
        ) : null}
        {onAddToCart && onSelect ? (
          <div className="mt-auto pt-2" onClick={(e) => e.stopPropagation()}>
            <StoreShowcaseAddToCartButton
              variant="footer"
              onClick={onAddToCart}
              busy={busy}
              ariaLabel={`Añadir ${product.name} al carrito`}
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}

type StoreShowcaseProductGridProps = {
  products: StoreShowcaseProduct[];
  isLoading?: boolean;
  error?: Error | null;
  emptyMessage?: string;
  className?: string;
  centered?: boolean;
  largeCards?: boolean;
  onAddProductToCart?: (productId: number) => void;
  onSelectProduct?: (product: StoreShowcaseProduct) => void;
  selectedProductId?: number | null;
  addToCartBusyKey?: string | null;
};

export function StoreShowcaseProductGrid({
  products,
  isLoading,
  error,
  emptyMessage = "Esta tienda aún no tiene productos visibles en la vitrina.",
  className,
  centered = false,
  largeCards = false,
  onAddProductToCart,
  onSelectProduct,
  selectedProductId,
  addToCartBusyKey,
}: StoreShowcaseProductGridProps) {
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

  if (products.length === 0) {
    return (
      <div
        className={cn(
          "rounded-[1.25rem] border border-dashed border-border bg-white/60 py-12 px-6 text-center dark:bg-card/40",
          className,
        )}
      >
        <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" aria-hidden />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  const gridClass = largeCards
    ? "grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-4"
    : centered
      ? "flex flex-wrap justify-center gap-4 max-w-2xl mx-auto"
      : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-4";

  return (
    <div className={cn(gridClass, className)}>
      {products.map((product) => (
        <div
          key={product.id}
          className={centered && !largeCards ? "w-[calc(50%-0.5rem)] sm:w-[180px]" : undefined}
        >
          <ShowcaseProductCard
            product={product}
            addBusyKey={addToCartBusyKey}
            selected={selectedProductId === product.id}
            onSelect={onSelectProduct ? () => onSelectProduct(product) : undefined}
            onAddToCart={
              onAddProductToCart && !onSelectProduct
                ? () => onAddProductToCart(product.id)
                : undefined
            }
          />
        </div>
      ))}
    </div>
  );
}

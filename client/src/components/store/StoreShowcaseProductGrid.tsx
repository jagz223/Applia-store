import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Package } from "lucide-react";
import type { StoreShowcaseProduct } from "@/hooks/use-store-showcase";
import {
  StoreShowcaseAddToCartButton,
  showcaseCartItemKey,
} from "@/components/store/StoreShowcaseAddToCartButton";
import { StoreProductDualImage } from "@/components/store/StoreProductDualImage";
import {
  STORE_ADMIN_LIST_PAGE_SIZE,
  StoreAdminListPagination,
} from "@/components/store/StoreAdminListPagination";
import { cn } from "@/lib/utils";

export const STORE_SHOWCASE_PAGE_SIZE = STORE_ADMIN_LIST_PAGE_SIZE;

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
  const secondaryImageUrl = product.imageUrls[1]?.trim();
  const description = product.description?.trim() ?? "";
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
        "group flex flex-col overflow-hidden rounded-xl sm:rounded-2xl border border-border/80 bg-card shadow-sm",
        "min-h-0 sm:min-h-[17.5rem]",
        "transition-all",
        onSelect && "cursor-pointer hover:border-border hover:shadow-md",
        selected && "border-foreground/40 ring-2 ring-foreground/80 shadow-md",
      )}
    >
      <div className="relative bg-background p-2 sm:p-3 pb-0">
        <div className="relative aspect-square sm:aspect-[5/4] overflow-hidden rounded-lg sm:rounded-xl bg-background">
          <StoreProductDualImage
            primaryUrl={imageUrl}
            secondaryUrl={secondaryImageUrl}
            frameClassName="h-full w-full"
            imgClassName="transition-transform duration-300 group-hover:scale-[1.02]"
            secondaryClassName="h-8 w-8 sm:h-10 sm:w-10"
          />
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
        {description ? (
          <p className="mt-0.5 line-clamp-1 sm:line-clamp-2 text-xs text-muted-foreground">
            {description}
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
  const [page, setPage] = useState(1);
  const topRef = useRef<HTMLDivElement>(null);
  const listKey = useMemo(() => products.map((p) => p.id).join(","), [products]);

  useEffect(() => {
    setPage(1);
  }, [listKey]);

  const totalPages = Math.max(1, Math.ceil(products.length / STORE_SHOWCASE_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageProducts = useMemo(() => {
    const start = (safePage - 1) * STORE_SHOWCASE_PAGE_SIZE;
    return products.slice(start, start + STORE_SHOWCASE_PAGE_SIZE);
  }, [products, safePage]);

  const goToPage = (next: number) => {
    setPage(next);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
          "rounded-[1.25rem] border border-dashed border-border bg-card/60 py-12 px-6 text-center",
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
    <div ref={topRef} className={cn("space-y-4", className)}>
      <div className={gridClass}>
        {pageProducts.map((product) => (
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
      <StoreAdminListPagination page={safePage} totalPages={totalPages} onPageChange={goToPage} />
    </div>
  );
}

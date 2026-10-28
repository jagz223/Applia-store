import { useEffect, useMemo, useRef, useState } from "react";
import { Package } from "lucide-react";
import type { StoreShowcaseProduct } from "@/hooks/use-store-showcase";
import { STORE_SHOWCASE_PAGE_SIZE } from "@/hooks/use-store-showcase";
import {
  StoreShowcaseAddToCartButton,
  showcaseCartItemKey,
} from "@/components/store/StoreShowcaseAddToCartButton";
import { StoreProductDualImage } from "@/components/store/StoreProductDualImage";
import { StoreAdminListPagination } from "@/components/store/StoreAdminListPagination";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function showcaseGridClass(largeCards: boolean, centered: boolean) {
  if (largeCards) return "grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-4";
  if (centered) return "flex flex-wrap justify-center gap-4 max-w-2xl mx-auto";
  return "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-4";
}

function ShowcaseProductCardSkeleton() {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl sm:rounded-2xl border border-border/80 bg-card shadow-sm",
        "min-h-0 sm:min-h-[17.5rem]",
      )}
      aria-hidden
    >
      <div className="relative bg-background p-2 sm:p-3 pb-0">
        <Skeleton className="aspect-square sm:aspect-[5/4] w-full rounded-lg sm:rounded-xl" />
      </div>
      <div className="flex flex-1 flex-col gap-2 px-2.5 pb-3 pt-2 sm:px-3.5 sm:pb-4 sm:pt-3">
        <Skeleton className="h-4 w-[88%] rounded-md" />
        <Skeleton className="h-4 w-24 rounded-md" />
        <Skeleton className="mt-0.5 h-3 w-full rounded-md" />
        <Skeleton className="h-3 w-[70%] rounded-md" />
      </div>
    </div>
  );
}

/** Skeleton del grid de productos (misma grilla que la vitrina). */
export function StoreShowcaseProductGridSkeleton({
  className,
  largeCards = false,
  centered = false,
  count = 6,
}: {
  className?: string;
  largeCards?: boolean;
  centered?: boolean;
  count?: number;
}) {
  return (
    <div
      className={cn("space-y-4", className)}
      aria-busy="true"
      aria-label="Cargando productos"
    >
      <div className={showcaseGridClass(largeCards, centered)}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={centered && !largeCards ? "w-[calc(50%-0.5rem)] sm:w-[180px]" : undefined}
          >
            <ShowcaseProductCardSkeleton />
          </div>
        ))}
      </div>
    </div>
  );
}

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
  imageLoading = "lazy",
}: {
  product: StoreShowcaseProduct;
  onAddToCart?: () => void;
  onSelect?: () => void;
  addBusyKey?: string | null;
  selected?: boolean;
  imageLoading?: "lazy" | "eager";
}) {
  const imageUrl = product.imageUrls[0]?.trim();
  const secondaryImageUrl = product.imageUrls[1]?.trim();
  const description = product.description?.trim() ?? "";
  const itemKey = showcaseCartItemKey("product", product.id);
  const busy = addBusyKey === itemKey;
  const boxSize =
    product.boxSize != null && Number.isFinite(product.boxSize) && product.boxSize > 0
      ? product.boxSize
      : 0;
  const boxPrice = boxSize > 0 ? product.price * boxSize : 0;

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
            loading={imageLoading}
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
        {boxSize > 0 ? (
          <p className="text-[11px] sm:text-xs text-muted-foreground">
            Precio por caja: {formatPrice(boxPrice, product.displayCurrencyLabel)}
          </p>
        ) : null}
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
  isFetching?: boolean;
  error?: Error | null;
  emptyMessage?: string;
  className?: string;
  centered?: boolean;
  largeCards?: boolean;
  onAddProductToCart?: (productId: number) => void;
  onSelectProduct?: (product: StoreShowcaseProduct) => void;
  selectedProductId?: number | null;
  addToCartBusyKey?: string | null;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
};

export function StoreShowcaseProductGrid({
  products,
  isLoading,
  isFetching,
  error,
  emptyMessage = "Esta tienda aún no tiene productos visibles en la vitrina.",
  className,
  centered = false,
  largeCards = false,
  onAddProductToCart,
  onSelectProduct,
  selectedProductId,
  addToCartBusyKey,
  page: pageProp,
  totalPages: totalPagesProp,
  onPageChange,
}: StoreShowcaseProductGridProps) {
  const [page, setPage] = useState(1);
  const topRef = useRef<HTMLDivElement>(null);
  const serverPaged = pageProp != null && totalPagesProp != null && onPageChange != null;
  const listKey = useMemo(() => products.map((p) => p.id).join(","), [products]);

  useEffect(() => {
    if (!serverPaged) setPage(1);
  }, [listKey, serverPaged]);

  const totalPages = serverPaged
    ? Math.max(1, totalPagesProp)
    : Math.max(1, Math.ceil(products.length / STORE_SHOWCASE_PAGE_SIZE));
  const safePage = Math.min(serverPaged ? pageProp : page, totalPages);
  const pageProducts = useMemo(() => {
    if (serverPaged) return products;
    const start = (safePage - 1) * STORE_SHOWCASE_PAGE_SIZE;
    return products.slice(start, start + STORE_SHOWCASE_PAGE_SIZE);
  }, [products, safePage, serverPaged]);

  const goToPage = (next: number) => {
    if (serverPaged) onPageChange(next);
    else setPage(next);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (isLoading) {
    return (
      <StoreShowcaseProductGridSkeleton
        className={className}
        largeCards={largeCards}
        centered={centered}
      />
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

  return (
    <div ref={topRef} className={cn("space-y-4", className)}>
      <div className={showcaseGridClass(largeCards, centered)}>
        {pageProducts.map((product, index) => (
          <div
            key={product.id}
            className={centered && !largeCards ? "w-[calc(50%-0.5rem)] sm:w-[180px]" : undefined}
          >
            <ShowcaseProductCard
              product={product}
              addBusyKey={addToCartBusyKey}
              selected={selectedProductId === product.id}
              imageLoading={index < 4 ? "eager" : "lazy"}
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
      <StoreAdminListPagination
        page={safePage}
        totalPages={totalPages}
        isFetching={isFetching}
        onPageChange={goToPage}
      />
    </div>
  );
}

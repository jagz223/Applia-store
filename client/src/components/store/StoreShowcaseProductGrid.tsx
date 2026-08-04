import { ImageIcon, Loader2, Package } from "lucide-react";
import type { StoreShowcaseProduct } from "@/hooks/use-store-showcase";
import {
  StoreShowcaseAddToCartButton,
  showcaseCartItemKey,
} from "@/components/store/StoreShowcaseAddToCartButton";
import { StoreShowcaseCardImage } from "@/components/store/StoreShowcaseCardImage";
import { Card, CardContent } from "@/components/ui/card";
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
  addBusyKey,
  large,
}: {
  product: StoreShowcaseProduct;
  onAddToCart?: () => void;
  addBusyKey?: string | null;
  large?: boolean;
}) {
  const imageUrl = product.imageUrls[0]?.trim();
  const itemKey = showcaseCartItemKey("product", product.id);
  const busy = addBusyKey === itemKey;

  if (large) {
    return (
      <Card className="overflow-hidden border-0 shadow-md bg-card flex flex-col rounded-2xl">
        <CardContent className="p-0 flex flex-col">
          <StoreShowcaseCardImage src={imageUrl} placeholderIcon={ImageIcon} />
          <div className="p-3 flex flex-col gap-1.5">
            <p className="text-sm font-bold leading-snug line-clamp-2 text-foreground">{product.name}</p>
            {product.description ? (
              <p className="text-xs text-muted-foreground line-clamp-2">{product.description}</p>
            ) : null}
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-sm font-bold text-primary">
                {formatPrice(product.price, product.displayCurrencyLabel)}
              </span>
              {onAddToCart ? (
                <StoreShowcaseAddToCartButton
                  variant="footer"
                  onClick={onAddToCart}
                  busy={busy}
                  ariaLabel={`Añadir ${product.name} al carrito`}
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
          <StoreShowcaseCardImage src={imageUrl} aspect="square" placeholderIcon={ImageIcon} />
          {onAddToCart ? (
            <StoreShowcaseAddToCartButton
              onClick={onAddToCart}
              busy={busy}
              ariaLabel={`Añadir ${product.name} al carrito`}
            />
          ) : null}
        </div>
        <div className="p-3 flex flex-col gap-1">
          <p className="text-sm font-semibold leading-snug line-clamp-2 text-foreground">{product.name}</p>
          <p className="text-sm font-medium text-primary">
            {formatPrice(product.price, product.displayCurrencyLabel)}
          </p>
          {product.description ? (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{product.description}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
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
          "rounded-xl border border-dashed border-border py-12 px-6 text-center",
          className,
        )}
      >
        <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" aria-hidden />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  if (largeCards) {
    return (
      <div
        className={cn(
          "grid grid-cols-2 md:grid-cols-3 gap-4",
          className,
        )}
      >
        {products.map((product) => (
          <ShowcaseProductCard
            key={product.id}
            product={product}
            large
            addBusyKey={addToCartBusyKey}
            onAddToCart={onAddProductToCart ? () => onAddProductToCart(product.id) : undefined}
          />
        ))}
      </div>
    );
  }

  if (centered) {
    return (
      <div className={cn("flex flex-wrap justify-center gap-4 max-w-2xl mx-auto", className)}>
        {products.map((product) => (
          <div key={product.id} className="w-[calc(50%-0.5rem)] sm:w-[180px]">
            <ShowcaseProductCard
              product={product}
              addBusyKey={addToCartBusyKey}
              onAddToCart={
                onAddProductToCart ? () => onAddProductToCart(product.id) : undefined
              }
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4", className)}>
      {products.map((product) => (
        <ShowcaseProductCard
          key={product.id}
          product={product}
          addBusyKey={addToCartBusyKey}
          onAddToCart={onAddProductToCart ? () => onAddProductToCart(product.id) : undefined}
        />
      ))}
    </div>
  );
}

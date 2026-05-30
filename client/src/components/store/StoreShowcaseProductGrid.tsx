import { ImageIcon, Loader2, Package } from "lucide-react";
import type { StoreShowcaseProduct } from "@/hooks/use-store-showcase";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function formatPrice(value: number) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
}

function ShowcaseProductCard({ product }: { product: StoreShowcaseProduct }) {
  const imageUrl = product.imageUrls[0]?.trim();

  return (
    <Card className="overflow-hidden border-border h-full flex flex-col">
      <CardContent className="p-0 flex flex-col flex-1">
        <div className="relative aspect-square w-full bg-muted/40 overflow-hidden">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/70">
              <ImageIcon className="h-12 w-12" strokeWidth={1.25} aria-hidden />
            </div>
          )}
        </div>
        <div className="p-3 flex flex-col flex-1 gap-1">
          <p className="text-sm font-semibold leading-snug line-clamp-2 text-foreground">{product.name}</p>
          <p className="text-sm font-medium text-primary">{formatPrice(product.price)}</p>
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
  /** Centra la grilla cuando hay pocos productos. */
  centered?: boolean;
};

export function StoreShowcaseProductGrid({
  products,
  isLoading,
  error,
  emptyMessage = "Esta tienda aún no tiene productos visibles en la vitrina.",
  className,
  centered = false,
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

  if (centered) {
    return (
      <div className={cn("flex flex-wrap justify-center gap-4 max-w-2xl mx-auto", className)}>
        {products.map((product) => (
          <div key={product.id} className="w-[calc(50%-0.5rem)] sm:w-[180px]">
            <ShowcaseProductCard product={product} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4",
        className,
      )}
    >
      {products.map((product) => (
        <ShowcaseProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

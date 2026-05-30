import type { StoreProductSummary } from "@/hooks/use-store-products";
import { categoriesFromIds, useStoreCategories } from "@/hooks/use-store-categories";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function formatPrice(value: number) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
}

export function StoreProductDetailDialog({
  storeId,
  product,
  open,
  onOpenChange,
}: {
  storeId: number;
  product: StoreProductSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: allCategories = [] } = useStoreCategories(storeId, open && product != null);
  if (!product) return null;

  const categoryLabels = categoriesFromIds(allCategories, product.categoryIds ?? []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layer="elevated" className="max-w-md">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription>Detalle del producto</DialogDescription>
        </DialogHeader>
        <dl className="space-y-3 text-sm">
          {(product.imageUrls?.length ?? 0) > 0 ? (
            <div>
              <dt className="font-medium text-muted-foreground mb-2">Fotos</dt>
              <dd className="grid grid-cols-2 gap-2">
                {product.imageUrls.map((url, i) => (
                  <img
                    key={`${url}-${i}`}
                    src={url}
                    alt=""
                    className="aspect-square w-full rounded-md border border-border object-cover"
                  />
                ))}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="font-medium text-muted-foreground">Precio</dt>
            <dd className="text-base font-semibold">{formatPrice(product.price)}</dd>
          </div>
          {product.description ? (
            <div>
              <dt className="font-medium text-muted-foreground">Descripción</dt>
              <dd className="whitespace-pre-wrap">{product.description}</dd>
            </div>
          ) : null}
          <div>
            <dt className="font-medium text-muted-foreground">Categorías</dt>
            <dd>
              {categoryLabels.length > 0
                ? categoryLabels.map((c) => c.name).join(", ")
                : "Ninguna"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-muted-foreground">Vitrina</dt>
            <dd>{product.showOnShowcase !== false ? "Visible en la tienda pública" : "Oculto en vitrina"}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted-foreground">Ingredientes / materiales</dt>
            <dd>
              {product.ingredientMaterialIds.length > 0
                ? `${product.ingredientMaterialIds.length} seleccionado(s)`
                : "Ninguno"}
            </dd>
          </div>
        </dl>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Loader2, Minus, Plus, ShoppingBag } from "lucide-react";
import { buildCustomizedProductDisplayName } from "@shared/store-cart-schema";
import { resolveAdditionalDisplayPrice } from "@shared/store-schema";
import type { StoreShowcaseProduct } from "@/hooks/use-store-showcase";
import { Button } from "@/components/ui/button";
import { StoreSelectableChip } from "@/components/store/StoreSelectableChip";
import { StoreProductDualImage } from "@/components/store/StoreProductDualImage";
import { StoreProductImageLightbox } from "@/components/store/StoreProductImageLightbox";
import { cn } from "@/lib/utils";

function formatPrice(value: number, currencyLabel?: string) {
  const amount = new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return currencyLabel ? `${amount} ${currencyLabel}` : amount;
}

export function productNeedsCustomization(product: StoreShowcaseProduct): boolean {
  return (
    (product.sizes?.length ?? 0) > 0 ||
    (product.ingredients?.length ?? 0) > 0 ||
    (product.removableIngredients?.length ?? 0) > 0 ||
    (product.additionals?.length ?? 0) > 0
  );
}

export type ProductCustomizeSelection = {
  productId: number;
  quantity: number;
  sizeId: string | null;
  removedIngredientMaterialIds: number[];
  additionalIngredientMaterialIds: number[];
  displayName: string;
  unitPrice: number;
};

type StoreProductCustomizePanelProps = {
  product: StoreShowcaseProduct;
  onClose: () => void;
  onConfirm: (selection: ProductCustomizeSelection) => void | Promise<void>;
  confirming?: boolean;
  canAddToCart?: boolean;
};

export function StoreProductCustomizePanel({
  product,
  onClose,
  onConfirm,
  confirming,
  canAddToCart = true,
}: StoreProductCustomizePanelProps) {
  const sizes = product.sizes ?? [];
  const hasSizes = sizes.length > 0;
  const [sizeId, setSizeId] = useState<string | null>(hasSizes ? sizes[0]?.id ?? null : null);
  const [removedIds, setRemovedIds] = useState<number[]>([]);
  const [additionalIds, setAdditionalIds] = useState<number[]>([]);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    setSizeId(hasSizes ? sizes[0]?.id ?? null : null);
    setRemovedIds([]);
    setAdditionalIds([]);
    setQuantity(1);
  }, [product.id]);

  const imageUrl = product.imageUrls[0]?.trim();
  const secondaryImageUrl = product.imageUrls[1]?.trim();
  const [imageSwapped, setImageSwapped] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    setImageSwapped(false);
    setLightboxOpen(false);
  }, [product.id, imageUrl, secondaryImageUrl]);

  const detailPrimary = imageSwapped && secondaryImageUrl ? secondaryImageUrl : imageUrl;
  const detailSecondary =
    imageSwapped && secondaryImageUrl ? imageUrl : secondaryImageUrl;
  const canSwapImages = Boolean(imageUrl && secondaryImageUrl && imageUrl !== secondaryImageUrl);
  const description = product.description?.trim() ?? "";
  const removable = product.removableIngredients ?? [];
  const additionals = product.additionals ?? [];
  const additionalIdsSet = useMemo(
    () => new Set(additionals.map((a) => a.id)),
    [additionals],
  );
  /** Base del producto: no incluye los que solo son adicionales. */
  const ingredients = useMemo(
    () => (product.ingredients ?? []).filter((item) => !additionalIdsSet.has(item.id)),
    [product.ingredients, additionalIdsSet],
  );
  const removableSet = useMemo(() => new Set(removedIds), [removedIds]);
  const selectedSize = sizes.find((s) => s.id === sizeId) ?? null;
  const visualCurrencyId = product.displayCurrencyId ?? "usd";

  const availableAdditionals = useMemo(
    () => additionals.filter((a) => !removableSet.has(a.id)),
    [additionals, removableSet],
  );

  const selectedAdditionalNames = useMemo(
    () =>
      additionalIds
        .map((id) => availableAdditionals.find((a) => a.id === id)?.name)
        .filter((n): n is string => Boolean(n)),
    [additionalIds, availableAdditionals],
  );

  const selectedRemovedNames = useMemo(
    () =>
      removedIds
        .map((id) => removable.find((r) => r.id === id)?.name)
        .filter((n): n is string => Boolean(n)),
    [removedIds, removable],
  );

  const extrasPrice = useMemo(
    () =>
      additionalIds.reduce((sum, id) => {
        const row = availableAdditionals.find((a) => a.id === id);
        if (!row) return sum;
        return (
          sum +
          resolveAdditionalDisplayPrice(
            {
              ingredientMaterialId: row.id,
              price: row.price,
              pricesByCurrency: row.pricesByCurrency ?? {},
              pricesBySize: row.pricesBySize ?? {},
            },
            visualCurrencyId,
            sizeId,
          )
        );
      }, 0),
    [additionalIds, availableAdditionals, visualCurrencyId, sizeId],
  );

  const basePrice = selectedSize?.price ?? product.price;
  const unitPrice = basePrice + extrasPrice;
  const lineTotal = unitPrice * quantity;
  const displayName = buildCustomizedProductDisplayName(
    product.name,
    selectedAdditionalNames,
    selectedRemovedNames,
    selectedSize?.name,
  );

  function toggleRemoved(id: number) {
    setRemovedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      setAdditionalIds((adds) => adds.filter((a) => !next.includes(a)));
      return next;
    });
  }

  function toggleAdditional(id: number) {
    if (removableSet.has(id)) return;
    setAdditionalIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleConfirm() {
    if (hasSizes && !sizeId) return;
    await onConfirm({
      productId: product.id,
      quantity,
      sizeId: hasSizes ? sizeId : null,
      removedIngredientMaterialIds: [...removedIds].sort((a, b) => a - b),
      additionalIngredientMaterialIds: [...additionalIds].sort((a, b) => a - b),
      displayName,
      unitPrice,
    });
  }

  return (
    <div className="flex h-0 min-h-0 w-full flex-1 flex-col overflow-hidden rounded-[1.25rem] border border-border/60 bg-card shadow-sm">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/30">
          <ShoppingBag className="h-4 w-4 text-foreground" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold text-foreground leading-tight">Detalle</p>
          <p className="text-xs text-muted-foreground truncate">{displayName}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <StoreProductDualImage
          primaryUrl={detailPrimary}
          secondaryUrl={canSwapImages ? detailSecondary : null}
          alt={product.name}
          frameClassName="aspect-[4/3] max-h-52 w-full shrink-0 rounded-2xl sm:max-h-60"
          secondaryClassName="!bottom-2 !right-2 h-14 w-14 sm:h-16 sm:w-16 border-[3px]"
          onClick={detailPrimary ? () => setLightboxOpen(true) : undefined}
          onSecondaryClick={
            canSwapImages
              ? () => {
                  setImageSwapped((v) => !v);
                }
              : undefined
          }
        />
        <StoreProductImageLightbox
          open={lightboxOpen}
          onOpenChange={setLightboxOpen}
          primaryUrl={imageUrl}
          secondaryUrl={secondaryImageUrl}
          title={product.name}
        />

        <div className="mt-4 space-y-1 pb-1">
          <h2 className="text-lg font-bold text-foreground leading-snug">{product.name}</h2>
          <p className="text-base font-semibold text-primary">
            {formatPrice(unitPrice, product.displayCurrencyLabel)}
          </p>
          {displayName !== product.name ? (
            <p className="text-xs text-muted-foreground leading-relaxed pt-0.5">{displayName}</p>
          ) : null}
        </div>

        {description ? (
          <section className="mt-4 border-t border-border/70 pt-4 space-y-2">
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Descripción
            </h3>
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
              {description}
            </p>
          </section>
        ) : null}

        {/* Tamaños: siempre justo debajo de descripción (o del precio si no hay descripción). */}
        {hasSizes ? (
          <section className="mt-4 border-t border-border/70 pt-4 space-y-2.5">
            <div className="space-y-1">
              <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Tamaño
              </h3>
              <p className="text-xs text-muted-foreground">Elige el tamaño del producto.</p>
            </div>
            <div className="grid gap-2">
              {sizes.map((size) => {
                const active = sizeId === size.id;
                return (
                  <button
                    key={size.id}
                    type="button"
                    onClick={() => setSizeId(size.id)}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background hover:bg-muted/50",
                    )}
                    aria-pressed={active}
                  >
                    <span className="font-medium">{size.name}</span>
                    <span
                      className={cn(
                        "shrink-0 text-xs font-semibold tabular-nums",
                        active ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {formatPrice(size.price, product.displayCurrencyLabel)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {ingredients.length > 0 ? (
          <section className="mt-4 border-t border-border/70 pt-4 space-y-2.5">
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Ingredientes
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {ingredients.map((item) => (
                <li
                  key={item.id}
                  className="rounded-md bg-muted/60 px-2.5 py-1 text-xs text-foreground/90"
                >
                  {item.name}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {removable.length > 0 ? (
          <section className="mt-4 border-t border-border/70 pt-4 space-y-2.5">
            <div className="space-y-1">
              <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                ingredientes no deseados
              </h3>
              <p className="text-xs text-muted-foreground">Toca para sacar del producto.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {removable.map((item) => {
                const active = removableSet.has(item.id);
                return (
                  <StoreSelectableChip
                    key={item.id}
                    active={active}
                    onClick={() => toggleRemoved(item.id)}
                  >
                    {item.name}
                  </StoreSelectableChip>
                );
              })}
            </div>
          </section>
        ) : null}

        {availableAdditionals.length > 0 ? (
          <section className="mt-4 border-t border-border/70 pt-4 space-y-2.5">
            <div className="space-y-1">
              <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Ingredientes adicionales
              </h3>
              <p className="text-xs text-muted-foreground">Sumarán al precio del producto.</p>
            </div>
            <div className="grid gap-2">
              {availableAdditionals.map((item) => {
                const active = additionalIds.includes(item.id);
                const itemPrice = resolveAdditionalDisplayPrice(
                  {
                    ingredientMaterialId: item.id,
                    price: item.price,
                    pricesByCurrency: item.pricesByCurrency ?? {},
                    pricesBySize: item.pricesBySize ?? {},
                  },
                  visualCurrencyId,
                  sizeId,
                );
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleAdditional(item.id)}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background hover:bg-muted/50",
                    )}
                    aria-pressed={active}
                  >
                    <span className="font-medium">{item.name}</span>
                    <span
                      className={cn(
                        "shrink-0 text-xs font-semibold tabular-nums",
                        active ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      +{formatPrice(itemPrice, product.displayCurrencyLabel)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-border/60 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-bold text-foreground">
            {formatPrice(lineTotal, product.displayCurrencyLabel)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-full border border-border bg-background">
            <button
              type="button"
              className="h-10 w-10 flex items-center justify-center hover:bg-muted disabled:opacity-50 rounded-l-full"
              disabled={confirming || quantity <= 1}
              aria-label="Reducir cantidad"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[2.25rem] text-center text-sm font-semibold tabular-nums">
              {quantity}
            </span>
            <button
              type="button"
              className="h-10 w-10 flex items-center justify-center hover:bg-muted disabled:opacity-50 rounded-r-full"
              disabled={confirming || quantity >= 9999}
              aria-label="Aumentar cantidad"
              onClick={() => setQuantity((q) => Math.min(9999, q + 1))}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <Button
            type="button"
            className="flex-1 h-10 rounded-full"
            onClick={() => void handleConfirm()}
            disabled={confirming || !canAddToCart || (hasSizes && !sizeId)}
          >
            {confirming ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Agregar
          </Button>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full h-10 rounded-full"
          onClick={onClose}
          disabled={confirming}
        >
          Cancelar
        </Button>

        {!canAddToCart ? (
          <p className="text-xs text-center text-muted-foreground">
            Inicia sesión para agregar al carrito.
          </p>
        ) : null}
      </div>
    </div>
  );
}

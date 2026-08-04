import { useEffect, useMemo, useState } from "react";
import { ImageIcon, Loader2, Minus, Plus, ShoppingBag } from "lucide-react";
import { buildCustomizedProductDisplayName } from "@shared/store-cart-schema";
import type { StoreShowcaseProduct } from "@/hooks/use-store-showcase";
import { Button } from "@/components/ui/button";
import { StoreSelectableChip } from "@/components/store/StoreSelectableChip";
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
    (product.ingredients?.length ?? 0) > 0 ||
    (product.removableIngredients?.length ?? 0) > 0 ||
    (product.additionals?.length ?? 0) > 0
  );
}

export type ProductCustomizeSelection = {
  productId: number;
  quantity: number;
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
  const [removedIds, setRemovedIds] = useState<number[]>([]);
  const [additionalIds, setAdditionalIds] = useState<number[]>([]);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    setRemovedIds([]);
    setAdditionalIds([]);
    setQuantity(1);
  }, [product.id]);

  const imageUrl = product.imageUrls[0]?.trim();
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
        return sum + (row?.price ?? 0);
      }, 0),
    [additionalIds, availableAdditionals],
  );

  const unitPrice = product.price + extrasPrice;
  const lineTotal = unitPrice * quantity;
  const displayName = buildCustomizedProductDisplayName(
    product.name,
    selectedAdditionalNames,
    selectedRemovedNames,
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
    await onConfirm({
      productId: product.id,
      quantity,
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
        <div className="aspect-[4/3] max-h-44 w-full shrink-0 overflow-hidden rounded-2xl bg-muted/40 flex items-center justify-center sm:max-h-52">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-12 w-12 text-muted-foreground/50" />
          )}
        </div>

        <div className="mt-4 space-y-1 pb-1">
          <h2 className="text-lg font-bold text-foreground leading-snug">{product.name}</h2>
          <p className="text-base font-semibold text-primary">
            {formatPrice(unitPrice, product.displayCurrencyLabel)}
          </p>
          {displayName !== product.name ? (
            <p className="text-xs text-muted-foreground leading-relaxed pt-0.5">{displayName}</p>
          ) : null}
        </div>

        {product.description ? (
          <section className="mt-4 border-t border-border/70 pt-4 space-y-2">
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Descripción
            </h3>
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
              {product.description}
            </p>
          </section>
        ) : null}

        {ingredients.length > 0 ? (
          <section className="mt-4 border-t border-border/70 pt-4 space-y-2.5">
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Materiales o ingredientes
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
                Items a quitar
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
                      +{formatPrice(item.price, product.displayCurrencyLabel)}
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
            disabled={confirming || !canAddToCart}
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

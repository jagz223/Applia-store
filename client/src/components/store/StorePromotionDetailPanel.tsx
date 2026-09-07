import { useEffect, useState } from "react";
import { ImageIcon, Loader2, Minus, Percent, Plus, ShoppingBag } from "lucide-react";
import type { StoreShowcasePromotion } from "@/hooks/use-store-showcase";
import { Button } from "@/components/ui/button";

function formatPrice(value: number) {
  return new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export type PromotionDetailSelection = {
  promotionId: number;
  quantity: number;
  displayName: string;
  unitPrice: number;
};

type StorePromotionDetailPanelProps = {
  promotion: StoreShowcasePromotion;
  onClose: () => void;
  onConfirm: (selection: PromotionDetailSelection) => void | Promise<void>;
  confirming?: boolean;
  canAddToCart?: boolean;
};

export function StorePromotionDetailPanel({
  promotion,
  onClose,
  onConfirm,
  confirming,
  canAddToCart = true,
}: StorePromotionDetailPanelProps) {
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    setQuantity(1);
  }, [promotion.id]);

  const imageUrl = (promotion.promotionImageUrl ?? promotion.imageUrl)?.trim();
  const description = promotion.description?.trim() ?? "";
  const unitPrice = promotion.price;
  const lineTotal = unitPrice * quantity;

  async function handleConfirm() {
    await onConfirm({
      promotionId: promotion.id,
      quantity,
      displayName: promotion.name,
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
          <p className="text-base font-bold text-foreground leading-tight">Promoción</p>
          <p className="text-xs text-muted-foreground truncate">{promotion.name}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <div className="aspect-[4/3] max-h-44 w-full shrink-0 overflow-hidden rounded-2xl bg-muted/40 flex items-center justify-center sm:max-h-52">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Percent className="h-12 w-12 text-muted-foreground/50" aria-hidden />
          )}
        </div>

        <div className="mt-4 space-y-1 pb-1">
          <h2 className="text-lg font-bold text-foreground leading-snug">{promotion.name}</h2>
          <p className="text-base font-semibold text-primary">{formatPrice(unitPrice)}</p>
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

        {promotion.items.length > 0 ? (
          <section className="mt-4 border-t border-border/70 pt-4 space-y-2.5">
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Incluye
            </h3>
            <ul className="space-y-2">
              {promotion.items.map((item) => (
                <li
                  key={`${item.productId}-${item.productName}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 px-3.5 py-2.5 text-sm"
                >
                  <span className="min-w-0 font-medium text-foreground leading-snug">
                    {item.productName}
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                    ×{item.quantity}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="mt-4 border-t border-border/70 pt-4">
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <ImageIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>Esta promoción no lista productos incluidos.</p>
            </div>
          </section>
        )}
      </div>

      <div className="shrink-0 border-t border-border/60 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-bold text-foreground">{formatPrice(lineTotal)}</span>
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

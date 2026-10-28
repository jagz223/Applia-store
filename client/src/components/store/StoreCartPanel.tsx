import { useEffect, useRef, useState } from "react";

import { ImageIcon, Loader2, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";

import {

  useRemoveFromStoreCart,

  useStoreCart,

  useUpdateStoreCartItem,

  type StoreCartLine,

} from "@/hooks/use-store-cart";

import { StoreCartCheckoutDialog } from "@/components/store/StoreCartCheckoutDialog";
import { StoreCheckoutSuccessDialog } from "@/components/store/StoreCheckoutSuccessDialog";
import { CheckoutAuthRequiredDialog } from "@/components/store/CheckoutAuthRequiredDialog";
import {
  clearGuestStoreCart,
  readGuestStoreCart,
  writeGuestStoreCart,
  type GuestStoreCartLine,
} from "@/lib/guest-store-cart";

import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";

import { useToast } from "@/hooks/use-toast";



export const storeCartPanelWidthClass = "w-[340px] lg:w-[380px]";



function formatPrice(value: number) {

  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);

}



function cartLineKey(line: StoreCartLine) {
  return line.lineKey || (line.kind === "product" ? `p-${line.productId}` : `m-${line.promotionId}`);
}



function CartLineRow({

  storeId,

  line,

  cartKind = "retail",

}: {

  storeId: number;

  line: StoreCartLine;

  cartKind?: import("@shared/store-schema").StoreProductCatalogKind;

}) {

  const { toast } = useToast();

  const updateMutation = useUpdateStoreCartItem(storeId, cartKind);

  const removeMutation = useRemoveFromStoreCart(storeId, cartKind);

  const busy = removeMutation.isPending;
  const [displayQty, setDisplayQty] = useState(line.quantity);
  const qtyTimer = useRef<number | null>(null);

  useEffect(() => {
    setDisplayQty(line.quantity);
  }, [line.lineKey, line.quantity]);

  useEffect(() => {
    return () => {
      if (qtyTimer.current) window.clearTimeout(qtyTimer.current);
    };
  }, []);

  async function setQuantity(next: number) {
    try {
      if (line.kind === "product") {
        await updateMutation.mutateAsync({
          kind: "product",
          productId: line.productId!,
          quantity: next,
          lineKey: line.lineKey,
          removedIngredientMaterialIds: line.removedIngredientMaterialIds ?? [],
          additionalIngredientMaterialIds: line.additionalIngredientMaterialIds ?? [],
        });
        return;
      }
      await updateMutation.mutateAsync({
        kind: "promotion",
        promotionId: line.promotionId!,
        quantity: next,
        lineKey: line.lineKey,
        removedIngredientMaterialIds: [],
        additionalIngredientMaterialIds: [],
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo actualizar",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  const boxSize =
    line.kind === "product" && line.boxSize != null && line.boxSize > 0 ? line.boxSize : 0;
  const qtyStep = boxSize > 0 ? boxSize : 1;

  function scheduleQuantity(next: number) {
    const max = line.kind === "promotion" ? 99 : 9999;
    const min = boxSize > 0 ? boxSize : 1;
    const qty = Math.max(min, Math.min(max, next));
    setDisplayQty(qty);
    if (qtyTimer.current) window.clearTimeout(qtyTimer.current);
    qtyTimer.current = window.setTimeout(() => {
      void setQuantity(qty);
    }, 180);
  }

  async function removeLine() {
    try {
      if (line.kind === "product") {
        await removeMutation.mutateAsync({
          kind: "product",
          productId: line.productId!,
          lineKey: line.lineKey,
          removedIngredientMaterialIds: line.removedIngredientMaterialIds ?? [],
          additionalIngredientMaterialIds: line.additionalIngredientMaterialIds ?? [],
        });
        return;
      }
      await removeMutation.mutateAsync({
        kind: "promotion",
        promotionId: line.promotionId!,
        lineKey: line.lineKey,
        removedIngredientMaterialIds: [],
        additionalIngredientMaterialIds: [],
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo quitar",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }



  return (

    <li className="flex gap-3 py-4 border-b border-border last:border-0">

      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/40 flex items-center justify-center">
        {line.imageUrl ? (
          <img
            src={line.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <ImageIcon className="h-5 w-5 text-muted-foreground" aria-hidden />
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">

        <div className="flex items-start justify-between gap-2">

          <div className="min-w-0">

            <p className="text-sm font-semibold leading-snug line-clamp-2">{line.name}</p>

            <p className="text-sm font-medium text-primary mt-0.5">{formatPrice(line.price)}</p>

          </div>

          <button

            type="button"

            className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"

            aria-label={`Quitar ${line.name}`}

            disabled={busy}

            onClick={() => void removeLine()}

          >

            <Trash2 className="h-4 w-4" />

          </button>

        </div>

        {line.kind === "promotion" ? (

          <p className="text-xs text-muted-foreground">Promoción</p>

        ) : null}

        {boxSize > 0 ? (
          <p className="text-xs text-muted-foreground leading-snug">
            Este producto se vende por caja, y cada caja contiene {boxSize} metros.
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-2">

          <div className="inline-flex items-center rounded-lg border border-border bg-background">

            <button

              type="button"

              className="h-8 w-8 flex items-center justify-center hover:bg-muted disabled:opacity-50 rounded-l-lg"

              disabled={busy || displayQty <= (boxSize > 0 ? boxSize : 1)}

              aria-label="Reducir cantidad"

              onClick={() => scheduleQuantity(displayQty - qtyStep)}

            >

              <Minus className="h-3.5 w-3.5" />

            </button>

            <span className="min-w-[2rem] text-center text-sm font-medium">{displayQty}</span>

            <button

              type="button"

              className="h-8 w-8 flex items-center justify-center hover:bg-muted disabled:opacity-50 rounded-r-lg"

              disabled={busy}

              aria-label="Aumentar cantidad"

              onClick={() => scheduleQuantity(displayQty + qtyStep)}

            >

              <Plus className="h-3.5 w-3.5" />

            </button>

          </div>

          <span className="text-sm font-semibold">{formatPrice(line.lineTotal)}</span>

        </div>

      </div>

    </li>

  );

}



export function StoreCartPanel({

  storeId,

  storeName,

  enabled,

  cartKind = "retail",

}: {

  storeId: number;

  storeName: string;

  enabled: boolean;

  cartKind?: import("@shared/store-schema").StoreProductCatalogKind;

}) {

  const { isAuthenticated } = useAuth();

  const { data: cart, isLoading, refetch } = useStoreCart(
    storeId,
    enabled && isAuthenticated,
    cartKind,
  );

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [authGateOpen, setAuthGateOpen] = useState(false);
  const [checkoutSuccessOpen, setCheckoutSuccessOpen] = useState(false);
  const [checkoutSuccessOrderId, setCheckoutSuccessOrderId] = useState<number | null>(null);
  const [guestItems, setGuestItems] = useState<GuestStoreCartLine[]>(() =>
    readGuestStoreCart(storeId, cartKind).items,
  );

  useEffect(() => {
    if (!enabled || isAuthenticated) return;
    setGuestItems(readGuestStoreCart(storeId, cartKind).items);
  }, [enabled, isAuthenticated, storeId, cartKind, checkoutOpen, authGateOpen]);

  const displayItems = isAuthenticated ? (cart?.items ?? []) : guestItems;
  const guestSubtotal = guestItems.reduce((sum, row) => sum + row.price * row.quantity, 0);
  const displaySubtotal = isAuthenticated ? (cart?.subtotal ?? 0) : guestSubtotal;
  const hasItems = displayItems.length > 0;
  const canCheckout = hasItems && !isLoading;



  if (!enabled) return null;



  return (

    <>

      <aside

        className={cn(
          "flex h-0 min-h-0 w-full flex-1 flex-col overflow-hidden",
          "rounded-[1.25rem] border border-border/60 bg-white dark:bg-card",
          "shadow-sm",
        )}

        aria-label="Carrito de compras"

      >

        <div className="border-b border-border px-5 py-4">

          <div className="flex items-center gap-2">

            <ShoppingBag className="h-5 w-5 text-primary shrink-0" aria-hidden />

            <div className="min-w-0">

              <h2 className="text-lg font-bold leading-tight">Mi pedido</h2>

              <p className="text-xs text-muted-foreground truncate">{storeName}</p>

            </div>

          </div>

        </div>



        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">

          {isAuthenticated && isLoading ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !hasItems ? (
            <div className="py-16 text-center space-y-2">
              <ShoppingBag className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Tu carrito está vacío.</p>
              {!isAuthenticated ? (
                <p className="text-xs text-muted-foreground px-4">
                  Puedes añadir productos sin cuenta. Al comprar te pediremos registrarte.
                </p>
              ) : null}
            </div>
          ) : isAuthenticated ? (
            <ul>
              {cart!.items.map((line) => (
                <CartLineRow
                  key={cartLineKey(line)}
                  storeId={storeId}
                  line={line}
                  cartKind={cartKind}
                />
              ))}
            </ul>
          ) : (
            <ul className="divide-y divide-border/60">
              {guestItems.map((line) => (
                <li key={line.lineKey} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium line-clamp-2">{line.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatPrice(line.price)} × {line.quantity}
                    </p>
                    {line.boxSize != null && line.boxSize > 0 ? (
                      <p className="text-xs text-muted-foreground mt-1 leading-snug">
                        Este producto se vende por caja, y cada caja contiene {line.boxSize} metros.
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="shrink-0"
                    onClick={() => {
                      const next = readGuestStoreCart(storeId);
                      next.items = next.items.filter((row) => row.lineKey !== line.lineKey);
                      writeGuestStoreCart(next, cartKind);
                      setGuestItems(next.items);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

        </div>



        <div className="border-t border-border/60 p-5 space-y-3 bg-muted/15 rounded-b-2xl">

          <div className="flex items-center justify-between text-sm">

            <span className="text-muted-foreground">Subtotal</span>

            <span className="text-muted-foreground">{formatPrice(displaySubtotal)}</span>

          </div>

          <div className="flex items-center justify-between">

            <span className="font-semibold">Total</span>

            <span className="text-xl font-bold text-primary">{formatPrice(displaySubtotal)}</span>

          </div>

          <Button

            type="button"

            className="w-full h-11 text-base font-semibold"

            disabled={!canCheckout}

            onClick={() => {
              if (!isAuthenticated) {
                setAuthGateOpen(true);
                return;
              }
              setCheckoutOpen(true);
            }}

          >

            {cartKind === "import" ? "Solicitar importación" : "Comprar"}

          </Button>

          <p className="text-[11px] text-center text-muted-foreground">

            El carrito se vacía automáticamente cada 24 horas.

          </p>

        </div>

      </aside>



      {isAuthenticated && cart && hasItems ? (
        <StoreCartCheckoutDialog
          storeId={storeId}
          cart={cart}
          open={checkoutOpen}
          onOpenChange={setCheckoutOpen}
          onCheckoutSuccess={(orderId) => {
            setCheckoutSuccessOrderId(orderId);
            setCheckoutSuccessOpen(true);
            clearGuestStoreCart(storeId, cartKind);
            setGuestItems([]);
          }}
        />
      ) : null}

      <CheckoutAuthRequiredDialog
        open={authGateOpen}
        onOpenChange={setAuthGateOpen}
        storeId={storeId}
        cartKind={cartKind}
        onAuthenticated={() => {
          void refetch().then(() => setCheckoutOpen(true));
        }}
      />

      <StoreCheckoutSuccessDialog
        open={checkoutSuccessOpen}
        orderId={checkoutSuccessOrderId}
        onOpenChange={setCheckoutSuccessOpen}
      />

    </>

  );

}



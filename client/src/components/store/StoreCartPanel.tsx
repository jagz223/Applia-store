import { useState } from "react";

import { Link } from "wouter";

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

}: {

  storeId: number;

  line: StoreCartLine;

}) {

  const { toast } = useToast();

  const updateMutation = useUpdateStoreCartItem(storeId);

  const removeMutation = useRemoveFromStoreCart(storeId);

  const busy = updateMutation.isPending || removeMutation.isPending;



  async function setQuantity(next: number) {

    try {

      const body =
        line.kind === "product"
          ? {
              kind: "product" as const,
              productId: line.productId!,
              quantity: next,
              lineKey: line.lineKey,
              removedIngredientMaterialIds: line.removedIngredientMaterialIds ?? [],
              additionalIngredientMaterialIds: line.additionalIngredientMaterialIds ?? [],
            }
          : { kind: "promotion" as const, promotionId: line.promotionId!, quantity: next, lineKey: line.lineKey };

      await updateMutation.mutateAsync(body);

    } catch (e) {

      toast({

        variant: "destructive",

        title: "No se pudo actualizar",

        description: e instanceof Error ? e.message : "Error desconocido",

      });

    }

  }



  async function removeLine() {

    try {

      const body =
        line.kind === "product"
          ? {
              kind: "product" as const,
              productId: line.productId!,
              lineKey: line.lineKey,
              removedIngredientMaterialIds: line.removedIngredientMaterialIds ?? [],
              additionalIngredientMaterialIds: line.additionalIngredientMaterialIds ?? [],
            }
          : { kind: "promotion" as const, promotionId: line.promotionId!, lineKey: line.lineKey };

      await removeMutation.mutateAsync(body);

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

      <div className="h-16 w-16 shrink-0 rounded-xl border border-border bg-muted/40 overflow-hidden flex items-center justify-center">

        {line.imageUrl ? (

          <img src={line.imageUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />

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

        <div className="flex items-center justify-between gap-2">

          <div className="inline-flex items-center rounded-lg border border-border bg-background">

            <button

              type="button"

              className="h-8 w-8 flex items-center justify-center hover:bg-muted disabled:opacity-50 rounded-l-lg"

              disabled={busy || line.quantity <= 1}

              aria-label="Reducir cantidad"

              onClick={() => void setQuantity(line.quantity - 1)}

            >

              <Minus className="h-3.5 w-3.5" />

            </button>

            <span className="min-w-[2rem] text-center text-sm font-medium">{line.quantity}</span>

            <button

              type="button"

              className="h-8 w-8 flex items-center justify-center hover:bg-muted disabled:opacity-50 rounded-r-lg"

              disabled={busy}

              aria-label="Aumentar cantidad"

              onClick={() => void setQuantity(line.quantity + 1)}

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

}: {

  storeId: number;

  storeName: string;

  enabled: boolean;

}) {

  const { isAuthenticated } = useAuth();

  const { data: cart, isLoading } = useStoreCart(storeId, enabled && isAuthenticated);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutSuccessOpen, setCheckoutSuccessOpen] = useState(false);
  const [checkoutSuccessOrderId, setCheckoutSuccessOrderId] = useState<number | null>(null);



  const hasItems = (cart?.items.length ?? 0) > 0;

  const canCheckout = isAuthenticated && hasItems && !isLoading;



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

          {!isAuthenticated ? (

            <div className="py-12 text-center space-y-3">

              <ShoppingBag className="h-10 w-10 mx-auto text-muted-foreground" />

              <p className="text-sm text-muted-foreground">

                Inicia sesión para guardar tu carrito en esta tienda.

              </p>

              <Button asChild size="sm">

                <Link href="/login">Iniciar sesión</Link>

              </Button>

            </div>

          ) : isLoading ? (

            <div className="py-16 flex justify-center">

              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />

            </div>

          ) : !hasItems ? (

            <div className="py-16 text-center space-y-2">

              <ShoppingBag className="h-10 w-10 mx-auto text-muted-foreground" />

              <p className="text-sm text-muted-foreground">Tu carrito está vacío.</p>

            </div>

          ) : (

            <ul>

              {cart!.items.map((line) => (

                <CartLineRow key={cartLineKey(line)} storeId={storeId} line={line} />

              ))}

            </ul>

          )}

        </div>



        <div className="border-t border-border/60 p-5 space-y-3 bg-muted/15 rounded-b-2xl">

          <div className="flex items-center justify-between text-sm">

            <span className="text-muted-foreground">Subtotal</span>

            <span className="text-muted-foreground">{formatPrice(cart?.subtotal ?? 0)}</span>

          </div>

          <div className="flex items-center justify-between">

            <span className="font-semibold">Total</span>

            <span className="text-xl font-bold text-primary">{formatPrice(cart?.subtotal ?? 0)}</span>

          </div>

          <Button

            type="button"

            className="w-full h-11 text-base font-semibold"

            disabled={!canCheckout}

            onClick={() => setCheckoutOpen(true)}

          >

            Comprar

          </Button>

          <p className="text-[11px] text-center text-muted-foreground">

            El carrito se vacía automáticamente cada 24 horas.

          </p>

        </div>

      </aside>



      {cart && hasItems ? (

        <StoreCartCheckoutDialog

          storeId={storeId}

          cart={cart}

          open={checkoutOpen}

          onOpenChange={setCheckoutOpen}

          onCheckoutSuccess={(orderId) => {
            setCheckoutSuccessOrderId(orderId);
            setCheckoutSuccessOpen(true);
          }}

        />

      ) : null}

      <StoreCheckoutSuccessDialog
        open={checkoutSuccessOpen}
        orderId={checkoutSuccessOrderId}
        onOpenChange={setCheckoutSuccessOpen}
      />

    </>

  );

}



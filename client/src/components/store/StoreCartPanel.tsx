import { useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, ImageIcon, Loader2, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  useRemoveFromStoreCart,
  useStoreCart,
  useUpdateStoreCartItem,
  type StoreCartLine,
} from "@/hooks/use-store-cart";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

function formatPrice(value: number) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
}

function cartLineKey(line: StoreCartLine) {
  return line.kind === "product" ? `p-${line.productId}` : `m-${line.promotionId}`;
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
          ? { kind: "product" as const, productId: line.productId!, quantity: next }
          : { kind: "promotion" as const, promotionId: line.promotionId!, quantity: next };
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
          ? { kind: "product" as const, productId: line.productId! }
          : { kind: "promotion" as const, promotionId: line.promotionId! };
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
    <li className="flex gap-3 py-3 border-b border-border last:border-0">
      <div className="h-14 w-14 shrink-0 rounded-md border border-border bg-muted/40 overflow-hidden flex items-center justify-center">
        {line.imageUrl ? (
          <img src={line.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-5 w-5 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-snug line-clamp-2">{line.name}</p>
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
        <p className="text-xs text-muted-foreground">
          {line.kind === "promotion" ? "Promoción · " : ""}
          {formatPrice(line.price)} c/u
        </p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="inline-flex items-center rounded-md border border-border">
            <button
              type="button"
              className="h-7 w-7 flex items-center justify-center hover:bg-muted disabled:opacity-50"
              disabled={busy || line.quantity <= 1}
              aria-label="Reducir cantidad"
              onClick={() => void setQuantity(line.quantity - 1)}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[1.75rem] text-center text-sm font-medium">{line.quantity}</span>
            <button
              type="button"
              className="h-7 w-7 flex items-center justify-center hover:bg-muted disabled:opacity-50"
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
  const [open, setOpen] = useState(false);
  const { data: cart, isLoading } = useStoreCart(storeId, enabled && isAuthenticated);

  if (!enabled) return null;

  const itemCount = cart?.itemCount ?? 0;

  return (
    <div
      className={cn(
        "fixed right-0 top-20 z-40 flex h-[calc(100vh-5rem)] max-h-[720px]",
        "pointer-events-none",
      )}
      aria-label="Carrito de compras"
    >
      <div
        className={cn(
          "pointer-events-auto flex h-full transition-[width] duration-300 ease-in-out overflow-hidden",
          open ? "w-[min(100vw,320px)]" : "w-12",
        )}
      >
        {open ? (
          <aside className="flex h-full w-[min(100vw,320px)] flex-col border border-border border-r-0 bg-background shadow-xl rounded-l-xl">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold truncate">Carrito</h2>
                <p className="text-xs text-muted-foreground truncate">{storeName}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 h-8 w-8"
                aria-label="Cerrar carrito"
                onClick={() => setOpen(false)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-4">
              {!isAuthenticated ? (
                <div className="py-8 text-center space-y-3">
                  <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Inicia sesión para guardar tu carrito en esta tienda.
                  </p>
                  <Button asChild size="sm">
                    <Link href="/login">Iniciar sesión</Link>
                  </Button>
                </div>
              ) : isLoading ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (cart?.items.length ?? 0) === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground" />
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

            <div className="border-t border-border p-4 space-y-3 bg-muted/20">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-lg font-bold">{formatPrice(cart?.subtotal ?? 0)}</span>
              </div>
              <Button type="button" className="w-full" disabled>
                Comprar
              </Button>
              <p className="text-[11px] text-center text-muted-foreground">
                El carrito se vacía automáticamente cada 24 horas.
              </p>
            </div>
          </aside>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex h-full w-12 shrink-0 flex-col items-center justify-center gap-2",
            "border border-border bg-background shadow-lg rounded-l-xl",
            "hover:bg-muted/50 transition-colors",
            open && "rounded-l-none border-l-0",
          )}
          aria-label={open ? "Cerrar carrito" : "Abrir carrito"}
          aria-expanded={open}
        >
          {open ? (
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              <ShoppingCart className="h-5 w-5" />
              {itemCount > 0 ? (
                <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              ) : null}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, Redirect, useSearch } from "wouter";
import { ArrowLeft, ChevronRight, ExternalLink, ImageIcon, Loader2, Package, Store } from "lucide-react";
import {
  STORE_ORDER_STATUS_LABELS,
  STORE_ORDER_STATUSES,
  type StoreOrderStatus,
} from "@shared/store-order-schema";
import { useAuth } from "@/hooks/use-auth";
import { isClientRole } from "@/lib/auth-utils";
import { useMyStoreOrderDetail, useMyStoreOrders, useMyStoreOrdersLiveSync } from "@/hooks/use-store-orders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StoreOrderStatusRoadmap } from "@/components/store/StoreOrderStatusRoadmap";
import { StoreOrderDeliveryRouteMap } from "@/components/store/StoreOrderDeliveryRouteMap";
import { StoreMyOrderChatPanel } from "@/components/store/StoreMyOrderChatPanel";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

function formatPrice(value: number) {
  return new Intl.NumberFormat("es-VE", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-VE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDateShort(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-VE", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Todos los estados" },
  ...STORE_ORDER_STATUSES.map((status) => ({
    value: status,
    label: STORE_ORDER_STATUS_LABELS[status],
  })),
];

const fieldClass =
  "h-11 w-full rounded-2xl border-border/80 bg-muted/40 shadow-none focus-visible:ring-secondary dark:focus-visible:ring-primary";

function statusBadgeVariant(status: StoreOrderStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "rechazado") return "destructive";
  if (status === "completado") return "default";
  if (status === "pagado") return "secondary";
  return "outline";
}

function MyOrderDetailContent({ orderId }: { orderId: number }) {
  const { data: order, isLoading, error } = useMyStoreOrderDetail(orderId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-secondary dark:text-primary" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <p className="py-8 text-center text-sm text-destructive">
        {(error as Error | undefined)?.message ?? "Pedido no encontrado."}
      </p>
    );
  }

  const storeHref = order.storeSlug ? `/tienda/${order.storeSlug}` : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Tienda
          </p>
          {storeHref ? (
            <Link
              href={storeHref}
              className="mt-1 inline-flex items-center gap-1 font-semibold text-secondary hover:underline dark:text-primary"
            >
              {order.storeName ?? "Tienda"}
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <p className="mt-1 font-semibold">{order.storeName ?? "Tienda"}</p>
          )}
        </div>
        <Badge variant={statusBadgeVariant(order.status)}>{order.statusLabel}</Badge>
      </div>

      <div className="space-y-1.5 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm">
        <p>
          <span className="font-medium text-foreground">Pedido:</span>{" "}
          <span className="text-muted-foreground">#{order.id}</span>
        </p>
        <p>
          <span className="font-medium text-foreground">Creado:</span>{" "}
          <span className="text-muted-foreground">{formatDate(order.createdAt)}</span>
        </p>
        <p>
          <span className="font-medium text-foreground">Entrega:</span>{" "}
          <span className="text-muted-foreground">{order.fulfillmentLabel}</span>
        </p>
        {order.branchName ? (
          <p>
            <span className="font-medium text-foreground">Sucursal:</span>{" "}
            <span className="text-muted-foreground">{order.branchName}</span>
          </p>
        ) : null}
      </div>

      <StoreOrderStatusRoadmap status={order.status} fulfillmentMode={order.fulfillmentMode} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 rounded-2xl border border-border/70 bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Montos
          </p>
          <p className="text-sm">
            Productos: <span className="font-semibold">{formatPrice(order.subtotal)}</span>
          </p>
          {order.deliveryFee > 0 ? (
            <p className="text-sm">
              Envío: <span className="font-semibold">{formatPrice(order.deliveryFee)}</span>
            </p>
          ) : null}
          <p className="text-sm">
            Total pagado: <span className="font-semibold">{formatPrice(order.amountPaid)}</span>
          </p>
        </div>
        <div className="space-y-1.5 rounded-2xl border border-border/70 bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Pago
          </p>
          <p className="font-medium">{order.paymentMethodName}</p>
          <p className="text-sm text-muted-foreground">Ref: {order.reference}</p>
          {order.proofImageUrl ? (
            <a
              href={order.proofImageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-secondary hover:underline dark:text-primary"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Ver comprobante
            </a>
          ) : null}
        </div>
      </div>

      {order.fulfillmentMode === "delivery" && order.deliveryLocation ? (
        <div className="space-y-3 pt-1">
          <div>
            <p className="text-sm font-semibold">Ruta de entrega</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{order.deliveryLocation.label}</p>
          </div>
          <StoreOrderDeliveryRouteMap
            origin={
              order.storeLocation
                ? { lat: order.storeLocation.lat, lon: order.storeLocation.lon }
                : null
            }
            destination={{ lat: order.deliveryLocation.lat, lon: order.deliveryLocation.lon }}
            deliveryFee={order.deliveryFee > 0 ? order.deliveryFee : null}
            fallbackDistanceM={order.deliveryDistanceM}
          />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border/70">
        <div className="border-b border-border/60 bg-muted/25 px-4 py-2.5">
          <p className="text-sm font-semibold">Productos</p>
        </div>
        <ul className="divide-y divide-border/60">
          {order.items.map((item, idx) => (
            <li
              key={`${item.kind}-${item.productId ?? item.promotionId ?? idx}`}
              className="flex items-start justify-between gap-3 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium leading-snug">{item.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Cant. {item.quantity}</p>
              </div>
              <span className="shrink-0 font-semibold">{formatPrice(item.lineTotal)}</span>
            </li>
          ))}
        </ul>
      </div>

      <StoreMyOrderChatPanel
        orderId={order.id}
        status={order.status}
        updatedAt={order.updatedAt}
        branchName={order.branchName}
      />
    </div>
  );
}

export default function MyStoreOrders() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const searchQs = useSearch();
  const [statusFilter, setStatusFilter] = useState("all");
  const [orderIdFilter, setOrderIdFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const filters = useMemo(
    () => ({
      status: statusFilter === "all" ? undefined : statusFilter,
      orderId: orderIdFilter.trim() || undefined,
      dateFrom: dateFrom.trim() || undefined,
      dateTo: dateTo.trim() || undefined,
    }),
    [statusFilter, orderIdFilter, dateFrom, dateTo],
  );

  const { data: orders = [], isLoading, error, refetch, isFetching } = useMyStoreOrders(
    filters,
    isAuthenticated,
  );

  useMyStoreOrdersLiveSync(isAuthenticated);

  useEffect(() => {
    const params = new URLSearchParams(searchQs || "");
    const orderIdRaw = params.get("orderId");
    const parsed = orderIdRaw ? Number.parseInt(orderIdRaw, 10) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      setSelectedOrderId(parsed);
    }
    const pago = (params.get("pago") ?? "").trim().toLowerCase();
    if (pago === "ok") {
      toast({ title: "Pago confirmado", description: "Tu pedido se creó y quedó confirmado." });
    } else if (pago === "pendiente") {
      toast({ title: "Pago pendiente", description: "Aún no se creó el pedido. Completa el pago para confirmarlo." });
    } else if (pago === "cancelado") {
      toast({
        variant: "destructive",
        title: "Pago no completado",
        description: "No se creó el pedido. Puedes volver al carrito e intentar de nuevo.",
      });
    }
  }, [searchQs, toast]);

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-secondary dark:text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (!isClientRole(user)) {
    return <Redirect to="/tienda" />;
  }

  return (
    <div
      className={cn(
        "relative flex min-h-[calc(100dvh-4rem)] flex-1 flex-col",
        "bg-[radial-gradient(ellipse_at_15%_0%,hsl(var(--secondary)/0.12),transparent_45%),radial-gradient(ellipse_at_90%_20%,hsl(var(--primary)/0.05),transparent_40%),hsl(var(--background))]",
      )}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-5 sm:gap-5 sm:px-6 sm:py-8 lg:px-8">
        <div className="space-y-3">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="-ml-2 h-9 rounded-full px-3 text-muted-foreground hover:text-foreground"
          >
            <Link href="/tienda">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Tienda
            </Link>
          </Button>

          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Package className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div className="min-w-0 pt-0.5">
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Mis pedidos
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Consulta el estado de tus compras.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-border/70 bg-card/90 p-3.5 shadow-sm backdrop-blur-sm sm:p-4">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Input
              id="my-order-id"
              aria-label="N.º de pedido"
              className={fieldClass}
              inputMode="numeric"
              placeholder="N.º pedido"
              value={orderIdFilter}
              onChange={(e) => setOrderIdFilter(e.target.value)}
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className={fieldClass} aria-label="Estado">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id="my-order-from"
              aria-label="Desde"
              type="date"
              className={fieldClass}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <Input
              id="my-order-to"
              aria-label="Hasta"
              type="date"
              className={fieldClass}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
            <Button
              type="button"
              className="h-11 w-full rounded-full font-semibold shadow-md shadow-primary/10"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Actualizar
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-secondary dark:text-primary" />
            </div>
          ) : error ? (
            <p className="py-12 text-center text-sm text-destructive">{(error as Error).message}</p>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-[1.5rem] border border-dashed border-border/80 bg-card/60 px-4 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Store className="h-6 w-6" />
              </span>
              <p className="text-sm text-muted-foreground">Aún no tienes pedidos.</p>
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/tienda">Ir a la tienda</Link>
              </Button>
            </div>
          ) : (
            <ul className="grid gap-3 sm:gap-3.5">
              {orders.map((order) => (
                <li key={order.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedOrderId(order.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[1.25rem] border border-border/70 bg-card/95 p-3.5 text-left shadow-sm",
                      "transition-colors hover:border-border hover:bg-muted/30",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary dark:focus-visible:ring-primary",
                    )}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-foreground">
                      <Package className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold tracking-tight">#{order.id}</span>
                        <Badge variant={statusBadgeVariant(order.status)} className="font-medium">
                          {order.statusLabel}
                        </Badge>
                      </div>
                      <p className="truncate text-sm text-foreground/90">
                        {order.storeName ?? "Tienda"}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>{formatDateShort(order.createdAt)}</span>
                        <span className="font-semibold text-foreground">
                          {formatPrice(order.amountDue)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Dialog open={selectedOrderId != null} onOpenChange={(open) => !open && setSelectedOrderId(null)}>
        <DialogContent
          layer="elevated"
          shellClassName="items-end justify-end p-0 sm:items-center sm:justify-center sm:p-4"
          className={cn(
            "!flex flex max-h-[min(92dvh,56rem)] w-full flex-col gap-0 overflow-hidden p-0",
            "h-[min(92dvh,56rem)] rounded-t-[1.5rem] sm:h-auto sm:max-h-[min(85dvh,56rem)] sm:max-w-3xl sm:rounded-2xl",
          )}
        >
          <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-4 pb-3 pt-5 text-left sm:px-6 sm:pt-6">
            <DialogTitle className="pr-8 font-display text-xl tracking-tight">
              Detalle del pedido
            </DialogTitle>
            <DialogDescription>Seguimiento de tu compra (solo lectura).</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
            {selectedOrderId != null ? <MyOrderDetailContent orderId={selectedOrderId} /> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, Redirect, useSearch } from "wouter";
import { ArrowLeft, ExternalLink, ImageIcon, Loader2, Package, Store } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StoreOrderStatusRoadmap } from "@/components/store/StoreOrderStatusRoadmap";
import { StoreOrderDeliveryRouteMap } from "@/components/store/StoreOrderDeliveryRouteMap";

function formatPrice(value: number) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Todos los estados" },
  ...STORE_ORDER_STATUSES.map((status) => ({
    value: status,
    label: STORE_ORDER_STATUS_LABELS[status],
  })),
];

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
      <div className="py-16 flex justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <p className="text-sm text-destructive py-8 text-center">
        {(error as Error | undefined)?.message ?? "Pedido no encontrado."}
      </p>
    );
  }

  const storeHref = order.storeSlug ? `/tienda/${order.storeSlug}` : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Tienda</p>
          {storeHref ? (
            <Link href={storeHref} className="font-semibold text-primary hover:underline inline-flex items-center gap-1">
              {order.storeName ?? "Tienda"}
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <p className="font-semibold">{order.storeName ?? "Tienda"}</p>
          )}
        </div>
        <Badge variant={statusBadgeVariant(order.status)}>{order.statusLabel}</Badge>
      </div>

      <div className="space-y-1 text-sm text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Pedido:</span> #{order.id}
        </p>
        <p>
          <span className="font-medium text-foreground">Creado:</span> {formatDate(order.createdAt)}
        </p>
        <p>
          <span className="font-medium text-foreground">Entrega:</span> {order.fulfillmentLabel}
        </p>
      </div>

      <StoreOrderStatusRoadmap status={order.status} fulfillmentMode={order.fulfillmentMode} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Montos</p>
          <p className="text-sm">
            Productos: <span className="font-semibold">{formatPrice(order.subtotal)}</span>
          </p>
          {order.deliveryFee > 0 ? (
            <p className="text-sm">
              Envío: <span className="font-semibold">{formatPrice(order.deliveryFee)}</span>
            </p>
          ) : null}
          <p className="text-sm">
            Total pagado a la tienda: <span className="font-semibold">{formatPrice(order.amountPaid)}</span>
          </p>
        </div>
        <div className="rounded-lg border border-border p-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Pago</p>
          <p className="font-medium">{order.paymentMethodName}</p>
          <p className="text-sm text-muted-foreground">Ref: {order.reference}</p>
          {order.proofImageUrl ? (
            <a
              href={order.proofImageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-1"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Ver comprobante
            </a>
          ) : null}
        </div>
      </div>

      {order.fulfillmentMode === "delivery" && order.deliveryLocation ? (
        <div className="space-y-3 pt-2">
          <div>
            <p className="text-sm font-semibold">Ruta de entrega</p>
            <p className="text-xs text-muted-foreground mt-1">{order.deliveryLocation.label}</p>
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

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/20">
          <p className="text-sm font-semibold">Productos</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Cant.</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.items.map((item, idx) => (
              <TableRow key={`${item.kind}-${item.productId ?? item.promotionId ?? idx}`}>
                <TableCell>{item.name}</TableCell>
                <TableCell className="text-right">{item.quantity}</TableCell>
                <TableCell className="text-right font-medium">{formatPrice(item.lineTotal)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function MyStoreOrders() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const searchQs = useSearch();
  const [statusFilter, setStatusFilter] = useState("all");
  const [orderIdFilter, setOrderIdFilter] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const filters = useMemo(
    () => ({
      status: statusFilter === "all" ? undefined : statusFilter,
      orderId: orderIdFilter.trim() || undefined,
      storeId: storeFilter === "all" ? undefined : storeFilter,
      dateFrom: dateFrom.trim() || undefined,
      dateTo: dateTo.trim() || undefined,
    }),
    [statusFilter, orderIdFilter, storeFilter, dateFrom, dateTo],
  );

  const { data: orders = [], isLoading, error, refetch, isFetching } = useMyStoreOrders(
    filters,
    isAuthenticated,
  );

  useMyStoreOrdersLiveSync(isAuthenticated);

  useEffect(() => {
    const orderIdRaw = new URLSearchParams(searchQs || "").get("orderId");
    const parsed = orderIdRaw ? Number.parseInt(orderIdRaw, 10) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      setSelectedOrderId(parsed);
    }
  }, [searchQs]);

  const storeOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const o of orders) {
      if (o.storeId && o.storeName) map.set(o.storeId, o.storeName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [orders]);

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
    <div className="flex flex-col flex-1 min-h-[calc(100dvh-4.5rem)] w-full px-4 sm:px-6 lg:px-8 py-4 gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 shrink-0">
        <Button variant="ghost" size="sm" asChild className="-ml-2 h-8">
          <Link href="/tiendas">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Tiendas
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6 sm:h-7 sm:w-7 text-primary shrink-0" />
            Mis pedidos de tienda
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Consulta el estado de tus compras en todas las tiendas.
          </p>
        </div>
      </div>

      <div className="shrink-0 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/15 px-3 py-2">
        <Input
          id="my-order-id"
          aria-label="N.º de pedido"
          className="h-9 w-[7.5rem] shrink-0"
          inputMode="numeric"
          placeholder="N.º pedido"
          value={orderIdFilter}
          onChange={(e) => setOrderIdFilter(e.target.value)}
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[11rem] shrink-0" aria-label="Estado">
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
        <Select value={storeFilter} onValueChange={setStoreFilter}>
          <SelectTrigger className="h-9 w-[10rem] sm:w-[12rem] shrink-0" aria-label="Tienda">
            <SelectValue placeholder="Tienda" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las tiendas</SelectItem>
            {storeOptions.map(([id, name]) => (
              <SelectItem key={id} value={String(id)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          id="my-order-from"
          aria-label="Desde"
          type="date"
          className="h-9 w-[9.5rem] shrink-0"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <Input
          id="my-order-to"
          aria-label="Hasta"
          type="date"
          className="h-9 w-[9.5rem] shrink-0"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-9 shrink-0"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
          Actualizar
        </Button>
      </div>

      <Card className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <CardContent className="flex flex-col flex-1 min-h-0 p-0">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive py-12 text-center">{(error as Error).message}</p>
          ) : orders.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 px-4">
              <Store className="h-10 w-10 text-muted-foreground/60" />
              <p className="text-muted-foreground">Aún no tienes pedidos en tiendas.</p>
              <Button asChild variant="outline">
                <Link href="/tiendas">Explorar tiendas</Link>
              </Button>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="w-[5rem]">Pedido</TableHead>
                    <TableHead>Tienda</TableHead>
                    <TableHead className="whitespace-nowrap">Fecha</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Total tienda</TableHead>
                    <TableHead className="w-[7.5rem]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id} className="hover:bg-muted/40">
                      <TableCell className="font-medium">#{order.id}</TableCell>
                      <TableCell>{order.storeName ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatDate(order.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(order.status)}>{order.statusLabel}</Badge>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatPrice(order.amountDue)}</TableCell>
                      <TableCell className="text-right">
                        <Button type="button" size="sm" variant="outline" onClick={() => setSelectedOrderId(order.id)}>
                          Ver detalle
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={selectedOrderId != null} onOpenChange={(open) => !open && setSelectedOrderId(null)}>
        <DialogContent className="max-w-4xl w-[min(95vw,56rem)] max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle del pedido</DialogTitle>
            <DialogDescription>Seguimiento de tu compra (solo lectura).</DialogDescription>
          </DialogHeader>
          {selectedOrderId != null ? <MyOrderDetailContent orderId={selectedOrderId} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

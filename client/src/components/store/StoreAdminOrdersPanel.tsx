import { useMemo, useState, useEffect } from "react";
import { ExternalLink, FileText, ImageIcon, Loader2, MapPin, Package } from "lucide-react";
import {
  STORE_ORDER_STATUS_LABELS,
  STORE_ORDER_STATUSES,
  canGenerateStoreOrderInvoice,
  type StoreOrderStatus,
} from "@shared/store-order-schema";
import {
  useStoreOrderDetail,
  useStoreOrders,
  useUpdateStoreOrderStatus,
} from "@/hooks/use-store-orders";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { StoreOrderStatusRoadmap } from "@/components/store/StoreOrderStatusRoadmap";
import { StoreOrderDeliveryRouteMap } from "@/components/store/StoreOrderDeliveryRouteMap";
import { StoreOrderInvoicePdfDialog } from "@/components/store/StoreOrderInvoicePdfDialog";
import type { StoreLocation } from "@shared/store-schema";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

function OrderDetailContent({
  storeId,
  orderId,
  storeLocation,
}: {
  storeId: number;
  orderId: number;
  storeLocation: StoreLocation | null;
}) {
  const { toast } = useToast();
  const { data: order, isLoading, error } = useStoreOrderDetail(storeId, orderId);
  const updateMutation = useUpdateStoreOrderStatus(storeId);

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
        {(error as Error | undefined)?.message ?? "Orden no encontrada."}
      </p>
    );
  }

  async function changeStatus(status: StoreOrderStatus) {
    if (!order) return;
    try {
      await updateMutation.mutateAsync({ orderId: order.id, status });
      toast({
        title: "Estado actualizado",
        description: `La orden #${order.id} ahora está: ${STORE_ORDER_STATUS_LABELS[status]}.`,
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo actualizar",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  const originLocation = order.storeLocation ?? storeLocation;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Creada:</span> {formatDate(order.createdAt)}
        </p>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Última edición:</span> {formatDate(order.updatedAt)}
        </p>
      </div>

      <StoreOrderStatusRoadmap status={order.status} fulfillmentMode={order.fulfillmentMode} />

      {order.allowedNextStatuses.length > 0 ? (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <p className="text-sm font-semibold">Cambiar estado</p>
          <div className="flex flex-wrap gap-2">
            {order.allowedNextStatuses.map((opt) => (
              <Button
                key={opt.status}
                type="button"
                variant={opt.status === "rechazado" ? "destructive" : "outline"}
                disabled={updateMutation.isPending}
                onClick={() => void changeStatus(opt.status)}
              >
                {updateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Cliente</p>
          <p className="font-medium">{order.customerName ?? "—"}</p>
          <p className="text-sm text-muted-foreground">{order.customerEmail ?? "—"}</p>
        </div>
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
            Total tienda: <span className="font-semibold">{formatPrice(order.amountDue)}</span>
          </p>
          <p className="text-sm">
            Pagado: <span className="font-semibold">{formatPrice(order.amountPaid)}</span>
          </p>
        </div>
        <div className="rounded-lg border border-border p-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Pago</p>
          <p className="font-medium">{order.paymentMethodName}</p>
          <p className="text-sm text-muted-foreground break-all">{order.paymentMethodAccountNumber}</p>
          <p className="text-sm">
            Referencia: <span className="font-mono">{order.reference}</span>
          </p>
        </div>
        <div className="rounded-lg border border-border p-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Recibo</p>
          <p className="font-medium">{order.fulfillmentLabel}</p>
        </div>
      </div>

      {order.fulfillmentMode === "delivery" ? (
        <div className="rounded-lg border border-border p-4 space-y-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Entrega a domicilio</p>
            <p className="text-sm text-muted-foreground">
              Ruta desde la tienda hasta la ubicación indicada por el cliente.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-1">
              <p className="text-xs font-semibold text-primary flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                Inicio (tienda)
              </p>
              {originLocation ? (
                <>
                  <p className="text-sm">{originLocation.label}</p>
                  <a
                    href={`https://www.google.com/maps?q=${originLocation.lat},${originLocation.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                  >
                    Ver en mapa <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  La tienda no tiene ubicación configurada.
                </p>
              )}
            </div>
            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-1">
              <p className="text-xs font-semibold text-green-700 dark:text-green-400 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                Destino (cliente)
              </p>
              {order.deliveryLocation ? (
                <>
                  <p className="text-sm">{order.deliveryLocation.label}</p>
                  <a
                    href={`https://www.google.com/maps?q=${order.deliveryLocation.lat},${order.deliveryLocation.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                  >
                    Ver en mapa <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Sin ubicación de entrega registrada.</p>
              )}
            </div>
          </div>
          <StoreOrderDeliveryRouteMap
            origin={originLocation}
            destination={order.deliveryLocation}
            deliveryFee={order.deliveryFee > 0 ? order.deliveryFee : null}
            fallbackDistanceM={order.deliveryDistanceM}
          />
        </div>
      ) : null}

      <div className="rounded-lg border border-border p-4 space-y-3">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">Comprobante</p>
        {order.proofImageUrl ? (
          <a href={order.proofImageUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
            <img
              src={order.proofImageUrl}
              alt="Comprobante de pago"
              referrerPolicy="no-referrer"
              className="max-h-64 rounded-md border border-border object-contain bg-muted/30"
            />
          </a>
        ) : (
          <p className="text-sm text-muted-foreground">Sin comprobante.</p>
        )}
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Cant.</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.items.map((item, idx) => (
              <TableRow key={`${item.kind}-${item.productId ?? item.promotionId ?? idx}`}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-10 w-10 rounded border border-border object-cover bg-muted/30"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded border border-dashed border-border flex items-center justify-center text-muted-foreground">
                        <ImageIcon className="h-4 w-4" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-sm">{item.name}</p>
                      {item.kind === "promotion" ? (
                        <p className="text-xs text-muted-foreground">Promoción</p>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right">{item.quantity}</TableCell>
                <TableCell className="text-right">{formatPrice(item.price)}</TableCell>
                <TableCell className="text-right font-medium">{formatPrice(item.lineTotal)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function OrderDetailDialog({
  storeId,
  orderId,
  storeLocation,
  open,
  onOpenChange,
}: {
  storeId: number;
  orderId: number | null;
  storeLocation: StoreLocation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        layer="elevated"
        shellClassName="items-start justify-center pt-[4.5rem] pb-4 px-4 overflow-y-auto"
        overlayClassName="bg-black/50 backdrop-blur-[1px]"
        className="max-w-4xl w-[min(95vw,56rem)] max-h-[calc(100dvh-5.5rem)] overflow-y-auto sm:rounded-xl"
      >
        <DialogHeader>
          <DialogTitle>{orderId != null ? `Orden #${orderId}` : "Detalle de orden"}</DialogTitle>
          <DialogDescription>Datos del pedido, comprobante y cambio de estado.</DialogDescription>
        </DialogHeader>
        {orderId != null ? (
          <OrderDetailContent storeId={storeId} orderId={orderId} storeLocation={storeLocation} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function StoreAdminOrdersPanel({
  storeId,
  storeLocation,
}: {
  storeId: number;
  storeLocation: StoreLocation | null;
}) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [orderIdFilter, setOrderIdFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [invoiceOrderId, setInvoiceOrderId] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("orderId");
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      setSelectedOrderId(parsed);
    }
  }, []);

  useEffect(() => {
    const onCloseOrderDetail = () => setSelectedOrderId(null);
    window.addEventListener("store-admin:close-order-detail", onCloseOrderDetail);
    return () => window.removeEventListener("store-admin:close-order-detail", onCloseOrderDetail);
  }, []);

  const filters = useMemo(
    () => ({
      status: statusFilter === "all" ? undefined : statusFilter,
      orderId: orderIdFilter.trim() || undefined,
      dateFrom: dateFromFilter.trim() || undefined,
      dateTo: dateToFilter.trim() || undefined,
    }),
    [statusFilter, orderIdFilter, dateFromFilter, dateToFilter],
  );

  const { data: orders = [], isLoading, error } = useStoreOrders(storeId, filters);

  function closeOrderDialog(open: boolean) {
    if (!open) setSelectedOrderId(null);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Órdenes
          </CardTitle>
          <CardDescription>
            Revisa los pedidos de clientes, comprobantes y actualiza el estado de cada orden.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="order-status-filter">Estado</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="order-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="order-id-filter">ID de orden</Label>
              <Input
                id="order-id-filter"
                inputMode="numeric"
                placeholder="Ej. 12"
                value={orderIdFilter}
                onChange={(e) => setOrderIdFilter(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order-date-from">Desde</Label>
              <Input
                id="order-date-from"
                type="date"
                value={dateFromFilter}
                onChange={(e) => setDateFromFilter(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order-date-to">Hasta</Label>
              <Input
                id="order-date-to"
                type="date"
                value={dateToFilter}
                min={dateFromFilter || undefined}
                onChange={(e) => setDateToFilter(e.target.value)}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          ) : orders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No hay órdenes con esos filtros.</p>
          ) : (
            <div className="rounded-lg border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Recibo</TableHead>
                    <TableHead className="text-right">Total tienda</TableHead>
                    <TableHead>Creada</TableHead>
                    <TableHead>Última edición</TableHead>
                    <TableHead className="text-right">Factura</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => {
                    const canInvoice = canGenerateStoreOrderInvoice(order.status);
                    return (
                    <TableRow
                      key={order.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setSelectedOrderId(order.id)}
                    >
                      <TableCell className="font-mono font-medium">#{order.id}</TableCell>
                      <TableCell>{order.customerName ?? order.customerEmail ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(order.status)}>{order.statusLabel}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{order.fulfillmentLabel}</TableCell>
                      <TableCell className="text-right">{formatPrice(order.amountDue)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(order.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(order.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={!canInvoice}
                                  className="h-8 rounded-full px-3"
                                  onClick={() => setInvoiceOrderId(order.id)}
                                >
                                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                                  PDF
                                </Button>
                              </span>
                            </TooltipTrigger>
                            {!canInvoice ? (
                              <TooltipContent>
                                Disponible desde confirmado. No aplica en pagado ni rechazado.
                              </TooltipContent>
                            ) : (
                              <TooltipContent>Ver factura PDF</TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <OrderDetailDialog
        storeId={storeId}
        storeLocation={storeLocation}
        orderId={selectedOrderId}
        open={selectedOrderId != null}
        onOpenChange={closeOrderDialog}
      />

      <StoreOrderInvoicePdfDialog
        open={invoiceOrderId != null}
        onOpenChange={(open) => {
          if (!open) setInvoiceOrderId(null);
        }}
        storeId={storeId}
        orderId={invoiceOrderId}
      />
    </>
  );
}

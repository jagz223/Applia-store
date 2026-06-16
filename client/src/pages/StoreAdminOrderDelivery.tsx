import { Link, useRoute } from "wouter";
import { ArrowLeft, Loader2, Phone, Truck, User } from "lucide-react";
import { STORE_ORDER_STATUS_LABELS } from "@shared/store-order-schema";
import { useAuth } from "@/hooks/use-auth";
import { useStoreBySlug } from "@/hooks/use-my-store";
import { useStoreOrderDeliveryDetail } from "@/hooks/use-store-orders";
import { StoreAdminLayout } from "@/components/store/StoreAdminLayout";
import { StoreAdminDeliveryChat } from "@/components/store/StoreAdminDeliveryChat";
import { StoreOrderStatusRoadmap } from "@/components/store/StoreOrderStatusRoadmap";
import { StoreOrderDeliveryRouteMap } from "@/components/store/StoreOrderDeliveryRouteMap";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const PACK_STATUS_LABELS: Record<string, string> = {
  searching: "Buscando conductor",
  matched: "Conductor asignado",
  in_progress: "En camino",
  cancelled: "Cancelado",
  expired: "Expirado",
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
}

export default function StoreAdminOrderDelivery() {
  const { isAuthenticated } = useAuth();
  const [, params] = useRoute("/tienda/:slug/admin/ordenes/delivery/:orderId");
  const slug = params?.slug ?? "";
  const orderId = Number.parseInt(params?.orderId ?? "", 10);

  const { data: storeData, isLoading: loadingStore, error: storeError } = useStoreBySlug(
    slug,
    isAuthenticated && Boolean(slug),
  );

  const storeId = storeData?.store?.id ?? 0;
  const { data, isLoading, error, refetch } = useStoreOrderDeliveryDetail(
    storeId,
    orderId,
    Boolean(storeData?.isOwner && storeData?.visibilityActive && orderId > 0),
  );

  if (!isAuthenticated) {
    return (
      <div className="container max-w-md py-16 px-4">
        <p className="text-sm text-muted-foreground">Inicia sesión para ver el delivery.</p>
      </div>
    );
  }

  if (loadingStore || (storeId === 0 && !storeError)) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (storeError || !storeData?.store || !storeData.isOwner) {
    return (
      <div className="container max-w-md py-16 px-4">
        <p className="text-sm text-destructive">No tienes permiso para ver este delivery.</p>
      </div>
    );
  }

  const { store } = storeData;

  return (
    <StoreAdminLayout slug={slug} storeName={store.name} storeId={store.id} activeSection="ordenes">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-1.5" asChild>
            <Link href={`/tienda/${encodeURIComponent(slug)}/admin/ordenes`}>
              <ArrowLeft className="h-4 w-4" />
              Volver a órdenes
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Actualizar
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Truck className="h-5 w-5" />
              Delivery · Orden #{orderId}
            </CardTitle>
            <CardDescription>Seguimiento Pack Go, conductor y chat.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="py-16 flex justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              </div>
            ) : error || !data ? (
              <p className="text-sm text-destructive">{(error as Error | undefined)?.message ?? "No se pudo cargar."}</p>
            ) : (
              <>
                <StoreOrderStatusRoadmap
                  status={data.order.status}
                  fulfillmentMode={data.order.fulfillmentMode}
                />

                <div className="flex flex-wrap gap-2 items-center">
                  <Badge variant="outline">{STORE_ORDER_STATUS_LABELS[data.order.status]}</Badge>
                  {data.packRide ? (
                    <Badge variant="secondary">
                      Pack: {PACK_STATUS_LABELS[data.packRide.status] ?? data.packRide.status}
                    </Badge>
                  ) : null}
                </div>

                {data.packRide?.driver ? (
                  <div className="rounded-lg border border-border p-4 space-y-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Conductor</p>
                    <div className="flex flex-wrap items-start gap-4">
                      {data.packRide.driver.profileImageUrl ? (
                        <img
                          src={data.packRide.driver.profileImageUrl}
                          alt=""
                          className="h-14 w-14 rounded-full object-cover border border-border"
                        />
                      ) : (
                        <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="space-y-1 min-w-0">
                        <p className="font-medium">
                          {[data.packRide.driver.name, data.packRide.driver.lastName].filter(Boolean).join(" ")}
                        </p>
                        {data.packRide.driver.phone ? (
                          <a
                            href={`tel:${data.packRide.driver.phone}`}
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            <Phone className="h-3.5 w-3.5" />
                            {data.packRide.driver.phone}
                          </a>
                        ) : null}
                        {data.packRide.driver.vehicle ? (
                          <p className="text-sm text-muted-foreground">
                            {data.packRide.driver.vehicle.brand} {data.packRide.driver.vehicle.model} ·{" "}
                            {data.packRide.driver.vehicle.licensePlate}
                          </p>
                        ) : null}
                      </div>
                      <div className="ml-auto text-sm text-right space-y-0.5">
                        <p>
                          Tarifa envío:{" "}
                          <span className="font-semibold">{formatPrice(data.packRide.estimatedUsd)}</span>
                        </p>
                        <p className="text-muted-foreground text-xs">Incluido en el pago a la tienda</p>
                      </div>
                    </div>
                  </div>
                ) : data.packRide?.status === "searching" ? (
                  <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border p-4 text-center">
                    Buscando conductor disponible…
                  </p>
                ) : null}

                <StoreOrderDeliveryRouteMap
                  origin={data.order.storeLocation ?? store.location ?? null}
                  destination={data.order.deliveryLocation}
                  deliveryFee={data.order.deliveryFee > 0 ? data.order.deliveryFee : null}
                  fallbackDistanceM={data.order.deliveryDistanceM}
                />

                <div className="space-y-2">
                  <p className="text-sm font-semibold">Chat con el conductor</p>
                  <StoreAdminDeliveryChat
                    packRide={data.packRide}
                    orderId={data.order.id}
                    chatLocked={data.order.status === "completado" || data.order.status === "rechazado"}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </StoreAdminLayout>
  );
}

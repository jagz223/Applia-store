import { useMemo, useState } from "react";

import { BarChart3, Coins, Package, Percent, Truck, Users, Loader2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { StoreBranch } from "@shared/store-schema";
import type {
  StoreStatsPeriod,
  StoreStatsProductRankMode,
  StoreStatsStatusScope,
} from "@shared/store-stats-schema";
import { useStoreStats, type StoreStatsFilters } from "@/hooks/use-store-stats";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Bar, Line, LineChart, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

function formatPrice(value: number): string {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
}

function formatCount(value: number): string {
  return value.toLocaleString("es-EC");
}

function compactChartLabel(label: string): string {
  const parts = label.trim().split(/\s+/);
  if (parts.length >= 2 && /^\d{4}$/.test(parts[1] ?? "")) {
    return `${parts[0]} ${parts[1]!.slice(-2)}`;
  }
  return label;
}

function cardSubtitleForRankMode(mode: StoreStatsProductRankMode) {
  if (mode === "orders_desc") return "más vendido por pedido";
  if (mode === "orders_asc") return "menos vendido por pedido";
  if (mode === "quantity_asc") return "menos vendido por cantidad";
  return "más vendido por cantidad";
}

export function StoreAdminStatsPanel({
  storeId,
  branches,
}: {
  storeId: number;
  branches: StoreBranch[];
}) {
  const [period, setPeriod] = useState<StoreStatsPeriod>("week");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [productRankMode, setProductRankMode] = useState<StoreStatsProductRankMode>("quantity_desc");
  const [statusScope, setStatusScope] = useState<StoreStatsStatusScope>("completed");

  const filters: StoreStatsFilters = useMemo(
    () => ({
      period,
      branchId,
      productRankMode,
      statusScope,
    }),
    [period, branchId, productRankMode, statusScope],
  );

  const { data: stats, isLoading, error } = useStoreStats(storeId, filters, true);

  const chartOrdersConfig = {
    ordersCount: { label: "Pedidos", color: "hsl(var(--primary))" },
  } as const;

  const chartFulfillmentConfig = {
    count: { label: "Pedidos", color: "hsl(var(--primary))" },
  } as const;

  const topProductsData = (stats?.topProducts ?? []).map((item) => ({
    name: item.name,
    quantity: item.quantity,
    orderCount: item.orderCount,
  }));

  const topPromotionsData = (stats?.topPromotions ?? []).map((item) => ({
    name: item.name,
    quantity: item.quantity,
    orderCount: item.orderCount,
  }));

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          <h2 className="font-display text-2xl font-bold tracking-tight">Estadísticas</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Métricas de productos, promociones, clientes y modalidades de entrega.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
          <CardDescription>Refina el periodo y la sucursal para ver tendencias.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Periodo</p>
              <Select value={period} onValueChange={(v) => setPeriod(v as StoreStatsPeriod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Día</SelectItem>
                  <SelectItem value="week">Semana</SelectItem>
                  <SelectItem value="month">Mes</SelectItem>
                  <SelectItem value="year">Año</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Sucursal</p>
              <Select
                value={branchId ?? "all"}
                onValueChange={(v) => setBranchId(v === "all" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Top productos</p>
              <Select
                value={productRankMode}
                onValueChange={(v) => setProductRankMode(v as StoreStatsProductRankMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quantity_desc">Más vendido por cantidad</SelectItem>
                  <SelectItem value="orders_desc">Más vendido por pedido</SelectItem>
                  <SelectItem value="quantity_asc">Menos vendido por cantidad</SelectItem>
                  <SelectItem value="orders_asc">Menos vendido por pedido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Estado</p>
              <Select
                value={statusScope}
                onValueChange={(v) => setStatusScope(v as StoreStatsStatusScope)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Solo completadas</SelectItem>
                  <SelectItem value="non_rejected">Todas excepto rechazadas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Package className="h-4 w-4" />
                  Pedidos
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-3xl font-bold tracking-tight">{formatCount(stats?.summary.ordersCount ?? 0)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Coins className="h-4 w-4" />
                  Ingresos
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-3xl font-bold tracking-tight">{formatPrice(stats?.summary.amountPaid ?? 0)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4" />
                  Top cliente
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground">por pedidos</p>
                <div className="font-semibold">
                  {stats?.customers.topByOrders ? stats.customers.topByOrders.name : "—"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Truck className="h-4 w-4" />
                  Modalidad
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground">más usada</p>
                <div className="font-semibold">
                  {(() => {
                    const best = (stats?.fulfillmentBreakdown ?? []).sort((a, b) => b.count - a.count)[0];
                    if (!best) return "—";
                    return best.mode === "delivery"
                      ? "Delivery"
                      : best.mode === "pickup"
                        ? "Recoger"
                        : "En local";
                  })()}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Top productos
                </CardTitle>
                <CardDescription>
                  Ordenado por {cardSubtitleForRankMode(productRankMode)}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <div className="min-w-[560px]">
                    <ChartContainer
                      config={{
                        quantity: { label: "Cantidad", color: "hsl(var(--primary))" },
                        orderCount: { label: "Pedidos", color: "hsl(var(--primary))" },
                      }}
                      className="h-72"
                      id="top-products"
                    >
                      <BarChart data={topProductsData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="name"
                          interval={0}
                          angle={-18}
                          textAnchor="end"
                          height={84}
                        />
                        <YAxis allowDecimals={false} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar
                          dataKey={productRankMode.includes("orders") ? "orderCount" : "quantity"}
                          fill="hsl(var(--primary))"
                          radius={[6, 6, 0, 0]}
                        />
                      </BarChart>
                    </ChartContainer>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Percent className="h-4 w-4" />
                  Top promociones
                </CardTitle>
                <CardDescription>
                  Ordenado por {cardSubtitleForRankMode(productRankMode)}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <div className="min-w-[560px]">
                    <ChartContainer
                      config={{
                        quantity: { label: "Cantidad", color: "hsl(var(--secondary))" },
                        orderCount: { label: "Pedidos", color: "hsl(var(--secondary))" },
                      }}
                      className="h-72"
                      id="top-promotions"
                    >
                      <BarChart data={topPromotionsData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="name"
                          interval={0}
                          angle={-18}
                          textAnchor="end"
                          height={84}
                        />
                        <YAxis allowDecimals={false} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar
                          dataKey={productRankMode.includes("orders") ? "orderCount" : "quantity"}
                          fill="hsl(var(--secondary))"
                          radius={[6, 6, 0, 0]}
                        />
                      </BarChart>
                    </ChartContainer>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="overflow-hidden lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Pedidos por {period === "day" ? "hora" : period === "week" ? "día" : period === "month" ? "semana" : "mes"}</CardTitle>
                <CardDescription>Tendencia de pedidos y monto.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <div className="min-w-[720px]">
                    <ChartContainer
                      config={chartOrdersConfig}
                      className="h-80"
                      id="orders-over-time"
                    >
                      <LineChart data={stats?.ordersOverTime ?? []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          interval={0}
                          tickFormatter={compactChartLabel}
                          minTickGap={24}
                        />
                        <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                        <ChartTooltip
                          content={<ChartTooltipContent />}
                          labelFormatter={(value) => String(value)}
                        />
                        <Line
                          type="monotone"
                          dataKey="ordersCount"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ChartContainer>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Modalidad
                </CardTitle>
                <CardDescription>Distribución según entrega/recoger/en local.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <div className="min-w-[520px]">
                    <ChartContainer
                      config={chartFulfillmentConfig}
                      className="h-72"
                      id="fulfillment-breakdown"
                    >
                      <BarChart data={(stats?.fulfillmentBreakdown ?? []).map((p) => ({ ...p, value: p.count }))}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="mode"
                          tickFormatter={(v) => v === "in_site" ? "En local" : v === "pickup" ? "Recoger" : "Delivery"}
                          interval={0}
                        />
                        <YAxis allowDecimals={false} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ChartContainer>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Clientes</CardTitle>
                <CardDescription>Top por cantidad de pedidos y por gasto total.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-2xl border border-border/70 p-3">
                  <p className="text-xs text-muted-foreground">Más pedidos</p>
                  <p className="text-sm font-semibold">{stats?.customers.topByOrders ? stats.customers.topByOrders.name : "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {stats?.customers.topByOrders ? `${stats.customers.topByOrders.orderCount} pedido(s)` : ""}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 p-3">
                  <p className="text-xs text-muted-foreground">Más gasto</p>
                  <p className="text-sm font-semibold">{stats?.customers.topBySpend ? stats.customers.topBySpend.name : "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {stats?.customers.topBySpend ? formatPrice(stats.customers.topBySpend.amountPaid) : ""}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}


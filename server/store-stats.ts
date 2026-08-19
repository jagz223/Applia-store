import type { Store } from "@shared/store-schema";
import type {
  StoreStatsCustomerPoint,
  StoreStatsFulfillmentPoint,
  StoreStatsOverTimePoint,
  StoreStatsResponse,
  StoreStatsTopItem,
  StoreStatsPeriod,
  StoreStatsProductRankMode,
  StoreStatsStatusScope,
} from "@shared/store-stats-schema";

import {
  storeStatsQuerySchema,
} from "@shared/store-stats-schema";

import type { StoreOrder, StoreOrderStatus } from "@shared/store-order-schema";

import { appliaStorage } from "./storage-applia";
import type { StoreAccessContext } from "./store-product-auth";

function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addHours(d: Date, hours: number): Date {
  const copy = new Date(d);
  copy.setHours(copy.getHours() + hours);
  return copy;
}

function addMonths(d: Date, months: number): Date {
  const copy = new Date(d);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

const ES_WEEKDAY = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;
const ES_MONTH = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

type StoreStatsBucketsDay = Array<{ label: string }>;

type StoreStatsRequestParams = {
  storeId: number;
  access: StoreAccessContext;
  rawQuery: unknown;
};

export async function buildStoreStats({
  storeId,
  access,
  rawQuery,
}: StoreStatsRequestParams): Promise<StoreStatsResponse> {
  // Validate query
  const parsed = storeStatsQuerySchema.safeParse(rawQuery ?? {});
  if (!parsed.success) {
    // If the client is wrong, fail fast with a clear error for debugging.
    throw new Error(parsed.error.errors[0]?.message ?? "Parámetros inválidos");
  }

  const { period, branchId, productRankMode, statusScope } = parsed.data;

  const now = new Date();
  const to = now;
  let from: Date;
  if (period === "day") from = addDays(now, -1);
  else if (period === "week") from = addDays(now, -6);
  else if (period === "month") from = addDays(now, -29);
  else from = addDays(now, -364);

  const dateFrom = toDateOnly(from);
  const dateTo = toDateOnly(to);

  // Fetch orders
  const listFilters = {
    dateFrom,
    dateTo,
    branchId: branchId ?? undefined,
    status: statusScope === "completed" ? ("completado" as StoreOrderStatus) : undefined,
  };

  const orders = await appliaStorage.listStoreOrders(storeId, listFilters as any);

  const filtered = orders.filter((o) => {
    if (statusScope === "non_rejected") return o.status !== "rechazado";
    return o.status === "completado";
  });

  const ordersCount = filtered.length;
  const amountPaid = filtered.reduce((acc, o) => acc + (Number(o.amountPaid ?? 0) || 0), 0);

  // Buckets for orders over time
  const ordersOverTime: StoreStatsOverTimePoint[] = [];
  const pushEmptyBuckets = (bucket: "hour" | "day" | "week" | "month") => {
    if (bucket === "hour") {
      // Last 24h, hourly buckets
      let cursor = new Date(from);
      cursor.setMinutes(0, 0, 0);
      const end = new Date(to);
      end.setMinutes(59, 59, 999);
      while (cursor <= end) {
        const label = `${String(cursor.getHours()).padStart(2, "0")}:00`;
        ordersOverTime.push({ label, ordersCount: 0, amountPaid: 0 });
        cursor = addHours(cursor, 1);
      }
    } else if (bucket === "day") {
      for (let i = 0; i <= Math.floor((to.getTime() - from.getTime()) / (24 * 3600 * 1000)); i++) {
        const d = addDays(from, i);
        const label = `${ES_WEEKDAY[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}`;
        ordersOverTime.push({ label, ordersCount: 0, amountPaid: 0 });
      }
    } else if (bucket === "week") {
      // 4-5 buckets as weeks of the range
      const totalDays = Math.max(1, Math.floor((to.getTime() - from.getTime()) / (24 * 3600 * 1000)) + 1);
      const buckets = Math.ceil(totalDays / 7);
      for (let i = 0; i < buckets; i++) {
        ordersOverTime.push({
          label: `Sem ${i + 1}`,
          ordersCount: 0,
          amountPaid: 0,
        });
      }
    } else {
      // month
      // Last 12 months (best-effort)
      const start = new Date(from);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);

      const months = 12;
      for (let i = 0; i < months; i++) {
        const d = addMonths(start, i);
        const label = `${ES_MONTH[d.getMonth()]} ${d.getFullYear()}`;
        ordersOverTime.push({ label, ordersCount: 0, amountPaid: 0 });
      }
    }
  };

  if (period === "day") pushEmptyBuckets("hour");
  else if (period === "week") pushEmptyBuckets("day");
  else if (period === "month") pushEmptyBuckets("week");
  else pushEmptyBuckets("month");

  function bucketIndexForOrder(order: StoreOrder): number | null {
    const created = new Date(order.createdAt);
    if (Number.isNaN(created.getTime())) return null;

    if (period === "day") {
      const start = new Date(from);
      start.setMinutes(0, 0, 0);
      const end = new Date(to);
      end.setMinutes(59, 59, 999);
      if (created < start || created > end) return null;
      const diffHours = Math.floor((created.getTime() - start.getTime()) / (3600 * 1000));
      return diffHours >= 0 && diffHours < ordersOverTime.length ? diffHours : null;
    }

    if (period === "week") {
      const diffDays = Math.floor((created.getTime() - from.getTime()) / (24 * 3600 * 1000));
      return diffDays >= 0 && diffDays < ordersOverTime.length ? diffDays : null;
    }

    if (period === "month") {
      const diffDays = Math.floor((created.getTime() - from.getTime()) / (24 * 3600 * 1000));
      const idx = Math.floor(diffDays / 7);
      return idx >= 0 && idx < ordersOverTime.length ? idx : null;
    }

    // year
    const createdMonthStart = new Date(created);
    createdMonthStart.setDate(1);
    createdMonthStart.setHours(0, 0, 0, 0);
    const start = new Date(from);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const diffMonths = (createdMonthStart.getFullYear() - start.getFullYear()) * 12 + (createdMonthStart.getMonth() - start.getMonth());
    return diffMonths >= 0 && diffMonths < ordersOverTime.length ? diffMonths : null;
  }

  for (const o of filtered) {
    const idx = bucketIndexForOrder(o);
    if (idx == null) continue;
    ordersOverTime[idx]!.ordersCount += 1;
    ordersOverTime[idx]!.amountPaid += Number(o.amountPaid ?? 0) || 0;
  }

  // Top products & promotions
  type Agg = { id?: number | null; name: string; quantity: number; revenue: number; orderIds: Set<number> };
  const productsAgg = new Map<string, Agg>();
  const promotionsAgg = new Map<string, Agg>();

  for (const order of filtered) {
    for (const line of order.items ?? []) {
      if (line.kind === "product") {
        const id = line.productId ?? null;
        const key = id != null ? `p:${id}` : `pn:${line.name}`;
        const existing = productsAgg.get(key);
        const revenue = Number(line.lineTotal ?? 0) || 0;
        if (!existing) {
          productsAgg.set(key, {
            id,
            name: line.name,
            quantity: Number(line.quantity ?? 0) || 0,
            revenue,
            orderIds: new Set([order.id]),
          });
        } else {
          existing.quantity += Number(line.quantity ?? 0) || 0;
          existing.revenue += revenue;
          existing.orderIds.add(order.id);
        }
      } else if (line.kind === "promotion") {
        const id = line.promotionId ?? null;
        const key = id != null ? `pr:${id}` : `prn:${line.name}`;
        const revenue = Number(line.lineTotal ?? 0) || 0;
        const existing = promotionsAgg.get(key);
        if (!existing) {
          promotionsAgg.set(key, {
            id,
            name: line.name,
            quantity: Number(line.quantity ?? 0) || 0,
            revenue,
            orderIds: new Set([order.id]),
          });
        } else {
          existing.quantity += Number(line.quantity ?? 0) || 0;
          existing.revenue += revenue;
          existing.orderIds.add(order.id);
        }
      }
    }
  }

  function mapAggToTop(items: Map<string, Agg>): StoreStatsTopItem[] {
    const list: StoreStatsTopItem[] = [];
    for (const agg of items.values()) {
      list.push({
        id: agg.id ?? null,
        name: agg.name,
        quantity: agg.quantity,
        orderCount: agg.orderIds.size,
        revenue: agg.revenue,
      });
    }
    return list;
  }

  function sortTopItems(items: StoreStatsTopItem[]): StoreStatsTopItem[] {
    const sorted = [...items].sort((a, b) => {
      if (productRankMode === "orders_desc") return b.orderCount - a.orderCount;
      if (productRankMode === "orders_asc") return a.orderCount - b.orderCount;
      if (productRankMode === "quantity_asc") return a.quantity - b.quantity;
      return b.quantity - a.quantity;
    });
    return sorted.slice(0, 5);
  }

  const productsTop = sortTopItems(mapAggToTop(productsAgg));
  const promotionsTop = sortTopItems(mapAggToTop(promotionsAgg));

  // Fulfillment breakdown
  const fulfillmentMap = new Map<string, StoreStatsFulfillmentPoint>();
  for (const o of filtered) {
    const mode = o.fulfillmentMode;
    if (!mode) continue;
    if (!["delivery", "pickup", "in_site"].includes(mode)) continue;
    const existing = fulfillmentMap.get(mode);
    if (!existing) {
      fulfillmentMap.set(mode, {
        mode,
        count: 1,
        amountPaid: Number(o.amountPaid ?? 0) || 0,
      });
    } else {
      existing.count += 1;
      existing.amountPaid += Number(o.amountPaid ?? 0) || 0;
    }
  }

  const fulfillmentBreakdown = Array.from(fulfillmentMap.values());

  // Customer top
  const customerAgg = new Map<string, { orderCount: number; amountPaid: number }>();
  for (const o of filtered) {
    const userId = o.userId;
    const existing = customerAgg.get(userId);
    if (!existing) {
      customerAgg.set(userId, { orderCount: 1, amountPaid: Number(o.amountPaid ?? 0) || 0 });
    } else {
      existing.orderCount += 1;
      existing.amountPaid += Number(o.amountPaid ?? 0) || 0;
    }
  }

  const topByOrdersEntry = Array.from(customerAgg.entries()).sort((a, b) => b[1]!.orderCount - a[1]!.orderCount)[0];
  const topBySpendEntry = Array.from(customerAgg.entries()).sort((a, b) => b[1]!.amountPaid - a[1]!.amountPaid)[0];

  async function resolveCustomerPoint(entry: [string, { orderCount: number; amountPaid: number }] | undefined): Promise<StoreStatsCustomerPoint | null> {
    if (!entry) return null;
    const [userId, metrics] = entry;
    const user = (await appliaStorage.getUserById(userId)) as any;
    const name =
      [user?.name ?? user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
      user?.email ||
      user?.phone ||
      userId;
    return { userId, name, orderCount: metrics.orderCount, amountPaid: metrics.amountPaid };
  }

  const topByOrders = await resolveCustomerPoint(topByOrdersEntry);
  const topBySpend = await resolveCustomerPoint(topBySpendEntry);

  return {
    period: {
      from: dateFrom,
      to: dateTo,
      bucket: period === "day" ? "hour" : period === "week" ? "day" : period === "month" ? "week" : "month",
    },
    summary: {
      ordersCount,
      amountPaid,
    },
    topProducts: productsTop,
    topPromotions: promotionsTop,
    ordersOverTime,
    fulfillmentBreakdown,
    customers: {
      topByOrders,
      topBySpend,
    },
  };
}


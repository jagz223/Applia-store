import { z } from "zod";

import type { StoreFulfillmentMode } from "./store-fulfillment";
import { storeFulfillmentModeSchema } from "./store-fulfillment";

export const storeStatsPeriodSchema = z.enum(["day", "week", "month", "year"]);
export type StoreStatsPeriod = z.infer<typeof storeStatsPeriodSchema>;

export const storeStatsProductRankModeSchema = z.enum([
  "quantity_desc",
  "orders_desc",
  "quantity_asc",
  "orders_asc",
]);
export type StoreStatsProductRankMode = z.infer<typeof storeStatsProductRankModeSchema>;

export const storeStatsStatusScopeSchema = z.enum(["completed", "non_rejected"]);
export type StoreStatsStatusScope = z.infer<typeof storeStatsStatusScopeSchema>;

export const storeStatsQuerySchema = z.object({
  period: storeStatsPeriodSchema.default("week"),
  branchId: z.string().trim().min(1).max(64).optional().nullable(),
  productRankMode: storeStatsProductRankModeSchema.default("quantity_desc"),
  statusScope: storeStatsStatusScopeSchema.default("completed"),
});

export type StoreStatsTopItem = {
  id?: number | null;
  name: string;
  quantity: number;
  orderCount: number;
  revenue: number;
};

export type StoreStatsOverTimePoint = {
  label: string;
  ordersCount: number;
  amountPaid: number;
};

export type StoreStatsFulfillmentPoint = {
  mode: StoreFulfillmentMode;
  count: number;
  amountPaid: number;
};

export type StoreStatsCustomerPoint = {
  userId: string;
  name: string;
  orderCount: number;
  amountPaid: number;
};

export type StoreStatsResponse = {
  period: {
    from: string;
    to: string;
    bucket: "hour" | "day" | "week" | "month";
  };
  summary: {
    ordersCount: number;
    amountPaid: number;
  };
  topProducts: StoreStatsTopItem[];
  topPromotions: StoreStatsTopItem[];
  ordersOverTime: StoreStatsOverTimePoint[];
  fulfillmentBreakdown: StoreStatsFulfillmentPoint[];
  customers: {
    topByOrders: StoreStatsCustomerPoint | null;
    topBySpend: StoreStatsCustomerPoint | null;
  };
};


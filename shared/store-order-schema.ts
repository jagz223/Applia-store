import { z } from "zod";

import {

  storeFulfillmentModeSchema,

  STORE_FULFILLMENT_LABELS,

  type StoreFulfillmentMode,

} from "./store-fulfillment";



export const storeOrderStatusSchema = z.enum([

  "pagado",

  "confirmado",

  "listo_para_envio",

  "enviado",

  "listo_pickup",

  "listo_local",

  "completado",

  "rechazado",

]);



export type StoreOrderStatus = z.infer<typeof storeOrderStatusSchema>;



export const STORE_ORDER_STATUSES = storeOrderStatusSchema.options;



export const STORE_ORDER_STATUS_LABELS: Record<StoreOrderStatus, string> = {

  pagado: "Pagado",

  confirmado: "Confirmado",

  listo_para_envio: "Listo para envío",

  enviado: "Enviado",

  listo_pickup: "Listo para Pick Up",

  listo_local: "Listo para venir al Local",

  completado: "Completado",

  rechazado: "Rechazado",

};



export const STORE_ORDER_TERMINAL_STATUSES: StoreOrderStatus[] = ["completado", "rechazado"];



/** Órdenes visibles en la cola de delivery de la tienda. */

export const STORE_ORDER_DELIVERY_QUEUE_STATUSES: StoreOrderStatus[] = ["listo_para_envio", "enviado"];



export const storeOrderDeliveryLocationSchema = z.object({

  lat: z.number().finite(),

  lon: z.number().finite(),

  label: z.string().trim().min(1).max(500),

});



export type StoreOrderDeliveryLocation = z.infer<typeof storeOrderDeliveryLocationSchema>;



export const storeOrderLineItemSchema = z.object({

  kind: z.enum(["product", "promotion"]),

  productId: z.number().int().positive().optional(),

  promotionId: z.number().int().positive().optional(),

  name: z.string(),

  price: z.number().nonnegative(),

  quantity: z.number().int().positive(),

  lineTotal: z.number().nonnegative(),

  imageUrl: z.string().nullable(),

});



export type StoreOrderLineItem = z.infer<typeof storeOrderLineItemSchema>;



export const submitStoreCheckoutSchema = z

  .object({

    paymentMethodId: z.number().int().positive(),

    fulfillmentMode: storeFulfillmentModeSchema.nullable().optional(),

    reference: z.string().trim().min(1, "La referencia es obligatoria").max(120),

    proofImageUrl: z.string().trim().min(1, "El comprobante es obligatorio").max(2000),

    amountPaid: z.number().positive("Indica el monto pagado"),

    deliveryLocation: storeOrderDeliveryLocationSchema.nullable().optional(),

  })

  .superRefine((data, ctx) => {

    if (data.fulfillmentMode === "delivery" && !data.deliveryLocation) {

      ctx.addIssue({

        code: z.ZodIssueCode.custom,

        message: "Selecciona la ubicación de entrega en el mapa",

        path: ["deliveryLocation"],

      });

    }

  });



export type SubmitStoreCheckout = z.infer<typeof submitStoreCheckoutSchema>;



export const updateStoreOrderStatusSchema = z.object({

  status: storeOrderStatusSchema,

});



export type UpdateStoreOrderStatus = z.infer<typeof updateStoreOrderStatusSchema>;



export type StoreOrder = {

  id: number;

  storeId: number;

  userId: string;

  paymentMethodId: number;

  paymentMethodName: string;

  paymentMethodAccountNumber: string;

  fulfillmentMode: StoreFulfillmentMode | null;

  reference: string;

  proofImageUrl: string;

  amountDue: number;

  amountPaid: number;

  /** Costo de envío (0 si no es delivery). */

  deliveryFee: number;

  /** Distancia de ruta en metros (null si no es delivery). */

  deliveryDistanceM: number | null;

  deliveryLocation: StoreOrderDeliveryLocation | null;

  items: StoreOrderLineItem[];

  subtotal: number;

  status: StoreOrderStatus;

  /** Pack Go ride activo o último vinculado. */

  packRideId: string | null;

  /** Notificaciones no leídas del delivery de esta orden (dueño tienda). */

  deliveryUnreadCount: number;

  createdAt: Date | string;

  updatedAt: Date | string;

};



export type StoreCheckoutPaymentMethod = {
  id: number;
  name: string;
  accountNumber: string;
  extraFields?: Array<{ name: string; value: string }>;
  imageUrl: string | null;
};



export function fulfillmentProgressStatus(mode: StoreFulfillmentMode | null): StoreOrderStatus {

  if (mode === "delivery") return "listo_para_envio";

  if (mode === "pickup") return "listo_pickup";

  if (mode === "in_site") return "listo_local";

  return "completado";

}



export type StoreOrderRoadmapStep = {

  status: StoreOrderStatus;

  label: string;

  /** Porcentaje de llenado de la barra (0–100). */

  progress: number;

};



/** Pasos del flujo feliz (sin rechazado). */

export function getStoreOrderRoadmapSteps(fulfillmentMode: StoreFulfillmentMode | null): StoreOrderRoadmapStep[] {

  if (fulfillmentMode === "delivery") {

    return [

      { status: "pagado", label: STORE_ORDER_STATUS_LABELS.pagado, progress: 15 },

      { status: "confirmado", label: STORE_ORDER_STATUS_LABELS.confirmado, progress: 35 },

      { status: "listo_para_envio", label: STORE_ORDER_STATUS_LABELS.listo_para_envio, progress: 55 },

      { status: "enviado", label: STORE_ORDER_STATUS_LABELS.enviado, progress: 78 },

      { status: "completado", label: STORE_ORDER_STATUS_LABELS.completado, progress: 100 },

    ];

  }

  const steps: StoreOrderRoadmapStep[] = [

    { status: "pagado", label: STORE_ORDER_STATUS_LABELS.pagado, progress: 25 },

    { status: "confirmado", label: STORE_ORDER_STATUS_LABELS.confirmado, progress: 50 },

  ];

  const mid = fulfillmentProgressStatus(fulfillmentMode);

  if (fulfillmentMode != null && mid !== "completado") {

    steps.push({ status: mid, label: STORE_ORDER_STATUS_LABELS[mid], progress: 85 });

  }

  steps.push({ status: "completado", label: STORE_ORDER_STATUS_LABELS.completado, progress: 100 });

  return steps;

}



export function getStoreOrderStatusProgress(

  status: StoreOrderStatus,

  fulfillmentMode: StoreFulfillmentMode | null,

): number {

  if (status === "rechazado") return 0;

  const step = getStoreOrderRoadmapSteps(fulfillmentMode).find((s) => s.status === status);

  return step?.progress ?? 0;

}



export function getStoreOrderRoadmapStepIndex(

  status: StoreOrderStatus,

  fulfillmentMode: StoreFulfillmentMode | null,

): number {

  if (status === "rechazado") return -1;

  return getStoreOrderRoadmapSteps(fulfillmentMode).findIndex((s) => s.status === status);

}



export function getAllowedStoreOrderStatuses(order: Pick<StoreOrder, "status" | "fulfillmentMode">): StoreOrderStatus[] {

  const { status, fulfillmentMode } = order;

  if (STORE_ORDER_TERMINAL_STATUSES.includes(status)) return [];



  if (status === "pagado") return ["confirmado", "rechazado"];

  if (status === "confirmado") {

    if (fulfillmentMode === "delivery") return ["listo_para_envio", "rechazado"];

    return [fulfillmentProgressStatus(fulfillmentMode), "rechazado"];

  }

  // La tienda gestiona el envío: puede marcar enviado y luego completado.
  if (status === "listo_para_envio") return ["enviado", "confirmado", "rechazado"];



  if (status === "enviado" || status === "listo_pickup" || status === "listo_local") {

    return ["completado", "rechazado"];

  }



  return [];

}



export function canTransitionStoreOrderStatus(

  order: Pick<StoreOrder, "status" | "fulfillmentMode">,

  next: StoreOrderStatus,

): boolean {

  return getAllowedStoreOrderStatuses(order).includes(next);

}



/** Etiqueta del botón al cambiar de estado (p. ej. revertir delivery). */

export function getStoreOrderStatusTransitionLabel(

  from: StoreOrderStatus,

  to: StoreOrderStatus,

): string {

  if (from === "listo_para_envio" && to === "confirmado") {

    return "Volver a confirmado";

  }

  return STORE_ORDER_STATUS_LABELS[to];

}



export function isStoreOrderInDeliveryQueue(order: Pick<StoreOrder, "status" | "fulfillmentMode">): boolean {

  return (

    order.fulfillmentMode === "delivery" &&

    STORE_ORDER_DELIVERY_QUEUE_STATUSES.includes(order.status)

  );

}



export function fulfillmentLabel(mode: StoreFulfillmentMode | null): string {

  if (!mode) return "—";

  return STORE_FULFILLMENT_LABELS[mode];

}



export type StoreOrderListFilters = {

  status?: StoreOrderStatus;

  orderId?: number;

  storeId?: number;

  /** Solo órdenes delivery en cola (listo_para_envio | enviado). */

  deliveryQueue?: boolean;

  /** Fecha inclusive YYYY-MM-DD (fecha de creación). */

  dateFrom?: string;

  /** Fecha inclusive YYYY-MM-DD (fecha de creación). */

  dateTo?: string;

};



const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;



export function parseStoreOrderDateFilter(value: string | undefined): string | undefined {

  const trimmed = value?.trim();

  if (!trimmed || !ISO_DATE_ONLY.test(trimmed)) return undefined;

  return trimmed;

}



export function storeOrderCreatedAtMatchesDateFilter(

  createdAt: Date | string,

  filters?: Pick<StoreOrderListFilters, "dateFrom" | "dateTo">,

): boolean {

  if (!filters?.dateFrom && !filters?.dateTo) return true;

  const t = new Date(createdAt).getTime();

  if (Number.isNaN(t)) return false;

  if (filters.dateFrom) {

    const start = new Date(`${filters.dateFrom}T00:00:00`).getTime();

    if (t < start) return false;

  }

  if (filters.dateTo) {

    const end = new Date(`${filters.dateTo}T23:59:59.999`).getTime();

    if (t > end) return false;

  }

  return true;

}



export function filterStoreOrders(orders: StoreOrder[], filters?: StoreOrderListFilters): StoreOrder[] {

  let list = [...orders];

  if (filters?.orderId != null) {

    list = list.filter((o) => o.id === filters.orderId);

  }

  if (filters?.storeId != null) {

    list = list.filter((o) => o.storeId === filters.storeId);

  }

  if (filters?.deliveryQueue) {

    list = list.filter((o) => isStoreOrderInDeliveryQueue(o));

  }

  if (filters?.status) {

    list = list.filter((o) => o.status === filters.status);

  }

  if (filters?.dateFrom || filters?.dateTo) {

    list = list.filter((o) => storeOrderCreatedAtMatchesDateFilter(o.createdAt, filters));

  }

  return list.sort(

    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),

  );

}



import {
  MAN_GO_CATEGORY_SLUG,
  MARKETPLACE_CATEGORY_SLUG,
  normalizeProviderCategorySlug,
} from "./default-categories";
import type { MobilityRideHistoryListItem } from "./mobility-ride-history";
import {
  bookingDateToIso,
  buildBookingActivityDetail,
  buildMobilityActivityDetail,
  buildSubscriptionActivityDetail,
  buildWalletPaymentActivityDetail,
} from "./dashboard-activity-details";
import {
  parseSubscriptionInvoiceAmount,
  subscriptionInvoicePurposeLabel,
  type SubscriptionInvoiceListItem,
} from "./subscription-invoice";

export type AssociateActivityBrand =
  | "man_go"
  | "pro_go"
  | "car_go"
  | "pack_go"
  | "marketplace"
  | "subscription"
  | "unknown";

export type ServiceActivityPerspective = "provider" | "client" | "driver" | "rider";

export type AssociateDashboardActivityListTab = "services" | "transactions";

export type AssociateDashboardActivityDetailRow = {
  label: string;
  value: string;
};

export type AssociateDashboardActivityDetail = {
  rows: AssociateDashboardActivityDetailRow[];
  bookingId?: number;
  mobilityRideId?: string;
};

export type AssociateDashboardActivityItem = {
  id: string;
  kind: "subscription" | "service" | "payment";
  listTab: AssociateDashboardActivityListTab;
  brand: AssociateActivityBrand;
  title: string;
  subtitle: string;
  dateIso: string | null;
  status: string;
  /** Monto en USD; null = no mostrar dinero en la fila */
  displayAmountUsd: number | null;
  amountMode: "none" | "standard" | "agreed";
  transferId?: string | number;
  perspective?: ServiceActivityPerspective;
  detail?: AssociateDashboardActivityDetail;
};

export type BuildAssociateDashboardActivityOptions = {
  /** Mensualidades y transferencias de asociado (false para cliente puro). */
  includeSubscriptions?: boolean;
  /** Pagos e ingresos wallet (Car Go, mensualidad, pago de viaje). */
  includeWalletTransactions?: boolean;
};

export type AssociateDashboardBookingLike = {
  id: number | string;
  status?: string;
  cost?: unknown;
  /** Cita acordada (inicial del cliente o actualizada por el asociado en gestión). */
  date?: unknown;
  completedAt?: unknown;
  createdAt?: unknown;
  notes?: string | null;
  paymentMethod?: string | null;
  user?: {
    firstName?: string | null;
    lastName?: string | null;
    name?: string | null;
  } | null;
  service?: {
    title?: string | null;
    name?: string | null;
    categoryId?: number | null;
    categorySlug?: string | null;
    category?: { slug?: string | null; name?: string | null } | null;
    provider?: {
      user?: {
        firstName?: string | null;
        lastName?: string | null;
        name?: string | null;
      } | null;
    } | null;
  } | null;
};

export type AssociateDashboardTransferLike = {
  id?: string | number;
  transferType?: string;
  status?: string;
  amount?: unknown;
  description?: string | null;
  referenceId?: string | null;
  createdAt?: unknown;
};

export function categorySlugToActivityBrand(slug: string | null | undefined): AssociateActivityBrand {
  const s = normalizeProviderCategorySlug(slug);
  if (s === MAN_GO_CATEGORY_SLUG) return "man_go";
  if (s === "professional") return "pro_go";
  if (s === MARKETPLACE_CATEGORY_SLUG) return "marketplace";
  if (s === "transport") return "car_go";
  if (s === "delivery") return "pack_go";
  return "unknown";
}

export function brandDisplayName(brand: AssociateActivityBrand): string {
  switch (brand) {
    case "man_go":
      return "Man Go";
    case "pro_go":
      return "Pro Go";
    case "car_go":
      return "Car Go";
    case "pack_go":
      return "Pack Go";
    case "marketplace":
      return "Marketplace";
    case "subscription":
      return "Mensualidad";
    default:
      return "Servicio";
  }
}

export function shouldHideServiceAmount(brand: AssociateActivityBrand): boolean {
  return brand === "man_go" || brand === "pro_go" || brand === "marketplace";
}

export function isSubscriptionWalletTransfer(t: { transferType?: string }): boolean {
  return String(t.transferType ?? "").toLowerCase() === "verification_fee";
}

export function isPlatformCommissionTransfer(t: { description?: string | null }): boolean {
  const desc = (t.description ?? "").toLowerCase();
  return desc.includes("comisión de plataforma") || desc.includes("comision de plataforma");
}

/** Ingreso al asociado por un servicio (no comisión ni mensualidad). */
export function isProviderServiceWalletTransfer(t: {
  transferType?: string;
  description?: string | null;
  status?: string;
}): boolean {
  const type = String(t.transferType ?? "").toLowerCase();
  if (type !== "service_payment") return false;
  if (t.status && t.status !== "completed") return false;
  if (isPlatformCommissionTransfer(t)) return false;
  const desc = (t.description ?? "").toLowerCase();
  if (desc.includes("comisión") || desc.includes("comision")) return false;
  return (
    desc.includes("completado") ||
    desc.includes("viaje") ||
    desc.includes("car go") ||
    desc.includes("pack go") ||
    desc.includes("servicio")
  );
}

function toIsoDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  if (typeof value === "object" && value !== null && "seconds" in value) {
    const d = new Date((value as { seconds: number }).seconds * 1000);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    const d = (value as { toDate: () => Date }).toDate();
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function parseRefBookingId(referenceId?: string | null): number | null {
  if (!referenceId) return null;
  const s = String(referenceId).trim();
  if (/^\d+$/.test(s)) return Number(s);
  return null;
}

function parseRefMobilityRideId(referenceId?: string | null): string | null {
  if (!referenceId) return null;
  const m = String(referenceId).match(/^cargo:(.+)$/i);
  return m?.[1] ? m[1] : null;
}

function bookingCategorySlug(booking: AssociateDashboardBookingLike): string | null {
  const svc = booking.service;
  if (svc?.category?.slug) return String(svc.category.slug);
  if (svc?.categorySlug) return String(svc.categorySlug);
  return null;
}

function bookingServiceTitle(booking: AssociateDashboardBookingLike): string {
  const svc = booking.service;
  const t = (svc?.title ?? svc?.name ?? "").trim();
  return t || "Reserva de servicio";
}

function inferBrandFromTransferDescription(desc: string): AssociateActivityBrand {
  const d = desc.toLowerCase();
  if (d.includes("pack go") || d.includes("delivery")) return "pack_go";
  if (d.includes("car go") || d.includes("viaje")) return "car_go";
  if (d.includes("man go") || d.includes("técnico") || d.includes("tecnico")) return "man_go";
  if (d.includes("pro go") || d.includes("profesional")) return "pro_go";
  return "unknown";
}

function serviceAmountFields(
  brand: AssociateActivityBrand,
  agreedUsd: number
): Pick<AssociateDashboardActivityItem, "displayAmountUsd" | "amountMode"> {
  if (shouldHideServiceAmount(brand)) {
    return { displayAmountUsd: null, amountMode: "none" };
  }
  if (brand === "car_go" || brand === "pack_go") {
    const n = Number.isFinite(agreedUsd) && agreedUsd >= 0 ? agreedUsd : null;
    return { displayAmountUsd: n, amountMode: "agreed" };
  }
  return {
    displayAmountUsd: Number.isFinite(agreedUsd) && agreedUsd > 0 ? agreedUsd : null,
    amountMode: "standard",
  };
}

function pushServiceItem(
  items: AssociateDashboardActivityItem[],
  seen: Set<string>,
  input: Omit<AssociateDashboardActivityItem, "kind" | "listTab"> & {
    kind?: "service";
    listTab?: "services";
  },
) {
  if (seen.has(input.id)) return;
  seen.add(input.id);
  items.push({ ...input, kind: "service", listTab: "services" });
}

function pushTransactionItem(
  items: AssociateDashboardActivityItem[],
  seen: Set<string>,
  input: Omit<AssociateDashboardActivityItem, "listTab"> & { listTab?: "transactions" },
) {
  if (seen.has(input.id)) return;
  seen.add(input.id);
  items.push({ ...input, listTab: "transactions" });
}

export function filterActivityByListTab(
  items: AssociateDashboardActivityItem[],
  tab: AssociateDashboardActivityListTab,
): AssociateDashboardActivityItem[] {
  return items.filter((i) => i.listTab === tab);
}

function isWalletPaymentTransfer(t: { transferType?: string }): boolean {
  const type = String(t.transferType ?? "").toLowerCase();
  return type === "payment";
}

function isCarGoWalletTransaction(t: { description?: string | null; transferType?: string }): boolean {
  const desc = (t.description ?? "").toLowerCase();
  if (desc.includes("car go") || desc.includes("pack go") || desc.includes("viaje")) return true;
  if (desc.includes("delivery") && String(t.transferType ?? "").toLowerCase() === "service_payment") {
    return true;
  }
  return false;
}

function shouldIncludeWalletTransfer(
  t: AssociateDashboardTransferLike,
  includeSubscriptions: boolean,
): boolean {
  if (isSubscriptionWalletTransfer(t)) return includeSubscriptions;
  if (isWalletPaymentTransfer(t)) return true;
  if (isProviderServiceWalletTransfer(t) && isCarGoWalletTransaction(t)) return true;
  return false;
}

function serviceActivityTitle(
  perspective: ServiceActivityPerspective,
  brand: AssociateActivityBrand,
): string {
  const label = brandDisplayName(brand);
  switch (perspective) {
    case "provider":
      return `Servicio realizado · ${label}`;
    case "client":
      return `Servicio completado · ${label}`;
    case "driver":
      return `Viaje realizado · ${label}`;
    case "rider":
      return `Viaje completado · ${label}`;
    default:
      return `Servicio · ${label}`;
  }
}

export function buildAssociateDashboardActivity(
  input: {
    transfers?: AssociateDashboardTransferLike[];
    completedBookingsAsProvider?: AssociateDashboardBookingLike[];
    completedBookingsAsClient?: AssociateDashboardBookingLike[];
    mobilityAsDriver?: MobilityRideHistoryListItem[];
    mobilityAsRider?: MobilityRideHistoryListItem[];
    verificationInvoices?: SubscriptionInvoiceListItem[];
    providerCategorySlug?: string | null;
  },
  options?: BuildAssociateDashboardActivityOptions,
): AssociateDashboardActivityItem[] {
  const includeSubscriptions = options?.includeSubscriptions !== false;
  const includeWalletTransactions = options?.includeWalletTransactions !== false;

  const items: AssociateDashboardActivityItem[] = [];
  const seen = new Set<string>();
  const coveredProviderBookingIds = new Set<number>();
  const coveredMobilityIds = new Set<string>();

  const verificationInvoices = includeSubscriptions
    ? (input.verificationInvoices ?? []).filter((inv) => inv.type === "verification")
    : [];

  for (const inv of verificationInvoices) {
    const id = `invoice-${inv.reportId ?? inv.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const amount = parseSubscriptionInvoiceAmount(inv.amount, NaN);
    const dateIso = toIsoDate(inv.approvedAt ?? inv.date);
    pushTransactionItem(items, seen, {
      id,
      kind: "subscription",
      brand: "subscription",
      title: "Pago de mensualidad",
      subtitle: subscriptionInvoicePurposeLabel(inv),
      dateIso,
      status: String(inv.status ?? "completed"),
      displayAmountUsd: Number.isFinite(amount) ? amount : null,
      amountMode: "standard",
      detail: buildSubscriptionActivityDetail(inv),
    });
  }

  for (const booking of input.completedBookingsAsProvider ?? []) {
    if (String(booking.status ?? "").toLowerCase() !== "completed") continue;
    const bookingId = Number(booking.id);
    if (Number.isFinite(bookingId)) coveredProviderBookingIds.add(bookingId);

    const slug = bookingCategorySlug(booking) ?? input.providerCategorySlug ?? null;
    const brand = categorySlugToActivityBrand(slug);
    const cost = typeof booking.cost === "number" ? booking.cost : Number(booking.cost) || 0;
    const amountFields = serviceAmountFields(brand, cost);

    const dateIso =
      toIsoDate(booking.completedAt) ?? toIsoDate(booking.createdAt) ?? bookingDateToIso(booking.date);
    pushServiceItem(items, seen, {
      id: `booking-provider-${booking.id}`,
      brand,
      title: serviceActivityTitle("provider", brand),
      subtitle: bookingServiceTitle(booking),
      dateIso,
      status: "completed",
      perspective: "provider",
      detail: buildBookingActivityDetail(booking, "provider", brand),
      ...amountFields,
    });
  }

  for (const booking of input.completedBookingsAsClient ?? []) {
    if (String(booking.status ?? "").toLowerCase() !== "completed") continue;

    const slug = bookingCategorySlug(booking);
    const brand = categorySlugToActivityBrand(slug);
    const cost = typeof booking.cost === "number" ? booking.cost : Number(booking.cost) || 0;
    const amountFields = serviceAmountFields(brand, cost);

    const dateIso =
      toIsoDate(booking.completedAt) ?? toIsoDate(booking.createdAt) ?? bookingDateToIso(booking.date);
    pushServiceItem(items, seen, {
      id: `booking-client-${booking.id}`,
      brand,
      title: serviceActivityTitle("client", brand),
      subtitle: bookingServiceTitle(booking),
      dateIso,
      status: "completed",
      perspective: "client",
      detail: buildBookingActivityDetail(booking, "client", brand),
      ...amountFields,
    });
  }

  const pushMobilityRide = (
    ride: MobilityRideHistoryListItem,
    perspective: "driver" | "rider",
  ) => {
    if (ride.outcome !== "completed") return;
    const idKey = `mobility-${perspective}-${ride.id}`;
    if (seen.has(idKey)) return;
    coveredMobilityIds.add(ride.id);
    const brand: AssociateActivityBrand = ride.module === "pack" ? "pack_go" : "car_go";
    const amountFields = serviceAmountFields(brand, ride.amountUsd);
    const route =
      [ride.startLabel, ride.endLabel].filter(Boolean).join(" → ") || "Viaje completado";

    const dateIso = toIsoDate(ride.endedAt ?? ride.createdAt);
    pushServiceItem(items, seen, {
      id: idKey,
      brand,
      title: serviceActivityTitle(perspective, brand),
      subtitle: route,
      dateIso,
      status: "completed",
      perspective,
      detail: buildMobilityActivityDetail(ride, perspective),
      ...amountFields,
    });
  };

  for (const ride of input.mobilityAsDriver ?? []) {
    pushMobilityRide(ride, "driver");
  }

  for (const ride of input.mobilityAsRider ?? []) {
    pushMobilityRide(ride, "rider");
  }

  if (!includeWalletTransactions) {
    items.sort((a, b) => {
      const ta = a.dateIso ? new Date(a.dateIso).getTime() : 0;
      const tb = b.dateIso ? new Date(b.dateIso).getTime() : 0;
      return tb - ta;
    });
    return items;
  }

  for (const t of input.transfers ?? []) {
    if (!shouldIncludeWalletTransfer(t, includeSubscriptions)) continue;

    if (isSubscriptionWalletTransfer(t)) {
      const invCoversSame =
        verificationInvoices.length > 0 &&
        verificationInvoices.some((inv) => {
          const invDate = toIsoDate(inv.approvedAt ?? inv.date);
          const tDate = toIsoDate(t.createdAt);
          if (!invDate || !tDate) return false;
          return Math.abs(new Date(invDate).getTime() - new Date(tDate).getTime()) < 86_400_000;
        });
      if (invCoversSame) continue;

      const id = `transfer-sub-${t.id ?? t.createdAt}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const amt = typeof t.amount === "number" ? t.amount : Number(t.amount) || null;
      const dateIso = toIsoDate(t.createdAt);
      const desc = (t.description ?? "").trim() || "Abono de suscripción para mantener tus servicios visibles";
      pushTransactionItem(items, seen, {
        id,
        kind: "subscription",
        brand: "subscription",
        title: "Pago de mensualidad",
        subtitle: desc,
        dateIso,
        status: String(t.status ?? "completed"),
        displayAmountUsd: amt,
        amountMode: "standard",
        transferId: t.id,
        detail: buildSubscriptionActivityDetail(null, desc),
      });
      continue;
    }

    const desc = String(t.description ?? "").trim();
    const brand = inferBrandFromTransferDescription(desc);
    const amt = typeof t.amount === "number" ? t.amount : Number(t.amount);
    const dateIso = toIsoDate(t.createdAt);
    const isPayment = isWalletPaymentTransfer(t);
    const isCarGoIncome = isProviderServiceWalletTransfer(t) && isCarGoWalletTransaction(t);

    if (isPayment) {
      pushTransactionItem(items, seen, {
        id: `transfer-pay-${t.id ?? t.createdAt}`,
        kind: "payment",
        brand: brand === "unknown" ? "car_go" : brand,
        title: isCarGoWalletTransaction(t) ? "Pago de viaje Car Go" : "Pago de servicio",
        subtitle: desc || "Cargo en Saldo Applia",
        dateIso,
        status: String(t.status ?? "completed"),
        displayAmountUsd: Number.isFinite(amt) ? Math.abs(amt) : null,
        amountMode: "standard",
        transferId: t.id,
        detail: buildWalletPaymentActivityDetail(desc, Number.isFinite(amt) ? Math.abs(amt) : null, dateIso, t.referenceId),
      });
      continue;
    }

    if (isCarGoIncome) {
      const mobilityId = parseRefMobilityRideId(t.referenceId);
      if (mobilityId && coveredMobilityIds.has(mobilityId)) {
        /* el viaje ya está en historial de servicios */
      }
      pushTransactionItem(items, seen, {
        id: `transfer-income-${t.id ?? t.createdAt}`,
        kind: "payment",
        brand,
        title: `Ingreso · ${brandDisplayName(brand)}`,
        subtitle: desc || "Pago registrado por viaje",
        dateIso,
        status: String(t.status ?? "completed"),
        displayAmountUsd: Number.isFinite(amt) ? amt : null,
        amountMode: "standard",
        transferId: t.id,
        perspective: "driver",
        detail: buildWalletPaymentActivityDetail(
          desc,
          Number.isFinite(amt) ? amt : null,
          dateIso,
          t.referenceId,
        ),
      });
    }
  }

  items.sort((a, b) => {
    const ta = a.dateIso ? new Date(a.dateIso).getTime() : 0;
    const tb = b.dateIso ? new Date(b.dateIso).getTime() : 0;
    return tb - ta;
  });

  return items;
}

export function formatAssociateActivityAmount(
  item: Pick<AssociateDashboardActivityItem, "displayAmountUsd" | "amountMode">,
  formatUsd: (n: number) => string,
): string | null {
  if (item.amountMode === "none") return null;
  if (item.amountMode === "agreed") {
    if (item.displayAmountUsd == null) return "Tarifa acordada";
    return `Acordado: ${formatUsd(item.displayAmountUsd)}`;
  }
  if (item.displayAmountUsd == null) return null;
  return formatUsd(item.displayAmountUsd);
}

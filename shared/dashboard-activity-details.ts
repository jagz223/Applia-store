import type {
  AssociateActivityBrand,
  AssociateDashboardActivityDetail,
  AssociateDashboardActivityDetailRow,
  AssociateDashboardBookingLike,
  ServiceActivityPerspective,
} from "./associate-dashboard-activity";

function brandDisplayName(brand: AssociateActivityBrand): string {
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
import type { MobilityRideHistoryListItem } from "./mobility-ride-history";
import {
  subscriptionInvoicePurposeLabel,
  type SubscriptionInvoiceListItem,
} from "./subscription-invoice";
import { MOBILITY_UI } from "./mobility-ui-labels";

function row(label: string, value: string): AssociateDashboardActivityDetailRow {
  return { label, value: value.trim() || "—" };
}

export function formatDashboardPersonName(
  person?: { firstName?: string | null; lastName?: string | null; name?: string | null } | null,
  fallback = "Usuario",
): string {
  if (!person) return fallback;
  const first = String(person.firstName ?? "").trim();
  const last = String(person.lastName ?? "").trim();
  const combined = [first, last].filter(Boolean).join(" ");
  if (combined) return combined;
  const name = String(person.name ?? "").trim();
  return name || fallback;
}

/** Convierte `booking.date` (o Firestore Timestamp) a ISO; solo el horario de la reserva. */
export function bookingDateToIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  if (typeof value === "object" && value !== null) {
    if ("toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
      const d = (value as { toDate: () => Date }).toDate();
      return Number.isFinite(d.getTime()) ? d.toISOString() : null;
    }
    if ("seconds" in value) {
      const d = new Date((value as { seconds: number }).seconds * 1000);
      return Number.isFinite(d.getTime()) ? d.toISOString() : null;
    }
    if ("_seconds" in value) {
      const d = new Date((value as { _seconds: number })._seconds * 1000);
      return Number.isFinite(d.getTime()) ? d.toISOString() : null;
    }
  }
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function formatIsoDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Man Go / Pro Go: no mostrar forma de pago en el resumen del dashboard. */
export function shouldHidePaymentMethodInBookingDetail(brand: AssociateActivityBrand): boolean {
  return brand === "man_go" || brand === "pro_go";
}

function formatPaymentMethod(raw?: string | null): string {
  const s = String(raw ?? "").toLowerCase();
  if (s === "wallet" || s === "applia") return "Saldo Applia";
  if (s === "cash" || s === "efectivo") return "Efectivo";
  if (s === "bank_transfer" || s === "transferencia") return "Transferencia";
  return raw?.trim() || "—";
}

function formatDurationMinutes(min: number): string {
  if (!Number.isFinite(min) || min < 1) return "—";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

export function buildBookingActivityDetail(
  booking: AssociateDashboardBookingLike,
  perspective: ServiceActivityPerspective,
  brand: AssociateActivityBrand,
): AssociateDashboardActivityDetail {
  /** Fecha/hora acordada: la del campo `date` (cita al reservar o la que fijó el asociado al gestionar). */
  const agreedScheduleIso = bookingDateToIso(booking.date);
  const completedIso = bookingDateToIso(booking.completedAt);

  const clientName = formatDashboardPersonName(booking.user, "Cliente");
  const providerName = formatDashboardPersonName(
    booking.service?.provider?.user ?? null,
    "Profesional",
  );

  const rows: AssociateDashboardActivityDetailRow[] = [
    row("Servicio", booking.service?.title ?? booking.service?.name ?? "Reserva"),
    row("Marca", brandDisplayName(brand)),
  ];

  if (perspective === "provider") {
    rows.push(row("Cliente", clientName));
  } else {
    rows.push(row("Profesional", providerName));
  }

  rows.push(row("Horario acordado", formatIsoDateTime(agreedScheduleIso)));

  if (completedIso) {
    rows.push(row("Completado", formatIsoDateTime(completedIso)));
  }

  if (!shouldHidePaymentMethodInBookingDetail(brand)) {
    rows.push(row("Forma de pago", formatPaymentMethod(booking.paymentMethod)));
  }

  const cost = typeof booking.cost === "number" ? booking.cost : Number(booking.cost);
  if (Number.isFinite(cost) && cost > 0 && (brand === "car_go" || brand === "pack_go")) {
    rows.push(row("Monto acordado", `${cost.toFixed(2)} USD`));
  }

  if (booking.notes?.trim()) {
    rows.push(row("Notas", booking.notes.trim()));
  }

  return {
    rows,
    bookingId: Number(booking.id),
  };
}

export function buildMobilityActivityDetail(
  ride: MobilityRideHistoryListItem,
  perspective: ServiceActivityPerspective,
): AssociateDashboardActivityDetail {
  const brandLabel = ride.module === "pack" ? MOBILITY_UI.delivery : MOBILITY_UI.taxiService;
  const counterpart =
    perspective === "driver" || perspective === "provider"
      ? formatDashboardPersonName({ name: ride.riderName }, "Pasajero")
      : formatDashboardPersonName({ name: ride.driverName ?? "" }, "Conductor");

  const rows: AssociateDashboardActivityDetailRow[] = [
    row("Tipo", brandLabel),
    row(
      perspective === "driver" ? "Pasajero" : "Conductor",
      counterpart,
    ),
    row("Origen", ride.startLabel),
    row("Destino", ride.endLabel),
    row("Duración", formatDurationMinutes(ride.durationMin)),
    row("Costo", `${ride.amountUsd.toFixed(2)} USD`),
    row("Pago", formatPaymentMethod(ride.payment)),
    row("Inicio", formatIsoDateTime(ride.createdAt)),
    row("Completado", formatIsoDateTime(ride.endedAt)),
    row("Vehículo", ride.vehicleLabel),
  ];

  return {
    rows,
    mobilityRideId: ride.id,
  };
}

export function buildSubscriptionActivityDetail(
  inv?: SubscriptionInvoiceListItem | null,
  transferDescription?: string | null,
): AssociateDashboardActivityDetail {
  const rows: AssociateDashboardActivityDetailRow[] = [
    row("Concepto", inv ? subscriptionInvoicePurposeLabel(inv) : transferDescription ?? "Mensualidad"),
    row("Estado", inv?.status === "completed" ? "Aprobado" : String(inv?.status ?? "Completado")),
  ];
  if (inv?.approvedAt || inv?.date) {
    rows.push(row("Fecha de pago", formatIsoDateTime(inv.approvedAt ?? inv.date)));
  }
  if (inv?.promotionalCode) {
    rows.push(row("Código promocional", inv.promotionalCode));
  }
  return { rows };
}

export function buildWalletPaymentActivityDetail(
  description: string,
  amountUsd: number | null,
  dateIso: string | null,
  referenceId?: string | null,
): AssociateDashboardActivityDetail {
  const rows: AssociateDashboardActivityDetailRow[] = [
    row("Concepto", description || "Pago registrado"),
    row("Fecha", formatIsoDateTime(dateIso)),
  ];
  if (amountUsd != null && Number.isFinite(amountUsd)) {
    rows.push(row("Monto", `${amountUsd.toFixed(2)} USD`));
  }
  const mobilityId = referenceId?.match(/^cargo:(.+)$/i)?.[1];
  return {
    rows,
    mobilityRideId: mobilityId,
  };
}

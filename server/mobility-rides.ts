/**
 * Car Go: emparejamiento pasajero ↔ conductor en tiempo real (memoria + Socket.IO).
 * Un solo proceso; no persiste en DB (MVP).
 */
import type { Express } from "express";
import type { Server as SocketIOServer } from "socket.io";
import type { Socket } from "socket.io";
import type { GeoJsonObject } from "geojson";
import { z } from "zod";
import { authenticateJWT } from "./routes-auth";
import { getIO, getUserActivePath } from "./socket";
import { genFebStorage } from "./storage-genfeb";
import { catalogService } from "./services";
import { notificationService } from "./services/notification.service";
import {
  registerMobilityNegotiationWithdraw,
  withdrawDriverNegotiationOffersEverywhere,
} from "./negotiation-cross-withdraw";
import {
  driverCanAccessNegotiationBoardSegment,
  driverPrimaryVehicleMatchesRideKind,
} from "./go-negotiation-driver-eligibility";
import {
  driverGoSubscriptionAllowsOperation,
  GO_DRIVER_SUBSCRIPTION_INACTIVE_MESSAGE,
} from "./go-driver-subscription-guard";
import {
  DRIVER_NEGOTIATION_OFFER_ALREADY_SENT_MESSAGE,
  GO_NEGOTIATION_OFFER_WINDOW_MS,
  NEGOTIATION_OFFER_REMOVED_REASON_RIDER_REJECTED,
  NEGOTIATION_OFFER_REMOVED_REASON_WITHDRAWN,
  RIDER_DRIVER_NOT_AVAILABLE_MESSAGE,
} from "@shared/mobility-negotiation";
import { driverIsBusyCrossModule, registerMobilityDriverBusy } from "./driver-busy-cross-module";
import { resolveGoRideRouteQuote } from "./go-ride-route-quote";
import { applyDriverFareToRide } from "./ride-fare-apply";
import { normalizeDispatchCompanyId } from "@shared/dispatch-company";
import { toCentralActiveServiceForPanel } from "@shared/central-active-service-for-central";
import { emitCentralFleetUpdate, CENTRAL_FLEET_IN_SERVICE_RECEIVING } from "./central-fleet-notify";
import { persistMobilityRideToHistory } from "./mobility-ride-archive-helper";
import { CHAT_SYSTEM_SENDER_ID } from "@shared/chat-constants";
import {
  ensureMobilityRideConversation,
  onMobilityRideChatCancelled,
  onMobilityRideChatCompleted,
  onMobilityRideChatStarted,
  runMobilityRideChatStartupSweep,
} from "./mobility-ride-chat";
import { bumpGoUserCompletedTrips, resolveGoPublicUserStats } from "./go-public-user-enrich";
import crypto from "crypto";

export type TaxiVehicleKind = "moto" | "auto" | "pet_car" | "camioneta";
export type TaxiPaymentMethod = "cash" | "bank_transfer";

/** Snapshot de conductor en ofertas de regateo (alineado con buildDriverPublic). */
export type NegotiationDriverSnapshot = {
  userId: string;
  name: string;
  lastName?: string;
  profileImageUrl: string | null;
  phone: string | null;
  rating: number | null;
  ratingCount: number;
  completedTrips: number;
  vehicle: {
    type: string;
    brand: string;
    model: string;
    licensePlate: string;
    color: string | null;
  } | null;
};

/** Oferta de conductor en servicio con regateo (por ride). */
export type NegotiationDriverOffer = {
  driverUserId: string;
  amountUsd: number;
  createdAt: number;
  updatedAt: number;
  driver: NegotiationDriverSnapshot;
};

export type NegotiationOffersArchiveEntry = {
  archivedAt: number;
  reason: "accepted";
  acceptedDriverUserId: string;
  offersSnapshot: NegotiationDriverOffer[];
};

/** Mapa UI taxi → tipo vehículo proveedor (vehículo registrado). */
const TAXI_TO_PROVIDER_VEHICLE: Record<TaxiVehicleKind, string> = {
  moto: "motorcycle",
  auto: "car",
  pet_car: "car",
  camioneta: "pickup_truck",
};

type RideStatus = "searching" | "matched" | "in_progress" | "cancelled" | "expired";

type RideRecord = {
  id: string;
  riderUserId: string;
  driverUserId: string | null;
  status: RideStatus;
  vehicleType: TaxiVehicleKind;
  paymentMethod: TaxiPaymentMethod;
  paymentConfirmed: boolean;
  /** Oferta del cliente (monto editable). */
  estimatedUsd: number;
  /** Referencia sugerida calculada por el cliente (tarifas Admin). */
  suggestedUsd?: number;
  /** Si existe, este ride se muestra en el “market” (ofertas por negociar) hasta esta fecha. */
  marketVisibleUntil?: number;
  /** Contraofertas del driver: driverId -> { amountUsd, expiresAt }. */
  counterOffers?: Record<string, { amountUsd: number; expiresAt: number }>;
  distanceM: number;
  durationSec: number;
  start: { lat: number; lon: number; label: string };
  end: { lat: number; lon: number; label: string };
  routeGeometry: GeoJsonObject | null;
  petEnabled: boolean;
  createdAt: number;
  conversationId: number | null;
  /** Cola de conductores (ordenados por cercanía) a los que se ofrecerá el viaje. */
  offeredDriverIds: string[];
  offerIndex: number;
  currentOfferDriverId: string | null;
  offerExpiresAt: number | null;
  /** Driver indicó que ya está buscando al cliente (paso previo a iniciar viaje). */
  driverSearchingClient?: boolean;
  /** Una sola notificación push + mensaje de chat cuando el conductor cruza el umbral cerca del punto de recogida. */
  riderNotifiedDriverNearPickup?: boolean;
  /** Evita doble asiento contable al completar */
  financialsSettled?: boolean;
  /** Última vez que un driver rechazó/expiró esta oferta (para re-ofertar luego). */
  declinedAtByDriverId?: Record<string, number>;
  /** Flujo de regateo: el pasajero fijó un monto distinto al flujo “solo referencia”. */
  isNegotiated?: boolean;
  /** Ofertas activas de conductores (solo en búsqueda negociada). */
  offers?: NegotiationDriverOffer[];
  /** Historial al aceptar: se archiva el snapshot y se vacía `offers`. */
  offersArchive?: NegotiationOffersArchiveEntry[];
  /** Fin de ventana para nuevas ofertas de conductores (invitación inicial). */
  negotiationExpiresAt?: number;
};

const rides = new Map<string, RideRecord>();

/** Participantes del viaje para enlaces de notificación push del chat. */
export function getMobilityRideChatParticipants(rideId: string): {
  riderUserId: string;
  driverUserId: string | null;
} | null {
  const ride = rides.get(rideId);
  if (!ride) return null;
  return { riderUserId: ride.riderUserId, driverUserId: ride.driverUserId };
}

export function mobilityDriverInActiveRide(userId: string): boolean {
  for (const r of rides.values()) {
    if (
      r.driverUserId === userId &&
      (r.status === "matched" || r.status === "in_progress")
    ) {
      return true;
    }
  }
  return false;
}

/** Resumen del viaje taxi activo del conductor para el panel central (matched / in_progress). */
export async function getMobilityActiveRideForCentral(driverUserId: string) {
  for (const r of rides.values()) {
    if (r.driverUserId !== driverUserId) continue;
    if (r.status !== "matched" && r.status !== "in_progress") continue;
    return toCentralActiveServiceForPanel({
      mode: "taxi",
      rideId: r.id,
      status: r.status,
      vehicleType: r.vehicleType,
      paymentMethod: r.paymentMethod,
      paymentConfirmed: r.paymentConfirmed,
      estimatedUsd: r.estimatedUsd,
      suggestedUsd: typeof r.suggestedUsd === "number" ? r.suggestedUsd : null,
      distanceM: r.distanceM,
      durationSec: r.durationSec,
      start: r.start,
      end: r.end,
      petEnabled: r.petEnabled,
      driverSearchingClient: r.driverSearchingClient ?? false,
      isNegotiated: r.isNegotiated ?? false,
    });
  }
  return null;
}

const rideTimers = new Map<
  string,
  { offerTimeoutId: NodeJS.Timeout | null; expireTimeoutId: NodeJS.Timeout | null }
>();

/**
 * Oferta pendiente por driver (para recuperar si el driver no estaba en la vista de driver
 * cuando se emitió el socket event). TTL = offerExpiresAt.
 */
const pendingOfferByDriverId = new Map<
  string,
  { rideId: string; expiresAt: number; module: "cargo" }
>();

/** Conductores en línea (recibiendo) con posición reciente. */
type DriverPresence = {
  userId: string;
  vehicleType: string;
  isPetFriendly: boolean;
  lat: number;
  lon: number;
  updatedAt: number;
  dispatchCompanyId: string | null;
  /** Conductor en viaje: dejó «recibir» pero conservamos fila para el mapa de la central. */
  idleOnMapDuringRide?: boolean;
};
const onlineDrivers = new Map<string, DriverPresence>();

export function getMobilityOnlineDriversSnapshot(): ReadonlyMap<string, DriverPresence> {
  return onlineDrivers;
}

export function getMobilityPresenceRow(userId: string): DriverPresence | undefined {
  return onlineDrivers.get(userId);
}

/**
 * Tras vincular el proveedor a una central (p. ej. afiliación aprobada), actualiza la fila de presencia taxi
 * si el conductor ya estaba «recibiendo» con `dispatchCompanyId` antiguo o nulo (evita que la central no lo vea en mapa).
 */
export async function refreshMobilityPresenceDispatchCompany(driverUserId: string): Promise<void> {
  const row = onlineDrivers.get(driverUserId);
  if (!row) return;
  const provider = await catalogService.getProviderByUserId(driverUserId);
  const dispatchCompanyId = normalizeDispatchCompanyId(
    (provider as { dispatchCompanyId?: unknown } | null)?.dispatchCompanyId,
  );
  if (dispatchCompanyId === row.dispatchCompanyId) return;
  const next: DriverPresence = { ...row, dispatchCompanyId };
  onlineDrivers.set(driverUserId, next);
  emitCentralFleetUpdate(getIO(), next);
}

const PRESENCE_TTL_MS = 45_000;
const REOFFER_COOLDOWN_MS = 75_000;

function driverBusyInMobilityStore(driverId: string): boolean {
  for (const r of rides.values()) {
    if (r.driverUserId === driverId && (r.status === "matched" || r.status === "in_progress")) return true;
  }
  return false;
}
registerMobilityDriverBusy(driverBusyInMobilityStore);

function nextOfferTtlMs(): number {
  // Ventana de respuesta del driver: 10–22s (más humana).
  return 10_000 + Math.floor(Math.random() * (22_000 - 10_000 + 1));
}

function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

const DRIVER_NEAR_PICKUP_RADIUS_M = 400;

async function appendMobilityRideSystemMessage(conversationId: number | null | undefined, content: string): Promise<void> {
  const cid = conversationId == null ? NaN : Number(conversationId);
  if (!Number.isFinite(cid)) return;
  try {
    await genFebStorage.createMessage({
      conversationId: cid,
      senderId: CHAT_SYSTEM_SENDER_ID,
      content,
      type: "system",
      status: "sent",
    });
  } catch (e) {
    console.error("[mobility] appendMobilityRideSystemMessage", e);
  }
}

function freshDriversForVehicle(taxiKind: TaxiVehicleKind): DriverPresence[] {
  const want = TAXI_TO_PROVIDER_VEHICLE[taxiKind];
  const requirePet = taxiKind === "pet_car";
  const now = Date.now();
  const list: DriverPresence[] = [];
  for (const d of onlineDrivers.values()) {
    if (d.vehicleType !== want) continue;
    if (requirePet && !d.isPetFriendly) continue;
    if (now - d.updatedAt > PRESENCE_TTL_MS) continue;
    if (driverIsBusyCrossModule(d.userId)) continue;
    list.push(d);
  }
  return list;
}

function rankDriversByNearest(start: { lat: number; lon: number }, list: DriverPresence[]): DriverPresence[] {
  return [...list].sort(
    (a, b) =>
      haversineM(start, { lat: a.lat, lon: a.lon }) - haversineM(start, { lat: b.lat, lon: b.lon })
  );
}

function rideWantsPresence(ride: RideRecord, pres: DriverPresence): boolean {
  if (ride.status !== "searching") return false;
  if (ride.driverUserId != null) return false;
  const wantVehicle = TAXI_TO_PROVIDER_VEHICLE[ride.vehicleType];
  if (wantVehicle !== pres.vehicleType) return false;
  if (ride.vehicleType === "pet_car" && !pres.isPetFriendly) return false;
  return true;
}

function distanceToRideStart(ride: RideRecord, pres: DriverPresence): number {
  return haversineM(ride.start, { lat: pres.lat, lon: pres.lon });
}

/**
 * Inserta un driver en la cola de oferta manteniendo prioridad por cercanía.
 * Nota: no interrumpe una oferta en curso; entrará como siguiente candidato.
 */
function insertDriverByDistance(ride: RideRecord, driverId: string) {
  if (ride.offeredDriverIds.includes(driverId)) return false;
  if (ride.currentOfferDriverId === driverId) return false;
  const declinedAt = ride.declinedAtByDriverId?.[driverId];
  if (typeof declinedAt === "number" && Date.now() - declinedAt < REOFFER_COOLDOWN_MS) return false;
  const pres = onlineDrivers.get(driverId);
  if (!pres) return false;
  if (!rideWantsPresence(ride, pres)) return false;

  const myD = distanceToRideStart(ride, pres);
  let idx = ride.offeredDriverIds.length;
  for (let i = 0; i < ride.offeredDriverIds.length; i += 1) {
    const otherId = ride.offeredDriverIds[i];
    const otherPres = onlineDrivers.get(otherId);
    if (!otherPres) continue;
    const otherD = distanceToRideStart(ride, otherPres);
    if (myD < otherD) {
      idx = i;
      break;
    }
  }
  ride.offeredDriverIds.splice(idx, 0, driverId);
  return true;
}

function ensureRideTimers(rideId: string) {
  let t = rideTimers.get(rideId);
  if (!t) {
    t = { offerTimeoutId: null, expireTimeoutId: null };
    rideTimers.set(rideId, t);
  }
  return t;
}

function clearRideTimers(rideId: string) {
  const t = rideTimers.get(rideId);
  if (!t) return;
  if (t.offerTimeoutId) clearTimeout(t.offerTimeoutId);
  if (t.expireTimeoutId) clearTimeout(t.expireTimeoutId);
  rideTimers.delete(rideId);
}

function driverCanDeclineClassicOffer(ride: RideRecord, driverUserId: string, rideId: string): boolean {
  if (ride.status !== "searching" || ride.isNegotiated) return false;
  if (ride.currentOfferDriverId === driverUserId) return true;
  const pending = pendingOfferByDriverId.get(driverUserId);
  if (pending?.rideId === rideId) return true;
  return ride.offeredDriverIds.includes(driverUserId);
}

function releaseClassicOfferFromDriver(rideId: string, ride: RideRecord, driverUserId: string): void {
  ride.declinedAtByDriverId = ride.declinedAtByDriverId ?? {};
  ride.declinedAtByDriverId[driverUserId] = Date.now();
  ride.currentOfferDriverId = null;
  ride.offerExpiresAt = null;
  pendingOfferByDriverId.delete(driverUserId);
  const timers = rideTimers.get(rideId);
  if (timers?.offerTimeoutId) {
    clearTimeout(timers.offerTimeoutId);
    timers.offerTimeoutId = null;
  }
}

function emitRideFailed(io: SocketIOServer, ride: RideRecord, reason: "timeout" | "no_driver") {
  ride.status = "expired";
  clearRideTimers(ride.id);
  void persistMobilityRideToHistory(ride, "cargo", "expired", { failReason: reason });
  io.to(`user:${ride.riderUserId}`).emit("cargo:ride:failed", { rideId: ride.id, reason });
}

function emitRideCancelled(
  io: SocketIOServer,
  ride: RideRecord,
  cancelledBy: "rider" | "driver",
  prevStatus: RideStatus
) {
  const payload = { rideId: ride.id, cancelledBy };
  const notify = new Set<string>();
  notify.add(ride.riderUserId);
  if (ride.driverUserId) notify.add(ride.driverUserId);
  if (prevStatus === "searching") {
    for (const id of ride.offeredDriverIds) notify.add(id);
    if (ride.currentOfferDriverId) notify.add(ride.currentOfferDriverId);
  }
  for (const uid of notify) {
    io.to(`user:${uid}`).emit("cargo:ride:cancelled", payload);
  }

  // Push al pasajero si no está viendo Go (Taxi).
  try {
    const pth = getUserActivePath(String(ride.riderUserId));
    if (!pth || (!pth.startsWith("/go/taxi") && !pth.startsWith("/go/cargo"))) {
      void notificationService.sendPushToUser(ride.riderUserId, {
        title: "Servicio de taxi",
        body: cancelledBy === "driver" ? "El conductor canceló el viaje." : "El viaje fue cancelado.",
        data: { url: "/go/taxi", type: "cargo_ride_cancelled", rideId: ride.id },
      });
    }
  } catch {}
}

function archiveCargoRideCancelled(ride: RideRecord, cancelledBy: "rider" | "driver") {
  void persistMobilityRideToHistory(ride, "cargo", "cancelled", { cancelledBy });
}

async function offerNextDriver(
  io: SocketIOServer,
  ride: RideRecord,
  rider: { name: string; profileImageUrl: string | null }
) {
  if (ride.status !== "searching") return;
  if (ride.isNegotiated) return;
  // Rides "por negociar" (market legacy) no deben entrar al flujo clásico de ofertas por socket.
  if (typeof ride.marketVisibleUntil === "number") return;

  const timers = ensureRideTimers(ride.id);
  if (timers.offerTimeoutId) {
    clearTimeout(timers.offerTimeoutId);
    timers.offerTimeoutId = null;
  }

  let driverId: string | null = null;
  while (ride.offerIndex < ride.offeredDriverIds.length) {
    const nextId = ride.offeredDriverIds[ride.offerIndex];
    ride.offerIndex += 1;
    if (driverIsBusyCrossModule(nextId)) continue;
    const declinedAt = ride.declinedAtByDriverId?.[nextId];
    if (typeof declinedAt === "number" && Date.now() - declinedAt < REOFFER_COOLDOWN_MS) continue;
    driverId = nextId;
    break;
  }

  if (driverId == null) {
    // No matamos la búsqueda solo porque "por ahora" no hay conductores disponibles.
    // El ride seguirá en `searching` hasta el TTL, y la presencia de nuevos drivers disparará nuevas ofertas.
    return;
  }

  ride.currentOfferDriverId = driverId;
  const offerTtlMs = nextOfferTtlMs();
  ride.offerExpiresAt = Date.now() + offerTtlMs;

  io.to(`user:${driverId}`).emit("cargo:ride:offer", {
    rideId: ride.id,
    rider,
    start: ride.start,
    end: ride.end,
    routeGeometry: ride.routeGeometry,
    distanceM: ride.distanceM,
    durationSec: ride.durationSec,
    vehicleType: ride.vehicleType,
    paymentMethod: ride.paymentMethod,
    estimatedUsd: ride.estimatedUsd,
    suggestedUsd: ride.suggestedUsd ?? ride.estimatedUsd,
    petEnabled: ride.petEnabled,
    expiresAt: ride.offerExpiresAt,
  });

  // Guardar oferta pendiente para “recovery” si el driver no estaba en Go (Taxi driver).
  pendingOfferByDriverId.set(driverId, { rideId: ride.id, expiresAt: ride.offerExpiresAt!, module: "cargo" });

  // Push al driver si no está viendo la vista de driver (o no reportó ruta).
  try {
    const pth = getUserActivePath(String(driverId));
    if (
      !pth ||
      (!pth.startsWith("/go/driver") &&
        !pth.startsWith("/go/taxi/driver") &&
        !pth.startsWith("/go/cargo/driver"))
    ) {
      void notificationService.sendPushToUser(driverId, {
        title: "Servicio de taxi",
        body: "Tienes un servicio disponible. Abre para aceptar o rechazar.",
        data: { url: "/go/driver", type: "cargo_ride_offer", rideId: ride.id },
      });
    }
  } catch {}

  const fixedDriverId = driverId;
  timers.offerTimeoutId = setTimeout(() => {
    const live = rides.get(ride.id);
    if (!live || live.status !== "searching") return;
    if (live.currentOfferDriverId !== fixedDriverId) return;
    live.declinedAtByDriverId = live.declinedAtByDriverId ?? {};
    live.declinedAtByDriverId[fixedDriverId] = Date.now();
    io.to(`user:${fixedDriverId}`).emit("cargo:ride:offer_expired", { rideId: live.id });
    pendingOfferByDriverId.delete(fixedDriverId);
    live.currentOfferDriverId = null;
    live.offerExpiresAt = null;
    void offerNextDriver(io, live, rider);
  }, offerTtlMs + 150);
}

function safeNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
}

function roundToCents(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function isStandardOffer(offerUsd: number, suggestedUsd: number): boolean {
  return Math.abs(roundToCents(offerUsd) - roundToCents(suggestedUsd)) <= 0.01;
}

async function buildRiderPublic(riderUserId: string) {
  const u = await genFebStorage.getUserById(riderUserId);
  const rec = (u ?? undefined) as Record<string, unknown> | undefined;
  const fn = String(rec?.firstName ?? "").trim();
  const ln = String(rec?.lastName ?? "").trim();
  const nn = String(rec?.name ?? "").trim();
  const email = String(rec?.email ?? "").trim();
  const fromParts = [fn, ln].filter(Boolean).join(" ").trim();
  // Nombre para UI pública: campo `name` o nombre compuesto (como en admin / facturas).
  const name = nn || fromParts || fn || ln || "Pasajero";
  const profileImageUrl =
    (rec?.profileImageUrl as string) ||
    (rec?.profile_image_url as string) ||
    (rec?.imageUrl as string) ||
    (rec?.avatar as string) ||
    null;
  const phone =
    String(rec?.phone ?? rec?.phoneNumber ?? rec?.phone_number ?? rec?.phone_number_e164 ?? "").trim() ||
    null;
  const stats = await resolveGoPublicUserStats(riderUserId, rec);
  return { name, lastName: ln, profileImageUrl, phone, ...stats, email };
}

async function buildDriverPublic(driverUserId: string) {
  const u = await genFebStorage.getUserById(driverUserId);
  const rec = (u ?? undefined) as Record<string, unknown> | undefined;
  const provider = await catalogService.getProviderByUserId(driverUserId);
  const vehicle = provider
    ? await genFebStorage.getPrimaryVehicleByProviderId((provider as { id: number }).id)
    : null;
  const fn = String(rec?.firstName ?? "").trim();
  const ln = String(rec?.lastName ?? "").trim();
  const nn = String(rec?.name ?? "").trim();
  // Mantener compatibilidad: el cliente arma el nombre completo como en el chat.
  const name = nn || fn || "Conductor";
  const profileImageUrl =
    (rec?.profileImageUrl as string) ||
    (rec?.profile_image_url as string) ||
    (rec?.imageUrl as string) ||
    (rec?.avatar as string) ||
    null;
  const phone =
    String(rec?.phone ?? rec?.phoneNumber ?? rec?.phone_number ?? rec?.phone_number_e164 ?? "").trim() ||
    null;
  const stats = await resolveGoPublicUserStats(driverUserId, rec);
  return {
    userId: driverUserId,
    name,
    lastName: ln,
    profileImageUrl,
    phone,
    ...stats,
    vehicle: vehicle
      ? {
          type: vehicle.vehicle_type as string,
          brand: vehicle.brand as string,
          model: vehicle.model as string,
          licensePlate: vehicle.license_plate as string,
          color: (vehicle as { exterior_color?: string }).exterior_color ?? null,
        }
      : null,
  };
}

/** Datos del viaje para `POST /api/go/panic` (ruta central en `routes.ts`). */
export async function mobilityPanicResolveContext(rideId: string) {
  const ride = rides.get(rideId);
  if (!ride) return null;
  const riderPub = await buildRiderPublic(ride.riderUserId);
  const driverPub = ride.driverUserId ? await buildDriverPublic(ride.driverUserId) : null;
  return {
    ride,
    riderParty: {
      userId: ride.riderUserId,
      name: riderPub.name,
      phone: riderPub.phone,
      email: riderPub.email,
    },
    driverParty: driverPub
      ? { userId: driverPub.userId, name: driverPub.name, phone: driverPub.phone }
      : null,
  };
}

function emitNegotiationOffersUpdated(io: SocketIOServer, ride: RideRecord) {
  io.to(`user:${ride.riderUserId}`).emit("cargo:ride:negotiation:offers_updated", {
    rideId: ride.id,
    offers: ride.offers ?? [],
    /** Oferta publicada por el pasajero (referencia en UI de regateo). */
    riderOfferUsd: ride.estimatedUsd,
  });
}

/** Quita al conductor de las listas de regateo de otros viajes (mismo módulo). */
function withdrawDriverMobilityNegotiationOffersElsewhere(
  io: SocketIOServer,
  driverUserId: string,
  keepRideId: string
) {
  for (const ride of rides.values()) {
    if (ride.id === keepRideId) continue;
    if (ride.status !== "searching" || !ride.isNegotiated || ride.driverUserId != null) continue;
    const list = ride.offers ?? [];
    if (!list.some((o) => o.driverUserId === driverUserId)) continue;
    ride.offers = list.filter((o) => o.driverUserId !== driverUserId);
    emitNegotiationOffersUpdated(io, ride);
    io.to(`user:${driverUserId}`).emit("cargo:ride:negotiation:offer_removed", {
      rideId: ride.id,
      reason: NEGOTIATION_OFFER_REMOVED_REASON_WITHDRAWN,
    });
    const p = pendingOfferByDriverId.get(driverUserId);
    if (p?.rideId === ride.id) pendingOfferByDriverId.delete(driverUserId);
  }
}

registerMobilityNegotiationWithdraw(withdrawDriverMobilityNegotiationOffersElsewhere);

/** Regateo: ventana de ofertas + aviso al pasajero. Los conductores ven solicitudes en GET /negotiation-board (no modal ni marketplace). */
function broadcastNegotiationInvites(io: SocketIOServer, ride: RideRecord, _rider: Awaited<ReturnType<typeof buildRiderPublic>>) {
  ride.negotiationExpiresAt = Date.now() + GO_NEGOTIATION_OFFER_WINDOW_MS;
  emitNegotiationOffersUpdated(io, ride);
}

/** Vista admin: servicios Car Go en memoria (activos, completados, cancelados/expirados). */
export type AdminCargoGoRideBucket = "active" | "completed" | "cancelled";

export type AdminCargoGoRideListItem = {
  id: string;
  bucket: AdminCargoGoRideBucket;
  status: RideStatus | "completed";
  statusLabel: string;
  riderUserId: string;
  riderName: string;
  driverUserId: string | null;
  driverName: string | null;
  vehicleType: TaxiVehicleKind;
  vehicleLabel: string;
  startLabel: string;
  endLabel: string;
  createdAt: string;
};

const CARGO_VEHICLE_LABELS: Record<TaxiVehicleKind, string> = {
  moto: "Moto",
  auto: "Auto",
  pet_car: "Pet Car",
  camioneta: "Camioneta",
};

function cargoGoAdminBucket(r: RideRecord): AdminCargoGoRideBucket {
  if (r.status === "cancelled") return "cancelled";
  if (r.status === "expired" && r.financialsSettled) return "completed";
  if (r.status === "expired") return "cancelled";
  return "active";
}

function cargoGoAdminStatusLabel(r: RideRecord): string {
  if (r.status === "expired" && r.financialsSettled) return "Completado";
  if (r.status === "expired") return "Expirado (sin viaje)";
  if (r.status === "searching") return "Buscando conductor";
  if (r.status === "matched") return "Conductor asignado";
  if (r.status === "in_progress") return "En curso";
  if (r.status === "cancelled") return "Cancelado";
  return r.status;
}

function cargoGoAdminDisplayStatus(r: RideRecord): RideStatus | "completed" {
  if (r.status === "expired" && r.financialsSettled) return "completed";
  return r.status;
}

/** Viajes Car Go activos en memoria (en curso). El historial va en Firestore. */
export async function listCargoGoActiveRidesForAdmin(): Promise<AdminCargoGoRideListItem[]> {
  const rows: AdminCargoGoRideListItem[] = [];
  for (const r of rides.values()) {
    if (cargoGoAdminBucket(r) !== "active") continue;
    const rider = await buildRiderPublic(r.riderUserId);
    const driver = r.driverUserId ? await buildDriverPublic(r.driverUserId) : null;
    const riderName = [rider.name, rider.lastName].filter(Boolean).join(" ").trim() || rider.name;
    const driverName = driver
      ? [driver.name, driver.lastName].filter(Boolean).join(" ").trim() || driver.name
      : null;
    rows.push({
      id: r.id,
      bucket: "active",
      status: cargoGoAdminDisplayStatus(r),
      statusLabel: cargoGoAdminStatusLabel(r),
      riderUserId: r.riderUserId,
      riderName,
      driverUserId: r.driverUserId,
      driverName,
      vehicleType: r.vehicleType,
      vehicleLabel: CARGO_VEHICLE_LABELS[r.vehicleType] ?? r.vehicleType,
      startLabel: r.start.label,
      endLabel: r.end.label,
      createdAt: new Date(r.createdAt).toISOString(),
    });
  }
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return rows;
}

export function registerMobilityRideRoutes(app: Express) {
  void runMobilityRideChatStartupSweep(genFebStorage);

  app.get("/api/mobility/rides/history", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id as string;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
      const roleRaw = String(req.query.role ?? "").trim().toLowerCase();
      const role = roleRaw === "driver" ? "driver" : roleRaw === "rider" ? "rider" : undefined;
      const { listMobilityRideHistoryForUser } = await import("./mobility-ride-history-store");
      const rides = await listMobilityRideHistoryForUser(userId, { limit, role });
      return res.json({ rides, total: rides.length });
    } catch (e: unknown) {
      console.error("[mobility] rides/history", e);
      return res.status(500).json({ message: "Error al cargar historial" });
    }
  });

  // GET /api/mobility/driver/pending-offer - Recupera una oferta pendiente (si existe) para el driver autenticado.
  app.get("/api/mobility/driver/pending-offer", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const p = pendingOfferByDriverId.get(driverUserId);
      if (!p) return res.json({ offer: null });
      if (Date.now() > p.expiresAt) {
        pendingOfferByDriverId.delete(driverUserId);
        return res.json({ offer: null });
      }
      const ride = rides.get(p.rideId);
      if (!ride || ride.status !== "searching") {
        pendingOfferByDriverId.delete(driverUserId);
        return res.json({ offer: null });
      }
      const classic = ride.currentOfferDriverId === driverUserId;
      const neg =
        !!ride.isNegotiated &&
        ride.offeredDriverIds.includes(driverUserId) &&
        (ride.negotiationExpiresAt == null || Date.now() <= ride.negotiationExpiresAt);
      if (!classic && !neg) {
        pendingOfferByDriverId.delete(driverUserId);
        return res.json({ offer: null });
      }
      const rider = await buildRiderPublic(ride.riderUserId);
      const expiresAt = ride.isNegotiated ? ride.negotiationExpiresAt ?? p.expiresAt : ride.offerExpiresAt;
      return res.json({
        offer: {
          rideId: ride.id,
          rider,
          start: ride.start,
          end: ride.end,
          routeGeometry: ride.routeGeometry,
          distanceM: ride.distanceM,
          durationSec: ride.durationSec,
          vehicleType: ride.vehicleType,
          paymentMethod: ride.paymentMethod,
          estimatedUsd: ride.estimatedUsd,
          suggestedUsd: ride.suggestedUsd ?? ride.estimatedUsd,
          petEnabled: ride.petEnabled,
          expiresAt,
          isNegotiated: !!ride.isNegotiated,
        },
      });
    } catch (e: any) {
      return res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  /**
   * Tablero de regateo (Car Go): listado dedicado para conductores verificados con vehículo compatible.
   * No confundir con GET /rides/market (flujo legacy distinto / marketplace).
   */
  app.get("/api/mobility/rides/negotiation-board", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const subscriptionOk = await driverGoSubscriptionAllowsOperation(driverUserId, req.user?.role);
      if (!subscriptionOk) {
        return res.status(403).json({ message: GO_DRIVER_SUBSCRIPTION_INACTIVE_MESSAGE });
      }
      const segmentRaw = typeof req.query?.vehicleSegment === "string" ? String(req.query.vehicleSegment).trim() : "";
      if (segmentRaw) {
        const allowed = await driverCanAccessNegotiationBoardSegment(driverUserId, segmentRaw, "cargo");
        if (!allowed) return res.status(403).json({ message: "No puedes ver esta vista de regateo" });
      }
      const now = Date.now();
      const out: Array<{
        rideId: string;
        createdAt: number;
        start: RideRecord["start"];
        end: RideRecord["end"];
        distanceM: number;
        durationSec: number;
        vehicleType: TaxiVehicleKind;
        paymentMethod: TaxiPaymentMethod;
        suggestedUsd: number;
        estimatedUsd: number;
        expiresAt: number;
        petEnabled: boolean;
        routeGeometry: GeoJsonObject | null;
        rider: Awaited<ReturnType<typeof buildRiderPublic>>;
        hasMyOffer: boolean;
        myOfferAmountUsd: number | null;
      }> = [];

      for (const ride of rides.values()) {
        if (!ride.isNegotiated || ride.status !== "searching" || ride.driverUserId != null) continue;
        if (ride.negotiationExpiresAt != null && now > ride.negotiationExpiresAt) continue;
        if (segmentRaw && ride.vehicleType !== segmentRaw) continue;
        const canSee = await driverPrimaryVehicleMatchesRideKind(
          driverUserId,
          ride.vehicleType,
          TAXI_TO_PROVIDER_VEHICLE,
          { petRideKind: "pet_car", requireVerified: false }
        );
        if (!canSee) continue;
        const rider = await buildRiderPublic(ride.riderUserId);
        const myOffer = (ride.offers ?? []).find((o) => o.driverUserId === driverUserId);
        out.push({
          rideId: ride.id,
          createdAt: ride.createdAt,
          start: ride.start,
          end: ride.end,
          distanceM: ride.distanceM,
          durationSec: ride.durationSec,
          vehicleType: ride.vehicleType,
          paymentMethod: ride.paymentMethod,
          suggestedUsd: ride.suggestedUsd ?? ride.estimatedUsd,
          estimatedUsd: ride.estimatedUsd,
          expiresAt: ride.negotiationExpiresAt ?? now + 60_000,
          petEnabled: ride.petEnabled,
          routeGeometry: ride.routeGeometry,
          rider,
          hasMyOffer: !!myOffer,
          myOfferAmountUsd: myOffer ? myOffer.amountUsd : null,
        });
      }

      out.sort((a, b) => a.createdAt - b.createdAt);
      return res.json({
        negotiationWindowMs: GO_NEGOTIATION_OFFER_WINDOW_MS,
        offers: out.slice(0, 100),
      });
    } catch (e: any) {
      return res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  // Market (legacy / distinto al tablero de regateo): rides con `marketVisibleUntil` vigente.
  app.get("/api/mobility/rides/market", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const now = Date.now();
      const base = Array.from(rides.values())
        .filter(
          (r) =>
            r.status === "searching" &&
            r.driverUserId == null &&
            typeof r.marketVisibleUntil === "number" &&
            r.marketVisibleUntil >= now
        )
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, 100)
        .map((r) => ({
          rideId: r.id,
          createdAt: r.createdAt,
          riderUserId: r.riderUserId,
          start: r.start,
          end: r.end,
          distanceM: r.distanceM,
          durationSec: r.durationSec,
          vehicleType: r.vehicleType,
          paymentMethod: r.paymentMethod,
          suggestedUsd: r.suggestedUsd ?? r.estimatedUsd,
          estimatedUsd: r.estimatedUsd,
          expiresAt: r.marketVisibleUntil,
          petEnabled: r.petEnabled,
        }));

      const enriched = await Promise.all(
        base.map(async (x) => {
          try {
            const rider = await buildRiderPublic(x.riderUserId);
            return { ...x, rider };
          } catch {
            return { ...x, rider: { name: "Usuario", profileImageUrl: null } };
          }
        })
      );

      res.json({ offers: enriched });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });
  const rateSchema = z.object({
    stars: z.number().min(1).max(5),
    target: z.enum(["driver", "rider"]),
  });

  const applyUserStars = async (userId: string, stars: number) => {
    const u = await genFebStorage.getUserById(userId);
    const currentAvg = typeof (u as any)?.rating === "number" ? (u as any).rating : Number((u as any)?.rating) || 5;
    const currentCount = typeof (u as any)?.ratingCount === "number" ? (u as any).ratingCount : Number((u as any)?.ratingCount) || 0;
    const nextCount = Math.max(0, currentCount) + 1;
    const nextAvg = (currentAvg * Math.max(0, currentCount) + stars) / nextCount;
    await genFebStorage.updateUser(userId, { rating: nextAvg, ratingCount: nextCount });
  };

  app.post("/api/mobility/rides/request", authenticateJWT, async (req: any, res) => {
    try {
      const riderUserId = req.user?.id as string;
      if (!riderUserId) return res.status(401).json({ message: "Unauthorized" });

      const body = req.body as {
        start: { lat: number; lon: number; label: string };
        end: { lat: number; lon: number; label: string };
        routeGeometry?: GeoJsonObject | null;
        distanceM: number;
        durationSec: number;
        vehicleType: TaxiVehicleKind;
        paymentMethod: TaxiPaymentMethod;
        /** Oferta del cliente */
        estimatedUsd: number;
        /** Referencia sugerida (tarifas Admin) */
        suggestedUsd?: number;
        /** Si el usuario editó manualmente la oferta en UI */
        offerEdited?: boolean;
        petEnabled?: boolean;
        isNegotiated?: boolean;
      };

      if (
        !body?.start ||
        !body?.end ||
        body.distanceM == null ||
        body.durationSec == null ||
        !body.vehicleType ||
        !body.paymentMethod
      ) {
        return res.status(400).json({ message: "Datos incompletos" });
      }

      if (body.paymentMethod !== "cash" && body.paymentMethod !== "bank_transfer") {
        return res.status(400).json({ message: "Método de pago no permitido para este servicio." });
      }

      const routeQuote = await resolveGoRideRouteQuote({
        start: body.start,
        end: body.end,
        vehicleType: body.vehicleType,
        module: "taxi",
        petEnabled: !!body.petEnabled,
      });

      let candidates = freshDriversForVehicle(body.vehicleType);
      candidates = rankDriversByNearest(body.start, candidates);

      const suggestedUsd = roundToCents(routeQuote.suggestedUsd);
      const clientOfferUsd = roundToCents(Math.max(0, safeNumber(body.estimatedUsd, 0)));
      const priceDiffers = Math.abs(clientOfferUsd - suggestedUsd) > 0.01;
      const negotiated = !!body.isNegotiated || !!body.offerEdited || priceDiffers;
      const offerUsd = negotiated ? clientOfferUsd : suggestedUsd;

      const id = crypto.randomUUID();
      const ride: RideRecord = {
        id,
        riderUserId,
        driverUserId: null,
        status: "searching",
        vehicleType: body.vehicleType,
        paymentMethod: body.paymentMethod,
        paymentConfirmed: negotiated ? false : true,
        estimatedUsd: offerUsd,
        suggestedUsd,
        isNegotiated: negotiated,
        offers: negotiated ? [] : undefined,
        offersArchive: negotiated ? [] : undefined,
        // El ride debe permanecer visible mientras el usuario sigue buscando.
        // El TTL 60s aplica a contraofertas, no al “market” del ride.
        marketVisibleUntil: undefined,
        counterOffers: undefined,
        distanceM: routeQuote.distanceM,
        durationSec: routeQuote.durationSec,
        start: body.start,
        end: body.end,
        routeGeometry: routeQuote.geometry ?? body.routeGeometry ?? null,
        petEnabled: !!body.petEnabled,
        createdAt: Date.now(),
        conversationId: null,
        offeredDriverIds: negotiated ? [] : candidates.map((c) => c.userId),
        offerIndex: 0,
        currentOfferDriverId: null,
        offerExpiresAt: null,
        driverSearchingClient: false,
        financialsSettled: false,
        declinedAtByDriverId: {},
      };
      rides.set(id, ride);

      const rider = await buildRiderPublic(riderUserId);
      const io = getIO();
      if (!io) return res.status(500).json({ message: "Socket no disponible" });

      io.to(`user:${riderUserId}`).emit("cargo:ride:searching", {
        rideId: id,
        candidateCount: candidates.length,
        isNegotiated: negotiated,
      });

      // Importante: NO cerramos la búsqueda automáticamente por TTL.
      // El pasajero debe seguir buscando hasta cancelar manualmente.
      // (Se evita el toast rojo "No hay drivers disponibles" cuando solo hubo rechazos o no había drivers en ese momento.)

      if (negotiated) {
        broadcastNegotiationInvites(io, ride, rider);
      } else if (ride.offeredDriverIds.length > 0) {
        await offerNextDriver(io, ride, rider);
      }

      res.status(201).json({ rideId: id, candidateCount: candidates.length, expiresInMs: GO_NEGOTIATION_OFFER_WINDOW_MS });
    } catch (e: any) {
      console.error("[mobility] request", e);
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  app.post("/api/mobility/rides/:rideId/negotiation/driver-offer", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = String(req.params.rideId);
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (!ride.isNegotiated || ride.status !== "searching" || ride.driverUserId != null) {
        return res.status(409).json({ message: "Este viaje no acepta ofertas ahora" });
      }
      const vehicleOk = await driverPrimaryVehicleMatchesRideKind(
        driverUserId,
        ride.vehicleType,
        TAXI_TO_PROVIDER_VEHICLE,
        { petRideKind: "pet_car", requireVerified: false }
      );
      if (!vehicleOk) {
        return res.status(403).json({ message: "No puedes ofertar en este servicio" });
      }
      const provider = await catalogService.getProviderByUserId(driverUserId);
      if (!provider || (provider as { isVerified?: boolean }).isVerified !== true) {
        return res.status(403).json({
          message: "Necesitas el perfil profesional verificado para enviar ofertas de regateo.",
        });
      }
      const subscriptionOk = await driverGoSubscriptionAllowsOperation(driverUserId, req.user?.role);
      if (!subscriptionOk) {
        return res.status(403).json({ message: GO_DRIVER_SUBSCRIPTION_INACTIVE_MESSAGE });
      }
      if (ride.negotiationExpiresAt != null && Date.now() > ride.negotiationExpiresAt) {
        return res.status(409).json({ message: "La ventana de ofertas expiró" });
      }
      if (driverIsBusyCrossModule(driverUserId)) {
        return res.status(409).json({ message: "Estás en servicio. No puedes ofertar ahora." });
      }
      const amt = roundToCents(Math.max(0, safeNumber((req.body as any)?.amountUsd, 0)));
      if (!Number.isFinite(amt)) return res.status(400).json({ message: "Monto inválido" });

      const driverFull = await buildDriverPublic(driverUserId);
      const driver = driverFull as unknown as NegotiationDriverSnapshot;
      const now = Date.now();
      ride.offers = ride.offers ?? [];
      const idx = ride.offers.findIndex((o) => o.driverUserId === driverUserId);
      if (idx >= 0) {
        return res.status(409).json({ message: DRIVER_NEGOTIATION_OFFER_ALREADY_SENT_MESSAGE });
      }
      const entry: NegotiationDriverOffer = {
        driverUserId,
        amountUsd: amt,
        createdAt: now,
        updatedAt: now,
        driver,
      };
      ride.offers.push(entry);

      if (!ride.offeredDriverIds.includes(driverUserId)) {
        ride.offeredDriverIds.push(driverUserId);
      }

      // El conductor ya "atendió" esta invitación: evitar que vuelva a aparecer como pendiente.
      const p = pendingOfferByDriverId.get(driverUserId);
      if (p?.rideId === ride.id) pendingOfferByDriverId.delete(driverUserId);

      const io = getIO();
      if (io) emitNegotiationOffersUpdated(io, ride);
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[mobility] negotiation driver-offer", e);
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  app.delete("/api/mobility/rides/:rideId/negotiation/offers/:driverId", authenticateJWT, async (req: any, res) => {
    try {
      const riderUserId = req.user?.id as string;
      if (!riderUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = String(req.params.rideId);
      const driverId = String(req.params.driverId);
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (ride.riderUserId !== riderUserId) return res.status(403).json({ message: "Sin acceso" });
      if (!ride.isNegotiated || ride.status !== "searching") {
        return res.status(409).json({ message: "No se puede modificar en este estado" });
      }
      ride.offers = (ride.offers ?? []).filter((o) => o.driverUserId !== driverId);
      const io = getIO();
      if (io) {
        emitNegotiationOffersUpdated(io, ride);
        io.to(`user:${driverId}`).emit("cargo:ride:negotiation:offer_removed", {
          rideId,
          reason: NEGOTIATION_OFFER_REMOVED_REASON_RIDER_REJECTED,
        });
      }
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[mobility] negotiation remove offer", e);
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  /** El conductor cierra la invitación al regateo sin enviar monto (no usa POST /respond). */
  app.post("/api/mobility/rides/:rideId/negotiation/decline-invite", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = String(req.params.rideId);
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (!ride.isNegotiated || ride.status !== "searching" || ride.driverUserId != null) {
        return res.status(409).json({ message: "Este viaje no acepta esta acción ahora" });
      }
      if (!ride.offeredDriverIds.includes(driverUserId)) {
        return res.status(403).json({ message: "No estás invitado a este servicio" });
      }
      ride.declinedAtByDriverId = ride.declinedAtByDriverId ?? {};
      ride.declinedAtByDriverId[driverUserId] = Date.now();
      ride.offeredDriverIds = ride.offeredDriverIds.filter((id) => id !== driverUserId);
      const p = pendingOfferByDriverId.get(driverUserId);
      if (p?.rideId === ride.id) pendingOfferByDriverId.delete(driverUserId);
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[mobility] negotiation decline-invite", e);
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  app.post("/api/mobility/rides/:rideId/negotiation/accept/:driverId", authenticateJWT, async (req: any, res) => {
    try {
      const riderUserId = req.user?.id as string;
      if (!riderUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = String(req.params.rideId);
      const driverId = String(req.params.driverId);
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (ride.riderUserId !== riderUserId) return res.status(403).json({ message: "Sin acceso" });
      if (!ride.isNegotiated || ride.status !== "searching" || ride.driverUserId != null) {
        return res.status(409).json({ message: "Este viaje ya no está disponible" });
      }
      const row = (ride.offers ?? []).find((o) => o.driverUserId === driverId);
      if (!row) return res.status(409).json({ message: RIDER_DRIVER_NOT_AVAILABLE_MESSAGE });
      if (driverIsBusyCrossModule(driverId)) {
        return res.status(409).json({ message: RIDER_DRIVER_NOT_AVAILABLE_MESSAGE });
      }

      ride.offersArchive = ride.offersArchive ?? [];
      ride.offersArchive.push({
        archivedAt: Date.now(),
        reason: "accepted",
        acceptedDriverUserId: driverId,
        offersSnapshot: [...(ride.offers ?? [])],
      });
      ride.offers = [];
      ride.estimatedUsd = roundToCents(row.amountUsd);
      ride.driverUserId = driverId;
      ride.status = "matched";
      ride.isNegotiated = true;
      ride.paymentConfirmed = false;
      await applyDriverFareToRide(ride, driverId, "taxi");
      clearRideTimers(ride.id);

      const io = getIO();
      if (!io) return res.status(500).json({ message: "Socket no disponible" });

      withdrawDriverNegotiationOffersEverywhere(io, driverId, rideId);

      const notifyTaken = new Set<string>();
      for (const o of ride.offersArchive[ride.offersArchive.length - 1]!.offersSnapshot) {
        notifyTaken.add(o.driverUserId);
      }
      for (const oid of ride.offeredDriverIds) notifyTaken.add(oid);

      const driver = await buildDriverPublic(driverId);
      const pres = onlineDrivers.get(driverId);
      const driverLat = pres?.lat;
      const driverLon = pres?.lon;
      let conversationId: number | null = null;
      try {
        conversationId = await ensureMobilityRideConversation(genFebStorage, {
          rideId: ride.id,
          module: "taxi",
          riderUserId: ride.riderUserId,
          driverUserId: driverId,
          hintedConversationId: ride.conversationId,
        });
        ride.conversationId = conversationId;
      } catch (ce) {
        console.error("[mobility] negotiation accept conversation", ce);
      }

      const rider = await buildRiderPublic(ride.riderUserId);
      io.to(`user:${ride.riderUserId}`).emit("cargo:ride:matched", {
        rideId,
        driver,
        driverLat,
        driverLon,
        conversationId,
        estimatedUsd: ride.estimatedUsd,
        isNegotiated: !!ride.isNegotiated,
      });
      io.to(`user:${driverId}`).emit("cargo:ride:accepted", { rideId, rider, conversationId });

      for (const uid of notifyTaken) {
        if (uid === driverId) continue;
        io.to(`user:${uid}`).emit("cargo:ride:taken", { rideId });
        pendingOfferByDriverId.delete(uid);
      }
      pendingOfferByDriverId.delete(driverId);

      try {
        const pth = getUserActivePath(String(ride.riderUserId));
        if (!pth || (!pth.startsWith("/go/taxi") && !pth.startsWith("/go/cargo"))) {
          void notificationService.sendPushToUser(ride.riderUserId, {
            title: "Servicio de taxi",
            body: "Tu viaje fue aceptado. Abre para ver a tu conductor.",
            data: { url: "/go/taxi", type: "cargo_ride_matched", rideId },
          });
        }
      } catch {}

      res.json({ ok: true, accepted: true, rideId, conversationId });
    } catch (e: any) {
      console.error("[mobility] negotiation accept", e);
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  app.post("/api/mobility/rides/:rideId/respond", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const subscriptionOk = await driverGoSubscriptionAllowsOperation(driverUserId, req.user?.role);
      if (!subscriptionOk) {
        return res.status(403).json({ message: GO_DRIVER_SUBSCRIPTION_INACTIVE_MESSAGE });
      }
      const rideId = req.params.rideId as string;
      const accept = !!req.body?.accept;
      const ride = rides.get(rideId);
      if (!ride) {
        if (!accept) {
          pendingOfferByDriverId.delete(driverUserId);
          return res.json({ ok: true, accepted: false, alreadyResolved: true });
        }
        return res.status(404).json({ message: "Viaje no encontrado" });
      }
      if (ride.isNegotiated) {
        return res.status(409).json({ message: "Este servicio es por regateo. Envía tu monto con la opción de regateo." });
      }
      const io = getIO();
      if (!io) return res.status(500).json({ message: "Socket no disponible" });

      if (!accept) {
        if (ride.status !== "searching" || ride.isNegotiated) {
          pendingOfferByDriverId.delete(driverUserId);
          return res.json({ ok: true, accepted: false, alreadyResolved: true });
        }
        if (driverCanDeclineClassicOffer(ride, driverUserId, rideId)) {
          releaseClassicOfferFromDriver(rideId, ride, driverUserId);
          try {
            const rider = await buildRiderPublic(ride.riderUserId);
            await offerNextDriver(io, ride, rider);
          } catch (declineErr) {
            console.error("[mobility] decline offerNextDriver", declineErr);
          }
        } else {
          pendingOfferByDriverId.delete(driverUserId);
        }
        return res.json({ ok: true, accepted: false });
      }

      if (ride.status !== "searching") {
        return res.status(409).json({ message: "Este viaje ya no está disponible" });
      }
      if (ride.currentOfferDriverId !== driverUserId) {
        return res.status(409).json({ message: "La oferta expiró o fue reasignada" });
      }

      /** Carrera: solo un conductor gana. */
      if (ride.driverUserId != null) {
        return res.status(409).json({ message: "Otro conductor ya tomó este viaje" });
      }
      if (driverIsBusyCrossModule(driverUserId)) {
        ride.declinedAtByDriverId = ride.declinedAtByDriverId ?? {};
        ride.declinedAtByDriverId[driverUserId] = Date.now();
        ride.currentOfferDriverId = null;
        ride.offerExpiresAt = null;
        const rider = await buildRiderPublic(ride.riderUserId);
        await offerNextDriver(io, ride, rider);
        return res.status(409).json({ message: "Estás en servicio. No puedes aceptar otra oferta." });
      }
      ride.driverUserId = driverUserId;
      ride.status = "matched";
      ride.currentOfferDriverId = null;
      ride.offerExpiresAt = null;
      clearRideTimers(ride.id);
      pendingOfferByDriverId.delete(driverUserId);

      withdrawDriverNegotiationOffersEverywhere(io, driverUserId, rideId);

      if (!ride.isNegotiated) {
        await applyDriverFareToRide(ride, driverUserId, "taxi");
      }

      res.json({ ok: true, accepted: true, rideId, conversationId: ride.conversationId ?? null });

      void (async () => {
        try {
          const driver = await buildDriverPublic(driverUserId);
          const pres = onlineDrivers.get(driverUserId);
          const driverLat = pres?.lat;
          const driverLon = pres?.lon;
          let conversationId: number | null = null;
          try {
            conversationId = await ensureMobilityRideConversation(genFebStorage, {
              rideId: ride.id,
              module: "taxi",
              riderUserId: ride.riderUserId,
              driverUserId,
              hintedConversationId: ride.conversationId,
            });
            ride.conversationId = conversationId;
          } catch (ce) {
            console.error("[mobility] ensureMobilityRideConversation", ce);
          }

          const rider = await buildRiderPublic(ride.riderUserId);

          io.to(`user:${ride.riderUserId}`).emit("cargo:ride:matched", {
            rideId,
            driver,
            driverLat,
            driverLon,
            conversationId,
            estimatedUsd: ride.estimatedUsd,
            isNegotiated: !!ride.isNegotiated,
          });

          try {
            const pth = getUserActivePath(String(ride.riderUserId));
            if (!pth || (!pth.startsWith("/go/taxi") && !pth.startsWith("/go/cargo"))) {
              void notificationService.sendPushToUser(ride.riderUserId, {
                title: "Servicio de taxi",
                body: "Tu viaje fue aceptado. Abre para ver a tu conductor.",
                data: { url: "/go/taxi", type: "cargo_ride_matched", rideId },
              });
            }
          } catch {}

          for (const oid of ride.offeredDriverIds) {
            if (oid === driverUserId) continue;
            io.to(`user:${oid}`).emit("cargo:ride:taken", { rideId });
          }

          io.to(`user:${driverUserId}`).emit("cargo:ride:accepted", {
            rideId,
            rider,
            conversationId,
          });
        } catch (finalizeErr) {
          console.error("[mobility] finalize accept", finalizeErr);
        }
      })();
      return;
    } catch (e: any) {
      console.error("[mobility] respond", e);
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  // Aceptar desde el “market” (ofertas por negociar):
  // Para evitar carreras (2 drivers aceptando a la vez), NO hacemos match directo.
  // En su lugar, enviamos una "oferta" al usuario y el usuario decide aceptar.
  app.post("/api/mobility/rides/:rideId/market/accept", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = req.params.rideId as string;
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (ride.status !== "searching") return res.status(409).json({ message: "Este viaje ya no está disponible" });
      if (ride.driverUserId != null) return res.status(409).json({ message: "Otro conductor ya tomó este viaje" });
      const now = Date.now();
      if (typeof ride.marketVisibleUntil === "number" && ride.marketVisibleUntil < now) {
        return res.status(409).json({ message: "La oferta expiró" });
      }
      if (driverIsBusyCrossModule(driverUserId)) {
        return res.status(409).json({ message: "Estás en servicio. No puedes aceptar otra oferta." });
      }
      const io = getIO();
      if (!io) return res.status(500).json({ message: "Socket no disponible" });

      // Registrar como "contraoferta" por el MISMO monto del cliente (aceptando su oferta).
      ride.counterOffers = ride.counterOffers ?? {};
      const expiresAt = Date.now() + 60_000;
      ride.counterOffers[driverUserId] = { amountUsd: ride.estimatedUsd, expiresAt };

      const driver = await buildDriverPublic(driverUserId);
      io.to(`user:${ride.riderUserId}`).emit("cargo:ride:counteroffer", {
        rideId,
        driver,
        amountUsd: ride.estimatedUsd,
        expiresAt,
      });

      res.json({ ok: true, proposed: true });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  // Contraoferta del driver al usuario (TTL 60s).
  app.post("/api/mobility/rides/:rideId/counteroffer", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = req.params.rideId as string;
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (ride.status !== "searching") return res.status(409).json({ message: "Este viaje ya no está disponible" });
      if (ride.driverUserId != null) return res.status(409).json({ message: "Otro conductor ya tomó este viaje" });
      const now = Date.now();
      if (typeof ride.marketVisibleUntil === "number" && ride.marketVisibleUntil < now) {
        return res.status(409).json({ message: "La oferta expiró" });
      }
      if (driverIsBusyCrossModule(driverUserId)) {
        return res.status(409).json({ message: "Estás en servicio. No puedes contraofertar ahora." });
      }
      const amt = roundToCents(Math.max(0, safeNumber((req.body as any)?.amountUsd, 0)));
      if (!Number.isFinite(amt)) return res.status(400).json({ message: "Monto inválido" });
      ride.counterOffers = ride.counterOffers ?? {};
      const expiresAt = Date.now() + 60_000;
      ride.counterOffers[driverUserId] = { amountUsd: amt, expiresAt };

      const io = getIO();
      if (io) {
        const driver = await buildDriverPublic(driverUserId);
        io.to(`user:${ride.riderUserId}`).emit("cargo:ride:counteroffer", {
          rideId,
          driver,
          amountUsd: amt,
          expiresAt,
        });
      }
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  // Aceptar contraoferta (usuario): al aceptar, queda asignado ese driver inmediatamente.
  app.post("/api/mobility/rides/:rideId/counteroffer/:driverId/accept", authenticateJWT, async (req: any, res) => {
    try {
      const riderUserId = req.user?.id as string;
      if (!riderUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = req.params.rideId as string;
      const driverId = req.params.driverId as string;
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (ride.riderUserId !== riderUserId) return res.status(403).json({ message: "Sin acceso" });
      if (ride.status !== "searching") return res.status(409).json({ message: "Este viaje ya no está disponible" });
      if (ride.driverUserId != null) return res.status(409).json({ message: "Otro conductor ya tomó este viaje" });

      const co = ride.counterOffers?.[driverId];
      if (!co) return res.status(404).json({ message: "Contraoferta no encontrada" });
      if (Date.now() > co.expiresAt) return res.status(409).json({ message: "La contraoferta expiró" });
      if (driverIsBusyCrossModule(driverId)) {
        return res.status(409).json({ message: RIDER_DRIVER_NOT_AVAILABLE_MESSAGE });
      }

      // Aplicar monto final
      ride.estimatedUsd = roundToCents(Math.max(0, safeNumber(co.amountUsd, ride.estimatedUsd)));
      ride.driverUserId = driverId;
      ride.status = "matched";
      ride.marketVisibleUntil = undefined;
      ride.counterOffers = undefined;
      clearRideTimers(ride.id);

      const io = getIO();
      if (!io) return res.status(500).json({ message: "Socket no disponible" });

      withdrawDriverNegotiationOffersEverywhere(io, driverId, rideId);

      const driver = await buildDriverPublic(driverId);
      const pres = onlineDrivers.get(driverId);
      const driverLat = pres?.lat;
      const driverLon = pres?.lon;
      let conversationId: number | null = null;
      try {
        conversationId = await ensureMobilityRideConversation(genFebStorage, {
          rideId: ride.id,
          module: "taxi",
          riderUserId: ride.riderUserId,
          driverUserId: driverId,
          hintedConversationId: ride.conversationId,
        });
        ride.conversationId = conversationId;
      } catch {}

      const rider = await buildRiderPublic(ride.riderUserId);
      io.to(`user:${ride.riderUserId}`).emit("cargo:ride:matched", {
        rideId,
        driver,
        driverLat,
        driverLon,
        conversationId,
        estimatedUsd: ride.estimatedUsd,
        isNegotiated: !!ride.isNegotiated,
      });
      io.to(`user:${driverId}`).emit("cargo:ride:accepted", { rideId, rider, conversationId });

      res.json({ ok: true, accepted: true, rideId, conversationId });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  app.post("/api/mobility/rides/:rideId/cancel", authenticateJWT, async (req: any, res) => {
    try {
      const uid = req.user?.id as string;
      if (!uid) return res.status(401).json({ message: "Unauthorized" });
      const rideId = req.params.rideId as string;
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });

      const isRider = ride.riderUserId === uid;
      const isDriver = ride.driverUserId === uid;
      if (!isRider && !isDriver) return res.status(403).json({ message: "Sin acceso" });

      if (ride.status === "cancelled" || ride.status === "expired") {
        return res.status(409).json({ message: "Este viaje ya no está activo" });
      }

      if (isDriver && ride.status === "searching") {
        return res.status(403).json({ message: "No puedes cancelar este viaje" });
      }

      if (
        ride.status !== "searching" &&
        ride.status !== "matched" &&
        ride.status !== "in_progress"
      ) {
        return res.status(409).json({ message: "No se puede cancelar en este estado" });
      }

      const io = getIO();
      if (!io) return res.status(500).json({ message: "Socket no disponible" });

      const prevStatus = ride.status;
      clearRideTimers(ride.id);
      ride.status = "cancelled";
      ride.currentOfferDriverId = null;
      ride.offerExpiresAt = null;

      const cancelledBy: "rider" | "driver" = isDriver ? "driver" : "rider";
      emitRideCancelled(io, ride, cancelledBy, prevStatus);
      archiveCargoRideCancelled(ride, cancelledBy);

      if (ride.conversationId != null && ride.driverUserId != null) {
        try {
          await onMobilityRideChatCancelled(genFebStorage, {
            conversationId: Number(ride.conversationId),
            riderUserId: ride.riderUserId,
            driverUserId: ride.driverUserId,
          });
        } catch (e) {
          console.error("[mobility] ride chat cancelled", e);
        }
      }

      res.json({ ok: true, rideId, cancelledBy });
    } catch (e: any) {
      console.error("[mobility] cancel", e);
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  app.post("/api/mobility/rides/:rideId/start", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = req.params.rideId as string;
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (ride.driverUserId !== driverUserId) return res.status(403).json({ message: "Sin acceso" });
      if (ride.status !== "matched") return res.status(409).json({ message: "No se puede iniciar este viaje" });

      const io = getIO();
      if (!io) return res.status(500).json({ message: "Socket no disponible" });

      ride.status = "in_progress";
      if (ride.conversationId != null) {
        try {
          await onMobilityRideChatStarted(genFebStorage, ride.conversationId);
        } catch (se) {
          console.error("[mobility] ride chat started", se);
        }
        try {
          await genFebStorage.createMessage({
            conversationId: ride.conversationId,
            senderId: CHAT_SYSTEM_SENDER_ID,
            content: "Viaje iniciado. Podéis seguir coordinando por este chat durante el trayecto.",
            type: "system",
            status: "sent",
          });
        } catch (me) {
          console.error("[mobility] seed chat message", me);
        }
      }
      io.to(`user:${ride.riderUserId}`).emit("cargo:ride:started", { rideId });
      io.to(`user:${driverUserId}`).emit("cargo:ride:started", { rideId });
      try {
        const pth = getUserActivePath(String(ride.riderUserId));
        if (!pth || (!pth.startsWith("/go/taxi") && !pth.startsWith("/go/cargo"))) {
          void notificationService.sendPushToUser(ride.riderUserId, {
            title: "Servicio de taxi",
            body: "Tu viaje inició.",
            data: { url: "/go/taxi", type: "cargo_ride_started", rideId },
          });
        }
      } catch {}
      res.json({ ok: true, rideId });
    } catch (e: any) {
      console.error("[mobility] start", e);
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  // POST /api/mobility/rides/:rideId/search-client - Driver inicia búsqueda del cliente (notifica al pasajero).
  app.post("/api/mobility/rides/:rideId/search-client", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = req.params.rideId as string;
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (ride.driverUserId !== driverUserId) return res.status(403).json({ message: "Sin acceso" });
      if (ride.status !== "matched") return res.status(409).json({ message: "No se puede buscar en este estado" });
      if (ride.driverSearchingClient) {
        return res.json({ ok: true, rideId, alreadySearching: true });
      }

      const io = getIO();
      if (!io) return res.status(500).json({ message: "Socket no disponible" });

      ride.driverSearchingClient = true;
      io.to(`user:${ride.riderUserId}`).emit("cargo:ride:driver_searching", { rideId });
      io.to(`user:${driverUserId}`).emit("cargo:ride:driver_searching", { rideId });
      void appendMobilityRideSystemMessage(
        ride.conversationId,
        "El conductor inició la búsqueda para coordinar contigo el punto de encuentro.",
      );
      try {
        void notificationService.sendPushToUser(ride.riderUserId, {
          title: "Servicio de taxi",
          body: "Tu conductor inició la búsqueda para llegar hasta ti.",
          data: { url: "/go/taxi", type: "cargo_driver_searching", rideId },
        });
      } catch {}
      res.json({ ok: true, rideId });
    } catch (e: any) {
      console.error("[mobility] search-client", e);
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  app.post("/api/mobility/rides/:rideId/confirm-payment", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = req.params.rideId as string;
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (ride.driverUserId !== driverUserId) return res.status(403).json({ message: "Sin acceso" });
      if (ride.status !== "in_progress") return res.status(409).json({ message: "El viaje aún no está iniciado" });

      const io = getIO();
      if (!io) return res.status(500).json({ message: "Socket no disponible" });

      ride.paymentConfirmed = true;
      io.to(`user:${ride.riderUserId}`).emit("cargo:ride:payment_confirmed", { rideId });
      io.to(`user:${driverUserId}`).emit("cargo:ride:payment_confirmed", { rideId });
      res.json({ ok: true, rideId });
    } catch (e: any) {
      console.error("[mobility] confirm-payment", e);
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  app.post("/api/mobility/rides/:rideId/complete", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = req.params.rideId as string;
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (ride.driverUserId !== driverUserId) return res.status(403).json({ message: "Sin acceso" });
      if (ride.status !== "in_progress") return res.status(409).json({ message: "El viaje no está en curso" });

      if (ride.financialsSettled) {
        return res.json({ ok: true, rideId, alreadySettled: true });
      }

      ride.financialsSettled = true;

      const io = getIO();
      if (!io) return res.status(500).json({ message: "Socket no disponible" });

      ride.status = "expired";
      void persistMobilityRideToHistory(ride, "cargo", "completed");
      void bumpGoUserCompletedTrips(ride.riderUserId);
      void bumpGoUserCompletedTrips(driverUserId);
      io.to(`user:${ride.riderUserId}`).emit("cargo:ride:completed", { rideId });
      io.to(`user:${driverUserId}`).emit("cargo:ride:completed", { rideId });

      if (ride.conversationId != null && ride.driverUserId) {
        try {
          await onMobilityRideChatCompleted(genFebStorage, {
            conversationId: Number(ride.conversationId),
            riderUserId: ride.riderUserId,
            driverUserId,
          });
        } catch (e) {
          console.error("[mobility] ride chat completed", e);
        }
      }
      try {
        const pth = getUserActivePath(String(ride.riderUserId));
        if (!pth || (!pth.startsWith("/go/taxi") && !pth.startsWith("/go/cargo"))) {
          void notificationService.sendPushToUser(ride.riderUserId, {
            title: "Servicio de taxi",
            body: "Tu viaje terminó.",
            data: { url: "/go/taxi", type: "cargo_ride_completed", rideId },
          });
        }
      } catch {}
      res.json({ ok: true, rideId });
    } catch (e: any) {
      console.error("[mobility] complete", e);
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  // POST /api/mobility/rides/:rideId/rate - Calificar al otro participante (Taxi)
  app.post("/api/mobility/rides/:rideId/rate", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id as string;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = req.params.rideId as string;
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      const body = rateSchema.parse(req.body);

      const isRider = ride.riderUserId === userId;
      const isDriver = ride.driverUserId === userId;
      if (!isRider && !isDriver) return res.status(403).json({ message: "Sin acceso" });

      const targetUserId =
        body.target === "driver" ? ride.driverUserId : ride.riderUserId;
      if (!targetUserId) return res.status(409).json({ message: "Aún no hay destinatario para calificar" });

      // Solo permitir calificar al otro (no a ti mismo).
      if (targetUserId === userId) return res.status(400).json({ message: "Destino inválido" });

      // Guardar flags en el ride (memoria) para evitar doble envío.
      (ride as any).ratedByRider = (ride as any).ratedByRider ?? false;
      (ride as any).ratedByDriver = (ride as any).ratedByDriver ?? false;
      if (isRider && (ride as any).ratedByRider) return res.status(409).json({ message: "Ya calificaste este viaje" });
      if (isDriver && (ride as any).ratedByDriver) return res.status(409).json({ message: "Ya calificaste este viaje" });

      await applyUserStars(String(targetUserId), body.stars);
      if (isRider) (ride as any).ratedByRider = true;
      if (isDriver) (ride as any).ratedByDriver = true;

      return res.json({ ok: true });
    } catch (e: any) {
      if (e instanceof z.ZodError) return res.status(400).json({ message: "Datos inválidos", errors: e.errors });
      console.error("[mobility] rate", e);
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  app.get("/api/mobility/rides/:rideId", authenticateJWT, async (req: any, res) => {
    try {
      const uid = req.user?.id as string;
      const ride = rides.get(req.params.rideId as string);
      if (!ride) return res.status(404).json({ message: "No encontrado" });
      if (ride.riderUserId !== uid && ride.driverUserId !== uid) {
        return res.status(403).json({ message: "Sin acceso" });
      }
      const rider = await buildRiderPublic(ride.riderUserId);
      const driver = ride.driverUserId ? await buildDriverPublic(ride.driverUserId) : null;
      res.json({
        id: ride.id,
        status: ride.status,
        riderUserId: ride.riderUserId,
        driverUserId: ride.driverUserId,
        conversationId: ride.conversationId,
        driverSearchingClient: !!ride.driverSearchingClient,
        paymentMethod: ride.paymentMethod,
        paymentConfirmed: ride.paymentConfirmed,
        vehicleType: ride.vehicleType,
        petEnabled: ride.petEnabled,
        estimatedUsd: ride.estimatedUsd,
        suggestedUsd: ride.suggestedUsd ?? ride.estimatedUsd,
        isNegotiated: !!ride.isNegotiated,
        offers:
          uid === ride.riderUserId && ride.status === "searching" && ride.isNegotiated ? ride.offers ?? [] : undefined,
        distanceM: ride.distanceM,
        durationSec: ride.durationSec,
        start: ride.start,
        end: ride.end,
        routeGeometry: ride.routeGeometry,
        rider,
        driver,
      });
    } catch (e: any) {
      console.error("[mobility] get-ride", e);
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });
}

export function registerCargoMobilitySocket(io: SocketIOServer) {
  io.on("connection", (socket: Socket) => {
    const user = socket.data.user as { id: string } | undefined;
    if (!user?.id) return;

    socket.on(
      "cargo:driver:presence",
      (data: { receiving: boolean; vehicleType: string; isPetFriendly?: boolean; lat: number; lon: number }) => {
        if (!data) return;
        if (!data.receiving) {
          if (mobilityDriverInActiveRide(user.id)) {
            void (async () => {
              const prev = onlineDrivers.get(user.id);
              const lat = Number(data.lat);
              const lon = Number(data.lon);
              const posOk =
                Number.isFinite(lat) &&
                Number.isFinite(lon) &&
                Math.abs(lat) <= 90 &&
                Math.abs(lon) <= 180 &&
                (Math.abs(lat) > 1e-4 || Math.abs(lon) > 1e-4);
              const provider = prev ? null : await catalogService.getProviderByUserId(user.id);
              const dispatchCompanyId =
                prev?.dispatchCompanyId ??
                normalizeDispatchCompanyId(
                  (provider as { dispatchCompanyId?: unknown } | null)?.dispatchCompanyId,
                );
              const next: DriverPresence = {
                userId: user.id,
                vehicleType: (data.vehicleType || prev?.vehicleType || "car").trim(),
                isPetFriendly: !!data.isPetFriendly || !!prev?.isPetFriendly,
                lat: posOk ? lat : (prev?.lat ?? 0),
                lon: posOk ? lon : (prev?.lon ?? 0),
                updatedAt: Date.now(),
                dispatchCompanyId,
                idleOnMapDuringRide: true,
              };
              if (!posOk && !prev) return;
              onlineDrivers.set(user.id, next);
              emitCentralFleetUpdate(getIO(), next, CENTRAL_FLEET_IN_SERVICE_RECEIVING);
            })();
            return;
          }
          if (driverIsBusyCrossModule(user.id)) {
            const prev = onlineDrivers.get(user.id);
            if (prev && !prev.idleOnMapDuringRide) {
              onlineDrivers.delete(user.id);
              emitCentralFleetUpdate(
                getIO(),
                { ...prev, updatedAt: Date.now() },
                { receivingTaxi: false },
              );
            }
            return;
          }
          const prev = onlineDrivers.get(user.id);
          onlineDrivers.delete(user.id);
          if (prev) emitCentralFleetUpdate(getIO(), { ...prev, updatedAt: Date.now() }, { offline: true, receivingStopped: true });
          return;
        }
        void (async () => {
          const subscriptionOk = await driverGoSubscriptionAllowsOperation(user.id, (user as { role?: string }).role);
          if (!subscriptionOk) {
            onlineDrivers.delete(user.id);
            return;
          }
        const provider = await catalogService.getProviderByUserId(user.id);
        const pres: DriverPresence = {
          userId: user.id,
          vehicleType: (data.vehicleType || "").trim(),
          isPetFriendly: !!data.isPetFriendly,
          lat: data.lat,
          lon: data.lon,
          updatedAt: Date.now(),
          dispatchCompanyId: normalizeDispatchCompanyId(
            (provider as { dispatchCompanyId?: unknown } | null)?.dispatchCompanyId,
          ),
          idleOnMapDuringRide: false,
        };
        onlineDrivers.set(user.id, pres);
        emitCentralFleetUpdate(getIO(), pres, {
          receiving: true,
          receivingTaxi: true,
          receivingDelivery: false,
        });

        // Si hay rides en búsqueda, ofrecer también a drivers que se ponen online después.
        void (async () => {
          try {
            const now = Date.now();
            for (const ride of rides.values()) {
              if (ride.status !== "searching") continue;
              if (!rideWantsPresence(ride, pres)) continue;
              // Regateo: no se empuja oferta por presencia; el conductor usa GET /negotiation-board.
              if (ride.isNegotiated) continue;
              // Rides "por negociar" (market) no se ofertan automáticamente al activar presencia.
              if (typeof ride.marketVisibleUntil === "number") continue;
              const inserted = insertDriverByDistance(ride, user.id);
              if (!inserted) continue;

              // Si no hay oferta activa, empezamos a ofrecer al siguiente (el más cercano disponible).
              if (!ride.currentOfferDriverId) {
                const rider = await buildRiderPublic(ride.riderUserId);
                await offerNextDriver(io, ride, rider);
              }
            }
          } catch (e) {
            console.error("[mobility] presence offer", e);
          }
        })();
        })();
      }
    );

    socket.on("cargo:ride:location", (data: { rideId: string; lat: number; lon: number }) => {
      if (!data?.rideId) return;
      const ride = rides.get(data.rideId);
      if (!ride || ride.driverUserId !== user.id || (ride.status !== "matched" && ride.status !== "in_progress"))
        return;
      const lat = Number(data.lat);
      const lon = Number(data.lon);
      if (
        ride.status === "matched" &&
        !ride.riderNotifiedDriverNearPickup &&
        Number.isFinite(lat) &&
        Number.isFinite(lon)
      ) {
        const m = haversineM(ride.start, { lat, lon });
        if (m <= DRIVER_NEAR_PICKUP_RADIUS_M) {
          ride.riderNotifiedDriverNearPickup = true;
          void appendMobilityRideSystemMessage(
            ride.conversationId,
            "Tu conductor está muy cerca del punto de encuentro.",
          );
          try {
            void notificationService.sendPushToUser(ride.riderUserId, {
              title: "Servicio de taxi",
              body: "Tu conductor está cerca de tu ubicación de recogida.",
              data: { url: "/go/taxi", type: "cargo_driver_near_pickup", rideId: data.rideId },
            });
          } catch {}
        }
      }
      io.to(`user:${ride.riderUserId}`).emit("cargo:ride:driver_location", {
        rideId: data.rideId,
        lat: data.lat,
        lon: data.lon,
      });
      void (async () => {
        let presRow = onlineDrivers.get(user.id);
        if (
          !presRow &&
          Number.isFinite(lat) &&
          Number.isFinite(lon) &&
          (ride.status === "matched" || ride.status === "in_progress")
        ) {
          const provider = await catalogService.getProviderByUserId(user.id);
          const vehicle = await genFebStorage.getPrimaryVehicleByUserId(user.id);
          presRow = {
            userId: user.id,
            vehicleType: String(vehicle?.vehicle_type ?? ride.vehicleType ?? "car").trim(),
            isPetFriendly: !!ride.petEnabled,
            lat,
            lon,
            updatedAt: Date.now(),
            dispatchCompanyId: normalizeDispatchCompanyId(
              (provider as { dispatchCompanyId?: unknown } | null)?.dispatchCompanyId,
            ),
            idleOnMapDuringRide: true,
          };
          onlineDrivers.set(user.id, presRow);
        }
        if (
          presRow &&
          Number.isFinite(lat) &&
          Number.isFinite(lon) &&
          (ride.status === "matched" || ride.status === "in_progress")
        ) {
          const next: DriverPresence = { ...presRow, lat, lon, updatedAt: Date.now(), idleOnMapDuringRide: true };
          onlineDrivers.set(user.id, next);
          emitCentralFleetUpdate(getIO(), next, CENTRAL_FLEET_IN_SERVICE_RECEIVING);
        }
      })();
    });

    socket.on("disconnect", () => {
      const row = onlineDrivers.get(user.id);
      if (driverIsBusyCrossModule(user.id) && row) {
        const next: DriverPresence = { ...row, idleOnMapDuringRide: true, updatedAt: Date.now() };
        onlineDrivers.set(user.id, next);
        emitCentralFleetUpdate(getIO(), next, CENTRAL_FLEET_IN_SERVICE_RECEIVING);
        return;
      }
      if (row) emitCentralFleetUpdate(getIO(), { ...row, updatedAt: Date.now() }, { offline: true });
      onlineDrivers.delete(user.id);
    });
  });
}

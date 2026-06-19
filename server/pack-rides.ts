/**
 * Pack Go: emparejamiento cliente ↔ driver para envíos/delivery (memoria + Socket.IO).
 * Clonado de Car Go con eventos `pack:ride:*` y sin Pet Car.
 */
import type { Express } from "express";
import type { Server as SocketIOServer, Socket } from "socket.io";
import type { GeoJsonObject } from "geojson";
import { z } from "zod";
import { authenticateJWT } from "./routes-auth";
import { getIO, getUserActivePath, sendNotificationToUser } from "./socket";
import { genFebStorage } from "./storage-genfeb";
import { catalogService } from "./services";
import { notificationService } from "./services/notification.service";
import { registerPackNegotiationWithdraw, withdrawDriverNegotiationOffersEverywhere } from "./negotiation-cross-withdraw";
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
import { driverIsBusyCrossModule, registerPackDriverBusy } from "./driver-busy-cross-module";
import { resolveGoRideRouteQuote } from "./go-ride-route-quote";
import { applyDriverFareToRide } from "./ride-fare-apply";
import { normalizeDispatchCompanyId } from "@shared/dispatch-company";
import { toCentralActiveServiceForPanel } from "@shared/central-active-service-for-central";
import { emitCentralFleetUpdate, CENTRAL_FLEET_IN_SERVICE_RECEIVING } from "./central-fleet-notify";
import { persistMobilityRideToHistory } from "./mobility-ride-archive-helper";
import {
  clearPackDriverPresence,
  getGoDriverPresenceRow,
  getPackOnlineDriversSnapshot,
  getPackPresenceRow,
  GO_DRIVER_PRESENCE_TTL_MS,
  isGoDriverPresenceFresh,
  listFreshPackDriversForMatching,
  markGoDriverPresenceDisconnected,
  type PackDriverPresenceView,
  updateGoDriverPresenceDispatchCompany,
  updateGoDriverPresenceLocation,
  upsertPackDriverPresence,
} from "./go-driver-presence-store";
import {
  deleteActiveMobilityRide,
  findActiveClassicOfferForDriver,
  loadActiveMobilityRideById,
  nextActiveMobilityRidePersistEpoch,
  persistActiveMobilityRide,
  type ActiveMobilityRidePayload,
} from "./mobility-active-rides-store";
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

export type PackVehicleKind = "moto" | "auto" | "camioneta";
export type PackPaymentMethod = "cash" | "bank_transfer";

export type PackNegotiationDriverSnapshot = {
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

export type PackNegotiationDriverOffer = {
  driverUserId: string;
  amountUsd: number;
  createdAt: number;
  updatedAt: number;
  driver: PackNegotiationDriverSnapshot;
};

export type PackNegotiationOffersArchiveEntry = {
  archivedAt: number;
  reason: "accepted";
  acceptedDriverUserId: string;
  offersSnapshot: PackNegotiationDriverOffer[];
};

/** Mapa UI → tipo vehículo proveedor (vehículo registrado). */
const PACK_TO_PROVIDER_VEHICLE: Record<PackVehicleKind, string> = {
  moto: "motorcycle",
  auto: "car",
  camioneta: "pickup_truck",
};

type RideStatus = "searching" | "matched" | "in_progress" | "cancelled" | "expired";

type RideRecord = {
  id: string;
  riderUserId: string;
  driverUserId: string | null;
  status: RideStatus;
  vehicleType: PackVehicleKind;
  paymentMethod: PackPaymentMethod;
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
  createdAt: number;
  conversationId: number | null;
  offeredDriverIds: string[];
  offerIndex: number;
  currentOfferDriverId: string | null;
  offerExpiresAt: number | null;
  driverSearchingClient?: boolean;
  riderNotifiedDriverNearPickup?: boolean;
  financialsSettled?: boolean;
  declinedAtByDriverId?: Record<string, number>;
  isNegotiated?: boolean;
  offers?: PackNegotiationDriverOffer[];
  offersArchive?: PackNegotiationOffersArchiveEntry[];
  negotiationExpiresAt?: number;
  /** Orden de tienda vinculada (delivery solicitado por la tienda). */
  storeOrderId?: number | null;
  storeId?: number | null;
};

export type PackRideRecordSnapshot = Pick<
  RideRecord,
  | "id"
  | "status"
  | "riderUserId"
  | "driverUserId"
  | "conversationId"
  | "estimatedUsd"
  | "distanceM"
  | "durationSec"
  | "start"
  | "end"
  | "storeOrderId"
  | "storeId"
>;

function toPackRideSnapshot(ride: RideRecord): PackRideRecordSnapshot {
  return {
    id: ride.id,
    status: ride.status,
    riderUserId: ride.riderUserId,
    driverUserId: ride.driverUserId,
    conversationId: ride.conversationId,
    estimatedUsd: ride.estimatedUsd,
    distanceM: ride.distanceM,
    durationSec: ride.durationSec,
    start: ride.start,
    end: ride.end,
    storeOrderId: ride.storeOrderId ?? null,
    storeId: ride.storeId ?? null,
  };
}

async function notifyStoreOrderPackEvent(
  ride: RideRecord,
  kind: "matched" | "started" | "cancelled_driver" | "completed",
): Promise<void> {
  if (ride.storeOrderId == null) return;
  const mod = await import("./store-order-delivery");
  const snap = toPackRideSnapshot(ride);
  if (kind === "matched") await mod.onStoreOrderPackRideMatched(snap);
  else if (kind === "started") await mod.onStoreOrderPackRideStarted(snap);
  else if (kind === "cancelled_driver") await mod.onStoreOrderPackRideCancelledByDriver(snap);
  else if (kind === "completed") await mod.onStoreOrderPackRideCompleted(snap);
}

export function getActivePackRideForStoreOrder(
  storeOrderId?: number,
  rideId?: string,
): PackRideRecordSnapshot | null {
  if (rideId) {
    const ride = rides.get(rideId);
    return ride ? toPackRideSnapshot(ride) : null;
  }
  if (storeOrderId == null) return null;
  for (const ride of rides.values()) {
    if (ride.storeOrderId === storeOrderId) return toPackRideSnapshot(ride);
  }
  return null;
}

/** Cancela búsqueda Pack Go de una orden de tienda (sin re-lanzar búsqueda). */
export function cancelStoreOrderPackSearch(storeOrderId: number): boolean {
  const io = getIO();
  let anyCancelled = false;

  for (const ride of rides.values()) {
    if (ride.storeOrderId !== storeOrderId) continue;
    if (ride.status === "cancelled" || ride.status === "expired") continue;

    const prevStatus = ride.status;
    const prevOfferDriverId = ride.currentOfferDriverId;
    clearRideTimers(ride.id);
    ride.status = "cancelled";
    ride.currentOfferDriverId = null;
    ride.offerExpiresAt = null;
    clearPendingOffersForRide(ride.id);
    anyCancelled = true;

    if (prevOfferDriverId) pendingOfferByDriverId.delete(prevOfferDriverId);

    if (io) {
      const payload = { rideId: ride.id, cancelledBy: "rider" as const };
      const notify = new Set<string>();
      notify.add(ride.riderUserId);
      if (ride.driverUserId) notify.add(ride.driverUserId);
      if (prevStatus === "searching") {
        for (const oid of ride.offeredDriverIds) notify.add(oid);
        if (prevOfferDriverId) notify.add(prevOfferDriverId);
      }
      for (const uid2 of notify) {
        io.to(`user:${uid2}`).emit("pack:ride:cancelled", payload);
      }
      void persistMobilityRideToHistory(ride, "pack", "cancelled", { cancelledBy: "rider" });
    }

    dropPackActiveRide(ride.id);

    if (ride.conversationId != null && ride.driverUserId != null) {
      void onMobilityRideChatCancelled(genFebStorage, {
        conversationId: Number(ride.conversationId),
        riderUserId: ride.riderUserId,
        driverUserId: ride.driverUserId,
      }).catch((e) => console.error("[pack] store order pack cancel chat", e));
    }
  }

  return anyCancelled;
}

export async function getPackRideDeliveryDetail(rideId: string) {
  const ride = rides.get(rideId);
  if (!ride) return null;
  const driver = ride.driverUserId ? await buildDriverPublic(ride.driverUserId) : null;
  return {
    ...toPackRideSnapshot(ride),
    routeGeometry: ride.routeGeometry,
    vehicleType: ride.vehicleType,
    paymentMethod: ride.paymentMethod,
    driver,
    ratedByRider: !!(ride as { ratedByRider?: boolean }).ratedByRider,
    ratedByDriver: !!(ride as { ratedByDriver?: boolean }).ratedByDriver,
  };
}

/** Crea búsqueda Pack Go para una orden de tienda (cliente = dueño de la tienda). */
export async function createPackRideForStoreOrder(input: {
  storeOrderId: number;
  storeId: number;
  riderUserId: string;
  start: { lat: number; lon: number; label: string };
  end: { lat: number; lon: number; label: string };
  estimatedUsd: number;
  distanceM: number;
  durationSec?: number;
  routeGeometry?: GeoJsonObject | null;
  vehicleType?: PackVehicleKind;
  paymentMethod?: PackPaymentMethod;
}): Promise<string> {
  const io = getIO();
  if (!io) throw new Error("Socket no disponible");

  const vehicleType = input.vehicleType ?? "moto";
  const paymentMethod = input.paymentMethod ?? "cash";
  const id = crypto.randomUUID();

  let distanceM = Math.max(0, input.distanceM);
  let durationSec = Math.max(60, input.durationSec ?? 0);
  let geometry = input.routeGeometry ?? null;

  if (distanceM <= 0 || !geometry) {
    const routeQuote = await resolveGoRideRouteQuote({
      start: input.start,
      end: input.end,
      vehicleType,
      module: "delivery",
    });
    distanceM = routeQuote.distanceM;
    durationSec = routeQuote.durationSec;
    geometry = (routeQuote.geometry ?? null) as GeoJsonObject | null;
  }

  const suggestedUsd = roundToCents(
    input.estimatedUsd > 0 ? input.estimatedUsd : (await resolveGoRideRouteQuote({
      start: input.start,
      end: input.end,
      vehicleType,
      module: "delivery",
    })).suggestedUsd,
  );

  let candidates = await freshDriversForRide({
    vehicleType,
    storeOrderId: input.storeOrderId,
    storeId: input.storeId,
  });
  candidates = rankDriversByNearest(input.start, candidates);
  const candidateIds = candidates.map((c) => c.userId);

  const ride: RideRecord = {
    id,
    riderUserId: input.riderUserId,
    driverUserId: null,
    status: "searching",
    vehicleType,
    paymentMethod,
    paymentConfirmed: true,
    estimatedUsd: suggestedUsd,
    suggestedUsd,
    isNegotiated: false,
    distanceM,
    durationSec,
    start: input.start,
    end: input.end,
    routeGeometry: geometry,
    createdAt: Date.now(),
    conversationId: null,
    offeredDriverIds: candidateIds,
    offerIndex: 0,
    currentOfferDriverId: null,
    offerExpiresAt: null,
    declinedAtByDriverId: {},
    storeOrderId: input.storeOrderId,
    storeId: input.storeId,
  };
  commitPackRide(ride);

  const timers = { offerTimeoutId: null, expireTimeoutId: null };
  rideTimers.set(id, timers);

  const rider = await buildRiderPublic(input.riderUserId);
  io.to(`user:${input.riderUserId}`).emit("pack:ride:searching", {
    rideId: id,
    candidateCount: candidateIds.length,
    isNegotiated: false,
  });
  void offerNextDriver(io, ride, rider);

  return id;
}

const rides = new Map<string, RideRecord>();
const rideTimers = new Map<string, { offerTimeoutId: NodeJS.Timeout | null; expireTimeoutId: NodeJS.Timeout | null }>();

/** Participantes del envío para enlaces de notificación push del chat. */
export function getPackRideChatParticipants(rideId: string): {
  riderUserId: string;
  driverUserId: string | null;
} | null {
  const ride = rides.get(rideId);
  if (!ride) return null;
  return { riderUserId: ride.riderUserId, driverUserId: ride.driverUserId };
}

/** Oferta pendiente por driver (recovery al abrir /go/delivery/driver tras push). */
const pendingOfferByDriverId = new Map<
  string,
  { rideId: string; expiresAt: number; module: "pack" }
>();

function commitPackRide(ride: RideRecord): void {
  rides.set(ride.id, ride);
  const epoch = nextActiveMobilityRidePersistEpoch(ride.id);
  void persistActiveMobilityRide("pack", ride as unknown as ActiveMobilityRidePayload, epoch);
}

function dropPackActiveRide(rideId: string): void {
  nextActiveMobilityRidePersistEpoch(rideId);
  void deleteActiveMobilityRide(rideId);
}

function clearPendingOffersForRide(rideId: string): void {
  for (const [driverId, p] of pendingOfferByDriverId.entries()) {
    if (p.rideId === rideId) pendingOfferByDriverId.delete(driverId);
  }
}

function isTerminalRideStatus(status: RideStatus): boolean {
  return status === "cancelled" || status === "expired";
}

async function ensurePackRideInMemory(rideId: string): Promise<RideRecord | undefined> {
  const cached = rides.get(rideId);
  if (cached) {
    if (isTerminalRideStatus(cached.status)) return undefined;
    return cached;
  }
  const loaded = await loadActiveMobilityRideById(rideId);
  if (!loaded || loaded.module !== "pack") return undefined;
  const ride = loaded.ride as RideRecord;
  if (isTerminalRideStatus(ride.status)) {
    void deleteActiveMobilityRide(rideId);
    return undefined;
  }
  rides.set(ride.id, ride);
  return ride;
}

type DriverPresence = PackDriverPresenceView;

export { getPackOnlineDriversSnapshot, getPackPresenceRow };

/** Igual que {@link refreshMobilityPresenceDispatchCompany} para presencia delivery (pack). */
export async function refreshPackPresenceDispatchCompany(driverUserId: string): Promise<void> {
  const row = getGoDriverPresenceRow(driverUserId);
  if (!row) return;
  const provider = await catalogService.getProviderByUserId(driverUserId);
  const dispatchCompanyId = normalizeDispatchCompanyId(
    (provider as { dispatchCompanyId?: unknown } | null)?.dispatchCompanyId,
  );
  updateGoDriverPresenceDispatchCompany(driverUserId, dispatchCompanyId);
  const next = getPackPresenceRow(driverUserId);
  if (next) emitCentralFleetUpdate(getIO(), { ...next, isPetFriendly: false });
}

export function packDriverInActiveRide(userId: string): boolean {
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

/** Resumen del envío delivery activo del conductor para el panel central (matched / in_progress). */
export async function getPackActiveRideForCentral(driverUserId: string) {
  for (const r of rides.values()) {
    if (r.driverUserId !== driverUserId) continue;
    if (r.status !== "matched" && r.status !== "in_progress") continue;
    return toCentralActiveServiceForPanel({
      mode: "delivery",
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
      driverSearchingClient: r.driverSearchingClient ?? false,
      isNegotiated: r.isNegotiated ?? false,
    });
  }
  return null;
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

const PRESENCE_TTL_MS = GO_DRIVER_PRESENCE_TTL_MS;
const REOFFER_COOLDOWN_MS = 75_000;

function driverBusyInPackStore(driverId: string): boolean {
  for (const r of rides.values()) {
    if (r.driverUserId === driverId && (r.status === "matched" || r.status === "in_progress")) return true;
  }
  return false;
}
registerPackDriverBusy(driverBusyInPackStore);

function nextOfferTtlMs(): number {
  return 10_000 + Math.floor(Math.random() * (22_000 - 10_000 + 1));
}

function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

const PACK_DRIVER_NEAR_PICKUP_RADIUS_M = 400;

async function appendPackRideSystemMessage(conversationId: number | null | undefined, content: string): Promise<void> {
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
    console.error("[pack] appendPackRideSystemMessage", e);
  }
}

async function freshDriversForVehicle(kind: PackVehicleKind): Promise<DriverPresence[]> {
  const want = PACK_TO_PROVIDER_VEHICLE[kind];
  return listFreshPackDriversForMatching((d) => {
    if (d.vehicleType !== want) return false;
    if (driverIsBusyCrossModule(d.userId)) return false;
    return true;
  });
}

function isStoreOrderPackRide(ride: RideRecord): boolean {
  return ride.storeOrderId != null && ride.storeId != null;
}

const ALL_PACK_PROVIDER_VEHICLES = new Set(Object.values(PACK_TO_PROVIDER_VEHICLE));

function driverMatchesPackRideVehicle(ride: RideRecord, pres: DriverPresence): boolean {
  if (isStoreOrderPackRide(ride)) {
    return ALL_PACK_PROVIDER_VEHICLES.has(pres.vehicleType);
  }
  return PACK_TO_PROVIDER_VEHICLE[ride.vehicleType as PackVehicleKind] === pres.vehicleType;
}

/** Envíos de tienda: cualquier conductor delivery online (moto, auto, camioneta). */
async function freshDriversForRide(
  ride: Pick<RideRecord, "vehicleType" | "storeOrderId" | "storeId">,
): Promise<DriverPresence[]> {
  if (ride.storeOrderId != null && ride.storeId != null) {
    return listFreshPackDriversForMatching((d) => {
      if (!ALL_PACK_PROVIDER_VEHICLES.has(d.vehicleType)) return false;
      if (driverIsBusyCrossModule(d.userId)) return false;
      return true;
    });
  }
  return freshDriversForVehicle(ride.vehicleType);
}

function isDriverPresenceFresh(pres: DriverPresence | undefined): boolean {
  if (!pres) return false;
  return isGoDriverPresenceFresh(pres.userId);
}

/** Oferta activa a un conductor que ya no está online: liberar y re-ofertar. */
function clearStaleActiveOffer(ride: RideRecord): void {
  if (!ride.currentOfferDriverId) return;
  const driverId = ride.currentOfferDriverId;
  const expired = ride.offerExpiresAt != null && Date.now() > ride.offerExpiresAt;
  const offline = !isDriverPresenceFresh(getPackPresenceRow(driverId));
  if (!expired && !offline) return;
  pendingOfferByDriverId.delete(driverId);
  ride.currentOfferDriverId = null;
  ride.offerExpiresAt = null;
  const timers = rideTimers.get(ride.id);
  if (timers?.offerTimeoutId) {
    clearTimeout(timers.offerTimeoutId);
    timers.offerTimeoutId = null;
  }
}

async function reconcilePendingRidesForDriver(io: SocketIOServer, pres: DriverPresence): Promise<void> {
  for (const ride of rides.values()) {
    if (ride.status !== "searching" || ride.driverUserId != null) continue;
    if (ride.isNegotiated) continue;
    if (typeof ride.marketVisibleUntil === "number") continue;
    if (!driverMatchesPackRideVehicle(ride, pres)) continue;

    packInsertDriverByDistance(ride, pres.userId);
    clearStaleActiveOffer(ride);

    if (!ride.currentOfferDriverId) {
      const rider = await buildRiderPublic(ride.riderUserId);
      await offerNextDriver(io, ride, rider);
    }
  }
}

function rankDriversByNearest(start: { lat: number; lon: number }, list: DriverPresence[]): DriverPresence[] {
  return [...list].sort((a, b) => haversineM(start, a) - haversineM(start, b));
}

function packInsertDriverByDistance(ride: RideRecord, driverId: string): boolean {
  if (ride.offeredDriverIds.includes(driverId)) return false;
  const declinedAt = ride.declinedAtByDriverId?.[driverId];
  if (typeof declinedAt === "number" && Date.now() - declinedAt < REOFFER_COOLDOWN_MS) return false;
  const pres = getPackPresenceRow(driverId);
  if (!pres) return false;
  if (!driverMatchesPackRideVehicle(ride, pres)) return false;
  if (driverIsBusyCrossModule(driverId)) return false;
  const myD = haversineM(ride.start, { lat: pres.lat, lon: pres.lon });
  let idx = ride.offeredDriverIds.length;
  for (let i = 0; i < ride.offeredDriverIds.length; i++) {
    const otherId = ride.offeredDriverIds[i]!;
    const otherPres = getPackPresenceRow(otherId);
    if (!otherPres) continue;
    const otherD = haversineM(ride.start, { lat: otherPres.lat, lon: otherPres.lon });
    if (myD < otherD) {
      idx = i;
      break;
    }
  }
  ride.offeredDriverIds.splice(idx, 0, driverId);
  return true;
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
  commitPackRide(ride);
}

async function buildRiderPublic(riderUserId: string) {
  const u = await genFebStorage.getUserById(riderUserId);
  const rec = (u ?? undefined) as Record<string, unknown> | undefined;
  const ln = String(rec?.lastName ?? "").trim();
  const nn = String(rec?.name ?? "").trim();
  const fn = String(rec?.firstName ?? "").trim();
  const email = String(rec?.email ?? "").trim();
  const fromParts = [fn, ln].filter(Boolean).join(" ").trim();
  const name = nn || fromParts || fn || ln || "Cliente";
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
  const vehicle = provider ? await genFebStorage.getPrimaryVehicleByProviderId((provider as { id: number }).id) : null;
  const ln = String(rec?.lastName ?? "").trim();
  const nn = String(rec?.name ?? "").trim();
  const fn = String(rec?.firstName ?? "").trim();
  const name = nn || fn || "Driver";
  const profileImageUrl =
    (rec?.profileImageUrl as string) ||
    (rec?.profile_image_url as string) ||
    (rec?.imageUrl as string) ||
    (rec?.avatar as string) ||
    null;
  const phone =
    String(rec?.phone ?? rec?.phoneNumber ?? rec?.phone_number ?? rec?.phone_number_e164 ?? "").trim() || null;
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
          color: ((vehicle as any).exterior_color as string) || null,
        }
      : null,
  };
}

/** Datos del envío para `POST /api/go/panic` (ruta central en `routes.ts`). */
export async function packPanicResolveContext(rideId: string) {
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

function emitPackNegotiationOffersUpdated(io: SocketIOServer, ride: RideRecord) {
  io.to(`user:${ride.riderUserId}`).emit("pack:ride:negotiation:offers_updated", {
    rideId: ride.id,
    offers: ride.offers ?? [],
    riderOfferUsd: ride.estimatedUsd,
  });
  commitPackRide(ride);
}

function withdrawDriverPackNegotiationOffersElsewhere(
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
    emitPackNegotiationOffersUpdated(io, ride);
    io.to(`user:${driverUserId}`).emit("pack:ride:negotiation:offer_removed", {
      rideId: ride.id,
      reason: NEGOTIATION_OFFER_REMOVED_REASON_WITHDRAWN,
    });
    const p = pendingOfferByDriverId.get(driverUserId);
    if (p?.rideId === ride.id) pendingOfferByDriverId.delete(driverUserId);
  }
}

registerPackNegotiationWithdraw(withdrawDriverPackNegotiationOffersElsewhere);

/** Regateo Delivery: ventana + aviso al cliente. Conductores usan GET /negotiation-board (no modal / no marketplace). */
function broadcastPackNegotiationInvites(io: SocketIOServer, ride: RideRecord, _rider: Awaited<ReturnType<typeof buildRiderPublic>>) {
  ride.negotiationExpiresAt = Date.now() + GO_NEGOTIATION_OFFER_WINDOW_MS;
  commitPackRide(ride);
  emitPackNegotiationOffersUpdated(io, ride);
}

async function offerNextDriver(io: SocketIOServer, ride: RideRecord, rider: any) {
  if (ride.isNegotiated) return;
  // Rides "por negociar" (market legacy) no deben entrar al flujo clásico de ofertas por socket.
  if (typeof (ride as any).marketVisibleUntil === "number") return;
  const ttlMs = nextOfferTtlMs();
  const timers = rideTimers.get(ride.id) ?? { offerTimeoutId: null, expireTimeoutId: null };
  rideTimers.set(ride.id, timers);

  const pres = await freshDriversForRide(ride);
  const ranked = rankDriversByNearest(ride.start, pres);
  ride.offeredDriverIds = ranked.map((d) => d.userId);
  ride.offerIndex = 0;

  while (ride.offerIndex < ride.offeredDriverIds.length) {
    const driverId = ride.offeredDriverIds[ride.offerIndex]!;
    ride.offerIndex += 1;
    if (driverIsBusyCrossModule(driverId)) continue;
    const declinedAt = ride.declinedAtByDriverId?.[driverId];
    if (typeof declinedAt === "number" && Date.now() - declinedAt < REOFFER_COOLDOWN_MS) continue;
    const driverPres = getPackPresenceRow(driverId);
    if (!driverPres || !driverMatchesPackRideVehicle(ride, driverPres)) continue;
    ride.currentOfferDriverId = driverId;
    ride.offerExpiresAt = Date.now() + ttlMs;
    const offerPayload = {
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
      expiresAt: ride.offerExpiresAt,
      storeOrderId: ride.storeOrderId ?? null,
      storeId: ride.storeId ?? null,
    };
    io.to(`user:${driverId}`).emit("pack:ride:offer", offerPayload);

    pendingOfferByDriverId.set(driverId, { rideId: ride.id, expiresAt: ride.offerExpiresAt!, module: "pack" });

    const offerTitle = isStoreOrderPackRide(ride) ? "Envío de tienda" : "Delivery";
    const offerBody = isStoreOrderPackRide(ride)
      ? `Orden #${ride.storeOrderId}: envío disponible. Acepta o rechaza.`
      : "Tienes un envío disponible. Abre para aceptar o rechazar.";

    void genFebStorage
      .createNotification({
        userId: driverId,
        type: "pack_ride_offer",
        data: {
          rideId: ride.id,
          storeOrderId: ride.storeOrderId ?? null,
          storeId: ride.storeId ?? null,
          url: "/go/driver",
        },
      })
      .catch((err) => console.error("[pack] offer notification", err));

    sendNotificationToUser(io, driverId, {
      type: "pack_ride_offer",
      data: {
        rideId: ride.id,
        storeOrderId: ride.storeOrderId ?? null,
        title: offerTitle,
        body: offerBody,
      },
    });

    // Push al driver si no está viendo la vista de driver.
    try {
      const pth = getUserActivePath(String(driverId));
      if (
        !pth ||
        (!pth.startsWith("/go/driver") &&
          !pth.startsWith("/go/delivery/driver") &&
          !pth.startsWith("/go/pack/driver"))
      ) {
        void notificationService.sendPushToUser(driverId, {
          title: offerTitle,
          body: offerBody,
          data: { url: "/go/driver", type: "pack_ride_offer", rideId: ride.id },
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
      io.to(`user:${fixedDriverId}`).emit("pack:ride:offer_expired", { rideId: live.id });
      pendingOfferByDriverId.delete(fixedDriverId);
      live.currentOfferDriverId = null;
      live.offerExpiresAt = null;
      commitPackRide(live);
      void offerNextDriver(io, live, rider);
    }, ttlMs + 150);
    commitPackRide(ride);
    return;
  }

  // No finalizamos la búsqueda solo porque no hay drivers "en este instante".
  commitPackRide(ride);
}

export function registerPackMobilitySocket(io: SocketIOServer) {
  io.on("connection", (socket: Socket) => {
    const user = socket.data.user as { id: string } | undefined;
    if (!user?.id) return;

    socket.on("pack:driver:presence", (data: { receiving: boolean; vehicleType: string; lat: number; lon: number }) => {
      if (!data) return;
        if (!data.receiving) {
          if (packDriverInActiveRide(user.id)) {
            void (async () => {
              const prev = getGoDriverPresenceRow(user.id);
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
              if (!posOk && !prev) return;
              const pres = upsertPackDriverPresence({
                userId: user.id,
                receiving: false,
                vehicleType: (data.vehicleType || prev?.vehicleType || "car").trim(),
                lat: posOk ? lat : (prev?.lat ?? 0),
                lon: posOk ? lon : (prev?.lon ?? 0),
                dispatchCompanyId,
                idleOnMapDuringRide: true,
              });
              emitCentralFleetUpdate(io, { ...pres, isPetFriendly: false }, CENTRAL_FLEET_IN_SERVICE_RECEIVING);
            })();
            return;
          }
          if (driverIsBusyCrossModule(user.id)) {
            const prev = getPackPresenceRow(user.id);
            if (prev && !prev.idleOnMapDuringRide) {
              clearPackDriverPresence(user.id);
              emitCentralFleetUpdate(
                io,
                { ...prev, isPetFriendly: false, updatedAt: Date.now() },
                { receivingDelivery: false },
              );
            }
            return;
          }
          const prev = getPackPresenceRow(user.id);
          clearPackDriverPresence(user.id);
          if (prev) emitCentralFleetUpdate(io, { ...prev, isPetFriendly: false, updatedAt: Date.now() }, { offline: true, receivingStopped: true });
          return;
        }
        void (async () => {
          const subscriptionOk = await driverGoSubscriptionAllowsOperation(user.id, (user as { role?: string }).role);
          if (!subscriptionOk) {
            clearPackDriverPresence(user.id);
            return;
          }
        const provider = await catalogService.getProviderByUserId(user.id);
        const pres = upsertPackDriverPresence({
          userId: user.id,
          receiving: true,
          vehicleType: (data.vehicleType || "").trim(),
          lat: data.lat,
          lon: data.lon,
          dispatchCompanyId: normalizeDispatchCompanyId(
            (provider as { dispatchCompanyId?: unknown } | null)?.dispatchCompanyId,
          ),
          idleOnMapDuringRide: false,
        });
      emitCentralFleetUpdate(io, { ...pres, isPetFriendly: false }, {
        receiving: true,
        receivingTaxi: false,
        receivingDelivery: true,
      });

      void reconcilePendingRidesForDriver(io, pres).catch((e) => {
        console.error("[pack] presence offer", e);
      });
      })();
    });

    socket.on("pack:ride:location", (data: { rideId: string; lat: number; lon: number }) => {
      if (!data?.rideId) return;
      const ride = rides.get(data.rideId);
      if (!ride || ride.driverUserId !== user.id || (ride.status !== "matched" && ride.status !== "in_progress")) return;
      const lat = Number(data.lat);
      const lon = Number(data.lon);
      if (
        ride.status === "matched" &&
        !ride.riderNotifiedDriverNearPickup &&
        Number.isFinite(lat) &&
        Number.isFinite(lon)
      ) {
        const m = haversineM(ride.start, { lat, lon });
        if (m <= PACK_DRIVER_NEAR_PICKUP_RADIUS_M) {
          ride.riderNotifiedDriverNearPickup = true;
          void appendPackRideSystemMessage(
            ride.conversationId,
            "Tu repartidor está muy cerca del punto de recogida del paquete.",
          );
          try {
            void notificationService.sendPushToUser(ride.riderUserId, {
              title: "Delivery",
              body: "Tu repartidor está cerca del punto de recogida.",
              data: { url: "/go/delivery", type: "pack_driver_near_pickup", rideId: data.rideId },
            });
          } catch {}
        }
      }
      io.to(`user:${ride.riderUserId}`).emit("pack:ride:driver_location", {
        rideId: data.rideId,
        lat: data.lat,
        lon: data.lon,
      });
      void (async () => {
        let presRow = getPackPresenceRow(user.id);
        if (
          !presRow &&
          Number.isFinite(lat) &&
          Number.isFinite(lon) &&
          (ride.status === "matched" || ride.status === "in_progress")
        ) {
          const provider = await catalogService.getProviderByUserId(user.id);
          const vehicle = await genFebStorage.getPrimaryVehicleByUserId(user.id);
          presRow = upsertPackDriverPresence({
            userId: user.id,
            receiving: false,
            vehicleType: String(vehicle?.vehicle_type ?? ride.vehicleType ?? "car").trim(),
            lat,
            lon,
            dispatchCompanyId: normalizeDispatchCompanyId(
              (provider as { dispatchCompanyId?: unknown } | null)?.dispatchCompanyId,
            ),
            idleOnMapDuringRide: true,
          });
        }
        if (
          presRow &&
          Number.isFinite(lat) &&
          Number.isFinite(lon) &&
          (ride.status === "matched" || ride.status === "in_progress")
        ) {
          updateGoDriverPresenceLocation(user.id, lat, lon, { idleOnMapDelivery: true });
          const next = getPackPresenceRow(user.id);
          if (next) emitCentralFleetUpdate(io, { ...next, isPetFriendly: false }, CENTRAL_FLEET_IN_SERVICE_RECEIVING);
        }
      })();
    });

    socket.on("disconnect", () => {
      const row = getPackPresenceRow(user.id);
      const inRide = driverIsBusyCrossModule(user.id);
      markGoDriverPresenceDisconnected(user.id, { inActiveRide: inRide });
      if (inRide && row) {
        const next = getPackPresenceRow(user.id);
        if (next) emitCentralFleetUpdate(io, { ...next, isPetFriendly: false }, CENTRAL_FLEET_IN_SERVICE_RECEIVING);
        return;
      }
      if (row) emitCentralFleetUpdate(io, { ...row, isPetFriendly: false, updatedAt: Date.now() }, { offline: true });
    });
  });
}

/** Restaura envíos delivery activos desde Firestore tras reinicio (Render). */
export async function hydratePackMobilityRidesFromFirestore(): Promise<number> {
  const { loadAllActiveMobilityRides } = await import("./mobility-active-rides-store");
  const all = await loadAllActiveMobilityRides();
  let count = 0;
  for (const row of all) {
    if (row.module !== "pack") continue;
    const ride = row.ride as RideRecord;
    rides.set(ride.id, ride);
    count += 1;
    if (
      ride.status === "searching" &&
      !ride.isNegotiated &&
      ride.currentOfferDriverId &&
      typeof ride.offerExpiresAt === "number"
    ) {
      pendingOfferByDriverId.set(ride.currentOfferDriverId, {
        rideId: ride.id,
        expiresAt: ride.offerExpiresAt,
        module: "pack",
      });
    }
  }

  const io = getIO();
  if (!io || count === 0) return count;

  for (const ride of rides.values()) {
    if (ride.status !== "searching" || ride.isNegotiated) continue;
    const rider = await buildRiderPublic(ride.riderUserId);
    if (ride.currentOfferDriverId && ride.offerExpiresAt) {
      const remaining = ride.offerExpiresAt - Date.now();
      if (remaining > 800) {
        const fixedDriverId = ride.currentOfferDriverId;
        const timers = rideTimers.get(ride.id) ?? { offerTimeoutId: null, expireTimeoutId: null };
        rideTimers.set(ride.id, timers);
        if (timers.offerTimeoutId) clearTimeout(timers.offerTimeoutId);
        timers.offerTimeoutId = setTimeout(() => {
          const live = rides.get(ride.id);
          if (!live || live.status !== "searching") return;
          if (live.currentOfferDriverId !== fixedDriverId) return;
          live.declinedAtByDriverId = live.declinedAtByDriverId ?? {};
          live.declinedAtByDriverId[fixedDriverId] = Date.now();
          io.to(`user:${fixedDriverId}`).emit("pack:ride:offer_expired", { rideId: live.id });
          pendingOfferByDriverId.delete(fixedDriverId);
          live.currentOfferDriverId = null;
          live.offerExpiresAt = null;
          commitPackRide(live);
          void offerNextDriver(io, live, rider);
        }, remaining + 150);
        continue;
      }
      ride.declinedAtByDriverId = ride.declinedAtByDriverId ?? {};
      ride.declinedAtByDriverId[ride.currentOfferDriverId] = Date.now();
      pendingOfferByDriverId.delete(ride.currentOfferDriverId);
      ride.currentOfferDriverId = null;
      ride.offerExpiresAt = null;
      commitPackRide(ride);
    }
    if (!ride.currentOfferDriverId) {
      await offerNextDriver(io, ride, rider);
    }
  }

  return count;
}

export function registerPackRideRoutes(app: Express) {
  void runMobilityRideChatStartupSweep(genFebStorage);

  // GET /api/pack/driver/pending-offer - Recupera una oferta pendiente (si existe) para el driver autenticado.
  app.get("/api/pack/driver/pending-offer", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      let p = pendingOfferByDriverId.get(driverUserId);
      let ride: RideRecord | undefined;
      if (p) {
        if (Date.now() > p.expiresAt) {
          pendingOfferByDriverId.delete(driverUserId);
          p = undefined;
        } else {
          ride = await ensurePackRideInMemory(p.rideId);
        }
      }
      if (!ride) {
        const fromStore = await findActiveClassicOfferForDriver("pack", driverUserId);
        if (fromStore) {
          const existing = rides.get(fromStore.id);
          if (existing && isTerminalRideStatus(existing.status)) {
            void deleteActiveMobilityRide(fromStore.id);
          } else {
            ride = fromStore as RideRecord;
            rides.set(ride.id, ride);
            if (typeof ride.offerExpiresAt === "number") {
              p = { rideId: ride.id, expiresAt: ride.offerExpiresAt, module: "pack" };
              pendingOfferByDriverId.set(driverUserId, p);
            }
          }
        }
      }
      if (!ride || ride.status !== "searching") {
        if (p) pendingOfferByDriverId.delete(driverUserId);
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
      const expiresAt = ride.isNegotiated
        ? ride.negotiationExpiresAt ?? p?.expiresAt ?? ride.offerExpiresAt
        : ride.offerExpiresAt;
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
          expiresAt,
          isNegotiated: !!ride.isNegotiated,
        },
      });
    } catch (e: any) {
      return res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  /** Tablero de regateo (Delivery). No es GET /rides/market (legacy distinto). */
  app.get("/api/pack/rides/negotiation-board", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const subscriptionOk = await driverGoSubscriptionAllowsOperation(driverUserId, req.user?.role);
      if (!subscriptionOk) {
        return res.status(403).json({ message: GO_DRIVER_SUBSCRIPTION_INACTIVE_MESSAGE });
      }
      const segmentRaw = typeof req.query?.vehicleSegment === "string" ? String(req.query.vehicleSegment).trim() : "";
      if (segmentRaw) {
        const allowed = await driverCanAccessNegotiationBoardSegment(driverUserId, segmentRaw, "pack");
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
        vehicleType: PackVehicleKind;
        paymentMethod: PackPaymentMethod;
        suggestedUsd: number;
        estimatedUsd: number;
        expiresAt: number;
        routeGeometry: GeoJsonObject | null;
        rider: Awaited<ReturnType<typeof buildRiderPublic>>;
        hasMyOffer: boolean;
        myOfferAmountUsd: number | null;
      }> = [];

      for (const ride of rides.values()) {
        if (!ride.isNegotiated || ride.status !== "searching" || ride.driverUserId != null) continue;
        if (ride.negotiationExpiresAt != null && now > ride.negotiationExpiresAt) continue;
        if (segmentRaw && ride.vehicleType !== segmentRaw) continue;
        const canSee = await driverPrimaryVehicleMatchesRideKind(driverUserId, ride.vehicleType, PACK_TO_PROVIDER_VEHICLE, {
          requireVerified: false,
        });
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

  // Market (legacy): rides con `marketVisibleUntil` vigente.
  app.get("/api/pack/rides/market", authenticateJWT, async (req: any, res) => {
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
    const currentCount =
      typeof (u as any)?.ratingCount === "number" ? (u as any).ratingCount : Number((u as any)?.ratingCount) || 0;
    const nextCount = Math.max(0, currentCount) + 1;
    const nextAvg = (currentAvg * Math.max(0, currentCount) + stars) / nextCount;
    await genFebStorage.updateUser(userId, { rating: nextAvg, ratingCount: nextCount });
  };

  const requestSchema = z.object({
    start: z.object({ lat: z.number(), lon: z.number(), label: z.string().min(2) }),
    end: z.object({ lat: z.number(), lon: z.number(), label: z.string().min(2) }),
    routeGeometry: z.any().nullable(),
    distanceM: z.number().nonnegative(),
    durationSec: z.number().nonnegative(),
    vehicleType: z.enum(["moto", "auto", "camioneta"]),
    paymentMethod: z.enum(["cash", "bank_transfer"]),
    estimatedUsd: z.number().nonnegative(),
    suggestedUsd: z.number().nonnegative().optional(),
    offerEdited: z.boolean().optional(),
    isNegotiated: z.boolean().optional(),
  });

  app.post("/api/pack/rides/request", authenticateJWT, async (req: any, res) => {
    try {
      const riderUserId = req.user?.id as string;
      if (!riderUserId) return res.status(401).json({ message: "Unauthorized" });
      const parsed = requestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Payload inválido" });

      const io = getIO();
      if (!io) return res.status(500).json({ message: "Socket no disponible" });

      const id = crypto.randomUUID();
      const body = parsed.data;

      const routeQuote = await resolveGoRideRouteQuote({
        start: body.start,
        end: body.end,
        vehicleType: body.vehicleType,
        module: "delivery",
      });

      const suggestedUsd = roundToCents(routeQuote.suggestedUsd);
      const clientOfferUsd = roundToCents(Math.max(0, safeNumber(body.estimatedUsd, 0)));
      const priceDiffers = Math.abs(clientOfferUsd - suggestedUsd) > 0.01;
      const negotiated = !!body.isNegotiated || !!body.offerEdited || priceDiffers;
      const offerUsd = negotiated ? clientOfferUsd : suggestedUsd;

      let candidates = await freshDriversForVehicle(body.vehicleType);
      candidates = rankDriversByNearest(body.start, candidates);
      const candidateIds = candidates.map((c) => c.userId);

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
        routeGeometry: (routeQuote.geometry ?? body.routeGeometry ?? null) as GeoJsonObject | null,
        createdAt: Date.now(),
        conversationId: null,
        offeredDriverIds: negotiated ? [] : candidateIds,
        offerIndex: 0,
        currentOfferDriverId: null,
        offerExpiresAt: null,
        declinedAtByDriverId: {},
      };
      commitPackRide(ride);

      const timers = { offerTimeoutId: null, expireTimeoutId: null };
      rideTimers.set(id, timers);
      // Importante: NO cerramos la búsqueda automáticamente por TTL.
      // El pasajero debe seguir buscando hasta cancelar manualmente.

      const rider = await buildRiderPublic(riderUserId);
      io.to(`user:${riderUserId}`).emit("pack:ride:searching", {
        rideId: id,
        candidateCount: candidateIds.length,
        isNegotiated: negotiated,
      });
      if (negotiated) {
        broadcastPackNegotiationInvites(io, ride, rider);
      } else {
        void offerNextDriver(io, ride, rider);
      }

      res.json({ ok: true, rideId: id });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  app.post("/api/pack/rides/:rideId/negotiation/driver-offer", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = String(req.params.rideId);
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (!ride.isNegotiated || ride.status !== "searching" || ride.driverUserId != null) {
        return res.status(409).json({ message: "Este envío no acepta ofertas ahora" });
      }
      const vehicleOk = await driverPrimaryVehicleMatchesRideKind(driverUserId, ride.vehicleType, PACK_TO_PROVIDER_VEHICLE, {
        requireVerified: false,
      });
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
      const driver = driverFull as unknown as PackNegotiationDriverSnapshot;
      const now = Date.now();
      ride.offers = ride.offers ?? [];
      const idx = ride.offers.findIndex((o) => o.driverUserId === driverUserId);
      if (idx >= 0) {
        return res.status(409).json({ message: DRIVER_NEGOTIATION_OFFER_ALREADY_SENT_MESSAGE });
      }
      const entry: PackNegotiationDriverOffer = {
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
      if (io) emitPackNegotiationOffersUpdated(io, ride);
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[pack] negotiation driver-offer", e);
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  app.delete("/api/pack/rides/:rideId/negotiation/offers/:driverId", authenticateJWT, async (req: any, res) => {
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
        emitPackNegotiationOffersUpdated(io, ride);
        io.to(`user:${driverId}`).emit("pack:ride:negotiation:offer_removed", {
          rideId,
          reason: NEGOTIATION_OFFER_REMOVED_REASON_RIDER_REJECTED,
        });
      }
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[pack] negotiation remove offer", e);
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  app.post("/api/pack/rides/:rideId/negotiation/decline-invite", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = String(req.params.rideId);
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Envío no encontrado" });
      if (!ride.isNegotiated || ride.status !== "searching" || ride.driverUserId != null) {
        return res.status(409).json({ message: "Este envío no acepta esta acción ahora" });
      }
      if (!ride.offeredDriverIds.includes(driverUserId)) {
        return res.status(403).json({ message: "No estás invitado a este servicio" });
      }
      ride.declinedAtByDriverId = ride.declinedAtByDriverId ?? {};
      ride.declinedAtByDriverId[driverUserId] = Date.now();
      ride.offeredDriverIds = ride.offeredDriverIds.filter((id) => id !== driverUserId);
      const p = pendingOfferByDriverId.get(driverUserId);
      if (p?.rideId === ride.id) pendingOfferByDriverId.delete(driverUserId);
      commitPackRide(ride);
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[pack] negotiation decline-invite", e);
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  app.post("/api/pack/rides/:rideId/negotiation/accept/:driverId", authenticateJWT, async (req: any, res) => {
    try {
      const riderUserId = req.user?.id as string;
      if (!riderUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = String(req.params.rideId);
      const driverId = String(req.params.driverId);
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (ride.riderUserId !== riderUserId) return res.status(403).json({ message: "Sin acceso" });
      if (!ride.isNegotiated || ride.status !== "searching" || ride.driverUserId != null) {
        return res.status(409).json({ message: "Este envío ya no está disponible" });
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
      clearRideTimers(ride.id);
      commitPackRide(ride);

      const io = getIO();
      if (!io) return res.status(500).json({ message: "Socket no disponible" });

      withdrawDriverNegotiationOffersEverywhere(io, driverId, rideId);

      const notifyTaken = new Set<string>();
      for (const o of ride.offersArchive[ride.offersArchive.length - 1]!.offersSnapshot) {
        notifyTaken.add(o.driverUserId);
      }
      for (const oid of ride.offeredDriverIds) notifyTaken.add(oid);

      const driver = await buildDriverPublic(driverId);
      const pres = getPackPresenceRow(driverId);
      const driverLat = pres?.lat;
      const driverLon = pres?.lon;
      let conversationId: number | null = null;
      try {
        conversationId = await ensureMobilityRideConversation(genFebStorage, {
          rideId: ride.id,
          module: "delivery",
          riderUserId: ride.riderUserId,
          driverUserId: driverId,
          hintedConversationId: ride.conversationId,
        });
        ride.conversationId = conversationId;
      } catch (ce) {
        console.error("[pack] negotiation accept conversation", ce);
      }

      const rider = await buildRiderPublic(ride.riderUserId);
      io.to(`user:${ride.riderUserId}`).emit("pack:ride:matched", {
        rideId,
        driver,
        driverLat,
        driverLon,
        conversationId,
        estimatedUsd: ride.estimatedUsd,
        isNegotiated: !!ride.isNegotiated,
      });
      io.to(`user:${driverId}`).emit("pack:ride:accepted", { rideId, rider, conversationId });

      for (const uid of notifyTaken) {
        if (uid === driverId) continue;
        io.to(`user:${uid}`).emit("pack:ride:taken", { rideId });
        pendingOfferByDriverId.delete(uid);
      }
      pendingOfferByDriverId.delete(driverId);

      void notifyStoreOrderPackEvent(ride, "matched").catch((e) =>
        console.error("[pack] store order matched", e),
      );

      try {
        const pth = getUserActivePath(String(ride.riderUserId));
        if (!pth || (!pth.startsWith("/go/delivery") && !pth.startsWith("/go/pack"))) {
          void notificationService.sendPushToUser(ride.riderUserId, {
            title: "Delivery",
            body: "Tu envío fue aceptado. Abre para ver a tu driver.",
            data: { url: "/go/delivery", type: "pack_ride_matched", rideId },
          });
        }
      } catch {}

      res.json({ ok: true, accepted: true, rideId, conversationId });
    } catch (e: any) {
      console.error("[pack] negotiation accept", e);
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  app.post("/api/pack/rides/:rideId/respond", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const subscriptionOk = await driverGoSubscriptionAllowsOperation(driverUserId, req.user?.role);
      if (!subscriptionOk) {
        return res.status(403).json({ message: GO_DRIVER_SUBSCRIPTION_INACTIVE_MESSAGE });
      }
      const rideId = String(req.params.rideId);
      const accept = !!(req.body as any)?.accept;
      const ride = rides.get(rideId);
      if (!ride) {
        if (!accept) {
          pendingOfferByDriverId.delete(driverUserId);
          return res.json({ ok: true, accepted: false, alreadyResolved: true });
        }
        return res.status(404).json({ message: "Viaje no encontrado" });
      }
      if (ride.isNegotiated) {
        return res.status(409).json({ message: "Este envío es por regateo. Envía tu monto con la opción de regateo." });
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
            void offerNextDriver(io, ride, rider);
          } catch (declineErr) {
            console.error("[pack] decline offerNextDriver", declineErr);
          }
        } else {
          pendingOfferByDriverId.delete(driverUserId);
        }
        return res.json({ ok: true, accepted: false });
      }

      if (ride.status !== "searching") return res.status(409).json({ message: "Oferta ya no válida" });
      if (ride.currentOfferDriverId !== driverUserId) return res.status(403).json({ message: "No eres el driver ofertado" });

      if (ride.driverUserId != null) return res.status(409).json({ message: "Otro driver ya tomó este envío" });
      if (driverIsBusyCrossModule(driverUserId)) {
        ride.declinedAtByDriverId = ride.declinedAtByDriverId ?? {};
        ride.declinedAtByDriverId[driverUserId] = Date.now();
        ride.currentOfferDriverId = null;
        ride.offerExpiresAt = null;
        const rider = await buildRiderPublic(ride.riderUserId);
        void offerNextDriver(io, ride, rider);
        return res.status(409).json({ message: "Estás en servicio. No puedes aceptar otra oferta." });
      }
      ride.driverUserId = driverUserId;
      ride.status = "matched";
      ride.currentOfferDriverId = null;
      ride.offerExpiresAt = null;
      clearRideTimers(ride.id);
      pendingOfferByDriverId.delete(driverUserId);
      commitPackRide(ride);

      withdrawDriverNegotiationOffersEverywhere(io, driverUserId, rideId);

      if (!ride.isNegotiated) {
        await applyDriverFareToRide(ride, driverUserId, "delivery");
      }

      res.json({ ok: true, accepted: true, rideId, conversationId: ride.conversationId ?? null });

      void (async () => {
        try {
          const driver = await buildDriverPublic(driverUserId);
          const pres = getPackPresenceRow(driverUserId);
          const driverLat = pres?.lat;
          const driverLon = pres?.lon;
          let conversationId: number | null = null;
          try {
            conversationId = await ensureMobilityRideConversation(genFebStorage, {
              rideId: ride.id,
              module: "delivery",
              riderUserId: ride.riderUserId,
              driverUserId,
              hintedConversationId: ride.conversationId,
            });
            ride.conversationId = conversationId;
          } catch (ce) {
            console.error("[pack] ensureMobilityRideConversation", ce);
          }

          const rider = await buildRiderPublic(ride.riderUserId);

          io.to(`user:${ride.riderUserId}`).emit("pack:ride:matched", {
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
            if (!pth || (!pth.startsWith("/go/delivery") && !pth.startsWith("/go/pack"))) {
              void notificationService.sendPushToUser(ride.riderUserId, {
                title: "Delivery",
                body: "Tu envío fue aceptado. Abre para ver a tu driver.",
                data: { url: "/go/delivery", type: "pack_ride_matched", rideId },
              });
            }
          } catch {}

          for (const oid of ride.offeredDriverIds) {
            if (oid === driverUserId) continue;
            io.to(`user:${oid}`).emit("pack:ride:taken", { rideId });
          }

          io.to(`user:${driverUserId}`).emit("pack:ride:accepted", { rideId, rider, conversationId });
          void notifyStoreOrderPackEvent(ride, "matched").catch((e) =>
            console.error("[pack] store order matched", e),
          );
        } catch (finalizeErr) {
          console.error("[pack] finalize accept", finalizeErr);
        }
      })();
      return;
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  // Aceptar desde el “market” (ofertas por negociar):
  // Para evitar carreras (2 drivers aceptando a la vez), NO hacemos match directo.
  // En su lugar, enviamos una "oferta" al usuario y el usuario decide aceptar.
  app.post("/api/pack/rides/:rideId/market/accept", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = String(req.params.rideId);
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (ride.status !== "searching") return res.status(409).json({ message: "Oferta ya no válida" });
      if (ride.driverUserId != null) return res.status(409).json({ message: "Otro driver ya tomó este envío" });
      const now = Date.now();
      if (typeof ride.marketVisibleUntil === "number" && ride.marketVisibleUntil < now) {
        return res.status(409).json({ message: "La oferta expiró" });
      }
      if (driverIsBusyCrossModule(driverUserId)) {
        return res.status(409).json({ message: "Estás en servicio. No puedes aceptar otra oferta." });
      }
      const io = getIO();
      if (!io) return res.status(500).json({ message: "Socket no disponible" });

      ride.counterOffers = ride.counterOffers ?? {};
      const expiresAt = Date.now() + 60_000;
      ride.counterOffers[driverUserId] = { amountUsd: ride.estimatedUsd, expiresAt };

      const driver = await buildDriverPublic(driverUserId);
      io.to(`user:${ride.riderUserId}`).emit("pack:ride:counteroffer", {
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
  app.post("/api/pack/rides/:rideId/counteroffer", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = String(req.params.rideId);
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (ride.status !== "searching") return res.status(409).json({ message: "Oferta ya no válida" });
      if (ride.driverUserId != null) return res.status(409).json({ message: "Otro driver ya tomó este envío" });
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
        io.to(`user:${ride.riderUserId}`).emit("pack:ride:counteroffer", {
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
  app.post("/api/pack/rides/:rideId/counteroffer/:driverId/accept", authenticateJWT, async (req: any, res) => {
    try {
      const riderUserId = req.user?.id as string;
      if (!riderUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = String(req.params.rideId);
      const driverId = String(req.params.driverId);
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (ride.riderUserId !== riderUserId) return res.status(403).json({ message: "Sin acceso" });
      if (ride.status !== "searching") return res.status(409).json({ message: "Oferta ya no válida" });
      if (ride.driverUserId != null) return res.status(409).json({ message: "Otro driver ya tomó este envío" });

      const co = ride.counterOffers?.[driverId];
      if (!co) return res.status(404).json({ message: "Contraoferta no encontrada" });
      if (Date.now() > co.expiresAt) return res.status(409).json({ message: "La contraoferta expiró" });
      if (driverIsBusyCrossModule(driverId)) {
        return res.status(409).json({ message: RIDER_DRIVER_NOT_AVAILABLE_MESSAGE });
      }

      ride.estimatedUsd = roundToCents(Math.max(0, safeNumber(co.amountUsd, ride.estimatedUsd)));
      ride.driverUserId = driverId;
      ride.status = "matched";
      ride.marketVisibleUntil = undefined;
      ride.counterOffers = undefined;
      clearRideTimers(ride.id);
      commitPackRide(ride);

      const io = getIO();
      if (!io) return res.status(500).json({ message: "Socket no disponible" });

      withdrawDriverNegotiationOffersEverywhere(io, driverId, rideId);

      const driver = await buildDriverPublic(driverId);
      const pres = getPackPresenceRow(driverId);
      const driverLat = pres?.lat;
      const driverLon = pres?.lon;
      let conversationId: number | null = null;
      try {
        conversationId = await ensureMobilityRideConversation(genFebStorage, {
          rideId: ride.id,
          module: "delivery",
          riderUserId: ride.riderUserId,
          driverUserId: driverId,
          hintedConversationId: ride.conversationId,
        });
        ride.conversationId = conversationId;
      } catch {}

      const rider = await buildRiderPublic(ride.riderUserId);
      io.to(`user:${ride.riderUserId}`).emit("pack:ride:matched", {
        rideId,
        driver,
        driverLat,
        driverLon,
        conversationId,
        estimatedUsd: ride.estimatedUsd,
        isNegotiated: !!ride.isNegotiated,
      });
      io.to(`user:${driverId}`).emit("pack:ride:accepted", { rideId, rider, conversationId });

      void notifyStoreOrderPackEvent(ride, "matched").catch((e) =>
        console.error("[pack] store order matched", e),
      );

      res.json({ ok: true, accepted: true, rideId, conversationId });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  app.post("/api/pack/rides/:rideId/driver-searching", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = String(req.params.rideId);
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (ride.driverUserId !== driverUserId) return res.status(403).json({ message: "Sin acceso" });
      if (ride.status !== "matched") return res.status(409).json({ message: "No se puede buscar en este estado" });
      if (ride.driverSearchingClient) {
        return res.json({ ok: true, alreadySearching: true });
      }
      ride.driverSearchingClient = true;
      const io = getIO();
      io?.to(`user:${ride.riderUserId}`).emit("pack:ride:driver_searching", { rideId });
      io?.to(`user:${driverUserId}`).emit("pack:ride:driver_searching", { rideId });
      void appendPackRideSystemMessage(
        ride.conversationId,
        "El repartidor inició la búsqueda para coordinar contigo la recogida del paquete.",
      );
      try {
        void notificationService.sendPushToUser(ride.riderUserId, {
          title: "Delivery",
          body: "Tu repartidor inició la búsqueda para llegar hasta ti.",
          data: { url: "/go/delivery", type: "pack_driver_searching", rideId },
        });
      } catch {}
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  app.post("/api/pack/rides/:rideId/start", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = String(req.params.rideId);
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (ride.driverUserId !== driverUserId) return res.status(403).json({ message: "Sin acceso" });
      if (ride.status !== "matched") return res.status(409).json({ message: "Estado inválido" });
      ride.status = "in_progress";
      commitPackRide(ride);
      const io = getIO();
      io?.to(`user:${ride.riderUserId}`).emit("pack:ride:started", { rideId });
      io?.to(`user:${driverUserId}`).emit("pack:ride:started", { rideId });
      if (ride.conversationId != null) {
        try {
          await onMobilityRideChatStarted(genFebStorage, ride.conversationId);
        } catch (se) {
          console.error("[pack] ride chat started", se);
        }
        try {
          await genFebStorage.createMessage({
            conversationId: ride.conversationId,
            senderId: CHAT_SYSTEM_SENDER_ID,
            content: "Envío en curso. Podéis seguir coordinando por este chat durante el trayecto.",
            type: "system",
            status: "sent",
          });
        } catch (me) {
          console.error("[pack] seed chat on start", me);
        }
      }
      void notifyStoreOrderPackEvent(ride, "started").catch((e) =>
        console.error("[pack] store order started", e),
      );
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  app.post("/api/pack/rides/:rideId/driver-location", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = String(req.params.rideId);
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (ride.driverUserId !== driverUserId) return res.status(403).json({ message: "Sin acceso" });
      const lat = Number((req.body as any)?.lat);
      const lon = Number((req.body as any)?.lon);
      const io = getIO();
      if (
        ride.status === "matched" &&
        !ride.riderNotifiedDriverNearPickup &&
        Number.isFinite(lat) &&
        Number.isFinite(lon)
      ) {
        const m = haversineM(ride.start, { lat, lon });
        if (m <= PACK_DRIVER_NEAR_PICKUP_RADIUS_M) {
          ride.riderNotifiedDriverNearPickup = true;
          void appendPackRideSystemMessage(
            ride.conversationId,
            "Tu repartidor está muy cerca del punto de recogida del paquete.",
          );
          try {
            void notificationService.sendPushToUser(ride.riderUserId, {
              title: "Delivery",
              body: "Tu repartidor está cerca del punto de recogida.",
              data: { url: "/go/delivery", type: "pack_driver_near_pickup", rideId },
            });
          } catch {}
        }
      }
      io?.to(`user:${ride.riderUserId}`).emit("pack:ride:driver_location", { rideId, lat, lon });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  app.post("/api/pack/rides/:rideId/confirm-payment", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = String(req.params.rideId);
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (ride.driverUserId !== driverUserId) return res.status(403).json({ message: "Sin acceso" });
      ride.paymentConfirmed = true;
      const io = getIO();
      io?.to(`user:${ride.riderUserId}`).emit("pack:ride:payment_confirmed", { rideId });
      io?.to(`user:${driverUserId}`).emit("pack:ride:payment_confirmed", { rideId });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  app.post("/api/pack/rides/:rideId/complete", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = String(req.params.rideId);
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (ride.driverUserId !== driverUserId) return res.status(403).json({ message: "Sin acceso" });
      if (ride.status !== "in_progress") return res.status(409).json({ message: "El envío no está en curso" });

      if (ride.financialsSettled) return res.json({ ok: true, rideId, alreadySettled: true });
      ride.financialsSettled = true;

      ride.status = "expired";
      void persistMobilityRideToHistory(ride, "pack", "completed");
      dropPackActiveRide(ride.id);
      void bumpGoUserCompletedTrips(ride.riderUserId);
      void bumpGoUserCompletedTrips(driverUserId);
      const io = getIO();
      io?.to(`user:${ride.riderUserId}`).emit("pack:ride:completed", { rideId });
      io?.to(`user:${driverUserId}`).emit("pack:ride:completed", { rideId });

      if (ride.conversationId != null && ride.driverUserId) {
        try {
          await onMobilityRideChatCompleted(genFebStorage, {
            conversationId: Number(ride.conversationId),
            riderUserId: ride.riderUserId,
            driverUserId,
          });
        } catch (e) {
          console.error("[pack] ride chat completed", e);
        }
      }
      void notifyStoreOrderPackEvent(ride, "completed").catch((err) =>
        console.error("[pack] store order completed", err),
      );
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  app.post("/api/pack/rides/:rideId/cancel", authenticateJWT, async (req: any, res) => {
    try {
      const uid = req.user?.id as string;
      if (!uid) return res.status(401).json({ message: "Unauthorized" });
      const rideId = String(req.params.rideId);
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      const isRider = ride.riderUserId === uid;
      const isDriver = ride.driverUserId === uid;
      if (!isRider && !isDriver) return res.status(403).json({ message: "Sin acceso" });
      if (ride.status === "cancelled" || ride.status === "expired") return res.json({ ok: true });

      const prevStatus = ride.status;
      const prevOfferDriverId = ride.currentOfferDriverId;
      clearRideTimers(ride.id);
      ride.status = "cancelled";
      // Si estaba ofertado en búsqueda, asegurar que no siga "pegado" en conductores.
      ride.currentOfferDriverId = null;
      ride.offerExpiresAt = null;
      clearPendingOffersForRide(ride.id);
      const io = getIO();
      if (io) {
        const cancelledBy: "rider" | "driver" = isDriver ? "driver" : "rider";
        const payload = { rideId, cancelledBy };
        const notify = new Set<string>();
        notify.add(ride.riderUserId);
        if (ride.driverUserId) notify.add(ride.driverUserId);
        if (prevStatus === "searching") {
          for (const oid of ride.offeredDriverIds) notify.add(oid);
          if (prevOfferDriverId) notify.add(prevOfferDriverId);
        }
        for (const uid2 of notify) {
          io.to(`user:${uid2}`).emit("pack:ride:cancelled", payload);
        }
        void persistMobilityRideToHistory(ride, "pack", "cancelled", { cancelledBy });
      }
      dropPackActiveRide(ride.id);

      if (ride.conversationId != null && ride.driverUserId != null) {
        try {
          await onMobilityRideChatCancelled(genFebStorage, {
            conversationId: Number(ride.conversationId),
            riderUserId: ride.riderUserId,
            driverUserId: ride.driverUserId,
          });
        } catch (e) {
          console.error("[pack] ride chat cancelled", e);
        }
      }
      if (isDriver && ride.storeOrderId != null) {
        void notifyStoreOrderPackEvent(ride, "cancelled_driver").catch((err) =>
          console.error("[pack] store order cancel", err),
        );
      }
      res.json({ ok: true, rideId, cancelledBy: isDriver ? "driver" : "rider" });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  // POST /api/pack/rides/:rideId/rate - Calificar al otro participante (Pack Go)
  app.post("/api/pack/rides/:rideId/rate", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id as string;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = String(req.params.rideId);
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      const body = rateSchema.parse(req.body);

      const isRider = ride.riderUserId === userId;
      const isDriver = ride.driverUserId === userId;
      if (!isRider && !isDriver) return res.status(403).json({ message: "Sin acceso" });

      const targetUserId = body.target === "driver" ? ride.driverUserId : ride.riderUserId;
      if (!targetUserId) return res.status(409).json({ message: "Aún no hay destinatario para calificar" });
      if (targetUserId === userId) return res.status(400).json({ message: "Destino inválido" });

      (ride as any).ratedByRider = (ride as any).ratedByRider ?? false;
      (ride as any).ratedByDriver = (ride as any).ratedByDriver ?? false;
      if (isRider && (ride as any).ratedByRider) return res.status(409).json({ message: "Ya calificaste este envío" });
      if (isDriver && (ride as any).ratedByDriver) return res.status(409).json({ message: "Ya calificaste este envío" });

      await applyUserStars(String(targetUserId), body.stars);
      if (isRider) (ride as any).ratedByRider = true;
      if (isDriver) (ride as any).ratedByDriver = true;

      return res.json({ ok: true });
    } catch (e: any) {
      if (e instanceof z.ZodError) return res.status(400).json({ message: "Datos inválidos", errors: e.errors });
      console.error("[pack] rate", e);
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  app.get("/api/pack/rides/:rideId", authenticateJWT, async (req: any, res) => {
    try {
      const uid = req.user?.id as string;
      if (!uid) return res.status(401).json({ message: "Unauthorized" });
      const rideId = String(req.params.rideId);
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (ride.riderUserId !== uid && ride.driverUserId !== uid) return res.status(403).json({ message: "Sin acceso" });
      const rider = await buildRiderPublic(ride.riderUserId);
      const driver = ride.driverUserId ? await buildDriverPublic(ride.driverUserId) : null;
      res.json({
        id: ride.id,
        status: ride.status,
        riderUserId: ride.riderUserId,
        driverUserId: ride.driverUserId,
        paymentMethod: ride.paymentMethod,
        paymentConfirmed: ride.paymentConfirmed,
        conversationId: ride.conversationId,
        estimatedUsd: ride.estimatedUsd,
        suggestedUsd: ride.suggestedUsd ?? ride.estimatedUsd,
        isNegotiated: !!ride.isNegotiated,
        offers:
          uid === ride.riderUserId && ride.status === "searching" && ride.isNegotiated ? ride.offers ?? [] : undefined,
        distanceM: ride.distanceM,
        durationSec: ride.durationSec,
        vehicleType: ride.vehicleType,
        start: ride.start,
        end: ride.end,
        routeGeometry: ride.routeGeometry,
        driverSearchingClient: !!ride.driverSearchingClient,
        rider,
        driver,
      });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  // Socket: presencia driver en línea
  const presenceSchema = z.object({
    vehicleType: z.string().min(1),
    lat: z.number(),
    lon: z.number(),
  });

  app.post("/api/pack/driver/presence", authenticateJWT, async (req: any, res) => {
    try {
      const uid = req.user?.id as string;
      if (!uid) return res.status(401).json({ message: "Unauthorized" });
      const parsed = presenceSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Payload inválido" });
      const provider = await catalogService.getProviderByUserId(uid);
      const pres = upsertPackDriverPresence({
        userId: uid,
        receiving: true,
        vehicleType: parsed.data.vehicleType,
        lat: parsed.data.lat,
        lon: parsed.data.lon,
        dispatchCompanyId: normalizeDispatchCompanyId(
          (provider as { dispatchCompanyId?: unknown } | null)?.dispatchCompanyId,
        ),
      });
      emitCentralFleetUpdate(getIO(), { ...pres, isPetFriendly: false });

      // Si el driver se reporta tarde, intentar re-ofertar rides pendientes sin oferta activa.
      const io = getIO();
      if (io) {
        void reconcilePendingRidesForDriver(io, pres).catch((e) => {
          console.error("[pack] http presence offer", e);
        });
      }
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });
}


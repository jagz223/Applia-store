/**
 * Pack Go: emparejamiento cliente ↔ driver para envíos/delivery (memoria + Socket.IO).
 * Clonado de Car Go con eventos `pack:ride:*` y sin Pet Car.
 */
import type { Express } from "express";
import type { Server as SocketIOServer, Socket } from "socket.io";
import type { GeoJsonObject } from "geojson";
import { z } from "zod";
import { authenticateJWT } from "./routes-auth";
import { getIO, getUserActivePath } from "./socket";
import { genFebStorage } from "./storage-genfeb";
import { catalogService } from "./services";
import { notificationService } from "./services/notification.service";
import { registerPackNegotiationWithdraw, withdrawDriverNegotiationOffersEverywhere } from "./negotiation-cross-withdraw";
import crypto from "crypto";

export type PackVehicleKind = "moto" | "auto" | "camioneta";
export type PackPaymentMethod = "cash" | "bank_transfer";

export type PackNegotiationDriverSnapshot = {
  userId: string;
  name: string;
  lastName?: string;
  profileImageUrl: string | null;
  phone: string | null;
  rating: number;
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
  financialsSettled?: boolean;
  declinedAtByDriverId?: Record<string, number>;
  isNegotiated?: boolean;
  offers?: PackNegotiationDriverOffer[];
  offersArchive?: PackNegotiationOffersArchiveEntry[];
  negotiationExpiresAt?: number;
};

const rides = new Map<string, RideRecord>();
const rideTimers = new Map<string, { offerTimeoutId: NodeJS.Timeout | null; expireTimeoutId: NodeJS.Timeout | null }>();

/** Oferta pendiente por driver (recovery al abrir /go/delivery/driver tras push). */
const pendingOfferByDriverId = new Map<
  string,
  { rideId: string; expiresAt: number; module: "pack" }
>();

type DriverPresence = {
  userId: string;
  vehicleType: string;
  lat: number;
  lon: number;
  updatedAt: number;
};
const onlineDrivers = new Map<string, DriverPresence>();

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

const PRESENCE_TTL_MS = 45_000;
const SEARCH_TTL_MS = 5 * 60_000;
const REOFFER_COOLDOWN_MS = 75_000;

function driverIsBusy(driverId: string): boolean {
  for (const r of rides.values()) {
    if (r.driverUserId === driverId && (r.status === "matched" || r.status === "in_progress")) return true;
  }
  return false;
}

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

function freshDriversForVehicle(kind: PackVehicleKind): DriverPresence[] {
  const want = PACK_TO_PROVIDER_VEHICLE[kind];
  const now = Date.now();
  const list: DriverPresence[] = [];
  for (const d of onlineDrivers.values()) {
    if (d.vehicleType !== want) continue;
    if (now - d.updatedAt > PRESENCE_TTL_MS) continue;
    if (driverIsBusy(d.userId)) continue;
    list.push(d);
  }
  return list;
}

function rankDriversByNearest(start: { lat: number; lon: number }, list: DriverPresence[]): DriverPresence[] {
  return [...list].sort((a, b) => haversineM(start, a) - haversineM(start, b));
}

function packInsertDriverByDistance(ride: RideRecord, driverId: string): boolean {
  if (ride.offeredDriverIds.includes(driverId)) return false;
  const declinedAt = ride.declinedAtByDriverId?.[driverId];
  if (typeof declinedAt === "number" && Date.now() - declinedAt < REOFFER_COOLDOWN_MS) return false;
  const pres = onlineDrivers.get(driverId);
  if (!pres) return false;
  const wantVehicle = PACK_TO_PROVIDER_VEHICLE[ride.vehicleType as PackVehicleKind];
  if (wantVehicle !== pres.vehicleType) return false;
  if (driverIsBusy(driverId)) return false;
  const myD = haversineM(ride.start, { lat: pres.lat, lon: pres.lon });
  let idx = ride.offeredDriverIds.length;
  for (let i = 0; i < ride.offeredDriverIds.length; i++) {
    const otherId = ride.offeredDriverIds[i]!;
    const otherPres = onlineDrivers.get(otherId);
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

async function buildRiderPublic(riderUserId: string) {
  const u = await genFebStorage.getUserById(riderUserId);
  const rec = (u ?? undefined) as Record<string, unknown> | undefined;
  const ln = String(rec?.lastName ?? "").trim();
  const nn = String(rec?.name ?? "").trim();
  const fn = String(rec?.firstName ?? "").trim();
  const email = String(rec?.email ?? "").trim();
  const name = nn || fn || "Cliente";
  const profileImageUrl =
    (rec?.profileImageUrl as string) ||
    (rec?.profile_image_url as string) ||
    (rec?.imageUrl as string) ||
    (rec?.avatar as string) ||
    null;
  const phone = String(rec?.phone ?? "").trim() || null;
  const rating = Number(rec?.rating) || 0;
  const ratingCount = Number(rec?.ratingCount) || 0;
  const completedTrips = Number(rec?.completedTrips) || 0;
  return { name, lastName: ln, profileImageUrl, phone, rating, ratingCount, completedTrips, email };
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
  const rating = Number(rec?.rating) || 0;
  const ratingCount = Number(rec?.ratingCount) || 0;
  const completedTrips = Number(rec?.completedTrips) || 0;
  return {
    userId: driverUserId,
    name,
    lastName: ln,
    profileImageUrl,
    phone,
    rating,
    ratingCount,
    completedTrips,
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

function emitPackNegotiationOffersUpdated(io: SocketIOServer, ride: RideRecord) {
  io.to(`user:${ride.riderUserId}`).emit("pack:ride:negotiation:offers_updated", {
    rideId: ride.id,
    offers: ride.offers ?? [],
  });
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
    io.to(`user:${driverUserId}`).emit("pack:ride:negotiation:offer_removed", { rideId: ride.id });
    const p = pendingOfferByDriverId.get(driverUserId);
    if (p?.rideId === ride.id) pendingOfferByDriverId.delete(driverUserId);
  }
}

registerPackNegotiationWithdraw(withdrawDriverPackNegotiationOffersElsewhere);

function packNegotiationInvitePayload(
  ride: RideRecord,
  rider: Awaited<ReturnType<typeof buildRiderPublic>>,
  expiresAt: number
) {
  return {
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
    isNegotiated: true as const,
  };
}

async function broadcastPackNegotiationInvites(io: SocketIOServer, ride: RideRecord, rider: Awaited<ReturnType<typeof buildRiderPublic>>) {
  ride.negotiationExpiresAt = Date.now() + SEARCH_TTL_MS;
  const exp = ride.negotiationExpiresAt;
  const payload = packNegotiationInvitePayload(ride, rider, exp);
  for (const driverId of ride.offeredDriverIds) {
    if (driverIsBusy(driverId)) continue;
    io.to(`user:${driverId}`).emit("pack:ride:offer", payload);
    pendingOfferByDriverId.set(driverId, { rideId: ride.id, expiresAt: exp, module: "pack" });
    try {
      const pth = getUserActivePath(String(driverId));
      if (!pth || (!pth.startsWith("/go/delivery/driver") && !pth.startsWith("/go/pack/driver"))) {
        void notificationService.sendPushToUser(driverId, {
          title: "Delivery",
          body: "Tienes un envío disponible. Abre para aceptar o rechazar.",
          data: { url: "/go/delivery/driver", type: "pack_ride_offer", rideId: ride.id },
        });
      }
    } catch {}
  }
}

async function emitPackNegotiationInviteToDriver(
  io: SocketIOServer,
  ride: RideRecord,
  rider: Awaited<ReturnType<typeof buildRiderPublic>>,
  driverId: string
) {
  if (!ride.negotiationExpiresAt || Date.now() > ride.negotiationExpiresAt) return;
  if (driverIsBusy(driverId)) return;
  const exp = ride.negotiationExpiresAt;
  const payload = packNegotiationInvitePayload(ride, rider, exp);
  io.to(`user:${driverId}`).emit("pack:ride:offer", payload);
  pendingOfferByDriverId.set(driverId, { rideId: ride.id, expiresAt: exp, module: "pack" });
  try {
    const pth = getUserActivePath(String(driverId));
    if (!pth || (!pth.startsWith("/go/delivery/driver") && !pth.startsWith("/go/pack/driver"))) {
      void notificationService.sendPushToUser(driverId, {
        title: "Delivery",
        body: "Tienes un envío disponible. Abre para aceptar o rechazar.",
        data: { url: "/go/delivery/driver", type: "pack_ride_offer", rideId: ride.id },
      });
    }
  } catch {}
}

async function offerNextDriver(io: SocketIOServer, ride: RideRecord, rider: any) {
  if (ride.isNegotiated) return;
  // Rides "por negociar" (market legacy) no deben entrar al flujo clásico de ofertas por socket.
  if (typeof (ride as any).marketVisibleUntil === "number") return;
  const ttlMs = nextOfferTtlMs();
  const timers = rideTimers.get(ride.id) ?? { offerTimeoutId: null, expireTimeoutId: null };
  rideTimers.set(ride.id, timers);

  const pres = freshDriversForVehicle(ride.vehicleType);
  const ranked = rankDriversByNearest(ride.start, pres);
  ride.offeredDriverIds = ranked.map((d) => d.userId);
  ride.offerIndex = 0;

  while (ride.offerIndex < ride.offeredDriverIds.length) {
    const driverId = ride.offeredDriverIds[ride.offerIndex]!;
    ride.offerIndex += 1;
    if (driverIsBusy(driverId)) continue;
    const declinedAt = ride.declinedAtByDriverId?.[driverId];
    if (typeof declinedAt === "number" && Date.now() - declinedAt < REOFFER_COOLDOWN_MS) continue;
    ride.currentOfferDriverId = driverId;
    ride.offerExpiresAt = Date.now() + ttlMs;
    io.to(`user:${driverId}`).emit("pack:ride:offer", {
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
    });

    pendingOfferByDriverId.set(driverId, { rideId: ride.id, expiresAt: ride.offerExpiresAt!, module: "pack" });

    // Push al driver si no está viendo la vista de driver.
    try {
      const pth = getUserActivePath(String(driverId));
      if (!pth || (!pth.startsWith("/go/delivery/driver") && !pth.startsWith("/go/pack/driver"))) {
        void notificationService.sendPushToUser(driverId, {
          title: "Delivery",
          body: "Tienes un envío disponible. Abre para aceptar o rechazar.",
          data: { url: "/go/delivery/driver", type: "pack_ride_offer", rideId: ride.id },
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
      void offerNextDriver(io, live, rider);
    }, ttlMs + 150);
    return;
  }

  // No finalizamos la búsqueda solo porque no hay drivers "en este instante".
  // El ride seguirá en `searching` hasta el TTL; cuando un driver se conecte (presence),
  // se ejecutará `offerNextDriver` y se retomarán las ofertas.
}

export function registerPackMobilitySocket(io: SocketIOServer) {
  io.on("connection", (socket: Socket) => {
    const user = socket.data.user as { id: string } | undefined;
    if (!user?.id) return;

    socket.on("pack:driver:presence", (data: { receiving: boolean; vehicleType: string; lat: number; lon: number }) => {
      if (!data) return;
      if (!data.receiving) {
        onlineDrivers.delete(user.id);
        return;
      }
      const pres: DriverPresence = {
        userId: user.id,
        vehicleType: (data.vehicleType || "").trim(),
        lat: data.lat,
        lon: data.lon,
        updatedAt: Date.now(),
      };
      onlineDrivers.set(user.id, pres);

      // Si hay envíos en búsqueda, ofrecer también a drivers que se ponen online después.
      void (async () => {
        try {
          const now = Date.now();
          for (const ride of rides.values()) {
            if (ride.status !== "searching") continue;
            if (ride.driverUserId != null) continue;
            const wantVehicle = PACK_TO_PROVIDER_VEHICLE[ride.vehicleType as PackVehicleKind];
            if (wantVehicle !== pres.vehicleType) continue;

            if (ride.isNegotiated) {
              const inserted = packInsertDriverByDistance(ride, user.id);
              if (
                inserted &&
                ride.negotiationExpiresAt != null &&
                Date.now() <= ride.negotiationExpiresAt
              ) {
                const rider = await buildRiderPublic(ride.riderUserId);
                await emitPackNegotiationInviteToDriver(io, ride, rider, user.id);
              }
              continue;
            }

            // No interrumpir una oferta en curso; cuando no haya oferta activa, re-evaluar candidatos (incluye al nuevo driver).
            if (!ride.currentOfferDriverId) {
              const rider = await buildRiderPublic(ride.riderUserId);
              await offerNextDriver(io, ride, rider);
            }
          }
        } catch (e) {
          console.error("[pack] presence offer", e);
        }
      })();
    });

    socket.on("pack:ride:location", (data: { rideId: string; lat: number; lon: number }) => {
      if (!data?.rideId) return;
      const ride = rides.get(data.rideId);
      if (!ride || ride.driverUserId !== user.id || (ride.status !== "matched" && ride.status !== "in_progress")) return;
      io.to(`user:${ride.riderUserId}`).emit("pack:ride:driver_location", {
        rideId: data.rideId,
        lat: data.lat,
        lon: data.lon,
      });
    });

    socket.on("disconnect", () => {
      onlineDrivers.delete(user.id);
    });
  });
}

export function registerPackRideRoutes(app: Express) {
  // GET /api/pack/driver/pending-offer - Recupera una oferta pendiente (si existe) para el driver autenticado.
  app.get("/api/pack/driver/pending-offer", authenticateJWT, async (req: any, res) => {
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
          expiresAt,
          isNegotiated: !!ride.isNegotiated,
        },
      });
    } catch (e: any) {
      return res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  // Market: rides "por negociar" (oferta != sugerido) aún en searching y vigentes.
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
      const offerUsd = roundToCents(Math.max(0, safeNumber(body.estimatedUsd, 0)));
      const suggestedUsd = roundToCents(Math.max(0, safeNumber(body.suggestedUsd, offerUsd)));
      const negotiated = !!body.isNegotiated;

      let candidates = freshDriversForVehicle(body.vehicleType);
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
        distanceM: body.distanceM,
        durationSec: body.durationSec,
        start: body.start,
        end: body.end,
        routeGeometry: (body.routeGeometry ?? null) as GeoJsonObject | null,
        createdAt: Date.now(),
        conversationId: null,
        offeredDriverIds: negotiated ? candidateIds : [],
        offerIndex: 0,
        currentOfferDriverId: null,
        offerExpiresAt: null,
        declinedAtByDriverId: {},
      };
      rides.set(id, ride);

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
      if (negotiated && candidateIds.length > 0) {
        await broadcastPackNegotiationInvites(io, ride, rider);
        emitPackNegotiationOffersUpdated(io, ride);
      } else if (!negotiated) {
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
      if (!ride.offeredDriverIds.includes(driverUserId)) {
        return res.status(403).json({ message: "No estás invitado a este servicio" });
      }
      if (ride.negotiationExpiresAt != null && Date.now() > ride.negotiationExpiresAt) {
        return res.status(409).json({ message: "La ventana de ofertas expiró" });
      }
      if (driverIsBusy(driverUserId)) {
        return res.status(409).json({ message: "Estás en servicio. No puedes ofertar ahora." });
      }
      const amt = roundToCents(Math.max(0, safeNumber((req.body as any)?.amountUsd, 0)));
      if (!Number.isFinite(amt)) return res.status(400).json({ message: "Monto inválido" });

      const driverFull = await buildDriverPublic(driverUserId);
      const driver = driverFull as unknown as PackNegotiationDriverSnapshot;
      const now = Date.now();
      ride.offers = ride.offers ?? [];
      const idx = ride.offers.findIndex((o) => o.driverUserId === driverUserId);
      const entry: PackNegotiationDriverOffer = {
        driverUserId,
        amountUsd: amt,
        createdAt: idx >= 0 ? ride.offers[idx]!.createdAt : now,
        updatedAt: now,
        driver,
      };
      if (idx >= 0) ride.offers[idx] = entry;
      else ride.offers.push(entry);

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
        io.to(`user:${driverId}`).emit("pack:ride:negotiation:offer_removed", { rideId });
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
      if (!row) return res.status(404).json({ message: "Oferta no encontrada" });
      if (driverIsBusy(driverId)) return res.status(409).json({ message: "El conductor ya está ocupado" });

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
        const conv = await genFebStorage.createConversation({
          participant1Id: ride.riderUserId,
          participant2Id: driverId,
        });
        conversationId = Number((conv as { id: number }).id);
        ride.conversationId = conversationId;
        await genFebStorage.createMessage({
          conversationId,
          senderId: driverId,
          content:
            "Chat iniciado. Aquí pueden acordar el precio final del envío. Si deseas, puedes proponer un mejor precio y coordinar detalles por este chat.",
          type: "text",
          status: "sent",
        });
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
      const rideId = String(req.params.rideId);
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (ride.isNegotiated) {
        return res.status(409).json({ message: "Este envío es por regateo. Envía tu monto con la opción de regateo." });
      }
      if (ride.status !== "searching") return res.status(409).json({ message: "Oferta ya no válida" });
      if (ride.currentOfferDriverId !== driverUserId) return res.status(403).json({ message: "No eres el driver ofertado" });
      const accept = !!(req.body as any)?.accept;

      const io = getIO();
      if (!io) return res.status(500).json({ message: "Socket no disponible" });

      if (!accept) {
        ride.declinedAtByDriverId = ride.declinedAtByDriverId ?? {};
        ride.declinedAtByDriverId[driverUserId] = Date.now();
        ride.currentOfferDriverId = null;
        ride.offerExpiresAt = null;
        const rider = await buildRiderPublic(ride.riderUserId);
        void offerNextDriver(io, ride, rider);
        return res.json({ ok: true, accepted: false });
      }

      if (ride.driverUserId != null) return res.status(409).json({ message: "Otro driver ya tomó este envío" });
      if (driverIsBusy(driverUserId)) {
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
      clearRideTimers(ride.id);

      withdrawDriverNegotiationOffersEverywhere(io, driverUserId, rideId);

      const driver = await buildDriverPublic(driverUserId);
      const pres = onlineDrivers.get(driverUserId);
      const driverLat = pres?.lat;
      const driverLon = pres?.lon;
      let conversationId: number | null = null;
      try {
        const conv = await genFebStorage.createConversation({
          participant1Id: ride.riderUserId,
          participant2Id: driverUserId,
        });
        conversationId = Number((conv as { id: number }).id);
        ride.conversationId = conversationId;
        await genFebStorage.createMessage({
          conversationId,
          senderId: driverUserId,
          content:
            "Chat iniciado. Aquí pueden acordar el precio final del envío. Si deseas, puedes proponer un mejor precio y coordinar detalles por este chat.",
          type: "text",
          status: "sent",
        });
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

      // Avisar a los drivers que tenían esta oferta (como en Car Go) para que cierren el modal.
      for (const oid of ride.offeredDriverIds) {
        if (oid === driverUserId) continue;
        io.to(`user:${oid}`).emit("pack:ride:taken", { rideId });
      }

      io.to(`user:${driverUserId}`).emit("pack:ride:accepted", { rideId, rider, conversationId });

      res.json({ ok: true, accepted: true, rideId, conversationId });
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
      if (driverIsBusy(driverUserId)) {
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
      if (driverIsBusy(driverUserId)) {
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
      if (driverIsBusy(driverId)) return res.status(409).json({ message: "El driver ya está ocupado" });

      ride.estimatedUsd = roundToCents(Math.max(0, safeNumber(co.amountUsd, ride.estimatedUsd)));
      ride.driverUserId = driverId;
      ride.status = "matched";
      ride.marketVisibleUntil = undefined;
      ride.counterOffers = undefined;
      clearRideTimers(ride.id);

      const io = getIO();
      if (!io) return res.status(500).json({ message: "Socket no disponible" });

      const driver = await buildDriverPublic(driverId);
      const pres = onlineDrivers.get(driverId);
      const driverLat = pres?.lat;
      const driverLon = pres?.lon;
      let conversationId: number | null = null;
      try {
        const conv = await genFebStorage.createConversation({
          participant1Id: ride.riderUserId,
          participant2Id: driverId,
        });
        conversationId = Number((conv as { id: number }).id);
        ride.conversationId = conversationId;
        await genFebStorage.createMessage({
          conversationId,
          senderId: driverId,
          content:
            "Chat iniciado. Aquí pueden acordar el precio final del envío. Si deseas, puedes proponer un mejor precio y coordinar detalles por este chat.",
          type: "text",
          status: "sent",
        });
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
      ride.driverSearchingClient = true;
      const io = getIO();
      io?.to(`user:${ride.riderUserId}`).emit("pack:ride:driver_searching", { rideId });
      io?.to(`user:${driverUserId}`).emit("pack:ride:driver_searching", { rideId });
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
      const io = getIO();
      io?.to(`user:${ride.riderUserId}`).emit("pack:ride:started", { rideId });
      io?.to(`user:${driverUserId}`).emit("pack:ride:started", { rideId });
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
      const io = getIO();
      io?.to(`user:${ride.riderUserId}`).emit("pack:ride:completed", { rideId });
      io?.to(`user:${driverUserId}`).emit("pack:ride:completed", { rideId });

      // Ocultar conversación del historial de ambos (si existe), pero mantenerla en BD para auditoría/admin.
      if (ride.conversationId != null) {
        try {
          await genFebStorage.hideConversationForUsers(Number(ride.conversationId), [ride.riderUserId, driverUserId]);
        } catch (e) {
          console.error("[pack] hideConversationForUsers(complete)", e);
        }
      }
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
      }

      // Ocultar conversación del historial de ambos (si existe).
      if (ride.conversationId != null && ride.driverUserId != null) {
        try {
          await genFebStorage.hideConversationForUsers(Number(ride.conversationId), [ride.riderUserId, ride.driverUserId]);
        } catch (e) {
          console.error("[pack] hideConversationForUsers(cancel)", e);
        }
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
      const pres: DriverPresence = {
        userId: uid,
        vehicleType: parsed.data.vehicleType,
        lat: parsed.data.lat,
        lon: parsed.data.lon,
        updatedAt: Date.now(),
      };
      onlineDrivers.set(uid, pres);

      // Si el driver se reporta tarde, intentar re-ofertar rides pendientes sin oferta activa.
      const io = getIO();
      if (io) {
        const now = Date.now();
        for (const ride of rides.values()) {
          if (ride.status !== "searching") continue;
          if (ride.driverUserId != null) continue;
          const wantVehicle = PACK_TO_PROVIDER_VEHICLE[ride.vehicleType as PackVehicleKind];
          if (wantVehicle !== pres.vehicleType) continue;

          if (ride.isNegotiated) {
            const inserted = packInsertDriverByDistance(ride, uid);
            if (
              inserted &&
              ride.negotiationExpiresAt != null &&
              Date.now() <= ride.negotiationExpiresAt
            ) {
              const rider = await buildRiderPublic(ride.riderUserId);
              await emitPackNegotiationInviteToDriver(io, ride, rider, uid);
            }
            continue;
          }

          // Rides "por negociar" (market) no se ofertan automáticamente al activar presencia.
          if (typeof (ride as any).marketVisibleUntil === "number") continue;
          if (!ride.currentOfferDriverId) {
            const rider = await buildRiderPublic(ride.riderUserId);
            await offerNextDriver(io, ride, rider);
          }
        }
      }
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });
}


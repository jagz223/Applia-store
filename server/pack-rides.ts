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
import { getPlatformCommissionRate } from "./platform-commission-rate";
// roundToCents no se usa en Pack Go; settlement usa applyMobilityRideSettlement.
import { canAffordOffPlatformCommission, minCommissionForEstimatedTrip } from "@shared/wallet-limits";

export type PackVehicleKind = "moto" | "auto" | "camioneta";
export type PackPaymentMethod = "genfeb" | "cash" | "bank_transfer";

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
  estimatedUsd: number;
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
};

const rides = new Map<string, RideRecord>();
const rideTimers = new Map<string, { offerTimeoutId: NodeJS.Timeout | null; expireTimeoutId: NodeJS.Timeout | null }>();

/** Oferta pendiente por driver (recovery al abrir /go/pack/driver tras push). */
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

const PRESENCE_TTL_MS = 45_000;
const SEARCH_TTL_MS = 5 * 60_000;
const REOFFER_COOLDOWN_MS = 75_000;

function driverIsBusy(driverId: string): boolean {
  for (const r of rides.values()) {
    if (r.driverUserId === driverId && (r.status === "matched" || r.status === "in_progress")) return true;
  }
  return false;
}

async function driverCanAcceptOffPlatformRide(estimatedUsd: number, driverUserId: string): Promise<boolean> {
  const rate = await getPlatformCommissionRate();
  const minC = minCommissionForEstimatedTrip(estimatedUsd, rate);
  if (minC <= 0) return true;
  const u = await genFebStorage.getUserById(driverUserId);
  const w = typeof (u as { wallet?: number })?.wallet === "number" ? (u as { wallet: number }).wallet : 0;
  return canAffordOffPlatformCommission(w, minC);
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

function clearRideTimers(rideId: string) {
  const t = rideTimers.get(rideId);
  if (!t) return;
  if (t.offerTimeoutId) clearTimeout(t.offerTimeoutId);
  if (t.expireTimeoutId) clearTimeout(t.expireTimeoutId);
  rideTimers.delete(rideId);
}

async function buildRiderPublic(riderUserId: string) {
  const u = await genFebStorage.getUserById(riderUserId);
  const ln = String((u as any)?.lastName ?? "").trim();
  const nn = String((u as any)?.name ?? "").trim();
  const fn = String((u as any)?.firstName ?? "").trim();
  const email = String((u as any)?.email ?? "").trim();
  const name = nn || fn || "Cliente";
  const profileImageUrl =
    (u?.profileImageUrl as string) ||
    (u?.profile_image_url as string) ||
    (u?.imageUrl as string) ||
    ((u as any)?.avatar as string) ||
    null;
  const phone = String((u as any)?.phone ?? "").trim() || null;
  const rating = Number((u as any)?.rating) || 0;
  const ratingCount = Number((u as any)?.ratingCount) || 0;
  const completedTrips = Number((u as any)?.completedTrips) || 0;
  return { name, lastName: ln, profileImageUrl, phone, rating, ratingCount, completedTrips, email };
}

async function buildDriverPublic(driverUserId: string) {
  const u = await genFebStorage.getUserById(driverUserId);
  const provider = await catalogService.getProviderByUserId(driverUserId);
  const vehicle = provider ? await genFebStorage.getPrimaryVehicleByProviderId((provider as { id: number }).id) : null;
  const ln = String((u as any)?.lastName ?? "").trim();
  const nn = String((u as any)?.name ?? "").trim();
  const fn = String((u as any)?.firstName ?? "").trim();
  const name = nn || fn || "Driver";
  const profileImageUrl =
    (u?.profileImageUrl as string) ||
    (u?.profile_image_url as string) ||
    (u?.imageUrl as string) ||
    ((u as any)?.avatar as string) ||
    null;
  const phone =
    String(
      (u as any)?.phone ??
        (u as any)?.phoneNumber ??
        (u as any)?.phone_number ??
        (u as any)?.phone_number_e164 ??
        ""
    ).trim() || null;
  const rating = Number((u as any)?.rating) || 0;
  const ratingCount = Number((u as any)?.ratingCount) || 0;
  const completedTrips = Number((u as any)?.completedTrips) || 0;
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

async function offerNextDriver(io: SocketIOServer, ride: RideRecord, rider: any) {
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
    if (!(await driverCanAcceptOffPlatformRide(ride.estimatedUsd, driverId)) && ride.paymentMethod !== "genfeb") continue;
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
      expiresAt: ride.offerExpiresAt,
    });

    pendingOfferByDriverId.set(driverId, { rideId: ride.id, expiresAt: ride.offerExpiresAt!, module: "pack" });

    // Push al driver si no está viendo la vista de driver.
    try {
      const pth = getUserActivePath(String(driverId));
      if (!pth || !pth.startsWith("/go/pack/driver")) {
        void notificationService.sendPushToUser(driverId, {
          title: "Pack Go",
          body: "Tienes un envío disponible. Abre para aceptar o rechazar.",
          data: { url: "/go/pack/driver", type: "pack_ride_offer", rideId: ride.id },
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
            const wantVehicle = PACK_TO_PROVIDER_VEHICLE[ride.vehicleType];
            if (wantVehicle !== pres.vehicleType) continue;

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
      if (!ride || ride.status !== "searching" || ride.currentOfferDriverId !== driverUserId) {
        pendingOfferByDriverId.delete(driverUserId);
        return res.json({ offer: null });
      }
      const rider = await buildRiderPublic(ride.riderUserId);
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
          expiresAt: ride.offerExpiresAt,
        },
      });
    } catch (e: any) {
      return res.status(500).json({ message: e?.message ?? "Error" });
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
    paymentMethod: z.enum(["genfeb", "cash", "bank_transfer"]),
    estimatedUsd: z.number().nonnegative(),
  });

  app.post("/api/pack/rides/request", authenticateJWT, async (req: any, res) => {
    try {
      const riderUserId = req.user?.id as string;
      if (!riderUserId) return res.status(401).json({ message: "Unauthorized" });
      const parsed = requestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Payload inválido" });

      const io = getIO();
      if (!io) return res.status(500).json({ message: "Socket no disponible" });

      const id = `pack_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const body = parsed.data;
      const ride: RideRecord = {
        id,
        riderUserId,
        driverUserId: null,
        status: "searching",
        vehicleType: body.vehicleType,
        paymentMethod: body.paymentMethod,
        paymentConfirmed: false,
        estimatedUsd: body.estimatedUsd,
        distanceM: body.distanceM,
        durationSec: body.durationSec,
        start: body.start,
        end: body.end,
        routeGeometry: (body.routeGeometry ?? null) as GeoJsonObject | null,
        createdAt: Date.now(),
        conversationId: null,
        offeredDriverIds: [],
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
      void offerNextDriver(io, ride, rider);

      res.json({ ok: true, rideId: id });
    } catch (e: any) {
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
          content: "Iniciado chat para coordinar el envío.",
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
      });

      try {
        const pth = getUserActivePath(String(ride.riderUserId));
        if (!pth || !pth.startsWith("/go/pack")) {
          void notificationService.sendPushToUser(ride.riderUserId, {
            title: "Pack Go",
            body: "Tu envío fue aceptado. Abre para ver a tu driver.",
            data: { url: "/go/pack", type: "pack_ride_matched", rideId },
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
      if (ride.paymentMethod !== "genfeb" && !ride.paymentConfirmed) {
        return res.status(409).json({ message: "Confirma el pago antes de terminar" });
      }

      if (ride.financialsSettled) return res.json({ ok: true, rideId, alreadySettled: true });
      try {
        await genFebStorage.applyMobilityRideSettlement({
          rideId,
          riderUserId: ride.riderUserId,
          driverUserId,
          estimatedUsd: ride.estimatedUsd,
          paymentMethod: ride.paymentMethod,
        });
      } catch (err: any) {
        return res.status(409).json({ message: err?.message ?? "No se pudo finalizar el envío" });
      }
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
        paymentMethod: ride.paymentMethod,
        paymentConfirmed: ride.paymentConfirmed,
        conversationId: ride.conversationId,
        estimatedUsd: ride.estimatedUsd,
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
          const wantVehicle = PACK_TO_PROVIDER_VEHICLE[ride.vehicleType];
          if (wantVehicle !== pres.vehicleType) continue;
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


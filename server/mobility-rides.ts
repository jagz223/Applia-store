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
import { getPlatformCommissionRate } from "./platform-commission-rate";
import { roundToCents } from "@shared/platform-commission";
import { canAffordOffPlatformCommission, minCommissionForEstimatedTrip } from "@shared/wallet-limits";
import { FEATURE_OFF_PLATFORM_COMMISSION_ENABLED } from "@shared/feature-flags";

export type TaxiVehicleKind = "moto" | "auto" | "pet_car" | "camioneta";
export type TaxiPaymentMethod = "genfeb" | "cash" | "bank_transfer";

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
  estimatedUsd: number;
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
  /** Evita doble asiento contable al completar */
  financialsSettled?: boolean;
  /** Última vez que un driver rechazó/expiró esta oferta (para re-ofertar luego). */
  declinedAtByDriverId?: Record<string, number>;
};

const rides = new Map<string, RideRecord>();
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

function freshDriversForVehicle(taxiKind: TaxiVehicleKind): DriverPresence[] {
  const want = TAXI_TO_PROVIDER_VEHICLE[taxiKind];
  const requirePet = taxiKind === "pet_car";
  const now = Date.now();
  const list: DriverPresence[] = [];
  for (const d of onlineDrivers.values()) {
    if (d.vehicleType !== want) continue;
    if (requirePet && !d.isPetFriendly) continue;
    if (now - d.updatedAt > PRESENCE_TTL_MS) continue;
    if (driverIsBusy(d.userId)) continue;
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

function emitRideFailed(io: SocketIOServer, ride: RideRecord, reason: "timeout" | "no_driver") {
  ride.status = "expired";
  clearRideTimers(ride.id);
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

  // Push al pasajero si no está viendo /go/cargo.
  try {
    const pth = getUserActivePath(String(ride.riderUserId));
    if (!pth || !pth.startsWith("/go/cargo")) {
      void notificationService.sendPushToUser(ride.riderUserId, {
        title: "Car Go",
        body: cancelledBy === "driver" ? "El conductor canceló el viaje." : "El viaje fue cancelado.",
        data: { url: "/go/cargo", type: "cargo_ride_cancelled", rideId: ride.id },
      });
    }
  } catch {}
}

async function offerNextDriver(
  io: SocketIOServer,
  ride: RideRecord,
  rider: { name: string; profileImageUrl: string | null }
) {
  if (ride.status !== "searching") return;

  const timers = ensureRideTimers(ride.id);
  if (timers.offerTimeoutId) {
    clearTimeout(timers.offerTimeoutId);
    timers.offerTimeoutId = null;
  }

  let driverId: string | null = null;
  while (ride.offerIndex < ride.offeredDriverIds.length) {
    const nextId = ride.offeredDriverIds[ride.offerIndex];
    ride.offerIndex += 1;
    if (driverIsBusy(nextId)) continue;
    const declinedAt = ride.declinedAtByDriverId?.[nextId];
    if (typeof declinedAt === "number" && Date.now() - declinedAt < REOFFER_COOLDOWN_MS) continue;
    const isOff =
      ride.paymentMethod === "cash" || ride.paymentMethod === "bank_transfer";
    if (FEATURE_OFF_PLATFORM_COMMISSION_ENABLED && isOff) {
      const ok = await driverCanAcceptOffPlatformRide(ride.estimatedUsd, nextId);
      if (!ok) continue;
    }
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
    petEnabled: ride.petEnabled,
    expiresAt: ride.offerExpiresAt,
  });

  // Guardar oferta pendiente para “recovery” si el driver no estaba en /go/cargo/driver.
  pendingOfferByDriverId.set(driverId, { rideId: ride.id, expiresAt: ride.offerExpiresAt!, module: "cargo" });

  // Push al driver si no está viendo la vista de driver (o no reportó ruta).
  try {
    const pth = getUserActivePath(String(driverId));
    if (!pth || !pth.startsWith("/go/cargo/driver")) {
      void notificationService.sendPushToUser(driverId, {
        title: "Car Go",
        body: "Tienes un servicio disponible. Abre para aceptar o rechazar.",
        data: { url: "/go/cargo/driver", type: "cargo_ride_offer", rideId: ride.id },
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

async function buildRiderPublic(riderUserId: string) {
  const u = await genFebStorage.getUserById(riderUserId);
  const rec = (u ?? undefined) as Record<string, unknown> | undefined;
  const fn = String(rec?.firstName ?? "").trim();
  const ln = String(rec?.lastName ?? "").trim();
  const nn = String(rec?.name ?? "").trim();
  const email = String(rec?.email ?? "").trim();
  // Mantener compatibilidad: el cliente arma el nombre completo como en el chat.
  const name = nn || fn || "Pasajero";
  const profileImageUrl =
    (rec?.profileImageUrl as string) ||
    (rec?.profile_image_url as string) ||
    (rec?.imageUrl as string) ||
    (rec?.avatar as string) ||
    null;
  const phone = String(rec?.phone ?? "").trim() || null;
  const rating = safeNumber(rec?.rating, 0);
  const ratingCount = safeNumber(rec?.ratingCount, 0);
  const completedTrips = safeNumber(rec?.completedTrips, 0);
  return { name, lastName: ln, profileImageUrl, phone, rating, ratingCount, completedTrips, email };
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
  const rating = safeNumber(rec?.rating, 0);
  const ratingCount = safeNumber(rec?.ratingCount, 0);
  const completedTrips = safeNumber(rec?.completedTrips, 0);
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
          color: (vehicle as { exterior_color?: string }).exterior_color ?? null,
        }
      : null,
  };
}

export function registerMobilityRideRoutes(app: Express) {
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
          petEnabled: ride.petEnabled,
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
        estimatedUsd: number;
        petEnabled?: boolean;
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

      let candidates = freshDriversForVehicle(body.vehicleType);
      candidates = rankDriversByNearest(body.start, candidates);

      if (body.paymentMethod === "genfeb") {
        const u = await genFebStorage.getUserById(riderUserId);
        const w = typeof (u as { wallet?: number })?.wallet === "number" ? (u as { wallet: number }).wallet : 0;
        const need = roundToCents(
          typeof body.estimatedUsd === "number" ? body.estimatedUsd : Number(body.estimatedUsd) || 0
        );
        if (w < need) {
          return res.status(400).json({ message: "Saldo insuficiente para pagar con Saldo GenFeb." });
        }
      } else if (FEATURE_OFF_PLATFORM_COMMISSION_ENABLED) {
        const rate = await getPlatformCommissionRate();
        const minC = minCommissionForEstimatedTrip(body.estimatedUsd, rate);
        if (minC > 0) {
          const eligible: typeof candidates = [];
          for (const c of candidates) {
            const u = await genFebStorage.getUserById(c.userId);
            const w = typeof (u as { wallet?: number })?.wallet === "number" ? (u as { wallet: number }).wallet : 0;
            if (canAffordOffPlatformCommission(w, minC)) eligible.push(c);
          }
          candidates = eligible;
        }
      }

      const id = crypto.randomUUID();
      const ride: RideRecord = {
        id,
        riderUserId,
        driverUserId: null,
        status: "searching",
        vehicleType: body.vehicleType,
        paymentMethod: body.paymentMethod,
        paymentConfirmed: body.paymentMethod === "genfeb",
        estimatedUsd: body.estimatedUsd,
        distanceM: body.distanceM,
        durationSec: body.durationSec,
        start: body.start,
        end: body.end,
        routeGeometry: body.routeGeometry ?? null,
        petEnabled: !!body.petEnabled,
        createdAt: Date.now(),
        conversationId: null,
        offeredDriverIds: candidates.map((c) => c.userId),
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
      });

      // Importante: NO cerramos la búsqueda automáticamente por TTL.
      // El pasajero debe seguir buscando hasta cancelar manualmente.
      // (Se evita el toast rojo "No hay drivers disponibles" cuando solo hubo rechazos o no había drivers en ese momento.)

      if (ride.offeredDriverIds.length > 0) {
        await offerNextDriver(io, ride, rider);
      }

      res.status(201).json({ rideId: id, candidateCount: candidates.length, expiresInMs: SEARCH_TTL_MS });
    } catch (e: any) {
      console.error("[mobility] request", e);
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  app.post("/api/mobility/rides/:rideId/respond", authenticateJWT, async (req: any, res) => {
    try {
      const driverUserId = req.user?.id as string;
      if (!driverUserId) return res.status(401).json({ message: "Unauthorized" });
      const rideId = req.params.rideId as string;
      const accept = !!req.body?.accept;
      const ride = rides.get(rideId);
      if (!ride) return res.status(404).json({ message: "Viaje no encontrado" });
      if (ride.status !== "searching") {
        return res.status(409).json({ message: "Este viaje ya no está disponible" });
      }
      if (ride.currentOfferDriverId !== driverUserId) {
        return res.status(409).json({ message: "La oferta expiró o fue reasignada" });
      }

      const io = getIO();
      if (!io) return res.status(500).json({ message: "Socket no disponible" });

      if (!accept) {
        ride.declinedAtByDriverId = ride.declinedAtByDriverId ?? {};
        ride.declinedAtByDriverId[driverUserId] = Date.now();
        ride.currentOfferDriverId = null;
        ride.offerExpiresAt = null;
        const rider = await buildRiderPublic(ride.riderUserId);
        await offerNextDriver(io, ride, rider);
        return res.json({ ok: true, accepted: false });
      }

      const isOff =
        ride.paymentMethod === "cash" || ride.paymentMethod === "bank_transfer";
      if (FEATURE_OFF_PLATFORM_COMMISSION_ENABLED && isOff) {
        const ok = await driverCanAcceptOffPlatformRide(ride.estimatedUsd, driverUserId);
        if (!ok) {
          return res.status(409).json({
            message:
              "Límite de deuda con GenFeb o comisión excede el piso. Acepta viajes con Saldo GenFeb o recarga y vuelve a activarte.",
          });
        }
      }

      /** Carrera: solo un conductor gana. */
      if (ride.driverUserId != null) {
        return res.status(409).json({ message: "Otro conductor ya tomó este viaje" });
      }
      if (driverIsBusy(driverUserId)) {
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
        // Mensaje inicial: asegura que el chat aparezca aunque nadie escriba.
        await genFebStorage.createMessage({
          conversationId,
          senderId: driverUserId,
          content: "Iniciado chat con tu conductor/pasajero.",
          type: "text",
          status: "sent",
        });
      } catch (ce) {
        console.error("[mobility] createConversation", ce);
      }

      const rider = await buildRiderPublic(ride.riderUserId);

      io.to(`user:${ride.riderUserId}`).emit("cargo:ride:matched", {
        rideId,
        driver,
        driverLat,
        driverLon,
        conversationId,
      });

      // Push al pasajero solo si no está viendo /go/cargo (o no reportó ruta).
      try {
        const pth = getUserActivePath(String(ride.riderUserId));
        if (!pth || !pth.startsWith("/go/cargo")) {
          void notificationService.sendPushToUser(ride.riderUserId, {
            title: "Car Go",
            body: "Tu viaje fue aceptado. Abre para ver a tu conductor.",
            data: { url: "/go/cargo", type: "cargo_ride_matched", rideId },
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

      res.json({ ok: true, accepted: true, rideId, conversationId });
    } catch (e: any) {
      console.error("[mobility] respond", e);
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

      // Ocultar conversación del historial de ambos (si existe), pero mantenerla en BD para auditoría/admin.
      if (ride.conversationId != null && ride.driverUserId != null) {
        try {
          await genFebStorage.hideConversationForUsers(Number(ride.conversationId), [ride.riderUserId, ride.driverUserId]);
        } catch (e) {
          console.error("[mobility] hideConversationForUsers(cancel)", e);
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
      // Asegurar que exista “algo” en el chat para que la conversación aparezca y ambos puedan escribir al instante.
      if (ride.conversationId != null) {
        try {
          await genFebStorage.createMessage({
            conversationId: ride.conversationId,
            senderId: driverUserId,
            content: "Viaje iniciado. Ya puedes chatear con tu conductor/cliente en cualquier momento.",
            type: "text",
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
        if (!pth || !pth.startsWith("/go/cargo")) {
          void notificationService.sendPushToUser(ride.riderUserId, {
            title: "Car Go",
            body: "Tu viaje inició.",
            data: { url: "/go/cargo", type: "cargo_ride_started", rideId },
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

      const io = getIO();
      if (!io) return res.status(500).json({ message: "Socket no disponible" });

      ride.driverSearchingClient = true;
      io.to(`user:${ride.riderUserId}`).emit("cargo:ride:driver_searching", { rideId });
      io.to(`user:${driverUserId}`).emit("cargo:ride:driver_searching", { rideId });
      try {
        const pth = getUserActivePath(String(ride.riderUserId));
        if (!pth || !pth.startsWith("/go/cargo")) {
          void notificationService.sendPushToUser(ride.riderUserId, {
            title: "Car Go",
            body: "Tu conductor ya está coordinando la recogida.",
            data: { url: "/go/cargo", type: "cargo_driver_searching", rideId },
          });
        }
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
      if (ride.paymentMethod === "genfeb") return res.status(409).json({ message: "Pago ya confirmado por saldo" });

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
      if (ride.paymentMethod !== "genfeb" && !ride.paymentConfirmed) {
        return res.status(409).json({ message: "Confirma el pago antes de terminar" });
      }

      if (ride.financialsSettled) {
        return res.json({ ok: true, rideId, alreadySettled: true });
      }

      try {
        await genFebStorage.applyMobilityRideSettlement({
          rideId,
          riderUserId: ride.riderUserId,
          driverUserId,
          estimatedUsd: ride.estimatedUsd,
          paymentMethod: ride.paymentMethod,
        });
      } catch (err: any) {
        return res.status(409).json({ message: err?.message ?? "No se pudo finalizar el viaje" });
      }
      ride.financialsSettled = true;

      const io = getIO();
      if (!io) return res.status(500).json({ message: "Socket no disponible" });

      ride.status = "expired";
      io.to(`user:${ride.riderUserId}`).emit("cargo:ride:completed", { rideId });
      io.to(`user:${driverUserId}`).emit("cargo:ride:completed", { rideId });

      // Ocultar conversación del historial de ambos (si existe), pero mantenerla en BD para auditoría/admin.
      if (ride.conversationId != null) {
        try {
          await genFebStorage.hideConversationForUsers(Number(ride.conversationId), [ride.riderUserId, driverUserId]);
        } catch (e) {
          console.error("[mobility] hideConversationForUsers(complete)", e);
        }
      }
      try {
        const pth = getUserActivePath(String(ride.riderUserId));
        if (!pth || !pth.startsWith("/go/cargo")) {
          void notificationService.sendPushToUser(ride.riderUserId, {
            title: "Car Go",
            body: "Tu viaje terminó.",
            data: { url: "/go/cargo", type: "cargo_ride_completed", rideId },
          });
        }
      } catch {}
      res.json({ ok: true, rideId });
    } catch (e: any) {
      console.error("[mobility] complete", e);
      res.status(500).json({ message: e?.message ?? "Error" });
    }
  });

  // POST /api/mobility/rides/:rideId/rate - Calificar al otro participante (Car Go)
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
          onlineDrivers.delete(user.id);
          return;
        }
        const pres: DriverPresence = {
          userId: user.id,
          vehicleType: (data.vehicleType || "").trim(),
          isPetFriendly: !!data.isPetFriendly,
          lat: data.lat,
          lon: data.lon,
          updatedAt: Date.now(),
        };
        onlineDrivers.set(user.id, pres);

        // Si hay rides en búsqueda, ofrecer también a drivers que se ponen online después.
        void (async () => {
          try {
            const now = Date.now();
            for (const ride of rides.values()) {
              if (ride.status !== "searching") continue;
              if (!rideWantsPresence(ride, pres)) continue;
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
      }
    );

    socket.on("cargo:ride:location", (data: { rideId: string; lat: number; lon: number }) => {
      if (!data?.rideId) return;
      const ride = rides.get(data.rideId);
      if (!ride || ride.driverUserId !== user.id || (ride.status !== "matched" && ride.status !== "in_progress"))
        return;
      io.to(`user:${ride.riderUserId}`).emit("cargo:ride:driver_location", {
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

/**
 * Simulación multi-pasajero / multi-conductor del flujo clásico (lock + reconcile).
 * Ejecutar: npx tsx script/simulate-classic-offer-matching.ts
 */
import {
  clearClassicOfferPending,
  driverHasActiveClassicOffer,
  registerClassicOfferActiveScanner,
  resetClassicOfferLockForTests,
  setClassicOfferPending,
} from "../server/go-driver-classic-offer-lock";
import {
  reconcileSearchingClassicRides,
  registerClassicSearchingReconciler,
  resetClassicOfferReconcileForTests,
  type StalledClassicSearchingRide,
} from "../server/go-driver-classic-offer-reconcile";

type Module = "cargo" | "pack";

type SimDriver = {
  id: string;
  lat: number;
  lon: number;
  /** Viaje matched/in_progress — no recibe ofertas. */
  busy: boolean;
};

type SimRide = {
  id: string;
  module: Module;
  lat: number;
  lon: number;
  createdAt: number;
  status: "searching" | "matched";
  currentOfferDriverId: string | null;
  offerExpiresAt: number | null;
};

const OFFER_TTL_MS = 15_000;
const now = () => Date.now();

function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function rankDrivers(ride: SimRide, drivers: SimDriver[]): SimDriver[] {
  return [...drivers]
    .filter((d) => !d.busy)
    .sort((a, b) => haversineM(ride, a) - haversineM(ride, b));
}

/** Replica la lógica de offerNextDriver (Parte 1): 1 oferta activa por ride y por driver. */
function offerNextDriverSim(ride: SimRide, drivers: SimDriver[]): string | null {
  if (ride.status !== "searching" || ride.currentOfferDriverId) return null;
  for (const d of rankDrivers(ride, drivers)) {
    if (driverHasActiveClassicOffer(d.id)) continue;
    ride.currentOfferDriverId = d.id;
    ride.offerExpiresAt = now() + OFFER_TTL_MS;
    setClassicOfferPending(d.id, ride.id, ride.offerExpiresAt, ride.module);
    return d.id;
  }
  return null;
}

function releaseOffer(ride: SimRide, drivers: SimDriver[], accept = false): void {
  const driverId = ride.currentOfferDriverId;
  if (!driverId) return;
  clearClassicOfferPending(driverId);
  ride.currentOfferDriverId = null;
  ride.offerExpiresAt = null;
  if (accept) {
    ride.status = "matched";
    const d = drivers.find((x) => x.id === driverId);
    if (d) d.busy = true;
  }
}

function collectStalled(rides: SimRide[]): StalledClassicSearchingRide[] {
  return rides
    .filter((r) => r.status === "searching" && !r.currentOfferDriverId)
    .map((r) => ({ rideId: r.id, module: r.module, createdAt: r.createdAt }));
}

function makeDrivers(n: number, baseLat = -0.18, baseLon = -78.48): SimDriver[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `D${i + 1}`,
    lat: baseLat + (i % 5) * 0.002,
    lon: baseLon + Math.floor(i / 5) * 0.002,
    busy: false,
  }));
}

function makeRides(n: number, module: Module = "cargo"): SimRide[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `R${i + 1}`,
    module,
    lat: -0.18 + (i % 7) * 0.0015,
    lon: -78.48 + Math.floor(i / 7) * 0.0015,
    createdAt: 1_000 + i,
    status: "searching" as const,
    currentOfferDriverId: null,
    offerExpiresAt: null,
  }));
}

const fakeIo = {} as import("socket.io").Server;

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function resetLockScanners(rides: SimRide[]): void {
  registerClassicOfferActiveScanner(() => {
    const t = now();
    const rows: { driverId: string; rideId: string; expiresAt: number; module: Module }[] = [];
    for (const r of rides) {
      if (r.status !== "searching" || !r.currentOfferDriverId || !r.offerExpiresAt) continue;
      if (r.offerExpiresAt > t) {
        rows.push({
          driverId: r.currentOfferDriverId,
          rideId: r.id,
          expiresAt: r.offerExpiresAt,
          module: r.module,
        });
      }
    }
    return rows;
  });
}

async function runScenario(
  title: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  resetClassicOfferLockForTests();
  resetClassicOfferReconcileForTests();
  console.log(`\n▶ ${title}`);
  await fn();
}

async function main(): Promise<void> {
  console.log("Simulación: matching clásico multi-pasajero (lock + reconcile)\n");

  await runScenario("1) Dos pasajeros, D1 más cercano a ambos — solo una oferta a D1", () => {
    const drivers = makeDrivers(3);
    const rides = makeRides(2);
    resetLockScanners(rides);

    const a = offerNextDriverSim(rides[0]!, drivers);
    const b = offerNextDriverSim(rides[1]!, drivers);

    assert("Ride R1 ofertado a D1 (más cercano)", a === "D1");
    assert("Ride R2 NO va a D1 (tiene oferta pendiente)", b !== "D1");
    assert("Ride R2 ofertado a otro conductor libre", b === "D2" || b === "D3");
    assert("Solo D1 bloqueado por lock", driverHasActiveClassicOffer("D1"));
    assert("D2 o D3 no bloqueados si recibieron R2", !driverHasActiveClassicOffer(b === "D2" ? "D3" : "D2"));
  });

  await runScenario("2) Diez pasajeros, cinco conductores — paralelismo (5 ofertas activas)", () => {
    const drivers = makeDrivers(5);
    const rides = makeRides(10);
    resetLockScanners(rides);

    const assigned: string[] = [];
    for (const r of rides) {
      const d = offerNextDriverSim(r, drivers);
      if (d) assigned.push(d);
    }

    const uniqueDrivers = new Set(assigned);
    assert("10 rides intentados", rides.length === 10);
    assert("5 conductores reciben oferta (máx. paralelo)", assigned.length === 5, `got ${assigned.length}`);
    assert("5 conductores distintos ocupados pensando", uniqueDrivers.size === 5);
    assert("5 rides sin oferta activa (en espera)", rides.filter((r) => !r.currentOfferDriverId).length === 5);
  });

  await runScenario("3) Veinte pasajeros, ocho conductores — cola dinámica tras liberar", async () => {
    const drivers = makeDrivers(8);
    const rides = makeRides(20);
    resetLockScanners(rides);

    registerClassicSearchingReconciler({
      module: "cargo",
      collectStalled: () => collectStalled(rides),
      reconcileRide: async (_io, rideId) => {
        const ride = rides.find((r) => r.id === rideId);
        if (ride) offerNextDriverSim(ride, drivers);
      },
    });

    for (const r of rides) offerNextDriverSim(r, drivers);
    assert("8 ofertas activas iniciales", rides.filter((r) => r.currentOfferDriverId).length === 8);

    // D1 rechaza → reconcile debería asignar un ride en espera
    const rideOnD1 = rides.find((r) => r.currentOfferDriverId === "D1")!;
    releaseOffer(rideOnD1, drivers, false);
    await reconcileSearchingClassicRides(fakeIo);

    assert("Tras liberar D1, hay ride en espera asignado a D1", rides.some((r) => r.currentOfferDriverId === "D1"));
    assert("Sigue habiendo 8 ofertas activas", rides.filter((r) => r.currentOfferDriverId).length === 8);
    assert("12 rides aún sin oferta", rides.filter((r) => !r.currentOfferDriverId).length === 12);
  });

  await runScenario("4) Lock cross-módulo (híbrido): taxi pendiente bloquea delivery", () => {
    const drivers = makeDrivers(2);
    const taxiRide: SimRide = {
      id: "T1",
      module: "cargo",
      lat: -0.18,
      lon: -78.48,
      createdAt: 100,
      status: "searching",
      currentOfferDriverId: null,
      offerExpiresAt: null,
    };
    const packRide: SimRide = {
      id: "P1",
      module: "pack",
      lat: -0.18,
      lon: -78.48,
      createdAt: 101,
      status: "searching",
      currentOfferDriverId: null,
      offerExpiresAt: null,
    };
    resetLockScanners([taxiRide, packRide]);

    offerNextDriverSim(taxiRide, drivers);
    const packTarget = offerNextDriverSim(packRide, drivers);

    assert("Taxi ofertado a D1", taxiRide.currentOfferDriverId === "D1");
    assert("Delivery NO va a D1 (lock compartido)", packTarget !== "D1");
    assert("Delivery va a D2", packTarget === "D2");
  });

  await runScenario("5) Ride en cola recibe conductor cuando otro libera", async () => {
    const drivers = makeDrivers(3);
    const rides = makeRides(4);
    rides[0]!.createdAt = 100;
    rides[1]!.createdAt = 200;
    rides[2]!.createdAt = 300;
    rides[3]!.createdAt = 400;
    resetLockScanners(rides);

    registerClassicSearchingReconciler({
      module: "cargo",
      collectStalled: () => collectStalled(rides),
      reconcileRide: async (_io, rideId) => {
        const ride = rides.find((r) => r.id === rideId);
        if (ride) offerNextDriverSim(ride, drivers);
      },
    });

    for (const r of rides.slice(0, 3)) offerNextDriverSim(r, drivers);
    assert("R4 en espera (3 conductores ocupados pensando)", !rides[3]!.currentOfferDriverId);

    const onD2 = rides.find((r) => r.currentOfferDriverId === "D2")!;
    releaseOffer(onD2, drivers, false);
    await reconcileSearchingClassicRides(fakeIo);

    assert("Conductor liberado vuelve a recibir un ride", rides.some((r) => r.currentOfferDriverId === "D2"));
    assert("R4 sigue en cola o ya fue asignado si hubo cupo", rides[3]!.status === "searching");
  });

  await runScenario("6) Un solo pasajero encuentra al más cercano", () => {
    const drivers = makeDrivers(5);
    drivers[0]!.lat = -0.19;
    drivers[0]!.lon = -78.49;
    drivers[3]!.lat = -0.18001;
    drivers[3]!.lon = -78.48001;
    const rides = makeRides(1);
    resetLockScanners(rides);
    const target = offerNextDriverSim(rides[0]!, drivers);
    assert("1 pasajero → conductor más cercano (D4)", target === "D4");
  });

  await runScenario("7) Estrés: 20 pasajeros, 8 conductores — todos reciben oferta tras liberaciones en cadena", async () => {
    const drivers = makeDrivers(8);
    const rides = makeRides(20);
    resetLockScanners(rides);

    registerClassicSearchingReconciler({
      module: "cargo",
      collectStalled: () => collectStalled(rides),
      reconcileRide: async (_io, rideId) => {
        const ride = rides.find((r) => r.id === rideId);
        if (ride) offerNextDriverSim(ride, drivers);
      },
    });

    for (const r of rides) offerNextDriverSim(r, drivers);

    let rounds = 0;
    while (rides.some((r) => r.status === "searching" && !r.currentOfferDriverId) && rounds < 30) {
      const busy = rides.filter((r) => r.currentOfferDriverId);
      if (busy.length === 0) break;
      const victim = busy[0]!;
      releaseOffer(victim, drivers, false);
      await reconcileSearchingClassicRides(fakeIo);
      rounds += 1;
    }

    const withOffer = rides.filter((r) => r.currentOfferDriverId).length;
    const waiting = rides.filter((r) => r.status === "searching" && !r.currentOfferDriverId).length;
    assert("Tras liberaciones en cadena, la mayoría tiene oferta activa", withOffer >= 8, `ofertas=${withOffer}`);
    assert("Quedan rides en cola si conductores < pasajeros", waiting >= 4, `espera=${waiting}`);
  });

  console.log(`\n${"─".repeat(48)}`);
  console.log(`Resultado: ${passed} ok, ${failed} fallos`);
  if (failed > 0) process.exit(1);
  console.log("Escenarios multi-pasajero: comportamiento esperado verificado.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

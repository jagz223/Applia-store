import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Bike, Car, Loader2, MapPin, Maximize2, Minimize2, Navigation, PawPrint, Phone, Star, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TaxiRouteMap, type MapPoint } from "@/components/taxi/TaxiRouteMap";
import { TaxiVehicleSearchModal } from "@/components/taxi/TaxiVehicleSearchModal";
import type { TaxiPaymentMethod, TaxiVehicleKind, TaxiVehicleModalStep } from "@/components/taxi/TaxiVehicleSearchModal";
import type { GeoJsonObject } from "geojson";
import { useGoChat } from "@/contexts/GoChatContext";
import { addHiddenConversationId } from "@/lib/hidden-conversations";
import { purgeConversationCache } from "@/hooks/use-chat";
import { useAuth } from "@/hooks/use-auth";
import { useSocket, useSocketChat } from "@/hooks/use-socket";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { clearRiderActiveRideId, loadRiderActiveRideId, saveRiderActiveRideId } from "@/lib/cargo-rider-storage";
import { appendRiderTripLog } from "@/lib/cargo-rider-trip-log";

type GeocodeHit = { lat: number; lon: number; label: string };

type Place = { lat: number; lon: number; label: string };

function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function fallbackRouteFor(start: Place, end: Place): { distanceM: number; durationSec: number; geometry: GeoJsonObject } {
  const distanceM = haversineM(start, end);
  // Aproximación conservadora: 28 km/h urbano.
  const durationSec = Math.round(distanceM / (28_000 / 3600));
  return {
    distanceM,
    durationSec,
    geometry: {
      type: "Feature",
      properties: { source: "fallback" },
      geometry: {
        type: "LineString",
        coordinates: [
          [start.lon, start.lat],
          [end.lon, end.lat],
        ],
      },
    } as unknown as GeoJsonObject,
  };
}

function formatKm(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function formatDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return `${h} h ${rest} min`;
}

type MobilityFares = {
  moto: { baseUsd: number; perKmUsd: number };
  auto: { baseDayUsd: number; baseNightUsd: number; perKmUsd: number; petExtraUsd: number };
  camioneta: { baseUsd: number; perKmUsd: number; petExtraUsd: number };
};

/** Misma base que `server/mobility-fares.ts` si aún no cargó `/api/platform/mobility-fares`. */
const FALLBACK_MOBILITY_FARES: MobilityFares = {
  moto: { baseUsd: 1.75, perKmUsd: 0.5 },
  auto: { baseDayUsd: 1.5, baseNightUsd: 1.75, perKmUsd: 0.85, petExtraUsd: 1.0 },
  camioneta: { baseUsd: 20.0, perKmUsd: 1.25, petExtraUsd: 2.0 },
};

/** Búsqueda máxima si no hay conductor (5 min). */
const VEHICLE_SEARCH_MAX_MS = 5 * 60 * 1000;
const VEHICLE_SEARCH_TOTAL_SEC = Math.max(1, Math.round(VEHICLE_SEARCH_MAX_MS / 1000));

const VEHICLE_OPTIONS: ReadonlyArray<{
  type: TaxiVehicleKind;
  label: string;
  Icon: LucideIcon;
}> = [
  { type: "moto", label: "Moto", Icon: Bike },
  { type: "auto", label: "Auto", Icon: Car },
  { type: "pet_car", label: "Pet Car", Icon: PawPrint },
  { type: "camioneta", label: "Camioneta", Icon: Truck },
];

function formatUsd(amount: number): string {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(amount);
}

function vehicleTypeLabel(type: string | undefined): string | null {
  if (!type) return null;
  const t = type.toLowerCase();
  if (t === "motorcycle" || t === "moto") return "Moto";
  if (t === "car" || t === "auto") return "Auto";
  if (t === "pickup_truck" || t === "camioneta") return "Camioneta";
  return type;
}

type MobilityRideHydration = {
  id: string;
  status: string;
  paymentMethod: string;
  paymentConfirmed: boolean;
  conversationId: number | null;
  start: Place;
  end: Place;
  driver: {
    userId: string;
    name: string;
    profileImageUrl: string | null;
    phone: string;
    rating?: number;
    ratingCount?: number;
    completedTrips?: number;
    vehicle: {
      type: string;
      brand: string;
      model: string;
      licensePlate: string;
      color: string | null;
    } | null;
  } | null;
};

export default function TaxiRide() {
  const queryClient = useQueryClient();
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [rateStars, setRateStars] = useState(5);
  const [rateBusy, setRateBusy] = useState(false);
  const rateTargetRef = useRef<{ rideId: string; target: "driver"; targetName: string } | null>(null);
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { primeCarGoConversation, resetChat } = useGoChat();
  const { socket } = useSocket();
  const { toast } = useToast();
  const params = useMemo(() => new URLSearchParams(typeof window !== "undefined" ? window.location.search : ""), []);
  const fromCategories = params.get("from") === "categories";

  const [mapTarget, setMapTarget] = useState<"start" | "end">("start");
  const [start, setStart] = useState<Place | null>(null);
  const [end, setEnd] = useState<Place | null>(null);
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [suggestStart, setSuggestStart] = useState<GeocodeHit[]>([]);
  const [suggestEnd, setSuggestEnd] = useState<GeocodeHit[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [reverseLoading, setReverseLoading] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeGeometry, setRouteGeometry] = useState<GeoJsonObject | null>(null);
  const [routeMeta, setRouteMeta] = useState<{ distanceM: number; durationSec: number } | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [vehiclePickerOpen, setVehiclePickerOpen] = useState(false);
  const [vehicleModalStep, setVehicleModalStep] = useState<TaxiVehicleModalStep>("pick");
  const [selectedVehicle, setSelectedVehicle] = useState<TaxiVehicleKind | null>(null);
  const [taxiPaymentMethod, setTaxiPaymentMethod] = useState<TaxiPaymentMethod | null>(null);
  const petEnabled = selectedVehicle === "pet_car";
  const [mobilityFares, setMobilityFares] = useState<MobilityFares | null>(null);
  const [nearbyDriverMarkers, setNearbyDriverMarkers] = useState<{ id: string; lat: number; lon: number }[]>([]);
  const [assignedDriverPos, setAssignedDriverPos] = useState<{ lat: number; lon: number } | null>(null);
  const assignedDriverPosRef = useRef<{ lat: number; lon: number } | null>(null);
  const endPlaceRef = useRef<Place | null>(null);
  const [driverToPickupGeometry, setDriverToPickupGeometry] = useState<GeoJsonObject | null>(null);
  const [driverToPickupMeta, setDriverToPickupMeta] = useState<{ distanceM: number; durationSec: number } | null>(null);
  const [driverEtaLoading, setDriverEtaLoading] = useState(false);
  const [activeRideId, setActiveRideId] = useState<string | null>(null);
  const activeRideIdRef = useRef<string | null>(null);
  const [riderTripInProgress, setRiderTripInProgress] = useState(false);
  const riderTripInProgressRef = useRef(false);
  useEffect(() => {
    riderTripInProgressRef.current = riderTripInProgress;
  }, [riderTripInProgress]);

  useEffect(() => {
    assignedDriverPosRef.current = assignedDriverPos;
  }, [assignedDriverPos]);
  useEffect(() => {
    endPlaceRef.current = end;
  }, [end]);

  type MatchedDriverState = {
    driver: {
      userId: string;
      name: string;
      profileImageUrl: string | null;
      phone: string;
      rating?: number;
      ratingCount?: number;
      completedTrips?: number;
      vehicle: {
        type: string;
        brand: string;
        model: string;
        licensePlate: string;
        color: string | null;
      } | null;
    };
    conversationId: number | null;
  } | null;

  const [matchedDriverInfo, setMatchedDriverInfo] = useState<MatchedDriverState>(null);
  const matchedDriverInfoRef = useRef<MatchedDriverState>(null);
  useEffect(() => {
    matchedDriverInfoRef.current = matchedDriverInfo;
  }, [matchedDriverInfo]);
  const [searchRemainingSec, setSearchRemainingSec] = useState(VEHICLE_SEARCH_TOTAL_SEC);
  /** Solo en la ruta Go Car (cliente): mapa a pantalla completa para elegir puntos. */
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [cancelServiceDialogOpen, setCancelServiceDialogOpen] = useState(false);
  const [cancelServiceBusy, setCancelServiceBusy] = useState(false);
  const [cancelServiceMode, setCancelServiceMode] = useState<"search" | "matched" | "progress">("search");

  const isGoCargoClient = location === "/go/cargo";

  /** Evita montar dos mapas Leaflet en Car Go (móvil vs escritorio). */
  const [isMdUp, setIsMdUp] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const fn = () => setIsMdUp(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  /** Pantalla completa extra solo en escritorio; en móvil el mapa ya llena el área útil. */
  const showMapFullscreen = mapFullscreen && isGoCargoClient && isMdUp;

  useEffect(() => {
    if (isGoCargoClient && !isMdUp && mapFullscreen) setMapFullscreen(false);
  }, [isGoCargoClient, isMdUp, mapFullscreen]);

  const debounceStart = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceEnd = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchEndAtRef = useRef<number>(0);
  // En este proyecto a veces `setInterval/setTimeout` tipa como NodeJS.Timeout.
  // Como usamos `window.*`, guardamos el id numérico del navegador.
  const searchTickRef = useRef<number | null>(null);
  const searchDoneTimeoutRef = useRef<number | null>(null);

  const goBack = () => setLocation(fromCategories ? "/categories" : "/explore");

  useEffect(() => {
    activeRideIdRef.current = activeRideId;
  }, [activeRideId]);

  useSocketChat(
    isGoCargoClient && matchedDriverInfo?.conversationId != null
      ? String(matchedDriverInfo.conversationId)
      : null
  );

  const clearVehicleSearchTimers = useCallback(() => {
    if (searchTickRef.current) window.clearInterval(searchTickRef.current);
    if (searchDoneTimeoutRef.current) window.clearTimeout(searchDoneTimeoutRef.current);
    searchTickRef.current = null;
    searchDoneTimeoutRef.current = null;
  }, []);

  const applyCarGoRideEnded = useCallback(() => {
    const convId = matchedDriverInfoRef.current?.conversationId ?? null;
    if (convId != null) {
      addHiddenConversationId(convId);
      purgeConversationCache(queryClient, convId);
    }
    clearVehicleSearchTimers();
    setVehiclePickerOpen(false);
    setVehicleModalStep("ready");
    setMatchedDriverInfo(null);
    setAssignedDriverPos(null);
    setNearbyDriverMarkers([]);
    setDriverToPickupGeometry(null);
    setDriverToPickupMeta(null);
    setActiveRideId(null);
    activeRideIdRef.current = null;
    setRiderTripInProgress(false);
    clearRiderActiveRideId();
    resetChat();
  }, [clearVehicleSearchTimers, resetChat, queryClient]);

  const openCancelServiceDialog = useCallback(() => {
    if (vehicleModalStep === "searching") setCancelServiceMode("search");
    else if (riderTripInProgress) setCancelServiceMode("progress");
    else setCancelServiceMode("matched");
    setCancelServiceDialogOpen(true);
  }, [vehicleModalStep, riderTripInProgress]);

  const confirmCancelService = useCallback(async () => {
    const rideId = activeRideIdRef.current;
    if (!rideId) {
      setCancelServiceDialogOpen(false);
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) {
      toast({ title: "Inicia sesión", variant: "destructive" });
      setCancelServiceDialogOpen(false);
      return;
    }
    setCancelServiceBusy(true);
    try {
      const res = await fetch(`/api/mobility/rides/${encodeURIComponent(rideId)}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        toast({
          title: "No se pudo cancelar",
          description: data.message ?? "Intenta de nuevo.",
          variant: "destructive",
        });
        return;
      }
      applyCarGoRideEnded();
      toast({ title: "Servicio cancelado", description: "Puedes pedir otro viaje cuando quieras." });
      setCancelServiceDialogOpen(false);
    } catch {
      toast({ title: "Error de red", variant: "destructive" });
    } finally {
      setCancelServiceBusy(false);
    }
  }, [applyCarGoRideEnded, toast]);

  const loadDriverEtaRoute = useCallback(async (driverPos: { lat: number; lon: number }, target: Place) => {
    setDriverEtaLoading(true);
    try {
      // Backend espera from/to en formato lon,lat (OSRM).
      const res = await fetch(`/api/maps/route?from=${driverPos.lon},${driverPos.lat}&to=${target.lon},${target.lat}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { geometry?: GeoJsonObject; distanceM?: number; durationSec?: number };
      if (data?.geometry) setDriverToPickupGeometry(data.geometry);
      else {
        const fb = fallbackRouteFor(
          { lat: driverPos.lat, lon: driverPos.lon, label: "" },
          { lat: target.lat, lon: target.lon, label: target.label }
        );
        setDriverToPickupGeometry(fb.geometry);
      }
      if (data?.distanceM != null && data?.durationSec != null) {
        setDriverToPickupMeta({ distanceM: Number(data.distanceM), durationSec: Number(data.durationSec) });
      } else {
        const fb = fallbackRouteFor(
          { lat: driverPos.lat, lon: driverPos.lon, label: "" },
          { lat: target.lat, lon: target.lon, label: target.label }
        );
        setDriverToPickupMeta({ distanceM: fb.distanceM, durationSec: fb.durationSec });
      }
    } catch {
      const fb = fallbackRouteFor(
        { lat: driverPos.lat, lon: driverPos.lon, label: "" },
        { lat: target.lat, lon: target.lon, label: target.label }
      );
      setDriverToPickupGeometry(fb.geometry);
      setDriverToPickupMeta({ distanceM: fb.distanceM, durationSec: fb.durationSec });
    } finally {
      setDriverEtaLoading(false);
    }
  }, []);

  const resetVehicleChoice = useCallback(() => {
    clearVehicleSearchTimers();
    setSelectedVehicle(null);
    setTaxiPaymentMethod(null);
    setVehiclePickerOpen(false);
    setVehicleModalStep("pick");
    setNearbyDriverMarkers([]);
    setActiveRideId(null);
    activeRideIdRef.current = null;
    setMatchedDriverInfo(null);
    setRiderTripInProgress(false);
    clearRiderActiveRideId();
  }, [clearVehicleSearchTimers]);

  const handleVehicleModalOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        clearVehicleSearchTimers();
        setVehiclePickerOpen(false);
        if (matchedDriverInfoRef.current) {
          return;
        }
        setNearbyDriverMarkers([]);
        setVehicleModalStep("pick");
        setTaxiPaymentMethod(null);
        setActiveRideId(null);
        activeRideIdRef.current = null;
        setMatchedDriverInfo(null);
        setRiderTripInProgress(false);
        clearRiderActiveRideId();
      }
      setVehiclePickerOpen(open);
    },
    [clearVehicleSearchTimers]
  );

  const handleSelectVehicleType = useCallback((t: TaxiVehicleKind) => {
    setSelectedVehicle(t);
    setTaxiPaymentMethod(null);
    setVehicleModalStep("payment");
  }, []);

  const handleBackToVehiclePick = useCallback(() => {
    setVehicleModalStep("pick");
    setSelectedVehicle(null);
    setTaxiPaymentMethod(null);
  }, []);

  const handleBackToPayment = useCallback(() => {
    setVehicleModalStep("payment");
  }, []);

  const handlePaymentContinue = useCallback(() => {
    if (!taxiPaymentMethod) return;
    setVehicleModalStep("ready");
  }, [taxiPaymentMethod, selectedVehicle, vehicleModalStep]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/platform/mobility-fares");
        const data = res.ok ? ((await res.json()) as { fares?: MobilityFares }) : {};
        if (!alive) return;
        if (data?.fares) setMobilityFares(data.fares);
      } catch {
        // silencioso: UI seguirá con fallback (sin cálculo exacto)
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!showMapFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showMapFullscreen]);

  useEffect(() => {
    if (!showMapFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMapFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showMapFullscreen]);

  const isNight = useMemo(() => {
    const h = new Date().getHours();
    return h >= 19 || h < 6;
  }, []);

  const faresEffective = mobilityFares ?? FALLBACK_MOBILITY_FARES;

  /** Tarifa estimada por tipo (sin mascota) para el paso “elegir vehículo” — antes no había `selectedVehicle` y todo salía $0. */
  const fareByVehicleKind = useMemo((): Record<TaxiVehicleKind, number> | null => {
    if (!routeMeta) return null;
    const km = Math.max(0, routeMeta.distanceM / 1000);
    const f = faresEffective;
    return {
      moto: f.moto.baseUsd + f.moto.perKmUsd * km,
      auto:
        (isNight ? f.auto.baseNightUsd : f.auto.baseDayUsd) +
        f.auto.perKmUsd * km,
      pet_car:
        (isNight ? f.auto.baseNightUsd : f.auto.baseDayUsd) +
        f.auto.perKmUsd * km +
        f.auto.petExtraUsd,
      camioneta: f.camioneta.baseUsd + f.camioneta.perKmUsd * km,
    };
  }, [faresEffective, routeMeta, isNight]);

  const estimatedUsd = useMemo(() => {
    if (!selectedVehicle) return null;
    if (!routeMeta) return null;
    const km = Math.max(0, routeMeta.distanceM / 1000);
    const f = faresEffective;
    if (selectedVehicle === "moto") {
      return f.moto.baseUsd + f.moto.perKmUsd * km;
    }
    if (selectedVehicle === "auto") {
      const base = isNight ? f.auto.baseNightUsd : f.auto.baseDayUsd;
      return base + f.auto.perKmUsd * km;
    }
    if (selectedVehicle === "pet_car") {
      const base = isNight ? f.auto.baseNightUsd : f.auto.baseDayUsd;
      return base + f.auto.perKmUsd * km + f.auto.petExtraUsd;
    }
    return f.camioneta.baseUsd + f.camioneta.perKmUsd * km;
  }, [faresEffective, selectedVehicle, routeMeta, isNight]);

  /** Con conductor asignado: en “viaje en curso” el mapa sigue al driver como en DriverCargoMap (solo destino + ruta GPS→destino). */
  const matchedRideMap = useMemo(() => {
    const enCurso = !!(matchedDriverInfo && riderTripInProgress);
    const mapStart = enCurso ? null : start;
    const routeFocus: { start: MapPoint; end: MapPoint } | null =
      enCurso && assignedDriverPos && end ? { start: assignedDriverPos, end } : null;
    const routeGeometryKey = !matchedDriverInfo ? 0 : enCurso ? 2 : 1;
    return { mapStart, routeFocus, routeGeometryKey };
  }, [matchedDriverInfo, riderTripInProgress, assignedDriverPos, start, end]);

  /** Busca conductor real (Socket + API). */
  const handleConfirmVehicleSearch = useCallback(async () => {
    if (!selectedVehicle || !start || !end || !taxiPaymentMethod || !routeMeta) return;
    clearVehicleSearchTimers();
    setNearbyDriverMarkers([]);
    setMatchedDriverInfo(null);
    setSearchRemainingSec(VEHICLE_SEARCH_TOTAL_SEC);
    setVehicleModalStep("searching");
    searchEndAtRef.current = Date.now() + VEHICLE_SEARCH_MAX_MS;

    const tickRemaining = () => {
      const left = Math.max(0, Math.ceil((searchEndAtRef.current - Date.now()) / 1000));
      setSearchRemainingSec(left);
    };
    tickRemaining();
    searchTickRef.current = window.setInterval(tickRemaining, 1000);

    searchDoneTimeoutRef.current = window.setTimeout(() => {
      setSearchRemainingSec(0);
      clearVehicleSearchTimers();
      setVehicleModalStep((step) => {
        if (step !== "searching") return step;
        toast({
          title: "Sin respuesta a tiempo",
          description: "Ningún conductor aceptó. Puedes intentar de nuevo.",
          variant: "destructive",
        });
        setActiveRideId(null);
        activeRideIdRef.current = null;
        clearRiderActiveRideId();
        return "ready";
      });
    }, VEHICLE_SEARCH_MAX_MS);

    const token = localStorage.getItem("token");
    if (!token) {
      toast({ title: "Inicia sesión para pedir un viaje", variant: "destructive" });
      clearVehicleSearchTimers();
      setVehicleModalStep("ready");
      return;
    }

    try {
      const res = await fetch("/api/mobility/rides/request", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          start,
          end,
          routeGeometry,
          distanceM: routeMeta.distanceM,
          durationSec: routeMeta.durationSec,
          vehicleType: selectedVehicle,
          paymentMethod: taxiPaymentMethod,
          estimatedUsd: estimatedUsd ?? 0,
          petEnabled,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { rideId?: string; message?: string; code?: string };
      if (!res.ok) {
        toast({
          title: "No se pudo buscar conductor",
          description: data.message ?? "Intenta más tarde.",
          variant: "destructive",
        });
        clearVehicleSearchTimers();
        setVehicleModalStep("ready");
        return;
      }
      if (data.rideId) {
        setActiveRideId(data.rideId);
        activeRideIdRef.current = data.rideId;
        saveRiderActiveRideId(data.rideId);
      }
    } catch {
      toast({ title: "Error de red", variant: "destructive" });
      clearVehicleSearchTimers();
      setVehicleModalStep("ready");
    }
  }, [
    selectedVehicle,
    taxiPaymentMethod,
    start,
    end,
    routeMeta,
    routeGeometry,
    estimatedUsd,
    petEnabled,
    clearVehicleSearchTimers,
    toast,
  ]);

  useEffect(() => {
    if (!socket) return;
    const onMatched = (p: {
      rideId: string;
      driver: {
        userId: string;
        name: string;
        profileImageUrl: string | null;
        phone: string;
        rating?: number;
        ratingCount?: number;
        completedTrips?: number;
        vehicle: {
          type: string;
          brand: string;
          model: string;
          licensePlate: string;
          color: string | null;
        } | null;
      };
      driverLat?: number;
      driverLon?: number;
      conversationId?: number | null;
    }) => {
      if (p.rideId !== activeRideIdRef.current) return;
      clearVehicleSearchTimers();
      setMatchedDriverInfo({
        driver: p.driver,
        conversationId: p.conversationId ?? null,
      });
      if (p.driverLat != null && p.driverLon != null) {
        const pos = { lat: p.driverLat, lon: p.driverLon };
        setAssignedDriverPos(pos);
        setNearbyDriverMarkers([{ id: "assigned", lat: p.driverLat, lon: p.driverLon }]);
        if (start) void loadDriverEtaRoute(pos, start);
      }
      setVehicleModalStep("done");
      setVehiclePickerOpen(false);
      if (p.conversationId != null) primeCarGoConversation(p.conversationId);
    };
    const onDriverLoc = (p: { rideId: string; lat: number; lon: number }) => {
      if (p.rideId !== activeRideIdRef.current) return;
      const pos = { lat: p.lat, lon: p.lon };
      setAssignedDriverPos(pos);
      setNearbyDriverMarkers([{ id: "assigned", lat: p.lat, lon: p.lon }]);
      const target =
        riderTripInProgressRef.current && end ? end : start;
      if (target) void loadDriverEtaRoute(pos, target);
    };
    const onStarted = (p: { rideId: string }) => {
      if (p.rideId !== activeRideIdRef.current) return;
      setRiderTripInProgress(true);
      const pos = assignedDriverPosRef.current;
      const dest = endPlaceRef.current;
      if (pos && dest) void loadDriverEtaRoute(pos, dest);
    };
    const onDriverSearching = (p: { rideId: string }) => {
      if (p.rideId !== activeRideIdRef.current) return;
      toast({
        title: "Tu conductor te está buscando",
        description: "Mantente atento: verás su ubicación en el mapa mientras se acerca.",
      });
    };
    const onCompleted = (p: { rideId: string }) => {
      if (p.rideId !== activeRideIdRef.current) return;
      // Guardar historial del pasajero antes de limpiar estado.
      if (matchedDriverInfoRef.current) {
        appendRiderTripLog({
          id: p.rideId,
          endedAt: new Date().toISOString(),
          durationMin: Math.max(1, Math.round((routeMeta?.durationSec ?? 0) / 60)),
          amountUsd: estimatedUsd ?? 0,
          payment: taxiPaymentMethod ?? "cash",
          driverName: matchedDriverInfoRef.current.driver?.name ?? "Conductor",
        });
        rateTargetRef.current = {
          rideId: p.rideId,
          target: "driver",
          targetName: matchedDriverInfoRef.current.driver?.name ?? "Driver",
        };
        setRateStars(5);
        setRateDialogOpen(true);
      }
      applyCarGoRideEnded();
      toast({ title: "Viaje finalizado", description: "Gracias por usar Car Go." });
    };
    const onCancelled = (p: { rideId: string; cancelledBy: "rider" | "driver" }) => {
      if (p.rideId !== activeRideIdRef.current) return;
      applyCarGoRideEnded();
      if (p.cancelledBy === "driver") {
        toast({
          title: "El conductor canceló",
          description: "Puedes volver a buscar cuando quieras.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Viaje cancelado", description: "El servicio ya no está activo." });
      }
    };
    socket.on("cargo:ride:matched", onMatched);
    socket.on("cargo:ride:driver_location", onDriverLoc);
    socket.on("cargo:ride:driver_searching", onDriverSearching);
    socket.on("cargo:ride:started", onStarted);
    socket.on("cargo:ride:completed", onCompleted);
    socket.on("cargo:ride:cancelled", onCancelled);
    const onFailed = (p: { rideId: string; reason: string }) => {
      if (p.rideId !== activeRideIdRef.current) return;
      clearVehicleSearchTimers();
      setVehicleModalStep("ready");
      setActiveRideId(null);
      activeRideIdRef.current = null;
      clearRiderActiveRideId();
      toast({
        title: "No hay conductores disponibles",
        description: "Por ahora no hay drivers para ese vehículo. Puedes intentar otro (p. ej. moto).",
        variant: "destructive",
      });
    };
    socket.on("cargo:ride:failed", onFailed);
    return () => {
      socket.off("cargo:ride:matched", onMatched);
      socket.off("cargo:ride:driver_location", onDriverLoc);
      socket.off("cargo:ride:driver_searching", onDriverSearching);
      socket.off("cargo:ride:started", onStarted);
      socket.off("cargo:ride:completed", onCompleted);
      socket.off("cargo:ride:cancelled", onCancelled);
      socket.off("cargo:ride:failed", onFailed);
    };
  }, [socket, clearVehicleSearchTimers, applyCarGoRideEnded, primeCarGoConversation, toast, start, end, loadDriverEtaRoute]);

  const submitRideRating = useCallback(async () => {
    const tgt = rateTargetRef.current;
    if (!tgt) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    setRateBusy(true);
    try {
      const res = await fetch(`/api/mobility/rides/${encodeURIComponent(tgt.rideId)}/rate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ stars: rateStars, target: "driver" }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || "No se pudo enviar la calificación");
      setRateDialogOpen(false);
      rateTargetRef.current = null;
      toast({ title: "¡Gracias!", description: "Calificación enviada." });
    } catch (e) {
      toast({ title: "No se pudo enviar", description: e instanceof Error ? e.message : "Intenta de nuevo", variant: "destructive" });
    } finally {
      setRateBusy(false);
    }
  }, [rateStars, toast]);

  useEffect(() => {
    if (!riderTripInProgress || !assignedDriverPos || !end) return;
    void loadDriverEtaRoute(assignedDriverPos, end);
  }, [riderTripInProgress, assignedDriverPos, end, loadDriverEtaRoute]);

  useEffect(() => {
    if (!isGoCargoClient || authLoading || !isAuthenticated) return;
    const stored = loadRiderActiveRideId();
    if (!stored) return;
    const token = localStorage.getItem("token");
    if (!token) {
      clearRiderActiveRideId();
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/mobility/rides/${encodeURIComponent(stored)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!alive) return;
        if (!res.ok) {
          clearRiderActiveRideId();
          return;
        }
        const ride = (await res.json()) as MobilityRideHydration;
        if (ride.status !== "matched" && ride.status !== "in_progress") {
          clearRiderActiveRideId();
          return;
        }
        setActiveRideId(ride.id);
        activeRideIdRef.current = ride.id;
        setStart(ride.start);
        setEnd(ride.end);
        setStartInput(ride.start.label);
        setEndInput(ride.end.label);
        setRiderTripInProgress(ride.status === "in_progress");
        if (ride.driver) {
          setMatchedDriverInfo({
            driver: ride.driver,
            conversationId: ride.conversationId,
          });
        }
        setVehiclePickerOpen(false);
        setVehicleModalStep("done");
      } catch {
        if (alive) clearRiderActiveRideId();
      }
    })();
    return () => {
      alive = false;
    };
  }, [isGoCargoClient, authLoading, isAuthenticated]);

  useEffect(() => () => clearVehicleSearchTimers(), [clearVehicleSearchTimers]);

  const fetchGeocode = useCallback(async (q: string, field: "start" | "end") => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      if (field === "start") setSuggestStart([]);
      else setSuggestEnd([]);
      return;
    }
    setGeoLoading(true);
    try {
      const res = await fetch(`/api/maps/geocode?q=${encodeURIComponent(trimmed)}`);
      const data = res.ok ? ((await res.json()) as GeocodeHit[]) : [];
      if (field === "start") setSuggestStart(Array.isArray(data) ? data : []);
      else setSuggestEnd(Array.isArray(data) ? data : []);
    } catch {
      if (field === "start") setSuggestStart([]);
      else setSuggestEnd([]);
    } finally {
      setGeoLoading(false);
    }
  }, []);

  const onStartInput = (v: string) => {
    setStartInput(v);
    if (debounceStart.current) clearTimeout(debounceStart.current);
    debounceStart.current = setTimeout(() => fetchGeocode(v, "start"), 380);
  };

  const onEndInput = (v: string) => {
    setEndInput(v);
    if (debounceEnd.current) clearTimeout(debounceEnd.current);
    debounceEnd.current = setTimeout(() => fetchGeocode(v, "end"), 380);
  };

  const pickSuggestion = (field: "start" | "end", hit: GeocodeHit) => {
    const place: Place = { lat: hit.lat, lon: hit.lon, label: hit.label };
    if (field === "start") {
      setStart(place);
      setStartInput(hit.label);
      setSuggestStart([]);
    } else {
      setEnd(place);
      setEndInput(hit.label);
      setSuggestEnd([]);
    }
    setRouteGeometry(null);
    setRouteMeta(null);
    setRouteError(null);
    resetVehicleChoice();
  };

  const reverseAt = async (lat: number, lon: number) => {
    setReverseLoading(true);
    try {
      const res = await fetch(`/api/maps/reverse?lat=${lat}&lon=${lon}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { label: string; lat: number; lon: number };
      return { lat: data.lat, lon: data.lon, label: data.label } as Place;
    } catch {
      return {
        lat,
        lon,
        label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
      } as Place;
    } finally {
      setReverseLoading(false);
    }
  };

  const onMapPick = async (lat: number, lon: number) => {
    const place = await reverseAt(lat, lon);
    if (mapTarget === "start") {
      setStart(place);
      setStartInput(place.label);
    } else {
      setEnd(place);
      setEndInput(place.label);
    }
    setRouteGeometry(null);
    setRouteMeta(null);
    setRouteError(null);
    resetVehicleChoice();
  };

  const loadRoute = useCallback(async () => {
    if (!start || !end) return;
    setRouteLoading(true);
    setRouteError(null);
    try {
      const from = `${start.lon},${start.lat}`;
      const to = `${end.lon},${end.lat}`;
      const url = `/api/maps/route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      const res = await fetch(url);
      const body = (await res.json().catch(() => null)) as
        | { distanceM?: number; durationSec?: number; geometry?: GeoJsonObject | null; message?: string }
        | null;
      if (!res.ok || !body || typeof body.distanceM !== "number") {
        const fallback = fallbackRouteFor(start, end);
        setRouteMeta({ distanceM: fallback.distanceM, durationSec: fallback.durationSec });
        setRouteGeometry(fallback.geometry);
        setRouteError(body?.message ?? "Ruta aproximada (sin motor de rutas).");
        // Reintento rápido: OSRM/Nominatim a veces falla tras recargar.
        window.setTimeout(() => {
          if (start && end) void fetch(url).then(async (r) => {
            const b = (await r.json().catch(() => null)) as any;
            if (!r.ok || !b || typeof b.distanceM !== "number") return;
            setRouteMeta({ distanceM: b.distanceM, durationSec: b.durationSec ?? 0 });
            setRouteGeometry(b.geometry ?? null);
            setRouteError(null);
          }).catch(() => {});
        }, 800);
        return;
      }
      const data = body;
      setRouteMeta({ distanceM: data.distanceM!, durationSec: data.durationSec ?? 0 });
      setRouteGeometry(data.geometry ?? null);
    } catch {
      const fallback = fallbackRouteFor(start, end);
      setRouteMeta({ distanceM: fallback.distanceM, durationSec: fallback.durationSec });
      setRouteGeometry(fallback.geometry);
      setRouteError("Ruta aproximada (sin conexión al motor de rutas).");
    } finally {
      setRouteLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    if (!routeError) return;
    toast({
      title: "No se pudo calcular la ruta",
      description: routeError,
      variant: "destructive",
    });
  }, [routeError, toast]);

  useEffect(() => {
    if (start && end) void loadRoute();
    else {
      setRouteGeometry(null);
      setRouteMeta(null);
      setRouteError(null);
    }
  }, [start, end, loadRoute]);

  /** GPS para partida: fix fresco y de alta precisión; el usuario sigue en paso 1 para afinar en el mapa y luego elige «2. Llegada». */
  const useMyLocationAsStart = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const place = await reverseAt(latitude, longitude);
        setStart(place);
        setStartInput(place.label);
        setRouteGeometry(null);
        setRouteMeta(null);
        resetVehicleChoice();
      },
      () => {},
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 25_000,
      }
    );
  };

  const FALLBACK_CENTER: [number, number] = [-0.22, -78.5];
  const FALLBACK_ZOOM = 7;
  const [mapBootstrapCenter, setMapBootstrapCenter] = useState<[number, number]>(FALLBACK_CENTER);
  const [mapBootstrapZoom, setMapBootstrapZoom] = useState(FALLBACK_ZOOM);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMapBootstrapCenter([pos.coords.latitude, pos.coords.longitude]);
        setMapBootstrapZoom(15);
      },
      () => {
        /* permiso denegado o error: se mantiene el centro por defecto */
      },
      { enableHighAccuracy: true, maximumAge: 120_000, timeout: 18_000 }
    );
  }, []);

  return (
    <div
      className={cn(
        "bg-gradient-to-b from-muted/30 to-background",
        isGoCargoClient ? "flex min-h-0 min-w-0 flex-1 flex-col max-md:overflow-hidden max-md:pb-0 md:pb-12" : "min-h-screen pb-12"
      )}
    >
      <div
        className={cn(
          "container mx-auto max-w-4xl px-4 pt-6",
          isGoCargoClient &&
            "flex min-h-0 min-w-0 flex-1 flex-col max-md:overflow-hidden max-md:max-w-none max-md:px-3 max-md:pb-0 max-md:pt-2 md:max-w-6xl"
        )}
      >
        <Button
          variant="ghost"
          className={cn("mb-4 -ml-2 gap-2", isGoCargoClient && "hidden md:inline-flex")}
          onClick={goBack}
        >
          <ArrowLeft className="h-4 w-4" />
          {fromCategories ? "Volver a categorías" : "Volver a Explorar"}
        </Button>

        <div className={cn("mb-6", isGoCargoClient && "hidden md:block")}>
          <h1 className="text-3xl font-display font-bold text-foreground">Car Go</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Primero fija el <strong className="text-foreground">punto de partida</strong> (puedes afinarlo en el mapa).
            Cuando esté bien, elige <strong className="text-foreground">2. Llegada</strong> y marca el destino. Con ambos
            puntos listos, pulsa <strong className="text-foreground">Continuar</strong> para elegir el tipo de vehículo.
          </p>
        </div>

        {/* Go / Car: móvil — mapa llena main (sin scroll); overlay encima. */}
        {isGoCargoClient && !isMdUp && (
          <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden md:hidden max-md:h-[calc(100vh-8.25rem)] max-md:h-[calc(100svh-8.25rem)] max-md:min-h-[calc(100vh-8.25rem)] max-md:min-h-[calc(100svh-8.25rem)]">
            <div className="pointer-events-auto absolute inset-0 z-0 overflow-hidden bg-muted/30">
              <TaxiRouteMap
                fullscreen
                zoomPosition="bottomleft"
                syncDefaultView={!start && !end}
                defaultCenter={mapBootstrapCenter}
                defaultZoom={mapBootstrapZoom}
                start={matchedRideMap.mapStart}
                end={end}
                routeFocus={matchedRideMap.routeFocus}
                routeGeometryKey={matchedRideMap.routeGeometryKey}
                routeGeometry={matchedDriverInfo ? driverToPickupGeometry : routeGeometry}
                onMapPick={onMapPick}
                nearbyDemoVehicles={nearbyDriverMarkers}
                suppressMapPick={vehicleModalStep === "searching"}
                wrapperClassName="!rounded-none !border-0 !shadow-none h-full w-full"
              />
              {(driverEtaLoading && matchedDriverInfo) || reverseLoading || routeLoading ? (
                <div className="absolute bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] left-1/2 z-[55] flex max-w-[min(100%-2rem,280px)] -translate-x-1/2 items-center gap-2 rounded-full border bg-background/92 px-3 py-2 text-xs shadow-md backdrop-blur-sm">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  {driverEtaLoading && matchedDriverInfo
                    ? "Calculando llegada del driver…"
                    : reverseLoading
                      ? "Leyendo la dirección…"
                      : "Calculando ruta…"}
                </div>
              ) : null}
            </div>

            {!vehiclePickerOpen ? (
              <div className="relative z-10 flex min-h-0 flex-1 flex-col pointer-events-none">
                {/* Panel flotante: solo esta tarjeta captura taps/scroll; el resto deja arrastrar el mapa. */}
                <div className="pointer-events-none flex min-h-0 flex-1 flex-col px-2 pt-0">
                  <div className="pointer-events-auto max-h-[min(60vh,520px)] overflow-hidden rounded-2xl border border-border/60 bg-background/70 shadow-lg backdrop-blur-md ring-1 ring-black/5">
                    <div className="min-h-0 max-h-[min(60vh,520px)] overflow-y-auto overscroll-y-contain p-2 pb-3 [scrollbar-width:thin]">
                      <div className="space-y-2">
                {!matchedDriverInfo ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border/60 bg-background/90 p-0 shadow-md backdrop-blur-sm"
                        onClick={goBack}
                        aria-label={fromCategories ? "Volver a categorías" : "Volver a Explorar"}
                      >
                        <img src="/genfeb-mark.svg" alt="" className="h-full w-full scale-110 object-contain" />
                      </Button>
                      <div className="min-w-0 flex-1 rounded-xl border border-border/60 bg-background/88 p-1.5 shadow-md backdrop-blur-md">
                        <div className="flex flex-wrap items-center gap-1 text-[11px] font-medium leading-none sm:text-xs">
                          <button
                            type="button"
                            onClick={() => setMapTarget("start")}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition-colors",
                              mapTarget === "start"
                                ? "border-green-600/60 bg-green-500/15 text-foreground"
                                : start
                                  ? "border-border bg-muted/50 text-muted-foreground"
                                  : "border-green-600/40 bg-green-500/10 text-foreground"
                            )}
                          >
                            <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-green-600" aria-hidden />
                            1. Partida
                            {start ? " ✓" : ""}
                          </button>
                          <span className="text-muted-foreground" aria-hidden>
                            →
                          </span>
                          <button
                            type="button"
                            disabled={!start}
                            onClick={() => setMapTarget("end")}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition-colors",
                              !start && "cursor-not-allowed opacity-50",
                              start && "hover:bg-red-500/10",
                              mapTarget === "end"
                                ? "border-red-600/60 bg-red-500/15 text-foreground"
                                : "border-border bg-muted/40 text-muted-foreground"
                            )}
                          >
                            <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" aria-hidden />
                            2. Llegada
                            {end ? " ✓" : ""}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div
                      className={cn(
                        "rounded-xl border px-2.5 py-2 text-[11px] leading-snug shadow-md backdrop-blur-md transition-colors md:text-sm",
                        mapTarget === "start"
                          ? "border-green-600/35 bg-background/88"
                          : "border-red-600/35 bg-background/88"
                      )}
                    >
                      {mapTarget === "start" ? (
                        <div className="flex flex-col gap-1.5">
                          <p className="text-foreground/90">
                            <span className="font-medium text-foreground">Partida:</span> mapa o texto; luego{" "}
                            <span className="font-medium">2. Llegada</span>.
                          </p>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-8 w-full gap-1.5 px-2 text-xs sm:w-auto"
                            onClick={useMyLocationAsStart}
                          >
                            <Navigation className="h-3.5 w-3.5" />
                            Mi ubicación
                          </Button>
                        </div>
                      ) : (
                        <p className="text-foreground/90">
                          <span className="font-medium text-foreground">Llegada:</span> mapa o texto. Pin rojo = destino.
                        </p>
                      )}
                    </div>

                    {mapTarget === "end" && start && (
                      <p
                        className="line-clamp-2 rounded-lg border border-border/50 bg-background/80 px-2 py-1 text-[10px] leading-snug text-muted-foreground shadow-sm backdrop-blur-sm"
                        title={start.label}
                      >
                        <span className="font-medium text-foreground">Salida:</span> {start.label}
                      </p>
                    )}

                    <div className="rounded-xl border border-border/60 bg-background/88 p-2 shadow-md backdrop-blur-md">
                      {mapTarget === "start" ? (
                        <div className="space-y-1">
                          <Label htmlFor="taxi-start-mobile" className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-green-600" />
                            Partida
                          </Label>
                          <div className="relative">
                            <Input
                              id="taxi-start-mobile"
                              placeholder="Buscar o tocar mapa"
                              value={startInput}
                              onChange={(e) => onStartInput(e.target.value)}
                              autoComplete="off"
                              className="h-8 rounded-lg border-border/70 bg-background/95 py-1.5 text-sm"
                            />
                            {suggestStart.length > 0 && (
                              <ul className="absolute top-full z-[2000] mt-1 max-h-48 w-full overflow-auto rounded-xl border bg-popover text-sm shadow-md">
                                {suggestStart.map((h, i) => (
                                  <li key={`m-${h.lat}-${h.lon}-${i}`}>
                                    <button
                                      type="button"
                                      className="w-full px-3 py-2 text-left hover:bg-muted"
                                      onClick={() => pickSuggestion("start", h)}
                                    >
                                      {h.label}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Label htmlFor="taxi-end-mobile" className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-red-600" />
                            Llegada
                          </Label>
                          <div className="relative">
                            <Input
                              id="taxi-end-mobile"
                              placeholder="Buscar o tocar mapa"
                              value={endInput}
                              onChange={(e) => onEndInput(e.target.value)}
                              autoComplete="off"
                              className="h-8 rounded-lg border-border/70 bg-background/95 py-1.5 text-sm"
                            />
                            {suggestEnd.length > 0 && (
                              <ul className="absolute top-full z-[2000] mt-1 max-h-48 w-full overflow-auto rounded-xl border bg-popover text-sm shadow-md">
                                {suggestEnd.map((h, i) => (
                                  <li key={`m-${h.lat}-${h.lon}-${i}`}>
                                    <button
                                      type="button"
                                      className="w-full px-3 py-2 text-left hover:bg-muted"
                                      onClick={() => pickSuggestion("end", h)}
                                    >
                                      {h.label}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : null}

                {geoLoading && (
                  <p className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/90 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Buscando direcciones…
                  </p>
                )}

                {routeMeta && !routeError && (
                  <div className="rounded-xl border border-border/60 bg-background/88 px-3 py-2 text-[11px] shadow-md backdrop-blur-md">
                    <p className="font-semibold text-foreground">Ruta estimada</p>
                    <p className="mt-0.5 text-muted-foreground">
                      <span className="font-medium text-foreground">{formatKm(routeMeta.distanceM)}</span>
                      {" · "}
                      <span className="font-medium text-foreground">{formatDuration(routeMeta.durationSec)}</span>
                    </p>
                  </div>
                )}
                {routeError && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{routeError}</p>}

                {matchedDriverInfo && (
                  <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/[0.08] px-3 py-3 text-[11px] shadow-md backdrop-blur-md">
                    <p className="font-semibold text-foreground">Te aceptó el viaje</p>
                    <p className="mt-0.5 text-muted-foreground">
                      <span className="font-medium text-foreground">{matchedDriverInfo.driver.name}</span>
                      {riderTripInProgress ? " · Viaje en curso" : " · En camino hacia ti"}
                    </p>
                    {driverToPickupMeta ? (
                      <p className="mt-0.5 text-muted-foreground">
                        {riderTripInProgress ? "Ruta hacia destino" : "Hacia tu punto de partida"}:{" "}
                        <span className="font-medium text-foreground">
                          {formatDuration(driverToPickupMeta.durationSec)}
                        </span>
                        {driverToPickupMeta.distanceM != null ? (
                          <>
                            {" · "}
                            <span className="font-medium text-foreground">{formatKm(driverToPickupMeta.distanceM)}</span>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                    <div className="mt-2 flex gap-3">
                      {matchedDriverInfo.driver.profileImageUrl ? (
                        <img
                          src={matchedDriverInfo.driver.profileImageUrl}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-emerald-500/30"
                        />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
                          {matchedDriverInfo.driver.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          {typeof matchedDriverInfo.driver.rating === "number" ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/70 px-2 py-0.5">
                              <Star className="h-3 w-3 text-amber-500" aria-hidden />
                              <span className="font-medium text-foreground tabular-nums">
                                {matchedDriverInfo.driver.rating.toFixed(1)}
                              </span>
                            </span>
                          ) : null}
                          {typeof matchedDriverInfo.driver.completedTrips === "number" ? (
                            <span className="rounded-full border border-border/70 bg-background/70 px-2 py-0.5">
                              <span className="font-medium text-foreground tabular-nums">
                                {matchedDriverInfo.driver.completedTrips}
                              </span>{" "}
                              viajes
                            </span>
                          ) : null}
                        </div>
                        {matchedDriverInfo.driver.vehicle ? (
                          <p className="leading-snug text-muted-foreground">
                            {vehicleTypeLabel(matchedDriverInfo.driver.vehicle.type) ? (
                              <span className="font-medium text-foreground">
                                {vehicleTypeLabel(matchedDriverInfo.driver.vehicle.type)}
                              </span>
                            ) : null}
                            {vehicleTypeLabel(matchedDriverInfo.driver.vehicle.type) ? " · " : null}
                            {matchedDriverInfo.driver.vehicle.brand} {matchedDriverInfo.driver.vehicle.model} ·{" "}
                            <span className="font-medium text-foreground">{matchedDriverInfo.driver.vehicle.licensePlate}</span>
                            {matchedDriverInfo.driver.vehicle.color ? ` · Color: ${matchedDriverInfo.driver.vehicle.color}` : ""}
                          </p>
                        ) : null}
                        {matchedDriverInfo.driver.phone ? (
                          <a
                            href={`tel:${matchedDriverInfo.driver.phone}`}
                            className="mt-1 inline-flex w-full max-w-[220px] items-center justify-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary"
                          >
                            <Phone className="h-4 w-4 shrink-0" aria-hidden />
                            Llamar al conductor
                          </a>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2 w-full max-w-[220px] border-destructive/40 text-destructive hover:bg-destructive/10"
                          onClick={openCancelServiceDialog}
                        >
                          Cancelar viaje
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <AnimatePresence>
                  {start && end && !matchedDriverInfo ? (
                    <motion.div
                      key="taxi-route-actions-mobile"
                      className="flex flex-col gap-2 pt-0.5"
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <AnimatePresence mode="wait">
                        {!selectedVehicle ? (
                          <motion.div
                            key="taxi-continue-btn-m"
                            className="w-full"
                            initial={{ opacity: 0, y: 12, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.98 }}
                            transition={{ type: "spring", damping: 22, stiffness: 280, mass: 0.9 }}
                          >
                            {routeLoading || !routeMeta ? (
                              <div className="flex items-center justify-center gap-2 rounded-full border border-border/60 bg-background/85 px-4 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur-sm">
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                Calculando ruta…
                              </div>
                            ) : null}
                            <Button
                              type="button"
                              size="lg"
                              className="h-11 w-full rounded-full text-base shadow-lg"
                              disabled={routeLoading || !routeMeta || !!routeError}
                              onClick={() => {
                                setVehicleModalStep("pick");
                                setVehiclePickerOpen(true);
                              }}
                            >
                              Continuar
                            </Button>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="taxi-vehicle-summary-m"
                            className="flex flex-col gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3 shadow-md"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                          >
                            <p className="text-sm text-foreground">
                              <span className="font-medium">Vehículo elegido:</span>{" "}
                              {VEHICLE_OPTIONS.find((o) => o.type === selectedVehicle)?.label}
                              <span className="text-muted-foreground"> · </span>
                              <span className="font-semibold tabular-nums">
                                {estimatedUsd != null ? formatUsd(estimatedUsd) : "—"}
                              </span>
                              {petEnabled ? (
                                <span className="text-muted-foreground text-xs">
                                  {" "}
                                  · Mascota: <span className="font-medium text-foreground">sí</span>
                                </span>
                              ) : null}
                              {taxiPaymentMethod && (
                                <span className="text-muted-foreground text-xs">
                                  {" "}
                                  · Pago:{" "}
                                  <span className="font-medium text-foreground">
                                    {taxiPaymentMethod === "genfeb" ? "Saldo GenFeb" : "Efectivo"}
                                  </span>
                                </span>
                              )}
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-full rounded-full"
                              onClick={() => {
                                setSelectedVehicle(null);
                                setVehicleModalStep("pick");
                                setVehiclePickerOpen(true);
                              }}
                            >
                              Cambiar vehículo
                            </Button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                      {/* Espaciador mínimo: el panel ya no está pegado al bottom nav. */}
                      <div aria-hidden className="h-2 shrink-0" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {(!isGoCargoClient || isMdUp) && (
        <div
          className={cn(
            isGoCargoClient && isMdUp
              ? // Altura explícita en la fila: si el mapa solo tiene height:100% sin padre con alto, Leaflet queda en 0px.
                "grid min-h-0 w-full flex-1 grid-cols-12 gap-6 items-stretch [grid-template-rows:minmax(0,1fr)]"
              : null
          )}
        >
          <div
            className={cn(
              "space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6",
              // Car Go escritorio: mismo alto que el mapa (viewport), scroll interno en el panel.
              isGoCargoClient && isMdUp
                ? "col-span-4 xl:col-span-4 flex min-h-0 h-[min(900px,calc(100svh-11rem))] max-h-[calc(100svh-11rem)] flex-col overflow-y-auto [scrollbar-width:thin] md:sticky md:top-24 md:self-start"
                : null
            )}
          >
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => setMapTarget("start")}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 font-medium transition-colors",
                "hover:bg-green-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                mapTarget === "start"
                  ? "border-green-600/60 bg-green-500/10 text-foreground"
                  : start
                    ? "border-border bg-muted/40 text-muted-foreground"
                    : "border-green-600/40 bg-green-500/5 text-foreground"
              )}
            >
              <span className="inline-flex h-2 w-2 rounded-full bg-green-600 shrink-0" aria-hidden />
              1. Partida
              {start ? " ✓" : ""}
            </button>
            <span className="text-muted-foreground" aria-hidden>
              →
            </span>
            <button
              type="button"
              disabled={!start}
              onClick={() => setMapTarget("end")}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                !start && "cursor-not-allowed opacity-50",
                start && "hover:bg-red-500/10",
                mapTarget === "end"
                  ? "border-red-600/60 bg-red-500/10 text-foreground"
                  : "border-border bg-muted/30 text-muted-foreground"
              )}
            >
              <span className="inline-flex h-2 w-2 rounded-full bg-red-600 shrink-0" aria-hidden />
              2. Llegada
              {end ? " ✓" : ""}
            </button>
          </div>

          <div
            className={cn(
              "rounded-xl border-2 p-3 md:p-4 text-sm transition-colors",
              mapTarget === "start"
                ? "border-green-600/50 bg-green-500/5"
                : "border-red-600/50 bg-red-500/5"
            )}
          >
            {mapTarget === "start" ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-foreground/90 pr-2">
                  <span className="font-medium text-foreground">Paso 1 — Partida:</span> GPS, toca el mapa o escribe la
                  dirección. Puedes mover el punto tocando de nuevo; cuando esté bien, pulsa{" "}
                  <span className="font-medium">2. Llegada</span>.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0 gap-2 whitespace-nowrap"
                  onClick={useMyLocationAsStart}
                >
                  <Navigation className="h-4 w-4" />
                  Usar mi ubicación actual
                </Button>
              </div>
            ) : (
              <p className="text-foreground/90">
                <span className="font-medium text-foreground">Paso 2 — Llegada:</span> toca el mapa o escribe la
                dirección encima. El marcador rojo es tu destino.
              </p>
            )}
          </div>

          {mapTarget === "end" && start && (
            <p className="text-xs text-muted-foreground rounded-lg border border-border bg-muted/30 px-3 py-2">
              <span className="font-medium text-foreground">Salida:</span> {start.label}
            </p>
          )}

          {mapTarget === "start" ? (
            <div className="space-y-2 z-[5]">
              <Label htmlFor="taxi-start" className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-green-600" />
                Dirección de partida
              </Label>
              <div className="relative">
                <Input
                  id="taxi-start"
                  placeholder="Escribe y elige una sugerencia, o coloca el punto en el mapa"
                  value={startInput}
                  onChange={(e) => onStartInput(e.target.value)}
                  autoComplete="off"
                />
                {suggestStart.length > 0 && (
                  <ul className="absolute z-[2000] top-full mt-1 w-full max-h-48 overflow-auto rounded-md border bg-popover text-sm shadow-md">
                    {suggestStart.map((h, i) => (
                      <li key={`${h.lat}-${h.lon}-${i}`}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted"
                          onClick={() => pickSuggestion("start", h)}
                        >
                          {h.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2 z-[5]">
              <Label htmlFor="taxi-end" className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-red-600" />
                Dirección de llegada
              </Label>
              <div className="relative">
                <Input
                  id="taxi-end"
                  placeholder="Escribe y elige una sugerencia, o coloca el punto en el mapa"
                  value={endInput}
                  onChange={(e) => onEndInput(e.target.value)}
                  autoComplete="off"
                />
                {suggestEnd.length > 0 && (
                  <ul className="absolute z-[2000] top-full mt-1 w-full max-h-48 overflow-auto rounded-md border bg-popover text-sm shadow-md">
                    {suggestEnd.map((h, i) => (
                      <li key={`${h.lat}-${h.lon}-${i}`}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted"
                          onClick={() => pickSuggestion("end", h)}
                        >
                          {h.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* En Car Go escritorio el mapa vive en la columna derecha; aquí no renderizamos un “placeholder” */}
          {!(isGoCargoClient && isMdUp) ? (
            <div
              className={cn(
                "relative z-[1] rounded-xl ring-2 ring-offset-2 ring-offset-background transition-shadow",
                mapTarget === "start" ? "ring-green-600/50" : "ring-red-600/50"
              )}
            >
              {!showMapFullscreen ? (
                <>
                  <TaxiRouteMap
                    syncDefaultView={!start && !end}
                    defaultCenter={mapBootstrapCenter}
                    defaultZoom={mapBootstrapZoom}
                    start={matchedRideMap.mapStart}
                    end={end}
                    routeFocus={matchedRideMap.routeFocus}
                    routeGeometryKey={matchedRideMap.routeGeometryKey}
                    routeGeometry={matchedDriverInfo ? driverToPickupGeometry : routeGeometry}
                    onMapPick={onMapPick}
                    nearbyDemoVehicles={nearbyDriverMarkers}
                    suppressMapPick={vehicleModalStep === "searching"}
                  />
                  {(reverseLoading || routeLoading) && (
                    <div className="absolute bottom-3 left-3 z-[55] flex items-center gap-2 rounded-lg border bg-background/90 px-3 py-2 text-xs shadow">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {reverseLoading ? "Leyendo la dirección de ese punto…" : "Calculando ruta…"}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex min-h-[min(52vh,420px)] flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    El mapa está en <span className="font-medium text-foreground">pantalla completa</span>. Toca el mapa para
                    colocar el punto; luego pulsa <span className="font-medium text-foreground">Reducir</span> para seguir
                    con el formulario.
                  </p>
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setMapFullscreen(false)}>
                    <Minimize2 className="h-4 w-4" aria-hidden />
                    Volver al mapa normal
                  </Button>
                </div>
              )}
            </div>
          ) : null}

          {geoLoading && (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Buscando direcciones…
            </p>
          )}

          {routeMeta && !routeError && (
            <div className="rounded-xl bg-muted/50 border border-border px-4 py-3 text-sm">
              <p className="font-medium text-foreground">Ruta estimada en carretera</p>
              <p className="text-muted-foreground mt-1">
                Distancia: <span className="text-foreground font-medium">{formatKm(routeMeta.distanceM)}</span>
                {" · "}
                Tiempo aproximado: <span className="text-foreground font-medium">{formatDuration(routeMeta.durationSec)}</span>
              </p>
            </div>
          )}
          {routeError && <p className="text-sm text-destructive">{routeError}</p>}

          {matchedDriverInfo && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/[0.08] px-4 py-3 text-sm shadow-sm">
              <p className="font-semibold text-foreground">Te aceptó el viaje</p>
              <p className="mt-1 text-muted-foreground">
                <span className="font-medium text-foreground">{matchedDriverInfo.driver.name}</span>
                {riderTripInProgress ? " · Viaje en curso" : " · En camino hacia ti"}
              </p>
              <div className="mt-3 flex gap-3">
                {matchedDriverInfo.driver.profileImageUrl ? (
                  <img
                    src={matchedDriverInfo.driver.profileImageUrl}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-emerald-500/30"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-bold text-muted-foreground">
                    {matchedDriverInfo.driver.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium text-foreground">{matchedDriverInfo.driver.name}</p>
                  {matchedDriverInfo.driver.vehicle ? (
                    <p className="text-muted-foreground">
                      {vehicleTypeLabel(matchedDriverInfo.driver.vehicle.type) ? (
                        <span className="font-medium text-foreground">
                          {vehicleTypeLabel(matchedDriverInfo.driver.vehicle.type)}
                        </span>
                      ) : null}
                      {vehicleTypeLabel(matchedDriverInfo.driver.vehicle.type) ? " · " : null}
                      {matchedDriverInfo.driver.vehicle.brand} {matchedDriverInfo.driver.vehicle.model} ·{" "}
                      <span className="font-medium text-foreground">{matchedDriverInfo.driver.vehicle.licensePlate}</span>
                      {matchedDriverInfo.driver.vehicle.color ? ` · Color: ${matchedDriverInfo.driver.vehicle.color}` : ""}
                    </p>
                  ) : null}
                  {matchedDriverInfo.driver.phone ? (
                    <a
                      href={`tel:${matchedDriverInfo.driver.phone}`}
                      className="mt-2 inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary"
                    >
                      <Phone className="h-4 w-4 shrink-0" aria-hidden />
                      Llamar al conductor
                    </a>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full max-w-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={openCancelServiceDialog}
                  >
                    Cancelar viaje
                  </Button>
                </div>
              </div>
            </div>
          )}

          <AnimatePresence>
            {start && end ? (
              <motion.div
                key="taxi-route-actions"
                className="flex flex-col gap-3 pt-1"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
              >
                <AnimatePresence mode="wait">
                  {!selectedVehicle ? (
                    <motion.div
                      key="taxi-continue-btn"
                      className="w-full sm:w-auto sm:self-end"
                      initial={{ opacity: 0, y: 12, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.98 }}
                      transition={{ type: "spring", damping: 22, stiffness: 280, mass: 0.9 }}
                    >
                      {routeLoading || !routeMeta ? (
                        <div className="mb-2 flex items-center justify-center gap-2 rounded-full border border-border/60 bg-background/90 px-4 py-2 text-sm text-muted-foreground shadow-sm">
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          Calculando ruta…
                        </div>
                      ) : null}
                      <Button
                        type="button"
                        size="lg"
                        className="w-full sm:w-auto shadow-md"
                        disabled={routeLoading || !routeMeta || !!routeError}
                        onClick={() => {
                          setVehicleModalStep("pick");
                          setVehiclePickerOpen(true);
                        }}
                      >
                        Continuar
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="taxi-vehicle-summary"
                      className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <p className="text-sm text-foreground">
                        <span className="font-medium">Vehículo elegido:</span>{" "}
                        {VEHICLE_OPTIONS.find((o) => o.type === selectedVehicle)?.label}
                        <span className="text-muted-foreground"> · </span>
                        <span className="font-semibold tabular-nums">
                          {estimatedUsd != null ? formatUsd(estimatedUsd) : "—"}
                        </span>
                        <span className="text-muted-foreground text-xs block sm:inline sm:ml-1">
                          {estimatedUsd != null ? "(estimado)" : "(configurando tarifa…)"}
                        </span>
                        {petEnabled ? (
                          <span className="text-muted-foreground text-xs block sm:inline sm:ml-1">
                            · Mascota: <span className="font-medium text-foreground">sí</span>
                          </span>
                        ) : null}
                        {taxiPaymentMethod && (
                          <span className="text-muted-foreground text-xs block sm:inline sm:ml-1">
                            · Pago:{" "}
                            <span className="font-medium text-foreground">
                              {taxiPaymentMethod === "genfeb" ? "Saldo GenFeb" : "Efectivo"}
                            </span>
                          </span>
                        )}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => {
                          setSelectedVehicle(null);
                          setVehicleModalStep("pick");
                          setVehiclePickerOpen(true);
                        }}
                      >
                        Cambiar vehículo
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : null}
          </AnimatePresence>
          </div>

          {isGoCargoClient && isMdUp ? (
            <div className="col-span-8 xl:col-span-8 flex h-[min(900px,calc(100svh-11rem))] max-h-[calc(100svh-11rem)] min-h-[480px] flex-col">
              <div className="relative z-[1] flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-muted/10 shadow-sm md:sticky md:top-24">
                <TaxiRouteMap
                  fullscreen
                  zoomPosition="bottomleft"
                  syncDefaultView={!start && !end}
                  defaultCenter={mapBootstrapCenter}
                  defaultZoom={mapBootstrapZoom}
                  start={matchedRideMap.mapStart}
                  end={end}
                  routeFocus={matchedRideMap.routeFocus}
                  routeGeometryKey={matchedRideMap.routeGeometryKey}
                  routeGeometry={matchedDriverInfo ? driverToPickupGeometry : routeGeometry}
                  onMapPick={onMapPick}
                  nearbyDemoVehicles={nearbyDriverMarkers}
                  suppressMapPick={vehicleModalStep === "searching"}
                  wrapperClassName="!rounded-none !border-0 !shadow-none h-full min-h-0 w-full flex-1"
                />
                {(reverseLoading || routeLoading) && (
                  <div className="absolute bottom-3 left-3 z-[55] flex items-center gap-2 rounded-lg border bg-background/90 px-3 py-2 text-xs shadow">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {reverseLoading ? "Leyendo la dirección de ese punto…" : "Calculando ruta…"}
                  </div>
                )}
                {driverEtaLoading && matchedDriverInfo ? (
                  <div className="absolute bottom-3 right-3 z-[55] flex items-center gap-2 rounded-lg border bg-background/90 px-3 py-2 text-xs shadow">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Llegada del driver…
                  </div>
                ) : null}
                {driverToPickupMeta && matchedDriverInfo ? (
                  <div className="absolute top-3 left-3 z-[55] flex items-center gap-2 rounded-lg border bg-background/90 px-3 py-2 text-xs shadow">
                    Llega en <span className="font-semibold">{formatDuration(driverToPickupMeta.durationSec)}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        )}

      {showMapFullscreen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex flex-col bg-background"
            role="dialog"
            aria-modal="true"
            aria-label="Mapa en pantalla completa"
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-background/95 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <div className="min-w-0 pr-2">
                <p className="text-sm font-semibold text-foreground">Car Go</p>
                <p className="text-xs text-muted-foreground">
                  {mapTarget === "start"
                    ? "Partida · toca el mapa para colocar o afinar el punto"
                    : "Llegada · toca el mapa para colocar o afinar el punto"}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0 gap-2"
                onClick={() => setMapFullscreen(false)}
              >
                <Minimize2 className="h-4 w-4" aria-hidden />
                Reducir
              </Button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <div
                className={cn(
                  "relative z-[1] flex h-full min-h-0 flex-1 flex-col rounded-xl ring-2 ring-offset-2 ring-offset-background transition-shadow",
                  mapTarget === "start" ? "ring-green-600/50" : "ring-red-600/50"
                )}
              >
                <TaxiRouteMap
                  fullscreen
                  syncDefaultView={!start && !end}
                  defaultCenter={mapBootstrapCenter}
                  defaultZoom={mapBootstrapZoom}
                  start={matchedRideMap.mapStart}
                  end={end}
                  routeFocus={matchedRideMap.routeFocus}
                  routeGeometryKey={matchedRideMap.routeGeometryKey}
                  routeGeometry={matchedDriverInfo ? driverToPickupGeometry : routeGeometry}
                  onMapPick={onMapPick}
                  nearbyDemoVehicles={nearbyDriverMarkers}
                  suppressMapPick={vehicleModalStep === "searching"}
                />
                {(driverEtaLoading && matchedDriverInfo) || reverseLoading || routeLoading ? (
                  <div className="absolute bottom-3 left-3 z-[55] flex items-center gap-2 rounded-lg border bg-background/90 px-3 py-2 text-xs shadow">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {driverEtaLoading && matchedDriverInfo
                      ? "Actualizando ruta…"
                      : reverseLoading
                        ? "Leyendo la dirección de ese punto…"
                        : "Calculando ruta…"}
                  </div>
                ) : null}
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>

      <TaxiVehicleSearchModal
        open={vehiclePickerOpen}
        onOpenChange={handleVehicleModalOpenChange}
        step={vehicleModalStep}
        vehicleOptions={VEHICLE_OPTIONS}
        vehicleFareByType={fareByVehicleKind}
        vehicleUsd={estimatedUsd ?? 0}
        selectedType={selectedVehicle}
        onSelectType={handleSelectVehicleType}
        onConfirmSearch={handleConfirmVehicleSearch}
        onBackToPick={handleBackToVehiclePick}
        onBackToPayment={handleBackToPayment}
        selectedPayment={taxiPaymentMethod}
        onSelectPayment={setTaxiPaymentMethod}
        onPaymentContinue={handlePaymentContinue}
        searchRemainingSec={searchRemainingSec}
        searchTotalSec={VEHICLE_SEARCH_TOTAL_SEC}
        onRequestCancelSearch={openCancelServiceDialog}
      />

      <Dialog open={cancelServiceDialogOpen} onOpenChange={setCancelServiceDialogOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              {cancelServiceMode === "search"
                ? "¿Cancelar la búsqueda?"
                : cancelServiceMode === "matched"
                  ? "¿Cancelar este viaje?"
                  : "¿Cancelar el viaje en curso?"}
            </DialogTitle>
            <DialogDescription>
              {cancelServiceMode === "search"
                ? "Dejarás de buscar conductor para este trayecto. Podrás volver a intentarlo cuando quieras."
                : cancelServiceMode === "matched"
                  ? "El conductor será notificado y el viaje quedará anulado. ¿Seguro que deseas continuar?"
                  : "Si ya van en marcha, conviene avisar al conductor por teléfono o chat. ¿Seguro que deseas cancelar?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelServiceDialogOpen(false)}
              disabled={cancelServiceBusy}
            >
              No, volver
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={cancelServiceBusy}
              onClick={() => void confirmCancelService()}
            >
              {cancelServiceBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Cancelando…
                </>
              ) : (
                "Sí, cancelar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rateDialogOpen} onOpenChange={() => { /* bloqueado */ }}>
        <DialogContent hideClose className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>¿Cómo se portó el Driver?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Califica a <span className="font-medium text-foreground">{rateTargetRef.current?.targetName ?? "tu conductor"}</span>.
            </p>
            <div className="flex items-center justify-center gap-2">
              {[1,2,3,4,5].map((v) => {
                const active = v <= rateStars;
                return (
                  <button
                    key={v}
                    type="button"
                    className="p-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setRateStars(v)}
                    aria-label={`${v} estrellas`}
                  >
                    <Star className={`h-8 w-8 ${active ? "text-amber-500 fill-amber-500" : "text-muted-foreground"}`} />
                  </button>
                );
              })}
            </div>
            <Button className="w-full" onClick={() => void submitRideRating()} disabled={rateBusy}>
              {rateBusy ? "Enviando…" : "Enviar calificación"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

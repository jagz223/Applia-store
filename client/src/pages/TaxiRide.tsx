import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Bike, Car, ChevronDown, ChevronUp, Loader2, MapPin, Maximize2, Minimize2, Navigation, PawPrint, Phone, Star, Truck } from "lucide-react";
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
import { RiderNegotiationOffersModal, type RiderNegotiationOfferRow } from "@/components/taxi/RiderNegotiationOffersModal";
import { TaxiVehicleSearchModal } from "@/components/taxi/TaxiVehicleSearchModal";
import type { TaxiPaymentMethod, TaxiVehicleKind, TaxiVehicleModalStep } from "@/components/taxi/TaxiVehicleSearchModal";
import type { GeoJsonObject } from "geojson";
import { useGoChat } from "@/contexts/GoChatContext";
import { addHiddenConversationId } from "@/lib/hidden-conversations";
import { purgeConversationCache } from "@/hooks/use-chat";
import { useAuth } from "@/hooks/use-auth";
import { usePlatformMobilityFares, usePlatformPackFares } from "@/hooks/use-mango-data";
import { useSocket, useSocketChat } from "@/hooks/use-socket";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { clearGoRiderActiveRideId, loadGoRiderActiveRideId, saveGoRiderActiveRideId } from "@/lib/cargo-rider-storage";
import { appendRiderTripLog } from "@/lib/cargo-rider-trip-log";
import { MOBILITY_UI } from "@shared/mobility-ui-labels";

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

function roundToCents(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function formatUsd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `$${v.toFixed(2)}`;
}

// Negociación (contraofertas) desactivada por ahora.

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
  estimatedUsd?: number;
  suggestedUsd?: number;
  isNegotiated?: boolean;
  offers?: unknown[];
  start: Place;
  end: Place;
  driver: {
    userId: string;
    name: string;
    lastName?: string;
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

function mapServerNegotiationOffer(raw: unknown): RiderNegotiationOfferRow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const d = o.driver as Record<string, unknown> | undefined;
  const v = d?.vehicle as Record<string, unknown> | undefined;
  if (typeof o.driverUserId !== "string" || typeof o.amountUsd !== "number" || !d) return null;
  return {
    driverUserId: o.driverUserId,
    amountUsd: o.amountUsd,
    driver: {
      name: String(d.name ?? "Conductor"),
      profileImageUrl: (d.profileImageUrl as string) ?? null,
      rating: typeof d.rating === "number" ? d.rating : undefined,
      completedTrips: typeof d.completedTrips === "number" ? d.completedTrips : undefined,
      vehicle: v
        ? {
            type: String(v.type ?? ""),
            brand: String(v.brand ?? ""),
            model: String(v.model ?? ""),
            licensePlate: String(v.licensePlate ?? ""),
          }
        : null,
    },
  };
}

export default function TaxiRide({ goSlug = "cargo" }: { goSlug?: "cargo" | "pack" } = {}) {
  const queryClient = useQueryClient();
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [rateStars, setRateStars] = useState(5);
  const [rateBusy, setRateBusy] = useState(false);
  const rateTargetRef = useRef<{ rideId: string; target: "driver"; targetName: string } | null>(null);
  const [location, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { primeCarGoConversation, resetChat } = useGoChat();
  const { socket } = useSocket();
  const { toast } = useToast();
  const params = useMemo(() => new URLSearchParams(typeof window !== "undefined" ? window.location.search : ""), []);
  const fromCategories = params.get("from") === "categories";
  const isPackGoClient = goSlug === "pack";
  const uiWords = useMemo(
    () => ({
      service: isPackGoClient ? "envío" : "viaje",
      Service: isPackGoClient ? "Envío" : "Viaje",
      driver: isPackGoClient ? "repartidor" : "conductor",
      Driver: isPackGoClient ? "Repartidor" : "Conductor",
      pickupPoint: isPackGoClient ? "punto de retiro" : "punto de partida",
    }),
    [isPackGoClient]
  );

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
  const [ridePanelCollapsed, setRidePanelCollapsed] = useState(false);
  const [vehicleModalStep, setVehicleModalStep] = useState<TaxiVehicleModalStep>("pick");
  const [selectedVehicle, setSelectedVehicle] = useState<TaxiVehicleKind | null>(null);
  const [taxiPaymentMethod, setTaxiPaymentMethod] = useState<TaxiPaymentMethod | null>(null);
  const petEnabled = selectedVehicle === "pet_car";
  const vehicleOptions = useMemo(
    () => (goSlug === "pack" ? VEHICLE_OPTIONS.filter((o) => o.type !== "pet_car") : VEHICLE_OPTIONS),
    [goSlug]
  );
  const [nearbyDriverMarkers, setNearbyDriverMarkers] = useState<{ id: string; lat: number; lon: number }[]>([]);
  const [assignedDriverPos, setAssignedDriverPos] = useState<{ lat: number; lon: number } | null>(null);
  const assignedDriverPosRef = useRef<{ lat: number; lon: number } | null>(null);
  const endPlaceRef = useRef<Place | null>(null);
  const [driverToPickupGeometry, setDriverToPickupGeometry] = useState<GeoJsonObject | null>(null);
  const [driverToPickupMeta, setDriverToPickupMeta] = useState<{ distanceM: number; durationSec: number } | null>(null);
  const [driverEtaLoading, setDriverEtaLoading] = useState(false);
  const [activeRideId, setActiveRideId] = useState<string | null>(null);
  const activeRideIdRef = useRef<string | null>(null);
  const [rideIsNegotiated, setRideIsNegotiated] = useState(false);
  const [clientHaggleUsd, setClientHaggleUsd] = useState(0);
  const [negotiationOffersOpen, setNegotiationOffersOpen] = useState(false);
  const [negotiationOffers, setNegotiationOffers] = useState<RiderNegotiationOfferRow[]>([]);
  const [negotiationOfferBusyId, setNegotiationOfferBusyId] = useState<string | null>(null);
  /** Si el diálogo de cancelar se abrió desde el modal de ofertas de regateo (para reabrir ofertas al descartar). */
  const cancelSearchOpenedFromNegotiationRef = useRef(false);
  /** Monto acordado al hacer match (incluye regateo aceptado). */
  const [matchedFareUsd, setMatchedFareUsd] = useState<number | null>(null);
  const { data: mobilityFaresDto } = usePlatformMobilityFares({ enabled: !isPackGoClient });
  const { data: packFaresDto } = usePlatformPackFares({ enabled: isPackGoClient });

  const suggestedUsdByVehicle = useMemo(() => {
    if (!routeMeta) return {};
    const km = Math.max(0, (routeMeta.distanceM ?? 0) / 1000);
    const hour = new Date().getHours();
    const isNight = hour >= 19 || hour < 6;

    const out: Record<TaxiVehicleKind, number> = {} as any;

    if (isPackGoClient) {
      const fares = (packFaresDto as any)?.fares as
        | { moto?: { baseUsd: number; perKmUsd: number }; auto?: { baseUsd: number; perKmUsd: number }; camioneta?: { baseUsd: number; perKmUsd: number } }
        | undefined;
      if (fares?.moto) out.moto = roundToCents(Math.max(0, Number(fares.moto.baseUsd) + km * Number(fares.moto.perKmUsd)));
      if (fares?.auto) out.auto = roundToCents(Math.max(0, Number(fares.auto.baseUsd) + km * Number(fares.auto.perKmUsd)));
      // En Pack (Delivery) no hay pet_car, lo dejamos calculado como auto por compatibilidad.
      if (fares?.auto) out.pet_car = out.auto;
      if (fares?.camioneta)
        out.camioneta = roundToCents(Math.max(0, Number(fares.camioneta.baseUsd) + km * Number(fares.camioneta.perKmUsd)));
      return out;
    }

    const fares = (mobilityFaresDto as any)?.fares as
      | {
          moto?: { baseUsd: number; perKmUsd: number };
          auto?: { baseDayUsd: number; baseNightUsd: number; perKmUsd: number; petExtraUsd: number };
          camioneta?: { baseUsd: number; perKmUsd: number; petExtraUsd: number };
        }
      | undefined;

    if (fares?.moto) out.moto = roundToCents(Math.max(0, Number(fares.moto.baseUsd) + km * Number(fares.moto.perKmUsd)));
    if (fares?.auto) {
      const base = isNight ? Number(fares.auto.baseNightUsd) : Number(fares.auto.baseDayUsd);
      out.auto = roundToCents(Math.max(0, base + km * Number(fares.auto.perKmUsd)));
      out.pet_car = roundToCents(Math.max(0, base + km * Number(fares.auto.perKmUsd) + Number(fares.auto.petExtraUsd)));
    }
    if (fares?.camioneta) {
      out.camioneta = roundToCents(
        Math.max(0, Number(fares.camioneta.baseUsd) + km * Number(fares.camioneta.perKmUsd))
      );
    }

    return out;
  }, [routeMeta, isPackGoClient, packFaresDto, mobilityFaresDto]);

  const suggestedUsd = useMemo(() => {
    if (!routeMeta || !selectedVehicle) return null;
    const km = Math.max(0, (routeMeta.distanceM ?? 0) / 1000);
    if (isPackGoClient) {
      const fares = (packFaresDto as any)?.fares as
        | { moto?: { baseUsd: number; perKmUsd: number }; auto?: { baseUsd: number; perKmUsd: number }; camioneta?: { baseUsd: number; perKmUsd: number } }
        | undefined;
      const f = selectedVehicle === "camioneta" ? fares?.camioneta : selectedVehicle === "auto" ? fares?.auto : fares?.moto;
      if (!f) return null;
      return roundToCents(Math.max(0, Number(f.baseUsd) + km * Number(f.perKmUsd)));
    }
    const fares = (mobilityFaresDto as any)?.fares as
      | {
          moto?: { baseUsd: number; perKmUsd: number };
          auto?: { baseDayUsd: number; baseNightUsd: number; perKmUsd: number; petExtraUsd: number };
          camioneta?: { baseUsd: number; perKmUsd: number; petExtraUsd: number };
        }
      | undefined;
    const hour = new Date().getHours();
    const isNight = hour >= 19 || hour < 6;
    if (selectedVehicle === "moto") {
      const f = fares?.moto;
      if (!f) return null;
      return roundToCents(Math.max(0, Number(f.baseUsd) + km * Number(f.perKmUsd)));
    }
    if (selectedVehicle === "camioneta") {
      const f = fares?.camioneta;
      if (!f) return null;
      const extra = petEnabled ? Number(f.petExtraUsd) : 0;
      return roundToCents(Math.max(0, Number(f.baseUsd) + km * Number(f.perKmUsd) + extra));
    }
    // auto / pet_car => auto + extra
    const f = fares?.auto;
    if (!f) return null;
    const base = isNight ? Number(f.baseNightUsd) : Number(f.baseDayUsd);
    const extra = petEnabled ? Number(f.petExtraUsd) : 0;
    return roundToCents(Math.max(0, base + km * Number(f.perKmUsd) + extra));
  }, [routeMeta, selectedVehicle, isPackGoClient, packFaresDto, mobilityFaresDto, petEnabled]);

  // Negociación (ajustar oferta +/-) desactivada por ahora: usamos siempre la referencia sugerida.
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
      phone?: string | null;
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

  useEffect(() => {
    if (!matchedDriverInfo) setRidePanelCollapsed(false);
  }, [matchedDriverInfo]);
  const [searchRemainingSec, setSearchRemainingSec] = useState(VEHICLE_SEARCH_TOTAL_SEC);
  /** Solo en la ruta Go Car (cliente): mapa a pantalla completa para elegir puntos. */
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [cancelServiceDialogOpen, setCancelServiceDialogOpen] = useState(false);
  const [cancelServiceBusy, setCancelServiceBusy] = useState(false);
  const [cancelServiceMode, setCancelServiceMode] = useState<"search" | "matched" | "progress">("search");

  const goBasePath = goSlug === "pack" ? "/go/delivery" : "/go/taxi";
  const rideApiBase = goSlug === "pack" ? "/api/pack/rides" : "/api/mobility/rides";
  const rideApiRequestPath = goSlug === "pack" ? "/api/pack/rides/request" : "/api/mobility/rides/request";
  const rideSocketPrefix = goSlug === "pack" ? "pack:ride:" : "cargo:ride:";

  const isGoClient = location === goBasePath;
  const matchedDriverFullName = useMemo(() => {
    if (!matchedDriverInfo) return "";
    const d = matchedDriverInfo.driver as unknown as { name?: string; lastName?: string; last_name?: string };
    return [d?.name ?? "Usuario", d?.lastName ?? d?.last_name ?? ""].filter(Boolean).join(" ").trim();
  }, [matchedDriverInfo]);

  const matchedDriverPhone = useMemo(() => {
    if (!matchedDriverInfo) return "";
    const d = matchedDriverInfo.driver as unknown as {
      phone?: unknown;
      phoneNumber?: unknown;
      phone_number?: unknown;
      phone_number_e164?: unknown;
    };
    const v =
      String(d?.phone ?? d?.phoneNumber ?? d?.phone_number ?? d?.phone_number_e164 ?? "").trim();
    return v.length > 0 ? v : "";
  }, [matchedDriverInfo]);

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
  const showMapFullscreen = mapFullscreen && isGoClient && isMdUp;

  useEffect(() => {
    if (isGoClient && !isMdUp && mapFullscreen) setMapFullscreen(false);
  }, [isGoClient, isMdUp, mapFullscreen]);

  const debounceStart = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceEnd = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchEndAtRef = useRef<number>(0);
  // En este proyecto a veces `setInterval/setTimeout` tipa como NodeJS.Timeout.
  // Como usamos `window.*`, guardamos el id numérico del navegador.
  const searchTickRef = useRef<number | null>(null);
  const searchDoneTimeoutRef = useRef<number | null>(null);
  const estimatedUsdRef = useRef<number>(0);

  const goBack = () => setLocation(fromCategories ? "/categories" : "/explore");

  const riderDraftKey = useMemo(() => `genfeb-go-rider-draft:${goSlug}`, [goSlug]);
  const saveRiderDraft = useCallback(
    () => {
      if (typeof window === "undefined") return;
      try {
        const payload = {
          at: Date.now(),
          goSlug,
          start,
          end,
          startInput,
          endInput,
          routeGeometry,
          routeMeta,
          selectedVehicle,
          taxiPaymentMethod,
          vehicleModalStep,
          vehiclePickerOpen,
          mapTarget,
          rideIsNegotiated,
          clientHaggleUsd,
        };
        sessionStorage.setItem(riderDraftKey, JSON.stringify(payload));
      } catch {
        /* ignore */
      }
    },
    [
      riderDraftKey,
      goSlug,
      start,
      end,
      startInput,
      endInput,
      routeGeometry,
      routeMeta,
      selectedVehicle,
      taxiPaymentMethod,
      vehicleModalStep,
      vehiclePickerOpen,
      mapTarget,
      rideIsNegotiated,
      clientHaggleUsd,
    ]
  );

  useEffect(() => {
    if (!isGoClient) return;
    if (activeRideIdRef.current || matchedDriverInfoRef.current) return;
    try {
      const raw = sessionStorage.getItem(riderDraftKey);
      if (!raw) return;
      sessionStorage.removeItem(riderDraftKey);
      const p = JSON.parse(raw) as any;
      if (!p || typeof p !== "object") return;
      // caduca rápido (15 min)
      if (typeof p.at === "number" && Date.now() - p.at > 15 * 60_000) return;
      if (p.goSlug && p.goSlug !== goSlug) return;
      if (p.start) setStart(p.start);
      if (p.end) setEnd(p.end);
      if (typeof p.startInput === "string") setStartInput(p.startInput);
      if (typeof p.endInput === "string") setEndInput(p.endInput);
      if (p.routeGeometry) setRouteGeometry(p.routeGeometry);
      if (p.routeMeta) setRouteMeta(p.routeMeta);
      if (typeof p.mapTarget === "string") setMapTarget(p.mapTarget);
      if (p.selectedVehicle) setSelectedVehicle(p.selectedVehicle);
      if (p.taxiPaymentMethod) {
        const m = p.taxiPaymentMethod as string;
        if (m === "cash" || m === "bank_transfer") setTaxiPaymentMethod(m);
      }
      if (p.vehicleModalStep) setVehicleModalStep(p.vehicleModalStep);
      if (typeof p.vehiclePickerOpen === "boolean") setVehiclePickerOpen(p.vehiclePickerOpen);
      if (typeof p.rideIsNegotiated === "boolean") setRideIsNegotiated(p.rideIsNegotiated);
      if (typeof p.clientHaggleUsd === "number") setClientHaggleUsd(p.clientHaggleUsd);
    } catch {
      /* ignore */
    }
  }, [isGoClient, riderDraftKey, goSlug]);

  useEffect(() => {
    activeRideIdRef.current = activeRideId;
  }, [activeRideId]);
  useSocketChat(
    isGoClient && matchedDriverInfo?.conversationId != null
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
    setMatchedFareUsd(null);
    setNegotiationOffersOpen(false);
    setNegotiationOffers([]);
    clearGoRiderActiveRideId(goSlug === "pack" ? "pack" : "cargo");
    resetChat();
  }, [clearVehicleSearchTimers, resetChat, queryClient]);

  const openCancelServiceDialog = useCallback(() => {
    if (vehicleModalStep === "searching") setCancelServiceMode("search");
    else if (riderTripInProgress) setCancelServiceMode("progress");
    else setCancelServiceMode("matched");
    // Evitar overlays apilados: al abrir confirmación, ocultar el modal de búsqueda/vehículo.
    setVehiclePickerOpen(false);
    setCancelServiceDialogOpen(true);
  }, [vehicleModalStep, riderTripInProgress]);

  const openCancelFromNegotiationOffers = useCallback(() => {
    cancelSearchOpenedFromNegotiationRef.current = true;
    setNegotiationOffersOpen(false);
    openCancelServiceDialog();
  }, [openCancelServiceDialog]);

  const handleCancelServiceDialogOpenChange = useCallback((open: boolean) => {
    setCancelServiceDialogOpen(open);
    if (open) return;
    if (!cancelSearchOpenedFromNegotiationRef.current) return;
    cancelSearchOpenedFromNegotiationRef.current = false;
    if (activeRideIdRef.current) setNegotiationOffersOpen(true);
  }, []);

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
      const res = await fetch(`${rideApiBase}/${encodeURIComponent(rideId)}/cancel`, {
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
  }, [applyCarGoRideEnded, toast, rideApiBase]);

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
    setRideIsNegotiated(false);
    setClientHaggleUsd(0);
    setNegotiationOffersOpen(false);
    setNegotiationOffers([]);
    setMatchedFareUsd(null);
    clearGoRiderActiveRideId(goSlug === "pack" ? "pack" : "cargo");
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
        setRideIsNegotiated(false);
        setNegotiationOffersOpen(false);
        setNegotiationOffers([]);
        clearGoRiderActiveRideId(goSlug === "pack" ? "pack" : "cargo");
      }
      setVehiclePickerOpen(open);
    },
    [clearVehicleSearchTimers]
  );

  const handleSelectVehicleType = useCallback((t: TaxiVehicleKind) => {
    setSelectedVehicle(t);
    setTaxiPaymentMethod(null);
    setRideIsNegotiated(false);
    setVehicleModalStep("price_mode");
  }, []);

  const handleChooseStandardPrice = useCallback(() => {
    setRideIsNegotiated(false);
    setVehicleModalStep("payment");
  }, []);

  const handleChooseHaggle = useCallback(() => {
    setRideIsNegotiated(true);
    if (suggestedUsd != null) setClientHaggleUsd(Math.round(suggestedUsd * 100) / 100);
    setVehicleModalStep("haggle");
  }, [suggestedUsd]);

  const handleHaggleBump = useCallback((delta: number) => {
    setClientHaggleUsd((prev) => Math.round(Math.max(0.01, prev + delta) * 100) / 100);
  }, []);

  const handleHaggleDecide = useCallback(() => {
    setVehicleModalStep("payment");
  }, []);

  const handleBackFromHaggle = useCallback(() => {
    setVehicleModalStep("price_mode");
  }, []);

  const handleBackFromPriceMode = useCallback(() => {
    setSelectedVehicle(null);
    setVehicleModalStep("pick");
  }, []);

  const handleBackToHaggleFromPayment = useCallback(() => {
    setVehicleModalStep("haggle");
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
  }, [taxiPaymentMethod]);

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
  const estimatedUsd = matchedFareUsd ?? (rideIsNegotiated ? clientHaggleUsd : suggestedUsd ?? 0);
  useEffect(() => {
    estimatedUsdRef.current = estimatedUsd;
  }, [estimatedUsd]);

  /**
   * El handler de `cargo:ride:completed` vive en un useEffect que no re-incluye `estimatedUsd` en deps
   * (no queremos re-suscribir el socket a cada cambio). Sin ref, el closure suele leer `estimatedUsd` viejo (null) => $0 en historial.
   */
  const riderTripSnapshotRef = useRef<{
    amountUsd: number;
    durationSec: number;
    payment: "cash" | "bank_transfer";
  }>({ amountUsd: 0, durationSec: 0, payment: "cash" });
  useEffect(() => {
    const pay = taxiPaymentMethod ?? "cash";
    const usd = matchedFareUsd ?? (rideIsNegotiated ? clientHaggleUsd : suggestedUsd ?? 0);
    riderTripSnapshotRef.current = {
      amountUsd: usd,
      durationSec: routeMeta?.durationSec ?? 0,
      payment: pay === "cash" || pay === "bank_transfer" ? pay : "cash",
    };
  }, [routeMeta, taxiPaymentMethod, matchedFareUsd, rideIsNegotiated, clientHaggleUsd, suggestedUsd]);

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
    if (suggestedUsd == null) return;
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
          description: `Ningún ${uiWords.driver} aceptó. Puedes intentar de nuevo.`,
          variant: "destructive",
        });
        setActiveRideId(null);
        activeRideIdRef.current = null;
        setNegotiationOffersOpen(false);
        setNegotiationOffers([]);
        clearGoRiderActiveRideId(goSlug === "pack" ? "pack" : "cargo");
        return "ready";
      });
    }, VEHICLE_SEARCH_MAX_MS);

    const token = localStorage.getItem("token");
    if (!token) {
      toast({
        title: isPackGoClient ? "Inicia sesión para pedir un envío" : "Inicia sesión para pedir un viaje",
        variant: "destructive",
      });
      clearVehicleSearchTimers();
      setVehicleModalStep("ready");
      return;
    }

    try {
      const res = await fetch(rideApiRequestPath, {
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
          suggestedUsd,
          estimatedUsd: rideIsNegotiated ? clientHaggleUsd : suggestedUsd,
          isNegotiated: rideIsNegotiated,
          petEnabled,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { rideId?: string; message?: string; code?: string };
      if (!res.ok) {
        toast({
          title: isPackGoClient ? "No se pudo buscar repartidor" : "No se pudo buscar conductor",
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
        saveGoRiderActiveRideId(goSlug === "pack" ? "pack" : "cargo", data.rideId);
        if (rideIsNegotiated) {
          setNegotiationOffers([]);
          setNegotiationOffersOpen(true);
        } else {
          setNegotiationOffersOpen(false);
          setNegotiationOffers([]);
        }
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
    petEnabled,
    clearVehicleSearchTimers,
    toast,
    rideIsNegotiated,
    clientHaggleUsd,
    goSlug,
    rideApiRequestPath,
  ]);

  const dismissNegotiationOffer = useCallback(
    async (driverUserId: string) => {
      const rid = activeRideIdRef.current;
      if (!rid) return;
      const token = localStorage.getItem("token");
      if (!token) return;
      setNegotiationOfferBusyId(driverUserId);
      try {
        const res = await fetch(
          `${rideApiBase}/${encodeURIComponent(rid)}/negotiation/offers/${encodeURIComponent(driverUserId)}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
        );
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        if (!res.ok) throw new Error(data.message || "No se pudo descartar");
        setNegotiationOffers((prev) => prev.filter((o) => o.driverUserId !== driverUserId));
      } catch (e) {
        toast({
          title: "No se pudo descartar",
          description: e instanceof Error ? e.message : "Intenta de nuevo",
          variant: "destructive",
        });
      } finally {
        setNegotiationOfferBusyId(null);
      }
    },
    [rideApiBase, toast]
  );

  const acceptNegotiationOffer = useCallback(
    async (driverUserId: string) => {
      const rid = activeRideIdRef.current;
      if (!rid) return;
      const token = localStorage.getItem("token");
      if (!token) return;
      setNegotiationOfferBusyId(driverUserId);
      try {
        const res = await fetch(
          `${rideApiBase}/${encodeURIComponent(rid)}/negotiation/accept/${encodeURIComponent(driverUserId)}`,
          { method: "POST", headers: { Authorization: `Bearer ${token}` } }
        );
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        if (!res.ok) throw new Error(data.message || "No se pudo aceptar");
        setNegotiationOffersOpen(false);
        setNegotiationOffers([]);
      } catch (e) {
        toast({
          title: "No se pudo aceptar",
          description: e instanceof Error ? e.message : "Intenta de nuevo",
          variant: "destructive",
        });
      } finally {
        setNegotiationOfferBusyId(null);
      }
    },
    [rideApiBase, toast]
  );

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
      estimatedUsd?: number;
    }) => {
      if (p.rideId !== activeRideIdRef.current) return;
      clearVehicleSearchTimers();
      setNegotiationOffersOpen(false);
      setNegotiationOffers([]);
      if (typeof p.estimatedUsd === "number") setMatchedFareUsd(p.estimatedUsd);
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
        title: isPackGoClient ? "Tu repartidor está en camino" : "Tu conductor te está buscando",
        description: "Mantente atento: verás su ubicación en el mapa mientras se acerca.",
      });
    };
    const onCompleted = async (p: { rideId: string }) => {
      if (p.rideId !== activeRideIdRef.current) return;
      const snap = riderTripSnapshotRef.current;
      let amountUsd = snap.amountUsd;
      let durationSec = snap.durationSec;
      let payment: "cash" | "bank_transfer" = snap.payment;

      const token = localStorage.getItem("token");
      if (token) {
        try {
        const res = await fetch(`${rideApiBase}/${encodeURIComponent(p.rideId)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const r = (await res.json()) as {
              durationSec?: number;
              paymentMethod?: string;
              estimatedUsd?: number;
            };
            if (typeof r.durationSec === "number" && r.durationSec > 0) {
              durationSec = r.durationSec;
            }
            if (r.paymentMethod === "cash" || r.paymentMethod === "bank_transfer") {
              payment = r.paymentMethod;
            }
            if (typeof r.estimatedUsd === "number" && Number.isFinite(r.estimatedUsd)) {
              amountUsd = r.estimatedUsd;
            }
          }
        } catch {
          /* usar snap */
        }
      }

      // Guardar historial del pasajero antes de limpiar estado.
      if (matchedDriverInfoRef.current) {
        appendRiderTripLog(
          {
            id: p.rideId,
            endedAt: new Date().toISOString(),
            durationMin: Math.max(1, Math.round(durationSec / 60)),
            amountUsd,
            payment,
            driverName: matchedDriverInfoRef.current.driver?.name ?? "Conductor",
            goSlug: goSlug === "pack" ? "pack" : "cargo",
          },
          ((user as any)?.email ?? (user as any)?.id ?? null) != null
            ? String(((user as any)?.email ?? (user as any)?.id) as any)
            : null
        );
        rateTargetRef.current = {
          rideId: p.rideId,
          target: "driver",
          targetName: matchedDriverInfoRef.current.driver?.name ?? "Driver",
        };
        setRateStars(5);
        setRateDialogOpen(true);
      }
      applyCarGoRideEnded();
      toast({
        title: isPackGoClient ? "Envío finalizado" : "Viaje finalizado",
        description: isPackGoClient ? `Gracias por usar ${MOBILITY_UI.delivery}.` : `Gracias por usar ${MOBILITY_UI.taxiService.toLowerCase()}.`,
      });
    };
    const onCancelled = (p: { rideId: string; cancelledBy: "rider" | "driver" }) => {
      if (p.rideId !== activeRideIdRef.current) return;
      setNegotiationOffersOpen(false);
      setNegotiationOffers([]);
      applyCarGoRideEnded();
      if (p.cancelledBy === "driver") {
        toast({
          title: isPackGoClient ? "El repartidor canceló" : "El conductor canceló",
          description: "Puedes volver a buscar cuando quieras.",
          variant: "destructive",
        });
      } else {
        toast({
          title: isPackGoClient ? "Envío cancelado" : "Viaje cancelado",
          description: "El servicio ya no está activo.",
        });
      }
    };
    socket.on(`${rideSocketPrefix}matched`, onMatched);
    socket.on(`${rideSocketPrefix}driver_location`, onDriverLoc);
    socket.on(`${rideSocketPrefix}driver_searching`, onDriverSearching);
    socket.on(`${rideSocketPrefix}started`, onStarted);
    socket.on(`${rideSocketPrefix}completed`, onCompleted);
    socket.on(`${rideSocketPrefix}cancelled`, onCancelled);
    const onFailed = (p: { rideId: string; reason: string }) => {
      if (p.rideId !== activeRideIdRef.current) return;
      clearVehicleSearchTimers();
      setNegotiationOffersOpen(false);
      setNegotiationOffers([]);
      setVehicleModalStep("ready");
      setActiveRideId(null);
      activeRideIdRef.current = null;
      clearGoRiderActiveRideId(goSlug === "pack" ? "pack" : "cargo");
      toast({
        title: isPackGoClient ? "No hay repartidores disponibles" : "No hay conductores disponibles",
        description: isPackGoClient
          ? "Por ahora no hay repartidores para ese vehículo. Puedes intentar otro (p. ej. moto)."
          : "Por ahora no hay drivers para ese vehículo. Puedes intentar otro (p. ej. moto).",
        variant: "destructive",
      });
    };
    socket.on(`${rideSocketPrefix}failed`, onFailed);
    const onNegoOffers = (p: { rideId: string; offers?: unknown[] }) => {
      if (p.rideId !== activeRideIdRef.current) return;
      const rows = (Array.isArray(p.offers) ? p.offers : [])
        .map(mapServerNegotiationOffer)
        .filter((x): x is RiderNegotiationOfferRow => x != null);
      setNegotiationOffers(rows);
    };
    socket.on(`${rideSocketPrefix}negotiation:offers_updated`, onNegoOffers);
    return () => {
      socket.off(`${rideSocketPrefix}matched`, onMatched);
      socket.off(`${rideSocketPrefix}driver_location`, onDriverLoc);
      socket.off(`${rideSocketPrefix}driver_searching`, onDriverSearching);
      socket.off(`${rideSocketPrefix}started`, onStarted);
      socket.off(`${rideSocketPrefix}completed`, onCompleted);
      socket.off(`${rideSocketPrefix}cancelled`, onCancelled);
      socket.off(`${rideSocketPrefix}failed`, onFailed);
      socket.off(`${rideSocketPrefix}negotiation:offers_updated`, onNegoOffers);
    };
  }, [
    socket,
    clearVehicleSearchTimers,
    applyCarGoRideEnded,
    primeCarGoConversation,
    toast,
    start,
    end,
    loadDriverEtaRoute,
    rideSocketPrefix,
    goSlug,
    user?.id,
    isPackGoClient,
  ]);

  // Contraofertas desactivadas: no hay limpieza.

  const submitRideRating = useCallback(async () => {
    const tgt = rateTargetRef.current;
    if (!tgt) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    setRateBusy(true);
    try {
      const base = goSlug === "pack" ? "/api/pack/rides" : "/api/mobility/rides";
      const res = await fetch(`${base}/${encodeURIComponent(tgt.rideId)}/rate`, {
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
  }, [rateStars, toast, goSlug]);

  useEffect(() => {
    if (!riderTripInProgress || !assignedDriverPos || !end) return;
    void loadDriverEtaRoute(assignedDriverPos, end);
  }, [riderTripInProgress, assignedDriverPos, end, loadDriverEtaRoute]);

  useEffect(() => {
    if (!isGoClient || authLoading || !isAuthenticated) return;
    const stored = loadGoRiderActiveRideId(goSlug === "pack" ? "pack" : "cargo");
    if (!stored) return;
    const token = localStorage.getItem("token");
    if (!token) {
      clearGoRiderActiveRideId(goSlug === "pack" ? "pack" : "cargo");
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${rideApiBase}/${encodeURIComponent(stored)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!alive) return;
        if (!res.ok) {
          clearGoRiderActiveRideId(goSlug === "pack" ? "pack" : "cargo");
          return;
        }
        const ride = (await res.json()) as MobilityRideHydration;
        // Importante: si el ride sigue en búsqueda, NO limpiar el estado.
        // El usuario debe seguir viendo "buscando" sin tener que reiniciar.
        if (ride.status === "searching") {
          setActiveRideId(ride.id);
          activeRideIdRef.current = ride.id;
          setStart(ride.start);
          setEnd(ride.end);
          setStartInput(ride.start.label);
          setEndInput(ride.end.label);
          setMatchedDriverInfo(null);
          setAssignedDriverPos(null);
          setRiderTripInProgress(false);
          setVehiclePickerOpen(true);
          setVehicleModalStep("searching");
          if (ride.isNegotiated) {
            setRideIsNegotiated(true);
            if (typeof ride.estimatedUsd === "number") setClientHaggleUsd(ride.estimatedUsd);
            const rows = (Array.isArray(ride.offers) ? ride.offers : [])
              .map(mapServerNegotiationOffer)
              .filter((x): x is RiderNegotiationOfferRow => x != null);
            setNegotiationOffers(rows);
            setNegotiationOffersOpen(true);
          } else {
            setNegotiationOffersOpen(false);
            setNegotiationOffers([]);
          }
          // Reiniciamos timers de búsqueda local (5 min) al rehidratar.
          clearVehicleSearchTimers();
          setSearchRemainingSec(VEHICLE_SEARCH_TOTAL_SEC);
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
                description: `Ningún ${uiWords.driver} aceptó. Puedes intentar de nuevo.`,
                variant: "destructive",
              });
              setActiveRideId(null);
              activeRideIdRef.current = null;
              clearGoRiderActiveRideId(goSlug === "pack" ? "pack" : "cargo");
              return "ready";
            });
          }, VEHICLE_SEARCH_MAX_MS);
          return;
        }

        if (ride.status !== "matched" && ride.status !== "in_progress") {
          clearGoRiderActiveRideId(goSlug === "pack" ? "pack" : "cargo");
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
        if (alive) clearGoRiderActiveRideId(goSlug === "pack" ? "pack" : "cargo");
      }
    })();
    return () => {
      alive = false;
    };
  }, [isGoClient, authLoading, isAuthenticated, rideApiBase]);

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
    // Con servicio activo, el mapa NO debe permitir re-seleccionar puntos (evita reset/cancel accidental).
    if (matchedDriverInfoRef.current || activeRideIdRef.current) return;
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
        isGoClient ? "flex min-h-0 min-w-0 flex-1 flex-col max-md:overflow-hidden max-md:pb-0 md:pb-12" : "min-h-screen pb-12"
      )}
    >
      <div
        className={cn(
          "container mx-auto max-w-4xl px-4 pt-6",
          isGoClient &&
            "flex min-h-0 min-w-0 flex-1 flex-col max-md:overflow-hidden max-md:max-w-none max-md:px-3 max-md:pb-0 max-md:pt-2 md:max-w-[min(1320px,96vw)] md:px-6 lg:px-8"
        )}
      >
        <Button
          variant="ghost"
          className={cn("mb-4 -ml-2 gap-2", isGoClient && "hidden md:inline-flex")}
          onClick={goBack}
        >
          <ArrowLeft className="h-4 w-4" />
          {fromCategories ? "Volver a categorías" : "Volver a Explorar"}
        </Button>

        <div className={cn("mb-6", isGoClient && "hidden md:block")}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <h1 className="text-3xl font-display font-bold text-foreground">
                {isPackGoClient ? MOBILITY_UI.delivery : MOBILITY_UI.taxiService}
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Primero fija el{" "}
                <strong className="text-foreground">{goSlug === "pack" ? "punto de retiro" : "origen"}</strong> (puedes
                afinarlo en el mapa). Cuando esté bien, elige{" "}
                <strong className="text-foreground">2. {goSlug === "pack" ? "Entrega" : "Destino"}</strong> y marca el{" "}
                {goSlug === "pack" ? "punto de entrega" : "destino"}. Con ambos puntos listos, pulsa{" "}
                <strong className="text-foreground">Continuar</strong> para elegir el tipo de vehículo.
              </p>
            </div>
            {/*
              Wallet/Recargar ahora viven en `GoBottomNav` para que se vean igual en móvil y PC (barra inferior).
            */}
          </div>
        </div>

        {/* Go / Car: móvil — mapa llena main (sin scroll); overlay encima. */}
        {isGoClient && !isMdUp && (
          <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden md:hidden max-md:h-[calc(100vh-8.25rem)] max-md:h-[calc(100svh-8.25rem)] max-md:min-h-[calc(100vh-8.25rem)] max-md:min-h-[calc(100svh-8.25rem)]">
            {/* Botón flotante: volver (siempre visible, no pegado a inputs) */}
            {!vehiclePickerOpen && !matchedDriverInfo ? (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="pointer-events-auto absolute left-3 top-3 z-30 h-10 w-10 overflow-hidden rounded-full border border-border/60 bg-background/90 p-0 shadow-md backdrop-blur-sm"
                onClick={goBack}
                aria-label={fromCategories ? "Volver a categorías" : "Volver a Explorar"}
              >
                <span className="flex h-full w-full items-center justify-center rounded-full bg-background p-1 ring-1 ring-border">
                  <img src="/genfeb-logo-new.png" alt="" className="h-full w-full object-contain" />
                </span>
              </Button>
            ) : null}
            <div className="pointer-events-auto absolute inset-0 z-0 overflow-hidden bg-muted/30">
              {/* Wallet/Recargar ahora viven en `GoBottomNav` (barra inferior). */}
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
                suppressMapPick={vehicleModalStep === "searching" || !!matchedDriverInfo}
                onRecenter={
                  matchedDriverInfo
                    ? null
                    : () => {
                        setMapTarget("start");
                        useMyLocationAsStart();
                      }
                }
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
                {/* Panel flotante: sin “caja” de fondo; solo cards internas. */}
                <div
                  className={cn(
                    "pointer-events-none flex min-h-0 flex-1 flex-col px-2",
                    matchedDriverInfo
                      ? // Sin botón flotante (logo): no dejar hueco alto; sólo notch/safe-area
                        "pt-[max(0.35rem,env(safe-area-inset-top))]"
                      : // Botón logo arriba-izquierda: reserva para no pisar inputs/cards
                        "pt-14"
                  )}
                >
                  <div className="pointer-events-auto max-h-[min(60vh,520px)] overflow-visible bg-transparent shadow-none ring-0">
                    <div className="min-h-0 max-h-[min(60vh,520px)] overflow-y-auto overscroll-y-contain p-0 pb-3 [scrollbar-width:thin]">
                      <div className="space-y-2">
                {!matchedDriverInfo ? (
                  <>
                    <div className="rounded-xl border border-border bg-card p-2 shadow-lg">
                      <div className="space-y-2">
                        {/* Origen arriba */}
                        <div className="space-y-1">
                          <Label
                            htmlFor="taxi-start-mobile"
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground"
                          >
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-500" />
                            {goSlug === "pack" ? "Retiro" : "Origen"}
                          </Label>
                          <div className="relative">
                            <Input
                              id="taxi-start-mobile"
                              placeholder="Buscar o tocar mapa"
                              value={startInput}
                              onFocus={() => setMapTarget("start")}
                              onChange={(e) => onStartInput(e.target.value)}
                              autoComplete="off"
                              className={cn(
                                "h-8 rounded-lg border-border bg-muted/90 py-1.5 text-sm text-foreground placeholder:text-muted-foreground dark:bg-muted/70",
                                mapTarget === "start" && "ring-2 ring-green-600/35 dark:ring-green-500/40"
                              )}
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

                        {/* Destino abajo */}
                        <div className="space-y-1">
                          <Label
                            htmlFor="taxi-end-mobile"
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground"
                          >
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-500" />
                            {goSlug === "pack" ? "Entrega" : "Destino"}
                          </Label>
                          <div className="relative">
                            <Input
                              id="taxi-end-mobile"
                              placeholder="Buscar o tocar mapa"
                              value={endInput}
                              onFocus={() => setMapTarget("end")}
                              onChange={(e) => onEndInput(e.target.value)}
                              autoComplete="off"
                              className={cn(
                                "h-8 rounded-lg border-border bg-muted/90 py-1.5 text-sm text-foreground placeholder:text-muted-foreground dark:bg-muted/70",
                                mapTarget === "end" && "ring-2 ring-red-600/35 dark:ring-red-500/40"
                              )}
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
                      </div>
                    </div>
                  </>
                ) : null}

                {geoLoading && (
                  <p className="flex items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Buscando direcciones…
                  </p>
                )}

                {routeMeta && !routeError && (
                  <div className="mt-2 rounded-xl border border-border bg-card px-3 py-2 text-[11px] shadow-md">
                    <p className="font-semibold text-foreground">Ruta estimada</p>
                    <p className="mt-0.5 text-muted-foreground">
                      <span className="font-medium text-foreground">{formatKm(routeMeta.distanceM)}</span>
                      {" · "}
                      <span className="font-medium text-foreground">{formatDuration(routeMeta.durationSec)}</span>
                    </p>
                  </div>
                )}
                {routeError && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{routeError}</p>}

                {matchedDriverInfo && !ridePanelCollapsed && (
                  <div className="rounded-2xl border border-emerald-500/40 bg-card px-3 py-3 text-[11px] shadow-md dark:border-emerald-500/35 dark:bg-emerald-950/40">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-foreground">{isPackGoClient ? "Aceptó tu envío" : "Te aceptó el viaje"}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => setRidePanelCollapsed(true)}
                        aria-label="Ocultar panel del servicio"
                      >
                        <ChevronDown className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                    <p className="mt-0.5 text-muted-foreground">
                      <span className="font-medium text-foreground">{matchedDriverFullName || "Usuario"}</span>
                      {riderTripInProgress
                        ? isPackGoClient
                          ? " · Envío en curso"
                          : " · Viaje en curso"
                        : isPackGoClient
                          ? " · En camino"
                          : " · En camino hacia ti"}
                    </p>
                    {driverToPickupMeta ? (
                      <p className="mt-0.5 text-muted-foreground">
                        {riderTripInProgress ? "Ruta hacia destino" : `Hacia tu ${uiWords.pickupPoint}`}:{" "}
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
                          {(matchedDriverFullName || matchedDriverInfo.driver.name || "U").slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          {typeof matchedDriverInfo.driver.rating === "number" ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/80 px-2 py-0.5">
                              <Star className="h-3 w-3 text-amber-500" aria-hidden />
                              <span className="font-medium text-foreground tabular-nums">
                                {matchedDriverInfo.driver.rating.toFixed(1)}
                              </span>
                            </span>
                          ) : null}
                          {typeof matchedDriverInfo.driver.completedTrips === "number" ? (
                            <span className="rounded-full border border-border/70 bg-muted/80 px-2 py-0.5">
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
                        {matchedDriverPhone ? (
                          <a
                            href={`tel:${matchedDriverPhone}`}
                            className="mt-1 inline-flex w-full max-w-[220px] items-center justify-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary"
                          >
                            <Phone className="h-4 w-4 shrink-0" aria-hidden />
                            {isPackGoClient ? "Llamar al repartidor" : "Llamar al conductor"}
                          </a>
                        ) : null}
                        {matchedDriverPhone ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Tel: <span className="font-medium text-foreground">{matchedDriverPhone}</span>
                          </p>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2 w-full max-w-[220px] border-destructive/40 text-destructive hover:bg-destructive/10"
                          onClick={openCancelServiceDialog}
                        >
                          {isPackGoClient ? "Cancelar envío" : "Cancelar viaje"}
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
                              <span className="font-medium text-muted-foreground">
                                Costo: se acuerda por chat
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
                                    {taxiPaymentMethod === "bank_transfer" ? "Transferencia bancaria" : "Efectivo"}
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

        {(!isGoClient || isMdUp) && (
        <div
          className={cn(
            isGoClient && isMdUp
              ? // Dos columnas: strech vertical para que Leaflet reciba alto real (fullscreen + height 100%).
                "grid min-h-0 w-full flex-1 grid-cols-1 gap-8 md:min-h-[min(640px,calc(100dvh-12rem))] md:[grid-template-columns:minmax(340px,420px)_minmax(0,1fr)] md:gap-x-10 md:gap-y-0 md:items-stretch [grid-template-rows:minmax(0,auto)]"
              : null
          )}
        >
          <div
            className={cn(
              "space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6",
              isGoClient && isMdUp
                ? "min-h-0 w-full md:max-h-[min(880px,calc(100svh-10rem))] md:flex md:flex-col md:overflow-y-auto md:[scrollbar-width:thin]"
                : null
            )}
          >
          {/* Se elimina la franja superior de pasos (1→2). */}

          {isGoClient && isMdUp && (
            <div className="flex w-full gap-2" role="group" aria-label="Elegir qué punto editar en el mapa">
              <Button
                type="button"
                variant={mapTarget === "start" ? "default" : "outline"}
                className={cn(
                  "h-11 flex-1 rounded-xl shadow-sm gap-2",
                  mapTarget !== "start" && "border-green-700/35 bg-muted/40 text-foreground hover:bg-muted/70"
                )}
                onClick={() => setMapTarget("start")}
              >
                <MapPin
                  className={cn("h-4 w-4 shrink-0", mapTarget === "start" ? "text-primary-foreground" : "text-green-600")}
                  aria-hidden
                />
                <span>{goSlug === "pack" ? "1 · Retiro" : "1 · Origen"}</span>
              </Button>
              <Button
                type="button"
                variant={mapTarget === "end" ? "default" : "outline"}
                disabled={!start}
                className={cn(
                  "h-11 flex-1 rounded-xl shadow-sm gap-2 disabled:opacity-60",
                  mapTarget !== "end" && "border-red-700/35 bg-muted/40 text-foreground hover:bg-muted/70"
                )}
                title={!start ? "Primero define el punto de salida" : undefined}
                onClick={() => {
                  if (start) setMapTarget("end");
                }}
              >
                <MapPin
                  className={cn("h-4 w-4 shrink-0", mapTarget === "end" ? "text-primary-foreground" : "text-red-600")}
                  aria-hidden
                />
                <span>{goSlug === "pack" ? "2 · Entrega" : "2 · Destino"}</span>
              </Button>
            </div>
          )}

          <div
            className={cn(
              "rounded-xl border-2 p-3 md:p-4 text-sm transition-colors",
              mapTarget === "start"
                ? "border-green-600/50 bg-green-500/5"
                : "border-red-600/50 bg-red-500/5"
            )}
          >
            {/* Se elimina “Mi ubicación” aquí: se usa el botón típico del mapa (control flotante). */}
            <p className="text-foreground/90">
              {mapTarget === "start" ? (
                <>
                  <span className="font-medium text-foreground">
                    {goSlug === "pack" ? "Retiro:" : "Origen"}{" "}
                  </span>
                  toca el mapa o escribe la dirección.
                </>
              ) : (
                <>
                  <span className="font-medium text-foreground">
                    {goSlug === "pack" ? "Entrega:" : "Destino"}{" "}
                  </span>
                  toca el mapa o escribe la dirección.
                </>
              )}
            </p>
          </div>

          {mapTarget === "end" && start && (
            <p className="text-xs text-muted-foreground rounded-lg border border-border bg-muted/30 px-3 py-2">
              <span className="font-medium text-foreground">{goSlug === "pack" ? "Retiro:" : "Origen:"}</span>{" "}
              {start.label}
            </p>
          )}

          {mapTarget === "start" ? (
            <div className="space-y-2 z-[5]">
              <Label htmlFor="taxi-start" className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-green-600" />
                {goSlug === "pack" ? "Dirección de retiro" : "Dirección de origen"}
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
                {goSlug === "pack" ? "Dirección de entrega" : "Dirección de destino"}
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
          {!(isGoClient && isMdUp) ? (
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
                    suppressMapPick={vehicleModalStep === "searching" || !!matchedDriverInfo}
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
                    El mapa está en <span className="font-medium text-foreground">pantalla completa</span>.
                    {matchedDriverInfo
                      ? " Durante un servicio, el mapa es solo para ver la ruta."
                      : " Toca el mapa para colocar el punto; luego pulsa Reducir para seguir con el formulario."}
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

          {matchedDriverInfo && !ridePanelCollapsed && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/[0.08] px-4 py-3 text-sm shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-foreground">{isPackGoClient ? "Aceptó tu envío" : "Te aceptó el viaje"}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setRidePanelCollapsed(true)}
                  aria-label="Ocultar panel del servicio"
                >
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              <p className="mt-1 text-muted-foreground">
                <span className="font-medium text-foreground">{matchedDriverFullName || "Usuario"}</span>
                {riderTripInProgress
                  ? isPackGoClient
                    ? " · Envío en curso"
                    : " · Viaje en curso"
                  : isPackGoClient
                    ? " · En camino"
                    : " · En camino hacia ti"}
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
                    {(matchedDriverFullName || matchedDriverInfo.driver.name || "U").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium text-foreground">{matchedDriverFullName || "Usuario"}</p>
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
                  {matchedDriverPhone ? (
                    <a
                      href={`tel:${matchedDriverPhone}`}
                      className="mt-2 inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary"
                    >
                      <Phone className="h-4 w-4 shrink-0" aria-hidden />
                      {isPackGoClient ? "Llamar al repartidor" : "Llamar al conductor"}
                    </a>
                  ) : null}
                  {matchedDriverPhone ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Tel: <span className="font-medium text-foreground">{matchedDriverPhone}</span>
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full max-w-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={openCancelServiceDialog}
                  >
                    {isPackGoClient ? "Cancelar envío" : "Cancelar viaje"}
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
                        <span className="font-medium text-muted-foreground">
                          Costo: se acuerda por chat
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
                              {taxiPaymentMethod === "bank_transfer" ? "Transferencia bancaria" : "Efectivo"}
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

          {isGoClient && isMdUp ? (
            <div className="relative flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-muted/10 shadow-sm md:min-h-[min(480px,calc(100dvh-14rem))] md:h-full">
              <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
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
                  suppressMapPick={vehicleModalStep === "searching" || !!matchedDriverInfo}
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
                <p className="text-sm font-semibold text-foreground">
                  {isPackGoClient ? MOBILITY_UI.delivery : MOBILITY_UI.taxiService}
                </p>
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
        vehicleOptions={vehicleOptions}
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
        suggestedUsdByVehicle={suggestedUsdByVehicle}
        suggestedUsd={suggestedUsd}
        onRequestCancelSearch={openCancelServiceDialog}
        isNegotiatedFlow={rideIsNegotiated}
        clientOfferUsd={clientHaggleUsd}
        onChooseStandardPrice={handleChooseStandardPrice}
        onChooseHaggle={handleChooseHaggle}
        haggleUsd={clientHaggleUsd}
        onHaggleBump={handleHaggleBump}
        onHaggleDecide={handleHaggleDecide}
        onBackFromHaggle={handleBackFromHaggle}
        onBackFromPriceMode={handleBackFromPriceMode}
        onBackToHaggleFromPayment={handleBackToHaggleFromPayment}
      />

      <RiderNegotiationOffersModal
        open={negotiationOffersOpen && vehicleModalStep === "searching"}
        rideId={activeRideId}
        offers={negotiationOffers}
        busyDriverId={negotiationOfferBusyId}
        onDismissOffer={(id) => void dismissNegotiationOffer(id)}
        onAcceptOffer={(id) => void acceptNegotiationOffer(id)}
        onCancelSearch={openCancelFromNegotiationOffers}
        cancelSearchLabel={isPackGoClient ? "Cancelar búsqueda de envío" : "Cancelar búsqueda"}
      />

      {/* Wallet/Recargar ahora viven en `GoBottomNav` (barra inferior). */}

      {isGoClient && matchedDriverInfo && ridePanelCollapsed ? (
        <Button
          type="button"
          className={cn(
            "fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] right-3 z-[200] h-12 w-12 rounded-full p-0",
            "bg-primary text-primary-foreground shadow-xl ring-2 ring-primary/35",
            "hover:bg-primary/90 active:scale-[0.97]"
          )}
          onClick={() => setRidePanelCollapsed(false)}
          aria-label="Mostrar panel del servicio"
        >
          <ChevronUp className="h-5 w-5" aria-hidden />
        </Button>
      ) : null}

      <Dialog open={cancelServiceDialogOpen} onOpenChange={handleCancelServiceDialogOpenChange}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              {cancelServiceMode === "search"
                ? "¿Cancelar la búsqueda?"
                : cancelServiceMode === "matched"
                  ? isPackGoClient
                    ? "¿Cancelar este envío?"
                    : "¿Cancelar este viaje?"
                  : isPackGoClient
                    ? "¿Cancelar el envío en curso?"
                    : "¿Cancelar el viaje en curso?"}
            </DialogTitle>
            <DialogDescription>
              {cancelServiceMode === "search"
                ? isPackGoClient
                  ? "Dejarás de buscar repartidor para este envío. Podrás volver a intentarlo cuando quieras."
                  : "Dejarás de buscar conductor para este trayecto. Podrás volver a intentarlo cuando quieras."
                : cancelServiceMode === "matched"
                  ? isPackGoClient
                    ? "El repartidor será notificado y el envío quedará anulado. ¿Seguro que deseas continuar?"
                    : "El conductor será notificado y el viaje quedará anulado. ¿Seguro que deseas continuar?"
                  : isPackGoClient
                    ? "Si ya van en marcha, conviene avisar al repartidor por teléfono o chat. ¿Seguro que deseas cancelar?"
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
            <DialogTitle>¿Cómo se portó el {uiWords.Driver}?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Califica a{" "}
              <span className="font-medium text-foreground">
                {rateTargetRef.current?.targetName ?? `tu ${uiWords.driver}`}
              </span>
              .
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

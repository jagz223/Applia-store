import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { PROVIDER_WALLET_FLOOR_USD } from "@shared/wallet-limits";
import { FEATURE_OFF_PLATFORM_COMMISSION_ENABLED, FEATURE_WALLET_RECHARGE_UI_ENABLED } from "@shared/feature-flags";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquare,
  Phone,
  Radio,
  Settings,
  Star,
  Tags,
  X,
  XCircle,
} from "lucide-react";
import { useGoDriverUi } from "@/contexts/GoDriverUiContext";
import { useAuth } from "@/hooks/use-auth";
import { useCategories, useCurrentProvider, useWallet } from "@/hooks/use-mango-data";
import { useProviderSubscriptionMonthlyUsd } from "@/hooks/use-provider-subscription-monthly-usd";
import { MOBILITY_UI } from "@shared/mobility-ui-labels";
import {
  NEGOTIATION_OFFER_REMOVED_REASON_RIDER_REJECTED,
  NEGOTIATION_OFFER_REMOVED_REASON_WITHDRAWN,
} from "@shared/mobility-negotiation";
import { isCarGoProvider } from "@shared/provider-car-go";
import { providerHasGoBrand } from "@shared/provider-go";
import { DriverCargoMap } from "@/components/driver/DriverCargoMap";
import { SlideToCargoOnline } from "@/components/driver/SlideToCargoOnline";
import { DriverTripHistorySheet } from "@/components/driver/DriverTripHistorySheet";
import {
  clearAllGoReceiving,
  clearDriverActiveRideId,
  clearGoDriverActiveRideId,
  loadDriverActiveRideId,
  loadGoDriverActiveRideId,
  loadGoReceiving,
  loadReceiving,
  loadTripLog,
  appendDriverTripLog,
  saveDriverActiveRideId,
  saveGoDriverActiveRideId,
  saveReceiving,
  saveGoReceiving,
  type CargoDriverTripLog,
} from "@/lib/cargo-driver-storage";
import { Button } from "@/components/ui/button";
import { GoChatProvider, useGoChat } from "@/contexts/GoChatContext";
import { GoDriverUiProvider } from "@/contexts/GoDriverUiContext";
import { GoRideRatingDialog, goSlugToRatingModule } from "@/components/go/GoRideRatingDialog";
import { GoPanicFloatingButton } from "@/components/go/GoPanicFloatingButton";
import { GoChatDrawer } from "@/components/go/GoChatDrawer";
import { CargoIncomingRideDialog, type CargoRideOfferPayload } from "@/components/taxi/CargoIncomingRideDialog";
import { useSocket } from "@/hooks/use-socket";
import { useToast } from "@/hooks/use-toast";
import { startCargoOfferBellLoop } from "@/lib/cargo-offer-bell";
import { cn } from "@/lib/utils";
import { addHiddenConversationId } from "@/lib/hidden-conversations";
import { purgeConversationCache } from "@/hooks/use-chat";
import type { GeoJsonObject } from "geojson";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { GoDriverNegotiationBoardPanel } from "@/components/go/GoDriverNegotiationBoardPanel";
import { goOffsetAboveBottomNav, goViewportClasses, useGoCompactViewport } from "@/lib/go-viewport-layout";
import { estimateDurationSecFromDistanceM, haversineM } from "@shared/maps-route-math";

function lineGeoJson(from: { lat: number; lon: number }, to: { lat: number; lon: number }): GeoJsonObject {
  return {
    type: "Feature",
    properties: { source: "fallback" },
    geometry: {
      type: "LineString",
      coordinates: [
        [from.lon, from.lat],
        [to.lon, to.lat],
      ],
    },
  } as unknown as GeoJsonObject;
}

type MobilityRideHydration = {
  id: string;
  status: string;
  riderUserId: string;
  driverUserId: string | null;
  conversationId: number | null;
  driverSearchingClient?: boolean;
  paymentMethod: string;
  paymentConfirmed: boolean;
  vehicleType: string;
  petEnabled?: boolean;
  estimatedUsd: number;
  suggestedUsd?: number;
  isNegotiated?: boolean;
  distanceM: number;
  durationSec: number;
  start: CargoRideOfferPayload["start"];
  end: CargoRideOfferPayload["end"];
  routeGeometry: GeoJsonObject | null;
  rider: CargoRideOfferPayload["rider"];
};

function mapApiRideToOffer(ride: MobilityRideHydration): CargoRideOfferPayload {
  return {
    rideId: ride.id,
    rider: ride.rider,
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
    isNegotiated: !!ride.isNegotiated,
  };
}

export default function DriverGoGenfeb({ goSlug = "cargo" }: { goSlug?: "cargo" | "pack" } = {}) {
  const queryClient = useQueryClient();
  const { openChat, resetChat, isOpen: chatOpen, closeChat, setMobilityChatReminder } = useGoChat();
  const { socket } = useSocket();
  const rideApiBase = goSlug === "pack" ? "/api/pack/rides" : "/api/mobility/rides";
  const rideSocketPrefix = goSlug === "pack" ? "pack:ride:" : "cargo:ride:";
  const presenceEvent = goSlug === "pack" ? "pack:driver:presence" : "cargo:driver:presence";
  const locationEvent = goSlug === "pack" ? "pack:ride:location" : "cargo:ride:location";
  const { toast } = useToast();
  const goDriverUi = useGoDriverUi();
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: provider, isLoading: providerLoading } = useCurrentProvider();
  const { monthlyUsdLabel } = useProviderSubscriptionMonthlyUsd({ enabled: isAuthenticated });
  const { data: categories = [] } = useCategories();
  const { data: walletData } = useWallet({ enabled: isAuthenticated && FEATURE_WALLET_RECHARGE_UI_ENABLED });
  const [driverWalletOpen, setDriverWalletOpen] = useState(false);
  const [receivingCargo, setReceivingCargo] = useState(false);
  const [receivingPack, setReceivingPack] = useState(false);
  const [trips, setTrips] = useState<CargoDriverTripLog[]>([]);
  const tripsForHistory = useMemo(() => {
    if (FEATURE_WALLET_RECHARGE_UI_ENABLED) return trips;
    return trips.filter((t) => t.payment === "cash" || t.payment === "bank_transfer");
  }, [trips]);
  const hasOnlyHiddenWalletTrips =
    !FEATURE_WALLET_RECHARGE_UI_ENABLED && trips.length > 0 && tripsForHistory.length === 0;
  const [historySheetOpen, setHistorySheetOpen] = useState(false);
  const [geoPos, setGeoPos] = useState<{ lat: number; lon: number } | null>(null);
  const incomingOffer = goDriverUi?.currentOffer?.offer ?? null;
  const incomingModule = goDriverUi?.currentOffer?.module ?? null;
  const incomingOpen = incomingOffer != null;
  const [respondBusy, setRespondBusy] = useState(false);
  const [negotiationBoardOpen, setNegotiationBoardOpen] = useState(false);
  /** Tras enviar oferta de regateo: recordatorio compacto hasta match / retiro / servicio activo. */
  const [driverNegotiationSent, setDriverNegotiationSent] = useState<{
    rideId: string;
    module: "cargo" | "pack";
    amountUsd: number;
  } | null>(null);
  const [activeRideId, setActiveRideId] = useState<string | null>(null);
  const [activeRideOffer, setActiveRideOffer] = useState<CargoRideOfferPayload | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const receiving = goSlug === "pack" ? receivingPack : receivingCargo;
  const activeRideIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeRideIdRef.current = activeRideId;
  }, [activeRideId]);
  const activeRideOfferRef = useRef<CargoRideOfferPayload | null>(null);
  useEffect(() => {
    activeRideOfferRef.current = activeRideOffer;
  }, [activeRideOffer]);

  useEffect(() => {
    if (activeRideId && activeRideOffer) {
      setMobilityChatReminder(
        goSlug === "pack"
          ? "Recordatorio: este chat es con tu cliente y el paquete del envío."
          : "Recordatorio: este chat es con tu pasajero.",
      );
    } else {
      setMobilityChatReminder(null);
    }
  }, [activeRideId, activeRideOffer, goSlug, setMobilityChatReminder]);

  useEffect(() => {
    if (!activeRideOffer) setActiveRidePanelCollapsed(false);
  }, [activeRideOffer]);

  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [rateStars, setRateStars] = useState(5);
  const [rateBusy, setRateBusy] = useState(false);
  const rateTargetRef = useRef<{ rideId: string; targetName: string } | null>(null);
  /** Modal grande solo para ofertas clásicas (precio estándar / cola). El regateo va al tablero (sheet). */
  const classicOfferModalOpen =
    incomingOpen && !!incomingOffer && !incomingOffer.isNegotiated && !rateDialogOpen;
  const [activeRideStarted, setActiveRideStarted] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [cancelServiceOpen, setCancelServiceOpen] = useState(false);
  const [cancelServiceBusy, setCancelServiceBusy] = useState(false);
  const [searchClientConfirmOpen, setSearchClientConfirmOpen] = useState(false);
  const [confirmPaymentOpen, setConfirmPaymentOpen] = useState(false);
  const [searchingClient, setSearchingClient] = useState(false);
  const [serviceRouteGeometry, setServiceRouteGeometry] = useState<GeoJsonObject | null>(null);
  const [serviceEtaSec, setServiceEtaSec] = useState<number | null>(null);
  const [serviceRouteLoading, setServiceRouteLoading] = useState(false);
  const [serviceRouteRenderKey, setServiceRouteRenderKey] = useState(0);
  const [activeRidePanelCollapsed, setActiveRidePanelCollapsed] = useState(false);
  const lastServiceRouteFetchRef = useRef<{ lat: number; lon: number; at: number } | null>(null);
  const geoPosRef = useRef(geoPos);
  geoPosRef.current = geoPos;

  const isGoCompact = useGoCompactViewport();

  const { data: providerVehicle } = useQuery({
    queryKey: ["/api/me/provider-vehicle"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/me/provider-vehicle", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 401) return null;
      if (!res.ok) return null;
      return res.json() as Promise<{ vehicle_type: string; is_pet_friendly?: boolean } | null>;
    },
    enabled: isAuthenticated && !authLoading,
  });

  const isAdmin = (user as { role?: string } | null)?.role === "admin";
  const isCarGoDriver = !!provider && isCarGoProvider(provider, categories);
  const isPackGoDriver = !!provider && providerHasGoBrand(provider as any, "delivery", categories);
  const canSeeDriverView = isAdmin || (goSlug === "pack" ? isPackGoDriver || isCarGoDriver : isCarGoDriver);
  const hasVehicle = !!providerVehicle?.vehicle_type;
  const canReceive = !!provider?.isVerified && (goSlug === "pack" ? isPackGoDriver || isCarGoDriver : isCarGoDriver) && hasVehicle;

  const slideDockRef = useRef<HTMLDivElement>(null);

  /** Restaurar sliders al montar (p. ej. al cambiar entre taxi y delivery). */
  useEffect(() => {
    setReceivingCargo(loadGoReceiving("cargo"));
    setReceivingPack(loadGoReceiving("pack"));
  }, []);

  useEffect(() => {
    // Preferir email para evitar colisiones si el backend cambia el tipo de id.
    const accountKey =
      (user as any)?.email != null ? String((user as any).email) : (user as any)?.id != null ? String((user as any).id) : null;
    setTrips(loadTripLog(accountKey));
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (!goDriverUi) return;
    goDriverUi.registerOpenHistory(() => setHistorySheetOpen(true));
    return () => goDriverUi.registerOpenHistory(null);
  }, [goDriverUi]);

  const canOpenDriverNegotiationBoard = isAdmin || provider?.isVerified === true;

  useEffect(() => {
    if (!goDriverUi) return;
    goDriverUi.registerOpenNegotiationBoard(() => {
      if (!canOpenDriverNegotiationBoard) {
        toast({
          title: "Perfil no verificado",
          description:
            "Verifica tu perfil profesional para ver el tablero de regateo y poder ofertar en taxi y delivery.",
          variant: "destructive",
        });
        return;
      }
      setNegotiationBoardOpen(true);
    });
    return () => goDriverUi.registerOpenNegotiationBoard(null);
  }, [goDriverUi, canOpenDriverNegotiationBoard, toast]);

  useEffect(() => {
    if (negotiationBoardOpen && !canOpenDriverNegotiationBoard) {
      setNegotiationBoardOpen(false);
    }
  }, [negotiationBoardOpen, canOpenDriverNegotiationBoard]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setGeoPos({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onCargoOffer = (p: CargoRideOfferPayload) => {
      // Si ya hay un servicio activo, ignorar ofertas nuevas (evita modal pegado/sonido).
      if (activeRideIdRef.current) return;
      if (p?.isNegotiated) return;
      goDriverUi?.pushOffer("cargo", p);
    };
    const onPackOffer = (p: CargoRideOfferPayload) => {
      if (activeRideIdRef.current) return;
      if (p?.isNegotiated) return;
      goDriverUi?.pushOffer("pack", p);
    };
    const onCargoTaken = (p: { rideId: string }) => {
      if (p?.rideId) goDriverUi?.resolveOfferAndShowNext(p.rideId);
    };
    const onPackTaken = (p: { rideId: string }) => {
      if (p?.rideId) goDriverUi?.resolveOfferAndShowNext(p.rideId);
    };
    const onCargoExpired = (p: { rideId: string }) => {
      if (p?.rideId) goDriverUi?.resolveOfferAndShowNext(p.rideId);
    };
    const onPackExpired = (p: { rideId: string }) => {
      if (p?.rideId) goDriverUi?.resolveOfferAndShowNext(p.rideId);
    };
    const onCargoCancelled = (p: { rideId: string }) => {
      if (p?.rideId) goDriverUi?.resolveOfferAndShowNext(p.rideId);
    };
    const onPackCancelled = (p: { rideId: string }) => {
      if (p?.rideId) goDriverUi?.resolveOfferAndShowNext(p.rideId);
    };

    socket.on("cargo:ride:offer", onCargoOffer);
    socket.on("pack:ride:offer", onPackOffer);
    socket.on("cargo:ride:taken", onCargoTaken);
    socket.on("pack:ride:taken", onPackTaken);
    socket.on("cargo:ride:offer_expired", onCargoExpired);
    socket.on("pack:ride:offer_expired", onPackExpired);
    socket.on("cargo:ride:cancelled", onCargoCancelled);
    socket.on("pack:ride:cancelled", onPackCancelled);
    return () => {
      socket.off("cargo:ride:offer", onCargoOffer);
      socket.off("pack:ride:offer", onPackOffer);
      socket.off("cargo:ride:taken", onCargoTaken);
      socket.off("pack:ride:taken", onPackTaken);
      socket.off("cargo:ride:offer_expired", onCargoExpired);
      socket.off("pack:ride:offer_expired", onPackExpired);
      socket.off("cargo:ride:cancelled", onCargoCancelled);
      socket.off("pack:ride:cancelled", onPackCancelled);
    };
  }, [socket, goDriverUi]);

  useEffect(() => {
    if (!socket || !user?.id) return;

    const hydrateFromAccepted = async (
      p: { rideId: string; conversationId?: number | null },
      serviceModule: "cargo" | "pack"
    ) => {
      if (!p?.rideId) return;
      if (activeRideIdRef.current === p.rideId) return;
      const token = localStorage.getItem("token");
      if (!token) return;
      const base = serviceModule === "pack" ? "/api/pack/rides" : "/api/mobility/rides";
      try {
        const res = await fetch(`${base}/${encodeURIComponent(p.rideId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const ride = (await res.json()) as MobilityRideHydration;
        if (ride.driverUserId !== user.id) return;
        if (ride.status !== "matched" && ride.status !== "in_progress") return;
        setNegotiationBoardOpen(false);
        goDriverUi?.clearOffers?.();
        setDriverNegotiationSent(null);
        setActiveConversationId(p.conversationId ?? ride.conversationId ?? null);
        setActiveRideId(ride.id);
        setActiveRideOffer(mapApiRideToOffer(ride));
        setActiveRideStarted(ride.status === "in_progress");
        setSearchingClient(!!ride.driverSearchingClient);
        setPaymentConfirmed(
          (ride.paymentMethod === "genfeb" && FEATURE_WALLET_RECHARGE_UI_ENABLED) || !!ride.paymentConfirmed
        );
        saveGoDriverActiveRideId(serviceModule === "pack" ? "pack" : "cargo", ride.id);
        lastServiceRouteFetchRef.current = null;
        setReceivingCargo(false);
        setReceivingPack(false);
        clearAllGoReceiving();
      } catch {
        /* ignore */
      }
    };

    const onCargoAccepted = (p: { rideId: string; conversationId?: number | null }) => void hydrateFromAccepted(p, "cargo");
    const onPackAccepted = (p: { rideId: string; conversationId?: number | null }) => void hydrateFromAccepted(p, "pack");
    socket.on("cargo:ride:accepted", onCargoAccepted);
    socket.on("pack:ride:accepted", onPackAccepted);
    return () => {
      socket.off("cargo:ride:accepted", onCargoAccepted);
      socket.off("pack:ride:accepted", onPackAccepted);
    };
  }, [socket, user?.id, goDriverUi]);

  useEffect(() => {
    if (!socket) return;
    /** Un retiro masivo emite un evento por viaje; agrupamos el aviso de retirada. */
    let withdrawnToastTimer: ReturnType<typeof setTimeout> | null = null;
    const flushWithdrawnToast = () => {
      withdrawnToastTimer = null;
      toast({
        title: "Ofertas actualizadas",
        description:
          "Se retiraron tus ofertas en otros regateos porque ya tomaste otro servicio o ya no aplican.",
      });
    };

    const onNegoRemoved = (ev: { rideId: string; reason?: string }) => {
      const cur = goDriverUi?.currentOffer?.offer?.rideId ?? null;
      if (cur && ev?.rideId === cur) {
        goDriverUi?.resolveOfferAndShowNext(ev.rideId);
      }
      setDriverNegotiationSent((s) => (s?.rideId === ev?.rideId ? null : s));

      const rejected = ev.reason === NEGOTIATION_OFFER_REMOVED_REASON_RIDER_REJECTED;
      const withdrawn = ev.reason === NEGOTIATION_OFFER_REMOVED_REASON_WITHDRAWN;

      if (rejected) {
        toast({
          title: "Oferta rechazada",
          description: "Rechazado: podés volver a ofertar en este servicio.",
        });
        return;
      }
      if (withdrawn) {
        if (withdrawnToastTimer) clearTimeout(withdrawnToastTimer);
        withdrawnToastTimer = setTimeout(flushWithdrawnToast, 380);
        return;
      }
      toast({
        title: "Regateo",
        description: "Tu oferta ya no está activa en ese viaje.",
      });
    };
    socket.on("cargo:ride:negotiation:offer_removed", onNegoRemoved);
    socket.on("pack:ride:negotiation:offer_removed", onNegoRemoved);
    return () => {
      if (withdrawnToastTimer) clearTimeout(withdrawnToastTimer);
      socket.off("cargo:ride:negotiation:offer_removed", onNegoRemoved);
      socket.off("pack:ride:negotiation:offer_removed", onNegoRemoved);
    };
  }, [socket, goDriverUi, toast]);

  // Recovery: si el driver estaba en otra vista cuando llegó la oferta, al abrir esta vista consultamos el backend.
  useEffect(() => {
    if (!goDriverUi) return;
    let cancelled = false;
    const run = async () => {
      try {
        const auth = localStorage.getItem("token");
        const headers: Record<string, string> = auth ? { Authorization: `Bearer ${auth}` } : {};
        const [cargoRes, packRes] = await Promise.all([
          fetch("/api/mobility/driver/pending-offer", { headers }),
          fetch("/api/pack/driver/pending-offer", { headers }),
        ]);
        const cargo = cargoRes.ok ? await cargoRes.json().catch(() => null) : null;
        const pack = packRes.ok ? await packRes.json().catch(() => null) : null;
        if (cancelled) return;
        const cargoOffer = cargo?.offer ?? null;
        const packOffer = pack?.offer ?? null;
        if (cargoOffer && !cargoOffer.isNegotiated && !activeRideIdRef.current) {
          goDriverUi.pushOffer("cargo", cargoOffer);
        } else if (packOffer && !packOffer.isNegotiated && !activeRideIdRef.current) {
          goDriverUi.pushOffer("pack", packOffer);
        }
      } catch {
        // silencio: solo es recovery
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [goDriverUi]);

  /** Al activar “recibir pedidos” con una búsqueda de regateo ya en curso, traer oferta pendiente al instante. */
  useEffect(() => {
    if (!goDriverUi) return;
    if (!receivingCargo && !receivingPack) return;
    if (!canReceive || !providerVehicle?.vehicle_type) return;
    if (activeRideIdRef.current) return;
    let cancelled = false;
    const run = async () => {
      try {
        const auth = localStorage.getItem("token");
        const headers: Record<string, string> = auth ? { Authorization: `Bearer ${auth}` } : {};
        const [cargoRes, packRes] = await Promise.all([
          fetch("/api/mobility/driver/pending-offer", { headers }),
          fetch("/api/pack/driver/pending-offer", { headers }),
        ]);
        const cargo = cargoRes.ok ? await cargoRes.json().catch(() => null) : null;
        const pack = packRes.ok ? await packRes.json().catch(() => null) : null;
        if (cancelled || activeRideIdRef.current) return;
        const cargoOffer = cargo?.offer ?? null;
        const packOffer = pack?.offer ?? null;
        if (cargoOffer && !cargoOffer.isNegotiated) goDriverUi.pushOffer("cargo", cargoOffer);
        else if (packOffer && !packOffer.isNegotiated) goDriverUi.pushOffer("pack", packOffer);
      } catch {
        /* ignore */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [goDriverUi, receivingCargo, receivingPack, canReceive, providerVehicle?.vehicle_type]);

  useEffect(() => {
    if (!classicOfferModalOpen) return;
    const loop = startCargoOfferBellLoop();
    return () => loop.stop();
  }, [classicOfferModalOpen]);

  // Si llega una oferta mientras el chat está abierto, cerrar el chat para no bloquear la interacción.
  useEffect(() => {
    if (!classicOfferModalOpen) return;
    if (!chatOpen) return;
    closeChat();
  }, [classicOfferModalOpen, chatOpen, closeChat]);

  // Si llega una oferta del otro módulo, cambiar de pestaña automáticamente.
  useEffect(() => {
    if (!classicOfferModalOpen || !incomingModule) return;
    if (activeRideIdRef.current) return;
    const target = incomingModule === "pack" ? "/go/delivery/driver" : "/go/taxi/driver";
    const cur = goSlug === "pack" ? "/go/delivery/driver" : "/go/taxi/driver";
    if (target !== cur) setLocation(target);
  }, [classicOfferModalOpen, incomingModule, setLocation, goSlug]);

  useEffect(() => {
    if (!socket) return;
    const onStarted = (p: { rideId: string }) => {
      if (!p?.rideId) return;
      if (p.rideId !== activeRideIdRef.current) return;
      setActiveRideStarted(true);
    };
    socket.on(`${rideSocketPrefix}started`, onStarted);
    return () => {
      socket.off(`${rideSocketPrefix}started`, onStarted);
    };
  }, [socket, rideSocketPrefix]);

  useEffect(() => {
    if (!socket) return;
    const onPay = (p: { rideId: string }) => {
      if (!p?.rideId) return;
      if (p.rideId !== activeRideIdRef.current) return;
      setPaymentConfirmed(true);
    };
    const onCompleted = (p: { rideId: string }) => {
      if (!p?.rideId) return;
      if (p.rideId !== activeRideIdRef.current) return;
      const snap = activeRideOfferRef.current;
      if (snap) {
        appendDriverTripLog(
          {
            id: p.rideId,
            endedAt: new Date().toISOString(),
            durationMin: Math.max(1, Math.round((snap.durationSec ?? 0) / 60)),
            amountUsd: snap.estimatedUsd ?? 0,
            payment:
              snap.paymentMethod === "genfeb"
                ? "genfeb"
                : snap.paymentMethod === "bank_transfer"
                  ? "bank_transfer"
                  : "cash",
            goSlug: goSlug === "pack" ? "pack" : "cargo",
          },
          (((user as any)?.email ?? (user as any)?.id ?? null) != null
            ? String(((user as any)?.email ?? (user as any)?.id) as any)
            : null) as any
        );
        setTrips(
          loadTripLog(
            (((user as any)?.email ?? (user as any)?.id ?? null) != null
              ? String(((user as any)?.email ?? (user as any)?.id) as any)
              : null) as any
          )
        );
        rateTargetRef.current = { rideId: p.rideId, targetName: snap.rider?.name ?? "Cliente" };
        setRateStars(5);
        setRateDialogOpen(true);
      } else if (canReceive && providerVehicle?.vehicle_type) {
        if (goSlug === "pack") {
          setReceivingPack(true);
          saveGoReceiving("pack", true);
        } else {
          setReceivingCargo(true);
          saveGoReceiving("cargo", true);
        }
      }
      clearGoDriverActiveRideId(goSlug === "pack" ? "pack" : "cargo");
      setActiveRideId(null);
      setActiveRideOffer(null);
      setActiveRideStarted(false);
      setPaymentConfirmed(false);
      setDriverNegotiationSent(null);
      setServiceRouteGeometry(null);
      setServiceEtaSec(null);
      lastServiceRouteFetchRef.current = null;
      if (activeConversationId != null) addHiddenConversationId(activeConversationId);
      if (activeConversationId != null) purgeConversationCache(queryClient, activeConversationId);
      resetChat();
      setActiveConversationId(null);
    };
    const onCancelled = (p: { rideId: string; cancelledBy?: "rider" | "driver" }) => {
      if (p?.rideId) {
        goDriverUi?.resolveOfferAndShowNext(p.rideId);
        setDriverNegotiationSent((s) => (s?.rideId === p.rideId ? null : s));
      }
      // Si era una oferta (búsqueda) y el usuario cancela, cerrar al instante y avisar.
      if (p.rideId !== activeRideIdRef.current) {
        const offerId = goDriverUi?.currentOffer?.offer?.rideId ?? null;
        const by = p.cancelledBy ?? "rider";
        if (offerId === p.rideId && by === "rider") {
          toast({
            description: "El usuario canceló la búsqueda de vehículo.",
          });
        }
        return;
      }
      clearGoDriverActiveRideId(goSlug === "pack" ? "pack" : "cargo");
      setActiveRideId(null);
      setActiveRideOffer(null);
      setActiveRideStarted(false);
      setPaymentConfirmed(false);
      setDriverNegotiationSent(null);
      setServiceRouteGeometry(null);
      setServiceEtaSec(null);
      lastServiceRouteFetchRef.current = null;
      if (activeConversationId != null) addHiddenConversationId(activeConversationId);
      if (activeConversationId != null) purgeConversationCache(queryClient, activeConversationId);
      resetChat();
      setActiveConversationId(null);
      if ((p.cancelledBy ?? "rider") === "rider") {
        toast({
          title: "El pasajero canceló",
          description: "El viaje quedó anulado. Puedes seguir recibiendo pedidos.",
          variant: "destructive",
        });
      }
    };
    socket.on(`${rideSocketPrefix}payment_confirmed`, onPay);
    socket.on(`${rideSocketPrefix}completed`, onCompleted);
    socket.on(`${rideSocketPrefix}cancelled`, onCancelled);
    return () => {
      socket.off(`${rideSocketPrefix}payment_confirmed`, onPay);
      socket.off(`${rideSocketPrefix}completed`, onCompleted);
      socket.off(`${rideSocketPrefix}cancelled`, onCancelled);
    };
  }, [
    socket,
    toast,
    resetChat,
    activeConversationId,
    queryClient,
    rideSocketPrefix,
    goDriverUi,
    goSlug,
    user?.id,
    canReceive,
    providerVehicle?.vehicle_type,
  ]);

  const submitRideRating = useCallback(async () => {
    const tgt = rateTargetRef.current;
    if (!tgt) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    setRateBusy(true);
    try {
      const res = await fetch(`${rideApiBase}/${encodeURIComponent(tgt.rideId)}/rate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ stars: rateStars, target: "rider" }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || "No se pudo enviar la calificación");
      setRateDialogOpen(false);
      rateTargetRef.current = null;
      if (canReceive && providerVehicle?.vehicle_type) {
        if (goSlug === "pack") {
          setReceivingPack(true);
          saveGoReceiving("pack", true);
        } else {
          setReceivingCargo(true);
          saveGoReceiving("cargo", true);
        }
      }
      toast({ title: "¡Gracias!", description: "Calificación enviada." });
    } catch (e) {
      toast({ title: "No se pudo enviar", description: e instanceof Error ? e.message : "Intenta de nuevo", variant: "destructive" });
    } finally {
      setRateBusy(false);
    }
  }, [rateStars, toast, rideApiBase, canReceive, providerVehicle?.vehicle_type, goSlug]);

  const emitDriverPresenceOffline = useCallback(() => {
    if (!socket) return;
    socket.emit("cargo:driver:presence", { receiving: false, vehicleType: "", isPetFriendly: false, lat: 0, lon: 0 });
    socket.emit("pack:driver:presence", { receiving: false, vehicleType: "", lat: 0, lon: 0 });
  }, [socket]);

  const stopAllReceiving = useCallback(() => {
    setReceivingCargo(false);
    setReceivingPack(false);
    clearAllGoReceiving();
  }, []);

  const resetReceivingAfterSocketLoss = useCallback(() => {
    stopAllReceiving();
    emitDriverPresenceOffline();
  }, [emitDriverPresenceOffline, stopAllReceiving]);

  /** Tras caída del socket (reinicio servidor) el conductor debe deslizar otra vez. */
  useEffect(() => {
    if (!socket) return;
    const onSocketDisconnect = () => {
      resetReceivingAfterSocketLoss();
    };
    socket.on("disconnect", onSocketDisconnect);
    return () => {
      socket.off("disconnect", onSocketDisconnect);
    };
  }, [socket, resetReceivingAfterSocketLoss]);

  useEffect(() => {
    if (!socket) return;
    if (!canReceive || !providerVehicle?.vehicle_type || !geoPos) {
      emitDriverPresenceOffline();
      return;
    }

    const cargoReceiving = receivingCargo;
    const packReceiving = receivingPack;

    const sendCargo = () => {
      socket.emit("cargo:driver:presence", {
        receiving: cargoReceiving,
        vehicleType: cargoReceiving ? providerVehicle.vehicle_type : "",
        isPetFriendly: !!providerVehicle.is_pet_friendly,
        lat: geoPos.lat,
        lon: geoPos.lon,
      });
    };
    const sendPack = () => {
      socket.emit("pack:driver:presence", {
        receiving: packReceiving,
        vehicleType: packReceiving ? providerVehicle.vehicle_type : "",
        lat: geoPos.lat,
        lon: geoPos.lon,
      });
    };

    sendCargo();
    sendPack();
    const t = window.setInterval(() => {
      sendCargo();
      sendPack();
    }, 4000);

    return () => {
      window.clearInterval(t);
      emitDriverPresenceOffline();
    };
  }, [
    socket,
    receivingCargo,
    receivingPack,
    canReceive,
    providerVehicle?.vehicle_type,
    providerVehicle?.is_pet_friendly,
    geoPos,
    emitDriverPresenceOffline,
  ]);

  useEffect(() => {
    if (!socket || !activeRideId || !geoPos) return;
    const send = () => {
      socket.emit(locationEvent, {
        rideId: activeRideId,
        lat: geoPos.lat,
        lon: geoPos.lon,
      });
    };
    send();
    const t = window.setInterval(send, 5000);
    return () => window.clearInterval(t);
  }, [socket, activeRideId, geoPos, locationEvent]);

  const respondToOffer = async (accept: boolean) => {
    if (!incomingOffer) return;
    const snapOffer = incomingOffer;
    const snapModule = incomingModule;
    const token = localStorage.getItem("token");
    if (!token) {
      toast({
        title: "Sesión expirada",
        description: "Vuelve a iniciar sesión para poder aceptar o rechazar servicios.",
        variant: "destructive",
      });
      setLocation("/login");
      return;
    }

    if (snapOffer.isNegotiated && !accept) {
      // UX: cerrar al instante (aunque el backend tarde). Así el driver no queda "bloqueado" y puede ver nuevas ofertas.
      goDriverUi?.resolveOfferAndShowNext(snapOffer.rideId);
      goDriverUi?.clearOffers?.();
      setDriverNegotiationSent((s) => (s?.rideId === snapOffer.rideId ? null : s));
      setRespondBusy(true);
      try {
        const base = snapModule === "pack" ? "/api/pack/rides" : "/api/mobility/rides";
        const res = await fetch(
          `${base}/${encodeURIComponent(snapOffer.rideId)}/negotiation/decline-invite`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        if (!res.ok) throw new Error(data.message || "No se pudo rechazar la invitación");
      } catch (e) {
        toast({
          title: "No se pudo rechazar",
          description: e instanceof Error ? e.message : "Intenta de nuevo.",
          variant: "destructive",
        });
      } finally {
        setRespondBusy(false);
      }
      return;
    }

    // UX: cerrar el modal enseguida en flujo clásico (la respuesta al backend puede tardar).
    goDriverUi?.resolveOfferAndShowNext(snapOffer.rideId);
    if (accept) goDriverUi?.clearOffers?.();
    setRespondBusy(true);
    try {
      const base = snapModule === "pack" ? "/api/pack/rides" : "/api/mobility/rides";
      const res = await fetch(`${base}/${snapOffer.rideId}/respond`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      });
      const data = (await res.json().catch(() => ({}))) as { conversationId?: number; message?: string };
      if (!res.ok) {
        const msg = data.message || "No se pudo responder";
        // Si el driver RECHAZA y el backend falla (tomado/expirado/etc), cerramos igual el modal.
        if (!accept) goDriverUi?.resolveOfferAndShowNext(snapOffer.rideId);
        // Si el driver ACEPTA, solo cerramos si realmente expiró o se reasignó.
        if (
          accept &&
          (msg.toLowerCase().includes("expir") ||
            msg.toLowerCase().includes("reasign") ||
            msg.toLowerCase().includes("ya no") ||
            msg.toLowerCase().includes("no está disponible"))
        ) {
          goDriverUi?.resolveOfferAndShowNext(snapOffer.rideId);
        }
        throw new Error(msg);
      }
      // Al responder, cerrar el modal y limpiar cola para que no siga sonando.
      goDriverUi?.resolveOfferAndShowNext(snapOffer.rideId);
      goDriverUi?.clearOffers?.();
      if (accept) {
        setDriverNegotiationSent(null);
        if (data.conversationId != null) setActiveConversationId(data.conversationId);
        setActiveRideId(snapOffer.rideId);
        setActiveRideOffer(snapOffer);
        setActiveRideStarted(false);
        setSearchingClient(false);
        setPaymentConfirmed(snapOffer.paymentMethod === "genfeb" && FEATURE_WALLET_RECHARGE_UI_ENABLED);
        // Guardar según módulo para reanudar correctamente.
        saveGoDriverActiveRideId(snapModule === "pack" ? "pack" : "cargo", snapOffer.rideId);
        lastServiceRouteFetchRef.current = null;
        stopAllReceiving();
      }
      if (!accept) {
        setActiveConversationId(null);
        setActiveRideId(null);
        setActiveRideOffer(null);
        setActiveRideStarted(false);
        setPaymentConfirmed(false);
      }
    } catch (e) {
      // Si el conductor aceptó y (por carrera/latencia) ya quedó asignado, evitamos el toast rojo.
      if (accept && activeRideIdRef.current && incomingOffer?.rideId && activeRideIdRef.current === incomingOffer.rideId) {
        return;
      }
      const msg = e instanceof Error ? e.message : "Intenta de nuevo.";
      const soft =
        accept &&
        (msg.toLowerCase().includes("ya no") ||
          msg.toLowerCase().includes("no está disponible") ||
          msg.toLowerCase().includes("otro conductor"));
      toast({
        title: soft ? "La oferta ya no estaba disponible" : "No se pudo responder a la oferta",
        description: msg,
        variant: soft ? undefined : "destructive",
      });
    } finally {
      setRespondBusy(false);
    }
  };

  const startRide = async () => {
    if (!activeRideId) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`${rideApiBase}/${activeRideId}/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setActiveRideStarted(true);
    } catch {
      /* toast opcional */
    }
  };

  const startSearchingClient = async () => {
    if (!activeRideId) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`${rideApiBase}/${encodeURIComponent(activeRideId)}/${goSlug === "pack" ? "driver-searching" : "search-client"}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setSearchingClient(true);
    } catch {
      /* toast opcional */
    }
  };

  const confirmPayment = async () => {
    if (!activeRideId) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`${rideApiBase}/${activeRideId}/confirm-payment`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setPaymentConfirmed(true);
      setConfirmPaymentOpen(false);
    } catch {
      /* toast opcional */
    }
  };

  const completeRide = async () => {
    if (!activeRideId) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`${rideApiBase}/${activeRideId}/complete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || "No se pudo completar el viaje");
      clearGoDriverActiveRideId(goSlug === "pack" ? "pack" : "cargo");
      setActiveRideId(null);
      setActiveRideOffer(null);
      setActiveRideStarted(false);
      setPaymentConfirmed(false);
      setDriverNegotiationSent(null);
      setServiceRouteGeometry(null);
      setServiceEtaSec(null);
      lastServiceRouteFetchRef.current = null;
      void queryClient.invalidateQueries({ queryKey: ["/api/wallet/me"] });
    } catch (e) {
      toast({
        title: "No se pudo completar el viaje",
        description: e instanceof Error ? e.message : "Intenta de nuevo.",
        variant: "destructive",
      });
    }
  };

  const confirmCancelDriverService = async () => {
    const rideId = activeRideIdRef.current;
    if (!rideId) {
      setCancelServiceOpen(false);
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) return;
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
      activeRideIdRef.current = null;
      clearGoDriverActiveRideId(goSlug === "pack" ? "pack" : "cargo");
      setActiveRideId(null);
      setActiveRideOffer(null);
      setActiveRideStarted(false);
      setPaymentConfirmed(false);
      setDriverNegotiationSent(null);
      setServiceRouteGeometry(null);
      setServiceEtaSec(null);
      lastServiceRouteFetchRef.current = null;
      toast({ title: "Viaje cancelado", description: "El servicio quedó anulado." });
      setCancelServiceOpen(false);
    } catch {
      toast({ title: "Error de red", variant: "destructive" });
    } finally {
      setCancelServiceBusy(false);
    }
  };

  /** Punto de navegación: recogida antes de iniciar viaje; destino una vez en curso. */
  const serviceNavTarget = useMemo(() => {
    if (!activeRideOffer) return null;
    if (activeRideStarted) return { lat: activeRideOffer.end.lat, lon: activeRideOffer.end.lon };
    return { lat: activeRideOffer.start.lat, lon: activeRideOffer.start.lon };
  }, [activeRideOffer, activeRideStarted]);

  useEffect(() => {
    lastServiceRouteFetchRef.current = null;
  }, [activeRideId, activeRideStarted, serviceNavTarget?.lat, serviceNavTarget?.lon]);

  const fetchServiceRoute = useCallback(async () => {
    const g = geoPosRef.current;
    if (!activeRideId || !g || !serviceNavTarget) return;
    const now = Date.now();
    const last = lastServiceRouteFetchRef.current;
    if (last && haversineM(last, g) < 48 && now - last.at < 11_000) return;

    lastServiceRouteFetchRef.current = { lat: g.lat, lon: g.lon, at: now };
    setServiceRouteLoading(true);
    try {
      // Backend espera from/to en formato lon,lat (Geoapify / GeoJSON).
      const res = await fetch(`/api/maps/route?from=${g.lon},${g.lat}&to=${serviceNavTarget.lon},${serviceNavTarget.lat}`);
      if (!res.ok) throw new Error("route");
      const data = (await res.json()) as { geometry?: GeoJsonObject; durationSec?: number };
      if (data?.geometry) {
        setServiceRouteGeometry(data.geometry);
        setServiceRouteRenderKey((k) => k + 1);
      } else {
        setServiceRouteGeometry(lineGeoJson(g, serviceNavTarget));
        setServiceRouteRenderKey((k) => k + 1);
      }
      if (data?.durationSec != null && Number(data.durationSec) > 0) {
        setServiceEtaSec(Number(data.durationSec));
      } else {
        const approxM = haversineM(g, serviceNavTarget);
        setServiceEtaSec(estimateDurationSecFromDistanceM(approxM));
      }
    } catch {
      setServiceRouteGeometry(lineGeoJson(g, serviceNavTarget));
      const approxM = haversineM(g, serviceNavTarget);
      setServiceEtaSec(estimateDurationSecFromDistanceM(approxM));
      setServiceRouteRenderKey((k) => k + 1);
    } finally {
      setServiceRouteLoading(false);
    }
  }, [activeRideId, serviceNavTarget]);

  useEffect(() => {
    if (!activeRideId || !serviceNavTarget) {
      setServiceRouteGeometry(null);
      setServiceEtaSec(null);
      return;
    }
    if (!geoPos) return;
    void fetchServiceRoute();
    const t = window.setInterval(() => void fetchServiceRoute(), 14_000);
    return () => window.clearInterval(t);
  }, [activeRideId, geoPos?.lat, geoPos?.lon, serviceNavTarget?.lat, serviceNavTarget?.lon, fetchServiceRoute]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setLocation("/");
      return;
    }
    if (providerLoading) return;
    if (!provider && !isAdmin) {
      setLocation("/become-pro");
      return;
    }
    if (!canSeeDriverView) {
      setLocation("/");
    }
  }, [authLoading, isAuthenticated, providerLoading, provider, isAdmin, canSeeDriverView, setLocation]);

  /** Reanudar viaje activo tras cerrar la app (solo matched / in_progress). */
  useEffect(() => {
    if (authLoading || !isAuthenticated || !user?.id) return;
    const stored = loadGoDriverActiveRideId(goSlug === "pack" ? "pack" : "cargo");
    if (!stored) return;
    const token = localStorage.getItem("token");
    if (!token) {
      clearGoDriverActiveRideId(goSlug === "pack" ? "pack" : "cargo");
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
          clearGoDriverActiveRideId(goSlug === "pack" ? "pack" : "cargo");
          return;
        }
        const ride = (await res.json()) as MobilityRideHydration;
        if (ride.driverUserId !== user.id) {
          clearGoDriverActiveRideId(goSlug === "pack" ? "pack" : "cargo");
          return;
        }
        if (ride.status !== "matched" && ride.status !== "in_progress") {
          clearGoDriverActiveRideId(goSlug === "pack" ? "pack" : "cargo");
          return;
        }
        setActiveRideId(ride.id);
        setActiveRideOffer(mapApiRideToOffer(ride));
        setActiveRideStarted(ride.status === "in_progress");
        setSearchingClient(!!ride.driverSearchingClient);
        setPaymentConfirmed(
          (ride.paymentMethod === "genfeb" && FEATURE_WALLET_RECHARGE_UI_ENABLED) || !!ride.paymentConfirmed
        );
        setDriverNegotiationSent(null);
      } catch {
        if (alive) clearGoDriverActiveRideId(goSlug === "pack" ? "pack" : "cargo");
      }
    })();
    return () => {
      alive = false;
    };
  }, [authLoading, isAuthenticated, user?.id, rideApiBase]);

  /** Si hay servicio activo en el otro módulo, no permitir entrar aquí. */
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    const cargoActive = loadGoDriverActiveRideId("cargo");
    const packActive = loadGoDriverActiveRideId("pack");
    const activeModule = cargoActive ? "cargo" : packActive ? "pack" : null;
    if (!activeModule) return;
    if (goSlug !== activeModule) {
      setLocation(activeModule === "pack" ? "/go/delivery/driver" : "/go/taxi/driver");
    }
  }, [authLoading, isAuthenticated, goSlug, setLocation]);

  // Si no está verificado/vehículo, nunca permitir quedar en "recibiendo".
  useEffect(() => {
    if (canReceive) return;
    if (receiving) {
      if (goSlug === "pack") {
        setReceivingPack(false);
        saveGoReceiving("pack", false);
      } else {
        setReceivingCargo(false);
        saveGoReceiving("cargo", false);
      }
    }
  }, [canReceive, receiving, goSlug]);

  if (authLoading || !isAuthenticated || (providerLoading && !isAdmin) || (!provider && !isAdmin)) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">Cargando vista de conductor…</p>
      </div>
    );
  }

  if (!canSeeDriverView) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground text-center">Redirigiendo…</p>
      </div>
    );
  }

  const walletBalance = typeof walletData?.wallet === "number" ? walletData.wallet : 0;
  const isDriverDebtCapped = !!(walletData as { isProviderDebtCapped?: boolean })?.isProviderDebtCapped;
  const driverFloor =
    typeof (walletData as { providerWalletFloorUsd?: number })?.providerWalletFloorUsd === "number"
      ? (walletData as { providerWalletFloorUsd: number }).providerWalletFloorUsd
      : PROVIDER_WALLET_FLOOR_USD;
  const formatUsdLocal = (n: number) =>
    new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

  const driverNegotiationSentForUi = (() => {
    const s = driverNegotiationSent;
    if (!s || incomingOpen || activeRideOffer) return null;
    if (s.module !== (goSlug === "pack" ? "pack" : "cargo")) return null;
    return s;
  })();

  const driverNegotiationBubble = driverNegotiationSentForUi ? (
    <div
      className="rounded-lg border border-amber-500/45 bg-amber-500/10 px-2 py-1.5 shadow-md ring-1 ring-amber-500/20 backdrop-blur-md max-md:max-w-[min(100%,20rem)] dark:bg-amber-500/15 dark:ring-amber-400/25 sm:rounded-xl sm:px-3 sm:py-2"
      role="status"
    >
      <div className="flex items-start gap-1.5 sm:gap-2">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/25 text-amber-900 dark:text-amber-100 sm:h-8 sm:w-8">
          <Tags className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold leading-tight text-amber-950 dark:text-amber-50 sm:text-xs">
            Regateo · esperando al cliente
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-amber-950/85 dark:text-amber-50/90 sm:text-[11px]">
            <span className="font-mono font-medium tabular-nums">{formatUsdLocal(driverNegotiationSentForUi.amountUsd)}</span>
            <span className="max-md:hidden"> · Te avisamos si te elige o retira la oferta.</span>
            <span className="md:hidden"> · Te avisamos.</span>
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 touch-manipulation text-amber-900 hover:bg-amber-500/20 dark:text-amber-100 sm:h-8 sm:w-8"
          aria-label="Ocultar recordatorio"
          onClick={() => setDriverNegotiationSent(null)}
        >
          <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </Button>
      </div>
    </div>
  ) : null;

  /** Móvil: solo deslizante; historial, chat y ajustes van en la barra inferior Go. */
  const controlsBlockMobile = (
    <div className="space-y-1.5">
      {goSlug === "cargo" && isCarGoDriver ? (
        <SlideToCargoOnline
          receiving={receivingCargo}
          onReceivingChange={(n) => {
            setReceivingCargo(n);
            saveGoReceiving("cargo", n);
          }}
          disabled={!canReceive}
          goSlug="cargo"
          className="border-border/70 bg-background/90 shadow-lg ring-1 ring-black/10 backdrop-blur-md dark:ring-white/10"
        />
      ) : null}
      {goSlug === "pack" && (isPackGoDriver || isCarGoDriver) ? (
        <SlideToCargoOnline
          receiving={receivingPack}
          onReceivingChange={(n) => {
            setReceivingPack(n);
            saveGoReceiving("pack", n);
          }}
          disabled={!canReceive}
          goSlug="pack"
          className="border-border/70 bg-background/90 shadow-lg ring-1 ring-black/10 backdrop-blur-md dark:ring-white/10"
        />
      ) : null}
    </div>
  );

  /** En escritorio el panel sigue visible aunque se haya ocultado en móvil (evita vista vacía). */
  const showRidePanel =
    !!activeRideOffer && (!activeRidePanelCollapsed || !isGoCompact);

  const activeServicePanel = showRidePanel ? (
    <div className="rounded-2xl border border-border/70 bg-background/92 px-3 py-3 text-[11px] shadow-lg ring-1 ring-black/5 backdrop-blur-md dark:ring-white/10">
      {(() => {
        const r = activeRideOffer.rider as unknown as { name?: string; lastName?: string; last_name?: string };
        const riderFullName = [r?.name ?? "Cliente", r?.lastName ?? r?.last_name ?? ""].filter(Boolean).join(" ").trim();
        return (
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{activeRideStarted ? "Viaje en curso" : "En servicio"}</p>
          {serviceEtaSec != null ? (
            <p className="mt-0.5 text-muted-foreground">
              Llegas en <span className="font-medium text-foreground tabular-nums">{Math.max(1, Math.round(serviceEtaSec / 60))} min</span>
            </p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
            {typeof activeRideOffer.rider?.rating === "number" ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5">
                <Star className="h-3 w-3 text-amber-500" aria-hidden />
                <span className="font-medium text-foreground tabular-nums">{activeRideOffer.rider.rating.toFixed(1)}</span>
              </span>
            ) : null}
            {typeof activeRideOffer.rider?.completedTrips === "number" ? (
              <span className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5">
                <span className="font-medium text-foreground tabular-nums">{activeRideOffer.rider.completedTrips}</span> viajes
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex items-center gap-2">
            {activeRideOffer.rider.profileImageUrl ? (
              <img
                src={activeRideOffer.rider.profileImageUrl}
                alt=""
                className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground">
                {String(riderFullName || activeRideOffer.rider.name || "C").slice(0, 1).toUpperCase()}
              </div>
            )}
            <p className="min-w-0 truncate font-medium text-foreground">{riderFullName || "Cliente"}</p>
            {activeRideOffer.isNegotiated ? (
              <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:text-amber-100">
                <Tags className="h-3 w-3 shrink-0" aria-hidden />
                Regateo
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-mr-1 h-8 w-8"
            onClick={() => setActiveRidePanelCollapsed(true)}
            aria-label="Ocultar panel del servicio"
          >
            <ChevronDown className="h-4 w-4" aria-hidden />
          </Button>
          {!activeRideStarted ? (
            !searchingClient ? (
              <Button
                type="button"
                size="sm"
                className="h-9 rounded-full px-3"
                onClick={() => setSearchClientConfirmOpen(true)}
              >
                Iniciar búsqueda
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="h-9 rounded-full px-3"
                onClick={() => setStartConfirmOpen(true)}
              >
                Iniciar viaje
              </Button>
            )
          ) : null}
          {activeRideStarted &&
          !(activeRideOffer.paymentMethod === "genfeb" && FEATURE_WALLET_RECHARGE_UI_ENABLED) ? (
            paymentConfirmed ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-600/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-200">
                <BadgeCheck className="h-4 w-4" aria-hidden />
                Pago confirmado
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-9 rounded-full px-3"
                onClick={() => setConfirmPaymentOpen(true)}
                aria-label="Confirmar que recibiste el pago"
              >
                Recibí el pago
              </Button>
            )
          ) : null}
          {activeRideStarted &&
          ((activeRideOffer.paymentMethod === "genfeb" && FEATURE_WALLET_RECHARGE_UI_ENABLED) || paymentConfirmed) ? (
            <Button type="button" size="sm" className="h-9 rounded-full px-3 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void completeRide()}>
              Terminar viaje
            </Button>
          ) : null}
        </div>
      </div>
        );
      })()}
      {activeRideOffer.rider?.phone ? (
        <div className="mt-2">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`tel:${activeRideOffer.rider.phone}`}
              className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-3 py-1 font-medium text-primary"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
              Llamar
            </a>
            <span className="rounded-full border border-border/70 bg-muted/40 px-3 py-1 font-medium text-foreground tabular-nums select-text">
              {activeRideOffer.rider.phone}
            </span>
          </div>
        </div>
      ) : null}
      {activeRideStarted && activeRideId ? (
        <div className="mt-2">
          <GoPanicFloatingButton
            variant="embedded"
            rideId={activeRideId}
            goModule={goSlug === "pack" ? "delivery" : "taxi"}
            visible
            perspective="driver"
            serviceLabel={goSlug === "pack" ? "envío" : "viaje"}
            onOfferCancelAfterSuccess={() => setCancelServiceOpen(true)}
          />
        </div>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 w-full border-destructive/40 text-destructive hover:bg-destructive/10"
        onClick={() => setCancelServiceOpen(true)}
      >
        Cancelar viaje
      </Button>
    </div>
  ) : null;

  const controlsBlockDesktopSlides = (
    <div className="space-y-4">
      {goSlug === "cargo" ? (
        <SlideToCargoOnline
          receiving={receivingCargo}
          onReceivingChange={(n) => {
            setReceivingCargo(n);
            saveGoReceiving("cargo", n);
          }}
          disabled={!canReceive}
          goSlug="cargo"
          className="border-border/60 bg-background/95 shadow-md ring-1 ring-black/[0.06] dark:bg-card/95 dark:ring-white/10"
        />
      ) : (
        <SlideToCargoOnline
          receiving={receivingPack}
          onReceivingChange={(n) => {
            setReceivingPack(n);
            saveGoReceiving("pack", n);
          }}
          disabled={!canReceive}
          goSlug="pack"
          className="border-border/60 bg-background/95 shadow-md ring-1 ring-black/[0.06] dark:bg-card/95 dark:ring-white/10"
        />
      )}
      {!receiving || !canReceive ? (
        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground lg:text-left lg:text-xs">
          La brújula centra el mapa en tu posición.
        </p>
      ) : null}
    </div>
  );

  const headerBlock = (
    <header className="mb-3 shrink-0 space-y-2">
      {driverNegotiationBubble}
      {receiving && canReceive ? (
        <div className="rounded-2xl border border-emerald-500/45 bg-gradient-to-br from-emerald-600/15 via-background to-background p-4 shadow-sm dark:from-emerald-500/10">
          <div className="flex gap-3">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600/20 ring-2 ring-emerald-500/45">
              <Radio className="h-5 w-5 text-emerald-800 dark:text-emerald-100" aria-hidden />
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/25 [animation-duration:2.2s]" aria-hidden />
            </span>
            <div className="min-w-0 space-y-2">
              <h1 className="font-display text-xl font-bold tracking-tight text-emerald-950 dark:text-emerald-50 sm:text-2xl">
                {goSlug === "pack"
                  ? `Disponible para envíos de ${MOBILITY_UI.delivery}`
                  : `Disponible para ${MOBILITY_UI.taxiService.toLowerCase()}`}
              </h1>
              <p className="text-sm leading-relaxed text-emerald-950/90 dark:text-emerald-50/90">
                {goSlug === "pack"
                  ? "No recibirás cada envío al instante: cuando el sistema te asigne uno, lo verás en el mapa y aquí. Mantén el GPS activo."
                  : "No recibirás cada pedido al instante: cuando el sistema te asigne uno, lo verás en el mapa y aquí. Mantén el GPS activo."}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {goSlug === "pack" ? MOBILITY_UI.delivery : MOBILITY_UI.taxiService}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {goSlug === "pack"
              ? `Mapa en vivo y conexión para recibir solicitudes de ${MOBILITY_UI.delivery.toLowerCase()}. Desliza el control para activar o detener la recepción de envíos.`
              : `Mapa en vivo y conexión para recibir solicitudes de ${MOBILITY_UI.taxiService.toLowerCase()}. Desliza el control para activar o detener la recepción de viajes.`}
          </p>
        </>
      )}
      {!canReceive && (
        <p className="mt-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {isAdmin
            ? "Modo admin: puedes ver la vista de driver, pero necesitas un vehículo registrado y verificación para recibir viajes."
            : !provider?.isVerified
              ? `Aún no estás verificado (documentos + ${monthlyUsdLabel}). Completa la verificación para poder recibir viajes.`
              : !hasVehicle
                ? "Te falta registrar tu vehículo. Regístralo para poder recibir viajes."
                : "Completa los requisitos para poder recibir viajes."}
        </p>
      )}
    </header>
  );

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-gradient-to-b from-muted/25 to-background pb-6",
        "max-lg:h-full max-lg:min-h-0 max-lg:overflow-hidden max-lg:pb-0"
      )}
    >
      {/* Móvil: mapa llena el área de main (entre cabecera shell y barra inferior), sin scroll ni “doble capa”. */}
      {isGoCompact && (
        <div
          className={cn(
            goViewportClasses.mapStage,
            "transition-[box-shadow] duration-300 lg:hidden",
            receiving && canReceive && "shadow-[inset_0_0_0_2px_rgba(16,185,129,0.35)]"
          )}
        >
          <div className="pointer-events-auto absolute inset-0 z-0 overflow-hidden bg-muted/30">
            <DriverCargoMap
              fullscreen
              showRecenter
              vehicleType={providerVehicle?.vehicle_type}
              receiving={receiving}
              searchingClient={searchingClient}
              start={null}
              end={serviceNavTarget}
              routeGeometry={serviceRouteGeometry}
              routeRenderKey={serviceRouteRenderKey}
            />
          </div>
          <div className="relative z-30 flex shrink-0 flex-col pointer-events-none">
            <div
              className={cn(
                "pointer-events-auto space-y-1.5 pt-2 pr-3",
                goViewportClasses.shellFabOverlayInsetLeft,
              )}
            >
              {driverNegotiationBubble}
              {receiving && canReceive ? (
                <div className="rounded-lg border border-emerald-500/45 bg-background/88 p-1.5 shadow-lg ring-1 ring-black/5 backdrop-blur-md dark:bg-emerald-500/10 dark:ring-white/10 sm:rounded-xl sm:p-2">
                  <div className="flex items-start gap-1.5 sm:gap-2">
                    <span className="relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600/20 ring-1 ring-emerald-500/40 dark:bg-emerald-400/15 sm:h-7 sm:w-7">
                      <Radio className="h-3 w-3 text-emerald-800 dark:text-emerald-100 sm:h-3.5 sm:w-3.5" aria-hidden />
                      <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/20 [animation-duration:2.5s]" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5 sm:space-y-1">
                      <p className="font-display text-xs font-bold leading-tight text-emerald-950 dark:text-emerald-50 sm:text-sm">
                        {goSlug === "pack" ? `Disponible · ${MOBILITY_UI.delivery}` : `Disponible · ${MOBILITY_UI.taxiService}`}
                      </p>
                      <p className="text-[9px] leading-snug text-emerald-950/80 dark:text-emerald-50/85 sm:text-[10px]">
                        <span className="sm:hidden">
                          {goSlug === "pack"
                            ? "Envíos no instantáneos · GPS · salir: desliza abajo."
                            : "Pedidos no instantáneos · GPS · salir: desliza abajo."}
                        </span>
                        <span className="hidden sm:inline">
                          {goSlug === "pack"
                            ? "Los envíos no son instantáneos. GPS encendido. Para salir de línea, desliza abajo."
                            : "Los pedidos no son instantáneos. GPS encendido. Para salir de línea, desliza abajo."}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
              {!canReceive && (
                <p className="rounded-xl border border-border/80 bg-background/92 px-3 py-2 text-[11px] text-muted-foreground shadow-lg ring-1 ring-black/5 backdrop-blur-md dark:ring-white/10">
                  {isAdmin
                    ? "Modo admin: sin vehículo/verificación no puedes recibir viajes."
                    : !provider?.isVerified
                      ? "Verifica tu cuenta para recibir viajes."
                      : !hasVehicle
                        ? "Registra tu vehículo para recibir viajes."
                        : "Completa los requisitos para recibir viajes."}
                </p>
              )}
            </div>
          </div>
          <div className={goViewportClasses.mapControlsDock}>
            <div ref={slideDockRef} className="pointer-events-auto">
              {activeRideOffer ? activeServicePanel : controlsBlockMobile}
            </div>
          </div>
          <DriverTripHistorySheet
            trips={tripsForHistory}
            open={historySheetOpen}
            onOpenChange={setHistorySheetOpen}
            emptyHint={
              hasOnlyHiddenWalletTrips
                ? "Solo se listan efectivo y transferencias. Viajes con otros medios no se muestran mientras la cartera no está activa."
                : undefined
            }
          />
          {activeRideOffer && activeRidePanelCollapsed ? (
            <Button
              type="button"
              variant="ghost"
              className={cn(
                /* Encima de la barra inferior (SOS queda a la izquierda) */
                "fixed right-3 z-[200] flex h-12 min-h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-white/95 p-0 shadow-none md:bottom-[calc(5.125rem)]",
                "bg-emerald-600 text-white shadow-[0_6px_20px_-2px_rgba(5,150,105,0.55),0_2px_8px_rgba(15,118,110,0.35)]",
                "hover:bg-emerald-700 hover:text-white hover:shadow-lg",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
                "[&_svg]:pointer-events-none [&_svg]:!h-6 [&_svg]:!w-6 [&_svg]:shrink-0",
              )}
              style={{ bottom: goOffsetAboveBottomNav("1.5rem") }}
              onClick={() => setActiveRidePanelCollapsed(false)}
              aria-label="Mostrar panel del servicio"
            >
              <ChevronUp className="h-6 w-6 shrink-0" strokeWidth={2.5} aria-hidden />
            </Button>
          ) : null}
        </div>
      )}

      {/* Escritorio / tablet: mapa ancho + columna de controles (sin saldo fijo inferior). */}
      <div
        className="container mx-auto hidden w-full max-w-full flex-1 flex-col gap-6 px-4 pb-10 pt-4 md:flex md:max-w-5xl md:gap-7 lg:max-w-6xl lg:gap-10 lg:px-6 xl:max-w-[88rem]"
      >
        {headerBlock}

        <div className="flex min-h-0 w-full flex-1 flex-col gap-5 lg:flex-row lg:items-stretch lg:gap-10">
          <div className="relative flex min-h-[min(52vh,520px)] w-full min-w-0 flex-[1.4] flex-col overflow-hidden rounded-2xl border border-border/50 bg-muted/20 shadow-inner ring-1 ring-black/[0.04] dark:bg-muted/10 dark:ring-white/10 lg:min-h-[min(560px,calc(100vh-12rem))]">
            <DriverCargoMap
              fullscreen
              showRecenter
              vehicleType={providerVehicle?.vehicle_type}
              receiving={receiving}
              searchingClient={searchingClient}
              start={null}
              end={activeRideOffer ? serviceNavTarget : null}
              routeGeometry={activeRideOffer ? serviceRouteGeometry : null}
              routeRenderKey={serviceRouteRenderKey}
            />
          </div>

          <aside className="flex w-full min-w-0 shrink-0 flex-col gap-4 lg:max-w-[22rem] lg:flex-[0_1_340px] lg:sticky lg:top-20 xl:max-w-sm">
            {activeRideOffer ? activeServicePanel : null}
            {controlsBlockDesktopSlides}
            {FEATURE_WALLET_RECHARGE_UI_ENABLED ? (
              <button
                type="button"
                className="-mt-1 w-full rounded-lg px-1 py-1.5 text-left text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground lg:text-xs"
                onClick={() => setDriverWalletOpen(true)}
              >
                Saldo GenFeb · ver detalle de deuda / recarga
              </button>
            ) : null}
          </aside>
        </div>
      </div>

      <Dialog open={FEATURE_WALLET_RECHARGE_UI_ENABLED && driverWalletOpen} onOpenChange={setDriverWalletOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Saldo GenFeb · Conductor</DialogTitle>
            <DialogDescription>
              {FEATURE_OFF_PLATFORM_COMMISSION_ENABLED ? (
                <>
                  Con pagos en efectivo o transferencia, GenFeb descuenta su comisión de tu cartera. Puedes quedar con
                  saldo negativo hasta un límite; al alcanzarlo, solo se te ofrecerán viajes con pago en Saldo GenFeb
                  hasta regularizar.
                </>
              ) : (
                <>
                  Consulta tu saldo en cartera, el piso de deuda y opciones de recarga cuando la cartera esté habilitada
                  en la app.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Saldo actual</span>
              <span
                className={cn("font-semibold tabular-nums", walletBalance < 0 && "text-amber-600 dark:text-amber-500")}
              >
                {formatUsdLocal(walletBalance)}
              </span>
            </div>
            <div className="flex justify-between gap-2 text-muted-foreground">
              <span>Piso de deuda</span>
              <span className="tabular-nums">{formatUsdLocal(driverFloor)}</span>
            </div>
            {isDriverDebtCapped ? (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-900 dark:text-amber-100 text-xs">
                Estás en el límite: no se te ofrecerán viajes en efectivo/transfer hasta recargar. Sigue aceptando viajes
                con Saldo GenFeb para descontar la deuda.
              </p>
            ) : walletBalance < 0 ? (
              <p className="text-xs text-muted-foreground">
                Recarga o gana con viajes en Saldo GenFeb; el neto baja la deuda.
              </p>
            ) : null}
            <Button asChild variant="outline" className="w-full">
              <Link href="/recharge" onClick={() => setDriverWalletOpen(false)}>
                Ir a recargar saldo
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CargoIncomingRideDialog
        open={classicOfferModalOpen}
        offer={incomingOffer}
        module={incomingModule ?? undefined}
        busy={respondBusy}
        driverPos={geoPos}
        onAccept={() => void respondToOffer(true)}
        onDecline={() => void respondToOffer(false)}
      />

      <Sheet open={negotiationBoardOpen} onOpenChange={setNegotiationBoardOpen}>
        <SheetContent
          side="bottom"
          className="flex max-h-[min(96dvh,900px)] min-h-[min(70dvh,560px)] flex-col gap-0 overflow-hidden rounded-t-2xl p-0 sm:mx-auto sm:max-w-[min(96vw,1180px)]"
        >
          <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 text-left">
            <SheetTitle className="font-display text-lg">Regateo · {goSlug === "pack" ? MOBILITY_UI.delivery : MOBILITY_UI.taxiService}</SheetTitle>
            <SheetDescription>
              Solicitudes con monto a negociar. Se actualizan solas cada 5 segundos; también puedes pulsar actualizar.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-hidden px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:px-4">
            <GoDriverNegotiationBoardPanel
              active={negotiationBoardOpen}
              providerVehicleType={providerVehicle?.vehicle_type}
              providerIsPetFriendly={!!providerVehicle?.is_pet_friendly}
              canSubmitNegotiationOffers={isAdmin || provider?.isVerified === true}
              onOfferSubmitted={(rideId, amountUsd, module) => {
                setDriverNegotiationSent({ rideId, module, amountUsd });
                stopAllReceiving();
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={confirmPaymentOpen} onOpenChange={setConfirmPaymentOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>¿Confirmas que recibiste el pago?</DialogTitle>
            <DialogDescription>
              Solo marca esta opción cuando el cliente ya te haya entregado el dinero o la transferencia haya acreditado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmPaymentOpen(false)}>
              No, volver
            </Button>
            <Button
              type="button"
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => {
                void confirmPayment();
              }}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Sí, recibí el pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={startConfirmOpen} onOpenChange={setStartConfirmOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>¿Ya recogiste al usuario?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Cuando confirmes, el viaje iniciará oficialmente y se actualizará para ambos.</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => setStartConfirmOpen(false)}
            >
              <XCircle className="h-4 w-4" aria-hidden />
              No todavía
            </Button>
            <Button
              type="button"
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => {
                setStartConfirmOpen(false);
                void startRide();
              }}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={searchClientConfirmOpen} onOpenChange={setSearchClientConfirmOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>¿Iniciar búsqueda del cliente?</DialogTitle>
            <DialogDescription>
              Al confirmar, comenzaremos a coordinar la recogida. Luego podrás iniciar el viaje cuando ya estés con él.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setSearchClientConfirmOpen(false)}>
              No, volver
            </Button>
            <Button
              type="button"
              className="gap-2 bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                setSearchClientConfirmOpen(false);
                void startSearchingClient();
              }}
            >
              Sí, iniciar búsqueda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cancelServiceOpen}
        onOpenChange={(open) => {
          setCancelServiceOpen(open);
          if (open) setCancelServiceBusy(false);
        }}
      >
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              {activeRideStarted ? "¿Cancelar el viaje en curso?" : "¿Cancelar este viaje?"}
            </DialogTitle>
            <DialogDescription>
              {activeRideStarted
                ? "Si ya van en ruta, avisa al pasajero por teléfono o chat. El viaje quedará anulado para ambos."
                : "El pasajero verá que cancelaste antes de iniciar. ¿Seguro que deseas continuar?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setCancelServiceOpen(false)} disabled={cancelServiceBusy}>
              No, volver
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={cancelServiceBusy}
              onClick={() => void confirmCancelDriverService()}
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

      <GoRideRatingDialog
        open={rateDialogOpen}
        module={goSlugToRatingModule(goSlug)}
        perspective="driver"
        targetName={rateTargetRef.current?.targetName ?? "Tu cliente"}
        stars={rateStars}
        onStarsChange={setRateStars}
        onSubmit={() => void submitRideRating()}
        isSubmitting={rateBusy}
      />

    </div>
  );
}

/** Ruta legacy `/driver/go-genfeb` (sin GoShellLayout): mismo panel de chat que en `/go/cargo/driver`. */
export function DriverGoGenfebWithGoChat() {
  return (
    <GoChatProvider>
      <GoDriverUiProvider>
        <DriverGoGenfeb />
        <GoChatDrawer />
      </GoDriverUiProvider>
    </GoChatProvider>
  );
}

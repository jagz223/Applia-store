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
  History,
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
import { useGoDriverUi, type GoDriverQueuedOffer } from "@/contexts/GoDriverUiContext";
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
import { SlideToGoReceiveMode } from "@/components/driver/SlideToGoReceiveMode";
import { DriverTripHistorySheet } from "@/components/driver/DriverTripHistorySheet";
import {
  clearDriverActiveRideId,
  clearGoDriverActiveRideId,
  loadDriverActiveRideId,
  loadGoDriverActiveRideId,
  loadReceiving,
  saveDriverActiveRideId,
  saveGoDriverActiveRideId,
  saveReceiving,
  type CargoDriverTripLog,
  type GoDriverReceiveMode,
} from "@/lib/cargo-driver-storage";
import {
  isReceivingDeliveryMode,
  isReceivingTaxiMode,
  receiveModeToGoSlug,
} from "@/lib/go-driver-receive-mode";
import { extractUserPublicPhone } from "@/lib/user-public-phone";
import { fetchGoRideConversationId } from "@/lib/go-active-ride-chat";
import { useGoDriverSession } from "@/contexts/GoDriverSessionContext";
import { Button } from "@/components/ui/button";
import { GoChatProvider, useGoChat } from "@/contexts/GoChatContext";
import { GoDriverUiProvider } from "@/contexts/GoDriverUiContext";
import { GoDriverSessionProvider } from "@/contexts/GoDriverSessionContext";
import { GoRideRatingDialog, goSlugToRatingModule } from "@/components/go/GoRideRatingDialog";
import { GoPanicFloatingButton } from "@/components/go/GoPanicFloatingButton";
import { GoUserRideStatsBadges } from "@/components/go/GoUserRideStatsBadges";
import { fetchMobilityRideHistoryForUser } from "@/lib/mobility-ride-history-api";
import { historyToDriverTripLog } from "@/lib/mobility-ride-history-mappers";
import { notifyMobilityRideHistoryChanged } from "@/lib/mobility-ride-history-events";
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
import {
  buildStoredDrivingRoute,
  geoJsonLineFromCoords,
  isRoadRouteApiPayload,
  trimRouteAtDriver,
  type StoredDrivingRoute,
} from "@/lib/driving-route-geometry";
import {
  GO_DRIVER_SUBSCRIPTION_INACTIVE_DRIVER_BANNER,
  GO_DRIVER_SUBSCRIPTION_INACTIVE_NEGOTIATION_HINT,
  GO_DRIVER_SUBSCRIPTION_INACTIVE_SLIDE_HINT,
  isGoDriverSubscriptionActive,
} from "@shared/go-driver-subscription";

const DRIVER_ROUTE_DEVIATION_M = 80;
const DRIVER_ROUTE_DEVIATION_REFETCH_MS = 25_000;

function serviceNavTargetKey(target: { lat: number; lon: number }): string {
  return `${target.lat.toFixed(5)},${target.lon.toFixed(5)}`;
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

export default function DriverGoGenfeb() {
  const queryClient = useQueryClient();
  const { geoPos, geoPosRef, receiveMode, setReceiveMode, stopReceiving } = useGoDriverSession();
  const [activeServiceModule, setActiveServiceModule] = useState<"cargo" | "pack" | null>(() => {
    const cargo = loadGoDriverActiveRideId("cargo");
    const pack = loadGoDriverActiveRideId("pack");
    return cargo ? "cargo" : pack ? "pack" : null;
  });
  const serviceModule: "cargo" | "pack" = activeServiceModule ?? receiveModeToGoSlug(receiveMode);
  const goSlug = serviceModule;
  const receiveModeRef = useRef(receiveMode);
  receiveModeRef.current = receiveMode;
  const activeServiceModuleRef = useRef(activeServiceModule);
  activeServiceModuleRef.current = activeServiceModule;
  const {
    openChat,
    resetChat,
    isOpen: chatOpen,
    closeChat,
    setMobilityChatReminder,
    primeCarGoConversation,
    openChatWithConversation,
  } = useGoChat();
  const { socket } = useSocket();
  const rideApiBase = serviceModule === "pack" ? "/api/pack/rides" : "/api/mobility/rides";
  const rideSocketPrefix = serviceModule === "pack" ? "pack:ride:" : "cargo:ride:";
  const presenceEvent = serviceModule === "pack" ? "pack:driver:presence" : "cargo:driver:presence";
  const locationEvent = serviceModule === "pack" ? "pack:ride:location" : "cargo:ride:location";
  const { toast } = useToast();
  const goDriverUi = useGoDriverUi();
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: provider, isLoading: providerLoading } = useCurrentProvider();
  const { monthlyUsdLabel } = useProviderSubscriptionMonthlyUsd({ enabled: isAuthenticated });
  const { data: categories = [] } = useCategories();
  const { data: walletData } = useWallet({ enabled: isAuthenticated && FEATURE_WALLET_RECHARGE_UI_ENABLED });
  const [driverWalletOpen, setDriverWalletOpen] = useState(false);
  const [trips, setTrips] = useState<CargoDriverTripLog[]>([]);
  const tripsForHistory = useMemo(() => {
    if (FEATURE_WALLET_RECHARGE_UI_ENABLED) return trips;
    return trips.filter((t) => t.payment === "cash" || t.payment === "bank_transfer");
  }, [trips]);
  const hasOnlyHiddenWalletTrips =
    !FEATURE_WALLET_RECHARGE_UI_ENABLED && trips.length > 0 && tripsForHistory.length === 0;
  const [historySheetOpen, setHistorySheetOpen] = useState(false);
  /** Mantiene la oferta visible mientras el backend confirma aceptar (evita parpadeo del modal). */
  const [pinnedOfferEntry, setPinnedOfferEntry] = useState<GoDriverQueuedOffer | null>(null);
  const acceptingRideIdRef = useRef<string | null>(null);
  const modalOfferEntry = pinnedOfferEntry ?? goDriverUi?.currentOffer ?? null;
  const incomingOffer = modalOfferEntry?.offer ?? null;
  const incomingModule = modalOfferEntry?.module ?? null;
  const incomingOpen = incomingOffer != null;
  const [respondBusy, setRespondBusy] = useState(false);
  const [negotiationBoardOpen, setNegotiationBoardOpen] = useState(false);
  const [negotiationViewModule, setNegotiationViewModule] = useState<"cargo" | "pack">("cargo");
  /** Tras enviar oferta de regateo: recordatorio compacto hasta match / retiro / servicio activo. */
  const [driverNegotiationSent, setDriverNegotiationSent] = useState<{
    rideId: string;
    module: "cargo" | "pack";
    amountUsd: number;
  } | null>(null);
  const [activeRideId, setActiveRideId] = useState<string | null>(null);
  const [activeRideOffer, setActiveRideOffer] = useState<CargoRideOfferPayload | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const receiving = receiveMode !== "off";
  const receivingCargo = isReceivingTaxiMode(receiveMode);
  const receivingPack = isReceivingDeliveryMode(receiveMode);
  const activeRideIdRef = useRef<string | null>(null);
  activeRideIdRef.current = activeRideId;
  const activeRideOfferRef = useRef<CargoRideOfferPayload | null>(null);
  useEffect(() => {
    activeRideOfferRef.current = activeRideOffer;
  }, [activeRideOffer]);

  /** Enlaza el hilo Go al drawer de chat y refresca la lista (el pasajero ya hacía primeCarGoConversation). */
  const syncRideConversation = useCallback(
    (conversationId: number | null | undefined, rideIdForScope?: string | null) => {
      if (conversationId == null || !Number.isFinite(Number(conversationId))) return;
      const id = Number(conversationId);
      const rideScope = rideIdForScope ?? activeRideIdRef.current;
      if (rideScope) {
        const list = queryClient.getQueryData<
          { id: number; kind?: string; mobilityRideId?: string | null; messagesLocked?: boolean }[]
        >(["chat", "conversations"]);
        const row = list?.find((c) => c.id === id);
        if (
          row &&
          String(row.kind ?? "") === "mobility_ride" &&
          String(row.mobilityRideId ?? "").trim() !== "" &&
          String(row.mobilityRideId ?? "").trim() !== String(rideScope).trim()
        ) {
          return;
        }
      }
      setActiveConversationId(id);
      primeCarGoConversation(id);
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      void queryClient.refetchQueries({ queryKey: ["chat", "conversations"] });
    },
    [queryClient, primeCarGoConversation],
  );

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

  /** El respond HTTP puede devolver conversationId null antes de crear el hilo; reintentar hasta tenerlo. */
  useEffect(() => {
    if (!activeRideId || activeConversationId != null) return;
    const mod: "cargo" | "pack" =
      activeServiceModule ?? (goSlug === "pack" ? "pack" : "cargo");
    let cancelled = false;
    let attempts = 0;
    const run = async () => {
      while (!cancelled && attempts < 10) {
        attempts += 1;
        const cid = await fetchGoRideConversationId(activeRideId, mod);
        if (cancelled) return;
        if (cid != null) {
          syncRideConversation(cid);
          return;
        }
        await new Promise((r) => window.setTimeout(r, 500 + attempts * 250));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activeRideId, activeConversationId, activeServiceModule, goSlug, syncRideConversation]);

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
  const [activeRidePanelCollapsed, setActiveRidePanelCollapsed] = useState(false);
  const activeServiceRouteRef = useRef<StoredDrivingRoute | null>(null);
  const serviceRouteTrimIndexRef = useRef(0);
  const lastServiceRouteDeviationFetchRef = useRef<{ at: number; targetKey: string } | null>(null);
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
  const providerSubscriptionEndsAt = (provider as { visibilitySubscriptionEndsAt?: string | null } | null)
    ?.visibilitySubscriptionEndsAt;
  const isCarGoDriver = !!provider && isCarGoProvider(provider, categories);
  const isPackGoDriver = !!provider && providerHasGoBrand(provider as any, "delivery", categories);
  const canSeeDriverView = isAdmin || isCarGoDriver || isPackGoDriver;
  const hasVehicle = !!providerVehicle?.vehicle_type;
  const hasActiveSubscription = isAdmin || isGoDriverSubscriptionActive(providerSubscriptionEndsAt);
  const meetsDriverBasics =
    !!provider?.isVerified && (isCarGoDriver || isPackGoDriver) && hasVehicle;
  const canReceive = meetsDriverBasics && hasActiveSubscription;
  const canUseDriverNegotiation =
    (isAdmin || provider?.isVerified === true) && hasActiveSubscription;
  const slideDisabledHint =
    meetsDriverBasics && !hasActiveSubscription ? GO_DRIVER_SUBSCRIPTION_INACTIVE_SLIDE_HINT : undefined;

  const slideDockRef = useRef<HTMLDivElement>(null);

  const { data: serverTripHistory = [] } = useQuery({
    queryKey: ["mobility-ride-history", "driver", user?.id],
    queryFn: () => fetchMobilityRideHistoryForUser(50, "driver"),
    enabled: !!user?.id,
  });

  useEffect(() => {
    const rows = serverTripHistory.map(historyToDriverTripLog);
    setTrips(rows);
  }, [serverTripHistory]);

  useEffect(() => {
    if (!goDriverUi) return;
    goDriverUi.registerOpenHistory(() => setHistorySheetOpen(true));
    return () => goDriverUi.registerOpenHistory(null);
  }, [goDriverUi]);

  const canOpenDriverNegotiationBoard = canUseDriverNegotiation;

  useEffect(() => {
    if (!goDriverUi) return;
    goDriverUi.registerOpenNegotiationBoard(() => {
      if (!canOpenDriverNegotiationBoard) {
        const verifiedNoSubscription =
          provider?.isVerified === true &&
          !isGoDriverSubscriptionActive(providerSubscriptionEndsAt);
        toast({
          title: verifiedNoSubscription ? "Suscripción vencida" : "Perfil no verificado",
          description: verifiedNoSubscription
            ? GO_DRIVER_SUBSCRIPTION_INACTIVE_NEGOTIATION_HINT
            : "Verifica tu perfil profesional para ver el tablero de regateo y poder ofertar en taxi y delivery.",
          variant: "destructive",
        });
        return;
      }
      setNegotiationBoardOpen(true);
    });
    return () => goDriverUi.registerOpenNegotiationBoard(null);
  }, [goDriverUi, canOpenDriverNegotiationBoard, toast, provider?.isVerified, providerSubscriptionEndsAt]);

  useEffect(() => {
    if (negotiationBoardOpen && !canOpenDriverNegotiationBoard) {
      setNegotiationBoardOpen(false);
    }
  }, [negotiationBoardOpen, canOpenDriverNegotiationBoard]);

  useEffect(() => {
    if (!socket) return;
    const onCargoOffer = (p: CargoRideOfferPayload) => {
      // Si ya hay un servicio activo, ignorar ofertas nuevas (evita modal pegado/sonido).
      if (activeRideIdRef.current) return;
      if (acceptingRideIdRef.current) return;
      if (!isReceivingTaxiMode(receiveModeRef.current)) return;
      if (p?.isNegotiated) return;
      goDriverUi?.pushOffer("cargo", p);
    };
    const onPackOffer = (p: CargoRideOfferPayload) => {
      if (activeRideIdRef.current) return;
      if (acceptingRideIdRef.current) return;
      if (!isReceivingDeliveryMode(receiveModeRef.current)) return;
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
      if (activeRideIdRef.current === p.rideId) {
        const fromEvent = p.conversationId ?? null;
        if (fromEvent != null) {
          syncRideConversation(fromEvent);
          return;
        }
        const cid = await fetchGoRideConversationId(p.rideId, serviceModule);
        if (cid != null) syncRideConversation(cid);
        return;
      }
      acceptingRideIdRef.current = null;
      setPinnedOfferEntry(null);
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
        syncRideConversation(p.conversationId ?? ride.conversationId ?? null);
        setActiveServiceModule(serviceModule);
        setActiveRideId(ride.id);
        setActiveRideOffer(mapApiRideToOffer(ride));
        setActiveRideStarted(ride.status === "in_progress");
        setSearchingClient(!!ride.driverSearchingClient);
        setPaymentConfirmed(
          (ride.paymentMethod === "genfeb" && FEATURE_WALLET_RECHARGE_UI_ENABLED) || !!ride.paymentConfirmed
        );
        saveGoDriverActiveRideId(serviceModule === "pack" ? "pack" : "cargo", ride.id);
        activeServiceRouteRef.current = null;
        serviceRouteTrimIndexRef.current = 0;
        lastServiceRouteDeviationFetchRef.current = null;
        stopReceiving();
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
  }, [socket, user?.id, goDriverUi, syncRideConversation]);

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

  // Recovery: oferta pendiente del modo activo (taxi, delivery o híbrido).
  useEffect(() => {
    if (!goDriverUi) return;
    const mode = receiveModeRef.current;
    if (mode === "off") return;
    let cancelled = false;
    const run = async () => {
      try {
        const auth = localStorage.getItem("token");
        const headers: Record<string, string> = auth ? { Authorization: `Bearer ${auth}` } : {};
        const fetchPending = async (module: "cargo" | "pack") => {
          if (cancelled || activeRideIdRef.current || acceptingRideIdRef.current) return;
          const url =
            module === "pack"
              ? "/api/pack/driver/pending-offer"
              : "/api/mobility/driver/pending-offer";
          const res = await fetch(url, { headers });
          const body = res.ok ? await res.json().catch(() => null) : null;
          if (cancelled || activeRideIdRef.current || acceptingRideIdRef.current) return;
          const offer = body?.offer ?? null;
          if (offer && !offer.isNegotiated) goDriverUi.pushOffer(module, offer);
        };
        if (mode === "both") {
          await Promise.all([fetchPending("cargo"), fetchPending("pack")]);
        } else if (mode === "delivery") {
          await fetchPending("pack");
        } else {
          await fetchPending("cargo");
        }
      } catch {
        /* recovery silencioso */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [goDriverUi, receiveMode]);

  /** Al activar “recibir pedidos” con una búsqueda de regateo ya en curso, traer oferta pendiente al instante. */
  useEffect(() => {
    if (!goDriverUi) return;
    if (receiveMode === "off") return;
    if (!canReceive || !providerVehicle?.vehicle_type) return;
    if (activeRideIdRef.current) return;
    let cancelled = false;
    const run = async () => {
      try {
        const auth = localStorage.getItem("token");
        const headers: Record<string, string> = auth ? { Authorization: `Bearer ${auth}` } : {};
        const tryPush = async (module: "cargo" | "pack") => {
          const url =
            module === "pack"
              ? "/api/pack/driver/pending-offer"
              : "/api/mobility/driver/pending-offer";
          const res = await fetch(url, { headers });
          const body = res.ok ? await res.json().catch(() => null) : null;
          if (cancelled || activeRideIdRef.current || acceptingRideIdRef.current) return;
          const offer = body?.offer ?? null;
          if (!offer || offer.isNegotiated) return;
          goDriverUi.pushOffer(module, offer);
        };
        if (receiveMode === "both") {
          await Promise.all([tryPush("cargo"), tryPush("pack")]);
        } else if (receiveMode === "delivery") {
          await tryPush("pack");
        } else {
          await tryPush("cargo");
        }
      } catch {
        /* ignore */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [goDriverUi, receiveMode, canReceive, providerVehicle?.vehicle_type]);

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
        window.setTimeout(() => {
          notifyMobilityRideHistoryChanged();
          void queryClient.invalidateQueries({ queryKey: ["mobility-ride-history"] });
        }, 600);
        rateTargetRef.current = { rideId: p.rideId, targetName: snap.rider?.name ?? "Cliente" };
        setRateStars(5);
        setRateDialogOpen(true);
      } else if (canReceive && providerVehicle?.vehicle_type) {
        const mod = activeServiceModuleRef.current ?? receiveModeToGoSlug(receiveModeRef.current);
        setReceiveMode(mod === "pack" ? "delivery" : "taxi");
      }
      const endedMod = activeServiceModuleRef.current ?? receiveModeToGoSlug(receiveModeRef.current);
      clearGoDriverActiveRideId(endedMod === "pack" ? "pack" : "cargo");
      setActiveServiceModule(null);
      setActiveRideId(null);
      setActiveRideOffer(null);
      setActiveRideStarted(false);
      setPaymentConfirmed(false);
      setDriverNegotiationSent(null);
      setServiceRouteGeometry(null);
      setServiceEtaSec(null);
      activeServiceRouteRef.current = null;
      serviceRouteTrimIndexRef.current = 0;
      lastServiceRouteDeviationFetchRef.current = null;
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
      const cancelledMod = activeServiceModuleRef.current ?? receiveModeToGoSlug(receiveModeRef.current);
      clearGoDriverActiveRideId(cancelledMod === "pack" ? "pack" : "cargo");
      setActiveServiceModule(null);
      setActiveRideId(null);
      setActiveRideOffer(null);
      setActiveRideStarted(false);
      setPaymentConfirmed(false);
      setDriverNegotiationSent(null);
      setServiceRouteGeometry(null);
      setServiceEtaSec(null);
      activeServiceRouteRef.current = null;
      serviceRouteTrimIndexRef.current = 0;
      lastServiceRouteDeviationFetchRef.current = null;
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
      window.setTimeout(() => {
        notifyMobilityRideHistoryChanged();
        void queryClient.invalidateQueries({ queryKey: ["mobility-ride-history"] });
      }, 600);
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
        setReceiveMode(serviceModule === "pack" ? "delivery" : "taxi");
      }
      toast({ title: "¡Gracias!", description: "Calificación enviada." });
    } catch (e) {
      toast({ title: "No se pudo enviar", description: e instanceof Error ? e.message : "Intenta de nuevo", variant: "destructive" });
    } finally {
      setRateBusy(false);
    }
  }, [rateStars, toast, rideApiBase, canReceive, providerVehicle?.vehicle_type, goSlug]);

  const emitDriverPresenceOffline = useCallback(() => {
    /** No borrar presencia en servidor durante un viaje: la central sigue mostrando posición. */
    if (activeRideIdRef.current) return;
    if (!socket) return;
    socket.emit("cargo:driver:presence", { receiving: false, vehicleType: "", isPetFriendly: false, lat: 0, lon: 0 });
    socket.emit("pack:driver:presence", { receiving: false, vehicleType: "", lat: 0, lon: 0 });
  }, [socket]);

  /** Tras terminar o cancelar un viaje: si la suscripción ya no está activa, dejar de recibir pedidos. */
  const disconnectReceivingIfSubscriptionLapsed = useCallback(() => {
    if (isAdmin || hasActiveSubscription) return;
    stopReceiving();
    emitDriverPresenceOffline();
  }, [isAdmin, hasActiveSubscription, stopReceiving, emitDriverPresenceOffline]);

  const resetReceivingAfterSocketLoss = useCallback(() => {
    stopReceiving();
    emitDriverPresenceOffline();
  }, [emitDriverPresenceOffline, stopReceiving]);

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

    const vehicleType = providerVehicle?.vehicle_type?.trim() ?? "";
    const pet = !!providerVehicle?.is_pet_friendly;

    const syncFleetPresence = (): boolean => {
      const pos = geoPosRef.current;
      if (!pos || !vehicleType) return false;

      if (canReceive) {
        const mode = receiveModeRef.current;
        const cargoReceiving = isReceivingTaxiMode(mode);
        const packReceiving = isReceivingDeliveryMode(mode);
        socket.emit("cargo:driver:presence", {
          receiving: cargoReceiving,
          vehicleType: cargoReceiving ? vehicleType : "",
          isPetFriendly: pet,
          lat: pos.lat,
          lon: pos.lon,
        });
        socket.emit("pack:driver:presence", {
          receiving: packReceiving,
          vehicleType: packReceiving ? vehicleType : "",
          lat: pos.lat,
          lon: pos.lon,
        });
        return true;
      }

      if (activeRideIdRef.current) {
        socket.emit("cargo:driver:presence", {
          receiving: false,
          vehicleType,
          isPetFriendly: pet,
          lat: pos.lat,
          lon: pos.lon,
        });
        socket.emit("pack:driver:presence", {
          receiving: false,
          vehicleType,
          lat: pos.lat,
          lon: pos.lon,
        });
        return true;
      }

      return false;
    };

    if (!syncFleetPresence()) {
      if (!activeRideIdRef.current) emitDriverPresenceOffline();
      return;
    }

    const t = window.setInterval(() => {
      syncFleetPresence();
    }, 4000);

    return () => {
      window.clearInterval(t);
      emitDriverPresenceOffline();
    };
  }, [
    socket,
    receiveMode,
    canReceive,
    providerVehicle?.vehicle_type,
    providerVehicle?.is_pet_friendly,
    geoPos,
    emitDriverPresenceOffline,
    activeRideId,
    activeServiceModule,
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
    const entry = pinnedOfferEntry ?? goDriverUi?.currentOffer ?? null;
    if (!entry) return;
    const snapOffer = entry.offer;
    const snapModule = entry.module;
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

    if (accept) {
      acceptingRideIdRef.current = snapOffer.rideId;
      setPinnedOfferEntry(entry);
    } else {
      goDriverUi?.resolveOfferAndShowNext(snapOffer.rideId);
    }
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
        if (accept) {
          acceptingRideIdRef.current = null;
          setPinnedOfferEntry(null);
        }
        if (!accept) goDriverUi?.resolveOfferAndShowNext(snapOffer.rideId);
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
      acceptingRideIdRef.current = null;
      setPinnedOfferEntry(null);
      goDriverUi?.resolveOfferAndShowNext(snapOffer.rideId);
      goDriverUi?.clearOffers?.();
      if (accept) {
        setDriverNegotiationSent(null);
        syncRideConversation(data.conversationId ?? null);
        if (data.conversationId == null) {
          void fetchGoRideConversationId(
            snapOffer.rideId,
            snapModule === "pack" ? "pack" : "cargo",
          ).then((cid) => {
            if (cid != null) syncRideConversation(cid);
          });
        }
        setActiveRideId(snapOffer.rideId);
        setActiveRideOffer(snapOffer);
        setActiveRideStarted(false);
        setSearchingClient(false);
        setPaymentConfirmed(snapOffer.paymentMethod === "genfeb" && FEATURE_WALLET_RECHARGE_UI_ENABLED);
        // Guardar según módulo para reanudar correctamente.
        setActiveServiceModule(snapModule === "pack" ? "pack" : "cargo");
        saveGoDriverActiveRideId(snapModule === "pack" ? "pack" : "cargo", snapOffer.rideId);
        activeServiceRouteRef.current = null;
        serviceRouteTrimIndexRef.current = 0;
        lastServiceRouteDeviationFetchRef.current = null;
        stopReceiving();
      }
      if (!accept) {
        setActiveConversationId(null);
        setActiveRideId(null);
        setActiveRideOffer(null);
        setActiveRideStarted(false);
        setPaymentConfirmed(false);
      }
    } catch (e) {
      if (accept) {
        acceptingRideIdRef.current = null;
        setPinnedOfferEntry(null);
      }
      // Si el conductor aceptó y (por carrera/latencia) ya quedó asignado, evitamos el toast rojo.
      if (accept && activeRideIdRef.current === snapOffer.rideId) {
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
      activeServiceRouteRef.current = null;
      serviceRouteTrimIndexRef.current = 0;
      lastServiceRouteDeviationFetchRef.current = null;
      void queryClient.invalidateQueries({ queryKey: ["/api/wallet/me"] });
      disconnectReceivingIfSubscriptionLapsed();
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
      clearGoDriverActiveRideId(goSlug === "pack" ? "pack" : "cargo");
      setActiveRideId(null);
      setActiveRideOffer(null);
      setActiveRideStarted(false);
      setPaymentConfirmed(false);
      setDriverNegotiationSent(null);
      setServiceRouteGeometry(null);
      setServiceEtaSec(null);
      activeServiceRouteRef.current = null;
      serviceRouteTrimIndexRef.current = 0;
      lastServiceRouteDeviationFetchRef.current = null;
      toast({ title: "Viaje cancelado", description: "El servicio quedó anulado." });
      setCancelServiceOpen(false);
      disconnectReceivingIfSubscriptionLapsed();
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

  /** Solo al cambiar fase del viaje; no en cada recorte GPS (evita remount del GeoJSON). */
  const serviceRouteRenderKey = !activeRideOffer ? 0 : activeRideStarted ? 2 : 1;

  const activeRiderPhone = useMemo(() => {
    if (!activeRideOffer?.rider) return "";
    return extractUserPublicPhone(activeRideOffer.rider as unknown as Record<string, unknown>);
  }, [activeRideOffer?.rider]);

  const openActiveRideChat = useCallback(async () => {
    let convId = activeConversationId;
    if ((convId == null || !Number.isFinite(convId)) && activeRideId) {
      const mod: "cargo" | "pack" =
        activeServiceModule ?? (goSlug === "pack" ? "pack" : "cargo");
      const fetched = await fetchGoRideConversationId(activeRideId, mod);
      if (fetched != null) {
        syncRideConversation(fetched);
        convId = fetched;
      }
    }
    if (convId != null && Number.isFinite(convId)) {
      await queryClient.refetchQueries({ queryKey: ["chat", "conversations"] });
      openChatWithConversation(Number(convId));
      return;
    }
    toast({
      title: "Chat no disponible",
      description: "El hilo de chat aún no está listo. Intenta de nuevo en unos segundos.",
      variant: "destructive",
    });
  }, [
    activeConversationId,
    activeRideId,
    activeServiceModule,
    goSlug,
    openChatWithConversation,
    queryClient,
    syncRideConversation,
    toast,
  ]);

  useEffect(() => {
    activeServiceRouteRef.current = null;
    serviceRouteTrimIndexRef.current = 0;
    lastServiceRouteDeviationFetchRef.current = null;
  }, [activeRideId, activeRideStarted, serviceNavTarget?.lat, serviceNavTarget?.lon]);

  const applyTrimmedServiceRoute = useCallback(
    (route: StoredDrivingRoute, driverPos: { lat: number; lon: number }) => {
      const trimmed = trimRouteAtDriver(route, driverPos, serviceRouteTrimIndexRef.current);
      serviceRouteTrimIndexRef.current = trimmed.trimIndex;
      const gj = geoJsonLineFromCoords(trimmed.trimmedCoords);
      if (gj) {
        setServiceRouteGeometry(gj);
      }
      setServiceEtaSec(trimmed.remainingDurationSec);
      return trimmed;
    },
    [],
  );

  const fetchServiceRoadRoute = useCallback(async () => {
    const g = geoPosRef.current;
    if (!activeRideId || !g || !serviceNavTarget) return false;
    const targetKey = serviceNavTargetKey(serviceNavTarget);
    const url = `/api/maps/route?from=${g.lon},${g.lat}&to=${serviceNavTarget.lon},${serviceNavTarget.lat}`;
    const tryOnce = async (): Promise<boolean> => {
      const res = await fetch(url);
      const data = (await res.json().catch(() => null)) as {
        geometry?: GeoJsonObject;
        distanceM?: number;
        durationSec?: number;
        source?: string;
        fallback?: boolean;
      } | null;
      if (!res.ok || !isRoadRouteApiPayload(data)) return false;
      const stored = buildStoredDrivingRoute(
        data!.geometry,
        targetKey,
        Number(data!.distanceM),
        Number(data!.durationSec ?? 60),
      );
      if (!stored) return false;
      activeServiceRouteRef.current = stored;
      serviceRouteTrimIndexRef.current = 0;
      applyTrimmedServiceRoute(stored, g);
      lastServiceRouteDeviationFetchRef.current = { at: Date.now(), targetKey };
      return true;
    };
    setServiceRouteLoading(true);
    try {
      if (await tryOnce()) return true;
      await new Promise((r) => window.setTimeout(r, 1200));
      return tryOnce();
    } finally {
      setServiceRouteLoading(false);
    }
  }, [activeRideId, serviceNavTarget, applyTrimmedServiceRoute]);

  const handleServiceRoutePosition = useCallback(() => {
    const g = geoPosRef.current;
    if (!activeRideId || !g || !serviceNavTarget) return;
    const targetKey = serviceNavTargetKey(serviceNavTarget);
    const route = activeServiceRouteRef.current;

    if (!route || route.targetKey !== targetKey) {
      serviceRouteTrimIndexRef.current = 0;
      void fetchServiceRoadRoute();
      return;
    }

    const trimmed = applyTrimmedServiceRoute(route, g);
    if (trimmed.deviationM < DRIVER_ROUTE_DEVIATION_M) return;

    const now = Date.now();
    const last = lastServiceRouteDeviationFetchRef.current;
    if (last?.targetKey === targetKey && now - last.at < DRIVER_ROUTE_DEVIATION_REFETCH_MS) return;
    void fetchServiceRoadRoute();
  }, [activeRideId, serviceNavTarget, applyTrimmedServiceRoute, fetchServiceRoadRoute]);

  useEffect(() => {
    if (!activeRideId || !serviceNavTarget) {
      setServiceRouteGeometry(null);
      setServiceEtaSec(null);
      activeServiceRouteRef.current = null;
      return;
    }
    if (!geoPos) return;
    void fetchServiceRoadRoute();
  }, [activeRideId, serviceNavTarget?.lat, serviceNavTarget?.lon, fetchServiceRoadRoute]);

  useEffect(() => {
    if (!activeRideId || !serviceNavTarget || !geoPos) return;
    handleServiceRoutePosition();
  }, [activeRideId, geoPos?.lat, geoPos?.lon, serviceNavTarget, handleServiceRoutePosition]);

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
    const cargoStored = loadGoDriverActiveRideId("cargo");
    const packStored = loadGoDriverActiveRideId("pack");
    const resumeModule = cargoStored ? ("cargo" as const) : packStored ? ("pack" as const) : null;
    const stored = cargoStored ?? packStored;
    if (!stored || !resumeModule) return;
    const token = localStorage.getItem("token");
    const clearStored = () => clearGoDriverActiveRideId(resumeModule);
    if (!token) {
      clearStored();
      return;
    }
    const apiBase = resumeModule === "pack" ? "/api/pack/rides" : "/api/mobility/rides";
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/${encodeURIComponent(stored)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!alive) return;
        if (!res.ok) {
          clearStored();
          return;
        }
        const ride = (await res.json()) as MobilityRideHydration;
        if (ride.driverUserId !== user.id) {
          clearStored();
          return;
        }
        if (ride.status !== "matched" && ride.status !== "in_progress") {
          clearStored();
          return;
        }
        setActiveServiceModule(resumeModule);
        setActiveRideId(ride.id);
        setActiveRideOffer(mapApiRideToOffer(ride));
        setActiveRideStarted(ride.status === "in_progress");
        setSearchingClient(!!ride.driverSearchingClient);
        setPaymentConfirmed(
          (ride.paymentMethod === "genfeb" && FEATURE_WALLET_RECHARGE_UI_ENABLED) || !!ride.paymentConfirmed
        );
        syncRideConversation(ride.conversationId ?? null);
        setDriverNegotiationSent(null);
        stopReceiving();
      } catch {
        if (alive) clearStored();
      }
    })();
    return () => {
      alive = false;
    };
  }, [authLoading, isAuthenticated, user?.id, stopReceiving, syncRideConversation]);

  // Si no cumple requisitos (o venció la suscripción), no quedar en "recibiendo".
  // Excepción: con un viaje/envío activo puede terminar el servicio antes de desconectarse.
  useEffect(() => {
    if (canReceive) return;
    const cargoRide = loadGoDriverActiveRideId("cargo");
    const packRide = loadGoDriverActiveRideId("pack");
    if (activeRideId || cargoRide || packRide) return;
    if (receiving) stopReceiving();
  }, [canReceive, receiving, activeRideId, stopReceiving]);

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
    return s;
  })();

  const workMode: GoDriverReceiveMode | "service-taxi" | "service-delivery" = activeRideId
    ? serviceModule === "pack"
      ? "service-delivery"
      : "service-taxi"
    : receiveMode;
  const isHybridWork = workMode === "both";
  const isDeliveryWork = workMode === "delivery" || workMode === "service-delivery";

  const handleReceiveModeChange = (next: GoDriverReceiveMode) => {
    if (activeRideId) return;
    if (incomingOpen || classicOfferModalOpen) {
      toast({
        title: "Oferta en pantalla",
        description: "Responde o cierra la oferta antes de cambiar entre taxi y delivery.",
        variant: "destructive",
      });
      return;
    }
    setReceiveMode(next);
  };

  const receiveModeSlider =
    isCarGoDriver || isPackGoDriver ? (
      <SlideToGoReceiveMode
        mode={receiveMode}
        onModeChange={handleReceiveModeChange}
        canTaxi={isCarGoDriver}
        canDelivery={isPackGoDriver || isCarGoDriver}
        variant={isGoCompact ? "mapOverlay" : "default"}
        disabled={!canReceive || !!activeRideId}
        disabledHint={
          activeRideId
            ? "Finaliza el servicio activo para cambiar entre taxi y delivery"
            : slideDisabledHint
        }
        className={
          isGoCompact
            ? undefined
            : "rounded-xl border border-border/60 bg-background/95 p-2 shadow-md ring-1 ring-black/[0.06] dark:ring-white/10"
        }
      />
    ) : null;

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
    <div className="mx-auto w-full max-w-[min(100%,20.5rem)] space-y-1.5">{receiveModeSlider}</div>
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
          <GoUserRideStatsBadges
            compact
            className="mt-1"
            rating={activeRideOffer.rider?.rating}
            ratingCount={activeRideOffer.rider?.ratingCount}
            completedTrips={activeRideOffer.rider?.completedTrips}
          />
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
      {activeRideId ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {activeRiderPhone ? (
            <a
              href={`tel:${activeRiderPhone}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 text-xs font-semibold text-primary"
            >
              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Llamar
            </a>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 rounded-full px-3 text-xs font-semibold"
            onClick={() => void openActiveRideChat()}
          >
            <MessageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Chat
          </Button>
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
      {receiveModeSlider}
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
        <div
          className={cn(
            "rounded-2xl border bg-gradient-to-br via-background to-background p-4 shadow-sm",
            isHybridWork
              ? "border-sky-500/35 from-sky-600/10 dark:from-sky-500/10"
              : "border-emerald-500/45 from-emerald-600/15 dark:from-emerald-500/10",
          )}
          style={
            isHybridWork
              ? {
                  backgroundImage:
                    "linear-gradient(135deg, rgba(14,165,233,0.12) 0%, rgba(16,185,129,0.08) 50%, rgba(139,92,246,0.12) 100%)",
                }
              : undefined
          }
        >
          <div className="flex gap-3">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600/20 ring-2 ring-emerald-500/45">
              <Radio className="h-5 w-5 text-emerald-800 dark:text-emerald-100" aria-hidden />
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/25 [animation-duration:2.2s]" aria-hidden />
            </span>
            <div className="min-w-0 space-y-2">
              <h1 className="font-display text-xl font-bold tracking-tight text-emerald-950 dark:text-emerald-50 sm:text-2xl">
                {isHybridWork
                  ? `Modo híbrido · recibiendo ${MOBILITY_UI.taxiService.toLowerCase()} y ${MOBILITY_UI.delivery.toLowerCase()}`
                  : isDeliveryWork
                    ? `Disponible para envíos de ${MOBILITY_UI.delivery}`
                    : `Disponible para ${MOBILITY_UI.taxiService.toLowerCase()}`}
              </h1>
              <p
                className={cn(
                  "text-sm leading-relaxed",
                  isHybridWork
                    ? "text-foreground/90 dark:text-emerald-50/90"
                    : "text-emerald-950/90 dark:text-emerald-50/90",
                )}
              >
                {isHybridWork
                  ? "Recibirás el primer servicio que te asigne el sistema (taxi o envío). Si rechazas uno, sigues disponible para el otro. Mantén el GPS activo."
                  : isDeliveryWork
                    ? "No recibirás cada envío al instante: cuando el sistema te asigne uno, lo verás en el mapa y aquí. Mantén el GPS activo."
                    : "No recibirás cada pedido al instante: cuando el sistema te asigne uno, lo verás en el mapa y aquí. Mantén el GPS activo."}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Panel conductor
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mapa en vivo. Desliza a la izquierda para taxi, al centro para apagar o a la derecha para{" "}
            {MOBILITY_UI.delivery.toLowerCase()}. Un toque en el botón activa taxi y delivery a la vez; otro toque apaga.
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
                : meetsDriverBasics && !hasActiveSubscription
                  ? GO_DRIVER_SUBSCRIPTION_INACTIVE_DRIVER_BANNER
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
              hideLocationSearchingHint
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
                <div
                  className={cn(
                    "rounded-lg border bg-background/95 p-1.5 shadow-lg ring-1 ring-black/[0.08] backdrop-blur-md sm:rounded-xl sm:p-2 dark:bg-background/88 dark:ring-white/10",
                    isHybridWork
                      ? "border-sky-500/40 dark:border-violet-500/35"
                      : "border-emerald-600/40 dark:border-emerald-500/45 dark:bg-emerald-500/10",
                  )}
                  style={
                    isHybridWork
                      ? {
                          backgroundImage:
                            "linear-gradient(135deg, rgba(14,165,233,0.14) 0%, rgba(16,185,129,0.1) 50%, rgba(139,92,246,0.14) 100%)",
                        }
                      : undefined
                  }
                >
                  <div className="flex items-start gap-1.5 sm:gap-2">
                    <span
                      className={cn(
                        "relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 sm:h-7 sm:w-7",
                        isHybridWork
                          ? "bg-gradient-to-br from-sky-500/30 via-emerald-500/25 to-violet-500/30 ring-sky-400/40"
                          : "bg-emerald-600/20 ring-emerald-500/40 dark:bg-emerald-400/15",
                      )}
                    >
                      <Radio
                        className={cn(
                          "h-3 w-3 sm:h-3.5 sm:w-3.5",
                          isHybridWork ? "text-sky-900 dark:text-sky-100" : "text-emerald-800 dark:text-emerald-100",
                        )}
                        aria-hidden
                      />
                      <span
                        className={cn(
                          "absolute inset-0 animate-ping rounded-full [animation-duration:2.5s]",
                          isHybridWork ? "bg-sky-400/15" : "bg-emerald-400/20",
                        )}
                        aria-hidden
                      />
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5 sm:space-y-1">
                      <p
                        className={cn(
                          "font-display text-xs font-bold leading-tight sm:text-sm",
                          isHybridWork
                            ? "bg-gradient-to-r from-sky-800 via-emerald-900 to-violet-900 bg-clip-text text-transparent dark:from-sky-100 dark:via-emerald-50 dark:to-violet-100"
                            : "text-emerald-950 dark:text-emerald-50",
                        )}
                      >
                        {isHybridWork
                          ? `Modo híbrido · recibiendo ${MOBILITY_UI.taxiService.toLowerCase()} y ${MOBILITY_UI.delivery.toLowerCase()}`
                          : isDeliveryWork
                            ? `Disponible · ${MOBILITY_UI.delivery}`
                            : `Disponible · ${MOBILITY_UI.taxiService}`}
                      </p>
                      <p
                        className={cn(
                          "text-[9px] leading-snug sm:text-[10px]",
                          isHybridWork
                            ? "text-foreground dark:text-emerald-50/90"
                            : "text-emerald-950/85 dark:text-emerald-50/85",
                        )}
                      >
                        <span className="sm:hidden">
                          {isHybridWork
                            ? "Taxi y delivery · primer servicio disponible · toque en el botón para apagar."
                            : isDeliveryWork
                              ? "Envíos no instantáneos · GPS · salir: desliza al centro."
                              : "Pedidos no instantáneos · GPS · salir: desliza al centro."}
                        </span>
                        <span className="hidden sm:inline">
                          {isHybridWork
                            ? "Recibes taxi y delivery. Te llega el primero disponible. GPS encendido. Toca el botón inferior para apagar."
                            : isDeliveryWork
                              ? "Los envíos no son instantáneos. GPS encendido. Para salir de línea, desliza al centro."
                              : "Los pedidos no son instantáneos. GPS encendido. Para salir de línea, desliza al centro."}
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
                        : meetsDriverBasics && !hasActiveSubscription
                          ? GO_DRIVER_SUBSCRIPTION_INACTIVE_SLIDE_HINT
                          : "Completa los requisitos para recibir viajes."}
                </p>
              )}
            </div>
          </div>
          <div
            className={cn(
              goViewportClasses.mapControlsDock,
              "max-lg:flex max-lg:flex-col max-lg:items-center max-lg:pb-11",
            )}
          >
            <div ref={slideDockRef} className="pointer-events-auto w-full max-lg:-translate-y-2">
              {activeRideOffer ? activeServicePanel : controlsBlockMobile}
            </div>
          </div>
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
        className="container mx-auto hidden w-full max-w-full flex-1 flex-col gap-6 px-4 pb-10 pt-4 lg:flex lg:max-w-6xl lg:gap-10 lg:px-6 xl:max-w-[88rem]"
      >
        {headerBlock}

        <div className="flex min-h-0 w-full flex-1 flex-col gap-5 lg:flex-row lg:items-stretch lg:gap-10">
          <div className="relative flex min-h-[min(52vh,520px)] w-full min-w-0 flex-[1.4] flex-col overflow-hidden rounded-2xl border border-border/50 bg-muted/20 shadow-inner ring-1 ring-black/[0.04] dark:bg-muted/10 dark:ring-white/10 lg:min-h-[min(560px,calc(100vh-12rem))]">
            <DriverCargoMap
              fullscreen
              showRecenter
              hideLocationSearchingHint
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
            {activeRideOffer ? activeServicePanel : controlsBlockDesktopSlides}
            <Button
              type="button"
              variant="secondary"
              className="hidden w-full lg:inline-flex"
              onClick={() => setHistorySheetOpen(true)}
            >
              <History className="mr-2 h-4 w-4 shrink-0" aria-hidden />
              Historial de viajes
            </Button>
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
            <SheetTitle className="font-display text-lg">Regateo · taxi y {MOBILITY_UI.delivery}</SheetTitle>
            <SheetDescription>
              Solicitudes con monto a negociar. Se actualizan solas cada 5 segundos; también puedes pulsar actualizar.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-hidden px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:px-4">
            <GoDriverNegotiationBoardPanel
              active={negotiationBoardOpen}
              viewModule={negotiationViewModule}
              onViewModuleChange={setNegotiationViewModule}
              providerVehicleType={providerVehicle?.vehicle_type}
              providerIsPetFriendly={!!providerVehicle?.is_pet_friendly}
              canSubmitNegotiationOffers={canUseDriverNegotiation}
              submitBlockedHint={
                provider?.isVerified === true && !hasActiveSubscription
                  ? GO_DRIVER_SUBSCRIPTION_INACTIVE_NEGOTIATION_HINT
                  : undefined
              }
              onOfferSubmitted={(rideId, amountUsd, module) => {
                setDriverNegotiationSent({ rideId, module, amountUsd });
                stopReceiving();
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
    <GoDriverSessionProvider>
      <GoChatProvider>
        <GoDriverUiProvider>
          <DriverGoGenfeb />
          <GoChatDrawer />
        </GoDriverUiProvider>
      </GoChatProvider>
    </GoDriverSessionProvider>
  );
}

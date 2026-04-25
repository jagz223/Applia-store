import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { PROVIDER_WALLET_FLOOR_USD } from "@shared/wallet-limits";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CheckCircle2, Loader2, MessageSquare, Phone, Radio, Settings, Star, Wallet, XCircle } from "lucide-react";
import { useGoDriverUi } from "@/contexts/GoDriverUiContext";
import { useAuth } from "@/hooks/use-auth";
import { useCategories, useCurrentProvider, useWallet } from "@/hooks/use-mango-data";
import { isCarGoProvider } from "@shared/provider-car-go";
import { DriverCargoMap } from "@/components/driver/DriverCargoMap";
import { SlideToCargoOnline } from "@/components/driver/SlideToCargoOnline";
import { DriverTripHistorySheet } from "@/components/driver/DriverTripHistorySheet";
import {
  clearDriverActiveRideId,
  loadDriverActiveRideId,
  loadReceiving,
  loadTripLog,
  appendDriverTripLog,
  saveDriverActiveRideId,
  saveReceiving,
  type CargoDriverTripLog,
} from "@/lib/cargo-driver-storage";
import { Button } from "@/components/ui/button";
import { GoChatProvider, useGoChat } from "@/contexts/GoChatContext";
import { GoDriverUiProvider } from "@/contexts/GoDriverUiContext";
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

function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

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
  petEnabled: boolean;
  estimatedUsd: number;
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
    petEnabled: ride.petEnabled,
  };
}

export default function DriverGoGenfeb() {
  const queryClient = useQueryClient();
  const { openChat, resetChat } = useGoChat();
  const { socket } = useSocket();
  const { toast } = useToast();
  const goDriverUi = useGoDriverUi();
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: provider, isLoading: providerLoading } = useCurrentProvider();
  const { data: categories = [] } = useCategories();
  const { data: walletData } = useWallet({ enabled: isAuthenticated });
  const [driverWalletOpen, setDriverWalletOpen] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [trips, setTrips] = useState<CargoDriverTripLog[]>([]);
  const [historySheetOpen, setHistorySheetOpen] = useState(false);
  const [geoPos, setGeoPos] = useState<{ lat: number; lon: number } | null>(null);
  const [incomingOffer, setIncomingOffer] = useState<CargoRideOfferPayload | null>(null);
  const [incomingOpen, setIncomingOpen] = useState(false);
  const [respondBusy, setRespondBusy] = useState(false);
  const [activeRideId, setActiveRideId] = useState<string | null>(null);
  const [activeRideOffer, setActiveRideOffer] = useState<CargoRideOfferPayload | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const activeRideIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeRideIdRef.current = activeRideId;
  }, [activeRideId]);
  const activeRideOfferRef = useRef<CargoRideOfferPayload | null>(null);
  useEffect(() => {
    activeRideOfferRef.current = activeRideOffer;
  }, [activeRideOffer]);

  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [rateStars, setRateStars] = useState(5);
  const [rateBusy, setRateBusy] = useState(false);
  const rateTargetRef = useRef<{ rideId: string; targetName: string } | null>(null);
  const [activeRideStarted, setActiveRideStarted] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [cancelServiceOpen, setCancelServiceOpen] = useState(false);
  const [cancelServiceBusy, setCancelServiceBusy] = useState(false);
  const [searchClientConfirmOpen, setSearchClientConfirmOpen] = useState(false);
  const [searchingClient, setSearchingClient] = useState(false);
  const [serviceRouteGeometry, setServiceRouteGeometry] = useState<GeoJsonObject | null>(null);
  const [serviceEtaSec, setServiceEtaSec] = useState<number | null>(null);
  const [serviceRouteLoading, setServiceRouteLoading] = useState(false);
  const [serviceRouteRenderKey, setServiceRouteRenderKey] = useState(0);
  const lastServiceRouteFetchRef = useRef<{ lat: number; lon: number; at: number } | null>(null);
  const geoPosRef = useRef(geoPos);
  geoPosRef.current = geoPos;

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
  const canSeeDriverView = isAdmin || isCarGoDriver;
  const hasVehicle = !!providerVehicle?.vehicle_type;
  const canReceive = !!provider?.isVerified && isCarGoDriver && hasVehicle;

  // Ajuste dinámico: si el deslizador NO está dentro del 30% inferior del viewport,
  // aplicamos un padding-bottom grande para empujarlo hacia abajo.
  const slideDockRef = useRef<HTMLDivElement>(null);
  const [slideNeedsExtraPush, setSlideNeedsExtraPush] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const el = slideDockRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 0;
      if (vh <= 0) return;
      const bottomZoneTop = vh * 0.7; // inicio del 30% inferior
      // Si el deslizador está por encima de esa zona, necesitamos empujarlo hacia abajo.
      const shouldPush = rect.top < bottomZoneTop;
      setSlideNeedsExtraPush(shouldPush);
    };

    // Medir al montar y cuando cambie el layout (ráfaga de frames para transiciones).
    const raf1 = requestAnimationFrame(() => {
      measure();
      requestAnimationFrame(measure);
    });

    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf1);
      window.removeEventListener("resize", measure);
    };
  }, [activeRideOffer, receiving, canReceive, isMdUp]);

  useEffect(() => {
    setReceiving(loadReceiving());
    setTrips(loadTripLog());
  }, []);

  useEffect(() => {
    if (!goDriverUi) return;
    goDriverUi.registerOpenHistory(() => setHistorySheetOpen(true));
    return () => goDriverUi.registerOpenHistory(null);
  }, [goDriverUi]);

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
    const onOffer = (p: CargoRideOfferPayload) => {
      setIncomingOffer(p);
      setIncomingOpen(true);
    };
    const onTaken = () => {
      setIncomingOpen(false);
      setIncomingOffer(null);
    };
    const onExpired = () => {
      setIncomingOpen(false);
      setIncomingOffer(null);
    };
    socket.on("cargo:ride:offer", onOffer);
    socket.on("cargo:ride:taken", onTaken);
    socket.on("cargo:ride:offer_expired", onExpired);
    return () => {
      socket.off("cargo:ride:offer", onOffer);
      socket.off("cargo:ride:taken", onTaken);
      socket.off("cargo:ride:offer_expired", onExpired);
    };
  }, [socket]);

  useEffect(() => {
    if (!incomingOpen) return;
    const loop = startCargoOfferBellLoop();
    return () => loop.stop();
  }, [incomingOpen]);

  useEffect(() => {
    if (!socket) return;
    const onStarted = (p: { rideId: string }) => {
      if (!p?.rideId) return;
      if (p.rideId !== activeRideIdRef.current) return;
      setActiveRideStarted(true);
    };
    socket.on("cargo:ride:started", onStarted);
    return () => socket.off("cargo:ride:started", onStarted);
  }, [socket]);

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
        appendDriverTripLog({
          id: p.rideId,
          endedAt: new Date().toISOString(),
          durationMin: Math.max(1, Math.round((snap.durationSec ?? 0) / 60)),
          amountUsd: snap.estimatedUsd ?? 0,
          payment: snap.paymentMethod === "genfeb" ? "genfeb" : "cash",
        });
        setTrips(loadTripLog());
        rateTargetRef.current = { rideId: p.rideId, targetName: snap.rider?.name ?? "Cliente" };
        setRateStars(5);
        setRateDialogOpen(true);
      }
      clearDriverActiveRideId();
      setActiveRideId(null);
      setActiveRideOffer(null);
      setActiveRideStarted(false);
      setPaymentConfirmed(false);
      setServiceRouteGeometry(null);
      setServiceEtaSec(null);
      lastServiceRouteFetchRef.current = null;
      if (activeConversationId != null) addHiddenConversationId(activeConversationId);
      if (activeConversationId != null) purgeConversationCache(queryClient, activeConversationId);
      resetChat();
      setActiveConversationId(null);
    };
    const onCancelled = (p: { rideId: string; cancelledBy: "rider" | "driver" }) => {
      setIncomingOffer((cur) => {
        if (cur?.rideId === p.rideId) {
          setIncomingOpen(false);
          return null;
        }
        return cur;
      });
      if (p.rideId !== activeRideIdRef.current) return;
      clearDriverActiveRideId();
      setActiveRideId(null);
      setActiveRideOffer(null);
      setActiveRideStarted(false);
      setPaymentConfirmed(false);
      setServiceRouteGeometry(null);
      setServiceEtaSec(null);
      lastServiceRouteFetchRef.current = null;
      if (activeConversationId != null) addHiddenConversationId(activeConversationId);
      if (activeConversationId != null) purgeConversationCache(queryClient, activeConversationId);
      resetChat();
      setActiveConversationId(null);
      if (p.cancelledBy === "rider") {
        toast({
          title: "El pasajero canceló",
          description: "El viaje quedó anulado. Puedes seguir recibiendo pedidos.",
          variant: "destructive",
        });
      }
    };
    socket.on("cargo:ride:payment_confirmed", onPay);
    socket.on("cargo:ride:completed", onCompleted);
    socket.on("cargo:ride:cancelled", onCancelled);
    return () => {
      socket.off("cargo:ride:payment_confirmed", onPay);
      socket.off("cargo:ride:completed", onCompleted);
      socket.off("cargo:ride:cancelled", onCancelled);
    };
  }, [socket, toast, resetChat, activeConversationId, queryClient]);

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
        body: JSON.stringify({ stars: rateStars, target: "rider" }),
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
    if (!socket) return;
    if (!receiving || !canReceive || !providerVehicle?.vehicle_type || !geoPos) {
      socket.emit("cargo:driver:presence", {
        receiving: false,
        vehicleType: "",
        isPetFriendly: false,
        lat: 0,
        lon: 0,
      });
      return;
    }
    const send = () => {
      socket.emit("cargo:driver:presence", {
        receiving: true,
        vehicleType: providerVehicle.vehicle_type,
        isPetFriendly: !!providerVehicle.is_pet_friendly,
        lat: geoPos.lat,
        lon: geoPos.lon,
      });
    };
    send();
    const t = window.setInterval(send, 4000);
    return () => {
      window.clearInterval(t);
      socket.emit("cargo:driver:presence", { receiving: false, vehicleType: "", isPetFriendly: false, lat: 0, lon: 0 });
    };
  }, [socket, receiving, canReceive, providerVehicle?.vehicle_type, geoPos]);

  useEffect(() => {
    if (!socket || !activeRideId || !geoPos) return;
    const send = () => {
      socket.emit("cargo:ride:location", {
        rideId: activeRideId,
        lat: geoPos.lat,
        lon: geoPos.lon,
      });
    };
    send();
    const t = window.setInterval(send, 5000);
    return () => window.clearInterval(t);
  }, [socket, activeRideId, geoPos]);

  const respondToOffer = async (accept: boolean) => {
    if (!incomingOffer) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    setRespondBusy(true);
    try {
      const res = await fetch(`/api/mobility/rides/${incomingOffer.rideId}/respond`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      });
      const data = (await res.json().catch(() => ({}))) as { conversationId?: number; message?: string };
      if (!res.ok) throw new Error(data.message || "No se pudo responder");
      setIncomingOpen(false);
      const snapOffer = incomingOffer;
      setIncomingOffer(null);
      if (accept && data.conversationId != null) {
        setActiveConversationId(data.conversationId);
        setActiveRideId(snapOffer.rideId);
        setActiveRideOffer(snapOffer);
        setActiveRideStarted(false);
        setSearchingClient(false);
        setPaymentConfirmed(snapOffer.paymentMethod === "genfeb");
        saveDriverActiveRideId(snapOffer.rideId);
        lastServiceRouteFetchRef.current = null;
      }
      if (!accept) {
        setActiveConversationId(null);
        setActiveRideId(null);
        setActiveRideOffer(null);
        setActiveRideStarted(false);
        setPaymentConfirmed(false);
      }
    } catch (e) {
      toast({
        title: "No se pudo responder a la oferta",
        description: e instanceof Error ? e.message : "Intenta de nuevo.",
        variant: "destructive",
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
      const res = await fetch(`/api/mobility/rides/${activeRideId}/start`, {
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
      const res = await fetch(`/api/mobility/rides/${encodeURIComponent(activeRideId)}/search-client`, {
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
      const res = await fetch(`/api/mobility/rides/${activeRideId}/confirm-payment`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setPaymentConfirmed(true);
    } catch {
      /* toast opcional */
    }
  };

  const completeRide = async () => {
    if (!activeRideId) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`/api/mobility/rides/${activeRideId}/complete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || "No se pudo completar el viaje");
      clearDriverActiveRideId();
      setActiveRideId(null);
      setActiveRideOffer(null);
      setActiveRideStarted(false);
      setPaymentConfirmed(false);
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
      activeRideIdRef.current = null;
      clearDriverActiveRideId();
      setActiveRideId(null);
      setActiveRideOffer(null);
      setActiveRideStarted(false);
      setPaymentConfirmed(false);
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
      // Backend espera from/to en formato lon,lat (OSRM).
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
      if (data?.durationSec != null) setServiceEtaSec(Number(data.durationSec));
      else setServiceEtaSec(null);
    } catch {
      setServiceRouteGeometry(lineGeoJson(g, serviceNavTarget));
      setServiceEtaSec(null);
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
    const stored = loadDriverActiveRideId();
    if (!stored) return;
    const token = localStorage.getItem("token");
    if (!token) {
      clearDriverActiveRideId();
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
          clearDriverActiveRideId();
          return;
        }
        const ride = (await res.json()) as MobilityRideHydration;
        if (ride.driverUserId !== user.id) {
          clearDriverActiveRideId();
          return;
        }
        if (ride.status !== "matched" && ride.status !== "in_progress") {
          clearDriverActiveRideId();
          return;
        }
        setActiveRideId(ride.id);
        setActiveRideOffer(mapApiRideToOffer(ride));
        setActiveRideStarted(ride.status === "in_progress");
        setSearchingClient(!!ride.driverSearchingClient);
        setPaymentConfirmed(ride.paymentMethod === "genfeb" || !!ride.paymentConfirmed);
      } catch {
        if (alive) clearDriverActiveRideId();
      }
    })();
    return () => {
      alive = false;
    };
  }, [authLoading, isAuthenticated, user?.id]);

  // Si no está verificado/vehículo, nunca permitir quedar en "recibiendo".
  useEffect(() => {
    if (canReceive) return;
    if (receiving) {
      setReceiving(false);
      saveReceiving(false);
    }
  }, [canReceive, receiving]);

  const onReceivingChange = (next: boolean) => {
    setReceiving(next);
    saveReceiving(next);
  };

  if (authLoading || !isAuthenticated || (providerLoading && !isAdmin) || (!provider && !isAdmin)) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">Cargando Car Go…</p>
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

  const driverWalletButton = (
    <Button
      type="button"
      variant="secondary"
      className="w-full justify-between border-border/80 bg-background/90 text-left text-xs h-auto min-h-10 py-2.5 gap-2"
      onClick={() => setDriverWalletOpen(true)}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Wallet className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">Saldo y deuda (Car Go)</span>
      </span>
      <span className={cn("shrink-0 font-semibold tabular-nums", walletBalance < 0 && "text-amber-600")}>
        {formatUsdLocal(walletBalance)}
      </span>
    </Button>
  );

  /** Móvil: solo deslizante; historial, chat y ajustes van en la barra inferior Go. */
  const controlsBlockMobile = (
    <div className="space-y-1.5">
      <SlideToCargoOnline
        receiving={receiving}
        onReceivingChange={onReceivingChange}
        disabled={!canReceive}
        slideNeedsExtraPush={slideNeedsExtraPush}
        className="border-border/70 bg-background/90 shadow-lg ring-1 ring-black/10 backdrop-blur-md dark:ring-white/10"
      />
    </div>
  );

  const activeServicePanel = activeRideOffer ? (
    <div className="rounded-2xl border border-border/70 bg-background/92 px-3 py-3 text-[11px] shadow-lg ring-1 ring-black/5 backdrop-blur-md dark:ring-white/10">
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
                {String(activeRideOffer.rider.name || "C").slice(0, 1).toUpperCase()}
              </div>
            )}
            <p className="min-w-0 truncate font-medium text-foreground">{activeRideOffer.rider.name}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
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
          {activeRideStarted && activeRideOffer.paymentMethod !== "genfeb" ? (
            paymentConfirmed ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-600/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-200">
                <BadgeCheck className="h-4 w-4" aria-hidden />
                Pago confirmado
              </span>
            ) : (
              <Button type="button" size="sm" variant="secondary" className="h-9 rounded-full px-3" onClick={() => void confirmPayment()}>
                Pago confirmado
              </Button>
            )
          ) : null}
          {activeRideStarted && (activeRideOffer.paymentMethod === "genfeb" || paymentConfirmed) ? (
            <Button type="button" size="sm" className="h-9 rounded-full px-3 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void completeRide()}>
              Terminar viaje
            </Button>
          ) : null}
        </div>
      </div>
      {activeRideOffer.rider?.phone ? (
        <div className="mt-2">
          <a
            href={`tel:${activeRideOffer.rider.phone}`}
            className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-3 py-1 font-medium text-primary"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden />
            Llamar
          </a>
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

  const controlsBlockDesktop = (
    <div className="space-y-3">
      <SlideToCargoOnline receiving={receiving} onReceivingChange={onReceivingChange} disabled={!canReceive} slideNeedsExtraPush={false} />
      {driverWalletButton}

      {!receiving || !canReceive ? (
        <p className="px-1 text-center text-[11px] text-muted-foreground">La brújula centra el mapa en tu posición.</p>
      ) : null}
    </div>
  );

  const headerBlock = (
    <header className="mb-3 shrink-0">
      {receiving && canReceive ? (
        <div className="rounded-2xl border border-emerald-500/45 bg-gradient-to-br from-emerald-600/15 via-background to-background p-4 shadow-sm dark:from-emerald-500/10">
          <div className="flex gap-3">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600/20 ring-2 ring-emerald-500/45">
              <Radio className="h-5 w-5 text-emerald-800 dark:text-emerald-100" aria-hidden />
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/25 [animation-duration:2.2s]" aria-hidden />
            </span>
            <div className="min-w-0 space-y-2">
              <h1 className="font-display text-xl font-bold tracking-tight text-emerald-950 dark:text-emerald-50 sm:text-2xl">
                Disponible para servicios Car Go
              </h1>
              <p className="text-sm leading-relaxed text-emerald-950/90 dark:text-emerald-50/90">
                No recibirás cada pedido al instante: cuando el sistema te asigne uno, lo verás en el mapa y aquí. Mantén el
                GPS activo.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Car Go</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mapa en vivo y conexión para recibir solicitudes Car Go. Desliza el control para activar o detener la recepción de
            viajes.
          </p>
        </>
      )}
      {!canReceive && (
        <p className="mt-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {isAdmin
            ? "Modo admin: puedes ver la vista de driver, pero necesitas un vehículo registrado y verificación para recibir viajes."
            : !provider?.isVerified
              ? "Aún no estás verificado (documentos + $15). Completa la verificación para poder recibir viajes."
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
        "max-md:h-full max-md:min-h-0 max-md:overflow-hidden max-md:pb-0"
      )}
    >
      {/* Móvil: mapa llena el área de main (entre cabecera shell y barra inferior), sin scroll ni “doble capa”. */}
      {!isMdUp && (
        <div
          className={cn(
            "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-[box-shadow] duration-300 md:hidden max-md:h-[calc(100vh-8.25rem)] max-md:h-[calc(100svh-8.25rem)] max-md:min-h-[calc(100vh-8.25rem)] max-md:min-h-[calc(100svh-8.25rem)]",
            receiving && canReceive && "shadow-[inset_0_0_0_2px_rgba(16,185,129,0.35)]"
          )}
        >
          <div className="pointer-events-auto absolute inset-0 z-0 overflow-hidden bg-muted/30">
            <DriverCargoMap
              fullscreen
              showRecenter={false}
              vehicleType={providerVehicle?.vehicle_type}
              receiving={receiving}
              start={null}
              end={serviceNavTarget}
              routeGeometry={serviceRouteGeometry}
              routeRenderKey={serviceRouteRenderKey}
            />
          </div>
          <div className="relative z-30 flex min-h-0 flex-1 flex-col pointer-events-none" >
            <div className="pointer-events-auto shrink-0 space-y-1.5 px-3 pt-2">
              {receiving && canReceive ? (
                <div className="rounded-xl border border-emerald-500/45 bg-background/85 p-2 shadow-lg ring-1 ring-black/5 backdrop-blur-md dark:bg-emerald-500/10 dark:ring-white/10">
                  <div className="flex items-start gap-2">
                    <span className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600/20 ring-1 ring-emerald-500/40 dark:bg-emerald-400/15">
                      <Radio className="h-3.5 w-3.5 text-emerald-800 dark:text-emerald-100" aria-hidden />
                      <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/20 [animation-duration:2.5s]" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-display text-sm font-bold leading-tight text-emerald-950 dark:text-emerald-50">
                        Disponible · Car Go
                      </p>
                      <p className="text-[10px] leading-snug text-emerald-950/80 dark:text-emerald-50/85">
                        Los pedidos no son instantáneos. GPS encendido. Para salir de línea, desliza abajo.
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
          {/* Controles anclados encima de la barra inferior (sin tapar el mapa). */}
          <div style={{ paddingBottom: slideNeedsExtraPush ? "10vmin" : "27vmin" }}>
            <div className="pointer-events-none absolute inset-x-0 bottom-16 z-40 px-3 pb-[calc(env(safe-area-inset-bottom,0px))]">
              <div ref={slideDockRef} className="pointer-events-auto pt-2">
                {activeRideOffer ? activeServicePanel : controlsBlockMobile}
              </div>
            </div>
          </div>
          <DriverTripHistorySheet
            trips={trips}
            open={historySheetOpen}
            onOpenChange={setHistorySheetOpen}
          />
        </div>
      )}

      {/* Escritorio / tablet: layout en columna clásico. */}
      <div
        className={cn(
          "container mx-auto flex max-w-3xl flex-1 flex-col px-3 pt-4 sm:px-4",
          !isMdUp && "hidden md:flex"
        )}
      >
        {headerBlock}

        <div className="min-h-0 flex-1">
          <DriverCargoMap
            vehicleType={providerVehicle?.vehicle_type}
            receiving={receiving}
            start={null}
            end={activeRideOffer ? serviceNavTarget : null}
            routeGeometry={activeRideOffer ? serviceRouteGeometry : null}
            routeRenderKey={serviceRouteRenderKey}
          />
        </div>

        <div className="sticky bottom-16 z-20 mt-4 shrink-0 space-y-3 bg-background/85 pb-3 pt-2 backdrop-blur-sm">
          {activeRideOffer ? activeServicePanel : null}
          {controlsBlockDesktop}
        </div>
      </div>

      <Dialog open={driverWalletOpen} onOpenChange={setDriverWalletOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Saldo GenFeb · Car Go</DialogTitle>
            <DialogDescription>
              Con pagos en efectivo o transferencia, GenFeb descuenta su comisión de tu cartera. Puedes quedar con saldo
              negativo hasta un límite; al alcanzarlo, solo se te ofrecerán viajes con pago en Saldo GenFeb hasta
              regularizar.
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
        open={incomingOpen}
        offer={incomingOffer}
        busy={respondBusy}
        driverPos={geoPos}
        onAccept={() => void respondToOffer(true)}
        onDecline={() => void respondToOffer(false)}
      />

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

      <Dialog open={cancelServiceOpen} onOpenChange={setCancelServiceOpen}>
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

      <Dialog open={rateDialogOpen} onOpenChange={() => { /* bloqueado */ }}>
        <DialogContent
          hideClose
          className="sm:max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>¿Cómo se portó el Cliente?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Califica a <span className="font-medium text-foreground">{rateTargetRef.current?.targetName ?? "tu cliente"}</span>.
            </p>
            <div className="flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((v) => {
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

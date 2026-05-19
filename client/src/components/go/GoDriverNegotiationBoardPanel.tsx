import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJsonObject } from "geojson";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, MapPin, Minus, Plus, RefreshCw, Star, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TaxiRouteMap } from "@/components/taxi/TaxiRouteMap";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useSocket } from "@/hooks/use-socket";
import { cn } from "@/lib/utils";
import { summarizeRouteLabel } from "@/lib/summarize-route-label";
import { MOBILITY_UI } from "@shared/mobility-ui-labels";
import {
  DRIVER_NEGOTIATION_OFFER_ALREADY_SENT_MESSAGE,
  GO_NEGOTIATION_BOARD_POLL_MS,
  GO_NEGOTIATION_OFFER_WINDOW_MS,
} from "@shared/mobility-negotiation";
import {
  NEGOTIATION_MATCH_MAP_PACK,
  negotiationBoardTabsForProviderVehicle,
} from "@shared/go-negotiation-board-segments";

export type NegotiationBoardRow = {
  rideId: string;
  createdAt: number;
  start: { lat: number; lon: number; label: string };
  end: { lat: number; lon: number; label: string };
  distanceM: number;
  durationSec: number;
  vehicleType: string;
  paymentMethod: string;
  suggestedUsd: number;
  estimatedUsd: number;
  expiresAt: number;
  petEnabled?: boolean;
  routeGeometry?: GeoJsonObject | null;
  rider: {
    name: string;
    profileImageUrl: string | null;
    /** Viene del backend en `buildRiderPublic`; opcional en respuestas antiguas. */
    rating?: number;
    ratingCount?: number;
  };
  hasMyOffer: boolean;
  myOfferAmountUsd: number | null;
  /** Origen del servicio para POST y etiqueta en UI. */
  serviceModule: "cargo" | "pack";
};

function formatKm(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

function formatUsd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `$${v.toFixed(2)}`;
}

function roundToCents(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function formatWaitLabel(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${r.toString().padStart(2, "0")}s`;
}

type BoardApiPayload = {
  offers?: Omit<NegotiationBoardRow, "serviceModule">[];
  negotiationWindowMs?: number;
  message?: string;
};

type Props = {
  active?: boolean;
  providerVehicleType?: string;
  providerIsPetFriendly?: boolean;
  onOfferSubmitted?: (rideId: string, amountUsd: number, module: "cargo" | "pack") => void;
  canSubmitNegotiationOffers?: boolean;
  /** Mensaje cuando no puede enviar ofertas (p. ej. suscripción vencida). */
  submitBlockedHint?: string;
};

function serviceModuleLabel(m: "cargo" | "pack"): string {
  return m === "pack" ? MOBILITY_UI.delivery : MOBILITY_UI.taxiService;
}

export function GoDriverNegotiationBoardPanel({
  active = true,
  providerVehicleType,
  providerIsPetFriendly = false,
  onOfferSubmitted,
  canSubmitNegotiationOffers = true,
  submitBlockedHint,
}: Props) {
  const { toast } = useToast();
  const { socket } = useSocket();
  const firstBoardLoad = useRef(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [rows, setRows] = useState<NegotiationBoardRow[]>([]);
  const [negotiationWindowMs, setNegotiationWindowMs] = useState(GO_NEGOTIATION_OFFER_WINDOW_MS);
  const [busyRideId, setBusyRideId] = useState<string | null>(null);
  const [draftByRideId, setDraftByRideId] = useState<Record<string, number>>({});
  const [mapRow, setMapRow] = useState<NegotiationBoardRow | null>(null);
  const [tick, setTick] = useState(0);

  const tabs = useMemo(
    () => negotiationBoardTabsForProviderVehicle(providerVehicleType, providerIsPetFriendly),
    [providerVehicleType, providerIsPetFriendly]
  );

  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  useEffect(() => {
    if (tabs.length === 0) {
      setSelectedSegmentId(null);
      return;
    }
    setSelectedSegmentId((cur) => {
      if (cur && tabs.some((t) => t.id === cur)) return cur;
      return tabs[0]!.id;
    });
  }, [tabs]);

  useEffect(() => {
    if (!selectedSegmentId) return;
    setRows([]);
    firstBoardLoad.current = true;
  }, [selectedSegmentId]);

  const fetchBoard = useCallback(
    async (opts?: { manual?: boolean }) => {
      const token = localStorage.getItem("token");
      const segment = selectedSegmentId;
      if (!token || !segment) {
        setRows([]);
        setLoadFailed(false);
        setLoading(false);
        firstBoardLoad.current = true;
        return;
      }
      if (opts?.manual) setRefreshing(true);
      else if (firstBoardLoad.current) setLoading(true);
      try {
        const q = `?vehicleSegment=${encodeURIComponent(segment)}`;
        const fetchPack = Object.prototype.hasOwnProperty.call(NEGOTIATION_MATCH_MAP_PACK, segment);
        const cargoRes = await fetch(`/api/mobility/rides/negotiation-board${q}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const packRes = fetchPack
          ? await fetch(`/api/pack/rides/negotiation-board${q}`, { headers: { Authorization: `Bearer ${token}` } })
          : null;

        const cargoData = (await cargoRes.json().catch(() => ({}))) as BoardApiPayload;
        const packData = packRes
          ? ((await packRes.json().catch(() => ({}))) as BoardApiPayload)
          : { offers: [] };

        if (!cargoRes.ok) throw new Error(cargoData.message || "No se pudo cargar taxi");
        if (packRes && !packRes.ok) throw new Error(packData.message || "No se pudo cargar delivery");

        const win =
          typeof cargoData.negotiationWindowMs === "number"
            ? cargoData.negotiationWindowMs
            : typeof packData.negotiationWindowMs === "number"
              ? packData.negotiationWindowMs
              : GO_NEGOTIATION_OFFER_WINDOW_MS;
        setNegotiationWindowMs(win);

        const cargoRows = (Array.isArray(cargoData.offers) ? cargoData.offers : []).map((r) => ({
          ...r,
          serviceModule: "cargo" as const,
        }));
        const packRows = (Array.isArray(packData.offers) ? packData.offers : []).map((r) => ({
          ...r,
          serviceModule: "pack" as const,
        }));

        const merged = [...cargoRows, ...packRows].sort((a, b) => a.createdAt - b.createdAt);
        setRows(merged);
        setLoadFailed(false);
      } catch {
        setRows([]);
        setLoadFailed(true);
      } finally {
        if (firstBoardLoad.current) {
          firstBoardLoad.current = false;
          setLoading(false);
        }
        setRefreshing(false);
      }
    },
    [selectedSegmentId]
  );

  useEffect(() => {
    if (!active || !selectedSegmentId) return;
    void fetchBoard();
    const t = window.setInterval(() => void fetchBoard(), GO_NEGOTIATION_BOARD_POLL_MS);
    return () => window.clearInterval(t);
  }, [active, selectedSegmentId, fetchBoard]);

  /** Retiros/rechazos en tiempo real: quitar filas sin esperar al polling. */
  useEffect(() => {
    if (!socket || !active) return;
    const refresh = () => void fetchBoard();
    socket.on("cargo:ride:negotiation:offer_removed", refresh);
    socket.on("pack:ride:negotiation:offer_removed", refresh);
    return () => {
      socket.off("cargo:ride:negotiation:offer_removed", refresh);
      socket.off("pack:ride:negotiation:offer_removed", refresh);
    };
  }, [socket, active, fetchBoard]);

  useEffect(() => {
    if (!active || rows.length === 0) return;
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [active, rows.length]);

  const submitOffer = async (rideId: string, amountUsd: number, serviceModule: "cargo" | "pack") => {
    if (!canSubmitNegotiationOffers) {
      toast({
        title: submitBlockedHint ? "Suscripción vencida" : "Perfil no verificado",
        description:
          submitBlockedHint ??
          "Completa la verificación profesional para enviar montos o contraofertas.",
        variant: "destructive",
      });
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) {
      toast({ title: "Sesión", description: "Inicia sesión de nuevo.", variant: "destructive" });
      return;
    }
    const apiBase = serviceModule === "pack" ? "/api/pack" : "/api/mobility";
    setBusyRideId(rideId);
    try {
      const res = await fetch(`${apiBase}/rides/${encodeURIComponent(rideId)}/negotiation/driver-offer`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd: roundToCents(amountUsd) }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || "No se pudo enviar la oferta");
      onOfferSubmitted?.(rideId, roundToCents(amountUsd), serviceModule);
      await fetchBoard();
      toast({ title: "Oferta enviada", description: "El cliente verá tu propuesta en su lista." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Intenta de nuevo";
      toast({
        title: msg === DRIVER_NEGOTIATION_OFFER_ALREADY_SENT_MESSAGE ? "Propuesta ya enviada" : "No se pudo enviar",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setBusyRideId(null);
    }
  };

  const visibleRows = useMemo(() => {
    const t = Date.now();
    return rows.filter((r) => {
      const until = typeof r.expiresAt === "number" ? r.expiresAt : Number(r.expiresAt);
      return Number.isFinite(until) && until > t - 2000;
    });
  }, [rows, tick]);

  const riderInitial = useCallback((name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
    }
    return (parts[0] ?? "?").slice(0, 2).toUpperCase();
  }, []);

  if (tabs.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <p className="rounded-xl border border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
          Registra tu vehículo en tu perfil para ver las vistas de regateo (moto, carro, camioneta…).
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 rounded-lg border border-amber-500/35 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-snug text-amber-950/90 dark:text-amber-50/90 sm:rounded-xl sm:px-3 sm:py-2 sm:text-[11px]">
          <span className="inline-flex items-center gap-1 font-semibold">
            <Tags className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden />
            Tablero de regateo
          </span>
          <p className="mt-0.5 text-muted-foreground dark:text-amber-50/80 sm:mt-1">
            <span className="max-md:line-clamp-2 max-md:leading-tight">
              <span className="md:hidden">
                Vistas según tu vehículo; cada tarjeta indica {MOBILITY_UI.taxiService} o {MOBILITY_UI.delivery}. Desliza
                hacia abajo para más ofertas.
              </span>
              <span className="hidden md:inline">
                Elige tu vista (solo las que coinciden con tu vehículo). En cada tarjeta verás si el pedido es de{" "}
                {MOBILITY_UI.taxiService} o {MOBILITY_UI.delivery}.
              </span>
            </span>
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2 text-xs sm:h-9 sm:gap-2 sm:px-3 sm:text-sm"
          disabled={refreshing || loading || !selectedSegmentId}
          onClick={() => void fetchBoard({ manual: true })}
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
          Actualizar
        </Button>
      </div>

      <div className="flex shrink-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            type="button"
            size="sm"
            variant={tab.id === selectedSegmentId ? "default" : "secondary"}
            className="shrink-0 rounded-full"
            onClick={() => setSelectedSegmentId(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {!canSubmitNegotiationOffers ? (
        <div
          className="shrink-0 rounded-xl border border-border bg-muted/40 px-3 py-2 text-[11px] leading-snug text-muted-foreground"
          role="status"
        >
          {submitBlockedHint ??
            "Puedes ver las solicitudes. Para enviar un monto o contraoferta necesitas el perfil profesional verificado."}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Cargando solicitudes…
          </div>
        ) : loadFailed ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-4 text-sm text-muted-foreground">
            No pudimos cargar la lista. Comprueba tu conexión o pulsa «Actualizar».
          </p>
        ) : visibleRows.length === 0 ? (
          <p className="rounded-xl border border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
            {rows.length > 0
              ? "Las solicitudes visibles acaban de caducar o el cliente canceló."
              : "No hay solicitudes de regateo en esta vista ahora mismo."}
          </p>
        ) : (
          <div
            className={cn(
              "flex min-h-[200px] flex-1 touch-pan-y flex-col gap-3 overflow-y-auto overflow-x-hidden overscroll-y-contain pb-2 pt-0.5 [scrollbar-width:thin]",
              "md:h-full md:min-h-[280px] md:flex-row md:gap-4 md:overflow-y-hidden md:overflow-x-auto md:overscroll-x-contain md:pb-2 md:pl-0.5 md:pr-1 md:pt-1"
            )}
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {visibleRows.map((o) => {
                const draft =
                  typeof draftByRideId[o.rideId] === "number" ? draftByRideId[o.rideId]! : o.estimatedUsd;
                const busy = busyRideId === o.rideId;
                const driverOfferCommitted = o.hasMyOffer === true;
                const actionsLocked = !canSubmitNegotiationOffers || busy || driverOfferCommitted;
                const now = Date.now();
                const until = typeof o.expiresAt === "number" ? o.expiresAt : Number(o.expiresAt);
                const remainingMs = Math.max(0, until - now);
                const spanMs = Math.max(
                  30_000,
                  Math.min(negotiationWindowMs, Math.max(1, until - o.createdAt))
                );
                const barPct = Math.min(100, Math.max(0, (remainingMs / spanMs) * 100));
                const listKey = `${o.serviceModule}-${o.rideId}`;
                const startShort = summarizeRouteLabel(o.start.label, 30);
                const endShort = summarizeRouteLabel(o.end.label, 30);
                const riderName = (o.rider?.name ?? "").trim() || "Cliente";
                const riderRating = typeof o.rider?.rating === "number" && Number.isFinite(o.rider.rating) ? o.rider.rating : 0;
                const riderRatingCount =
                  typeof o.rider?.ratingCount === "number" && Number.isFinite(o.rider.ratingCount)
                    ? Math.max(0, Math.round(o.rider.ratingCount))
                    : 0;

                return (
                  <motion.article
                    layout
                    key={listKey}
                    initial={{ opacity: 0, scale: 0.97, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, x: -28, transition: { duration: 0.38, ease: [0.4, 0, 0.2, 1] } }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    className={cn(
                      "flex w-full max-w-full shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm",
                      "min-h-0 md:h-full md:min-h-[240px] md:w-[min(92vw,380px)] md:rounded-xl md:max-w-none md:shadow-md lg:w-[400px]"
                    )}
                  >
                    <div className="flex min-h-0 flex-1 flex-col gap-1 p-1.5 sm:gap-1.5 sm:p-2 md:gap-2 md:p-2.5">
                      <div className="flex items-center justify-between gap-1.5">
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide sm:px-2 sm:py-0.5 sm:text-[10px]",
                            o.serviceModule === "pack"
                              ? "bg-violet-500/15 text-violet-800 dark:text-violet-200"
                              : "bg-sky-500/15 text-sky-900 dark:text-sky-100"
                          )}
                        >
                          {serviceModuleLabel(o.serviceModule)}
                        </span>
                        <span className="text-[9px] text-muted-foreground sm:text-[10px]">{o.vehicleType}</span>
                      </div>

                      <div className="flex items-start gap-1.5 sm:gap-2">
                        <Avatar className="h-8 w-8 shrink-0 border border-border/80 sm:h-9 sm:w-9">
                          {o.rider?.profileImageUrl ? (
                            <AvatarImage src={o.rider.profileImageUrl} alt="" className="object-cover" />
                          ) : null}
                          <AvatarFallback className="text-[9px] font-semibold sm:text-[10px]">
                            {riderInitial(riderName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-[11px] font-semibold leading-snug text-foreground sm:text-xs">
                            {riderName}
                          </p>
                          <div
                            className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0 text-[9px] text-muted-foreground sm:text-[10px]"
                            aria-label={
                              riderRatingCount > 0
                                ? `Valoración ${riderRating.toFixed(1)} de 5, ${riderRatingCount} reseñas`
                                : "Sin reseñas aún"
                            }
                          >
                            <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                              <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500 dark:fill-amber-300 dark:text-amber-200" aria-hidden />
                              <span className="font-semibold tabular-nums text-foreground">
                                {riderRatingCount > 0 ? riderRating.toFixed(1) : "—"}
                              </span>
                            </span>
                            {riderRatingCount > 0 ? (
                              <span className="tabular-nums">({riderRatingCount})</span>
                            ) : (
                              <span className="text-muted-foreground/90">Sin reseñas</span>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-1 text-[9px] leading-tight text-muted-foreground sm:text-[10px]" title={o.start.label}>
                            <span className="font-medium text-foreground/80">A</span> {startShort}
                          </p>
                          <p className="line-clamp-1 text-[9px] leading-tight text-muted-foreground sm:text-[10px]" title={o.end.label}>
                            <span className="font-medium text-foreground/80">B</span> {endShort}
                          </p>
                          <p className="mt-0.5 text-[10px] font-medium tabular-nums text-foreground sm:text-[11px]">
                            {formatKm(o.distanceM)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1 sm:gap-1.5">
                        <div className="rounded-md border border-border bg-muted/30 px-1.5 py-1 sm:rounded-lg sm:px-2 sm:py-1.5">
                          <p className="text-[9px] text-muted-foreground sm:text-[10px]">Referencia</p>
                          <p className="text-xs font-semibold tabular-nums leading-none text-foreground sm:text-sm">
                            {formatUsd(o.suggestedUsd)}
                          </p>
                        </div>
                        <div className="rounded-md border border-primary/25 bg-primary/5 px-1.5 py-1 sm:rounded-lg sm:px-2 sm:py-1.5">
                          <p className="text-[9px] text-muted-foreground sm:text-[10px]">Oferta</p>
                          <p className="text-xs font-semibold tabular-nums leading-none text-foreground sm:text-sm">
                            {formatUsd(o.estimatedUsd)}
                          </p>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 w-full shrink-0 gap-1 px-2 text-[10px] sm:h-8 sm:gap-1.5 sm:text-xs md:h-9 md:text-sm"
                        onClick={() => setMapRow(o)}
                      >
                        <MapPin className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" aria-hidden />
                        Mapa
                      </Button>

                      {o.hasMyOffer ? (
                        <p className="text-[10px] font-medium leading-tight text-emerald-700 dark:text-emerald-300 sm:text-[11px]">
                          Tu oferta: {formatUsd(o.myOfferAmountUsd ?? 0)} · esperando al cliente. No podés enviar otra
                          propuesta en este viaje.
                        </p>
                      ) : null}

                      <div
                        className={cn(
                          "mt-auto flex flex-col gap-1 border-t border-border/60 pt-1 sm:gap-1.5 sm:pt-1.5 md:gap-2 md:pt-2",
                          driverOfferCommitted && "opacity-60"
                        )}
                        aria-disabled={driverOfferCommitted}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-[9px] text-muted-foreground sm:text-[10px]">Tu monto</span>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8"
                              disabled={actionsLocked}
                              onClick={() =>
                                setDraftByRideId((m) => ({
                                  ...m,
                                  [o.rideId]: roundToCents(Math.max(0.01, draft - 0.25)),
                                }))
                              }
                              aria-label="Bajar 25 centavos"
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="min-w-[3.75rem] text-center text-[11px] font-semibold tabular-nums sm:min-w-[4.25rem] sm:text-xs md:text-sm">
                              {formatUsd(draft)}
                            </span>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8"
                              disabled={actionsLocked}
                              onClick={() =>
                                setDraftByRideId((m) => ({ ...m, [o.rideId]: roundToCents(draft + 0.25) }))
                              }
                              aria-label="Subir 25 centavos"
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 sm:flex-row sm:gap-1.5 md:gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-7 flex-1 px-2 text-[10px] sm:h-8 sm:text-xs md:h-9 md:text-sm"
                            disabled={actionsLocked}
                            onClick={() => void submitOffer(o.rideId, draft, o.serviceModule)}
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                            Enviar monto
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className={cn(
                              "h-7 flex-1 bg-emerald-600 px-2 text-[10px] text-white hover:bg-emerald-700 sm:h-8 sm:text-xs md:h-9 md:text-sm"
                            )}
                            disabled={actionsLocked}
                            onClick={() => void submitOffer(o.rideId, o.estimatedUsd, o.serviceModule)}
                          >
                            <span className="md:hidden">Aceptar oferta</span>
                            <span className="hidden md:inline">Aceptar precio del cliente</span>
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 border-t border-border bg-muted/25 px-1.5 py-1 sm:px-2 sm:py-1.5 md:px-3 md:py-2">
                      <div className="mb-0.5 flex items-center justify-between gap-1.5 text-[9px] text-muted-foreground sm:mb-1 sm:text-[10px]">
                        <span>Ventana</span>
                        <span className="tabular-nums font-medium text-foreground">{formatWaitLabel(remainingMs)}</span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-muted sm:h-1.5 md:h-2">
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      <Dialog open={mapRow != null} onOpenChange={(open) => (!open ? setMapRow(null) : null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ruta · {mapRow ? serviceModuleLabel(mapRow.serviceModule) : ""}</DialogTitle>
            {mapRow ? (
              <DialogDescription asChild>
                <div className="max-h-[30vh] space-y-1.5 overflow-y-auto text-left text-xs leading-snug text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">A:</span> {mapRow.start.label}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">B:</span> {mapRow.end.label}
                  </p>
                </div>
              </DialogDescription>
            ) : null}
          </DialogHeader>
          {mapRow ? (
            <div className="mt-2 h-[min(50vh,420px)] overflow-hidden rounded-xl border border-border">
              <TaxiRouteMap
                fullscreen
                syncDefaultView={false}
                defaultCenter={[mapRow.start.lat, mapRow.start.lon]}
                defaultZoom={13}
                start={mapRow.start}
                end={mapRow.end}
                routeGeometry={(mapRow.routeGeometry ?? null) as GeoJsonObject | null}
                onMapPick={() => {}}
                suppressMapPick
                wrapperClassName="!rounded-none !border-0 !shadow-none h-full w-full"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2, Minus, Plus, ArrowLeft, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TaxiRouteMap } from "@/components/taxi/TaxiRouteMap";
import type { GeoJsonObject } from "geojson";

type MarketOffer = {
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
  rider: { name: string; profileImageUrl: string | null };
};

function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

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

export function GoDriverOffersBoard(props: { module: "cargo" | "pack" }) {
  const { module } = props;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState<MarketOffer[]>([]);
  const [busyRideId, setBusyRideId] = useState<string | null>(null);
  const [counterDraft, setCounterDraft] = useState<Record<string, number>>({});
  const [pendingByRideId, setPendingByRideId] = useState<Record<string, number>>({});
  const [geoPos, setGeoPos] = useState<{ lat: number; lon: number } | null>(null);
  const [mapOffer, setMapOffer] = useState<MarketOffer | null>(null);

  const apiBase = module === "pack" ? "/api/pack" : "/api/mobility";
  const backHref = module === "pack" ? "/go/delivery/driver" : "/go/taxi/driver";

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        setLoading(false);
        setOffers([]);
        return;
      }
      try {
        const res = await fetch(`${apiBase}/rides/market`, { headers: { Authorization: `Bearer ${token}` } });
        const data = (await res.json().catch(() => ({}))) as { offers?: MarketOffer[]; message?: string };
        if (!res.ok) throw new Error(data.message || "No se pudo cargar ofertas");
        if (cancelled) return;
        setOffers(Array.isArray(data.offers) ? data.offers : []);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setLoading(false);
      }
    };
    void tick();
    const t = window.setInterval(tick, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [apiBase]);

  // Posición del driver para ordenar por cercanía (independiente de "recibiendo").
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setGeoPos({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const now = Date.now();
  const visible = useMemo(() => {
    const rows = offers.filter((o) => typeof o.expiresAt === "number" && o.expiresAt > now);
    if (!geoPos) return rows;
    return [...rows].sort((a, b) => haversineM(geoPos, a.start) - haversineM(geoPos, b.start));
  }, [offers, now, geoPos]);

  const accept = async (rideId: string, amountUsd: number) => {
    // Importante: no hacemos match directo para evitar carreras de 2 drivers.
    // Enviar una "oferta" al usuario (mismo monto que el cliente propuso) y esperar que el usuario la acepte.
    await counter(rideId, amountUsd);
    toast({ title: "Enviado al usuario", description: "El usuario debe aceptar tu oferta para asignarte el servicio." });
  };

  const counter = async (rideId: string, amountUsd: number) => {
    const token = localStorage.getItem("token");
    if (!token) return;
    setBusyRideId(rideId);
    try {
      const res = await fetch(`${apiBase}/rides/${rideId}/counteroffer`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok) throw new Error(data.message || "No se pudo enviar contraoferta");
      toast({ title: "Contraoferta enviada", description: `Enviada por ${formatUsd(amountUsd)}.` });
      setPendingByRideId((m) => ({ ...m, [rideId]: Date.now() + 60_000 }));
    } catch (e) {
      toast({
        title: "No se pudo contraofertar",
        description: e instanceof Error ? e.message : "Intenta de nuevo",
        variant: "destructive",
      });
    } finally {
      setBusyRideId(null);
    }
  };

  useEffect(() => {
    if (!pendingByRideId || Object.keys(pendingByRideId).length === 0) return;
    const t = window.setInterval(() => {
      const now = Date.now();
      setPendingByRideId((m) => {
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(m)) {
          if (v > now) next[k] = v;
        }
        return next;
      });
    }, 300);
    return () => window.clearInterval(t);
  }, [pendingByRideId]);

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild className="gap-2">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Volver
          </Link>
        </Button>
        <h1 className="text-base font-semibold text-foreground">Ofertas por negociar</h1>
        <div className="w-[74px]" aria-hidden />
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Aquí aparecen solicitudes donde el cliente envió una oferta distinta a la referencia sugerida. Las más antiguas salen arriba.
      </p>

      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando ofertas…
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-4 text-sm text-muted-foreground">
            No hay ofertas por negociar ahora.
          </div>
        ) : (
          visible.map((o) => {
            const draft = typeof counterDraft[o.rideId] === "number" ? counterDraft[o.rideId] : o.estimatedUsd;
            const pendingUntil = pendingByRideId[o.rideId] ?? 0;
            const pendingLeftSec = pendingUntil > 0 ? Math.max(0, Math.ceil((pendingUntil - Date.now()) / 1000)) : 0;
            const distToPickupM = geoPos ? haversineM(geoPos, o.start) : null;
            return (
              <div
                key={o.rideId}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm cursor-pointer hover:bg-muted/20 transition-colors"
                onClick={() => setMapOffer(o)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setMapOffer(o);
                }}
              >
                <div className="flex items-start gap-3">
                  {o.rider?.profileImageUrl ? (
                    <img src={o.rider.profileImageUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                      {(o.rider?.name || "U").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{o.rider?.name || "Usuario"}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatKm(o.distanceM)} · {o.start.label} → {o.end.label}
                        </p>
                        {distToPickupM != null ? (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            Cerca de ti: <span className="font-medium text-foreground">{formatKm(distToPickupM)}</span>
                          </p>
                        ) : null}
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {Math.max(0, Math.ceil((o.expiresAt - Date.now()) / 1000))}s
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">Referencia sugerida</p>
                        <p className="font-semibold tabular-nums text-foreground">{formatUsd(o.suggestedUsd)}</p>
                      </div>
                      <div className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">Oferta del Cliente</p>
                        <p className="font-semibold tabular-nums text-foreground">{formatUsd(o.estimatedUsd)}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Contraoferta</span>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            onClick={() =>
                              setCounterDraft((m) => ({ ...m, [o.rideId]: roundToCents(Math.max(0, draft - 0.1)) }))
                            }
                          >
                            <Minus className="h-4 w-4" aria-hidden />
                          </Button>
                          <span className="min-w-[84px] text-right text-sm font-semibold tabular-nums text-foreground">
                            {formatUsd(draft)}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            onClick={() => setCounterDraft((m) => ({ ...m, [o.rideId]: roundToCents(draft + 0.1) }))}
                          >
                            <Plus className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className={cn("w-full sm:w-auto")}
                          disabled={busyRideId === o.rideId}
                          onClick={() => counter(o.rideId, draft)}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          Contraofertar
                        </Button>
                        <Button
                          type="button"
                          className={cn("w-full sm:w-auto")}
                          disabled={busyRideId === o.rideId}
                          onClick={() => accept(o.rideId, o.estimatedUsd)}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          Aceptar oferta
                        </Button>
                      </div>
                    </div>

                    {pendingUntil > Date.now() ? (
                      <div className="mt-3 flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        <Clock className="h-4 w-4" aria-hidden />
                        <span>
                          Esperando respuesta del Usuario…{" "}
                          <span className="font-semibold tabular-nums text-foreground">{pendingLeftSec}s</span>
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Dialog open={mapOffer != null} onOpenChange={(open) => (!open ? setMapOffer(null) : null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Ruta del servicio</DialogTitle>
          </DialogHeader>
          {mapOffer ? (
            <div className="mt-2 space-y-3">
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="h-[min(52vh,520px)] w-full">
                  <TaxiRouteMap
                    fullscreen
                    syncDefaultView={false}
                    defaultCenter={[mapOffer.start.lat, mapOffer.start.lon]}
                    defaultZoom={13}
                    start={mapOffer.start}
                    end={mapOffer.end}
                    routeGeometry={(mapOffer as any).routeGeometry as GeoJsonObject | null}
                    onMapPick={() => {}}
                    suppressMapPick
                    wrapperClassName="!rounded-none !border-0 !shadow-none h-full w-full"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button variant="outline" onClick={() => setMapOffer(null)}>
                  Volver
                </Button>
                <div className="text-sm text-muted-foreground">
                  {formatKm(mapOffer.distanceM)} · {mapOffer.start.label} → {mapOffer.end.label}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}


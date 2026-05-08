import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Car, LayoutDashboard, Loader2, Route, Star } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCategories, useCurrentProvider } from "@/hooks/use-mango-data";
import { isCarGoProvider } from "@shared/provider-car-go";
import { resolveVehicleKind } from "@/components/driver/cargo-map-markers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadTripLog, type CargoDriverTripLog } from "@/lib/cargo-driver-storage";
import { ThemeAppearanceCard } from "@/components/ThemeAppearanceCard";
import { SubscriptionStatusButton } from "@/components/SubscriptionStatusButton";

const VEHICLE_LABEL: Record<string, string> = {
  motorcycle: "Moto",
  car: "Carro",
  pickup_truck: "Camioneta",
  truck: "Camión",
};

export default function CargoDriverSettings() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: provider, isLoading: providerLoading } = useCurrentProvider();
  const { data: categories = [] } = useCategories();
  const [localTrips, setLocalTrips] = useState<CargoDriverTripLog[]>([]);

  const allowed = !!provider?.isVerified && isCarGoProvider(provider, categories);

  const { data: vehicle, isLoading: vehicleLoading } = useQuery({
    queryKey: ["/api/me/provider-vehicle"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/me/provider-vehicle", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 401) return null;
      if (!res.ok) return null;
      return res.json() as Promise<{
        vehicle_type: string;
        brand?: string | null;
        model?: string | null;
        license_plate?: string | null;
        model_year?: number | null;
      } | null>;
    },
    enabled: isAuthenticated && !authLoading,
  });

  useEffect(() => {
    // Preferir email para evitar colisiones si el backend cambia el tipo de id.
    const accountKey =
      (user as any)?.email != null ? String((user as any).email) : (user as any)?.id != null ? String((user as any).id) : null;
    setLocalTrips(loadTripLog(accountKey));
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setLocation("/");
      return;
    }
    if (providerLoading) return;
    if (!provider) {
      setLocation("/become-pro");
      return;
    }
    if (!allowed) setLocation("/");
  }, [authLoading, isAuthenticated, providerLoading, provider, allowed, setLocation]);

  const tripCount = localTrips.length;

  const rating = useMemo(() => {
    const r = provider && typeof (provider as { rating?: string | number }).rating !== "undefined"
      ? Number((provider as { rating?: string }).rating)
      : NaN;
    return Number.isFinite(r) ? r : null;
  }, [provider]);

  const profileUrl =
    (user as { profileImageUrl?: string | null } | null)?.profileImageUrl?.trim() || undefined;
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    (user as { name?: string } | undefined)?.name ||
    user?.email ||
    "Conductor";

  const vehicleLabel = (() => {
    const k = resolveVehicleKind(vehicle?.vehicle_type);
    return VEHICLE_LABEL[k] ?? "Vehículo";
  })();

  if (authLoading || !isAuthenticated || providerLoading || !provider) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 bg-gradient-to-b from-muted/20 to-background pb-10">
      <div className="container mx-auto max-w-lg px-4 pt-6">
        <div className="mb-6 flex min-w-0 items-start gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" asChild>
            <Link href="/go/taxi/driver" aria-label="Volver a Taxi">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold text-foreground">Taxi — Configuración</h1>
            <p className="text-sm text-muted-foreground">Tu panel como conductor (no el panel general de asociado).</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto shrink-0 whitespace-nowrap"
            asChild
          >
            <Link href="/professional-dashboard" aria-label="Abrir panel de asociado">
              <LayoutDashboard className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Panel de Asociado</span>
              <span className="sm:hidden">Asociado</span>
            </Link>
          </Button>
        </div>

        <Card className="mb-4 overflow-hidden border-primary/20 shadow-sm">
          <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-4">
            <Avatar className="h-20 w-20 border-2 border-primary/30">
              {profileUrl ? <AvatarImage src={profileUrl} alt="" /> : null}
              <AvatarFallback className="text-lg font-semibold bg-primary/15 text-primary">
                {displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-lg leading-tight">{displayName}</CardTitle>
              <CardDescription className="truncate">{user?.email}</CardDescription>
              <div className="mt-2 flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
                <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                <span className="font-semibold tabular-nums">{rating != null ? rating.toFixed(1) : "—"}</span>
                <span className="text-muted-foreground">valoración</span>
              </div>
            </div>
          </CardHeader>
        </Card>

        <ThemeAppearanceCard className="mb-4" />

        <SubscriptionStatusButton className="mb-4 w-full" />

        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Car className="h-5 w-5 text-primary" />
              Tu vehículo
            </CardTitle>
            <CardDescription>Datos registrados en Taxi</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {vehicleLoading ? (
              <p className="text-muted-foreground">Cargando vehículo…</p>
            ) : vehicle ? (
              <>
                <p>
                  <span className="text-muted-foreground">Tipo:</span>{" "}
                  <span className="font-medium text-foreground">{vehicleLabel}</span>
                </p>
                {(vehicle.brand || vehicle.model) && (
                  <p>
                    <span className="text-muted-foreground">Unidad:</span>{" "}
                    <span className="font-medium text-foreground">
                      {[vehicle.brand, vehicle.model].filter(Boolean).join(" ")}
                      {vehicle.model_year != null ? ` · ${vehicle.model_year}` : ""}
                    </span>
                  </p>
                )}
                {vehicle.license_plate && (
                  <p>
                    <span className="text-muted-foreground">Placa:</span>{" "}
                    <span className="font-mono font-medium">{vehicle.license_plate}</span>
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">No hay datos de vehículo enlazados.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Route className="h-5 w-5 text-primary" />
              Viajes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-foreground">{tripCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Viajes completados en Taxi.</p>
          </CardContent>
        </Card>

        <Button className="mt-8 w-full" variant="secondary" asChild>
          <Link href="/go/taxi/driver">Volver a servicios de Taxi</Link>
        </Button>
      </div>
    </div>
  );
}

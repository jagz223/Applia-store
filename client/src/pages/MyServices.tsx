import { useMemo } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  useCategories,
  useCategoryVisibility,
  useCurrentProvider,
  useMyServices,
  useProviderVehicle,
} from "@/hooks/use-mango-data";
import { ServiceListItem } from "@/components/ServiceListItem";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft, PackageOpen, Plus, Car, Bike, Package } from "lucide-react";
import { motion } from "framer-motion";
import { effectiveHiddenCategorySlugs } from "@shared/default-categories";
import { providerHasGoBrand } from "@shared/provider-go";

const VEHICLE_TYPE_LABEL: Record<string, string> = {
  motorcycle: "Moto",
  car: "Carro",
  pickup_truck: "Camioneta",
  truck: "Camión",
};

export default function MyServices() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: providerFromApi, isLoading: providerLoading } = useCurrentProvider();
  const [, setLocation] = useLocation();
  const { data: visibility } = useCategoryVisibility();
  const { data: categories = [] } = useCategories();

  const provider = (user as { provider?: unknown } | null)?.provider ?? providerFromApi ?? null;
  const isProfessional =
    provider != null || (user as { role?: string } | null)?.role === "professional";

  const shouldFetchMyServices =
    isAuthenticated &&
    (!!provider ||
      !!(user as { provider?: unknown } | null)?.provider ||
      (user as { role?: string } | null)?.role === "professional");

  const { data: services = [], isLoading: servicesLoading } = useMyServices({
    enabled: shouldFetchMyServices && !authLoading,
  });

  const { data: vehicle, isLoading: vehicleLoading } = useProviderVehicle({
    enabled: shouldFetchMyServices && !authLoading && !!provider,
  });

  const hiddenSlugs = useMemo(
    () => new Set(effectiveHiddenCategorySlugs(visibility?.hiddenSlugs)),
    [visibility]
  );
  const mobilityGoVisible = !(hiddenSlugs.has("transport") && hiddenSlugs.has("delivery"));

  const goTaxi = providerHasGoBrand(provider as any, "transport", categories);
  const goDelivery = providerHasGoBrand(provider as any, "delivery", categories);
  const driverEnrollmentComplete = !!vehicle && goTaxi && goDelivery;

  const pExtra = provider as {
    profession?: string | null;
    bio?: string | null;
    goDriverOfferTitle?: string | null;
    goDriverOfferDescription?: string | null;
  } | null;

  const showDriverPreview =
    !!vehicle ||
    goTaxi ||
    goDelivery ||
    !!(pExtra?.goDriverOfferTitle && String(pExtra.goDriverOfferTitle).trim());

  const showBecomeDriverCta = mobilityGoVisible && !!provider && !driverEnrollmentComplete;

  const sortedServices = useMemo(() => {
    return [...services].sort((a, b) => (a.title || "").localeCompare(b.title || "", "es"));
  }, [services]);

  if (!authLoading && !isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (!authLoading && !providerLoading && !isProfessional) {
    return <Redirect to="/" />;
  }

  const loading =
    authLoading || providerLoading || (shouldFetchMyServices && servicesLoading) || (!!provider && vehicleLoading);

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      <div className="border-b border-border/50 bg-background/90 backdrop-blur-xl dark:bg-background/92">
        <div className="container mx-auto max-w-7xl px-4 py-6">
          <Button variant="ghost" className="mb-4 gap-2 -ml-2" onClick={() => setLocation("/explore")}>
            <ArrowLeft className="h-4 w-4" />
            Volver a Explorar
          </Button>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Mis servicios
              </h1>
              <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
                Misma vista previa que en Explorar, sin filtros. Usa la flecha para abrir la ficha pública o el lápiz para
                editar.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <Button className="gap-2 sm:self-start" asChild>
                <Link href="/create-service">
                  <Plus className="h-4 w-4" />
                  Nuevo servicio
                </Link>
              </Button>
              {showBecomeDriverCta ? (
                <Button variant="secondary" className="gap-2 sm:self-start" asChild>
                  <Link href="/become-driver">
                    <Car className="h-4 w-4" />
                    Convertirse en conductor
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-4 py-8">
        {!loading && provider && showDriverPreview ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Car className="h-5 w-5 text-primary" />
                  Vista previa — Conductor (Genfeb Go)
                </CardTitle>
                <CardDescription>
                  Así se resume tu perfil de taxi y delivery para la app. Completa el registro si falta algún módulo o el
                  vehículo.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                      goTaxi ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" : "border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    <Car className="h-3.5 w-3.5" />
                    Taxi {goTaxi ? "activo" : "pendiente"}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                      goDelivery ? "border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-100" : "border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    <Package className="h-3.5 w-3.5" />
                    Delivery {goDelivery ? "activo" : "pendiente"}
                  </span>
                </div>

                {pExtra?.profession ? (
                  <p>
                    <span className="text-muted-foreground">Profesión: </span>
                    <span className="font-medium text-foreground">{pExtra.profession}</span>
                  </p>
                ) : null}

                {pExtra?.goDriverOfferTitle ? (
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Oferta</p>
                    <p className="font-medium text-foreground">{pExtra.goDriverOfferTitle}</p>
                    {pExtra.goDriverOfferDescription ? (
                      <p className="mt-1 line-clamp-4 text-muted-foreground">{pExtra.goDriverOfferDescription}</p>
                    ) : null}
                  </div>
                ) : null}

                {pExtra?.bio ? (
                  <p className="line-clamp-3 text-muted-foreground">
                    <span className="font-medium text-foreground">Biografía: </span>
                    {pExtra.bio}
                  </p>
                ) : null}

                {vehicle ? (
                  <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Vehículo</p>
                    <div className="flex flex-wrap items-center gap-3 text-foreground">
                      {vehicle.vehicle_type === "motorcycle" ? (
                        <Bike className="h-5 w-5 shrink-0 text-muted-foreground" />
                      ) : (
                        <Car className="h-5 w-5 shrink-0 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium">
                          {VEHICLE_TYPE_LABEL[vehicle.vehicle_type] ?? vehicle.vehicle_type}{" "}
                          {[vehicle.brand, vehicle.model].filter(Boolean).join(" ")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Placa {vehicle.license_plate ?? "—"} · Año {vehicle.model_year ?? "—"}
                          {vehicle.is_pet_friendly ? " · Pet friendly" : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-amber-800 dark:text-amber-200 text-xs">Aún no hay vehículo registrado para mapas Go.</p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/go/taxi/driver">Panel taxi</Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/go/delivery/driver">Panel delivery</Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/go/taxi/driver/settings">Ajustes taxi</Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/go/delivery/driver/settings">Ajustes delivery</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ) : null}

        {loading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground">Cargando tus servicios…</p>
          </div>
        ) : sortedServices.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-3xl border border-dashed border-border bg-muted/30 py-20 text-center dark:bg-card"
          >
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
              <PackageOpen className="h-10 w-10 text-muted-foreground" />
            </div>
            <h2 className="mb-2 font-display text-2xl font-bold">Aún no tienes servicios publicados</h2>
            <p className="mx-auto mb-8 max-w-md text-muted-foreground">
              Cuando crees un servicio, aparecerá aquí con la misma vista previa que ven los clientes en Explorar.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button className="rounded-full px-8" asChild>
                <Link href="/create-service">Crear servicio</Link>
              </Button>
              {showBecomeDriverCta ? (
                <Button variant="secondary" className="rounded-full px-8 gap-2" asChild>
                  <Link href="/become-driver">
                    <Car className="h-4 w-4" />
                    Convertirse en conductor
                  </Link>
                </Button>
              ) : null}
            </div>
          </motion.div>
        ) : (
          <>
            <p className="mb-6 text-muted-foreground">
              {sortedServices.length} servicio{sortedServices.length === 1 ? "" : "s"}
            </p>
            <div className="flex flex-col gap-4">
              {sortedServices.map((service, index) => (
                <motion.div
                  key={service.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <ServiceListItem service={service} ownerToolbar />
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

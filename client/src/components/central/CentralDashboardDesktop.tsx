import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Car, MapPin, Phone, Radio, Settings, Star, Users, Hash } from "lucide-react";
import type { DispatchMobilityFares, DispatchPackFares, CentralServiceMapView } from "@shared/dispatch-company";
import type { CentralFleetDriver } from "@/hooks/use-central";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CentralFleetMap } from "@/components/central/CentralFleetMap";
import { CentralFaresPanel } from "@/components/central/CentralFaresPanel";
import { CentralMemberRegisterForm } from "@/components/central/CentralMemberRegisterForm";
import { CentralMembersPanel } from "@/components/central/CentralMembersPanel";
import { CompanyCombobox } from "@/components/central/CompanyCombobox";
import { CentralAffiliationRequestsPanel } from "@/components/central/CentralAffiliationRequestsPanel";
import { CentralActiveServicePanel } from "@/components/central/CentralActiveServicePanel";
import { NotificationBell } from "@/components/NotificationBell";
import { CENTRAL_APP_SETTINGS_HREF } from "@/lib/central-dashboard-hrefs";

function StatPill({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-3 py-2 shadow-sm">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function DriverCard({ driver }: { driver: CentralFleetDriver }) {
  const phone = driver.phone?.trim() || null;
  const plate = driver.licensePlate?.trim() || null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar className="h-14 w-14 ring-2 ring-primary/20">
          <AvatarImage src={driver.avatar ?? undefined} />
          <AvatarFallback className="bg-primary/10 text-primary">
            {driver.name[0]}
            {driver.lastName[0]}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold">
            {driver.name} {driver.lastName}
          </p>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
            {driver.rating.toFixed(1)}
          </p>
        </div>
      </div>
      <div className="grid gap-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5 text-sm">
        {phone ? (
          <a href={`tel:${phone.replace(/\s/g, "")}`} className="flex items-center gap-2 font-medium text-primary hover:underline">
            <Phone className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            <span>{phone}</span>
          </a>
        ) : (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Phone className="h-4 w-4 shrink-0" aria-hidden />
            Teléfono no disponible
          </p>
        )}
        {plate ? (
          <p className="flex items-center gap-2 text-foreground">
            <Hash className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              Placa: <span className="font-mono font-semibold tracking-wide">{plate}</span>
            </span>
          </p>
        ) : (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Hash className="h-4 w-4 shrink-0" aria-hidden />
            Placa no registrada
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant={driver.inService ? "default" : "secondary"}>
          {driver.inService ? "En servicio" : "Buscando clientes"}
        </Badge>
        <Badge variant={driver.receiving ? "outline" : "destructive"}>
          {driver.receiving ? "En línea" : "Desconectado"}
        </Badge>
      </div>
      {(driver.receivingTaxi || driver.receivingDelivery) ? (
        <div className="flex flex-wrap gap-2">
          {driver.receivingTaxi ? (
            <Badge variant="secondary" className="text-xs font-normal">
              Recibiendo taxi
            </Badge>
          ) : null}
          {driver.receivingDelivery ? (
            <Badge variant="secondary" className="text-xs font-normal">
              Recibiendo delivery
            </Badge>
          ) : null}
        </div>
      ) : null}
      {driver.activeService ? (
        <CentralActiveServicePanel service={driver.activeService} />
      ) : driver.inService ? (
        <p className="text-xs text-muted-foreground">
          En servicio; los detalles del viaje aparecerán en cuanto se sincronicen con el servidor.
        </p>
      ) : null}
    </div>
  );
}

export type CentralDashboardDesktopProps = {
  companyId: string;
  companyName: string;
  isAdmin: boolean;
  companies: { id: string; name: string }[];
  companySearch: string;
  onCompanySearchChange: (s: string) => void;
  selectedCompanyId: string | null;
  onCompanyChange: (id: string | null) => void;
  driversOnMap: CentralFleetDriver[];
  membersCount: number;
  activeOnMap: number;
  inServiceCount: number;
  fleetCount: number;
  selectedDriver: CentralFleetDriver | null;
  onSelectDriver: (d: CentralFleetDriver | null) => void;
  mobilityDraft: DispatchMobilityFares | null;
  packDraft: DispatchPackFares | null;
  onMobilityDraftChange: React.Dispatch<React.SetStateAction<DispatchMobilityFares | null>>;
  onPackDraftChange: React.Dispatch<React.SetStateAction<DispatchPackFares | null>>;
  onSaveFares: () => void;
  faresSaving: boolean;
  onMemberRegistered: () => void;
  serviceMapView: CentralServiceMapView;
  onPersistServiceMap: (lat: number, lon: number, zoom: number) => void | Promise<void>;
  persistServiceMapPending: boolean;
  pendingAffiliationCount: number;
  highlightAffiliationRequestId?: string | null;
  onRefreshFleet: () => void | Promise<unknown>;
  fleetRefreshing: boolean;
};

export function CentralDashboardDesktop(props: CentralDashboardDesktopProps) {
  const {
    companyId,
    companyName,
    isAdmin,
    companies,
    companySearch,
    onCompanySearchChange,
    selectedCompanyId,
    onCompanyChange,
    driversOnMap,
    membersCount,
    activeOnMap,
    inServiceCount,
    fleetCount,
    selectedDriver,
    onSelectDriver,
    mobilityDraft,
    packDraft,
    onMobilityDraftChange,
    onPackDraftChange,
    onSaveFares,
    faresSaving,
    onMemberRegistered,
    serviceMapView,
    onPersistServiceMap,
    persistServiceMapPending,
    pendingAffiliationCount,
    highlightAffiliationRequestId = null,
    onRefreshFleet,
    fleetRefreshing,
  } = props;

  const [lowerTab, setLowerTab] = useState<"fares" | "register" | "requests">("fares");
  useEffect(() => {
    if (highlightAffiliationRequestId) setLowerTab("requests");
  }, [highlightAffiliationRequestId]);

  return (
    <div className="max-lg:hidden min-h-screen bg-gradient-to-b from-muted/25 via-background to-background">
      <div className="mx-auto w-full max-w-[min(1760px,calc(100vw-1.5rem))] space-y-6 px-4 py-6 sm:px-6 xl:px-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1 lg:max-w-[min(36rem,48%)]">
            <p className="text-xs font-medium uppercase tracking-widest text-primary">Centrales de taxis</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{companyName}</h1>
            <p className="max-w-xl text-sm text-muted-foreground">
              Monitorea conductores en tiempo real, gestiona tu equipo y configura tarifas de taxi y delivery.
            </p>
          </div>
          <div className="flex flex-wrap items-end justify-start gap-2 lg:ml-auto lg:justify-end">
            {isAdmin ? (
              <CompanyCombobox
                companies={companies}
                value={selectedCompanyId}
                onChange={onCompanyChange}
                search={companySearch}
                onSearchChange={onCompanySearchChange}
              />
            ) : null}
            <div className="flex items-center gap-1.5">
              <div className="rounded-full border border-border/70 bg-card/90 shadow-sm backdrop-blur-sm [&_button]:h-10 [&_button]:w-10 [&_button]:rounded-full">
                <NotificationBell />
              </div>
              <Button
                asChild
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-full border-border/80 bg-card/90 shadow-sm backdrop-blur-sm"
                aria-label="Configuración"
              >
                <Link href={CENTRAL_APP_SETTINGS_HREF}>
                  <Settings className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </header>

        <div className="flex flex-wrap gap-3 lg:justify-center">
          <StatPill icon={Users} label="Usuarios" value={membersCount} />
          <StatPill icon={MapPin} label="En mapa" value={activeOnMap} />
          <StatPill icon={Car} label="En servicio" value={inServiceCount} />
          <StatPill icon={Radio} label="Flota activa" value={fleetCount} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_min(320px,26vw)]">
          <div className="min-w-0 space-y-6">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2.15fr)_minmax(240px,1fr)]">
              <Card className="overflow-hidden border-border/80 shadow-md lg:min-h-0">
                <CardHeader className="border-b border-border/50 bg-muted/20 pb-3">
                  <CardTitle className="text-lg">Mapa de flota</CardTitle>
                  <CardDescription>
                    Vista fija de tu ciudad; los marcadores se actualizan solos o con «Actualizar mapa». Elige un
                    conductor para seguirlo en el mapa; si tiene viaje activo, abre el detalle y pulsa «Mapa» para ver la
                    ruta (como en regateo del conductor).
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <CentralFleetMap
                    mapInstanceKey={companyId}
                    drivers={driversOnMap}
                    onSelectDriver={(d) => onSelectDriver(d)}
                    serviceMapView={serviceMapView}
                    showMapToolbar
                    onPersistServiceMap={onPersistServiceMap}
                    persistServiceMapPending={persistServiceMapPending}
                    followDriver={selectedDriver}
                    onRefreshFleet={onRefreshFleet}
                    fleetRefreshing={fleetRefreshing}
                  />
                </CardContent>
              </Card>

              <Card className="border-border/80 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Detalle</CardTitle>
                  <CardDescription>
                    Al elegir un conductor, la cámara lo sigue en el mapa. Si está en servicio, en este panel ves el
                    detalle del viaje y el botón «Mapa» para la ruta recogida → destino.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedDriver ? (
                    <DriverCard driver={selectedDriver} />
                  ) : (
                    <p className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                      Toca un marcador en el mapa para ver datos del conductor.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Tabs value={lowerTab} onValueChange={(v) => setLowerTab(v as typeof lowerTab)} className="space-y-4">
              <TabsList className="mx-auto grid w-full max-w-2xl grid-cols-3">
                <TabsTrigger value="fares">Tarifas</TabsTrigger>
                <TabsTrigger value="register">Registrar</TabsTrigger>
                <TabsTrigger value="requests" className="relative">
                  Solicitudes
                  {pendingAffiliationCount > 0 ? (
                    <span className="ml-1 inline-flex min-w-5 justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                      {pendingAffiliationCount > 99 ? "99+" : pendingAffiliationCount}
                    </span>
                  ) : null}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="fares" className="space-y-4">
                <CentralFaresPanel
                  mobilityDraft={mobilityDraft}
                  packDraft={packDraft}
                  onMobilityChange={onMobilityDraftChange}
                  onPackChange={onPackDraftChange}
                  onSave={onSaveFares}
                  isSaving={faresSaving}
                />
              </TabsContent>
              <TabsContent value="register">
                <CentralMemberRegisterForm companyId={companyId} onRegistered={onMemberRegistered} />
              </TabsContent>
              <TabsContent value="requests">
                <CentralAffiliationRequestsPanel
                  companyId={companyId}
                  highlightRequestId={highlightAffiliationRequestId}
                />
              </TabsContent>
            </Tabs>
          </div>

          <aside className="min-w-0">
            <CentralMembersPanel companyId={companyId} variant="sidebar" />
          </aside>
        </div>
      </div>
    </div>
  );
}

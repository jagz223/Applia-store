import { useEffect, useState, useMemo } from "react";
import { Link } from "wouter";
import { Building2, Car, MapPin, Radio, Settings } from "lucide-react";
import type { DispatchMobilityFares, DispatchPackFares, CentralServiceMapView } from "@shared/dispatch-company";
import type { CentralFleetDriver } from "@/hooks/use-central";
import { Button } from "@/components/ui/button";
import { CentralFleetMap } from "@/components/central/CentralFleetMap";
import { CentralFleetActiveList, CentralFleetActiveListHeader } from "@/components/central/CentralFleetActiveList";
import { CentralBottomNav, type CentralMobileTab } from "@/components/central/CentralBottomNav";
import { CentralDriverMapSheet } from "@/components/central/CentralDriverSheet";
import { CentralFaresPanel } from "@/components/central/CentralFaresPanel";
import { CentralMemberRegisterForm } from "@/components/central/CentralMemberRegisterForm";
import { CentralMembersPanel } from "@/components/central/CentralMembersPanel";
import { CentralAffiliationRequestsPanel } from "@/components/central/CentralAffiliationRequestsPanel";
import { CentralCargoGoHistoryPanel } from "@/components/central/CentralCargoGoHistoryPanel";
import { CompanyCombobox } from "@/components/central/CompanyCombobox";
import {
  centralViewportClasses,
  centralViewportCssVars,
} from "@/lib/central-viewport-layout";
import { CENTRAL_APP_SETTINGS_HREF } from "@/lib/central-dashboard-hrefs";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/NotificationBell";

function CentralMobileHeaderActions() {
  return (
    <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
      <div className="rounded-full border border-border/60 bg-background/90 shadow-md backdrop-blur-sm [&_button]:h-9 [&_button]:w-9 [&_button]:rounded-full">
        <NotificationBell />
      </div>
      <Button
        asChild
        variant="secondary"
        size="icon"
        className="size-10 shrink-0 rounded-full border border-border/60 bg-background/90 shadow-md backdrop-blur-sm"
      >
        <Link href={CENTRAL_APP_SETTINGS_HREF} aria-label="Configuración">
          <Settings className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

function CentralMobileHomeFab() {
  return (
    <Button
      asChild
      variant="secondary"
      size="icon"
      className="pointer-events-auto size-10 shrink-0 overflow-hidden rounded-full border border-border/60 bg-background/90 p-1 shadow-md backdrop-blur-sm"
    >
      <Link href="/" aria-label="Inicio GenFeb">
        <span
          className="mx-auto flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-border/55"
          aria-hidden
        >
          <img
            src="/genfeb-logo-new.png"
            alt=""
            className="size-full object-contain"
            width={28}
            height={28}
            decoding="async"
          />
        </span>
      </Link>
    </Button>
  );
}

export type CentralDashboardMobileProps = {
  companyId: string;
  companyName: string;
  isAdmin: boolean;
  companies: { id: string; name: string }[];
  companySearch: string;
  onCompanySearchChange: (s: string) => void;
  selectedCompanyId: string | null;
  onCompanyChange: (id: string | null) => void;
  driversOnMap: CentralFleetDriver[];
  activeFleet: CentralFleetDriver[];
  mapFocusNonce: number;
  fleetCount: number;
  inServiceCount: number;
  membersCount: number;
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
  /** ID de solicitud desde notificación (`?affiliationRequest=`). */
  highlightAffiliationRequestId?: string | null;
  onRefreshFleet: () => void | Promise<unknown>;
  fleetRefreshing: boolean;
};

export function CentralDashboardMobile({
  companyId,
  companyName,
  isAdmin,
  companies,
  companySearch,
  onCompanySearchChange,
  selectedCompanyId,
  onCompanyChange,
  driversOnMap,
  activeFleet,
  mapFocusNonce,
  fleetCount,
  inServiceCount,
  membersCount,
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
}: CentralDashboardMobileProps) {
  const [tab, setTab] = useState<CentralMobileTab>("map");
  const [fleetListOpen, setFleetListOpen] = useState(false);

  useEffect(() => {
    if (highlightAffiliationRequestId) setTab("requests");
  }, [highlightAffiliationRequestId]);

  useEffect(() => {
    if (tab !== "map") return;
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, [tab]);

  useEffect(() => {
    if (tab !== "map") onSelectDriver(null);
  }, [tab, onSelectDriver]);

  return (
    <div className={cn(centralViewportClasses.root, "lg:hidden")} style={centralViewportCssVars}>
      {tab === "map" ? (
        <div className={centralViewportClasses.mapStage}>
          <CentralFleetMap
            fullscreen
            mapInstanceKey={companyId}
            drivers={driversOnMap}
            onSelectDriver={(d) => onSelectDriver(d)}
            serviceMapView={serviceMapView}
            showMapToolbar
            onPersistServiceMap={onPersistServiceMap}
            persistServiceMapPending={persistServiceMapPending}
            followDriver={selectedDriver}
            focusNonce={mapFocusNonce}
            onRefreshFleet={onRefreshFleet}
            fleetRefreshing={fleetRefreshing}
          />

          <div className={centralViewportClasses.mapOverlayTop}>
            <div className="flex items-start justify-between gap-2">
              <CentralMobileHomeFab />
              <div className="pointer-events-auto min-w-0 flex-1 rounded-xl border border-border/70 bg-background/92 px-3 py-2 shadow-md backdrop-blur-sm">
                <p className="truncate text-sm font-semibold leading-tight">{companyName}</p>
                <p className="text-[10px] text-muted-foreground">Flota en tiempo real</p>
              </div>
              <CentralMobileHeaderActions />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className={centralViewportClasses.mapOverlayChip}>
                <MapPin className="mr-1 inline h-3 w-3" />
                {driversOnMap.length} en mapa
              </span>
              <span className={centralViewportClasses.mapOverlayChip}>
                <Car className="mr-1 inline h-3 w-3" />
                {inServiceCount} en servicio
              </span>
              <span className={centralViewportClasses.mapOverlayChip}>
                <Radio className="mr-1 inline h-3 w-3" />
                {activeFleet.length} activos
              </span>
            </div>
            {isAdmin && (
              <div className="pointer-events-auto">
                <CompanyCombobox
                  compact
                  companies={companies}
                  value={selectedCompanyId}
                  onChange={onCompanyChange}
                  search={companySearch}
                  onSearchChange={onCompanySearchChange}
                />
              </div>
            )}
          </div>

          <div
            className="pointer-events-none absolute inset-x-0 z-30 flex flex-col px-3"
            style={{ bottom: "calc(var(--central-bottom-nav-height, 4.25rem) + 0.5rem)" }}
          >
            <div className="pointer-events-auto overflow-hidden rounded-2xl border border-border/80 bg-background/95 shadow-xl backdrop-blur-md">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                onClick={() => setFleetListOpen((o) => !o)}
                aria-expanded={fleetListOpen}
              >
                <CentralFleetActiveListHeader count={activeFleet.length} />
                <span className="text-xs font-medium text-primary">{fleetListOpen ? "Ocultar" : "Ver lista"}</span>
              </button>
              {fleetListOpen ? (
                <div className="border-t border-border/60 px-3 pb-3 pt-1">
                  <CentralFleetActiveList
                    drivers={activeFleet}
                    selectedUserId={selectedDriver?.userId ?? null}
                    onSelectDriver={(d) => {
                      onSelectDriver(d);
                      setFleetListOpen(false);
                    }}
                    maxHeightClass="max-h-[min(38vh,320px)]"
                  />
                </div>
              ) : null}
            </div>
          </div>

          <CentralDriverMapSheet driver={selectedDriver} onClose={() => onSelectDriver(null)} />
        </div>
      ) : (
        <div className={centralViewportClasses.scrollPanel}>
          <div className="sticky top-0 z-20 -mx-4 mb-3 flex items-center justify-between gap-2 border-b border-border/60 bg-background/95 px-4 py-2.5 backdrop-blur-md supports-[backdrop-filter]:bg-background/85">
            <CentralMobileHomeFab />
            <CentralMobileHeaderActions />
          </div>
          {tab === "team" && (
            <>
              <h1 className="mb-1 flex items-center gap-2 text-lg font-bold">
                <Building2 className="h-5 w-5 text-primary" />
                Equipo
              </h1>
              <p className="mb-4 text-sm text-muted-foreground">{companyName}</p>
              <CentralMembersPanel companyId={companyId} variant="embedded" />
            </>
          )}
          {tab === "history" && (
            <>
              <h1 className="mb-1 text-lg font-bold">Historial Car Go</h1>
              <p className="mb-4 text-sm text-muted-foreground">
                Completados y cancelados de conductores de {companyName}
              </p>
              <CentralCargoGoHistoryPanel companyId={companyId} embedded />
            </>
          )}
          {tab === "fares" && (
            <>
              <h1 className="mb-1 text-lg font-bold">Tarifas</h1>
              <p className="mb-4 text-sm text-muted-foreground">Taxi y delivery para {companyName}</p>
              <CentralFaresPanel
                embedded
                mobilityDraft={mobilityDraft}
                packDraft={packDraft}
                onMobilityChange={onMobilityDraftChange}
                onPackChange={onPackDraftChange}
                onSave={onSaveFares}
                isSaving={faresSaving}
              />
            </>
          )}
          {tab === "register" && (
            <>
              <h1 className="mb-4 text-lg font-bold">Nuevo usuario</h1>
              <CentralMemberRegisterForm companyId={companyId} onRegistered={onMemberRegistered} />
            </>
          )}
          {tab === "requests" && (
            <>
              <h1 className="mb-1 text-lg font-bold">Solicitudes de conductores</h1>
              <p className="mb-4 text-sm text-muted-foreground">{companyName}</p>
              <CentralAffiliationRequestsPanel
                companyId={companyId}
                highlightRequestId={highlightAffiliationRequestId}
              />
            </>
          )}
        </div>
      )}

      <CentralBottomNav
        active={tab}
        onChange={setTab}
        teamCount={membersCount}
        fleetOnMap={driversOnMap.length}
        pendingAffiliationCount={pendingAffiliationCount}
      />
    </div>
  );
}

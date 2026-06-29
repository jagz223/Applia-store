import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, Redirect, useSearch } from "wouter";
import { Building2, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { resolveCentralServiceMapView } from "@shared/dispatch-company";
import { useAuth } from "@/hooks/use-auth";
import { canAccessCentralDashboard, hasAdminRole } from "@/lib/auth-utils";
import { isCentralRole } from "@shared/roles";
import { CENTRAL_SETUP_PATH } from "@shared/role-change-notification";
import {
  useCentralCompaniesForAdmin,
  useCentralFleet,
  useCentralFleetAll,
  useCentralFares,
  useCentralMe,
  useCentralMembers,
  useCentralAffiliationRequests,
  usePatchCentralFares,
  usePatchCentralServiceMap,
  CENTRAL_FLEET_QUERY_KEY,
  CENTRAL_FLEET_ALL_QUERY_KEY,
  mergeCentralFleetDriverPatch,
  type CentralFleetDriver,
  type CentralFleetSocketPatch,
  type AdminCentralView,
} from "@/hooks/use-central";
import { useSocket } from "@/hooks/use-socket";
import { debouncedRefetch } from "@/lib/refetch-utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { CentralDashboardDesktop } from "@/components/central/CentralDashboardDesktop";
import { CentralDashboardMobile } from "@/components/central/CentralDashboardMobile";
import { useCentralWideLayout } from "@/hooks/use-central-wide-layout";
import { CompanyCombobox } from "@/components/central/CompanyCombobox";
import type { DispatchMobilityFares, DispatchPackFares } from "@shared/dispatch-company";
import { isCentralFleetVisibleOnMap } from "@/lib/central-fleet-position";

export type { AdminCentralView } from "@/hooks/use-central";

export default function CentralDashboard() {
  const isWideCentralLayout = useCentralWideLayout();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { socket } = useSocket();
  const isAdmin = hasAdminRole(user);
  const search = useSearch();
  const affiliationRequestFromUrl = useMemo(() => {
    const q = new URLSearchParams(search || "");
    return q.get("affiliationRequest")?.trim() || null;
  }, [search]);
  const companyIdFromUrl = useMemo(() => {
    const q = new URLSearchParams(search || "");
    return q.get("companyId")?.trim() || null;
  }, [search]);
  const [companySearch, setCompanySearch] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    (user as { dispatchCompanyId?: string } | null)?.dispatchCompanyId ?? null,
  );
  const [selectedDriver, setSelectedDriver] = useState<CentralFleetDriver | null>(null);
  const [mapFocusNonce, setMapFocusNonce] = useState(0);
  const [adminView, setAdminView] = useState<AdminCentralView>("centrales");
  const adminAllDriversMode = isAdmin && adminView === "all-drivers";

  useEffect(() => {
    setSelectedDriver(null);
  }, [adminView]);

  const handleSelectDriver = useCallback((driver: CentralFleetDriver | null) => {
    setSelectedDriver(driver);
    if (driver) setMapFocusNonce((n) => n + 1);
  }, []);

  const { data: companies } = useCentralCompaniesForAdmin(companySearch, isAdmin);
  const effectiveCompanyId = isAdmin
    ? selectedCompanyId
    : ((user as { dispatchCompanyId?: string })?.dispatchCompanyId ?? null);

  const { data: me } = useCentralMe(effectiveCompanyId);
  const { data: fleetCompany = [], refetch: refetchFleetCompany, isFetching: fleetCompanyRefreshing } =
    useCentralFleet(adminAllDriversMode ? null : effectiveCompanyId);
  const { data: fleetAll = [], refetch: refetchFleetAll, isFetching: fleetAllRefreshing } =
    useCentralFleetAll(adminAllDriversMode);
  const fleet = adminAllDriversMode ? fleetAll : fleetCompany;
  const refetchFleet = adminAllDriversMode ? refetchFleetAll : refetchFleetCompany;
  const fleetRefreshing = adminAllDriversMode ? fleetAllRefreshing : fleetCompanyRefreshing;
  const { data: members = [] } = useCentralMembers(effectiveCompanyId);
  const { data: faresData } = useCentralFares(effectiveCompanyId);
  const patchFares = usePatchCentralFares(effectiveCompanyId);
  const patchServiceMap = usePatchCentralServiceMap(effectiveCompanyId);

  const { data: affiliationRequests = [] } = useCentralAffiliationRequests(effectiveCompanyId);
  const pendingAffiliationCount = useMemo(
    () => affiliationRequests.filter((r) => r.status === "pending").length,
    [affiliationRequests],
  );

  const [mobilityDraft, setMobilityDraft] = useState<DispatchMobilityFares | null>(null);
  const [packDraft, setPackDraft] = useState<DispatchPackFares | null>(null);

  useEffect(() => {
    if (faresData?.mobilityFares) setMobilityDraft(faresData.mobilityFares);
    if (faresData?.packFares) setPackDraft(faresData.packFares);
  }, [faresData]);

  useEffect(() => {
    if (!socket) return;
    if (adminAllDriversMode) {
      socket.emit("central:fleet:subscribe-all");
      const onUpdate = (raw: unknown) => {
        const patch = raw as CentralFleetSocketPatch;
        if (!patch?.userId) return;
        const key = CENTRAL_FLEET_ALL_QUERY_KEY;
        let needsFullRow = false;
        queryClient.setQueryData<CentralFleetDriver[]>(key, (prev) => {
          const list = prev ?? [];
          if (!patch.offline && !list.some((d) => d.userId === patch.userId)) {
            needsFullRow = true;
          }
          return mergeCentralFleetDriverPatch(prev, patch);
        });
        if (needsFullRow) debouncedRefetch(queryClient, key);
      };
      socket.on("central:fleet:update", onUpdate);
      return () => {
        socket.emit("central:fleet:unsubscribe-all");
        socket.off("central:fleet:update", onUpdate);
      };
    }
    if (!effectiveCompanyId) return;
    socket.emit("central:fleet:subscribe", { companyId: effectiveCompanyId });
    const onUpdate = (raw: unknown) => {
      const patch = raw as CentralFleetSocketPatch;
      if (!patch?.userId || patch.dispatchCompanyId !== effectiveCompanyId) return;
      const key = CENTRAL_FLEET_QUERY_KEY(effectiveCompanyId);
      let needsFullRow = false;
      queryClient.setQueryData<CentralFleetDriver[]>(key, (prev) => {
        const list = prev ?? [];
        if (!patch.offline && !list.some((d) => d.userId === patch.userId)) {
          needsFullRow = true;
        }
        return mergeCentralFleetDriverPatch(prev, patch);
      });
      if (needsFullRow) debouncedRefetch(queryClient, key);
    };
    socket.on("central:fleet:update", onUpdate);
    return () => {
      socket.emit("central:fleet:unsubscribe", { companyId: effectiveCompanyId });
      socket.off("central:fleet:update", onUpdate);
    };
  }, [socket, effectiveCompanyId, adminAllDriversMode, queryClient]);

  useEffect(() => {
    if (!isAdmin && (user as { dispatchCompanyId?: string })?.dispatchCompanyId) {
      setSelectedCompanyId((user as { dispatchCompanyId?: string }).dispatchCompanyId!);
    }
  }, [user, isAdmin]);

  /** Desde notificación (p. ej. admin): preseleccionar la central del enlace. */
  useEffect(() => {
    if (!isAdmin || !companyIdFromUrl) return;
    setSelectedCompanyId(companyIdFromUrl);
  }, [isAdmin, companyIdFromUrl]);

  const driversOnMap = useMemo(() => fleet.filter((d) => isCentralFleetVisibleOnMap(d)), [fleet]);
  const activeFleet = useMemo(
    () =>
      fleet
        .filter((d) => d.receiving || d.inService)
        .sort((a, b) => {
          if (a.inService !== b.inService) return a.inService ? -1 : 1;
          if (a.receiving !== b.receiving) return a.receiving ? -1 : 1;
          return `${a.name} ${a.lastName}`.localeCompare(`${b.name} ${b.lastName}`, "es");
        }),
    [fleet],
  );
  /** Datos en vivo del conductor seleccionado (teléfono, placa, posición) al refrescar la flota. */
  const selectedDriverLive = useMemo(() => {
    if (!selectedDriver) return null;
    return fleet.find((d) => d.userId === selectedDriver.userId) ?? selectedDriver;
  }, [fleet, selectedDriver]);

  const companyName = adminAllDriversMode
    ? "Todos los conductores"
    : (me?.company?.name ?? "Empresa");
  const serviceMapView = useMemo(
    () => (adminAllDriversMode ? resolveCentralServiceMapView(null) : resolveCentralServiceMapView(me?.company)),
    [adminAllDriversMode, me?.company],
  );

  const handlePersistServiceMap = async (lat: number, lon: number, zoom: number) => {
    const cityZoom = Math.min(14, Math.max(9, Math.round(zoom)));
    try {
      await patchServiceMap.mutateAsync({ lat, lon, cityZoom });
      toast({
        title: "Vista guardada",
        description: "«Mi ciudad» y el zoom inicial usarán esta posición para tu central.",
      });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo guardar",
      });
    }
  };

  const handleSaveFares = () => {
    if (!mobilityDraft || !packDraft) return;
    patchFares.mutate(
      { mobilityFares: mobilityDraft, packFares: packDraft },
      {
        onSuccess: () => toast({ title: "Tarifas guardadas" }),
        onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
      },
    );
  };

  const sharedProps = {
    companyId: adminAllDriversMode ? "__all__" : effectiveCompanyId!,
    companyName,
    isAdmin,
    adminAllDriversMode,
    adminView,
    onAdminViewChange: setAdminView,
    companies: companies ?? [],
    companySearch,
    onCompanySearchChange: setCompanySearch,
    selectedCompanyId: effectiveCompanyId,
    onCompanyChange: setSelectedCompanyId,
    driversOnMap,
    activeFleet,
    mapFocusNonce,
    membersCount: members.length,
    activeOnMap: activeFleet.length,
    inServiceCount: fleet.filter((d) => d.inService).length,
    fleetCount: fleet.length,
    selectedDriver: selectedDriverLive,
    onSelectDriver: handleSelectDriver,
    mobilityDraft,
    packDraft,
    onMobilityDraftChange: setMobilityDraft,
    onPackDraftChange: setPackDraft,
    onSaveFares: handleSaveFares,
    faresSaving: patchFares.isPending,
    onMemberRegistered: () => void refetchFleet(),
    serviceMapView,
    onPersistServiceMap: handlePersistServiceMap,
    persistServiceMapPending: patchServiceMap.isPending,
    pendingAffiliationCount,
    highlightAffiliationRequestId: affiliationRequestFromUrl,
    onRefreshFleet: refetchFleet,
    fleetRefreshing,
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !canAccessCentralDashboard(user)) {
    return <Redirect to="/login" />;
  }

  const needsCentralSetup =
    !isAdmin &&
    isCentralRole((user as { role?: string }).role) &&
    ((user as { pendingCentralSetup?: boolean }).pendingCentralSetup === true ||
      !String((user as { dispatchCompanyId?: string }).dispatchCompanyId ?? "").trim());

  if (needsCentralSetup) {
    return <Redirect to={CENTRAL_SETUP_PATH} />;
  }

  if (isAdmin && !adminAllDriversMode && !effectiveCompanyId) {
    return (
      <div className="container max-w-lg space-y-4 py-12">
        <Tabs
          value={adminView}
          onValueChange={(v) => setAdminView(v as AdminCentralView)}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="centrales">Centrales</TabsTrigger>
            <TabsTrigger value="all-drivers">Todos los conductores</TabsTrigger>
          </TabsList>
        </Tabs>
        <Card className="border-primary/20 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Panel Central
            </CardTitle>
            <CardDescription>Selecciona la empresa despachadora que deseas administrar.</CardDescription>
          </CardHeader>
          <CardContent>
            <CompanyCombobox
              companies={companies ?? []}
              value={selectedCompanyId}
              onChange={setSelectedCompanyId}
              search={companySearch}
              onSearchChange={setCompanySearch}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  /** Un solo árbol con mapa Leaflet: si Mobile y Desktop montan a la vez, el mapa de escritorio (oculto con CSS) sigue viviendo en DOM y se superpone en móvil. */
  return isWideCentralLayout ? (
    <CentralDashboardDesktop {...sharedProps} />
  ) : (
    <CentralDashboardMobile {...sharedProps} />
  );
}

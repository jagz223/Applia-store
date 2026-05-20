import { useEffect, useMemo, useState } from "react";
import { Link, Redirect, useSearch } from "wouter";
import { Building2, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { resolveCentralServiceMapView } from "@shared/dispatch-company";
import { useAuth } from "@/hooks/use-auth";
import { canAccessCentralDashboard, hasAdminRole } from "@/lib/auth-utils";
import {
  useCentralCompaniesForAdmin,
  useCentralFleet,
  useCentralFares,
  useCentralMe,
  useCentralMembers,
  useCentralAffiliationRequests,
  usePatchCentralFares,
  usePatchCentralServiceMap,
  CENTRAL_FLEET_QUERY_KEY,
  mergeCentralFleetDriverPatch,
  type CentralFleetDriver,
  type CentralFleetSocketPatch,
} from "@/hooks/use-central";
import { useSocket } from "@/hooks/use-socket";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CentralDashboardDesktop } from "@/components/central/CentralDashboardDesktop";
import { CentralDashboardMobile } from "@/components/central/CentralDashboardMobile";
import { useCentralWideLayout } from "@/hooks/use-central-wide-layout";
import { CompanyCombobox } from "@/components/central/CompanyCombobox";
import type { DispatchMobilityFares, DispatchPackFares } from "@shared/dispatch-company";
import { CENTRAL_APP_SETTINGS_HREF } from "@/lib/central-dashboard-hrefs";

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

  const { data: companies } = useCentralCompaniesForAdmin(companySearch, isAdmin);
  const effectiveCompanyId = isAdmin
    ? selectedCompanyId
    : ((user as { dispatchCompanyId?: string })?.dispatchCompanyId ?? null);

  const { data: me } = useCentralMe(effectiveCompanyId);
  const { data: fleet = [], refetch: refetchFleet, isFetching: fleetRefreshing } = useCentralFleet(effectiveCompanyId);
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
    if (!socket || !effectiveCompanyId) return;
    socket.emit("central:fleet:subscribe", { companyId: effectiveCompanyId });
    const onUpdate = (raw: unknown) => {
      const patch = raw as CentralFleetSocketPatch;
      if (!patch?.userId || patch.dispatchCompanyId !== effectiveCompanyId) return;
      const key = CENTRAL_FLEET_QUERY_KEY(effectiveCompanyId);
      queryClient.setQueryData<CentralFleetDriver[]>(key, (prev) =>
        mergeCentralFleetDriverPatch(prev, patch),
      );
    };
    socket.on("central:fleet:update", onUpdate);
    return () => {
      socket.emit("central:fleet:unsubscribe", { companyId: effectiveCompanyId });
      socket.off("central:fleet:update", onUpdate);
    };
  }, [socket, effectiveCompanyId, queryClient]);

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

  const driversOnMap = useMemo(() => fleet.filter((d) => d.lat != null && d.lon != null), [fleet]);
  /** Datos en vivo del conductor seleccionado (teléfono, placa, posición) al refrescar la flota. */
  const selectedDriverLive = useMemo(() => {
    if (!selectedDriver) return null;
    return fleet.find((d) => d.userId === selectedDriver.userId) ?? selectedDriver;
  }, [fleet, selectedDriver]);

  const companyName = me?.company?.name ?? "Empresa";
  const serviceMapView = useMemo(() => resolveCentralServiceMapView(me?.company), [me?.company]);

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
    companyId: effectiveCompanyId!,
    companyName,
    isAdmin,
    companies: companies ?? [],
    companySearch,
    onCompanySearchChange: setCompanySearch,
    selectedCompanyId: effectiveCompanyId,
    onCompanyChange: setSelectedCompanyId,
    driversOnMap,
    membersCount: members.length,
    activeOnMap: driversOnMap.length,
    inServiceCount: fleet.filter((d) => d.inService).length,
    fleetCount: fleet.length,
    selectedDriver: selectedDriverLive,
    onSelectDriver: setSelectedDriver,
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

  if (isAdmin && !effectiveCompanyId) {
    return (
      <div className="container max-w-lg py-12">
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

  if (!effectiveCompanyId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <Card className="border-amber-500/30 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg">Sin empresa despachadora asignada</CardTitle>
            <CardDescription>
              Tu cuenta tiene acceso al panel central, pero no figura vinculada a ninguna empresa activa. Pide a un
              administrador que asigne tu usuario a una central, o revisa que tu sesión esté actualizada.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="default">
              <Link href="/">Volver al inicio</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={CENTRAL_APP_SETTINGS_HREF}>Ir a configuración</Link>
            </Button>
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

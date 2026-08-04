import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { Building2, Loader2 } from "lucide-react";
import {
  useGrantCentralDataSharing,
  useMyCentralAffiliationRequests,
  useDispatchCompanyOptions,
} from "@/hooks/use-central";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { useCategories, useCategoryVisibility, useCurrentProvider, useProviderVehicle } from "@/hooks/use-mango-data";
import { providerHasGoBrand, type ProviderGoRef } from "@shared/provider-go";
import { effectiveHiddenCategorySlugs } from "@shared/default-categories";
import {
  canOfferCentralAffiliationRequest,
  hasPendingCentralAffiliationRequest,
  normalizeProviderDispatchCompanyId,
} from "@/lib/go-driver-central-affiliation";
import { RequestCentralAffiliationForm } from "@/components/provider/RequestCentralAffiliationForm";

function affiliationStatusLabel(status: string) {
  switch (status) {
    case "pending":
      return "Pendiente de revisión";
    case "approved":
      return "Aprobada";
    case "rejected":
      return "Rechazada";
    case "cancelled":
      return "Cancelada";
    default:
      return status;
  }
}

export function ProfessionalCentralAffiliationPanel() {
  const searchQs = useSearch();
  const { toast } = useToast();
  const { data: visibility } = useCategoryVisibility();
  const hiddenSlugs = useMemo(
    () => new Set(effectiveHiddenCategorySlugs(visibility?.hiddenSlugs)),
    [visibility],
  );
  const mobilityGoVisible = !(hiddenSlugs.has("transport") && hiddenSlugs.has("delivery"));

  const { data: provider, isLoading: providerLoading } = useCurrentProvider();
  const { data: vehicle, isLoading: vehicleLoading } = useProviderVehicle({
    enabled: !!provider,
  });
  const { data: categories = [] } = useCategories();
  const { data: requests = [], isLoading: requestsLoading } = useMyCentralAffiliationRequests();
  const { data: companies = [] } = useDispatchCompanyOptions();
  const grant = useGrantCentralDataSharing();

  const goTaxi = providerHasGoBrand(provider as ProviderGoRef | null, "transport", categories);
  const goDelivery = providerHasGoBrand(provider as ProviderGoRef | null, "delivery", categories);
  const driverEnrollmentComplete = !!vehicle && goTaxi && goDelivery;

  const canRequest = canOfferCentralAffiliationRequest({
    mobilityGoVisible,
    driverEnrollmentComplete,
    provider: provider ?? undefined,
  });
  const pendingAny = hasPendingCentralAffiliationRequest(requests);
  const dispatchId = normalizeProviderDispatchCompanyId(provider ?? undefined);
  const linkedCompanyName = dispatchId ? companies.find((c) => c.id === dispatchId)?.name ?? null : null;

  const highlightId = useMemo(() => new URLSearchParams(searchQs || "").get("centralAffiliation"), [searchQs]);

  const [explainOpen, setExplainOpen] = useState(false);
  const [sureOpen, setSureOpen] = useState(false);
  const [grantRequestId, setGrantRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`central-affiliation-${highlightId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, requests.length]);

  const openGrantFlow = (requestId: string) => {
    setGrantRequestId(requestId);
    setExplainOpen(true);
  };

  const handleGrant = async () => {
    if (!grantRequestId) return;
    try {
      await grant.mutateAsync(grantRequestId);
      toast({
        title: "Acceso autorizado",
        description: "Tu central podrá ver tu correo y teléfono para coordinar contigo.",
      });
      setSureOpen(false);
      setExplainOpen(false);
      setGrantRequestId(null);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo completar",
      });
    }
  };

  const loading = providerLoading || (!!provider && vehicleLoading) || requestsLoading;

  const showLinkedBanner = !!dispatchId && mobilityGoVisible && driverEnrollmentComplete;
  const showRequestForm = canRequest && !pendingAny;
  const showRequestsList = requests.length > 0;

  if (!mobilityGoVisible || !driverEnrollmentComplete) {
    return null;
  }

  if (loading) {
    return (
      <Card className="card-industrial border-border/60 shadow-sm">
        <CardContent className="flex justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!showLinkedBanner && !showRequestForm && !showRequestsList) {
    return null;
  }

  return (
    <>
      <Card className="card-industrial border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Building2 className="h-5 w-5 text-primary" aria-hidden />
            Tu central (Applia Go)
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Solicitudes de afiliación a una empresa despachadora. Si la central pide datos adicionales, puedes
            autorizarlas de forma explícita.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {showLinkedBanner ? (
            <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-950 dark:text-emerald-100">
              <p className="font-medium text-foreground">Vinculado a empresa despachadora</p>
              <p className="mt-1 text-xs opacity-90">
                {linkedCompanyName ? `Central: ${linkedCompanyName}.` : "Tu cuenta ya tiene empresa despachadora asignada."}
              </p>
            </div>
          ) : null}

          {showRequestsList ? (
            <div className="space-y-4">
              {requests.map((r) => (
                <div
                  key={r.id}
                  id={`central-affiliation-${r.id}`}
                  className={`rounded-lg border p-4 ${
                    highlightId === r.id
                      ? "border-primary/60 bg-primary/5 ring-2 ring-primary/20"
                      : "border-border/70 bg-muted/10"
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-foreground">{r.companyName}</p>
                      <p className="text-xs text-muted-foreground">Solicitud del {new Date(r.createdAt).toLocaleString("es-EC")}</p>
                    </div>
                    <Badge variant={r.status === "pending" ? "default" : "secondary"}>{affiliationStatusLabel(r.status)}</Badge>
                  </div>
                  <Separator className="my-3" />
                  <p className="text-xs text-muted-foreground">
                    Acceso a correo y teléfono:{" "}
                    {r.dataAccessStatus === "none" && "No solicitado"}
                    {r.dataAccessStatus === "requested" && "Tu central espera tu autorización"}
                    {r.dataAccessStatus === "granted" && "Autorizado"}
                  </p>
                  {r.status === "pending" && r.dataAccessStatus === "requested" && (
                    <Button type="button" className="mt-3 w-full sm:w-auto" variant="secondary" onClick={() => openGrantFlow(r.id)}>
                      Ceder datos
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          {canRequest && pendingAny ? (
            <p className="text-sm text-muted-foreground">
              Ya tienes una solicitud de afiliación en revisión. Cuando la central responda, verás el estado arriba.
              También puedes seguir el estado desde{" "}
              <Link href="/my-services" className="font-medium text-primary underline-offset-4 hover:underline">
                Mis servicios
              </Link>
              .
            </p>
          ) : null}

          {showRequestForm ? (
            <div className="space-y-3 rounded-lg border border-dashed border-border/80 bg-muted/15 p-4">
              <p className="text-sm font-medium text-foreground">Solicitar afiliación a una central</p>
              <p className="text-xs text-muted-foreground">
                Si trabajas con una empresa despachadora, elige su nombre y envía la solicitud. Tu cuenta Applia sigue siendo
                tuya.
              </p>
              <RequestCentralAffiliationForm />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog open={explainOpen} onOpenChange={setExplainOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ceder datos a tu central</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Si continúas, la central podrá ver tu <strong className="text-foreground">correo electrónico</strong> y{" "}
                  <strong className="text-foreground">teléfono</strong> para coordinar operaciones, soporte o verificación.
                </p>
                <p className="font-medium text-foreground">Ventajas</p>
                <ul className="list-disc pl-4">
                  <li>Comunicación más ágil con quien despacha tus servicios.</li>
                  <li>Menos fricción si necesitan validar tu cuenta o tu vehículo.</li>
                </ul>
                <p className="font-medium text-foreground">Consideraciones</p>
                <ul className="list-disc pl-4">
                  <li>Esos datos dejan de estar ocultos solo para esa central.</li>
                  <li>Tu correo y contraseña de acceso a Applia siguen siendo tuyos; la central no los modifica desde su panel.</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setGrantRequestId(null);
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setExplainOpen(false);
                setSureOpen(true);
              }}
            >
              Entendido, continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={sureOpen} onOpenChange={setSureOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Seguro que deseas ceder tus datos?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción autoriza a tu central a ver tu correo y teléfono. Puedes contactar soporte si necesitas revocar el
              acceso en el futuro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setGrantRequestId(null);
              }}
            >
              No, cancelar
            </AlertDialogCancel>
            <AlertDialogAction disabled={grant.isPending} onClick={() => void handleGrant()}>
              {grant.isPending ? "Enviando…" : "Sí, ceder datos"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

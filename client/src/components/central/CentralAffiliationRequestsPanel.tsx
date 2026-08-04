import { useEffect, useMemo, useState } from "react";
import type { CentralAffiliationRequestRecord } from "@shared/central-affiliation";
import {
  useApproveCentralAffiliation,
  useCentralAffiliationRequests,
  useCentralApplicantPreview,
  useRejectCentralAffiliation,
  useRequestCentralDataAccess,
} from "@/hooks/use-central";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, UserPlus } from "lucide-react";
import { Separator } from "@/components/ui/separator";

function statusLabel(s: CentralAffiliationRequestRecord["status"]) {
  switch (s) {
    case "pending":
      return "Pendiente";
    case "approved":
      return "Aprobada";
    case "rejected":
      return "Rechazada";
    case "cancelled":
      return "Cancelada";
    default:
      return s;
  }
}

function dataAccessLabel(d: CentralAffiliationRequestRecord["dataAccessStatus"]) {
  switch (d) {
    case "none":
      return "Sin acceso ampliado";
    case "requested":
      return "Acceso solicitado al usuario";
    case "granted":
      return "Datos cedidos por el usuario";
    default:
      return d;
  }
}

export function CentralAffiliationRequestsPanel({
  companyId,
  highlightRequestId = null,
}: {
  companyId: string;
  /** Abre el detalle de la solicitud (p. ej. desde notificación). */
  highlightRequestId?: string | null;
}) {
  const { toast } = useToast();
  const { data: requests = [], isLoading, refetch } = useCentralAffiliationRequests(companyId);
  const requestAccess = useRequestCentralDataAccess(companyId);
  const approve = useApproveCentralAffiliation(companyId);
  const reject = useRejectCentralAffiliation(companyId);

  const [detailId, setDetailId] = useState<string | null>(null);
  const detailOpen = detailId != null;
  const { data: preview, isLoading: previewLoading } = useCentralApplicantPreview(
    detailOpen ? detailId : null,
    companyId,
  );

  const [confirmRejectId, setConfirmRejectId] = useState<string | null>(null);
  const [confirmApproveId, setConfirmApproveId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...requests].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [requests],
  );

  useEffect(() => {
    if (!highlightRequestId || isLoading) return;
    const row = requests.find((r) => r.id === highlightRequestId);
    if (row) setDetailId(highlightRequestId);
  }, [highlightRequestId, isLoading, requests]);

  const handleRequestData = async (requestId: string) => {
    try {
      const r = await requestAccess.mutateAsync(requestId);
      toast({
        title: r.alreadySent ? "Ya estaba enviada" : "Solicitud enviada",
        description: r.alreadySent
          ? "El usuario ya tiene una notificación pendiente para ceder datos."
          : "El conductor recibirá una notificación para autorizar el acceso a correo y teléfono.",
      });
      void refetch();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo enviar",
      });
    }
  };

  const runApprove = async (id: string) => {
    try {
      await approve.mutateAsync(id);
      toast({ title: "Solicitud aprobada", description: "El conductor quedó vinculado a tu central." });
      setConfirmApproveId(null);
      setDetailId(null);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo aprobar",
      });
    }
  };

  const runReject = async (id: string) => {
    try {
      await reject.mutateAsync(id);
      toast({ title: "Solicitud rechazada" });
      setConfirmRejectId(null);
      setDetailId(null);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo rechazar",
      });
    }
  };

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <UserPlus className="h-5 w-5 text-primary" aria-hidden />
          Solicitudes de conductores
        </CardTitle>
        <CardDescription>
          Conductores que se registraron en Applia Go y pidieron pertenecer a tu central. Puedes aprobar, rechazar o
          solicitar acceso a datos de contacto (con consentimiento del usuario).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay solicitudes en este momento.</p>
        ) : (
          <ul className="space-y-3">
            {sorted.map((row) => (
              <li key={row.id} className="rounded-lg border border-border/70 bg-muted/15 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Solicitud · {new Date(row.createdAt).toLocaleString("es-EC")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={row.status === "pending" ? "default" : "secondary"}>{statusLabel(row.status)}</Badge>
                      <Badge variant="outline">{dataAccessLabel(row.dataAccessStatus)}</Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setDetailId(row.id)}>
                      Ver detalle
                    </Button>
                    {row.status === "pending" && (
                      <>
                        {row.dataAccessStatus === "none" && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={requestAccess.isPending}
                            onClick={() => void handleRequestData(row.id)}
                          >
                            Solicitar datos
                          </Button>
                        )}
                        {row.dataAccessStatus === "requested" && (
                          <Button type="button" variant="secondary" size="sm" disabled>
                            Solicitud enviada
                          </Button>
                        )}
                        {row.dataAccessStatus === "granted" && (
                          <Button type="button" variant="secondary" size="sm" disabled>
                            Datos cedidos
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          disabled={approve.isPending}
                          onClick={() => setConfirmApproveId(row.id)}
                        >
                          Aprobar
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={reject.isPending}
                          onClick={() => setConfirmRejectId(row.id)}
                        >
                          Rechazar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={detailOpen} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle del solicitante</DialogTitle>
            <DialogDescription>
              Nombre y vehículo siempre visibles. Correo y teléfono solo si el usuario autorizó el acceso.
            </DialogDescription>
          </DialogHeader>
          {previewLoading || !preview ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-medium text-foreground">
                  {preview.applicant.name} {preview.applicant.lastName}
                </p>
                {preview.dataAccessGranted ? (
                  <>
                    <p className="mt-1 text-muted-foreground">{preview.applicant.email}</p>
                    <p className="text-muted-foreground">{preview.applicant.phone}</p>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Correo y teléfono ocultos hasta que el usuario acepte «Ceder datos» desde su panel.
                  </p>
                )}
              </div>
              <Separator />
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Vehículo</p>
                {preview.vehicle ? (
                  <p className="mt-1">
                    {preview.vehicle.brand} {preview.vehicle.model} ({preview.vehicle.model_year}) · Placa{" "}
                    {preview.vehicle.license_plate}
                  </p>
                ) : (
                  <p className="mt-1 text-muted-foreground">Sin vehículo registrado aún.</p>
                )}
              </div>
              <Separator />
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Verificación</p>
                {preview.verification.professionalCredentialUrl ? (
                  <a
                    href={preview.verification.professionalCredentialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-primary underline"
                  >
                    Ver documento enviado
                  </a>
                ) : (
                  <p className="mt-1 text-muted-foreground">El usuario no adjuntó documento en verificación.</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Estado imagen: {preview.verification.imageVerified ? "Verificada" : "No verificada / pendiente"}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDetailId(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmApproveId != null} onOpenChange={(o) => !o && setConfirmApproveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Aprobar afiliación?</AlertDialogTitle>
            <AlertDialogDescription>
              El conductor quedará asignado a tu central. Su cuenta se creó fuera de la central: no podrás cambiar su
              correo ni contraseña desde este panel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmApproveId) void runApprove(confirmApproveId);
              }}
            >
              Aprobar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRejectId != null} onOpenChange={(o) => !o && setConfirmRejectId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Rechazar solicitud?</AlertDialogTitle>
            <AlertDialogDescription>El conductor no quedará vinculado a tu central.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmRejectId) void runReject(confirmRejectId);
              }}
            >
              Rechazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

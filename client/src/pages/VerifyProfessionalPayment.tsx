import { useState, useMemo, useEffect } from "react";
import { isCarGoProvider } from "@shared/provider-car-go";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarIcon, ArrowLeft, Copy, Check, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { api } from "@shared/routes";
import { useAuth } from "@/hooks/use-auth";
import {
  usePatchProfessionalVerificationPayment,
  useCurrentProvider,
  useCategories,
  usePlatformSubscriptionFees,
  useProfessionalVerification,
  VERIFICATION_STATUS_ME,
  PROFESSIONAL_VERIFICATION_ME,
  type VerifyingStatusMeDto,
  type ProfessionalVerificationDto,
} from "@/hooks/use-mango-data";
import { isAssociateOnboardingDossierComplete } from "@shared/professional-verification";
import { consumeVerifyReturnPath, ensureDefaultVerifyReturnPath } from "@/lib/verify-return-path";
import { useToast } from "@/hooks/use-toast";
import qrGenfebUrl from "@/assets/images/genfeb_qr.png";

const BANK_ACCOUNT_NUMBER = "7700896747";
const DEFAULT_VERIFY_AMOUNT_USD = 15;

export default function VerifyProfessionalPayment() {
  const { isAuthenticated, user } = useAuth();
  const { data: currentProvider } = useCurrentProvider();
  const { data: categories = [] } = useCategories();
  const { data: subscriptionFees } = usePlatformSubscriptionFees();
  const provider = currentProvider ?? user?.provider;
  const isCarGo = useMemo(() => isCarGoProvider(provider ?? undefined, categories), [provider, categories]);
  const isRenewalSimple = Boolean((provider as { isVerified?: boolean } | undefined)?.isVerified);
  const verificationEnabled = Boolean(isAuthenticated && user?.provider);
  const { data: verificationForGate, isLoading: verificationGateLoading } =
    useProfessionalVerification(verificationEnabled);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const paymentMutation = usePatchProfessionalVerificationPayment();
  useEffect(() => {
    ensureDefaultVerifyReturnPath();
  }, []);
  const [transferDate, setTransferDate] = useState<Date | undefined>(undefined);
  const [transferCode, setTransferCode] = useState<string>("");
  const [subscriptionMonths, setSubscriptionMonths] = useState<number>(1);
  const categorySlug = useMemo(() => {
    const direct = typeof (provider as any)?.category === "string" ? String((provider as any).category).trim() : "";
    if (direct) return direct;
    const id = Number((provider as any)?.categoryId);
    if (!Number.isFinite(id)) return "";
    const cat = categories.find((c: any) => Number(c?.id) === id);
    return typeof (cat as any)?.slug === "string" ? String((cat as any).slug).trim() : "";
  }, [provider, categories]);
  const monthlyUsd = useMemo(() => {
    const map = (subscriptionFees as any)?.feesBySlug as Record<string, number> | undefined;
    const v = map && categorySlug ? Number(map[categorySlug]) : NaN;
    return Number.isFinite(v) ? v : DEFAULT_VERIFY_AMOUNT_USD;
  }, [subscriptionFees, categorySlug]);
  const [copied, setCopied] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const totalUsd = useMemo(() => monthlyUsd * subscriptionMonths, [monthlyUsd, subscriptionMonths]);

  const isFormValid = useMemo(() => {
    return transferDate != null && transferCode.trim() !== "";
  }, [transferDate, transferCode]);

  const handleCopyAccount = () => {
    navigator.clipboard.writeText(BANK_ACCOUNT_NUMBER);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = () => {
    setConfirmModalOpen(true);
  };

  const handleConfirmYes = () => {
    if (!transferDate) return;
    const transferDateStr = format(transferDate, "yyyy-MM-dd");
    paymentMutation.mutate(
      {
        transferDate: transferDateStr,
        transferReceiptCode: transferCode.trim(),
        subscriptionMonths,
      },
      {
        onSuccess: async () => {
          setConfirmModalOpen(false);
          toast({
            title: "Pago registrado",
            description: "Tu solicitud está en revisión.",
          });
          await queryClient.invalidateQueries({ queryKey: [VERIFICATION_STATUS_ME] });
          await queryClient.invalidateQueries({ queryKey: [api.providers.me.path] });
          await queryClient.invalidateQueries({ queryKey: [PROFESSIONAL_VERIFICATION_ME] });
          try {
            const token = localStorage.getItem("token");
            const authInit: RequestInit | undefined = token
              ? { headers: { Authorization: `Bearer ${token}` } }
              : undefined;
            const [status, prof] = await Promise.all([
              queryClient.fetchQuery<VerifyingStatusMeDto>({
                queryKey: [VERIFICATION_STATUS_ME],
                queryFn: async () => {
                  const res = await fetch(VERIFICATION_STATUS_ME, authInit);
                  if (!res.ok) throw new Error("No se pudo cargar el estado de verificación");
                  return res.json();
                },
              }),
              queryClient.fetchQuery<ProfessionalVerificationDto | null>({
                queryKey: [PROFESSIONAL_VERIFICATION_ME],
                queryFn: async () => {
                  const res = await fetch(PROFESSIONAL_VERIFICATION_ME, authInit);
                  if (res.status === 403) return null;
                  if (!res.ok) throw new Error("No se pudo cargar la verificación");
                  return res.json();
                },
              }),
            ]);
            const dossierOk = isRenewalSimple || isAssociateOnboardingDossierComplete(prof);
            if (
              dossierOk &&
              status.transacction_verified === "pending" &&
              (isRenewalSimple || status.identification_verified === "pending")
            ) {
              setLocation(consumeVerifyReturnPath());
              return;
            }
          } catch {
            /* continúa a pasos de verificación */
          }
          setLocation("/professional/verify");
        },
        onError: (err: Error) => {
          toast({
            title: "Error",
            description: err.message || "No se pudo registrar el pago.",
            variant: "destructive",
          });
        },
      }
    );
  };

  if (!isAuthenticated || !user?.provider) {
    return (
      <div className="container max-w-4xl py-12 px-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-center mb-4">Debes ser profesional e iniciar sesión.</p>
            <Button asChild className="w-full sm:w-auto">
              <Link href="/login">Iniciar sesión</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasIdAndCredentialForPayment =
    Boolean(String(verificationForGate?.imageUrl ?? "").trim()) &&
    Boolean(String(verificationForGate?.professionalCredentialUrl ?? "").trim());
  const canAccessPayment = isRenewalSimple || hasIdAndCredentialForPayment;

  if (verificationGateLoading) {
    return (
      <div className="container max-w-4xl py-16 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canAccessPayment) {
    return (
      <div className="container max-w-xl py-12 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Falta completar documentos</CardTitle>
            <CardDescription>
              Antes del pago necesitamos tu identificación y tu documento profesional
              {isCarGo ? " (licencia de conducir)" : ""}. Vuelve a los pasos y sube ambos archivos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/professional/verify">Ir a verificación</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="container max-w-6xl py-8 sm:py-12 px-4">
        <div className="mb-6">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary" asChild>
            <Link href="/professional/verify">
              <ArrowLeft className="h-4 w-4" />
              Volver a pasos
            </Link>
          </Button>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            Cuota de visibilidad — {monthlyUsd} USD / mes
          </h1>
          <p className="text-muted-foreground mt-1">
            Transferí el monto indicado y registrá la fecha (solo día) y el código. La cuota se renueva cada mes para
            seguir publicado en el catálogo; si pagás antes de vencer, al validar el comprobante se suma un mes desde tu
            vencimiento actual.
            {isCarGo ? (
              <>
                {" "}
                Este paso también forma parte de la verificación para que los clientes puedan usar tus servicios de Taxi.
              </>
            ) : null}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          <Card className="border-border bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Datos de la transferencia</CardTitle>
              <CardDescription>
                Selecciona cuántos meses estás pagando. Total: <strong>{totalUsd} USD</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Meses a pagar</Label>
                <Select value={String(subscriptionMonths)} onValueChange={(v) => setSubscriptionMonths(Math.max(1, Math.min(12, Number(v) || 1)))}>
                  <SelectTrigger className="w-full sm:max-w-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }).map((_, i) => {
                      const m = i + 1;
                      return (
                        <SelectItem key={m} value={String(m)}>
                          {m} mes{m === 1 ? "" : "es"} ({monthlyUsd * m} USD)
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Puedes pagar hasta 12 meses (1 año). El equipo validará tu comprobante y se sumarán los meses aprobados.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Fecha de la transferencia</Label>
                <p className="text-xs text-muted-foreground">Solo fecha (día), sin hora.</p>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full sm:max-w-sm justify-start text-left font-normal border-border",
                        !transferDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {transferDate ? format(transferDate, "PPP", { locale: es }) : "Elegir fecha"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-popover border-border" align="start">
                    <Calendar
                      mode="single"
                      selected={transferDate}
                      onSelect={setTransferDate}
                      locale={es}
                      disabled={(date) => date > new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">Código de transferencia</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="Código que te entrega el banco"
                  value={transferCode}
                  onChange={(e) => setTransferCode(e.target.value)}
                  className="bg-background border-border"
                />
              </div>

              <Button
                className="w-full mt-2"
                size="lg"
                disabled={!isFormValid || paymentMutation.isPending}
                onClick={handleSubmit}
              >
                {paymentMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Registré el pago de {totalUsd} USD
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-sm h-fit">
            <CardHeader>
              <CardTitle className="text-lg">Transferencia bancaria</CardTitle>
              <CardDescription>
                Escanea el código QR o usa el número de cuenta. Transfiere exactamente {totalUsd} USD.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <div className="rounded-xl border border-border bg-muted/30 p-4 mb-6">
                <img
                  src={qrGenfebUrl}
                  alt="QR para transferencia bancaria"
                  className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
                />
              </div>
              <div className="w-full space-y-2">
                <Label className="text-muted-foreground text-xs">Número de cuenta</Label>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-4 py-3">
                  <span className="font-mono text-lg font-semibold tracking-wider text-foreground flex-1">
                    {BANK_ACCOUNT_NUMBER}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={handleCopyAccount}
                    title="Copiar número"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={confirmModalOpen} onOpenChange={setConfirmModalOpen}>
        <DialogContent className="sm:max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle>¿Confirmas el pago?</DialogTitle>
            <DialogDescription>
              Solo confirma si ya transferiste {totalUsd} USD con los datos indicados. El equipo validará el comprobante
              y extenderá tu visibilidad por {subscriptionMonths} mes(es) desde tu vencimiento actual si renovás anticipado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmModalOpen(false)} disabled={paymentMutation.isPending}>
              No
            </Button>
            <Button onClick={handleConfirmYes} disabled={paymentMutation.isPending}>
              {paymentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Si, Confirmo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

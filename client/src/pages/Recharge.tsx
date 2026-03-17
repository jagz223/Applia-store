import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarIcon, Wallet, ArrowLeft, Copy, Check, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useRechargeRequest, useWallet } from "@/hooks/use-mango-data";
import { useToast } from "@/hooks/use-toast";

const BANK_ACCOUNT_NUMBER = "7700896747";

const formatUsd = (n: number) =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export default function Recharge() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const rechargeRequest = useRechargeRequest();
  const { data: walletData } = useWallet({ enabled: isAuthenticated });
  const wallet = typeof walletData?.wallet === "number" ? walletData.wallet : 0;
  const [amount, setAmount] = useState<string>("");
  const [transferDate, setTransferDate] = useState<Date | undefined>(undefined);
  const [transferTime, setTransferTime] = useState<string>("");
  const [transferCode, setTransferCode] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  const isFormValid = useMemo(() => {
    const amountNum = parseFloat(amount);
    return (
      Number.isFinite(amountNum) &&
      amountNum > 0 &&
      transferDate != null &&
      transferTime.trim() !== "" &&
      transferCode.trim() !== ""
    );
  }, [amount, transferDate, transferTime, transferCode]);

  const handleCopyAccount = () => {
    navigator.clipboard.writeText(BANK_ACCOUNT_NUMBER);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = () => {
    setConfirmModalOpen(true);
  };

  const handleConfirmNo = () => {
    setConfirmModalOpen(false);
  };

  const handleConfirmYes = () => {
    const amountNum = parseFloat(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0 || !transferDate) return;
    const transferDateStr = format(transferDate, "yyyy-MM-dd");
    rechargeRequest.mutate(
      {
        amount: amountNum,
        transferDate: transferDateStr,
        transferTime: transferTime.trim() || undefined,
        transferCode: transferCode.trim() || undefined,
      },
      {
        onSuccess: () => {
          setConfirmModalOpen(false);
          setLocation("/recharge/confirm");
        },
        onError: (err: Error) => {
          toast({
            title: "Error",
            description: err.message || "No se pudo enviar la solicitud de recarga.",
            variant: "destructive",
          });
        },
      }
    );
  };

  if (!isAuthenticated) {
    return (
      <div className="container max-w-4xl py-12 px-4">
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-center mb-4">
              Debes iniciar sesión para recargar tu wallet.
            </p>
            <Button asChild className="w-full sm:w-auto">
              <Link href="/login">Iniciar sesión</Link>
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
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Link>
          </Button>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Wallet className="h-8 w-8 text-primary" />
            Recargar wallet
          </h1>
          <p className="text-muted-foreground mt-1">
            Realiza una transferencia bancaria y registra los datos para acreditar el saldo.
          </p>
        </div>

        {/* Resumen de billetera: solo información de saldo disponible */}
        <Card className="border-border bg-card shadow-sm mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Tu billetera</CardTitle>
            <CardDescription>
              Saldo disponible en tu wallet para usar en tus pagos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <p className="text-sm text-muted-foreground">Saldo disponible</p>
              <p className="text-2xl font-semibold tabular-nums text-foreground">{formatUsd(wallet)}</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          <Card className="border-border bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Datos de la recarga</CardTitle>
              <CardDescription>
                Completa la información de tu transferencia para poder verificarla.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="amount">Cantidad a recargar (USD)</Label>
                <Input
                  id="amount"
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="Ej: 50.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="bg-background border-border"
                />
              </div>

              <div className="space-y-2">
                <Label>Fecha exacta de la recarga</Label>
                <div className="flex flex-wrap gap-3 items-center">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full sm:w-[240px] justify-start text-left font-normal border-border",
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
                  <Input
                    type="time"
                    value={transferTime}
                    onChange={(e) => setTransferTime(e.target.value)}
                    className="w-full sm:w-[120px] bg-background border-border"
                  />
                </div>
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
                disabled={!isFormValid || rechargeRequest.isPending}
                onClick={handleSubmit}
              >
                {rechargeRequest.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Enviar solicitud de recarga
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-sm h-fit">
            <CardHeader>
              <CardTitle className="text-lg">Transferencia bancaria</CardTitle>
              <CardDescription>
                Escanea el código QR o usa el número de cuenta para realizar la transferencia.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <div className="rounded-xl border border-border bg-muted/30 p-4 mb-6">
                <img
                  src="/qr-recharge.png"
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
            <DialogTitle>¿Ya realizó la transferencia?</DialogTitle>
            <DialogDescription>
              Confirme si ya realizó la transferencia bancaria para enviar la solicitud de recarga a nuestro equipo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleConfirmNo} disabled={rechargeRequest.isPending}>
              No
            </Button>
            <Button onClick={handleConfirmYes} disabled={rechargeRequest.isPending}>
              {rechargeRequest.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Sí
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

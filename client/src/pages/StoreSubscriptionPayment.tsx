import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, CalendarIcon, Check, Copy, Loader2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import qrAppliaUrl from "@/assets/images/applia_qr.png";

const BANK_ACCOUNT_NUMBER = "7700896747";

type StoreQuote = { monthlyUsd: number; label: string };

type StoreBySlugResponse = {
  store: {
    id: number;
    name: string;
    slug: string;
    ownerUserId: string;
    visibilityActive?: boolean;
    hasPendingSubscriptionPayment?: boolean;
  };
  isOwner: boolean;
  visibilityActive?: boolean;
};

export default function StoreSubscriptionPayment() {
  const [, params] = useRoute("/tienda/:slug/pago");
  const slug = params?.slug ?? "";
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [transferDate, setTransferDate] = useState<Date | undefined>();
  const [transferCode, setTransferCode] = useState("");
  const [subscriptionMonths, setSubscriptionMonths] = useState(1);
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: quote } = useQuery({
    queryKey: ["/api/stores/subscription-quote"],
    queryFn: async () => {
      const res = await fetch("/api/stores/subscription-quote");
      if (!res.ok) throw new Error("No se pudo cargar la cotización");
      return res.json() as Promise<StoreQuote>;
    },
  });

  const { data: storeData, isLoading: storeLoading } = useQuery({
    queryKey: ["/api/stores", slug],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/stores/${encodeURIComponent(slug)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Tienda no encontrada");
      }
      return res.json() as Promise<StoreBySlugResponse>;
    },
    enabled: Boolean(slug),
  });

  const monthlyUsd = quote?.monthlyUsd ?? 15;
  const monthlyUsdLabel = quote?.label ?? `USD ${monthlyUsd}`;
  const totalUsd = useMemo(() => monthlyUsd * subscriptionMonths, [monthlyUsd, subscriptionMonths]);
  const isOwner = storeData?.isOwner === true;
  const store = storeData?.store;
  const visibilityActive = storeData?.visibilityActive ?? store?.visibilityActive ?? false;

  const paymentMutation = useMutation({
    mutationFn: async () => {
      if (!store || !transferDate) throw new Error("Datos incompletos");
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/stores/${store.id}/subscription-payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          transferReceiptCode: transferCode.trim(),
          transferDate: format(transferDate, "yyyy-MM-dd"),
          subscriptionMonths,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Error al registrar pago");
      }
      return res.json();
    },
    onSuccess: async () => {
      setConfirmOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["/api/stores", slug] });
      await queryClient.invalidateQueries({ queryKey: ["/api/stores/mine"] });
      setLocation(`/tienda/${encodeURIComponent(slug)}?pago=enviado`);
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleCopyAccount = () => {
    void navigator.clipboard.writeText(BANK_ACCOUNT_NUMBER);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isAuthenticated) {
    return (
      <div className="container max-w-xl py-12 px-4">
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <p className="text-muted-foreground">Inicia sesión para pagar la mensualidad de tu tienda.</p>
            <Button asChild>
              <Link href={`/login?next=/tienda/${encodeURIComponent(slug)}/pago`}>Iniciar sesión</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (storeLoading) {
    return (
      <div className="container py-16 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!store || !isOwner) {
    return (
      <div className="container max-w-xl py-12 px-4">
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <p className="text-muted-foreground">Solo el dueño de la tienda puede registrar el pago aquí.</p>
            <Button asChild variant="outline">
              <Link href={`/tienda/${encodeURIComponent(slug)}`}>Volver a la tienda</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (visibilityActive) {
    return (
      <div className="container max-w-xl py-12 px-4">
        <Button variant="ghost" size="sm" className="mb-6 gap-2" asChild>
          <Link href={`/tienda/${encodeURIComponent(slug)}/admin`}>
            <ArrowLeft className="h-4 w-4" /> Ir al panel de tienda
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Tu tienda ya está activa</CardTitle>
            <CardDescription>
              La mensualidad fue validada. Puedes administrar productos y configuración desde el panel.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/tienda/${encodeURIComponent(slug)}/admin`}>Abrir panel</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/tienda/${encodeURIComponent(slug)}`}>Ver tienda</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (store.hasPendingSubscriptionPayment) {
    return (
      <div className="container max-w-xl py-12 px-4">
        <Button variant="ghost" size="sm" className="mb-6 gap-2" asChild>
          <Link href={`/tienda/${encodeURIComponent(slug)}`}>
            <ArrowLeft className="h-4 w-4" /> Volver a {store.name}
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Comprobante en revisión</CardTitle>
            <CardDescription>
              Ya enviaste un comprobante de pago. El equipo lo está validando y te notificaremos el resultado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href={`/tienda/${encodeURIComponent(slug)}`}>Volver a la tienda</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formValid = transferDate != null && transferCode.trim().length > 0;

  return (
    <>
      <div className="container max-w-6xl py-8 sm:py-12 px-4">
        <Button variant="ghost" size="sm" className="mb-6 gap-2" asChild>
          <Link href={`/tienda/${encodeURIComponent(slug)}`}>
            <ArrowLeft className="h-4 w-4" /> Volver a {store.name}
          </Link>
        </Button>

        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold">Activar tienda — {monthlyUsdLabel}/mes</h1>
          <p className="text-muted-foreground mt-1">
            Transfiere el monto indicado y registra la fecha y el código de la transferencia. Al validar el comprobante,
            tu tienda será visible en el catálogo.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Datos de la transferencia</CardTitle>
              <CardDescription>
                Total: <strong>{totalUsd} USD</strong> ({subscriptionMonths} mes
                {subscriptionMonths === 1 ? "" : "es"})
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Meses a pagar</Label>
                <Select
                  value={String(subscriptionMonths)}
                  onValueChange={(v) => setSubscriptionMonths(Math.max(1, Math.min(12, Number(v) || 1)))}
                >
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
              </div>

              <div className="space-y-2">
                <Label>Fecha de la transferencia</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full sm:max-w-sm justify-start",
                        !transferDate && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {transferDate ? format(transferDate, "PPP", { locale: es }) : "Elegir fecha"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={transferDate}
                      onSelect={setTransferDate}
                      locale={es}
                      disabled={(d) => d > new Date()}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">Código de transferencia</Label>
                <Input
                  id="code"
                  value={transferCode}
                  onChange={(e) => setTransferCode(e.target.value)}
                  placeholder="Código del banco"
                />
              </div>

              <Button
                className="w-full"
                size="lg"
                disabled={!formValid || paymentMutation.isPending}
                onClick={() => setConfirmOpen(true)}
              >
                {paymentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Registré el pago de {totalUsd} USD
              </Button>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-lg">Transferencia bancaria</CardTitle>
              <CardDescription>Escanea el QR o usa el número de cuenta.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <div className="rounded-xl border p-4 mb-6 bg-muted/30">
                <img src={qrAppliaUrl} alt="QR bancario Applia" className="w-48 h-48 object-contain" />
              </div>
              <div className="w-full flex items-center gap-2 rounded-lg border px-4 py-3">
                <span className="font-mono text-lg font-semibold flex-1">{BANK_ACCOUNT_NUMBER}</span>
                <Button variant="ghost" size="icon" onClick={handleCopyAccount} title="Copiar">
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Confirmas el pago?</DialogTitle>
            <DialogDescription>
              Solo confirma si ya transferiste {totalUsd} USD. El equipo validará tu comprobante.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              No
            </Button>
            <Button disabled={paymentMutation.isPending} onClick={() => paymentMutation.mutate()}>
              Sí, confirmo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useBookings, useConfirmBookingByClient, useUpdateBookingStatus } from "@/hooks/use-mango-data";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Calendar,
  Loader2,
  ArrowLeft,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Package,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toDate } from "@/lib/date-utils";

const listItemMotion = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: "easeOut" },
};

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }
> = {
  pending: { label: "Pendiente", variant: "secondary", icon: Clock },
  confirmed: { label: "Confirmada", variant: "default", icon: CheckCircle },
  in_progress: { label: "En proceso", variant: "default", icon: Package },
  completed: { label: "Completada", variant: "outline", icon: CheckCircle },
  cancelled: { label: "Cancelada", variant: "destructive", icon: XCircle },
};

export default function Bookings() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: bookings, isLoading: bookingsLoading, isFetching, isError: bookingsError, refetch: refetchBookings } = useBookings({ enabled: isAuthenticated });
  const confirmPayment = useConfirmBookingByClient();
  const updateStatus = useUpdateBookingStatus();
  const [location] = useLocation();
  const [highlightedBookingId, setHighlightedBookingId] = useState<number | null>(null);
  const [bookingToConfirm, setBookingToConfirm] = useState<(typeof list)[number] | null>(null);
  const [subTab, setSubTab] = useState<"new" | "pending" | "done">("new");
  const [showAllHistory, setShowAllHistory] = useState(false);

  const list = (Array.isArray(bookings) ? [...bookings] : []) as Array<{
    id: number;
    serviceId: number;
    date: string | Date;
    status: string;
    cost?: number;
    confirmedByClient?: boolean;
    notes?: string | null;
    createdAt?: string | Date;
    paymentMethod?: string;
    service?: { id: number; title: string; price?: string; provider?: { userId?: string; user?: { firstName?: string; lastName?: string } } };
  }>;

  // Ordenar del más nuevo al más viejo, tomando en cuenta fecha de creación
  // (y usando la fecha de la reserva como respaldo).
  list.sort((a, b) => {
    const aCreated = (a as any).createdAt ?? a.date;
    const bCreated = (b as any).createdAt ?? b.date;
    const aTime = toDate(aCreated).getTime();
    const bTime = toDate(bCreated).getTime();
    return bTime - aTime;
  });

  const newOnes = list.filter((b) => b.status === "pending");
  const pending = list.filter((b) => b.status === "confirmed" || b.status === "in_progress");
  const done = list.filter((b) => b.status === "completed" || b.status === "cancelled");

  const renderBookingCard = (booking: (typeof list)[number]) => {
    const config = STATUS_CONFIG[booking.status] ?? STATUS_CONFIG.pending;
    const Icon = config.icon;
    const date = toDate(booking.date);
    const needsClientConfirmation = booking.status === "confirmed" && !booking.confirmedByClient;
    const cost = typeof booking.cost === "number" ? booking.cost : (booking.service?.price != null ? Number(booking.service.price) : 0);
    const isHighlighted = highlightedBookingId != null && booking.id === highlightedBookingId;

    return (
      <motion.li
        key={booking.id}
        data-booking-id={booking.id}
        {...listItemMotion}
        className={isHighlighted ? "notification-highlight" : ""}
      >
        <Card className={needsClientConfirmation ? "ring-2 ring-primary/50" : ""}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <CardTitle className="text-lg">
                {(booking as { service?: { title?: string } }).service?.title ?? "Servicio"}
              </CardTitle>
              <Badge variant={config.variant} className="gap-1 shrink-0">
                <Icon className="h-3 w-3" />
                {config.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {booking.service?.provider?.user
                ? `${booking.service.provider.user.firstName ?? ""} ${booking.service.provider.user.lastName ?? ""}`.trim() || "Asociado"
                : "Asociado"}
            </p>
            {(cost > 0 || (booking.service?.price != null && Number(booking.service.price) > 0)) && (
              <p className="text-sm font-medium text-foreground mt-1">
                Precio: {cost > 0 ? `${Number(cost).toFixed(2)}` : Number(booking.service?.price ?? 0).toFixed(2)} USD
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {needsClientConfirmation && (
              <div className="rounded-lg bg-primary/10 border border-primary/20 p-4 space-y-3">
                <p className="font-medium flex items-center gap-2 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                  {booking.paymentMethod === "cash" 
                    ? "Confirmar inicio de servicio (Efectivo)" 
                    : "Confirmar pago y retener fondos"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {booking.paymentMethod === "cash" 
                    ? `El asociado ha confirmado esta reserva. Al confirmar, aceptas que el servicio se pagará en Efectivo ($${Number(cost).toFixed(2)} USD) directamente al profesional.`
                    : `El asociado ha confirmado esta reserva. Para retener el monto en escrow y permitir que complete el trabajo, confirma el pago. Se descontará $${Number(cost).toFixed(2)} USD de tu Saldo Genfeb.`}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => setBookingToConfirm(booking)}
                    disabled={confirmPayment.isPending || updateStatus.isPending}
                    className="gap-2"
                  >
                    {confirmPayment.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Procesando…
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-4 w-4" />
                        Confirmar
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => updateStatus.mutate({ id: booking.id, status: "cancelled" })}
                    disabled={confirmPayment.isPending || updateStatus.isPending}
                    className="gap-2"
                  >
                    {updateStatus.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
            {booking.status === "pending" && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => updateStatus.mutate({ id: booking.id, status: "cancelled" })}
                  disabled={updateStatus.isPending}
                  className="gap-2"
                >
                  {updateStatus.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  Cancelar reserva
                </Button>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>{format(date, "PPP", { locale: es })}</span>
              </div>
              {booking.notes && (
                <p className="text-sm text-muted-foreground line-clamp-2 max-w-md">{booking.notes}</p>
              )}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={
                      (booking as { service?: { provider?: { userId?: string } }; id: number }).service?.provider?.userId
                        ? `/chat?with=${(booking as { service?: { provider?: { userId?: string } } }).service?.provider?.userId}&bookingId=${booking.id}`
                        : "/chat"
                    }
                    className="gap-1.5"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Chat
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/service/${booking.serviceId}`}>Ver servicio</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.li>
    );
  };

  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const params = new URLSearchParams(search);
    const highlight = params.get("highlight");
    if (highlight) {
      const id = parseInt(highlight, 10);
      if (!Number.isNaN(id)) {
        setHighlightedBookingId(id);
        const t = setTimeout(() => {
          setHighlightedBookingId(null);
          if (typeof window !== "undefined" && window.history.replaceState) {
            params.delete("highlight");
            const newSearch = params.toString();
            window.history.replaceState(null, "", newSearch ? `?${newSearch}` : window.location.pathname);
          }
        }, 2800);
        return () => clearTimeout(t);
      }
    }
  }, [location]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const handler = (e: CustomEvent<{ bookingId: number }>) => {
      const id = e.detail?.bookingId;
      if (id != null) {
        setHighlightedBookingId(id);
        timeoutId = setTimeout(() => setHighlightedBookingId(null), 2800);
      }
    };
    window.addEventListener("bookings-page-highlight", handler as EventListener);
    return () => {
      window.removeEventListener("bookings-page-highlight", handler as EventListener);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // Al venir con highlight (desde notificaciones), movemos el viewport hacia la tarjeta resaltada.
  useEffect(() => {
    if (highlightedBookingId == null) return;
    if (typeof window === "undefined") return;

    const t = window.setTimeout(() => {
      const el = document.querySelector(`[data-booking-id="${highlightedBookingId}"]`) as HTMLElement | null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);

    return () => window.clearTimeout(t);
  }, [highlightedBookingId]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="container max-w-2xl py-16 text-center">
        <AlertCircle className="h-14 w-14 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-display font-bold mb-2">Inicia sesión para ver tus reservas</h2>
        <p className="text-muted-foreground mb-6">Tus reservas aparecerán aquí una vez que hayas iniciado sesión.</p>
        <Button asChild>
          <Link href="/login">Iniciar sesión</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <Dialog open={bookingToConfirm != null} onOpenChange={(open) => !open && setBookingToConfirm(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {bookingToConfirm?.paymentMethod === "cash" 
                ? "¿Confirmar servicio en efectivo?" 
                : "¿El monto es el correcto?"}
            </DialogTitle>
            <DialogDescription>
              {bookingToConfirm?.paymentMethod === "cash"
                ? "Confirma si estás de acuerdo con iniciar este servicio. El pago se realizará en efectivo directamente al profesional al finalizar el trabajo."
                : "Confirma solo si estás de acuerdo con que este sea el monto decidido para el trabajo acordado. Al confirmar, se descontará el monto de tu Saldo Genfeb y se retendrán los fondos para este servicio."}
            </DialogDescription>
          </DialogHeader>
          {bookingToConfirm && (
            <div className="mt-3 space-y-2 text-sm">
              <p className="font-medium">
                Servicio: {(bookingToConfirm as any).service?.title ?? "Servicio"}
              </p>
              <p className="text-muted-foreground">
                Fecha programada:{" "}
                {format(toDate(bookingToConfirm.date), "PPP p", { locale: es })}
              </p>
              <p className="text-muted-foreground">
                Monto a confirmar:{" "}
                <span className="font-semibold">
                  $
                  {Number(
                    typeof bookingToConfirm.cost === "number"
                      ? bookingToConfirm.cost
                      : (bookingToConfirm.service?.price != null
                          ? Number(bookingToConfirm.service.price)
                          : 0)
                  ).toFixed(2)}{" "}
                  USD
                </span>
              </p>
            </div>
          )}
          <DialogFooter className="mt-4 flex flex-col sm:flex-row sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBookingToConfirm(null)}
              disabled={confirmPayment.isPending}
            >
              En desacuerdo
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!bookingToConfirm) return;
                confirmPayment.mutate(bookingToConfirm.id, {
                  onSuccess: () => setBookingToConfirm(null),
                  onError: () => {
                    // Si hay error, mantenemos el diálogo abierto para que el usuario pueda reintentar o leer el mensaje del toast
                  },
                } as any);
              }}
              disabled={confirmPayment.isPending}
              className="gap-2"
            >
              {confirmPayment.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Confirmando...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  Estoy de acuerdo
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link href="/" className="inline-flex items-center text-muted-foreground hover:text-primary mb-6 transition-colors">
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver al inicio
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold flex items-center gap-2">
              <Calendar className="h-8 w-8 text-primary" />
              Mis Reservas
            </h1>
            <p className="text-muted-foreground mt-1">Todas las reservas que has realizado.</p>
          </div>
        </div>

        {!isAuthenticated ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Calendar className="h-14 w-14 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Inicia sesión para ver tus reservas</h3>
              <p className="text-muted-foreground mb-6 max-w-sm">
                Las reservas que realices desde la ficha del servicio aparecerán aquí una vez que hayas iniciado sesión.
              </p>
              <Button asChild>
                <Link href="/login">Iniciar sesión</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (bookingsLoading || isFetching) ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground">Cargando reservas...</p>
          </div>
        ) : bookingsError ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="h-14 w-14 text-destructive mb-4" />
              <h3 className="text-lg font-semibold mb-2">Error al cargar reservas</h3>
              <p className="text-muted-foreground mb-6 max-w-sm">
                No se pudieron cargar tus reservas. Comprueba tu conexión e intenta de nuevo.
              </p>
              <Button onClick={() => refetchBookings()} variant="outline">
                Reintentar
              </Button>
            </CardContent>
          </Card>
        ) : !bookings?.length ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Calendar className="h-14 w-14 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No tienes reservas</h3>
              <p className="text-muted-foreground mb-6 max-w-sm">
                Cuando reserves un servicio desde la ficha del servicio, aparecerá aquí.
              </p>
              <Button asChild>
                <Link href="/explore">Explorar servicios</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs value={subTab} onValueChange={(v) => setSubTab(v as any)} className="w-full">
            <TabsList className="flex w-full flex-nowrap items-stretch gap-1 h-auto p-1 bg-muted/50 overflow-x-auto">
              <TabsTrigger
                value="new"
                className="gap-1 px-2 py-2 text-xs max-[360px]:gap-0.5 max-[360px]:px-2 max-[360px]:py-2 max-[360px]:min-w-[120px] max-[360px]:flex-col max-[360px]:whitespace-normal data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <Clock className="h-4 w-4" />
                <span className="leading-tight max-[360px]:text-[11px] whitespace-normal">Servicios nuevos</span>
                <Badge variant="secondary" className="ml-0 max-[360px]:px-1 max-[360px]:text-[12px] max-[360px]:w-auto">{newOnes.length}</Badge>
              </TabsTrigger>
              <TabsTrigger
                value="pending"
                className="gap-1 px-2 py-2 text-xs max-[360px]:gap-1 max-[360px]:px-2 max-[360px]:py-2 min-w-[120px] max-[360px]:min-w-[100px] data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <Package className="h-4 w-4" />
                <span>Pendientes</span>
                <Badge variant="secondary" className="ml-0 max-[360px]:px-1 max-[360px]:text-[12px]">{pending.length}</Badge>
              </TabsTrigger>
              <TabsTrigger
                value="done"
                className="gap-1 px-2 py-2 text-xs max-[360px]:gap-1 max-[360px]:px-2 max-[360px]:py-2 min-w-[120px] max-[360px]:min-w-[100px] data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <CheckCircle className="h-4 w-4" />
                <span>Finalizados</span>
                <Badge variant="secondary" className="ml-0 max-[360px]:px-1 max-[360px]:text-[12px]">{done.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="new" className="mt-6 space-y-4 focus-visible:outline-none">
              {newOnes.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-10 text-center text-muted-foreground">No tienes servicios nuevos.</CardContent>
                </Card>
              ) : (
                <ul className="space-y-4">{newOnes.map(renderBookingCard)}</ul>
              )}
            </TabsContent>

            <TabsContent value="pending" className="mt-6 space-y-4 focus-visible:outline-none">
              {pending.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-10 text-center text-muted-foreground">No tienes servicios pendientes.</CardContent>
                </Card>
              ) : (
                <ul className="space-y-4">{pending.map(renderBookingCard)}</ul>
              )}
            </TabsContent>

            <TabsContent value="done" className="mt-6 space-y-4 focus-visible:outline-none">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Completados o cancelados.</p>
                {done.length > 6 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-muted-foreground"
                    onClick={() => setShowAllHistory((v) => !v)}
                  >
                    {showAllHistory ? "Ocultar historial completo" : "Ver historial completo"}
                  </Button>
                )}
              </div>
              {done.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-10 text-center text-muted-foreground">Aún no tienes servicios finalizados.</CardContent>
                </Card>
              ) : (
                <ul className="space-y-4">{done.slice(0, showAllHistory ? done.length : 6).map(renderBookingCard)}</ul>
              )}
            </TabsContent>
          </Tabs>
        )}
        </div>
      </div>
    </>
  );
}

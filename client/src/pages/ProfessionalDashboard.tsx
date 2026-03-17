import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { 
  DollarSign, TrendingUp, Calendar, Users, 
  Star, Clock, CreditCard, FileText,
  BarChart3, PieChart, Activity, Loader2, MessageSquare,
  CheckCircle2, XCircle, Banknote, Inbox, PlayCircle, History
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useSocketBookings } from "@/hooks/use-socket";
import {
  useBookingsByProvider,
  useUpdateBookingStatus,
  useUpdateBookingCost,
  useUpdateBookingSchedule,
  useProfessionalStats,
  useWallet,
  useWithdraw,
  useWalletTransfers,
} from "@/hooks/use-mango-data";
import { useToast } from "@/hooks/use-toast";
import { debouncedRefetch } from "@/lib/refetch-utils";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toDate } from "@/lib/date-utils";

const formatUsd = (n: number) =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// Mock data solo para calificación y transacciones recientes (no hay API aún)
const mockBookings = {
  total: 156,
  completed: 134,
  pending: 12,
  cancelled: 10,
};

const mockRating = {
  average: 4.8,
  total: 89,
  breakdown: [
    { stars: 5, count: 72 },
    { stars: 4, count: 12 },
    { stars: 3, count: 3 },
    { stars: 2, count: 1 },
    { stars: 1, count: 1 },
  ],
};

const mockRecentTransactions = [
  { id: 1, client: "Juan Pérez", service: "Electricista", amount: 85, date: "2024-01-15", status: "completed" },
  { id: 2, client: "María López", service: "Plomería", amount: 120, date: "2024-01-14", status: "completed" },
  { id: 3, client: "Carlos García", service: "Pintura", amount: 200, date: "2024-01-13", status: "pending" },
  { id: 4, client: "Ana Martínez", service: "Limpieza", amount: 65, date: "2024-01-12", status: "completed" },
  { id: 5, client: "Pedro Sánchez", service: "Jardinería", amount: 90, date: "2024-01-11", status: "completed" },
];

const mockMonthlyData = [
  { month: "Ene", earnings: 2800 },
  { month: "Feb", earnings: 3200 },
  { month: "Mar", earnings: 2900 },
  { month: "Abr", earnings: 3500 },
  { month: "May", earnings: 3100 },
  { month: "Jun", earnings: 3250 },
];

const STATUS_OPTIONS = [
  { value: "pending", label: "Pendiente" },
  { value: "confirmed", label: "Confirmada" },
  { value: "in_progress", label: "En proceso" },
  { value: "completed", label: "Completada" },
  { value: "cancelled", label: "Cancelada" },
];

function ResumenActividad() {
  const { data: stats, isLoading } = useProfessionalStats();
  const total = (stats?.completedCount ?? 0) + (stats?.rejectedCount ?? 0);
  const completedPct = total > 0 ? Math.round(((stats?.completedCount ?? 0) / total) * 100) : 0;
  const rejectedPct = total > 0 ? Math.round(((stats?.rejectedCount ?? 0) / total) * 100) : 0;

  if (isLoading) {
    return (
      <Card className="mb-6 border-border bg-card">
        <CardHeader>
          <CardTitle>Resumen de Actividad</CardTitle>
          <CardDescription>Estadísticas de servicios completados, rechazados y ganancias</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6 border-border bg-card">
      <CardHeader>
        <CardTitle>Resumen de Actividad</CardTitle>
        <CardDescription>Estadísticas de servicios completados, rechazados y ganancias</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Ganancias Totales - resaltada */}
          <Card className="border-2 border-green-500/30 bg-green-500/5 dark:bg-green-500/10">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Ganancias Totales</CardTitle>
              <Banknote className="h-5 w-5 text-green-600 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                {new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(stats?.totalEarnings ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Todo lo generado con tus servicios completados</p>
            </CardContent>
          </Card>

          {/* Servicios Completados */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Servicios Completados</CardTitle>
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.completedCount ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Servicios con estado completado</p>
            </CardContent>
          </Card>

          {/* Servicios Rechazados */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Servicios Rechazados</CardTitle>
              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.rejectedCount ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Servicios con estado rechazado</p>
            </CardContent>
          </Card>
        </div>

        {/* Gráfico circular: completados vs rechazados */}
        {(total > 0) && (
          <div className="flex flex-col sm:flex-row items-center gap-6 pt-4 border-t border-border">
            <div className="flex-shrink-0">
              <div className="relative w-32 h-32 mx-auto">
                <div
                  className="w-32 h-32 rounded-full"
                  style={{
                    background: `conic-gradient(
                      hsl(var(--chart-1)) 0deg ${completedPct * 3.6}deg,
                      hsl(var(--destructive)) ${completedPct * 3.6}deg 360deg
                    )`,
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full bg-card border-2 border-border" />
                </div>
              </div>
              <div className="text-center text-sm text-muted-foreground mt-2">Completados vs Rechazados</div>
            </div>
            <div className="flex-1 w-full sm:w-auto space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[hsl(var(--chart-1))]" />
                <span className="text-sm">Completados: {stats?.completedCount ?? 0} ({completedPct}%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-destructive" />
                <span className="text-sm">Rechazados: {stats?.rejectedCount ?? 0} ({rejectedPct}%)</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type BookingItem = {
  id: number;
  serviceId: number;
  date: string | Date | { _seconds?: number };
  status: string;
  cost?: number;
  confirmedByClient?: boolean;
  notes?: string | null;
  user?: { firstName?: string; lastName?: string; name?: string };
  service?: { title: string; price?: string };
  userId?: string;
};

const BOOKINGS_SUB_TABS = ["pending", "in_progress", "ready", "history"] as const;
type BookingsSubTab = (typeof BOOKINGS_SUB_TABS)[number];

function ProviderBookingsTab({ highlightedBookingId = null }: { highlightedBookingId?: number | null }) {
  const { data: bookings, isLoading } = useBookingsByProvider();
  const updateStatus = useUpdateBookingStatus();
  const updateCost = useUpdateBookingCost();
  const updateSchedule = useUpdateBookingSchedule();
  const { notifyBookingUpdate } = useSocketBookings();
  const [costInputs, setCostInputs] = useState<Record<number, string>>({});
  const [scheduleInputs, setScheduleInputs] = useState<Record<number, { date: string; time: string }>>({});
  const [subTab, setSubTab] = useState<BookingsSubTab>("pending");

  const list = (bookings ?? []) as BookingItem[];
  const pending = useMemo(() => list.filter((b) => b.status === "pending"), [list]);
  const ready = useMemo(
    () =>
      list.filter(
        (b) => (b.status === "confirmed" || b.status === "in_progress") && b.confirmedByClient === true,
      ),
    [list],
  );
  const inProgress = useMemo(
    () =>
      list.filter(
        (b) => (b.status === "confirmed" || b.status === "in_progress") && b.confirmedByClient !== true,
      ),
    [list],
  );
  const history = useMemo(
    () => list.filter((b) => b.status === "completed" || b.status === "cancelled"),
    [list]
  );

  function renderBookingRow(booking: BookingItem) {
    const date = toDate(booking.date);
    const dateStr = format(date, "yyyy-MM-dd");
    const timeStr = format(date, "HH:mm");
    const clientName = booking.user
      ? [booking.user.firstName ?? booking.user.name, booking.user.lastName].filter(Boolean).join(" ") || "Cliente"
      : "Cliente";
    const isPending = booking.status === "pending";
    const canComplete = booking.confirmedByClient === true;
    const savedCost = typeof booking.cost === "number" ? booking.cost : Number(booking.cost) || 0;
    const refPrice = booking.service?.price != null ? Number(booking.service.price) : 0;
    const currentCost = savedCost > 0 ? savedCost : refPrice;
    const costDisplay = costInputs[booking.id] ?? String(currentCost);
    const hasValidCost = savedCost > 0;
    const scheduleDisplay = scheduleInputs[booking.id] ?? { date: dateStr, time: timeStr };
    const handleCostBlur = () => {
      const num = parseFloat(costDisplay.replace(",", "."));
      if (!Number.isFinite(num) || num < 0) return;
      updateCost.mutate(
        { id: booking.id, cost: num },
        { onSuccess: () => setCostInputs((prev) => ({ ...prev, [booking.id]: String(num) })) }
      );
    };
    const handleSaveCost = () => handleCostBlur();
    const handleSaveSchedule = () => {
      const iso = `${scheduleDisplay.date}T${scheduleDisplay.time}:00`;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return;
      updateSchedule.mutate(
        { id: booking.id, date: d.toISOString() },
        { onSuccess: () => setScheduleInputs((prev) => ({ ...prev, [booking.id]: scheduleDisplay })) }
      );
    };
    const isHighlighted = highlightedBookingId != null && booking.id === highlightedBookingId;
    return (
      <motion.div
        key={booking.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className={`flex flex-wrap items-start justify-between gap-4 p-4 border border-border rounded-lg bg-card ${isHighlighted ? "notification-highlight" : ""}`}
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{booking.service?.title ?? "Servicio"}</p>
          <p className="text-sm text-muted-foreground">Cliente: {clientName}</p>
          {isPending ? (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">Fecha y hora del servicio:</span>
              <Input
                type="date"
                className="w-[140px] h-9 text-sm border-primary/30"
                value={scheduleDisplay.date}
                onChange={(e) => setScheduleInputs((prev) => ({ ...prev, [booking.id]: { ...scheduleDisplay, date: e.target.value } }))}
                disabled={updateSchedule.isPending}
              />
              <Input
                type="time"
                className="w-[100px] h-9 text-sm border-primary/30"
                value={scheduleDisplay.time}
                onChange={(e) => setScheduleInputs((prev) => ({ ...prev, [booking.id]: { ...scheduleDisplay, time: e.target.value } }))}
                disabled={updateSchedule.isPending}
              />
              <Button type="button" size="sm" variant="secondary" onClick={handleSaveSchedule} disabled={updateSchedule.isPending}>
                {updateSchedule.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar fecha"}
              </Button>
              <span className="text-xs text-muted-foreground">Si acuerdan otro día con el cliente, actualiza aquí.</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">{format(date, "PPP p", { locale: es })}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-sm font-medium text-foreground">Costo (USD):</span>
            {isPending ? (
              <>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder={refPrice > 0 ? String(refPrice) : "0.00"}
                  className="w-28 h-9 text-sm font-medium border-primary/30 focus-visible:ring-primary"
                  value={costDisplay}
                  onChange={(e) => setCostInputs((prev) => ({ ...prev, [booking.id]: e.target.value }))}
                  onBlur={handleCostBlur}
                  disabled={updateCost.isPending}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleSaveCost}
                  disabled={updateCost.isPending}
                >
                  {updateCost.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar costo"}
                </Button>
                {!hasValidCost && (
                  <span className="text-xs text-amber-600 dark:text-amber-500">Asigna el monto y guarda antes de confirmar la reserva.</span>
                )}
              </>
            ) : (
              <span className="text-sm font-semibold text-primary">${Number(currentCost).toFixed(2)}</span>
            )}
          </div>
          {!isPending && booking.service?.price != null && (
            <p className="text-xs text-muted-foreground mt-0.5">Precio ref. servicio: ${Number(booking.service.price).toFixed(0)}</p>
          )}
          {booking.notes && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">Notas: {booking.notes}</p>
          )}
          <div className="flex items-center gap-2 mt-3">
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link href={booking.userId ? `/chat?with=${booking.userId}&bookingId=${booking.id}` : "/chat"}>
                <MessageSquare className="h-4 w-4" />
                Chat
              </Link>
            </Button>
            <Button variant="link" className="h-auto p-0 text-primary" asChild>
              <Link href={`/service/${booking.serviceId}`}>Ver servicio</Link>
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Badge variant={booking.status === "completed" ? "default" : booking.status === "cancelled" ? "destructive" : "secondary"}>
            {STATUS_OPTIONS.find((o) => o.value === booking.status)?.label ?? booking.status}
          </Badge>
          {(booking.status === "pending" || booking.status === "confirmed" || booking.status === "in_progress") && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="inline-block">
                    <Select
                      value={booking.status}
                      onValueChange={(value) =>
                        updateStatus.mutate(
                          { id: booking.id, status: value },
                          {
                            onSuccess: (updated) => {
                              // Para evitar notificaciones duplicadas en el cliente:
                              // cuando el estado pasa a "confirmed" ya existe una notificación específica
                              // "booking_confirmed_by_provider", así que no emitimos el genérico "booking_update".
                              if (value !== "confirmed" && booking.userId && notifyBookingUpdate) {
                                notifyBookingUpdate(booking.userId, updated ?? { ...booking, status: value });
                              }
                            },
                          }
                        )
                      }
                      disabled={updateStatus.isPending}
                    >
                      <SelectTrigger className="w-[160px] bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((opt) => (
                          <SelectItem
                            key={opt.value}
                            value={opt.value}
                            disabled={
                              ((opt.value === "completed" || opt.value === "in_progress") && !canComplete) ||
                              (opt.value === "confirmed" && isPending && !hasValidCost)
                            }
                          >
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {isPending && !hasValidCost
                    ? "Asigna un monto y pulsa Guardar costo antes de confirmar la reserva."
                    : !canComplete && (booking.status === "confirmed" || booking.status === "in_progress")
                      ? "Debes esperar a que el cliente confirme el pago antes de marcar como En proceso o Completada."
                      : "Cambiar estado de la reserva"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </motion.div>
    );
  }

  function renderEmpty(message: string) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 py-12 text-center">
        <p className="text-muted-foreground">{message}</p>
      </div>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-xl">Gestión de reservas</CardTitle>
        <CardDescription>
          Solicitudes de clientes: asigna precios, confirma reservas y actualiza el estado de cada servicio.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs value={subTab} onValueChange={(v) => setSubTab(v as BookingsSubTab)} className="w-full">
          <TooltipProvider>
            <TabsList className="flex w-full flex-nowrap items-stretch gap-1 h-auto p-1 bg-muted/50 overflow-x-auto">
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="pending" className="gap-2 py-2.5 min-w-[64px] data-[state=active]:bg-background data-[state=active]:shadow-sm">
                    <Inbox className="h-4 w-4" />
                    <span className="hidden sm:inline">Solicitudes pendientes</span>
                    <Badge variant="secondary" className="ml-1">{pending.length}</Badge>
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>Solicitudes pendientes</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="in_progress" className="gap-2 py-2.5 min-w-[64px] data-[state=active]:bg-background data-[state=active]:shadow-sm">
                    <PlayCircle className="h-4 w-4" />
                    <span className="hidden sm:inline">En espera</span>
                    <Badge variant="secondary" className="ml-1">{inProgress.length}</Badge>
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>Reservas en espera</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="ready" className="gap-2 py-2.5 min-w-[64px] data-[state=active]:bg-background data-[state=active]:shadow-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Listas</span>
                    <Badge variant="secondary" className="ml-1">{ready.length}</Badge>
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>Listas para completar</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="history" className="gap-2 py-2.5 min-w-[64px] data-[state=active]:bg-background data-[state=active]:shadow-sm">
                    <History className="h-4 w-4" />
                    <span className="hidden sm:inline">Historial</span>
                    <Badge variant="secondary" className="ml-1">{history.length}</Badge>
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>Historial</TooltipContent>
              </Tooltip>
            </TabsList>
          </TooltipProvider>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <TabsContent value="pending" className="mt-6 space-y-4 focus-visible:outline-none">
                <p className="text-sm text-muted-foreground">
                  Asigna el costo y confirma la reserva para que el cliente pueda confirmar el pago.
                </p>
                {pending.length === 0 ? renderEmpty("No hay solicitudes pendientes. Las nuevas reservas aparecerán aquí.") : (
                  <div className="space-y-4">{pending.map(renderBookingRow)}</div>
                )}
              </TabsContent>
              <TabsContent value="in_progress" className="mt-6 space-y-4 focus-visible:outline-none">
                <p className="text-sm text-muted-foreground">
                  Reservas aceptadas: en espera de confirmación de pago del cliente o ya en ejecución.
                </p>
                {inProgress.length === 0 ? renderEmpty("No hay servicios en curso.") : (
                  <div className="space-y-4">{inProgress.map(renderBookingRow)}</div>
                )}
              </TabsContent>
              <TabsContent value="ready" className="mt-6 space-y-4 focus-visible:outline-none">
                <p className="text-sm text-muted-foreground">
                  El cliente ya confirmó el pago. Estas reservas están listas para que las completes y pasen a historial.
                </p>
                {ready.length === 0 ? renderEmpty("No hay reservas listas para completar.") : (
                  <div className="space-y-4">{ready.map(renderBookingRow)}</div>
                )}
              </TabsContent>
              <TabsContent value="history" className="mt-6 space-y-4 focus-visible:outline-none">
                <p className="text-sm text-muted-foreground">
                  Completados, cancelados o rechazados.
                </p>
                {history.length === 0 ? renderEmpty("Aún no hay historial de servicios.") : (
                  <div className="space-y-4">{history.map(renderBookingRow)}</div>
                )}
              </TabsContent>
            </>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}

/** Dialog que muestra resumen económico y permite descargar reporte CSV (transferencias, ingresos, estado de retiros). */
function EconomicReportDialog({
  open,
  onOpenChange,
  walletData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletData: { wallet?: number; totalEarnings?: number; withdrawingFunds?: number } | undefined;
}) {
  const { data: transfersData, isLoading } = useWalletTransfers({
    page: 1,
    limit: 500,
    enabled: open,
  });
  const transfers = transfersData?.transfers ?? [];
  const totalEarnings = typeof walletData?.totalEarnings === "number" ? walletData.totalEarnings : 0;
  const wallet = typeof walletData?.wallet === "number" ? walletData.wallet : 0;
  const withdrawingFunds = typeof (walletData as { withdrawingFunds?: number })?.withdrawingFunds === "number"
    ? (walletData as { withdrawingFunds: number }).withdrawingFunds
    : 0;
  const totalWithdrawn = transfers
    .filter((t: { transferType?: string; status?: string }) => t.transferType === "withdrawal" && t.status === "completed")
    .reduce((sum: number, t: { amount?: number }) => sum + (typeof t.amount === "number" ? t.amount : 0), 0);

  const downloadCsv = () => {
    const headers = ["Fecha", "Tipo", "Descripción", "Monto (USD)", "Estado"];
    const typeLabels: Record<string, string> = {
      service_payment: "Ingreso por servicio",
      recharge: "Recarga",
      withdrawal: "Retiro",
    };
    const statusLabels: Record<string, string> = {
      pending_approval: "Pendiente aprobación",
      completed: "Completado",
      rejected: "Rechazado",
    };
    const rows = transfers.map((t: { createdAt?: string; transferType?: string; description?: string; amount?: number; status?: string }) => [
      t.createdAt ? format(new Date(t.createdAt), "yyyy-MM-dd HH:mm", { locale: es }) : "",
      typeLabels[t.transferType ?? ""] ?? t.transferType ?? "",
      t.description ?? "",
      typeof t.amount === "number" ? t.amount.toFixed(2) : "",
      statusLabels[t.status ?? ""] ?? t.status ?? "",
    ]);
    const csv = [headers.join(","), ...rows.map((r: string[]) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-economico-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reporte Económico</DialogTitle>
          <DialogDescription>
            Resumen de ingresos, transferencias y estado de retiros. Puedes descargar el historial en CSV.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-muted-foreground">Ingresos totales</p>
                <p className="font-semibold text-lg">{formatUsd(totalEarnings)}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-muted-foreground">Retiros completados</p>
                <p className="font-semibold text-lg">{formatUsd(totalWithdrawn)}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-muted-foreground">Saldo disponible</p>
                <p className="font-semibold text-lg">{formatUsd(wallet)}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-muted-foreground">Retiro pendiente</p>
                <p className="font-semibold text-lg">{withdrawingFunds > 0 ? formatUsd(withdrawingFunds) : "—"}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Últimas {transfers.length} transferencias. Estado: Pendiente aprobación / Completado / Rechazado.
            </p>
            <div className="max-h-48 overflow-y-auto rounded border text-sm">
              {transfers.length === 0 ? (
                <p className="p-4 text-muted-foreground text-center">Sin movimientos aún.</p>
              ) : (
                <ul className="divide-y">
                  {transfers.slice(0, 20).map((t: { id?: number; createdAt?: string; description?: string; amount?: number; status?: string; transferType?: string }) => (
                    <li key={t.id ?? Math.random()} className="flex justify-between items-center p-2">
                      <span className="text-muted-foreground truncate">
                        {t.createdAt ? format(new Date(t.createdAt), "dd/MM/yyyy", { locale: es }) : ""} · {t.description ?? t.transferType ?? ""}
                      </span>
                      <span className="font-medium tabular-nums">{typeof t.amount === "number" ? formatUsd(t.amount) : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
              <Button onClick={downloadCsv}>
                <FileText className="h-4 w-4 mr-2" />
                Descargar CSV
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const DASHBOARD_TABS = ["overview", "bookings", "transactions", "analytics", "invoices"] as const;

export default function ProfessionalDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { notifyBookingUpdate } = useSocketBookings();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [timeRange, setTimeRange] = useState("month");
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const { data: walletData } = useWallet({ enabled: true });
  const withdrawMutation = useWithdraw();
  const wallet = typeof walletData?.wallet === "number" ? walletData.wallet : 0;
  const withdrawingFunds = typeof (walletData as { withdrawingFunds?: number })?.withdrawingFunds === "number"
    ? (walletData as { withdrawingFunds: number }).withdrawingFunds
    : 0;
  const userBankName = (user as { bankName?: string })?.bankName ?? "";
  const userAccountNumber = (user as { accountNumber?: string })?.accountNumber ?? "";
  const hasBankData = Boolean(typeof userBankName === "string" && userBankName.trim() && typeof userAccountNumber === "string" && userAccountNumber.trim());
  const pendingWithdrawal = withdrawingFunds > 0;

  const getTabFromUrl = () => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const tab = new URLSearchParams(search).get("tab");
    return tab && DASHBOARD_TABS.includes(tab as (typeof DASHBOARD_TABS)[number]) ? tab : "overview";
  };
  const [currentTab, setCurrentTabState] = useState(getTabFromUrl);
  const [highlightedBookingId, setHighlightedBookingId] = useState<number | null>(null);

  useEffect(() => {
    setCurrentTabState(getTabFromUrl());
  }, [location]);

  // Al abrir la pestaña Reservas, refrescar lista (debounced para no saturar el servidor)
  const prevTabRef = useRef(currentTab);
  useEffect(() => {
    if (prevTabRef.current !== "bookings" && currentTab === "bookings") {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/provider"] });
      debouncedRefetch(queryClient, ["/api/bookings/provider"]);
    }
    prevTabRef.current = currentTab;
  }, [currentTab, queryClient]);

  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const params = new URLSearchParams(search);
    const highlight = params.get("highlight");
    if (params.get("tab") === "bookings" && highlight) {
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
  }, [location, currentTab]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const handler = (e: CustomEvent<{ bookingId: number }>) => {
      const id = e.detail?.bookingId;
      if (id != null) {
        setCurrentTabState("bookings");
        setLocation("/professional-dashboard?tab=bookings&highlight=" + id);
        setHighlightedBookingId(id);
        timeoutId = setTimeout(() => setHighlightedBookingId(null), 2800);
      }
    };
    window.addEventListener("pro-open-bookings-highlight", handler as EventListener);
    return () => {
      window.removeEventListener("pro-open-bookings-highlight", handler as EventListener);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const setTab = (value: string) => {
    setCurrentTabState(value);
    setLocation(`/professional-dashboard?tab=${value}`);
  };

  const { data: overviewStats } = useProfessionalStats();
  const totalEarnings = overviewStats?.totalEarnings ?? 0;
  const earningsThisMonth = overviewStats?.earningsThisMonth ?? 0;
  const earningsLastMonth = overviewStats?.earningsLastMonth ?? 0;
  const pendingOrActiveCount = overviewStats?.pendingOrActiveCount ?? 0;
  const completedCountOverview = overviewStats?.completedCount ?? 0;
  const earningsChange = earningsLastMonth > 0
    ? ((earningsThisMonth - earningsLastMonth) / earningsLastMonth) * 100
    : (earningsThisMonth > 0 ? 100 : 0);

  // Calculate rating percentage
  const ratingPercentage = (mockRating.average / 5) * 100;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 sm:px-6 py-4">
        <div className="container mx-auto max-w-full flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="p-2 bg-mango-orange/10 rounded-lg">
              <BarChart3 className="h-6 w-6 text-mango-orange" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Panel Económico</h1>
              <p className="text-gray-500 text-sm sm:text-base">Gestiona tus ingresos y estadísticas</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 w-full sm:w-auto">
            <Button variant="outline" size="sm" className="flex-1 sm:flex-initial min-w-0" onClick={() => setReportDialogOpen(true)}>
              <FileText className="h-4 w-4 mr-2 shrink-0" />
              <span className="truncate">Generar Reporte</span>
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-block">
                    <Button
                      size="sm"
                      className="flex-1 sm:flex-initial min-w-0"
                      disabled={pendingWithdrawal}
                      onClick={() => !pendingWithdrawal && setWithdrawDialogOpen(true)}
                    >
                      <CreditCard className="h-4 w-4 mr-2 shrink-0" />
                      <span className="truncate">Retirar Fondos</span>
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {pendingWithdrawal ? "Solicitud en revisión por el administrador" : "Solicitar retiro de fondos a tu cuenta bancaria"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {/* Dialog Retirar Fondos */}
      <Dialog open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Retirar Fondos</DialogTitle>
            <DialogDescription>
              El monto se moverá a &quot;En proceso de retiro&quot; y aparecerás en Panel Admin → Payouts para que el administrador realice la transferencia a tu cuenta.
            </DialogDescription>
          </DialogHeader>
          {!hasBankData ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-amber-600 dark:text-amber-500">
                Para retirar fondos debes completar los datos bancarios (nombre del banco y número de cuenta) en tu perfil.
              </p>
              <Button asChild variant="outline">
                <Link href="/settings" onClick={() => setWithdrawDialogOpen(false)}>Ir a Configuración</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">Saldo disponible: <strong>{formatUsd(wallet)}</strong></p>
              <div className="space-y-2">
                <Label htmlFor="withdraw-amount">Monto a retirar (USD)</Label>
                <Input
                  id="withdraw-amount"
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  disabled={withdrawMutation.isPending}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setWithdrawDialogOpen(false)} disabled={withdrawMutation.isPending}>
                  Cancelar
                </Button>
                <Button
                  disabled={
                    withdrawMutation.isPending ||
                    !(parseFloat(withdrawAmount) > 0) ||
                    parseFloat(withdrawAmount) > wallet
                  }
                  onClick={() => {
                    const num = parseFloat(withdrawAmount);
                    if (!Number.isFinite(num) || num <= 0 || num > wallet) return;
                    withdrawMutation.mutate(num, {
                      onSuccess: () => {
                        setWithdrawAmount("");
                        setWithdrawDialogOpen(false);
                        toast({
                          title: "Solicitud enviada",
                          description: "Aparecerás en Panel Admin → Payouts. El administrador procesará la transferencia.",
                        });
                      },
                      onError: (err: Error) => {
                        toast({ title: "Error", description: err.message, variant: "destructive" });
                      },
                    });
                  }}
                >
                  {withdrawMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Procesando…
                    </>
                  ) : (
                    "Solicitar retiro"
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Generar Reporte */}
      <EconomicReportDialog open={reportDialogOpen} onOpenChange={setReportDialogOpen} walletData={walletData} />

      <div className="container mx-auto max-w-full py-6 px-4 overflow-x-hidden">
        {/* Resumen de Actividad (estadísticas de rendimiento) */}
        <ResumenActividad />

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
              <DollarSign className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(totalEarnings)}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className={earningsChange >= 0 ? "text-green-500" : "text-red-500"}>
                  {earningsChange >= 0 ? "+" : ""}{earningsChange.toFixed(1)}%
                </span>
                <span className="text-gray-500">vs mes anterior</span>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Este Mes</CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(earningsThisMonth)}
              </div>
              <p className="text-xs text-gray-500">Ingresos de este mes</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Reservas en curso</CardTitle>
              <Clock className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingOrActiveCount}</div>
              <p className="text-xs text-gray-500">Pendientes, confirmadas o en proceso</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Calificación</CardTitle>
              <Star className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                {mockRating.average} <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
              </div>
              <p className="text-xs text-gray-500">{mockRating.total} reseñas</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={currentTab} onValueChange={setTab} className="space-y-4">
          <TabsList className="w-full flex flex-nowrap justify-start sm:justify-center overflow-x-auto h-auto min-h-10 gap-1 p-2 sm:p-1 sm:flex-wrap sm:h-10 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-muted/50 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
            <TabsTrigger value="overview" className="flex-shrink-0 min-w-[max-content] px-3 py-2 text-sm sm:flex-initial sm:px-3 sm:py-1.5">Resumen</TabsTrigger>
            <TabsTrigger value="bookings" className="flex-shrink-0 min-w-[max-content] px-3 py-2 text-sm sm:flex-initial sm:px-3 sm:py-1.5">Reservas</TabsTrigger>
            <TabsTrigger value="transactions" className="flex-shrink-0 min-w-[max-content] px-3 py-2 text-sm sm:flex-initial sm:px-3 sm:py-1.5">Transacciones</TabsTrigger>
            <TabsTrigger value="analytics" className="flex-shrink-0 min-w-[max-content] px-3 py-2 text-sm sm:flex-initial sm:px-3 sm:py-1.5">Análisis</TabsTrigger>
            <TabsTrigger value="invoices" className="flex-shrink-0 min-w-[max-content] px-3 py-2 text-sm sm:flex-initial sm:px-3 sm:py-1.5">Facturas</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Monthly Earnings Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Ingresos Mensuales</CardTitle>
                  <CardDescription>Evolución de tus ingresos en los últimos 6 meses</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-end justify-between gap-2">
                    {mockMonthlyData.map((data, index) => (
                      <div key={index} className="flex-1 flex flex-col items-center gap-2">
                        <div 
                          className="w-full bg-mango-orange rounded-t transition-all hover:bg-mango-orange/80"
                          style={{ 
                            height: `${(data.earnings / 4000) * 100}%`,
                            minHeight: "20px"
                          }}
                        />
                        <span className="text-xs text-gray-500">{data.month}</span>
                        <span className="text-xs font-medium">${data.earnings}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Rating Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle>Desglose de Calificaciones</CardTitle>
                  <CardDescription>Distribución de tus reseñas</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 w-20">
                      <span className="text-sm font-medium">5</span>
                      <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                    </div>
                    <Progress value={72} className="flex-1" />
                    <span className="text-sm text-gray-500 w-12 text-right">72</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 w-20">
                      <span className="text-sm font-medium">4</span>
                      <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                    </div>
                    <Progress value={12} className="flex-1" />
                    <span className="text-sm text-gray-500 w-12 text-right">12</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 w-20">
                      <span className="text-sm font-medium">3</span>
                      <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                    </div>
                    <Progress value={3} className="flex-1" />
                    <span className="text-sm text-gray-500 w-12 text-right">3</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 w-20">
                      <span className="text-sm font-medium">2</span>
                      <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                    </div>
                    <Progress value={1} className="flex-1" />
                    <span className="text-sm text-gray-500 w-12 text-right">1</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 w-20">
                      <span className="text-sm font-medium">1</span>
                      <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                    </div>
                    <Progress value={1} className="flex-1" />
                    <span className="text-sm text-gray-500 w-12 text-right">1</span>
                  </div>
                </CardContent>
              </Card>

              {/* Booking Stats */}
              <Card>
                <CardHeader>
                  <CardTitle>Estadísticas de Reservas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-4 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{mockBookings.completed}</div>
                      <div className="text-sm text-gray-500">Completadas</div>
                    </div>
                    <div className="p-4 bg-orange-50 rounded-lg">
                      <div className="text-2xl font-bold text-orange-600">{mockBookings.pending}</div>
                      <div className="text-sm text-gray-500">Pendientes</div>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg">
                      <div className="text-2xl font-bold text-red-600">{mockBookings.cancelled}</div>
                      <div className="text-sm text-gray-500">Canceladas</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Acciones Rápidas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" className="w-full justify-start">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Solicitar retiro de fondos
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    <FileText className="h-4 w-4 mr-2" />
                    Descargar reporte de impuestos
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    <Calendar className="h-4 w-4 mr-2" />
                    Ver calendario de pagos
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="bookings">
            <ProviderBookingsTab highlightedBookingId={highlightedBookingId} />
          </TabsContent>

          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle>Historial de Transacciones</CardTitle>
                <CardDescription>Todas tus transacciones y ganancias</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {mockRecentTransactions.map((transaction) => (
                    <div key={transaction.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-full ${
                          transaction.status === "completed" ? "bg-green-100" : "bg-orange-100"
                        }`}>
                          {transaction.status === "completed" ? (
                            <DollarSign className="h-4 w-4 text-green-600" />
                          ) : (
                            <Clock className="h-4 w-4 text-orange-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{transaction.client}</p>
                          <p className="text-sm text-gray-500">{transaction.service}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">${transaction.amount}</p>
                        <p className="text-sm text-gray-500">{transaction.date}</p>
                        <Badge variant={transaction.status === "completed" ? "default" : "secondary"}>
                          {transaction.status === "completed" ? "Completado" : "Pendiente"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Distribución de Ingresos</CardTitle>
                  <CardDescription>Por tipo de servicio</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-mango-orange rounded-full" />
                        <span>Servicios Domésticos</span>
                      </div>
                      <span className="font-medium">45%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full" />
                        <span>Servicios Profesionales</span>
                      </div>
                      <span className="font-medium">35%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full" />
                        <span>Mantenimiento</span>
                      </div>
                      <span className="font-medium">20%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Tendencia de Trabajo</CardTitle>
                  <CardDescription>Últimos 6 meses</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center h-48">
                    <Activity className="h-16 w-16 text-gray-300" />
                  </div>
                  <p className="text-center text-gray-500">
                    Tus servicios tienen una tendencia positiva
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="invoices">
            <Card>
              <CardHeader>
                <CardTitle>Facturas Emitidas</CardTitle>
                <CardDescription>Descargar facturas de tus servicios</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {mockRecentTransactions.filter(t => t.status === "completed").map((invoice) => (
                    <div key={invoice.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Factura #{invoice.id.toString().padStart(6, "0")}</p>
                        <p className="text-sm text-gray-500">{invoice.client} - {invoice.service}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-medium">${invoice.amount}</span>
                        <Button size="sm" variant="outline">
                          <FileText className="h-4 w-4 mr-1" />
                          PDF
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

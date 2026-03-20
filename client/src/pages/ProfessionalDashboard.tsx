import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { 
  DollarSign, TrendingUp, Calendar, Users, 
  Star, Clock, CreditCard, FileText, Download,
  BarChart3, PieChart, Activity, Loader2, MessageSquare,
  CheckCircle2, XCircle, Banknote, Inbox, PlayCircle, History, UserPlus, Receipt
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
  useCurrentProvider,
} from "@/hooks/use-mango-data";
import { downloadInvoicePdf, getTransferTypeLabel, type TransferForInvoice } from "@/lib/invoice-pdf";
import { useToast } from "@/hooks/use-toast";
import { debouncedRefetch } from "@/lib/refetch-utils";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toDate } from "@/lib/date-utils";
import { calcCommission, calcProviderNet } from "@shared/platform-commission";

const formatUsd = (n: number) =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const STATUS_OPTIONS = [
  { value: "pending", label: "Pendiente" },
  { value: "confirmed", label: "Confirmada" },
  { value: "in_progress", label: "En proceso" },
  { value: "completed", label: "Completada" },
  { value: "cancelled", label: "Cancelada" },
];

function formatWalletAmount(amount: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function parseTransferDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof value === "object" && value !== null && "seconds" in value) {
    const d = new Date((value as { seconds: number }).seconds * 1000);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    const d = (value as { toDate: () => Date }).toDate();
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d : null;
}

function getTransferMetaForProfessional(t: any) {
  const type = t.transferType as "service_payment" | "recharge" | "withdrawal" | undefined;
  const status = t.status as "pending_approval" | "completed" | "rejected" | undefined;
  const isPending = status === "pending_approval";

  const isCredit =
    status === "completed" && (type === "recharge" || type === "service_payment");
  const isDebit = status === "completed" && type === "withdrawal";

  let amountColor = "text-foreground";
  if (isPending) {
    amountColor = "text-muted-foreground";
  } else if (isCredit) {
    amountColor = "text-emerald-600";
  } else if (isDebit) {
    amountColor = "text-red-600";
  }

  let label = "Transacción";
  if (type === "recharge") label = "Recarga de saldo";
  if (type === "service_payment") label = "Ingreso por servicio";
  if (type === "withdrawal") label = "Retiro de fondos";

  const createdAt = parseTransferDate(t.createdAt);
  const dateStr = createdAt
    ? format(createdAt, "dd MMM yyyy HH:mm", { locale: es })
    : "";

  return { amountColor, label, dateStr, isPending, isCredit, isDebit };
}

function ProfessionalTransactions() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useWalletTransfers({ page, limit: 10 });
  const transfers = data?.transfers ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 10));

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
        <Receipt className="w-8 h-8 animate-pulse" />
        <p className="text-sm">Cargando transacciones…</p>
      </div>
    );
  }

  if (transfers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
        <Receipt className="w-8 h-8 opacity-60" />
        <p className="text-sm">Aún no tienes transacciones.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {transfers.map((t: any) => {
        const { amountColor, label, dateStr } = getTransferMetaForProfessional(t);
        return (
          <div
            key={t.id}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 border border-border rounded-lg bg-card"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Banknote className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="font-medium text-sm truncate">{label}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {t.description || "Sin descripción"}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <p className={`font-semibold text-sm ${amountColor}`}>
                {formatWalletAmount(t.amount)}
              </p>
              <p className="text-xs text-muted-foreground">{dateStr}</p>
              <Badge variant={t.status === "completed" ? "default" : t.status === "rejected" ? "destructive" : "secondary"}>
                {t.status === "pending_approval"
                  ? "Pendiente"
                  : t.status === "completed"
                    ? "Completado"
                    : "Rechazado"}
              </Badge>
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-between pt-2">
        <p className="text-xs text-muted-foreground">
          Página {page} de {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}

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
  const { data: bookings, isLoading, isFetching } = useBookingsByProvider();
  const updateStatus = useUpdateBookingStatus();
  const updateCost = useUpdateBookingCost();
  const updateSchedule = useUpdateBookingSchedule();
  const { notifyBookingUpdate } = useSocketBookings();
  const [costInputs, setCostInputs] = useState<Record<number, string>>({});
  const [scheduleInputs, setScheduleInputs] = useState<Record<number, { date: string; time: string }>>({});
  const [subTab, setSubTab] = useState<BookingsSubTab>("pending");
  const PAGE_SIZE = 10;
  const [pageBySubTab, setPageBySubTab] = useState<Record<BookingsSubTab, number>>({
    pending: 1,
    in_progress: 1,
    ready: 1,
    history: 1,
  });

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

  const isLoadingOrRefetching = isLoading || isFetching;

  const clampPage = (p: number, total: number) => Math.min(Math.max(1, p), total);

  const pendingTotalPages = Math.max(1, Math.ceil(pending.length / PAGE_SIZE));
  const pendingPage = clampPage(pageBySubTab.pending, pendingTotalPages);
  const pendingPageItems = useMemo(
    () => pending.slice((pendingPage - 1) * PAGE_SIZE, pendingPage * PAGE_SIZE),
    [pending, pendingPage],
  );

  const inProgressTotalPages = Math.max(1, Math.ceil(inProgress.length / PAGE_SIZE));
  const inProgressPage = clampPage(pageBySubTab.in_progress, inProgressTotalPages);
  const inProgressPageItems = useMemo(
    () => inProgress.slice((inProgressPage - 1) * PAGE_SIZE, inProgressPage * PAGE_SIZE),
    [inProgress, inProgressPage],
  );

  const readyTotalPages = Math.max(1, Math.ceil(ready.length / PAGE_SIZE));
  const readyPage = clampPage(pageBySubTab.ready, readyTotalPages);
  const readyPageItems = useMemo(
    () => ready.slice((readyPage - 1) * PAGE_SIZE, readyPage * PAGE_SIZE),
    [ready, readyPage],
  );

  const historyTotalPages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  const historyPage = clampPage(pageBySubTab.history, historyTotalPages);
  const historyPageItems = useMemo(
    () => history.slice((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE),
    [history, historyPage],
  );

  const setPageForSubTab = (tab: BookingsSubTab, nextPage: number) => {
    setPageBySubTab((prev) => ({ ...prev, [tab]: nextPage }));
  };

  useEffect(() => {
    if (highlightedBookingId == null) return;
    if (!list.length) return;

    const booking = list.find((b) => b.id === highlightedBookingId);
    if (!booking) return;

    const getTargetSubTab = (): BookingsSubTab => {
      if (booking.status === "pending") return "pending";
      if (booking.status === "completed" || booking.status === "cancelled") return "history";
      if (booking.confirmedByClient === true) return "ready";
      return "in_progress";
    };

    const target = getTargetSubTab();
    const arr = target === "pending" ? pending : target === "in_progress" ? inProgress : target === "ready" ? ready : history;
    const idx = arr.findIndex((b) => b.id === highlightedBookingId);
    const nextPage = idx >= 0 ? Math.floor(idx / PAGE_SIZE) + 1 : 1;

    setSubTab(target);
    setPageBySubTab((prev) => ({ ...prev, [target]: nextPage }));
  }, [highlightedBookingId, list, pending, inProgress, ready, history]);

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
    const parsedCostDisplay = parseFloat(String(costDisplay).replace(",", "."));
    const costForCommission = Number.isFinite(parsedCostDisplay) ? parsedCostDisplay : Number(currentCost || 0);
    const commission = costForCommission > 0 ? calcCommission(costForCommission) : 0;
    const providerNet = costForCommission > 0 ? calcProviderNet(costForCommission) : 0;
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

    // Reglas de transición de estado:
    // pending -> confirmed -> in_progress -> completed, con "cancelled" siempre disponible.
    const nextStatusMap: Record<string, string | undefined> = {
      pending: "confirmed",
      confirmed: "in_progress",
      in_progress: "completed",
    };
    const allowedStatusValues = new Set<string>();
    allowedStatusValues.add(booking.status);
    allowedStatusValues.add("cancelled");
    const nextStatus = nextStatusMap[booking.status];
    if (nextStatus) {
      allowedStatusValues.add(nextStatus);
    }
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
                {costForCommission > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Neto profesional: <span className="font-medium text-foreground">${providerNet.toFixed(2)}</span> (90%) · Comisión:{" "}
                    <span className="font-medium text-foreground">${commission.toFixed(2)}</span> (10%)
                  </span>
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
                        {STATUS_OPTIONS.filter((opt) => allowedStatusValues.has(opt.value)).map((opt) => (
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
                {pending.length === 0 ? (
                  renderEmpty("No hay solicitudes pendientes. Las nuevas reservas aparecerán aquí.")
                ) : (
                  <>
                    <div className="space-y-4">{pendingPageItems.map(renderBookingRow)}</div>
                    {pendingTotalPages > 1 && (
                      <div className="flex items-center justify-between gap-3 pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pendingPage <= 1}
                          onClick={() => setPageForSubTab("pending", pendingPage - 1)}
                        >
                          Anterior
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          Página {pendingPage}/{pendingTotalPages}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pendingPage >= pendingTotalPages}
                          onClick={() => setPageForSubTab("pending", pendingPage + 1)}
                        >
                          Siguiente
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>
              <TabsContent value="in_progress" className="mt-6 space-y-4 focus-visible:outline-none">
                <p className="text-sm text-muted-foreground">
                  Reservas aceptadas: en espera de confirmación de pago del cliente o ya en ejecución.
                </p>
                {inProgress.length === 0 ? (
                  renderEmpty("No hay servicios en curso.")
                ) : (
                  <>
                    <div className="space-y-4">{inProgressPageItems.map(renderBookingRow)}</div>
                    {inProgressTotalPages > 1 && (
                      <div className="flex items-center justify-between gap-3 pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={inProgressPage <= 1}
                          onClick={() => setPageForSubTab("in_progress", inProgressPage - 1)}
                        >
                          Anterior
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          Página {inProgressPage}/{inProgressTotalPages}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={inProgressPage >= inProgressTotalPages}
                          onClick={() => setPageForSubTab("in_progress", inProgressPage + 1)}
                        >
                          Siguiente
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>
              <TabsContent value="ready" className="mt-6 space-y-4 focus-visible:outline-none">
                <p className="text-sm text-muted-foreground">
                  El cliente ya confirmó el pago. Estas reservas están listas para que las completes y pasen a historial.
                </p>
                {ready.length === 0 ? (
                  renderEmpty("No hay reservas listas para completar.")
                ) : (
                  <>
                    <div className="space-y-4">{readyPageItems.map(renderBookingRow)}</div>
                    {readyTotalPages > 1 && (
                      <div className="flex items-center justify-between gap-3 pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={readyPage <= 1}
                          onClick={() => setPageForSubTab("ready", readyPage - 1)}
                        >
                          Anterior
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          Página {readyPage}/{readyTotalPages}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={readyPage >= readyTotalPages}
                          onClick={() => setPageForSubTab("ready", readyPage + 1)}
                        >
                          Siguiente
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>
              <TabsContent value="history" className="mt-6 space-y-4 focus-visible:outline-none">
                <p className="text-sm text-muted-foreground">
                  Completados, cancelados o rechazados.
                </p>
                {history.length === 0 ? (
                  renderEmpty("Aún no hay historial de servicios.")
                ) : (
                  <>
                    <div className="space-y-4">{historyPageItems.map(renderBookingRow)}</div>
                    {historyTotalPages > 1 && (
                      <div className="flex items-center justify-between gap-3 pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={historyPage <= 1}
                          onClick={() => setPageForSubTab("history", historyPage - 1)}
                        >
                          Anterior
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          Página {historyPage}/{historyTotalPages}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={historyPage >= historyTotalPages}
                          onClick={() => setPageForSubTab("history", historyPage + 1)}
                        >
                          Siguiente
                        </Button>
                      </div>
                    )}
                  </>
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
    const rows = transfers.map((t: { createdAt?: unknown; transferType?: string; description?: string; amount?: number; status?: string }) => [
      (() => { const d = parseTransferDate(t.createdAt); return d ? format(d, "yyyy-MM-dd HH:mm", { locale: es }) : ""; })(),
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
                  {transfers.slice(0, 20).map((t: { id?: number; createdAt?: unknown; description?: string; amount?: number; status?: string; transferType?: string }) => {
                    const d = parseTransferDate(t.createdAt);
                    return (
                    <li key={t.id ?? Math.random()} className="flex justify-between items-center p-2">
                      <span className="text-muted-foreground truncate">
                        {d ? format(d, "dd/MM/yyyy", { locale: es }) : ""} · {t.description ?? t.transferType ?? ""}
                      </span>
                      <span className="font-medium tabular-nums">{typeof t.amount === "number" ? formatUsd(t.amount) : ""}</span>
                    </li>
                  );
                  })}
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

function InvoicesTabContent() {
  const [page, setPage] = useState(1);
  const { user } = useAuth();
  const { data, isLoading } = useWalletTransfers({ page, limit: 10 });
  const transfers = data?.transfers ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 10));

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Facturas</CardTitle>
          <CardDescription>Transacciones y descarga de facturas en PDF</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Cargando transacciones…</p>
        </CardContent>
      </Card>
    );
  }

  if (transfers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Facturas</CardTitle>
          <CardDescription>Transacciones y descarga de facturas en PDF</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
          <FileText className="h-8 w-8 opacity-60" />
          <p className="text-sm">Aún no tienes transacciones para facturar.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Facturas</CardTitle>
        <CardDescription>Descarga una factura en PDF por cada transacción</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {transfers.map((t: TransferForInvoice & { id: number; status?: string }) => {
          const label = getTransferTypeLabel(t.transferType);
          const dateStr = parseTransferDate(t.createdAt)
            ? format(parseTransferDate(t.createdAt)!, "dd MMM yyyy HH:mm", { locale: es })
            : "—";
          return (
            <div
              key={t.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border border-border rounded-lg bg-card"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Receipt className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground truncate">{t.description || "Sin descripción"}</p>
                  <p className="text-xs text-muted-foreground">{dateStr}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <p className="font-semibold text-sm">{formatWalletAmount(t.amount)}</p>
                <Badge
                  variant={
                    t.status === "completed" ? "default" : t.status === "rejected" ? "destructive" : "secondary"
                  }
                >
                  {t.status === "pending_approval" ? "Pendiente" : t.status === "completed" ? "Completado" : "Rechazado"}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    user &&
                    downloadInvoicePdf(
                      {
                        id: t.id,
                        amount: t.amount,
                        transferType: t.transferType,
                        description: t.description,
                        createdAt: t.createdAt,
                        status: t.status,
                      },
                      {
                        firstName: user.firstName,
                        lastName: user.lastName,
                        name: (user as { name?: string }).name,
                        email: user.email,
                      }
                    )
                  }
                  disabled={!user}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Generar factura
                </Button>
              </div>
            </div>
          );
        })}
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const DASHBOARD_TABS = ["overview", "bookings", "transactions", "invoices"] as const;

export default function ProfessionalDashboard() {
  const { user } = useAuth();
  const { data: providerProfile, isLoading: providerProfileLoading } = useCurrentProvider();
  const queryClient = useQueryClient();
  const { notifyBookingUpdate } = useSocketBookings();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [timeRange, setTimeRange] = useState("month");
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const { data: walletData } = useWallet({ enabled: true });
  const isProfessionalRole = (user as { role?: string } | null)?.role === "professional";
  const showBecomeProBanner = isProfessionalRole && !providerProfileLoading && !providerProfile;
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

  const { data: providerBookings, isLoading: providerBookingsLoading } = useBookingsByProvider();
  const bookingsSafe = (providerBookings ?? []) as Array<{
    status?: string;
    cost?: number | string;
    completedAt?: unknown;
    date?: unknown;
  }>;

  const completedBookings = useMemo(
    () => bookingsSafe.filter((b) => b.status === "completed"),
    [bookingsSafe],
  );

  const bookingPendingCount = useMemo(
    () => bookingsSafe.filter((b) => b.status === "pending").length,
    [bookingsSafe],
  );

  const bookingCancelledCount = useMemo(
    () => bookingsSafe.filter((b) => b.status === "cancelled").length,
    [bookingsSafe],
  );

  const last6Months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, idx) => {
      const d = new Date(now);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      d.setMonth(now.getMonth() - (5 - idx));
      return d;
    });
  }, []);

  const monthlyEarnings = useMemo(() => {
    const computeMonthLabel = (d: Date) => {
      const raw = format(d, "MMM", { locale: es });
      return raw.replace(".", "").charAt(0).toUpperCase() + raw.replace(".", "").slice(1);
    };

    const toCost = (v: unknown) => {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    return last6Months.map((monthDate) => {
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      const earnings = completedBookings.reduce((sum, b) => {
        const completedAt = toDate((b as any).completedAt ?? (b as any).date);
        if (Number.isNaN(completedAt.getTime())) return sum;
        if (completedAt.getFullYear() !== year || completedAt.getMonth() !== month) return sum;
        return sum + calcProviderNet(toCost((b as any).cost));
      }, 0);
      return { month: computeMonthLabel(monthDate), earnings };
    });
  }, [completedBookings, last6Months]);

  const monthlyEarningsMax = useMemo(() => Math.max(...monthlyEarnings.map((m) => m.earnings), 0), [monthlyEarnings]);

  const providerUserId = (providerProfile as any)?.userId as string | undefined;
  const { data: reviewStats } = useQuery({
    queryKey: ["/api/reviews/stats/provider", providerUserId],
    enabled: !!providerUserId,
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/reviews/stats/provider/${encodeURIComponent(providerUserId!)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudieron cargar las estadísticas de reseñas");
      }
      return res.json() as Promise<{
        averageRating?: number;
        totalReviews?: number;
        distribution?: Record<string, number>;
      }>;
    },
  });

  const ratingAverage = Number(reviewStats?.averageRating ?? walletData?.rating ?? 0);
  const ratingTotalReviews = Number(reviewStats?.totalReviews ?? walletData?.ratingCount ?? 0);
  const ratingDistribution = reviewStats?.distribution ?? { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const ratingStarsTotal = ratingTotalReviews || 0;
  const ratingPercentage = ratingStarsTotal > 0 ? (ratingAverage / 5) * 100 : 0;

  const incomeByCategoryTop3 = useMemo(() => {
    const toCost = (v: unknown) => {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const map = new Map<string, number>();
    for (const b of completedBookings) {
      const service = (b as any).service;
      const categoryName =
        service?.category?.name ||
        service?.category?.type ||
        service?.subcategory?.name ||
        service?.title ||
        (b as any).serviceId?.toString?.() ||
        "Servicio";
      const prev = map.get(categoryName) ?? 0;
      map.set(categoryName, prev + calcProviderNet(toCost((b as any).cost)));
    }

    const total = Array.from(map.values()).reduce((sum, v) => sum + v, 0);
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, value]) => ({
        name,
        value,
        percent: total > 0 ? Math.round((value / total) * 100) : 0,
      }));
  }, [completedBookings]);

  const earningsTrendDelta =
    monthlyEarnings.length > 0 ? monthlyEarnings[monthlyEarnings.length - 1].earnings - monthlyEarnings[0].earnings : 0;
  const earningsTrendPositive = earningsTrendDelta >= 0;

  const totalEarnings6m = useMemo(
    () => monthlyEarnings.reduce((sum, m) => sum + (Number.isFinite(m.earnings) ? m.earnings : 0), 0),
    [monthlyEarnings],
  );

  const avgEarnings6m = useMemo(() => (monthlyEarnings.length > 0 ? totalEarnings6m / monthlyEarnings.length : 0), [totalEarnings6m, monthlyEarnings]);

  // Panel Económico (Bóveda Profesional): ocultar secciones específicas por UI.
  const SHOW_PRO_MONTHLY_EARNINGS = false;
  const SHOW_PRO_RATING_BREAKDOWN = false;
  const SHOW_PRO_QUICK_ACTIONS = false;

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
        {/* Banner: completar perfil profesional si el paso se omitió */}
        {showBecomeProBanner && (
          <Card className="mb-6 border-2 border-mango-orange/50 bg-mango-orange/5">
            <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 py-6">
              <div className="text-center sm:text-left">
                <h2 className="text-lg font-semibold text-foreground mb-1">Completa tu perfil profesional</h2>
                <p className="text-sm text-muted-foreground">
                  Aún no has configurado tu perfil como profesional. Completa categoría, descripción y tarifa para publicar tu servicio y recibir reservas.
                </p>
              </div>
              <Button asChild className="shrink-0">
                <Link href="/become-pro">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Configurar como profesional
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

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
                {ratingAverage.toFixed(1)} <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
              </div>
              <p className="text-xs text-gray-500">{ratingTotalReviews} reseñas</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={currentTab} onValueChange={setTab} className="space-y-4">
          <TabsList className="w-full flex flex-nowrap justify-start sm:justify-center overflow-x-auto h-auto min-h-10 gap-1 p-2 sm:p-1 sm:flex-wrap sm:h-10 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-muted/50 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
            <TabsTrigger value="overview" className="flex-shrink-0 min-w-[max-content] px-3 py-2 text-sm sm:flex-initial sm:px-3 sm:py-1.5">Resumen</TabsTrigger>
            <TabsTrigger value="bookings" className="flex-shrink-0 min-w-[max-content] px-3 py-2 text-sm sm:flex-initial sm:px-3 sm:py-1.5">Reservas</TabsTrigger>
            <TabsTrigger value="transactions" className="flex-shrink-0 min-w-[max-content] px-3 py-2 text-sm sm:flex-initial sm:px-3 sm:py-1.5">Transacciones</TabsTrigger>
            <TabsTrigger value="invoices" className="flex-shrink-0 min-w-[max-content] px-3 py-2 text-sm sm:flex-initial sm:px-3 sm:py-1.5">Facturas</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {SHOW_PRO_MONTHLY_EARNINGS && (
              <Card>
                <CardHeader>
                  <CardTitle>Ingresos Mensuales</CardTitle>
                  <CardDescription>Evolución de tus ingresos en los últimos 6 meses</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-end justify-between gap-2">
                      {monthlyEarnings.map((data, index) => {
                        const heightPct = monthlyEarningsMax > 0 ? (data.earnings / monthlyEarningsMax) * 100 : 0;
                        return (
                      <div key={index} className="flex-1 flex flex-col items-center gap-2">
                        <div 
                          className="w-full bg-mango-orange rounded-t transition-all hover:bg-mango-orange/80"
                          style={{ 
                                height: `${heightPct}%`,
                                minHeight: "20px",
                          }}
                        />
                        <span className="text-xs text-gray-500">{data.month}</span>
                        <span className="text-xs font-medium">${data.earnings}</span>
                      </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
              )}

              {SHOW_PRO_RATING_BREAKDOWN && (
              <Card>
                <CardHeader>
                  <CardTitle>Desglose de Calificaciones</CardTitle>
                  <CardDescription>Distribución de tus reseñas</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {[5, 4, 3, 2, 1].map((stars) => {
                      const count =
                        (ratingDistribution as any)?.[stars] ??
                        (ratingDistribution as any)?.[String(stars)] ??
                        0;
                      const pct = ratingStarsTotal > 0 ? Math.round((count / ratingStarsTotal) * 100) : 0;
                      return (
                        <div key={stars} className="flex items-center gap-4">
                    <div className="flex items-center gap-1 w-20">
                            <span className="text-sm font-medium">{stars}</span>
                      <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                    </div>
                          <Progress value={pct} className="flex-1" />
                          <span className="text-sm text-gray-500 w-12 text-right">{count}</span>
                  </div>
                      );
                    })}
                </CardContent>
              </Card>
              )}

              {/* Booking Stats */}
              <Card>
                <CardHeader>
                  <CardTitle>Estadísticas de Reservas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-4 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{completedBookings.length}</div>
                      <div className="text-sm text-gray-500">Completadas</div>
                    </div>
                    <div className="p-4 bg-orange-50 rounded-lg">
                      <div className="text-2xl font-bold text-orange-600">{bookingPendingCount}</div>
                      <div className="text-sm text-gray-500">Pendientes</div>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg">
                      <div className="text-2xl font-bold text-red-600">{bookingCancelledCount}</div>
                      <div className="text-sm text-gray-500">Canceladas</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {SHOW_PRO_QUICK_ACTIONS && (
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
              )}
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
                <ProfessionalTransactions />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices">
            <InvoicesTabContent />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Star,
  Clock,
  CreditCard,
  FileText,
  Download,
  BarChart3,
  Loader2,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Inbox,
  PlayCircle,
  History,
  UserPlus,
  Receipt,
  ShieldCheck,
  Calendar,
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
import { SubscriptionStatusButton } from "@/components/SubscriptionStatusButton";
import { BookingsCatalogServicesPanel } from "@/components/professional/BookingsCatalogServicesPanel";
import { isSelfServiceCatalogActiveToggleDisallowedForCategorySlug } from "@shared/catalog-service-visibility-policy";
import { useAuth } from "@/hooks/use-auth";
import { isCarGoProvider } from "@shared/provider-car-go";
import { FEATURE_WALLET_RECHARGE_UI_ENABLED } from "@shared/feature-flags";
import { useCategories, useWallet } from "@/hooks/use-mango-data";
import { AccessGateLoading } from "@/components/AccessGateLoading";
import { useSocketBookings } from "@/hooks/use-socket";
import { loadTripLog } from "@/lib/cargo-driver-storage";
import {
  useBookingsByProvider,
  useUpdateBookingStatus,
  useUpdateBookingSchedule,
  useProfessionalStats,
  useWalletTransfers,
  useCurrentProvider,
  useVerifyingStatusMe,
  useProfessionalVerification,
} from "@/hooks/use-mango-data";
import { listingSubscriptionDaysRemaining } from "@shared/professional-listing-subscription";
import { useProviderSubscriptionMonthlyUsd } from "@/hooks/use-provider-subscription-monthly-usd";
import { isAssociateOnboardingDossierComplete } from "@shared/professional-verification";
import { getTransferTypeLabel, type TransferForInvoice } from "@/lib/invoice-pdf";
import { SubscriptionInvoicesPanel } from "@/components/subscription/SubscriptionInvoicesPanel";
import { debouncedRefetch } from "@/lib/refetch-utils";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toDate } from "@/lib/date-utils";
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

  let label = "Movimiento";
  if (type === "recharge") label = getTransferTypeLabel("recharge");
  if (type === "service_payment") label = getTransferTypeLabel("service_payment");
  if (type === "withdrawal") label = getTransferTypeLabel("withdrawal");

  const createdAt = parseTransferDate(t.createdAt);
  const dateStr = createdAt
    ? format(createdAt, "dd MMM yyyy HH:mm", { locale: es })
    : "";

  return { amountColor, label, dateStr, isPending, isCredit, isDebit };
}

function ResumenActividad() {
  const { data: stats, isLoading } = useProfessionalStats();
  const total = (stats?.completedCount ?? 0) + (stats?.rejectedCount ?? 0);
  const completedPct = total > 0 ? Math.round(((stats?.completedCount ?? 0) / total) * 100) : 0;
  const rejectedPct = total > 0 ? Math.round(((stats?.rejectedCount ?? 0) / total) * 100) : 0;

  if (isLoading) {
    return (
      <Card className="card-industrial mb-6 border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle>Resumen de Actividad</CardTitle>
          <CardDescription>Estadísticas de servicios completados y rechazados</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-industrial mb-6 overflow-hidden border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg sm:text-xl">Resumen de Actividad</CardTitle>
        <CardDescription>Estadísticas de servicios completados y rechazados</CardDescription>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          {/* Servicios Completados */}
          <Card className="card-industrial flex min-h-[140px] flex-col border-border/50 bg-muted/5 shadow-sm transition-all hover:border-primary/25 hover:shadow-md">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium leading-snug text-muted-foreground">
                Servicios Completados
              </CardTitle>
              <div className="rounded-full bg-green-500/15 p-2 ring-1 ring-green-500/20">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" aria-hidden />
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-end pt-0">
              <div className="font-display text-3xl font-bold tabular-nums">{stats?.completedCount ?? 0}</div>
              <p className="mt-1 text-xs text-muted-foreground">Servicios con estado completado</p>
            </CardContent>
          </Card>

          {/* Servicios Rechazados */}
          <Card className="card-industrial flex min-h-[140px] flex-col border-border/50 bg-muted/5 shadow-sm transition-all hover:border-primary/25 hover:shadow-md">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium leading-snug text-muted-foreground">
                Servicios Rechazados
              </CardTitle>
              <div className="rounded-full bg-red-500/15 p-2 ring-1 ring-red-500/20">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden />
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-end pt-0">
              <div className="font-display text-3xl font-bold tabular-nums">{stats?.rejectedCount ?? 0}</div>
              <p className="mt-1 text-xs text-muted-foreground">Servicios con estado rechazado</p>
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
  service?: { title: string; price?: string; category?: { slug?: string } };
  userId?: string;
  paymentMethod?: string;
};

function bookingUsesMobilityCatalogCategory(b: BookingItem): boolean {
  const slug = String(b.service?.category?.slug ?? "").trim().toLowerCase();
  return isSelfServiceCatalogActiveToggleDisallowedForCategorySlug(slug);
}

const BOOKINGS_SUB_TABS = ["pending", "in_progress", "ready", "history"] as const;
type BookingsSubTab = (typeof BOOKINGS_SUB_TABS)[number];

function ProviderBookingsTab({ highlightedBookingId = null }: { highlightedBookingId?: number | null }) {
  const { data: bookings, isLoading, isFetching } = useBookingsByProvider();
  const updateStatus = useUpdateBookingStatus();
  const updateSchedule = useUpdateBookingSchedule();
  const { notifyBookingUpdate } = useSocketBookings();
  const [scheduleInputs, setScheduleInputs] = useState<Record<number, { date: string; time: string }>>({});
  const [pendingScheduleChange, setPendingScheduleChange] = useState<null | {
    bookingId: number;
    scheduleValue: { date: string; time: string };
  }>(null);
  const [subTab, setSubTab] = useState<BookingsSubTab>("pending");
  const PAGE_SIZE = 10;
  const [pageBySubTab, setPageBySubTab] = useState<Record<BookingsSubTab, number>>({
    pending: 1,
    in_progress: 1,
    ready: 1,
    history: 1,
  });

  const list = useMemo(
    () => ((bookings ?? []) as BookingItem[]).filter((b) => !bookingUsesMobilityCatalogCategory(b)),
    [bookings],
  );
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

  // Reglas de transición de estado:
  const executeStatusUpdate = (id: number, status: string) => {
    updateStatus.mutate(
      { id, status },
      {
        onSuccess: (updated) => {
          const b = list.find(x => x.id === id);
          if (status !== "confirmed" && b?.userId && notifyBookingUpdate) {
            notifyBookingUpdate(b.userId, updated ?? { ...b, status });
          }
        },
      }
    );
  };

  function renderBookingRow(booking: BookingItem) {
    const date = toDate(booking.date);
    const dateStr = format(date, "yyyy-MM-dd");
    const timeStr = format(date, "HH:mm");
    const clientName = booking.user
      ? [booking.user.firstName ?? booking.user.name, booking.user.lastName].filter(Boolean).join(" ") || "Cliente"
      : "Cliente";
    const isPending = booking.status === "pending";
    const canComplete = booking.confirmedByClient === true;
    const scheduleDisplay = scheduleInputs[booking.id] ?? { date: dateStr, time: timeStr };
    const requestSaveSchedule = () => {
      const iso = `${scheduleDisplay.date}T${scheduleDisplay.time}:00`;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return;
      setPendingScheduleChange({ bookingId: booking.id, scheduleValue: scheduleDisplay });
    };
    const isHighlighted = highlightedBookingId != null && booking.id === highlightedBookingId;

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
        data-booking-id={booking.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className={`flex flex-col sm:flex-row items-start sm:justify-between gap-4 p-4 border border-border rounded-lg bg-card ${isHighlighted ? "notification-highlight" : ""}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-foreground">{booking.service?.title ?? "Servicio"}</p>
          </div>
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
              <Button type="button" size="sm" variant="secondary" onClick={requestSaveSchedule} disabled={updateSchedule.isPending}>
                {updateSchedule.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar fecha"}
              </Button>
              <span className="text-xs text-muted-foreground">Si acuerdan otro día con el cliente, actualiza aquí.</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">{format(date, "PPP p", { locale: es })}</p>
          )}
          {booking.notes && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">Notas: {booking.notes}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link href={booking.userId ? `/chat?with=${booking.userId}&bookingId=${booking.id}` : "/chat"}>
                <MessageSquare className="h-4 w-4" />
                Chat
              </Link>
            </Button>
            <Button variant="ghost" className="h-auto p-0 text-primary" asChild>
              <Link href={`/service/${booking.serviceId}`}>Ver servicio</Link>
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 shrink-0 w-full sm:w-auto">
          <Badge variant={booking.status === "completed" ? "default" : booking.status === "cancelled" ? "destructive" : "secondary"}>
            {STATUS_OPTIONS.find((o) => o.value === booking.status)?.label ?? booking.status}
          </Badge>
          {(booking.status === "pending" || booking.status === "confirmed" || booking.status === "in_progress") && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="inline-block w-full sm:w-auto">
                      <Select
                      value={booking.status}
                      onValueChange={(value) => {
                        executeStatusUpdate(booking.id, value);
                      }}
                      disabled={updateStatus.isPending}
                    >
                      <SelectTrigger className="w-full sm:w-[160px] bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.filter((opt) => allowedStatusValues.has(opt.value)).map((opt) => (
                          <SelectItem
                            key={opt.value}
                            value={opt.value}
                            disabled={(opt.value === "completed" || opt.value === "in_progress") && !canComplete}
                          >
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {!canComplete && (booking.status === "confirmed" || booking.status === "in_progress")
                    ? "Espera a que el cliente confirme la reserva en la app antes de marcar En proceso o Completada."
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

  const isConfirmSaving = updateSchedule.isPending;

  const handleConfirmScheduleChange = () => {
    if (!pendingScheduleChange) return;
    const scheduleValue = pendingScheduleChange.scheduleValue;
    const iso = `${scheduleValue.date}T${scheduleValue.time}:00`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return;

    updateSchedule.mutate(
      { id: pendingScheduleChange.bookingId, date: d.toISOString() },
      {
        onSuccess: () => {
          setScheduleInputs((prev) => ({ ...prev, [pendingScheduleChange.bookingId]: scheduleValue }));
          setPendingScheduleChange(null);
        },
      },
    );
  };

  return (
    <>
      <BookingsCatalogServicesPanel className="mb-6" />
      <Dialog open={pendingScheduleChange != null} onOpenChange={(open) => (!open ? setPendingScheduleChange(null) : undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Actualizar fecha del servicio?</DialogTitle>
            <DialogDescription>
              Si confirmas, se guardará la nueva fecha y hora y se notificará al cliente si corresponde.
            </DialogDescription>
          </DialogHeader>

          {pendingScheduleChange?.scheduleValue && (
            <div className="text-sm text-muted-foreground space-y-1">
              <p>
                Fecha y hora:{" "}
                <span className="font-medium text-foreground">
                  {pendingScheduleChange.scheduleValue.date} — {pendingScheduleChange.scheduleValue.time}
                </span>
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingScheduleChange(null)} disabled={isConfirmSaving}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleConfirmScheduleChange} disabled={isConfirmSaving}>
              {isConfirmSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-xl leading-tight">Gestión de reservas</CardTitle>
          <CardDescription>
            Reservas de servicios del catálogo (sin taxi, envíos ni marketplace). Podés cambiar la fecha acordada y el
            estado de cada reserva.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tabs value={subTab} onValueChange={(v) => setSubTab(v as BookingsSubTab)} className="w-full">
          <TooltipProvider>
            <TabsList className="flex w-full flex-nowrap items-stretch gap-1 h-auto p-1 bg-muted/50 overflow-x-auto">
              <Tooltip>
                <TooltipTrigger asChild>
                      <TabsTrigger value="pending" className="flex-col gap-1.5 py-2.5 min-w-[64px] data-[state=active]:bg-background data-[state=active]:shadow-sm sm:flex-row sm:gap-2">
                        <Inbox className="h-4 w-4 text-orange-500" />
                    <span className="hidden sm:inline">Solicitudes pendientes</span>
                        <Badge variant="secondary" className="ml-0 sm:ml-1 self-center">{pending.length}</Badge>
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>Solicitudes pendientes</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                      <TabsTrigger value="in_progress" className="flex-col gap-1.5 py-2.5 min-w-[64px] data-[state=active]:bg-background data-[state=active]:shadow-sm sm:flex-row sm:gap-2">
                        <PlayCircle className="h-4 w-4 text-emerald-600" />
                    <span className="hidden sm:inline">En espera</span>
                        <Badge variant="secondary" className="ml-0 sm:ml-1 self-center">{inProgress.length}</Badge>
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>Reservas en espera</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                      <TabsTrigger value="ready" className="flex-col gap-1.5 py-2.5 min-w-[64px] data-[state=active]:bg-background data-[state=active]:shadow-sm sm:flex-row sm:gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="hidden sm:inline">Listas</span>
                        <Badge variant="secondary" className="ml-0 sm:ml-1 self-center">{ready.length}</Badge>
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>Listas para completar</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                      <TabsTrigger value="history" className="flex-col gap-1.5 py-2.5 min-w-[64px] data-[state=active]:bg-background data-[state=active]:shadow-sm sm:flex-row sm:gap-2">
                        <History className="h-4 w-4 text-slate-600" />
                    <span className="hidden sm:inline">Historial</span>
                        <Badge variant="secondary" className="ml-0 sm:ml-1 self-center">{history.length}</Badge>
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
    </>
  );
}


const DASHBOARD_TABS = ["overview", "bookings", "invoices"] as const;

function ProfessionalDashboardInner() {
  const { user, isAuthenticated } = useAuth();
  const { data: walletData } = useWallet({ enabled: isAuthenticated && FEATURE_WALLET_RECHARGE_UI_ENABLED });
  const { data: providerProfile, isLoading: providerProfileLoading } = useCurrentProvider();
  const { data: verifyingStatus } = useVerifyingStatusMe(Boolean(providerProfile));
  const { data: professionalVerification } = useProfessionalVerification(Boolean(providerProfile));
  const { data: categories = [] } = useCategories();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const isProfessionalRole = (user as { role?: string } | null)?.role === "professional";
  const showBecomeProBanner = isProfessionalRole && !providerProfileLoading && !providerProfile;
  const onboardingDossierComplete = useMemo(
    () => isAssociateOnboardingDossierComplete(professionalVerification),
    [professionalVerification],
  );
  const showReturnToVerificationBanner =
    isProfessionalRole &&
    Boolean(providerProfile) &&
    providerProfile?.isVerified !== true &&
    !onboardingDossierComplete;
  const isTaxiDriver = useMemo(
    () => !!(providerProfile?.isVerified && isCarGoProvider(providerProfile, categories)),
    [providerProfile, categories],
  );

  const driverTripCount = useMemo(() => {
    if (!isTaxiDriver) return null;
    // Preferir email para evitar colisiones si el backend cambia el tipo de id.
    const accountKey =
      (user as any)?.email != null ? String((user as any).email) : (user as any)?.id != null ? String((user as any).id) : null;
    return loadTripLog(accountKey).length;
  }, [isTaxiDriver, (user as any)?.id, (user as any)?.email]);

  const getTabFromUrl = () => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const tab = new URLSearchParams(search).get("tab");
    if (tab === "transactions") return "overview";
    const t =
      tab && DASHBOARD_TABS.includes(tab as (typeof DASHBOARD_TABS)[number]) ? tab : "overview";
    return t;
  };
  const [currentTab, setCurrentTabState] = useState(getTabFromUrl);
  const [highlightedBookingId, setHighlightedBookingId] = useState<number | null>(null);

  // Si venimos con "highlight", movemos el viewport hacia la fila resaltada.
  useEffect(() => {
    if (highlightedBookingId == null) return;
    if (currentTab !== "bookings") return;
    if (typeof window === "undefined") return;

    let cancelled = false;
    const maxAttempts = 20; // ~3s
    let attemptCount = 0;

    const attemptScroll = () => {
      if (cancelled) return;
      attemptCount += 1;

      const el = document.querySelector(`[data-booking-id="${highlightedBookingId}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }

      if (attemptCount < maxAttempts) {
        window.setTimeout(attemptScroll, 150);
      }
    };

    // Un pequeño delay para que el estado/tab+paginación se reflejen y React renderice la fila.
    window.setTimeout(attemptScroll, 120);

    return () => {
      cancelled = true;
    };
  }, [highlightedBookingId, currentTab, location]);

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
  const pendingOrActiveCount = overviewStats?.pendingOrActiveCount ?? 0;

  const { data: providerBookings } = useBookingsByProvider();
  const bookingsSafe = useMemo(() => {
    const raw = (providerBookings ?? []) as BookingItem[];
    return raw.filter((b) => !bookingUsesMobilityCatalogCategory(b));
  }, [providerBookings]);

  const completedBookings = useMemo(
    () => bookingsSafe.filter((b) => b.status === "completed") as BookingItem[],
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

  /** Misma fuente que la barra de navegación (reservas / wallet), no el sistema legacy de `reviews`. */
  const ratingAverage = FEATURE_WALLET_RECHARGE_UI_ENABLED
    ? typeof (walletData as { rating?: number } | undefined)?.rating === "number"
      ? (walletData as { rating: number }).rating
      : user != null && typeof (user as { rating?: unknown }).rating === "number"
        ? (user as unknown as { rating: number }).rating
        : 5
    : user != null && typeof (user as { rating?: unknown }).rating === "number"
      ? (user as unknown as { rating: number }).rating
      : 5;
  const ratingTotalReviews = Number(
    (user as { ratingCount?: number } | null)?.ratingCount ??
      (providerProfile as { user?: { ratingCount?: number } } | null | undefined)?.user?.ratingCount ??
      0,
  );
  const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const ratingStarsTotal = ratingTotalReviews || 0;

  // Panel del asociado (Mi actividad): ocultar secciones específicas por UI.
  const SHOW_PRO_RATING_BREAKDOWN = false;
  const subscriptionSummary = useMemo(() => {
    const p = providerProfile as
      | {
          isVerified?: boolean;
          isListingPublished?: boolean;
          visibilitySubscriptionEndsAt?: string | null;
          subscriptionDaysRemaining?: number | null;
        }
      | null
      | undefined;
    if (!p?.isVerified) return null;
    const endsAt = p.visibilitySubscriptionEndsAt ?? null;
    const days =
      p.subscriptionDaysRemaining ??
      (endsAt ? listingSubscriptionDaysRemaining(endsAt) : null) ??
      null;
    const pending = verifyingStatus?.transacction_verified === "pending";
    const expired = p.isListingPublished === false || (typeof days === "number" && days <= 0);
    return { days, pending, expired };
  }, [providerProfile, verifyingStatus?.transacction_verified]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-background border-b border-border px-4 sm:px-6 py-4">
        <div className="container mx-auto max-w-full flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="p-2 bg-mango-orange/10 rounded-lg">
              <BarChart3 className="h-6 w-6 text-mango-orange" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Mi actividad</h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                Resumen de servicios, reservas y calificación
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-6xl py-6 px-4 sm:px-6 overflow-x-hidden">
        {/* Banner: completar perfil profesional si el paso se omitió */}
        {showBecomeProBanner && (
          <Card className="mb-6 border-2 border-mango-orange/50 bg-mango-orange/5">
            <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 py-6">
              <div className="text-center sm:text-left">
                <h2 className="text-lg font-semibold text-foreground mb-1">Completa tu perfil de asociado</h2>
                <p className="text-sm text-muted-foreground">
                  Aún no has configurado tu perfil como asociado. Completa categoría y descripción para publicar tu servicio y recibir reservas.
                </p>
              </div>
              <Button asChild className="shrink-0">
                <Link href="/become-pro">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Configurar como asociado
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {showReturnToVerificationBanner && (
          <Card className="mb-6 border-2 border-primary/35 bg-primary/5">
            <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 py-6">
              <div className="text-center sm:text-left">
                <h2 className="text-lg font-semibold text-foreground mb-1">Completá tu verificación de asociado</h2>
                <p className="text-sm text-muted-foreground">
                  Falta subir identificación, documento profesional (o licencia) o registrar el pago de la cuota. El equipo
                  administrador solo verá tu solicitud cuando estén los tres listos.
                </p>
              </div>
              <Button asChild className="shrink-0">
                <Link href="/professional/verify">
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Ir a verificación
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Bloque superior: resumen + KPIs alineados al mismo ancho */}
        <div className="mx-auto w-full max-w-5xl space-y-5">
          {!isTaxiDriver ? <ResumenActividad /> : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
            {!isTaxiDriver ? (
              <Card className="card-industrial flex min-h-[140px] flex-col border-border/50 bg-muted/5 shadow-sm transition-all hover:border-primary/25 hover:shadow-md">
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium leading-snug text-muted-foreground">
                    Reservas en curso
                  </CardTitle>
                  <div className="rounded-full bg-orange-500/15 p-2 ring-1 ring-orange-500/25">
                    <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" aria-hidden />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-end pt-0">
                  <div className="font-display text-3xl font-bold tabular-nums">{pendingOrActiveCount}</div>
                  <p className="mt-1 text-xs text-muted-foreground">Pendientes, confirmadas o en proceso</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="card-industrial flex min-h-[140px] flex-col border-border/50 bg-muted/5 text-center shadow-sm transition-all hover:border-primary/25">
                <CardContent className="space-y-2 px-4 pb-5 pt-6">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
                    <History className="h-5 w-5 text-primary" aria-hidden />
                  </div>
                  <p className="font-display text-3xl font-bold tabular-nums">{driverTripCount ?? 0}</p>
                  <p className="text-sm text-muted-foreground">Viajes completados (Taxi)</p>
                </CardContent>
              </Card>
            )}

            <Card className="card-industrial flex min-h-[140px] flex-col border-border/50 bg-muted/5 shadow-sm transition-all hover:border-primary/25 hover:shadow-md">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium leading-snug text-muted-foreground">
                  Calificación
                </CardTitle>
                <div className="rounded-full bg-amber-500/15 p-2 ring-1 ring-amber-500/25">
                  <Star className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-end pt-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold tabular-nums">{ratingAverage.toFixed(1)}</span>
                  <Star className="h-6 w-6 fill-amber-400 text-amber-500" aria-hidden />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ratingTotalReviews} {ratingTotalReviews === 1 ? "valoración" : "valoraciones"}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={currentTab} onValueChange={setTab} className="mx-auto mt-8 w-full max-w-5xl space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <TabsList className="inline-flex h-auto min-h-11 w-full max-w-full flex-nowrap justify-center gap-1 overflow-x-auto rounded-xl border border-border/60 bg-muted/30 p-1.5 sm:flex-wrap sm:justify-center [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-muted/50 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
              <TabsTrigger value="overview" className="flex-shrink-0 min-w-[max-content] px-3 py-2 text-sm sm:flex-initial sm:px-3 sm:py-1.5">
                Resumen
              </TabsTrigger>
              <TabsTrigger value="bookings" className="flex-shrink-0 min-w-[max-content] px-3 py-2 text-sm sm:flex-initial sm:px-3 sm:py-1.5">
                Reservas
              </TabsTrigger>
              <TabsTrigger value="invoices" className="flex-shrink-0 min-w-[max-content] px-3 py-2 text-sm sm:flex-initial sm:px-3 sm:py-1.5">
                Facturas
              </TabsTrigger>
            </TabsList>
            <SubscriptionStatusButton variant="outline" className="w-full sm:w-auto" />
          </div>

          <TabsContent value="overview" className="mt-4 outline-none">
            <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6">
              <Card className="card-industrial border-border/60 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg sm:text-xl">Suscripción de visibilidad</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Controla la visibilidad de tu servicio en el catálogo.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm">
                  {subscriptionSummary ? (
                    <div className="flex flex-col gap-1">
                      <p>
                        <span className="text-muted-foreground">Estado:</span>{" "}
                        <span className="font-semibold text-foreground">
                          {subscriptionSummary.pending ? "En revisión" : subscriptionSummary.expired ? "Vencido" : "Activo"}
                        </span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Tiempo restante:</span>{" "}
                        <span className="font-semibold text-foreground">
                          {typeof subscriptionSummary.days === "number" ? `Te quedan ${subscriptionSummary.days} día(s)` : "—"}
                        </span>
                      </p>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      Esta sección aparece cuando tu cuenta está registrada como asociado.
                    </p>
                  )}
                </CardContent>
              </Card>
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
                          <span className="text-sm text-muted-foreground w-12 text-right">{count}</span>
                  </div>
                      );
                    })}
                </CardContent>
              </Card>
              )}

              {/* Booking Stats — mismo estilo que las tarjetas superiores */}
              <Card className="card-industrial border-border/60 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg sm:text-xl">Estadísticas de reservas</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Desglose por estado en reservas de servicios del catálogo (sin taxi, envíos ni marketplace).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                    <Card className="card-industrial border-border/50 bg-muted/5 text-center shadow-sm transition-all hover:border-green-500/30">
                      <CardContent className="space-y-2 px-4 pb-5 pt-6">
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-green-500/15 ring-1 ring-green-500/20">
                          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" aria-hidden />
                        </div>
                        <p className="font-display text-3xl font-bold tabular-nums">{completedBookings.length}</p>
                        <p className="text-sm text-muted-foreground">Completadas</p>
                      </CardContent>
                    </Card>
                    <Card className="card-industrial border-border/50 bg-muted/5 text-center shadow-sm transition-all hover:border-orange-500/30">
                      <CardContent className="space-y-2 px-4 pb-5 pt-6">
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-orange-500/15 ring-1 ring-orange-500/25">
                          <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" aria-hidden />
                        </div>
                        <p className="font-display text-3xl font-bold tabular-nums">{bookingPendingCount}</p>
                        <p className="text-sm text-muted-foreground">Pendientes</p>
                      </CardContent>
                    </Card>
                    <Card className="card-industrial border-border/50 bg-muted/5 text-center shadow-sm transition-all hover:border-red-500/30">
                      <CardContent className="space-y-2 px-4 pb-5 pt-6">
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-500/15 ring-1 ring-red-500/20">
                          <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden />
                        </div>
                        <p className="font-display text-3xl font-bold tabular-nums">{bookingCancelledCount}</p>
                        <p className="text-sm text-muted-foreground">Canceladas</p>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>

            </div>
          </TabsContent>

          <TabsContent value="bookings">
            <ProviderBookingsTab highlightedBookingId={highlightedBookingId} />
          </TabsContent>

          <TabsContent value="invoices">
            <SubscriptionInvoicesPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/**
 * Conductores Car Go verificados usan Go (Car Go), no este panel.
 * Quien no sea asociado o no esté logueado se redirige al inicio.
 */
function ProfessionalDashboardAccessGate() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: providerProfile, isLoading: providerLoading } = useCurrentProvider();
  const { data: categories = [] } = useCategories();
  const [, setLocation] = useLocation();

  const isVerifiedCarGoDriver = useMemo(
    () => !!(providerProfile?.isVerified && isCarGoProvider(providerProfile, categories)),
    [providerProfile, categories]
  );

  const stillLoading = authLoading || (isAuthenticated && providerLoading);

  useEffect(() => {
    if (stillLoading) return;
    if (!isAuthenticated) {
      setLocation("/");
      return;
    }
    if (!providerProfile) {
      setLocation("/");
      return;
    }
  }, [stillLoading, isAuthenticated, providerProfile, isVerifiedCarGoDriver, setLocation]);

  if (stillLoading) {
    return <AccessGateLoading message="Cargando panel de asociado…" />;
  }
  if (!isAuthenticated || !providerProfile) {
    return <AccessGateLoading message="Redirigiendo al inicio…" />;
  }

  return <ProfessionalDashboardInner />;
}

export default ProfessionalDashboardAccessGate;

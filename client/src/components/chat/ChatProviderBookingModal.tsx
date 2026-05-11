import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, ExternalLink, LayoutDashboard, MessageSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateBookingStatus, useUpdateBookingSchedule } from "@/hooks/use-mango-data";
import { useAuth } from "@/hooks/use-auth";
import { useSocketBookings } from "@/hooks/use-socket";
import { toDate } from "@/lib/date-utils";
import { chatApi } from "@/lib/chat-api";
import { PROVIDER_BOOKING_MODAL_DESCRIPTION } from "@/lib/chat-booking-ui-copy";

type BookingItem = {
  id: number;
  serviceId: number;
  date: string | Date | { _seconds?: number };
  status: string;
  cost?: number | string;
  confirmedByClient?: boolean;
  notes?: string | null;
  user?: { firstName?: string; lastName?: string; name?: string };
  service?: { title: string; price?: string };
  userId?: string;
  paymentMethod?: string;
};

const STATUS_OPTIONS = [
  { value: "pending", label: "Pendiente" },
  { value: "confirmed", label: "Confirmada" },
  { value: "in_progress", label: "En proceso" },
  { value: "completed", label: "Completada" },
  { value: "cancelled", label: "Cancelada" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: number | null;
  /** Chat abierto (misma reserva) para avisar el cambio de estado por mensaje. */
  conversationId?: number | null;
};

function getToken() {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

function statusLabel(status: string): string {
  return STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export function ChatProviderBookingModal({ open, onOpenChange, bookingId, conversationId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const loadProviderBookings = open && bookingId != null && !!user?.provider?.id;
  const { data: bookings, isLoading } = useQuery({
    queryKey: ["/api/bookings/provider"],
    queryFn: async () => {
      const token = getToken();
      const res = await fetch("/api/bookings/provider", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("No se pudieron cargar las reservas del asociado");
      return res.json();
    },
    enabled: loadProviderBookings,
    staleTime: 0,
  });
  const updateStatus = useUpdateBookingStatus();
  const updateSchedule = useUpdateBookingSchedule();
  const { notifyBookingUpdate } = useSocketBookings();

  const list = (bookings ?? []) as BookingItem[];
  const booking = useMemo(
    () => (bookingId != null ? list.find((b) => b.id === bookingId) : undefined),
    [list, bookingId],
  );

  const [scheduleDisplay, setScheduleDisplay] = useState({ date: "", time: "" });
  const [pendingSchedule, setPendingSchedule] = useState<null | { date: string; time: string }>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<null | { nextStatus: string }>(null);

  useEffect(() => {
    if (!booking) return;
    const d = toDate(booking.date);
    if (Number.isNaN(d.getTime())) return;
    setScheduleDisplay({ date: format(d, "yyyy-MM-dd"), time: format(d, "HH:mm") });
  }, [booking?.id, booking?.date, open]);

  const sendStatusNoticeToChat = async (id: number, newStatus: string) => {
    const cid = conversationId != null ? Number(conversationId) : NaN;
    if (!Number.isFinite(cid) || cid <= 0) return;
    const text = `La reserva #${id} pasó al estado «${statusLabel(newStatus)}».`;
    try {
      await chatApi.sendMessage({ conversationId: cid, content: text, type: "system" });
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["chat", "messages", cid] });
    } catch (e) {
      console.error("[ChatProviderBookingModal] No se pudo enviar el aviso al chat:", e);
    }
  };

  const executeStatusUpdate = (id: number, status: string, onApplied?: () => void) => {
    updateStatus.mutate(
      { id, status },
      {
        onSuccess: async (updated) => {
          onApplied?.();
          const b = list.find((x) => x.id === id);
          if (status !== "confirmed" && b?.userId && notifyBookingUpdate) {
            notifyBookingUpdate(b.userId, updated ?? { ...b, status });
          }
          try {
            await sendStatusNoticeToChat(id, status);
          } catch {
            /* sendStatusNoticeToChat ya registra errores */
          }
          void queryClient.invalidateQueries({ queryKey: ["/api/bookings/provider"] });
          void queryClient.refetchQueries({ queryKey: ["/api/bookings/provider"] });
        },
      },
    );
  };

  const handleConfirmSchedule = () => {
    if (!pendingSchedule || !bookingId) return;
    const iso = `${pendingSchedule.date}T${pendingSchedule.time}:00`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return;
    updateSchedule.mutate(
      { id: bookingId, date: d.toISOString() },
      { onSuccess: () => setPendingSchedule(null) },
    );
  };

  const body = (() => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      );
    }
    if (bookingId == null) {
      return <p className="text-sm text-muted-foreground">No hay reserva seleccionada.</p>;
    }
    if (!booking) {
      return (
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            No encontramos esta reserva en tu listado de asociado. Puede estar en otro estado o recién creada: abre el
            panel y actualiza.
          </p>
          <Button type="button" variant="outline" asChild>
            <Link href="/professional-dashboard?tab=bookings" className="inline-flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" />
              Ir al panel de reservas
            </Link>
          </Button>
        </div>
      );
    }

    const date = toDate(booking.date);
    const isPending = booking.status === "pending";
    const canComplete = booking.confirmedByClient === true;
    const clientName = booking.user
      ? [booking.user.firstName ?? booking.user.name, booking.user.lastName].filter(Boolean).join(" ") || "Cliente"
      : "Cliente";

    const nextStatusMap: Record<string, string | undefined> = {
      pending: "confirmed",
      confirmed: "in_progress",
      in_progress: "completed",
    };
    const allowedStatusValues = new Set<string>();
    allowedStatusValues.add(booking.status);
    allowedStatusValues.add("cancelled");
    const nextStatus = nextStatusMap[booking.status];
    if (nextStatus) allowedStatusValues.add(nextStatus);

    return (
      <div className="space-y-4 max-h-[min(70vh,520px)] overflow-y-auto pr-1">
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-semibold text-foreground">{booking.service?.title ?? "Servicio"}</p>
          <p className="text-sm text-muted-foreground">Cliente: {clientName}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={booking.status === "completed" ? "default" : booking.status === "cancelled" ? "destructive" : "secondary"}>
              {STATUS_OPTIONS.find((o) => o.value === booking.status)?.label ?? booking.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Reserva #{booking.id}
              {booking.confirmedByClient ? " · Cliente confirmó pago" : ""}
            </span>
          </div>
        </div>

        {isPending ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Fecha y hora del servicio</p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                className="w-[150px]"
                value={scheduleDisplay.date}
                onChange={(e) => setScheduleDisplay((s) => ({ ...s, date: e.target.value }))}
                disabled={updateSchedule.isPending}
              />
              <Input
                type="time"
                className="w-[120px]"
                value={scheduleDisplay.time}
                onChange={(e) => setScheduleDisplay((s) => ({ ...s, time: e.target.value }))}
                disabled={updateSchedule.isPending}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setPendingSchedule({ ...scheduleDisplay })}
                disabled={updateSchedule.isPending}
              >
                Guardar fecha
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Si acuerdan otro día con el cliente, actualiza aquí.</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{format(date, "PPP p", { locale: es })}</p>
        )}

        {booking.notes ? <p className="text-sm text-muted-foreground">Notas: {booking.notes}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link href={booking.userId ? `/chat?with=${booking.userId}&bookingId=${booking.id}` : "/chat"}>
              <MessageSquare className="h-4 w-4" />
              Chat con cliente
            </Link>
          </Button>
          <Button variant="ghost" size="sm" className="text-primary" asChild>
            <Link href={`/service/${booking.serviceId}`}>Ver página del servicio</Link>
          </Button>
          <Button variant="ghost" size="sm" className="text-primary" asChild>
            <Link href={`/edit-service/${booking.serviceId}`}>Editar ficha del servicio</Link>
          </Button>
        </div>

        {(booking.status === "pending" || booking.status === "confirmed" || booking.status === "in_progress") && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-sm font-medium">Estado de la reserva</p>
            {!canComplete && (booking.status === "confirmed" || booking.status === "in_progress") ? (
              <p className="text-xs text-muted-foreground max-w-xs">
                Podrás marcar En proceso o Completada cuando el cliente haya confirmado desde su cuenta (Mis
                reservas).
              </p>
            ) : null}
            <div className="w-full max-w-xs">
              <Select
                value={booking.status}
                onValueChange={(value) => {
                  if (value === booking.status) return;
                  setPendingStatusChange({ nextStatus: value });
                }}
                disabled={updateStatus.isPending}
              >
                <SelectTrigger>
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
          </div>
        )}
      </div>
    );
  })();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" overlayClassName="bg-black/35 backdrop-blur-[0.5px]">
          <DialogHeader>
            <DialogTitle>Gestión de reserva</DialogTitle>
            <DialogDescription>{PROVIDER_BOOKING_MODAL_DESCRIPTION}</DialogDescription>
          </DialogHeader>
          {body}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild>
              <Link
                href={
                  bookingId != null
                    ? `/professional-dashboard?tab=bookings&highlight=${bookingId}`
                    : "/professional-dashboard?tab=bookings"
                }
                className="inline-flex items-center gap-1.5"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir en panel completo
              </Link>
            </Button>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingSchedule != null} onOpenChange={(o) => (!o ? setPendingSchedule(null) : undefined)}>
        <DialogContent className="sm:max-w-md" overlayClassName="bg-black/35 backdrop-blur-[0.5px]">
          <DialogHeader>
            <DialogTitle>¿Actualizar fecha del servicio?</DialogTitle>
            <DialogDescription>
              Si confirmas, se guardará la nueva fecha y hora y se notificará al cliente si corresponde.
            </DialogDescription>
          </DialogHeader>
          {pendingSchedule && (
            <p className="text-sm text-muted-foreground">
              Fecha y hora:{" "}
              <span className="font-medium text-foreground">
                {pendingSchedule.date} — {pendingSchedule.time}
              </span>
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingSchedule(null)} disabled={updateSchedule.isPending}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleConfirmSchedule} disabled={updateSchedule.isPending}>
              {updateSchedule.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingStatusChange != null}
        onOpenChange={(o) => {
          if (!o && !updateStatus.isPending) setPendingStatusChange(null);
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          overlayClassName="bg-black/35 backdrop-blur-[0.5px]"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>¿Cambiar estado de la reserva?</DialogTitle>
            <DialogDescription>
              {pendingStatusChange && bookingId != null ? (
                <>
                  Vas a pasar esta reserva (#{bookingId}) a «{statusLabel(pendingStatusChange.nextStatus)}». Se enviará un
                  mensaje del sistema en este chat con el cambio.
                </>
              ) : (
                "Confirma si deseas aplicar el nuevo estado."
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingStatusChange(null)}
              disabled={updateStatus.isPending}
            >
              No, volver
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!pendingStatusChange || bookingId == null) return;
                const { nextStatus } = pendingStatusChange;
                executeStatusUpdate(bookingId, nextStatus, () => setPendingStatusChange(null));
              }}
              disabled={updateStatus.isPending}
            >
              {updateStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sí, aplicar cambio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

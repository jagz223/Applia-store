import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, ExternalLink, LayoutList, MessageSquare, CheckCircle2, XCircle } from "lucide-react";
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
import { useUpdateBookingStatus } from "@/hooks/use-mango-data";
import { useAuth } from "@/hooks/use-auth";
import { toDate } from "@/lib/date-utils";
import { chatApi } from "@/lib/chat-api";

type BookingRow = {
  id: number;
  serviceId: number;
  userId?: string;
  status: string;
  serviceTitle?: string;
  date?: string | Date | { _seconds?: number };
  notes?: string | null;
  confirmedByClient?: boolean;
  pendingClientAcknowledgment?: boolean;
};

const STATUS_OPTIONS = [
  { value: "pending", label: "Pendiente" },
  { value: "confirmed", label: "Confirmada" },
  { value: "cancelled", label: "Cancelada" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: number | null;
  conversationId?: number | null;
  /** Otro participante del chat (asociado), para enlace «Chat con asociado». */
  associateUserId?: string | null;
  /** El panel del chat ya comprobó que esta reserva es del usuario (evita fallos si el GET no trae `userId`). */
  ownershipVerified?: boolean;
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

export function ChatClientBookingModal({
  open,
  onOpenChange,
  bookingId,
  conversationId,
  associateUserId,
  ownershipVerified = false,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const load = open && bookingId != null && !!user?.id;
  const { data: booking, isLoading } = useQuery({
    queryKey: ["booking", bookingId],
    queryFn: async () => {
      const token = getToken();
      const res = await fetch(`/api/bookings/${bookingId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Reserva no encontrada");
      return res.json() as Promise<BookingRow>;
    },
    enabled: load,
    staleTime: 0,
  });

  const updateStatus = useUpdateBookingStatus();
  const [pendingStatusChange, setPendingStatusChange] = useState<null | { nextStatus: string }>(null);

  const isMine =
    booking != null &&
    user?.id != null &&
    (ownershipVerified || (booking.userId != null && String(booking.userId) === String(user.id)));
  const row = useMemo(() => (isMine ? booking : undefined), [booking, isMine]);

  useEffect(() => {
    if (!open) setPendingStatusChange(null);
  }, [open]);

  const sendStatusNoticeToChat = async (id: number, newStatus: string) => {
    const cid = conversationId != null ? Number(conversationId) : NaN;
    if (!Number.isFinite(cid) || cid <= 0) return;
    const text = `La reserva #${id} pasó al estado «${statusLabel(newStatus)}».`;
    try {
      await chatApi.sendMessage({ conversationId: cid, content: text, type: "system" });
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["chat", "messages", cid] });
    } catch (e) {
      console.error("[ChatClientBookingModal] No se pudo enviar el aviso al chat:", e);
    }
  };

  const executeStatusUpdate = (id: number, status: string, onApplied?: () => void) => {
    updateStatus.mutate(
      { id, status },
      {
        onSuccess: async () => {
          onApplied?.();
          try {
            await sendStatusNoticeToChat(id, status);
          } catch {
            /* sendStatusNoticeToChat ya registra errores */
          }
        },
      },
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
    if (!row) {
      return (
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>No encontramos esta reserva o no corresponde a tu cuenta.</p>
          <Button type="button" variant="outline" asChild>
            <Link href="/bookings" className="inline-flex items-center gap-2">
              <LayoutList className="h-4 w-4" />
              Ir a Mis reservas
            </Link>
          </Button>
        </div>
      );
    }

    const date = toDate(row.date ?? new Date());
    const needsProChangeAck = row.status === "pending" && row.pendingClientAcknowledgment === true;

    return (
      <div className="space-y-4 max-h-[min(70vh,520px)] overflow-y-auto pr-1">
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-semibold text-foreground">{row.serviceTitle ?? "Servicio"}</p>
          <p className="text-sm text-muted-foreground">Vista cliente — coordinación con el asociado</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge
              variant={
                row.status === "completed"
                  ? "default"
                  : row.status === "cancelled"
                    ? "destructive"
                    : "secondary"
              }
            >
              {STATUS_OPTIONS.find((o) => o.value === row.status)?.label ?? row.status}
            </Badge>
            <span className="text-xs text-muted-foreground">Reserva #{row.id}</span>
          </div>
        </div>

        {!Number.isNaN(date.getTime()) ? (
          <p className="text-sm text-muted-foreground">{format(date, "PPP p", { locale: es })}</p>
        ) : null}

        {needsProChangeAck ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-muted-foreground">
            El asociado indicó cambios en monto o fecha. Puedes aceptarlos o cancelar desde{" "}
            <Link href="/bookings" className="text-primary underline">
              Mis reservas
            </Link>
            .
          </div>
        ) : null}

        {row.notes ? <p className="text-sm text-muted-foreground">Notas: {row.notes}</p> : null}

        {row.status !== "pending" || needsProChangeAck ? null : (
          <p className="text-xs text-muted-foreground">
            Si ya acordaste fecha y condiciones con el asociado, puedes confirmar la reserva aquí. El seguimiento del
            servicio también está en Mis reservas.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {associateUserId ? (
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link href={`/chat?with=${associateUserId}&bookingId=${row.id}`}>
                <MessageSquare className="h-4 w-4" />
                Chat con asociado
              </Link>
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" className="text-primary" asChild>
            <Link href={`/service/${row.serviceId}`}>Ver página del servicio</Link>
          </Button>
        </div>

        {row.status === "pending" && !needsProChangeAck && (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-medium">Acciones</p>
            <p className="text-sm text-muted-foreground">
              Revisá que el servicio, la fecha y lo acordado con el asociado sean correctos antes de confirmar.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                type="button"
                className="gap-2"
                disabled={updateStatus.isPending}
                onClick={() => setPendingStatusChange({ nextStatus: "confirmed" })}
              >
                <CheckCircle2 className="h-4 w-4" />
                Confirmar reserva
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                disabled={updateStatus.isPending}
                onClick={() => setPendingStatusChange({ nextStatus: "cancelled" })}
              >
                <XCircle className="h-4 w-4" />
                Cancelar reserva
              </Button>
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
            <DialogTitle>Mi reserva en el chat</DialogTitle>
            <DialogDescription>
              Estado de la reserva y enlaces al servicio. Podés gestionar el detalle completo en Mis reservas.
            </DialogDescription>
          </DialogHeader>
          {body}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild>
              <Link
                href={bookingId != null ? `/bookings?highlight=${bookingId}` : "/bookings"}
                className="inline-flex items-center gap-1.5"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir en Mis reservas
              </Link>
            </Button>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cerrar
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
            <DialogTitle>
              {pendingStatusChange?.nextStatus === "confirmed"
                ? "¿Confirmar la reserva?"
                : pendingStatusChange?.nextStatus === "cancelled"
                  ? "¿Cancelar la reserva?"
                  : "¿Cambiar estado de la reserva?"}
            </DialogTitle>
            <DialogDescription className="space-y-2">
              {pendingStatusChange?.nextStatus === "confirmed" && bookingId != null ? (
                <>
                  <span>
                    Revisá que el servicio, la fecha y lo acordado con el asociado sean correctos. Si confirmás, la
                    reserva #{bookingId} pasará a <strong className="text-foreground">Confirmada</strong>, se avisará en
                    este chat y al asociado. El pago lo coordinas directamente con el profesional.
                  </span>
                </>
              ) : pendingStatusChange?.nextStatus === "cancelled" && bookingId != null ? (
                <>
                  La reserva #{bookingId} quedará como <strong className="text-foreground">Cancelada</strong>, se
                  notificará al asociado y se publicará un aviso en este chat. Si no estás seguro, pulsa «No, volver» y
                  sigue coordinando por chat.
                </>
              ) : pendingStatusChange && bookingId != null ? (
                <>
                  Vas a pasar esta reserva (#{bookingId}) a «{statusLabel(pendingStatusChange.nextStatus)}». Se enviará
                  un mensaje del sistema en este chat con el cambio.
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
              variant={pendingStatusChange?.nextStatus === "cancelled" ? "destructive" : "default"}
              onClick={() => {
                if (!pendingStatusChange || bookingId == null) return;
                const { nextStatus } = pendingStatusChange;
                executeStatusUpdate(bookingId, nextStatus, () => setPendingStatusChange(null));
              }}
              disabled={updateStatus.isPending}
            >
              {updateStatus.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : pendingStatusChange?.nextStatus === "confirmed" ? (
                "Sí, todo correcto"
              ) : pendingStatusChange?.nextStatus === "cancelled" ? (
                "Sí, cancelar reserva"
              ) : (
                "Sí, aplicar cambio"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

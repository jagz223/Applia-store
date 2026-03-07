import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useBookings } from "@/hooks/use-mango-data";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toDate } from "@/lib/date-utils";

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
  const { data: bookings, isLoading: bookingsLoading } = useBookings();

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

        {bookingsLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground">Cargando reservas...</p>
          </div>
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
          <ul className="space-y-4">
            {(bookings as Array<{
              id: number;
              serviceId: number;
              date: string | Date;
              status: string;
              notes?: string | null;
              service?: { id: number; title: string; price?: string; provider?: { userId?: string; user?: { firstName?: string; lastName?: string } } };
            }>).map((booking) => {
              const config = STATUS_CONFIG[booking.status] ?? STATUS_CONFIG.pending;
              const Icon = config.icon;
              const date = toDate(booking.date);
              return (
                <li key={booking.id}>
                  <Card>
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
                          ? `${booking.service.provider.user.firstName ?? ""} ${booking.service.provider.user.lastName ?? ""}`.trim() || "Profesional"
                          : "Profesional"}
                      </p>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center justify-between gap-4">
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
                              (booking as { service?: { provider?: { userId?: string } } }).service?.provider?.userId
                                ? `/chat?with=${(booking as { service?: { provider?: { userId?: string } } }).service?.provider?.userId}`
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
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  DollarSign, TrendingUp, Calendar, Users, 
  Star, Clock, CreditCard, FileText,
  BarChart3, PieChart, Activity, Loader2, MessageSquare
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useSocketBookings } from "@/hooks/use-socket";
import { useBookingsByProvider, useUpdateBookingStatus } from "@/hooks/use-mango-data";
import { Link } from "wouter";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toDate } from "@/lib/date-utils";

// Mock data for professional dashboard
const mockEarnings = {
  total: 12450,
  thisMonth: 3250,
  lastMonth: 2800,
  pending: 850,
};

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

function ProviderBookingsTab() {
  const { data: bookings, isLoading } = useBookingsByProvider();
  const updateStatus = useUpdateBookingStatus();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!bookings?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reservas recibidas</CardTitle>
          <CardDescription>Cuando un cliente reserve tu servicio, aparecerá aquí. Podrás confirmar, marcar en proceso o completar.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">No tienes reservas aún.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reservas recibidas</CardTitle>
        <CardDescription>Actualiza el estado de cada reserva según avance el trabajo.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {(bookings as Array<{
            id: number;
            serviceId: number;
            date: string | Date | { _seconds?: number };
            status: string;
            notes?: string | null;
            user?: { firstName?: string; lastName?: string; name?: string };
            service?: { title: string; price?: string };
          }>).map((booking) => {
            const date = toDate(booking.date);
            const clientName = booking.user
              ? [booking.user.firstName ?? booking.user.name, booking.user.lastName].filter(Boolean).join(" ") || "Cliente"
              : "Cliente";
            return (
              <div key={booking.id} className="flex flex-wrap items-start justify-between gap-4 p-4 border rounded-lg">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{booking.service?.title ?? "Servicio"}</p>
                  <p className="text-sm text-muted-foreground">Cliente: {clientName}</p>
                  <p className="text-xs text-muted-foreground mt-1">{format(date, "PPP", { locale: es })}</p>
                  {booking.service?.price != null && (
                    <p className="text-sm font-medium text-primary mt-1">${Number(booking.service.price).toFixed(0)}</p>
                  )}
                  {booking.notes && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">Notas: {booking.notes}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <Button variant="outline" size="sm" className="gap-1.5" asChild>
                      <Link href={(booking as { userId?: string }).userId ? `/chat?with=${(booking as { userId: string }).userId}` : "/chat"}>
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
                  <Select
                    value={booking.status}
                    onValueChange={(value) => updateStatus.mutate({ id: booking.id, status: value })}
                    disabled={updateStatus.isPending}
                  >
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProfessionalDashboard() {
  const { user } = useAuth();
  const { notifyBookingUpdate } = useSocketBookings();
  const [timeRange, setTimeRange] = useState("month");

  // Calculate percentage changes
  const earningsChange = ((mockEarnings.thisMonth - mockEarnings.lastMonth) / mockEarnings.lastMonth) * 100;
  const bookingsChange = ((mockBookings.completed - 100) / 100) * 100;

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
            <Button variant="outline" size="sm" className="flex-1 sm:flex-initial min-w-0">
              <FileText className="h-4 w-4 mr-2 shrink-0" />
              <span className="truncate">Generar Reporte</span>
            </Button>
            <Button size="sm" className="flex-1 sm:flex-initial min-w-0">
              <CreditCard className="h-4 w-4 mr-2 shrink-0" />
              <span className="truncate">Retirar Fondos</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-full py-6 px-4 overflow-x-hidden">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
              <DollarSign className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${mockEarnings.total.toLocaleString()}</div>
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
              <div className="text-2xl font-bold">${mockEarnings.thisMonth.toLocaleString()}</div>
              <p className="text-xs text-gray-500">{mockBookings.completed} servicios completados</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pendiente de Cobro</CardTitle>
              <Clock className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${mockEarnings.pending.toLocaleString()}</div>
              <p className="text-xs text-gray-500">{mockBookings.pending} reservas pendientes</p>
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
        <Tabs defaultValue="overview" className="space-y-4">
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
            <ProviderBookingsTab />
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

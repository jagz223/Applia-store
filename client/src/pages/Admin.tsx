import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { 
  Users, DollarSign, FileText, Star, Settings, 
  BarChart3, Shield, Bell, Database, Layers,
  CheckCircle, XCircle, Clock, TrendingUp, UserPlus,
  Search, ChevronLeft, ChevronRight, Loader2, Wallet
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useAdminWalletTransfers, useUpdateTransferStatus } from "@/hooks/use-mango-data";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toDate, isValidDate } from "@/lib/date-utils";

const USERS_PAGE_SIZE = 10;

async function fetchWithAuth(url: string) {
  const token = localStorage.getItem("token");
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Mock data for admin dashboard
const mockStats = {
  totalUsers: 1250,
  activeProviders: 342,
  totalBookings: 5678,
  totalRevenue: 456780,
  pendingApprovals: 23,
  averageRating: 4.7,
};

const mockRecentBookings = [
  { id: 1, service: "Electricista", client: "Juan Pérez", provider: "Carlos M.", status: "completed", amount: 85, date: "2024-01-15" },
  { id: 2, service: "Plomería", client: "María López", provider: "Pedro S.", status: "pending", amount: 120, date: "2024-01-15" },
  { id: 3, service: "Limpieza", client: "Ana García", provider: "Laura R.", status: "in_progress", amount: 65, date: "2024-01-14" },
];

const mockProviders = [
  { id: 1, name: "Carlos Martínez", service: "Electricista", rating: 4.8, bookings: 156, verified: true },
  { id: 2, name: "Pedro Sánchez", service: "Plomería", rating: 4.6, bookings: 89, verified: true },
  { id: 3, name: "Laura Rodríguez", service: "Limpieza", rating: 4.9, bookings: 234, verified: false },
];

type TransferStatusFilter = "" | "pending_approval" | "completed" | "rejected";

export default function AdminPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      if (p.get("tab") === "recargas") return "recargas";
    }
    return "overview";
  });
  const [userPage, setUserPage] = useState(1);

  // Abrir pestaña Recargas y leer highlight desde la URL o desde evento (clic en notificación)
  const [highlightedTransferId, setHighlightedTransferId] = useState<number | null>(null);

  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const q = new URLSearchParams(search);
    if (q.get("tab") === "recargas") setActiveTab("recargas");
    const highlight = q.get("highlight");
    if (highlight) {
      const id = parseInt(highlight, 10);
      if (!Number.isNaN(id)) {
        setHighlightedTransferId(id);
        q.delete("highlight");
        const newSearch = q.toString();
        const newPath = newSearch ? `/admin?${newSearch}` : "/admin";
        window.history.replaceState(null, "", newPath);
        const t = setTimeout(() => setHighlightedTransferId(null), 2800);
        return () => clearTimeout(t);
      }
    }
  }, [location]);

  // Escuchar evento al hacer clic en notificación de recarga (incluso si ya estamos en /admin)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ transferId?: number | null }>).detail;
      setActiveTab("recargas");
      if (detail?.transferId != null && !Number.isNaN(detail.transferId)) {
        setHighlightedTransferId(detail.transferId);
        setTimeout(() => setHighlightedTransferId(null), 2800);
      }
    };
    window.addEventListener("admin-open-recargas", handler);
    return () => window.removeEventListener("admin-open-recargas", handler);
  }, []);
  const [userFilters, setUserFilters] = useState({ role: "", name: "", email: "", lastName: "" });
  const [transferStatusFilter, setTransferStatusFilter] = useState<TransferStatusFilter>("");
  const [transferToReview, setTransferToReview] = useState<{
    id: number;
    referenceId?: string;
    description?: string;
    amount: number;
    status?: string;
  } | null>(null);
  const [pendingRechargeAction, setPendingRechargeAction] = useState<"approve" | "reject" | null>(null);

  const { data: rolesData } = useQuery({
    queryKey: ["roles"],
    queryFn: () => fetchWithAuth("/api/roles"),
    enabled: user?.role === "admin",
  });
  const roles = rolesData ?? [];

  const usersQueryParams = new URLSearchParams({
    page: String(userPage),
    limit: String(USERS_PAGE_SIZE),
  });
  if (userFilters.role) usersQueryParams.set("role", userFilters.role);
  if (userFilters.name) usersQueryParams.set("name", userFilters.name);
  if (userFilters.email) usersQueryParams.set("email", userFilters.email);
  if (userFilters.lastName) usersQueryParams.set("lastName", userFilters.lastName);

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users", userPage, userFilters],
    queryFn: () => fetchWithAuth(`/api/admin/users?${usersQueryParams.toString()}`),
    enabled: user?.role === "admin",
  });
  const usersList = usersData?.users ?? [];
  const usersTotal = usersData?.total ?? 0;
  const usersTotalPages = Math.max(1, Math.ceil(usersTotal / USERS_PAGE_SIZE));

  const { data: adminTransfersData, isLoading: adminTransfersLoading } = useAdminWalletTransfers({
    enabled: user?.role === "admin" && activeTab === "recargas",
  });
  const allTransfers = adminTransfersData?.transfers ?? [];
  const filteredTransfers =
    transferStatusFilter === ""
      ? allTransfers
      : allTransfers.filter((t: { status?: string }) => t.status === transferStatusFilter);

  const updateTransferStatus = useUpdateTransferStatus();
  const push = usePushNotifications();

  const handleConfirmRechargeAction = (approve: boolean) => {
    if (!transferToReview) return;
    const status = approve ? "completed" : "rejected";
    updateTransferStatus.mutate(
      { transferId: String(transferToReview.id), status },
      {
        onSuccess: () => {
          setTransferToReview(null);
          setPendingRechargeAction(null);
          toast({
            title: approve ? "Recarga aprobada" : "Recarga rechazada",
            description: approve ? "El saldo del usuario ha sido actualizado." : "La solicitud fue rechazada.",
          });
        },
        onError: (err: Error) => {
          toast({
            title: "Error",
            description: err.message || "No se pudo actualizar el estado.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const closeRechargeModal = () => {
    setTransferToReview(null);
    setPendingRechargeAction(null);
  };

  // Check if user is admin
  if (user?.role !== "admin") {
    return (
      <div className="container mx-auto py-10 px-4">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="text-red-500">Acceso Denegado</CardTitle>
            <CardDescription>No tienes permisos de administrador</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Solo los administradores pueden acceder a este panel.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-mango-orange" />
            <div>
              <h1 className="text-2xl font-bold">Panel de Administración</h1>
              <p className="text-gray-500">GenFeb S.A.S.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon">
              <Bell className="h-5 w-5" />
            </Button>
            <Avatar>
              <AvatarFallback>{user?.name?.[0]}</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </div>

      <div className="container mx-auto py-6 px-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Usuarios Totales</CardTitle>
              <Users className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{mockStats.totalUsers.toLocaleString()}</div>
              <p className="text-xs text-green-500">+12% este mes</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Proveedores Activos</CardTitle>
              <Shield className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{mockStats.activeProviders}</div>
              <p className="text-xs text-green-500">+5% este mes</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Reservas Totales</CardTitle>
              <FileText className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{mockStats.totalBookings.toLocaleString()}</div>
              <p className="text-xs text-green-500">+23% este mes</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
              <DollarSign className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${mockStats.totalRevenue.toLocaleString()}</div>
              <p className="text-xs text-green-500">+18% este mes</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Resumen</TabsTrigger>
            <TabsTrigger value="users">Usuarios</TabsTrigger>
            <TabsTrigger value="providers">Proveedores</TabsTrigger>
            <TabsTrigger value="bookings">Reservas</TabsTrigger>
            <TabsTrigger value="recargas">Recargas</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="settings">Configuración</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Bookings */}
              <Card>
                <CardHeader>
                  <CardTitle>Reservas Recientes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {mockRecentBookings.map((booking) => (
                      <div key={booking.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{booking.service}</p>
                          <p className="text-sm text-gray-500">{booking.client}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant={booking.status === "completed" ? "default" : booking.status === "pending" ? "secondary" : "outline"}>
                            {booking.status}
                          </Badge>
                          <p className="text-sm font-medium mt-1">${booking.amount}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Pending Approvals */}
              <Card>
                <CardHeader>
                  <CardTitle>Aprobaciones Pendientes</CardTitle>
                  <CardDescription>Proveedores esperando verificación</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {mockProviders.filter(p => !p.verified).map((provider) => (
                      <div key={provider.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>{provider.name[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{provider.name}</p>
                            <p className="text-sm text-gray-500">{provider.service}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="text-green-600">
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Aprobar
                          </Button>
                          <Button size="sm" variant="outline" className="text-red-600">
                            <XCircle className="h-4 w-4 mr-1" />
                            Rechazar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>Gestión de Usuarios</CardTitle>
                <CardDescription>Lista real de usuarios con filtros y paginación (10 por página)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <Select
                    value={userFilters.role || "all"}
                    onValueChange={(v) => setUserFilters((f) => ({ ...f, role: v === "all" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Rol" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los roles</SelectItem>
                      {roles.map((r: { code: string; name: string }) => (
                        <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Nombre"
                    value={userFilters.name}
                    onChange={(e) => setUserFilters((f) => ({ ...f, name: e.target.value }))}
                  />
                  <Input
                    placeholder="Correo"
                    type="email"
                    value={userFilters.email}
                    onChange={(e) => setUserFilters((f) => ({ ...f, email: e.target.value }))}
                  />
                  <Input
                    placeholder="Apellido"
                    value={userFilters.lastName}
                    onChange={(e) => setUserFilters((f) => ({ ...f, lastName: e.target.value }))}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => setUserPage(1)}
                    className="flex items-center gap-2"
                  >
                    <Search className="h-4 w-4" />
                    Filtrar
                  </Button>
                </div>
                {usersLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : usersList.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No hay usuarios que coincidan con los filtros.</p>
                ) : (
                  <>
                    <div className="space-y-4">
                      {usersList.map((u: { id: string; name?: string; lastName?: string; email?: string; role?: string; createdAt?: string }) => (
                        <div key={u.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarFallback>{(u.name || u.email || "?")[0]}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{[u.name, u.lastName].filter(Boolean).join(" ") || "—"}</p>
                              <p className="text-sm text-gray-500">{u.email ?? "—"}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                              {u.role ?? "—"}
                            </Badge>
                            <p className="text-sm text-gray-500">
                              {u.createdAt && isValidDate(u.createdAt)
                                ? toDate(u.createdAt).toLocaleDateString()
                                : "—"}
                            </p>
                            <Button size="sm" variant="outline" asChild>
                              <Link href={`/admin/users/${u.id}/edit`}>Editar</Link>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-4 border-t">
                      <p className="text-sm text-muted-foreground">
                        Total: {usersTotal} usuario{usersTotal !== 1 ? "s" : ""} · Página {userPage} de {usersTotalPages}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={userPage <= 1}
                          onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Anterior
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={userPage >= usersTotalPages}
                          onClick={() => setUserPage((p) => Math.min(usersTotalPages, p + 1))}
                        >
                          Siguiente
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="providers">
            <Card>
              <CardHeader>
                <CardTitle>Proveedores</CardTitle>
                <CardDescription>Gestiona proveedores de servicios</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {mockProviders.map((provider) => (
                    <div key={provider.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>{provider.name[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{provider.name}</p>
                          <p className="text-sm text-gray-500">{provider.service}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 text-yellow-500" />
                          <span>{provider.rating}</span>
                        </div>
                        <span className="text-sm text-gray-500">{provider.bookings} reservas</span>
                        {provider.verified && <Badge>Verificado</Badge>}
                        <Button size="sm" variant="outline">Ver Perfil</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bookings">
            <Card>
              <CardHeader>
                <CardTitle>Todas las Reservas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {mockRecentBookings.map((booking) => (
                    <div key={booking.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">{booking.service}</p>
                        <p className="text-sm text-gray-500">Cliente: {booking.client} | Proveedor: {booking.provider}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant={booking.status === "completed" ? "default" : "secondary"}>
                          {booking.status}
                        </Badge>
                        <span className="font-medium">${booking.amount}</span>
                        <span className="text-sm text-gray-500">{booking.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recargas">
            {push.isSupported && push.permission === "default" && (
              <Card className="mb-4 border-amber-500/50 bg-amber-500/5">
                <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-6">
                  <p className="text-sm text-muted-foreground">
                    Para recibir avisos de nuevas solicitudes de recarga en este dispositivo, activa las notificaciones del navegador.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => push.register()}
                    disabled={push.isRegistering}
                  >
                    {push.isRegistering ? "Activando…" : "Activar notificaciones"}
                  </Button>
                </CardContent>
              </Card>
            )}
            {push.isSupported && push.permission === "denied" && (
              <Card className="mb-4 border-muted">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">
                    Las notificaciones están bloqueadas. Para recibir avisos de recargas, permite las notificaciones en la configuración del navegador (candado o icono de sitio → Permisos).
                  </p>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Transferencias y recargas
                </CardTitle>
                <CardDescription>
                  Listado de todas las transferencias. Aprobar o rechazar solicitudes de recarga en espera.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={transferStatusFilter === "" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTransferStatusFilter("")}
                  >
                    Todas
                  </Button>
                  <Button
                    variant={transferStatusFilter === "pending_approval" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTransferStatusFilter("pending_approval")}
                  >
                    En espera
                  </Button>
                  <Button
                    variant={transferStatusFilter === "completed" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTransferStatusFilter("completed")}
                  >
                    Aprobadas
                  </Button>
                  <Button
                    variant={transferStatusFilter === "rejected" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTransferStatusFilter("rejected")}
                  >
                    Rechazadas
                  </Button>
                </div>
                {adminTransfersLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredTransfers.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">
                    No hay transferencias con el filtro seleccionado.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="text-left font-medium p-3">Nº Transferencia</th>
                          <th className="text-left font-medium p-3">Descripción</th>
                          <th className="text-left font-medium p-3">Fecha</th>
                          <th className="text-right font-medium p-3">Monto</th>
                          <th className="text-left font-medium p-3">Estado</th>
                          <th className="text-left font-medium p-3">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTransfers.map((t: {
                          id: number;
                          referenceId?: string;
                          description?: string;
                          createdAt: string | Date;
                          amount: number;
                          status?: string;
                        }) => (
                          <tr
                            key={t.id}
                            className={`border-b border-border/60 hover:bg-muted/30 ${highlightedTransferId === t.id ? "recharge-highlight-row" : ""}`}
                          >
                            <td className="p-3 text-foreground font-mono">
                              {t.referenceId || "—"}
                            </td>
                            <td className="p-3 text-muted-foreground max-w-[220px] truncate" title={t.description}>
                              {t.description || "—"}
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {t.createdAt && isValidDate(t.createdAt)
                                ? format(toDate(t.createdAt), "dd MMM yyyy, HH:mm", { locale: es })
                                : "—"}
                            </td>
                            <td className="p-3 text-right font-medium tabular-nums">
                              {new Intl.NumberFormat("es-EC", {
                                style: "currency",
                                currency: "USD",
                                minimumFractionDigits: 2,
                              }).format(t.amount ?? 0)}
                            </td>
                            <td className="p-3">
                              <span
                                className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                                  t.status === "completed"
                                    ? "bg-green-500/15 text-green-700 dark:text-green-400"
                                    : t.status === "rejected"
                                      ? "bg-red-500/15 text-red-700 dark:text-red-400"
                                      : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                }`}
                              >
                                {t.status === "pending_approval"
                                  ? "En espera"
                                  : t.status === "completed"
                                    ? "Aprobada"
                                    : t.status === "rejected"
                                      ? "Rechazada"
                                      : t.status ?? "—"}
                              </span>
                            </td>
                            <td className="p-3">
                              {t.status === "pending_approval" && (
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="text-green-700 hover:text-green-800 bg-green-500/15 hover:bg-green-500/25 border-green-500/30"
                                    onClick={() => {
                                      setTransferToReview({ id: t.id, referenceId: t.referenceId, description: t.description, amount: t.amount, status: t.status });
                                      setPendingRechargeAction("approve");
                                    }}
                                  >
                                    Aprobar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600 hover:text-red-700 border-red-500/50 hover:bg-red-500/10"
                                    onClick={() => {
                                      setTransferToReview({ id: t.id, referenceId: t.referenceId, description: t.description, amount: t.amount, status: t.status });
                                      setPendingRechargeAction("reject");
                                    }}
                                  >
                                    Rechazar
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Dialog open={transferToReview != null} onOpenChange={(open) => !open && closeRechargeModal()}>
              <DialogContent className="sm:max-w-md border-border bg-card">
                <DialogHeader>
                  <DialogTitle>
                    {pendingRechargeAction === "approve"
                      ? "¿Está seguro de aprobar esta recarga?"
                      : pendingRechargeAction === "reject"
                        ? "¿Está seguro de rechazar esta recarga?"
                        : "Confirmar"}
                  </DialogTitle>
                  <DialogDescription>
                    {transferToReview && (
                      <>
                        Transferencia #{transferToReview.referenceId || transferToReview.id} ·{" "}
                        {new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(transferToReview.amount)}
                      </>
                    )}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    variant="outline"
                    onClick={closeRechargeModal}
                    disabled={updateTransferStatus.isPending}
                  >
                    No
                  </Button>
                  <Button
                    onClick={() => pendingRechargeAction != null && handleConfirmRechargeAction(pendingRechargeAction === "approve")}
                    disabled={updateTransferStatus.isPending || pendingRechargeAction == null}
                  >
                    {updateTransferStatus.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Procesando…
                      </>
                    ) : (
                      "Sí"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="roles">
            <Card>
              <CardHeader>
                <CardTitle>Gestión de roles</CardTitle>
                <CardDescription>
                  Crea y administra los roles que puedes asignar a los usuarios (admin, professional, client y personalizados).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href="/admin/create-role" className="inline-flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    Crear nuevo rol
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Configuración General</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Registro de usuarios</p>
                      <p className="text-sm text-gray-500">Permitir nuevos registros</p>
                    </div>
                    <Button variant="outline">Configurar</Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Verificación de proveedores</p>
                      <p className="text-sm text-gray-500">Requiere aprobación manual</p>
                    </div>
                    <Button variant="outline">Configurar</Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Comisiones</p>
                      <p className="text-sm text-gray-500">15% por transacción</p>
                    </div>
                    <Button variant="outline">Configurar</Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Notificaciones</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Email de nuevas reservas</p>
                    </div>
                    <Button variant="outline">Activo</Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Alertas de pagos</p>
                    </div>
                    <Button variant="outline">Activo</Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Newsletter semanal</p>
                    </div>
                    <Button variant="outline">Inactivo</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

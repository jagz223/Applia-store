import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { 
  Users, DollarSign, FileText, Star, Settings, Eye,
  BarChart3, Shield, Bell, Database, Layers,
  CheckCircle, XCircle, Clock, TrendingUp, UserPlus,
  Search, ChevronLeft, ChevronRight, Loader2, Wallet, Banknote, History, Inbox, PlayCircle
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { useAuth } from "@/hooks/use-auth";
import { hasAdminRole, hasFullAdminRole } from "@/lib/auth-utils";
import { useAdminWalletTransfers, useUpdateTransferStatus, useAdminManualRecharge, useAdminWithdrawals, useProcessWithdrawal, useAdminWithdrawalHistory, type WithdrawalHistoryStatus, type WithdrawalHistoryItem } from "@/hooks/use-mango-data";
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

async function patchWithAuth(url: string, body: unknown) {
  const token = localStorage.getItem("token");
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
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

type AdminProviderWithServices = {
  providerId: number;
  userId: string;
  name: string;
  email?: string | null;
  profession?: string | null;
  category?: string | null;
  serviceCount: number;
  bookingsCount: number;
  rating: number;
  ratingCount: number;
  verified: boolean;
};

type AdminBookingItem = {
  id: number;
  status: string;
  date: unknown;
  createdAt?: unknown;
  cost?: unknown;
  confirmedByClient?: boolean;
  notes?: string | null;
  user?: { firstName?: string; lastName?: string; name?: string; email?: string | null };
  service?: { title?: string; price?: string; provider?: { user?: { firstName?: string; lastName?: string; name?: string } } };
};

type TransferStatusFilter = "" | "pending_approval" | "completed" | "rejected";

type UserOption = { id: string; name: string; email: string; role?: string };

const SALDO_DEBOUNCE_MS = 1000;
const ROLE_LABELS: Record<string, string> = {
  client: "Cliente",
  professional: "Asociado",
  admin: "Administrador",
  tiSupport: "Soporte TI",
};

type WithdrawalRequest = {
  id: string;
  name: string;
  lastName: string;
  email: string;
  bankName?: string;
  accountNumber?: string;
  withdrawingFunds: number;
};

const WITHDRAWAL_HISTORY_LIMIT = 10;
const HISTORY_STATUS_OPTIONS: { value: WithdrawalHistoryStatus; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "pending", label: "Pendientes" },
  { value: "approved", label: "Aprobadas" },
  { value: "rejected", label: "Rechazadas" },
];

function WithdrawalHistorySection({ formatUsd, enabled }: { formatUsd: (n: number) => string; enabled: boolean }) {
  const [historyPage, setHistoryPage] = useState(1);
  const [historyStatus, setHistoryStatus] = useState<WithdrawalHistoryStatus>("all");
  const { data, isLoading } = useAdminWithdrawalHistory({
    page: historyPage,
    limit: WITHDRAWAL_HISTORY_LIMIT,
    status: historyStatus,
    enabled,
  });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / WITHDRAWAL_HISTORY_LIMIT));

  const statusLabel = (s: string) => {
    if (s === "pending") return "Pendiente";
    if (s === "approved") return "Aprobada";
    if (s === "rejected") return "Rechazada";
    return s;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Label className="text-muted-foreground">Filtrar por estado:</Label>
        <Select
          value={historyStatus}
          onValueChange={(v) => {
            setHistoryStatus(v as WithdrawalHistoryStatus);
            setHistoryPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HISTORY_STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground">No hay registros con el filtro seleccionado.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-3 font-medium">Fecha</th>
                  <th className="text-left p-3 font-medium">Asociado</th>
                  <th className="text-left p-3 font-medium">Monto</th>
                  <th className="text-left p-3 font-medium">Banco</th>
                  <th className="text-left p-3 font-medium">Número de cuenta</th>
                  <th className="text-left p-3 font-medium">Procesado por</th>
                  <th className="text-left p-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row: WithdrawalHistoryItem) => (
                  <tr key={row.id} className="border-b border-border hover:bg-muted/30">
                    <td className="p-3 text-muted-foreground">
                      {row.processedAt
                        ? format(new Date(row.processedAt), "dd/MM/yyyy HH:mm", { locale: es })
                        : "—"}
                    </td>
                    <td className="p-3">
                      <p className="font-medium">{row.userName}</p>
                      {row.userEmail && <p className="text-xs text-muted-foreground">{row.userEmail}</p>}
                    </td>
                    <td className="p-3 font-medium tabular-nums">{formatUsd(row.amount)}</td>
                    <td className="p-3 text-muted-foreground">{row.bankName ?? "—"}</td>
                    <td className="p-3 font-mono text-muted-foreground">{row.accountNumber ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">{row.processedByAdminName ?? "—"}</td>
                    <td className="p-3">
                      <Badge
                        variant={row.status === "approved" ? "default" : row.status === "rejected" ? "destructive" : "secondary"}
                      >
                        {statusLabel(row.status)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-2">
              <p className="text-sm text-muted-foreground">
                {total} registro{total !== 1 ? "s" : ""} · Página {historyPage} de {totalPages}
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={historyPage <= 1}
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={historyPage >= totalPages}
                  onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AdminWithdrawalsTab({
  toast,
  enabled,
}: {
  toast: (p: { title: string; description?: string; variant?: "destructive" }) => void;
  enabled: boolean;
}) {
  const { data: withdrawals = [], isLoading } = useAdminWithdrawals({ enabled });
  const processWithdrawal = useProcessWithdrawal();
  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const formatUsd = (n: number) =>
    new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const openWithdrawalDialog = (userId: string, action: "approve" | "reject") => {
    setPendingUserId(userId);
    setPendingAction(action);
    setAdminNote("");
    setWithdrawalDialogOpen(true);
  };

  const closeWithdrawalDialog = () => {
    setWithdrawalDialogOpen(false);
    setPendingUserId(null);
    setPendingAction(null);
    setAdminNote("");
  };

  const confirmWithdrawalAction = () => {
    if (!pendingUserId || !pendingAction) return;
    processWithdrawal.mutate(
      { userId: pendingUserId, action: pendingAction, adminNote: adminNote.trim() || undefined },
      {
        onSuccess: () => {
          closeWithdrawalDialog();
          toast({
            title: pendingAction === "approve" ? "Pago aprobado" : "Retiro rechazado",
            description: pendingAction === "approve"
              ? "El retiro fue registrado y el asociado será notificado."
              : "Los fondos fueron devueltos a la billetera del usuario.",
          });
        },
        onError: (err: Error) => {
          toast({ title: "Error", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  const [withdrawalSubTab, setWithdrawalSubTab] = useState<"pending" | "history">("pending");
  const [pendingWithdrawalsPage, setPendingWithdrawalsPage] = useState(1);

  useEffect(() => {
    if (withdrawalSubTab === "pending") setPendingWithdrawalsPage(1);
  }, [withdrawalSubTab]);

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Banknote className="h-5 w-5" />
          Solicitudes de Retiro
        </CardTitle>
        <CardDescription>
          Gestiona solicitudes pendientes o consulta el historial de retiros aprobados y rechazados.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={withdrawalSubTab} onValueChange={(v) => setWithdrawalSubTab(v as "pending" | "history")}>
          <TabsList className="grid w-full max-w-sm grid-cols-2 mb-4">
            <TabsTrigger value="pending" className="gap-1.5">
              <Banknote className="h-4 w-4" />
              Pendientes
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="h-4 w-4" />
              Historial
            </TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="mt-0 overflow-x-auto">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : withdrawals.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No hay solicitudes de retiro pendientes.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left p-3 font-medium">Asociado</th>
                      <th className="text-left p-3 font-medium">Monto a retirar</th>
                      <th className="text-left p-3 font-medium">Banco</th>
                      <th className="text-left p-3 font-medium">Número de cuenta</th>
                      <th className="text-left p-3 font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(withdrawals as WithdrawalRequest[]).slice(
                      (pendingWithdrawalsPage - 1) * USERS_PAGE_SIZE,
                      pendingWithdrawalsPage * USERS_PAGE_SIZE,
                    ).map((row) => (
                      <tr key={row.id} className="border-b border-border hover:bg-muted/30">
                        <td className="p-3">
                          <p className="font-medium">{[row.name, row.lastName].filter(Boolean).join(" ") || row.email || row.id}</p>
                          {row.email && <p className="text-xs text-muted-foreground">{row.email}</p>}
                        </td>
                        <td className="p-3 font-medium tabular-nums">{formatUsd(row.withdrawingFunds)}</td>
                        <td className="p-3 text-muted-foreground">{row.bankName ?? "—"}</td>
                        <td className="p-3 font-mono text-muted-foreground">{row.accountNumber ?? "—"}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              className="text-green-700 hover:text-green-800 bg-green-500/15 hover:bg-green-500/25 border-green-500/30"
                              disabled={processWithdrawal.isPending}
                              onClick={() => openWithdrawalDialog(row.id, "approve")}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Aprobar pago
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700 border-red-500/50 hover:bg-red-500/10"
                              disabled={processWithdrawal.isPending}
                              onClick={() => openWithdrawalDialog(row.id, "reject")}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Rechazar pago
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {withdrawalSubTab === "pending" && withdrawals.length > USERS_PAGE_SIZE && (
              <div className="flex items-center justify-between gap-2 pt-4 border-t mt-4">
                <p className="text-sm text-muted-foreground">
                  Página {pendingWithdrawalsPage} de {Math.max(1, Math.ceil(withdrawals.length / USERS_PAGE_SIZE))}
                </p>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pendingWithdrawalsPage <= 1}
                    onClick={() => setPendingWithdrawalsPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pendingWithdrawalsPage >= Math.max(1, Math.ceil(withdrawals.length / USERS_PAGE_SIZE))}
                    onClick={() => setPendingWithdrawalsPage((p) => Math.min(Math.max(1, Math.ceil(withdrawals.length / USERS_PAGE_SIZE)), p + 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
          <TabsContent value="history" className="mt-0 overflow-x-auto">
            <WithdrawalHistorySection formatUsd={formatUsd} enabled={enabled} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>

    <Dialog open={withdrawalDialogOpen} onOpenChange={(open) => !open && closeWithdrawalDialog()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {pendingAction === "approve" ? "Confirmar aprobación del retiro" : "Confirmar rechazo del retiro"}
          </DialogTitle>
          <DialogDescription>
            {pendingAction === "approve"
              ? "Confirma que realizaste la transferencia bancaria al asociado. El usuario recibirá una notificación sin que se muestre tu nombre."
              : "Los fondos volverán a la billetera del usuario. Opcionalmente indica el motivo (ej. datos bancarios incorrectos, banco en mantenimiento)."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label htmlFor="admin-note" className="text-sm text-muted-foreground">
            Nota (opcional)
          </Label>
          <Textarea
            id="admin-note"
            placeholder={
              pendingAction === "reject"
                ? "Ej: datos bancarios incorrectos, banco en mantenimiento, cuenta bloqueada…"
                : "Ej: referencia de transferencia, observación interna…"
            }
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            rows={3}
            className="resize-none"
            maxLength={500}
          />
          {adminNote.length >= 500 && (
            <p className="text-xs text-muted-foreground">Máximo 500 caracteres.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={closeWithdrawalDialog} disabled={processWithdrawal.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={confirmWithdrawalAction}
            disabled={processWithdrawal.isPending}
            variant={pendingAction === "reject" ? "destructive" : "default"}
          >
            {processWithdrawal.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Procesando…
              </>
            ) : pendingAction === "approve" ? (
              "Aprobar retiro"
            ) : (
              "Rechazar retiro"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

/** Búsqueda de usuarios por nombre (debounced 1s). Solo parámetro name, sin filtro por rol. */
function useSaldoUserSearch(debouncedName: string, queryEnabled = true) {
  return useQuery({
    queryKey: ["admin", "users", "saldo-search-by-name", debouncedName],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams({ page: "1", limit: "50" });
      if (debouncedName) params.set("name", debouncedName);
      const url = `/api/admin/users?${params.toString()}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Error al buscar usuarios");
      return res.json();
    },
    enabled: queryEnabled && debouncedName.trim().length >= 2,
    staleTime: 30_000,
  });
}

/** Pestañas solo para administrador (no Soporte TI). */
const TI_FORBIDDEN_TABS = ["overview", "recargas", "saldo", "payouts"] as const;

export default function AdminPanel() {
  const { user } = useAuth();
  const fullAdmin = hasFullAdminRole(user);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const tab = p.get("tab");
      if (tab === "recargas") return "recargas";
      if (tab === "saldo") return "saldo";
      if (tab === "payouts") return "payouts";
    }
    return "overview";
  });
  const [userPage, setUserPage] = useState(1);
  const [providersPage, setProvidersPage] = useState(1);
  const [overviewPendingProvidersPage, setOverviewPendingProvidersPage] = useState(1);
  const [overviewRecentBookingsPage, setOverviewRecentBookingsPage] = useState(1);
  const [adminTransfersPage, setAdminTransfersPage] = useState(1);

  // Abrir pestaña Recargas y leer highlight desde la URL o desde evento (clic en notificación)
  const [highlightedTransferId, setHighlightedTransferId] = useState<number | null>(null);

  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const q = new URLSearchParams(search);
    const tab = q.get("tab");
    if (tab === "recargas") setActiveTab("recargas");
    if (tab === "saldo") setActiveTab("saldo");
    if (tab === "payouts") setActiveTab("payouts");
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

  // Soporte TI no puede usar pestañas financieras / asociados: redirigir a Usuarios
  useEffect(() => {
    if (user?.role !== "tiSupport") return;
    if (!(TI_FORBIDDEN_TABS as readonly string[]).includes(activeTab)) return;
    setActiveTab("users");
    if (typeof window !== "undefined" && window.history.replaceState) {
      const u = new URL(window.location.href);
      u.searchParams.set("tab", "users");
      window.history.replaceState(null, "", u.pathname + u.search);
    }
  }, [user?.role, activeTab]);

  // Escuchar evento al hacer clic en notificación de recarga (incluso si ya estamos en /admin)
  useEffect(() => {
    const handler = (e: Event) => {
      if (!hasFullAdminRole(user)) return;
      const detail = (e as CustomEvent<{ transferId?: number | null }>).detail;
      setActiveTab("recargas");
      if (detail?.transferId != null && !Number.isNaN(detail.transferId)) {
        setHighlightedTransferId(detail.transferId);
        setTimeout(() => setHighlightedTransferId(null), 2800);
      }
    };
    window.addEventListener("admin-open-recargas", handler);
    return () => window.removeEventListener("admin-open-recargas", handler);
  }, [user]);

  // Escuchar evento al hacer clic en notificación de solicitud de retiro (abrir pestaña Payouts)
  useEffect(() => {
    const handler = () => {
      if (!hasFullAdminRole(user)) return;
      setActiveTab("payouts");
      if (typeof window !== "undefined" && window.history.replaceState) {
        const params = new URLSearchParams(window.location.search);
        params.set("tab", "payouts");
        window.history.replaceState(null, "", `/admin?${params.toString()}`);
      }
    };
    window.addEventListener("admin-open-payouts", handler);
    return () => window.removeEventListener("admin-open-payouts", handler);
  }, [user]);

  const [userFilters, setUserFilters] = useState({ role: "", name: "", email: "", lastName: "" });
  const [transferStatusFilter, setTransferStatusFilter] = useState<TransferStatusFilter>("");
  useEffect(() => {
    setAdminTransfersPage(1);
  }, [transferStatusFilter]);

  // Gestión de Saldo: selector de usuarios/roles y recarga manual
  const [selectedUsersSaldo, setSelectedUsersSaldo] = useState<UserOption[]>([]);
  const [selectedRolesSaldo, setSelectedRolesSaldo] = useState<string[]>([]);
  const [searchSaldoInput, setSearchSaldoInput] = useState("");
  const [debouncedSearchSaldo, setDebouncedSearchSaldo] = useState("");
  const [saldoComboboxOpen, setSaldoComboboxOpen] = useState(false);
  const saldoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reasonSaldo, setReasonSaldo] = useState("");
  const [amountSaldo, setAmountSaldo] = useState("");

  useEffect(() => {
    if (saldoDebounceRef.current) clearTimeout(saldoDebounceRef.current);
    saldoDebounceRef.current = setTimeout(() => {
      setDebouncedSearchSaldo(searchSaldoInput.trim());
      saldoDebounceRef.current = null;
    }, SALDO_DEBOUNCE_MS);
    return () => {
      if (saldoDebounceRef.current) clearTimeout(saldoDebounceRef.current);
    };
  }, [searchSaldoInput]);

  const { data: saldoSearchData, isLoading: saldoSearchLoading } = useSaldoUserSearch(
    debouncedSearchSaldo,
    fullAdmin && activeTab === "saldo"
  );
  const saldoSearchUsers = (saldoSearchData?.users ?? []) as any[];
  const saldoSearchList: UserOption[] = saldoSearchUsers.map((u: any) => ({
    id: u.id,
    name: String(u.name ?? u.firstName ?? ""),
    email: String(u.email ?? ""),
    role: u.role,
  }));

  const manualRecharge = useAdminManualRecharge();
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
    enabled: hasAdminRole(user),
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
    enabled: hasAdminRole(user),
  });
  const usersList = usersData?.users ?? [];
  const usersTotal = usersData?.total ?? 0;
  const usersTotalPages = Math.max(1, Math.ceil(usersTotal / USERS_PAGE_SIZE));

  const { data: adminTransfersData, isLoading: adminTransfersLoading } = useAdminWalletTransfers({
    enabled: fullAdmin && activeTab === "recargas",
  });
  const allTransfers = adminTransfersData?.transfers ?? [];
  const filteredTransfers =
    transferStatusFilter === ""
      ? allTransfers
      : allTransfers.filter((t: { status?: string }) => t.status === transferStatusFilter);

  const updateTransferStatus = useUpdateTransferStatus();
  const push = usePushNotifications();

  const { data: adminProvidersData, isLoading: adminProvidersLoading } = useQuery({
    queryKey: ["admin-providers-with-services"],
    queryFn: () => fetchWithAuth("/api/admin/providers/with-services"),
    enabled: hasAdminRole(user) && activeTab === "providers",
  });
  const providersWithServices: AdminProviderWithServices[] = adminProvidersData?.providers ?? [];

  type AdminVerifyingStatusItem = {
    userId: string;
    name: string;
    email?: string | null;
    avatar?: string | null;
    user_identification?: string | null;
    identification_verified: "pending" | "verified" | "rejected";
    transacction_date: string | null;
    transacction_verified: "pending" | "verified" | "rejected";
    transacction_code?: string | null;
  };

  const { data: adminVerifyingStatusData, isLoading: adminVerifyingStatusLoading } = useQuery({
    queryKey: ["admin-verifying-status-pending"],
    queryFn: () => fetchWithAuth("/api/admin/verifying-status/pending"),
    enabled: fullAdmin && activeTab === "overview",
  });
  const pendingAssociates: AdminVerifyingStatusItem[] = adminVerifyingStatusData?.items ?? [];

  const updateVerifyingStatusMutation = useMutation({
    mutationFn: async (args: {
      userId: string;
      step: "identification" | "transaction";
      action: "approve" | "reject";
    }) => {
      return patchWithAuth(`/api/admin/verifying-status/${args.userId}/${args.step}`, { action: args.action });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-verifying-status-pending"] });
      toast({
        title: "Actualizado",
        description: "El estado de verificación se actualizó correctamente.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Error",
        description: err.message || "No se pudo actualizar el estado.",
        variant: "destructive",
      });
    },
  });

  const [assocImageDialog, setAssocImageDialog] = useState<{
    open: boolean;
    title: string;
    src: string | null;
  }>({ open: false, title: "", src: null });

  const { data: adminBookingsData, isLoading: adminBookingsLoading } = useQuery({
    queryKey: ["admin-bookings"],
    queryFn: () => fetchWithAuth("/api/admin/bookings"),
    enabled: hasAdminRole(user) && activeTab === "bookings",
  });
  const adminBookings: AdminBookingItem[] = adminBookingsData?.bookings ?? [];
  const [bookingSubTab, setBookingSubTab] = useState<"pending" | "in_progress" | "ready" | "history">("pending");
  const [bookingPageBySubTab, setBookingPageBySubTab] = useState<Record<"pending" | "in_progress" | "ready" | "history", number>>({
    pending: 1,
    in_progress: 1,
    ready: 1,
    history: 1,
  });
  const [bookingEdits, setBookingEdits] = useState<Record<number, { cost?: string; scheduleDate?: string; scheduleTime?: string; status?: string }>>({});
  const [pendingAdminChange, setPendingAdminChange] = useState<null | { bookingId: number; payload: Record<string, unknown>; summary: string }>(null);

  const updateAdminBooking = useMutation({
    mutationFn: async (args: { bookingId: number; payload: Record<string, unknown> }) =>
      patchWithAuth(`/api/admin/bookings/${args.bookingId}`, args.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
    },
  });

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

  // Check if user is admin o Soporte TI
  if (!hasAdminRole(user)) {
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
      {/* Header: compacto en móvil */}
      <div className="bg-white border-b px-4 sm:px-6 py-3 sm:py-4">
        <div className="container mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Shield className="h-6 w-6 sm:h-8 sm:w-8 text-mango-orange shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold truncate">Panel de Administración</h1>
              <p className="text-gray-500 text-sm truncate">GenFeb S.A.S.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <Button variant="outline" size="icon" className="h-9 w-9">
              <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <Avatar className="h-8 w-8 sm:h-10 sm:w-10">
              <AvatarFallback className="text-sm">{user?.name?.[0]}</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </div>

      <div className="container mx-auto py-4 sm:py-6 px-3 sm:px-4 overflow-x-hidden">
        {/* Stats Grid oculto por ahora (se verá en futuras iteraciones) */}

        {/* Tabs: en móvil scroll horizontal para evitar solapamientos */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v);
            if (typeof window !== "undefined" && window.history.replaceState) {
              const url = new URL(window.location.href);
              url.searchParams.set("tab", v);
              window.history.replaceState(null, "", url.pathname + url.search);
            }
          }}
        >
          <div className="relative -mx-3 sm:mx-0 mb-4">
            <div className="overflow-x-auto overflow-y-hidden pb-1 scroll-smooth md:overflow-visible pr-2 md:pr-0">
              <TabsList className="inline-flex w-max min-w-full md:flex md:flex-wrap md:w-auto md:min-w-0 h-auto flex-nowrap gap-1 p-1 rounded-lg border border-transparent md:border-0">
                {fullAdmin && (
                  <TabsTrigger value="overview" className="shrink-0">Gestión de asociados</TabsTrigger>
                )}
                <TabsTrigger value="users" className="shrink-0">Usuarios</TabsTrigger>
                <TabsTrigger value="providers" className="shrink-0">Proveedores</TabsTrigger>
                <TabsTrigger value="bookings" className="shrink-0">Reservas</TabsTrigger>
                {fullAdmin && (
                  <TabsTrigger value="recargas" className="shrink-0">Recargas</TabsTrigger>
                )}
                {fullAdmin && (
                  <TabsTrigger value="saldo" className="gap-1.5 shrink-0">
                    <Wallet className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">Gestión de Saldo</span>
                    <span className="sm:hidden">Saldo</span>
                  </TabsTrigger>
                )}
                {fullAdmin && (
                  <TabsTrigger value="payouts" className="gap-1.5 shrink-0">
                    <Banknote className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">Solicitudes de Retiro</span>
                    <span className="sm:hidden">Retiros</span>
                  </TabsTrigger>
                )}
                <TabsTrigger value="roles" className="shrink-0">Roles</TabsTrigger>
                <TabsTrigger value="settings" className="shrink-0">Configuración</TabsTrigger>
              </TabsList>
            </div>
          </div>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 gap-6">
              {/* Pending Approvals */}
              <Card>
                <CardHeader>
                  <CardTitle>Gestión de asociados</CardTitle>
                  <CardDescription>Verificaciones pendientes de identificación y recarga</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {adminVerifyingStatusLoading ? (
                      <div className="py-10 text-center text-sm text-muted-foreground">Cargando asociados…</div>
                    ) : pendingAssociates.length === 0 ? (
                      <div className="py-10 text-center text-sm text-muted-foreground">No hay asociados con verificación pendiente.</div>
                    ) : (
                      (() => {
                        const pageSize = USERS_PAGE_SIZE;
                        const pendingList = pendingAssociates;
                        const totalPages = Math.max(1, Math.ceil(pendingList.length / pageSize));
                        const safePage = Math.min(totalPages, Math.max(1, overviewPendingProvidersPage));
                        const start = (safePage - 1) * pageSize;
                        const end = start + pageSize;
                        const paged = pendingList.slice(start, end);

                        const stateLabel = (s: "pending" | "verified" | "rejected") =>
                          s === "pending" ? "Pendiente" : s === "verified" ? "Aprobado" : "Rechazado";

                        return (
                          <>
                            {paged.map((assoc) => {
                              const identEnabled = assoc.identification_verified === "pending";
                              const txEnabled = assoc.transacction_verified === "pending";
                              return (
                                <div key={assoc.userId} className="flex flex-col gap-3 p-4 border rounded-lg bg-white">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <Avatar>
                                        <AvatarFallback>{assoc.name?.[0] ?? "A"}</AvatarFallback>
                                      </Avatar>
                                      <div className="min-w-0">
                                        <p className="font-medium truncate">{assoc.name}</p>
                                        {assoc.email ? <p className="text-sm text-gray-500 truncate">{assoc.email}</p> : null}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="rounded-lg border border-border/60 p-3 space-y-3 bg-muted/10">
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <p className="font-medium">Verificación de identificación</p>
                                        <p className="text-xs text-gray-500 mt-1">
                                          Estado: {stateLabel(assoc.identification_verified)}
                                        </p>
                                      </div>
                                      <Badge
                                        variant={
                                          assoc.identification_verified === "pending"
                                            ? "secondary"
                                            : assoc.identification_verified === "verified"
                                              ? "default"
                                              : "destructive"
                                        }
                                      >
                                        {stateLabel(assoc.identification_verified)}
                                      </Badge>
                                    </div>

                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex items-center gap-2">
                                        <Button
                                          variant="outline"
                                          size="icon"
                                          disabled={!assoc.avatar}
                                          onClick={() =>
                                            setAssocImageDialog({
                                              open: true,
                                              title: "Foto de perfil",
                                              src: assoc.avatar ?? null,
                                            })
                                          }
                                        >
                                          <Eye className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="icon"
                                          disabled={!assoc.user_identification}
                                          onClick={() =>
                                            setAssocImageDialog({
                                              open: true,
                                              title: "Imagen de identificación",
                                              src: assoc.user_identification ?? null,
                                            })
                                          }
                                        >
                                          <FileText className="h-4 w-4" />
                                        </Button>
                                      </div>

                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="text-green-600"
                                          disabled={!identEnabled || updateVerifyingStatusMutation.isPending}
                                          onClick={() =>
                                            updateVerifyingStatusMutation.mutate({
                                              userId: assoc.userId,
                                              step: "identification",
                                              action: "approve",
                                            })
                                          }
                                        >
                                          <CheckCircle className="h-4 w-4 mr-1" />
                                          Aprobar
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="text-red-600"
                                          disabled={!identEnabled || updateVerifyingStatusMutation.isPending}
                                          onClick={() =>
                                            updateVerifyingStatusMutation.mutate({
                                              userId: assoc.userId,
                                              step: "identification",
                                              action: "reject",
                                            })
                                          }
                                        >
                                          <XCircle className="h-4 w-4 mr-1" />
                                          Rechazar
                                        </Button>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="rounded-lg border border-border/60 p-3 space-y-3 bg-muted/10">
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <p className="font-medium">Recarga de 15$</p>
                                        <p className="text-xs text-gray-500 mt-1">
                                          Fecha:{" "}
                                          {assoc.transacction_date
                                            ? new Date(assoc.transacction_date).toLocaleDateString("es-EC")
                                            : "—"}{" "}
                                          · Código: {assoc.transacction_code ?? "—"}
                                        </p>
                                      </div>
                                      <Badge
                                        variant={
                                          assoc.transacction_verified === "pending"
                                            ? "secondary"
                                            : assoc.transacction_verified === "verified"
                                              ? "default"
                                              : "destructive"
                                        }
                                      >
                                        {stateLabel(assoc.transacction_verified)}
                                      </Badge>
                                    </div>

                                    <div className="flex justify-end gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-green-600"
                                        disabled={!txEnabled || updateVerifyingStatusMutation.isPending}
                                        onClick={() =>
                                          updateVerifyingStatusMutation.mutate({
                                            userId: assoc.userId,
                                            step: "transaction",
                                            action: "approve",
                                          })
                                        }
                                      >
                                        <CheckCircle className="h-4 w-4 mr-1" />
                                        Aprobar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-red-600"
                                        disabled={!txEnabled || updateVerifyingStatusMutation.isPending}
                                        onClick={() =>
                                          updateVerifyingStatusMutation.mutate({
                                            userId: assoc.userId,
                                            step: "transaction",
                                            action: "reject",
                                          })
                                        }
                                      >
                                        <XCircle className="h-4 w-4 mr-1" />
                                        Rechazar
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {totalPages > 1 && (
                              <div className="flex items-center justify-between pt-2 border-t mt-2">
                                <p className="text-sm text-muted-foreground">
                                  Página {safePage} de {totalPages}
                                </p>
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={safePage <= 1}
                                    onClick={() => setOverviewPendingProvidersPage((p) => Math.max(1, safePage - 1))}
                                  >
                                    <ChevronLeft className="h-4 w-4" />
                                    Anterior
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={safePage >= totalPages}
                                    onClick={() => setOverviewPendingProvidersPage((p) => Math.min(totalPages, safePage + 1))}
                                  >
                                    Siguiente
                                    <ChevronRight className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()
                    )}
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
                            <Badge variant={hasAdminRole({ role: u.role }) ? "default" : "secondary"}>
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
                <CardDescription>Asociados con servicios publicados</CardDescription>
              </CardHeader>
              <CardContent>
                {adminProvidersLoading ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">Cargando proveedores…</div>
                ) : providersWithServices.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">Aún no hay asociados con servicios publicados.</div>
                ) : (
                  <div className="space-y-4">
                    {(() => {
                      const pageSize = USERS_PAGE_SIZE;
                      const providerList: AdminProviderWithServices[] =
                        providersWithServices.length > 0 ? providersWithServices : (mockProviders as any);
                      const totalPages = Math.max(1, Math.ceil(providerList.length / pageSize));
                      const safePage = Math.min(totalPages, Math.max(1, providersPage));
                      const start = (safePage - 1) * pageSize;
                      const end = start + pageSize;
                      const paged = providerList.slice(start, end);

                      return (
                        <>
                          <div className="space-y-4">
                            {paged.map((p) => (
                              <div key={p.providerId} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border rounded-lg bg-white">
                                <div className="flex items-center gap-3 min-w-0">
                                  <Avatar>
                                    <AvatarFallback>{p.name?.[0] ?? "P"}</AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0">
                                    <p className="font-medium truncate">{p.name}</p>
                                    <p className="text-sm text-gray-500 truncate">
                                      {(p.profession || p.category || "Asociado")} · {p.serviceCount} servicio(s)
                                    </p>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 sm:gap-4 justify-between sm:justify-end">
                                  <div className="flex items-center gap-1">
                                    <Star className="h-4 w-4 text-yellow-500" />
                                    <span className="text-sm font-medium">
                                      {Number(p.rating ?? 5).toFixed(1)}
                                    </span>
                                    <span className="text-xs text-gray-500">({p.ratingCount ?? 0})</span>
                                  </div>
                                  <span className="text-sm text-gray-500">{p.bookingsCount} reservas</span>
                                  <Badge variant={p.verified ? "default" : "secondary"}>
                                    {p.verified ? "Verificado" : "No verificado"}
                                  </Badge>
                                  <Button size="sm" variant="outline" asChild>
                                    <Link href={`/admin/users/${p.userId}/edit`}>Ver perfil</Link>
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>

                          {totalPages > 1 && (
                            <div className="flex items-center justify-between pt-2 border-t mt-2">
                              <p className="text-sm text-muted-foreground">
                                Página {safePage} de {totalPages}
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={safePage <= 1}
                                  onClick={() => setProvidersPage((p) => Math.max(1, safePage - 1))}
                                >
                                  <ChevronLeft className="h-4 w-4" />
                                  Anterior
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={safePage >= totalPages}
                                  onClick={() => setProvidersPage((p) => Math.min(totalPages, safePage + 1))}
                                >
                                  Siguiente
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bookings">
            <Card>
              <CardHeader>
                <CardTitle>Gestión de reservas (Admin)</CardTitle>
                <CardDescription>
                  Vista global: solicitudes pendientes, en espera, listas e historial. Puedes corregir datos si hay problemas (se pedirá confirmación).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {adminBookingsLoading ? (
                  <div className="py-12 flex items-center justify-center text-muted-foreground gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">Cargando reservas…</span>
                  </div>
                ) : (
                  <>
                    {(() => {
                      const list = adminBookings ?? [];
                      const pending = list.filter((b) => b.status === "pending");
                      const ready = list.filter(
                        (b) => (b.status === "confirmed" || b.status === "in_progress") && b.confirmedByClient === true,
                      );
                      const inProgress = list.filter(
                        (b) => (b.status === "confirmed" || b.status === "in_progress") && b.confirmedByClient !== true,
                      );
                      const history = list.filter((b) => b.status === "completed" || b.status === "cancelled");

                      const activeList =
                        bookingSubTab === "pending"
                          ? pending
                          : bookingSubTab === "ready"
                            ? ready
                            : bookingSubTab === "in_progress"
                              ? inProgress
                              : history;

                      const statusLabel = (s: string) =>
                        s === "pending"
                          ? "Pendiente"
                          : s === "confirmed"
                            ? "Confirmada"
                            : s === "in_progress"
                              ? "En proceso"
                              : s === "completed"
                                ? "Completada"
                                : s === "cancelled"
                                  ? "Cancelada"
                                  : s;

                      const renderEmpty = (msg: string) => (
                        <div className="rounded-lg border border-dashed border-border bg-muted/30 py-12 text-center">
                          <p className="text-muted-foreground">{msg}</p>
                        </div>
                      );

                      const bookingRow = (b: AdminBookingItem) => {
                        const id = Number(b.id);
                        const date = toDate(b.date);
                        const dateStr = isValidDate(date) ? format(date, "yyyy-MM-dd", { locale: es }) : "";
                        const timeStr = isValidDate(date) ? format(date, "HH:mm", { locale: es }) : "";
                        const clientName = b.user
                          ? [b.user.firstName ?? b.user.name, b.user.lastName].filter(Boolean).join(" ") || "Cliente"
                          : "Cliente";
                        const providerUser = b.service?.provider?.user;
                        const providerName = providerUser
                          ? [providerUser.firstName ?? providerUser.name, providerUser.lastName].filter(Boolean).join(" ") || "Asociado"
                          : "Asociado";
                        const serviceTitle = b.service?.title ?? "Servicio";
                        const savedCost = typeof b.cost === "number" ? b.cost : Number(b.cost) || 0;
                        const refPrice = b.service?.price != null ? Number(b.service.price) : 0;
                        const currentCost = savedCost > 0 ? savedCost : refPrice;
                        const currentCostNum = Number(currentCost || 0);

                        const edits = bookingEdits[id] ?? {};
                        const costValue = edits.cost ?? String(currentCost || "");
                        const costValueNum = Number(costValue);
                        const costForCalc = Number.isFinite(costValueNum) ? costValueNum : currentCostNum;
                        const commission = Math.round(costForCalc * 0.1 * 100) / 100;
                        const providerNet = Math.round((costForCalc - commission) * 100) / 100;
                        const schedDate = edits.scheduleDate ?? dateStr;
                        const schedTime = edits.scheduleTime ?? timeStr;
                        const statusValue = edits.status ?? String(b.status ?? "");

                        const badgeVariant =
                          b.status === "completed"
                            ? "default"
                            : b.status === "cancelled"
                              ? "destructive"
                              : "secondary";

                        const scheduleIso = schedDate && schedTime ? new Date(`${schedDate}T${schedTime}:00`).toISOString() : undefined;

                        return (
                          <div key={id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold truncate">{serviceTitle}</p>
                                <p className="text-sm text-muted-foreground truncate">
                                  Cliente: {clientName} · Asociado: {providerName}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <Badge variant={badgeVariant}>{statusLabel(String(b.status ?? ""))}</Badge>
                                <span className="text-sm font-semibold tabular-nums">
                                  {new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(currentCost || 0)}
                                </span>
                                <p className="text-xs text-muted-foreground">
                                  Comisión (10%):{" "}
                                  {new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(commission)} ·
                                  Neto asociado:{" "}
                                  {new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(providerNet)}
                                </p>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Estado</Label>
                                <Select
                                  value={statusValue}
                                  onValueChange={(v) =>
                                    setBookingEdits((prev) => ({ ...prev, [id]: { ...prev[id], status: v } }))
                                  }
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Estado" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {["pending", "confirmed", "in_progress", "completed", "cancelled"].map((s) => (
                                      <SelectItem key={s} value={s}>
                                        {statusLabel(s)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Costo (USD)</Label>
                                <Input
                                  className="h-9"
                                  value={costValue}
                                  onChange={(e) =>
                                    setBookingEdits((prev) => ({ ...prev, [id]: { ...prev[id], cost: e.target.value } }))
                                  }
                                  inputMode="decimal"
                                />
                              </div>

                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Horario</Label>
                                <div className="flex gap-2">
                                  <Input
                                    className="h-9"
                                    type="date"
                                    value={schedDate}
                                    onChange={(e) =>
                                      setBookingEdits((prev) => ({ ...prev, [id]: { ...prev[id], scheduleDate: e.target.value } }))
                                    }
                                  />
                                  <Input
                                    className="h-9"
                                    type="time"
                                    value={schedTime}
                                    onChange={(e) =>
                                      setBookingEdits((prev) => ({ ...prev, [id]: { ...prev[id], scheduleTime: e.target.value } }))
                                    }
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-end">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const next = String(statusValue || b.status || "");
                                      if (!next) return;
                                      setPendingAdminChange({
                                        bookingId: id,
                                        payload: { status: next },
                                        summary: `Cambiar estado de la reserva #${id} a “${statusLabel(next)}”`,
                                      });
                                    }}
                                  >
                                    <Inbox className="h-4 w-4 mr-2" />
                                    Cambiar estado
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Cambia el estado de la reserva. Se mostrará una confirmación antes de aplicar el cambio.
                                </TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const n = Number(costValue);
                                      if (!Number.isFinite(n)) {
                                        toast({ title: "Costo inválido", description: "Ingresa un número válido.", variant: "destructive" });
                                        return;
                                      }
                                      setPendingAdminChange({
                                        bookingId: id,
                                        payload: { cost: n },
                                        summary: `Actualizar costo de la reserva #${id} a $${n.toFixed(2)} USD`,
                                      });
                                    }}
                                  >
                                    <DollarSign className="h-4 w-4 mr-2" />
                                    Guardar costo
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Actualiza el costo (USD) de la reserva. Requiere confirmación.</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      if (!scheduleIso) return;
                                      setPendingAdminChange({
                                        bookingId: id,
                                        payload: { scheduleIso },
                                        summary: `Actualizar horario de la reserva #${id} a ${schedDate} ${schedTime}`,
                                      });
                                    }}
                                  >
                                    <Clock className="h-4 w-4 mr-2" />
                                    Guardar horario
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Actualiza el horario de la reserva. Requiere confirmación.</TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                        );
                      };

                      return (
                        <div className="space-y-4">
                          <Tabs value={bookingSubTab} onValueChange={(v) => setBookingSubTab(v as any)} className="w-full">
                            <TabsList className="flex w-full flex-nowrap items-stretch gap-1 h-auto p-1 bg-muted/50 overflow-x-auto">
                              <TabsTrigger value="pending" className="gap-2 py-2.5 data-[state=active]:bg-background">
                                <Inbox className="h-4 w-4" />
                                <span className="hidden sm:inline">Solicitudes pendientes</span>
                                <Badge variant="secondary" className="ml-1">{pending.length}</Badge>
                              </TabsTrigger>
                              <TabsTrigger value="in_progress" className="gap-2 py-2.5 data-[state=active]:bg-background">
                                <PlayCircle className="h-4 w-4" />
                                <span className="hidden sm:inline">En espera</span>
                                <Badge variant="secondary" className="ml-1">{inProgress.length}</Badge>
                              </TabsTrigger>
                              <TabsTrigger value="ready" className="gap-2 py-2.5 data-[state=active]:bg-background">
                                <CheckCircle className="h-4 w-4" />
                                <span className="hidden sm:inline">Listas</span>
                                <Badge variant="secondary" className="ml-1">{ready.length}</Badge>
                              </TabsTrigger>
                              <TabsTrigger value="history" className="gap-2 py-2.5 data-[state=active]:bg-background">
                                <History className="h-4 w-4" />
                                <span className="hidden sm:inline">Historial</span>
                                <Badge variant="secondary" className="ml-1">{history.length}</Badge>
                              </TabsTrigger>
                            </TabsList>
                          </Tabs>

                          {(() => {
                            const pageSize = USERS_PAGE_SIZE;
                            const currentPage = bookingPageBySubTab[bookingSubTab] ?? 1;
                            const totalPages = Math.max(1, Math.ceil(activeList.length / pageSize));
                            const safePage = Math.min(totalPages, Math.max(1, currentPage));
                            const start = (safePage - 1) * pageSize;
                            const end = start + pageSize;
                            const pagedList = activeList.slice(start, end);
                            return activeList.length === 0 ? (
                              renderEmpty("No hay reservas en esta sección.")
                            ) : (
                              <>
                                <div className="space-y-4">{pagedList.map(bookingRow)}</div>
                                {totalPages > 1 && (
                                  <div className="flex items-center justify-between pt-4 border-t mt-4">
                                    <p className="text-sm text-muted-foreground">
                                      Página {safePage} de {totalPages}
                                    </p>
                                    <div className="flex gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={safePage <= 1}
                                        onClick={() =>
                                          setBookingPageBySubTab((prev) => ({
                                            ...prev,
                                            [bookingSubTab]: Math.max(1, safePage - 1),
                                          }))
                                        }
                                      >
                                        <ChevronLeft className="h-4 w-4" />
                                        Anterior
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={safePage >= totalPages}
                                        onClick={() =>
                                          setBookingPageBySubTab((prev) => ({
                                            ...prev,
                                            [bookingSubTab]: Math.min(totalPages, safePage + 1),
                                          }))
                                        }
                                      >
                                        Siguiente
                                        <ChevronRight className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      );
                    })()}

                    <Dialog open={pendingAdminChange != null} onOpenChange={(open) => !open && setPendingAdminChange(null)}>
                      <DialogContent className="sm:max-w-md border-border bg-card">
                        <DialogHeader>
                          <DialogTitle>¿Seguro que quieres hacer estos cambios?</DialogTitle>
                          <DialogDescription>
                            {pendingAdminChange?.summary}
                            <br />
                            Esto puede afectar el flujo normal y balances (escrow/wallet) si cambias estados como “Completada” o “Cancelada”.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="gap-2 sm:gap-0">
                          <Button variant="outline" onClick={() => setPendingAdminChange(null)}>
                            Cancelar
                          </Button>
                          <Button
                            onClick={async () => {
                              if (!pendingAdminChange) return;
                              try {
                                await updateAdminBooking.mutateAsync({
                                  bookingId: pendingAdminChange.bookingId,
                                  payload: pendingAdminChange.payload,
                                });
                                toast({ title: "Actualizado", description: "La reserva fue modificada correctamente." });
                              } catch (e) {
                                toast({
                                  title: "Error",
                                  description: e instanceof Error ? e.message : "No se pudo actualizar la reserva",
                                  variant: "destructive",
                                });
                              } finally {
                                setPendingAdminChange(null);
                              }
                            }}
                            disabled={updateAdminBooking.isPending}
                          >
                            {updateAdminBooking.isPending ? "Aplicando…" : "Sí, modificar"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </>
                )}
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
                  <>
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
                        {filteredTransfers.slice((adminTransfersPage - 1) * USERS_PAGE_SIZE, adminTransfersPage * USERS_PAGE_SIZE).map((t: {
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
                  {Math.max(1, Math.ceil(filteredTransfers.length / USERS_PAGE_SIZE)) > 1 && (
                    <div className="flex items-center justify-between pt-4 border-t">
                      <p className="text-sm text-muted-foreground">
                        Página {adminTransfersPage} de {Math.max(1, Math.ceil(filteredTransfers.length / USERS_PAGE_SIZE))}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={adminTransfersPage <= 1}
                          onClick={() => setAdminTransfersPage((p) => Math.max(1, p - 1))}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Anterior
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={
                            adminTransfersPage >= Math.max(1, Math.ceil(filteredTransfers.length / USERS_PAGE_SIZE))
                          }
                          onClick={() =>
                            setAdminTransfersPage((p) =>
                              Math.min(Math.max(1, Math.ceil(filteredTransfers.length / USERS_PAGE_SIZE)), p + 1),
                            )
                          }
                        >
                          Siguiente
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                  </>
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

          <TabsContent value="saldo">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Gestión de Saldo
                </CardTitle>
                <CardDescription>
                  Recargas manuales o bonos: corrige errores de pago o asigna créditos. Busca usuarios por nombre o agrega un rol (se acredita a todos los usuarios con ese rol). Indica monto y razón. La operación queda registrada.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Agregar por usuario</label>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Popover open={saldoComboboxOpen} onOpenChange={setSaldoComboboxOpen} modal={false}>
                      <PopoverAnchor asChild>
                        <div
                          className="relative flex-1 min-w-[200px] max-w-md flex items-center rounded-md border border-input bg-background cursor-text"
                          onClick={() => setSaldoComboboxOpen(true)}
                        >
                          <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                          <Input
                            placeholder="Buscar por nombre (mín. 2 letras)..."
                            value={searchSaldoInput}
                            onChange={(e) => setSearchSaldoInput(e.target.value)}
                            onFocus={() => setSaldoComboboxOpen(true)}
                            className="pl-9 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>
                      </PopoverAnchor>
                      <PopoverContent
                        className="w-[var(--radix-popover-trigger-width)] p-0"
                        align="start"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                      >
                        <Command shouldFilter={false}>
                          <CommandList>
                            <CommandEmpty>
                              {debouncedSearchSaldo.length < 2
                                ? "Escribe al menos 2 letras (búsqueda tras 1 s sin escribir)."
                                : saldoSearchLoading
                                  ? "Buscando…"
                                  : "No se encontraron usuarios"}
                            </CommandEmpty>
                            {!saldoSearchLoading && saldoSearchList.length > 0 && (
                              <CommandGroup>
                                {saldoSearchList.map((u) => {
                                  const alreadyAdded = selectedUsersSaldo.some((x) => x.id === u.id);
                                  return (
                                    <CommandItem
                                      key={u.id}
                                      value={u.id}
                                      onSelect={() => {
                                        if (alreadyAdded) return;
                                        setSelectedUsersSaldo((prev) => [...prev, u]);
                                        setSearchSaldoInput("");
                                        setDebouncedSearchSaldo("");
                                        setSaldoComboboxOpen(false);
                                      }}
                                      disabled={alreadyAdded}
                                    >
                                      <div className="min-w-0 flex-1">
                                        <p className="font-medium truncate">{u.name || u.email || u.id}</p>
                                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                                      </div>
                                      {alreadyAdded && <span className="text-xs text-muted-foreground">Ya agregado</span>}
                                    </CommandItem>
                                  );
                                })}
                              </CommandGroup>
                            )}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Agregar por rol</label>
                  <p className="text-xs text-muted-foreground">El saldo se acreditará a todos los usuarios con ese rol. Selecciona un rol para agregarlo.</p>
                  <Select
                    value=""
                    onValueChange={(v) => {
                      if (!v || selectedRolesSaldo.includes(v)) return;
                      setSelectedRolesSaldo((prev) => [...prev, v]);
                    }}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Seleccionar rol" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client">{ROLE_LABELS.client}</SelectItem>
                      <SelectItem value="professional">{ROLE_LABELS.professional}</SelectItem>
                      <SelectItem value="admin">{ROLE_LABELS.admin}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(selectedUsersSaldo.length > 0 || selectedRolesSaldo.length > 0) && (
                  <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-muted/50 border border-border">
                    {selectedUsersSaldo.map((u) => (
                      <Badge key={`u-${u.id}`} variant="secondary" className="pl-2 pr-1 py-1 gap-1 font-normal">
                        <span className="max-w-[140px] truncate">{u.name || u.email || u.id}</span>
                        <button
                          type="button"
                          className="rounded-full hover:bg-muted p-0.5"
                          onClick={() => setSelectedUsersSaldo((prev) => prev.filter((x) => x.id !== u.id))}
                          aria-label="Quitar"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      </Badge>
                    ))}
                    {selectedRolesSaldo.map((roleCode) => (
                      <Badge key={`r-${roleCode}`} variant="outline" className="pl-2 pr-1 py-1 gap-1 font-normal">
                        <span>{ROLE_LABELS[roleCode] ?? roleCode}</span>
                        <button
                          type="button"
                          className="rounded-full hover:bg-muted p-0.5"
                          onClick={() => setSelectedRolesSaldo((prev) => prev.filter((r) => r !== roleCode))}
                          aria-label="Quitar rol"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2 border-t pt-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Razón de la recarga (obligatorio)</label>
                    <Input
                      placeholder="Ej. Compensación por fallo técnico, Cortesía..."
                      value={reasonSaldo}
                      onChange={(e) => setReasonSaldo(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Monto (USD)</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={amountSaldo}
                      onChange={(e) => setAmountSaldo(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    disabled={
                      (selectedUsersSaldo.length === 0 && selectedRolesSaldo.length === 0) ||
                      !reasonSaldo.trim() ||
                      !amountSaldo ||
                      Number(amountSaldo) <= 0 ||
                      manualRecharge.isPending ||
                      !user?.id
                    }
                    onClick={async () => {
                      const amount = Number(amountSaldo);
                      const reason = reasonSaldo.trim();
                      if (!user?.id || !(amount > 0)) return;

                      const userIdsToCredit = new Set<string>(selectedUsersSaldo.map((u) => u.id));
                      if (selectedRolesSaldo.length > 0) {
                        try {
                          const token = localStorage.getItem("token");
                          for (const roleCode of selectedRolesSaldo) {
                            const res = await fetch(
                              `/api/admin/users?role=${encodeURIComponent(roleCode)}&page=1&limit=500`,
                              { headers: token ? { Authorization: `Bearer ${token}` } : {} }
                            );
                            if (!res.ok) continue;
                            const data = await res.json();
                            const list = (data.users ?? []) as { id: string }[];
                            list.forEach((u: { id: string }) => userIdsToCredit.add(u.id));
                          }
                        } catch {
                          toast({ title: "Error", description: "No se pudieron cargar usuarios por rol.", variant: "destructive" });
                          return;
                        }
                      }

                      const finalList = Array.from(userIdsToCredit);
                      if (finalList.length === 0) return;
                      let ok = 0;
                      let err = 0;
                      for (const userId of finalList) {
                        try {
                          await manualRecharge.mutateAsync({
                            userId,
                            amount,
                            reason,
                            fromUserId: user.id,
                          });
                          ok++;
                        } catch {
                          err++;
                        }
                      }
                      if (ok) {
                        toast({
                          title: "Recargas procesadas",
                          description: err ? `Se acreditaron ${ok} usuario(s). ${err} fallaron.` : `Se acreditó el saldo a ${ok} usuario(s). La operación quedó registrada.`,
                        });
                        setReasonSaldo("");
                        setAmountSaldo("");
                        setSelectedUsersSaldo([]);
                        setSelectedRolesSaldo([]);
                      }
                      if (err && ok === 0) {
                        toast({ title: "Error", description: "No se pudo procesar ninguna recarga.", variant: "destructive" });
                      }
                    }}
                  >
                    {manualRecharge.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Procesando…
                      </>
                    ) : (
                      "Procesar recarga(s)"
                    )}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {selectedUsersSaldo.length} usuario(s) + {selectedRolesSaldo.length} rol(es) seleccionados
                  </span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payouts">
            <AdminWithdrawalsTab toast={toast} enabled={fullAdmin} />
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
            <div className="grid grid-cols-1 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Configuración General</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Comisiones</p>
                      <p className="text-sm text-gray-500">10% por transacción (90% para el asociado)</p>
                    </div>
                    <Button variant="outline">Configurar</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <Dialog
          open={assocImageDialog.open}
          onOpenChange={(o) => setAssocImageDialog((s) => ({ ...s, open: o }))}
        >
          <DialogContent className="sm:max-w-2xl border-border bg-card">
            <DialogHeader>
              <DialogTitle>{assocImageDialog.title}</DialogTitle>
            </DialogHeader>
            {assocImageDialog.src ? (
              <div className="w-full">
                <img
                  src={assocImageDialog.src}
                  alt={assocImageDialog.title}
                  className="w-full max-h-[70vh] object-contain rounded-md border border-border bg-background"
                />
              </div>
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">No hay imagen disponible.</div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssocImageDialog((s) => ({ ...s, open: false }))}>
                Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

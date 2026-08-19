import { useState, useEffect, useRef, useMemo, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { 
  Users, DollarSign, FileText, Star, Settings, Eye,
  BarChart3, Shield, Bell, Database, Layers,
  CheckCircle, XCircle, Clock, TrendingUp, UserPlus,
  Search, ChevronLeft, ChevronRight, Loader2, Wallet, Banknote, History, Inbox, PlayCircle, CreditCard,
  Check, ChevronsUpDown, Ticket
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
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useAuth } from "@/hooks/use-auth";
import { hasAdminRole } from "@/lib/auth-utils";
import { canAccessAdminPanel, userCan } from "@/lib/user-permissions";
import { filterVisibleCatalogRoles } from "@/lib/role-catalog-utils";
import {
  useAdminWalletTransfers,
  useUpdateTransferStatus,
  useAdminManualRecharge,
  useAdminWithdrawals,
  useProcessWithdrawal,
  useAdminWithdrawalHistory,
  type WithdrawalHistoryStatus,
  type WithdrawalHistoryItem,
  useAdminCategories,
  ADMIN_CATEGORIES_QUERY_KEY,
  useSubcategories,
  useUpdateCategory,
  useCreateSubcategory,
  useUpdateSubcategory,
  type Subcategory,
  usePlatformMobilityFares,
  usePatchPlatformMobilityFares,
  usePlatformPackFares,
  usePatchPlatformPackFares,
  usePlatformSubscriptionFees,
  usePatchPlatformSubscriptionFees,
} from "@/hooks/use-mango-data";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toDate, isValidDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { AdminStatisticsPanel } from "@/components/admin/AdminStatisticsPanel";
import { AdminVerificationDocumentDialog } from "@/components/admin/AdminVerificationDocumentDialog";
import { fetchAdminProviderDetail } from "@/components/admin/admin-provider-detail-lib";
import { AdminPromotionalCodesPanel } from "@/components/admin/AdminPromotionalCodesPanel";
import { AdminStoreSubscriptionPaymentsPanel } from "@/components/admin/AdminStoreSubscriptionPaymentsPanel";
import { AdminRolesPanel } from "@/components/admin/AdminRolesPanel";
import { AdminRegisterUserForm } from "@/components/admin/AdminRegisterUserForm";
import { AdminCargoGoRidesPanel } from "@/components/admin/AdminCargoGoRidesPanel";
import { AdminGoCancellationsPanel } from "@/components/admin/AdminGoCancellationsPanel";
import { AdminEditUserDialog } from "@/components/admin/AdminEditUserDialog";
import { fetchAdminJson } from "@/lib/admin-api";
import {
  adminProviderEditHref,
  isAssociateUserRole,
  type AdminUserDetail,
} from "@/lib/admin-user-edit";
import { formatSubscriptionPaymentAuditSummary } from "@shared/admin-audit-payment-meta";
import { AnimatePresence, motion } from "framer-motion";
import { DEFAULT_CATEGORIES, getCategoryDisplayName, CATEGORY_DISPLAY_NAMES } from "@shared/default-categories";
import { ADMIN_PROVIDER_LIST_BRAND_FILTERS } from "@shared/admin-active-providers-directory";
import {
  SUBSCRIPTION_FEE_ADMIN_SLUGS,
  isSubscriptionFeeVisibleInAdminSettings,
  subscriptionFeeAdminHint,
  subscriptionFeeAdminLabel,
} from "@shared/subscription-category-fees";
import { DEFAULT_SUBCATEGORIES } from "@shared/default-subcategories";
import { firstAvailableSubcategoryIcon } from "@shared/subcategory-lucide-picklist";
import { SubcategoryIconPicker } from "@/components/admin/SubcategoryIconPicker";
import { CategoryIcon } from "@/components/CategoryIcon";
import { CategoryVisual } from "@/components/CategoryVisual";
import { CategoryImageUrlInput } from "@/components/admin/CategoryImageUrlInput";
import { verifyCategoryIconImageUrl } from "@/lib/category-icon-image-verify";
import { AccessGateLoading } from "@/components/AccessGateLoading";
import {
  sanitizeDecimalUsdInput,
  parseDecimalUsdInputToNumber,
  usdAmountInputDisplay,
  isTrailingDecimalUsdIncomplete,
  coerceUsdDraftValueToNumber,
} from "@/lib/decimal-usd-input";

const USERS_PAGE_SIZE = 10;
const BOOKINGS_PAGE_SIZE = 10;

/** Coinciden con `DEFAULT_*` del servidor (merge al guardar si falta un campo en el borrador). */
const MOBILITY_PATCH_DEFAULTS = {
  moto: { baseUsd: 1.75, perKmUsd: 0.5 },
  auto: { baseDayUsd: 1.5, baseNightUsd: 1.75, perKmUsd: 0.85, petExtraUsd: 1.0 },
  camioneta: { baseUsd: 20.0, perKmUsd: 1.25, petExtraUsd: 2.0 },
} as const;

const PACK_PATCH_DEFAULTS = {
  moto: { baseUsd: 1.75, perKmUsd: 0.5 },
  auto: { baseUsd: 2.25, perKmUsd: 0.85 },
  camioneta: { baseUsd: 20.0, perKmUsd: 1.25 },
} as const;

function numFieldForPatch(v: unknown, fb: unknown, def: number): number {
  const x = coerceUsdDraftValueToNumber(v);
  if (x !== undefined) return x;
  const y = coerceUsdDraftValueToNumber(fb);
  if (y !== undefined) return y;
  return def;
}

function mergeMobilityDraftForPatch(draft: unknown, serverFares: unknown) {
  const d = (draft ?? {}) as any;
  const f = (serverFares ?? {}) as any;
  const fb = MOBILITY_PATCH_DEFAULTS;
  return {
    moto: {
      baseUsd: numFieldForPatch(d.moto?.baseUsd, f.moto?.baseUsd, fb.moto.baseUsd),
      perKmUsd: numFieldForPatch(d.moto?.perKmUsd, f.moto?.perKmUsd, fb.moto.perKmUsd),
    },
    auto: {
      baseDayUsd: numFieldForPatch(d.auto?.baseDayUsd, f.auto?.baseDayUsd, fb.auto.baseDayUsd),
      baseNightUsd: numFieldForPatch(d.auto?.baseNightUsd, f.auto?.baseNightUsd, fb.auto.baseNightUsd),
      perKmUsd: numFieldForPatch(d.auto?.perKmUsd, f.auto?.perKmUsd, fb.auto.perKmUsd),
      petExtraUsd: numFieldForPatch(d.auto?.petExtraUsd, f.auto?.petExtraUsd, fb.auto.petExtraUsd),
    },
    camioneta: {
      baseUsd: numFieldForPatch(d.camioneta?.baseUsd, f.camioneta?.baseUsd, fb.camioneta.baseUsd),
      perKmUsd: numFieldForPatch(d.camioneta?.perKmUsd, f.camioneta?.perKmUsd, fb.camioneta.perKmUsd),
      petExtraUsd: numFieldForPatch(d.camioneta?.petExtraUsd, f.camioneta?.petExtraUsd, fb.camioneta.petExtraUsd),
    },
  };
}

function mergePackDraftForPatch(draft: unknown, serverFares: unknown) {
  const d = (draft ?? {}) as any;
  const f = (serverFares ?? {}) as any;
  const fb = PACK_PATCH_DEFAULTS;
  return {
    moto: {
      baseUsd: numFieldForPatch(d.moto?.baseUsd, f.moto?.baseUsd, fb.moto.baseUsd),
      perKmUsd: numFieldForPatch(d.moto?.perKmUsd, f.moto?.perKmUsd, fb.moto.perKmUsd),
    },
    auto: {
      baseUsd: numFieldForPatch(d.auto?.baseUsd, f.auto?.baseUsd, fb.auto.baseUsd),
      perKmUsd: numFieldForPatch(d.auto?.perKmUsd, f.auto?.perKmUsd, fb.auto.perKmUsd),
    },
    camioneta: {
      baseUsd: numFieldForPatch(d.camioneta?.baseUsd, f.camioneta?.baseUsd, fb.camioneta.baseUsd),
      perKmUsd: numFieldForPatch(d.camioneta?.perKmUsd, f.camioneta?.perKmUsd, fb.camioneta.perKmUsd),
    },
  };
}

function patchMobilityFareField(
  setDraft: Dispatch<SetStateAction<any>>,
  section: "auto" | "moto" | "camioneta",
  field: string,
  raw: string
) {
  const sanitized = sanitizeDecimalUsdInput(raw);
  setDraft((s: any) => {
    const root = { ...(s ?? {}) };
    const nest = { ...(root[section] ?? {}) };
    if (sanitized === "") {
      delete nest[field];
    } else {
      const n = parseDecimalUsdInputToNumber(sanitized);
      if (n !== undefined) {
        nest[field] = n;
      } else if (isTrailingDecimalUsdIncomplete(sanitized)) {
        nest[field] = sanitized;
      }
    }
    root[section] = nest;
    return root;
  });
}

function patchPackFareField(
  setDraft: Dispatch<SetStateAction<any>>,
  section: "auto" | "moto" | "camioneta",
  field: string,
  raw: string
) {
  patchMobilityFareField(setDraft, section, field, raw);
}

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

async function postWithAuth(url: string, body?: unknown) {
  const token = localStorage.getItem("token");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = await res.text();
    try {
      const parsed = JSON.parse(message) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      /* texto plano */
    }
    throw new Error(message || "Error en la solicitud");
  }
  return res.json();
}

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

type AdminActiveProviderRow = {
  providerId: number;
  userId: string;
  userName: string;
  userEmail: string | null;
  providerVerified: boolean;
  providerProfession: string | null;
  hasVehicle: boolean;
  goBrandLabels: string[];
  services: Array<{
    id: number;
    title: string;
    categoryId?: number | null;
    categorySlug?: string | null;
    categoryDisplayName?: string | null;
  }>;
};

type AdminServiceBrand = {
  categoryId: number;
  slug: string;
  name: string;
  displayName: string;
  uiHidden: boolean;
  totalServices: number;
  activeServices: number;
  inactiveServices: number;
};

type AdminBrandProviderRow = {
  providerId: number;
  userId: string;
  name: string;
  email?: string | null;
  rating: number;
  ratingCount: number;
  verified: boolean;
  totalServices: number;
  activeServices: number;
  inactiveServices: number;
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
  employee: "Empleado",
  professional: "Asociado",
  central: "Central",
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
              : "Los fondos fueron devueltos al Saldo Applia del usuario.",
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
              : "Los fondos volverán al Saldo Applia del usuario. Opcionalmente indica el motivo (ej. datos bancarios incorrectos, banco en mantenimiento)."}
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



function isRenderableAdminCategory(cat: unknown): cat is { id: number; name: string; slug: string } {
  if (!cat || typeof cat !== "object") return false;
  const o = cat as { id?: unknown; name?: unknown; slug?: unknown };
  const id = typeof o.id === "number" ? o.id : Number(o.id);
  if (!Number.isFinite(id) || id < 1) return false;
  if (!String(o.name ?? "").trim()) return false;
  if (!String(o.slug ?? "").trim()) return false;
  return true;
}

function AdminCategoriesTab() {
  const { data: categoriesRaw = [], isLoading: isLoadingCategories } = useAdminCategories();
  const categories = categoriesRaw.filter(isRenderableAdminCategory);
  const queryClient = useQueryClient();
  const updateCategory = useUpdateCategory();
  const createSubcategory = useCreateSubcategory();
  const updateSubcategory = useUpdateSubcategory();
  const { toast } = useToast();

  const [selectedCategory, setSelectedCategory] = useState<any | null>(null);
  const [editCategoryOpen, setEditCategoryOpen] = useState(false);
  const [categoryNameDraft, setCategoryNameDraft] = useState("");
  const [categoryImageUrlDraft, setCategoryImageUrlDraft] = useState("");
  
  // Subcategories
  const { data: subcategories = [], isLoading: isLoadingSubcategories } = useSubcategories(selectedCategory?.id);
  
  const [newSubcatName, setNewSubcatName] = useState("");
  const [newSubcatSlug, setNewSubcatSlug] = useState("");
  const [newSubcatIcon, setNewSubcatIcon] = useState("");
  const [newSubcatImageUrl, setNewSubcatImageUrl] = useState("");
  const [editingSubcatId, setEditingSubcatId] = useState<number | null>(null);
  const [editingSubcatName, setEditingSubcatName] = useState("");
  const [editingSubcatIcon, setEditingSubcatIcon] = useState("");
  const [editingSubcatImageUrl, setEditingSubcatImageUrl] = useState("");
  const newSubcatDefaultsInitialized = useRef(false);

  const iconsTakenByOtherSubs = useMemo(() => {
    const set = new Set<string>();
    for (const s of subcategories) {
      if (editingSubcatId != null && s.id === editingSubcatId) continue;
      const ic = (s.icon ?? "").trim();
      if (ic) set.add(ic);
    }
    return set;
  }, [subcategories, editingSubcatId]);

  const takenForNewSubcategory = useMemo(() => {
    const set = new Set<string>();
    for (const s of subcategories) {
      const ic = (s.icon ?? "").trim();
      if (ic) set.add(ic);
    }
    return set;
  }, [subcategories]);

  useEffect(() => {
    if (!editCategoryOpen) {
      newSubcatDefaultsInitialized.current = false;
      return;
    }
    if (!selectedCategory || isLoadingSubcategories) return;
    if (newSubcatDefaultsInitialized.current) return;
    setNewSubcatIcon(firstAvailableSubcategoryIcon(takenForNewSubcategory));
    newSubcatDefaultsInitialized.current = true;
  }, [editCategoryOpen, selectedCategory?.id, isLoadingSubcategories, takenForNewSubcategory]);

  const handleEditCategory = (category: any) => {
    setSelectedCategory(category);
    setCategoryNameDraft(category.name || "");
    setCategoryImageUrlDraft(String(category.imageUrl ?? "").trim());
    setNewSubcatName("");
    setNewSubcatSlug("");
    setNewSubcatImageUrl("");
    setEditingSubcatId(null);
    setEditingSubcatName("");
    setEditingSubcatIcon("");
    setEditingSubcatImageUrl("");
    setEditCategoryOpen(true);
  };

  const normalizeCategoryImageUrl = (raw: string) => {
    const t = raw.trim();
    return t || null;
  };

  const rejectInvalidCategoryImage = async (raw: string): Promise<string | null | false> => {
    const t = raw.trim();
    if (!t) return null;
    const check = await verifyCategoryIconImageUrl(t);
    if (!check.ok) {
      toast({
        variant: "destructive",
        title: "Imagen no válida",
        description: check.message,
      });
      return false;
    }
    return t;
  };

  const handleSaveCategory = async () => {
    if (!selectedCategory || !categoryNameDraft.trim()) return;
    const validated = await rejectInvalidCategoryImage(categoryImageUrlDraft);
    if (validated === false) return;
    const imageUrl = validated;
    updateCategory.mutate({
      id: selectedCategory.id,
      name: categoryNameDraft.trim(),
      imageUrl,
    }, {
      onSuccess: () => {
        setEditCategoryOpen(false);
      }
    });
  };

  const handleCreateSubcategory = async () => {
    if (!selectedCategory || !newSubcatName.trim() || !newSubcatSlug.trim()) return;
    const icon = newSubcatIcon.trim();
    if (icon && takenForNewSubcategory.has(icon)) {
      toast({
        title: "Icono ya en uso",
        description: "Ese icono lo tiene otra subcategoría de esta categoría. Elige otro en la cuadrícula.",
        variant: "destructive",
      });
      return;
    }
    const validated = await rejectInvalidCategoryImage(newSubcatImageUrl);
    if (validated === false) return;
    const imageUrl = validated;
    createSubcategory.mutate(
      {
        name: newSubcatName.trim(),
        slug: newSubcatSlug.trim(),
        categoryId: selectedCategory.id,
        categorySlug: selectedCategory.slug,
        ...(icon ? { icon } : {}),
        ...(imageUrl ? { imageUrl } : {}),
      },
      {
        onSuccess: async (_, variables) => {
          setNewSubcatName("");
          setNewSubcatSlug("");
          setNewSubcatImageUrl("");
          await queryClient.refetchQueries({ queryKey: ["/api/subcategories", variables.categoryId] });
          const fresh =
            queryClient.getQueryData<Subcategory[]>(["/api/subcategories", variables.categoryId]) ?? [];
          const used = new Set(fresh.map((s) => (s.icon ?? "").trim()).filter(Boolean));
          setNewSubcatIcon(firstAvailableSubcategoryIcon(used));
        },
      }
    );
  };

  const handleSaveSubcategory = async (id: number) => {
    if (!selectedCategory || !editingSubcatName.trim()) return;
    const icon = editingSubcatIcon.trim();
    if (
      icon &&
      subcategories.some((s) => s.id !== id && (s.icon ?? "").trim() === icon)
    ) {
      toast({
        title: "Icono ya en uso",
        description: "Ese icono lo tiene otra subcategoría de esta categoría. Elige otro en la cuadrícula.",
        variant: "destructive",
      });
      return;
    }
    const validated = await rejectInvalidCategoryImage(editingSubcatImageUrl);
    if (validated === false) return;
    const imageUrl = validated;
    updateSubcategory.mutate(
      {
        id,
        categoryId: selectedCategory.id,
        name: editingSubcatName.trim(),
        ...(icon ? { icon } : {}),
        imageUrl,
      },
      {
        onSuccess: () => {
          setEditingSubcatId(null);
          setEditingSubcatIcon("");
          setEditingSubcatImageUrl("");
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Categorías y Subcategorías</CardTitle>
          <CardDescription>
            Administra las categorías de servicios y crea nuevas subcategorías.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingCategories ? (
            <div className="py-12 flex items-center justify-center text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Cargando categorías…</span>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left p-3 font-medium">ID</th>
                    <th className="text-left p-3 font-medium">Nombre</th>
                    <th className="text-left p-3 font-medium">Slug</th>
                    <th className="text-left p-3 font-medium">Marca</th>
                    <th className="text-right p-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Build slug → parent brand label from DEFAULT_SUBCATEGORIES
                    const subSlugToBrand: Record<string, string> = {};
                    for (const sub of DEFAULT_SUBCATEGORIES) {
                      const parentBrand = (CATEGORY_DISPLAY_NAMES as Record<string, string>)[sub.categorySlug];
                      if (parentBrand) subSlugToBrand[sub.slug] = parentBrand;
                    }
                    const brandColors: Record<string, string> = {
                      "Man Go": "bg-orange-500/15 text-orange-400 border-orange-500/30",
                      "Pro Go": "bg-purple-500/15 text-purple-400 border-purple-500/30",
                      "Delivery": "bg-green-500/15 text-green-400 border-green-500/30",
                      "Shop Go": "bg-pink-500/15 text-pink-400 border-pink-500/30",
                      "Servicio de Taxi": "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
                    };
                    return categories.map((cat: any) => {
                      // Direct brand: category slug maps directly (technical→Fix Go, etc.)
                      const directBrand: string | null = cat.slug && cat.slug in CATEGORY_DISPLAY_NAMES
                        ? (CATEGORY_DISPLAY_NAMES as Record<string, string>)[cat.slug]
                        : null;
                      // Sub brand: slug belongs to a subcategory of a known parent
                      const subBrand: string | null = !directBrand && cat.slug ? (subSlugToBrand[cat.slug] ?? null) : null;
                      const brandLabel = directBrand ?? subBrand;
                      const isSub = !directBrand && !!subBrand;
                      const badgeClass = brandLabel ? (brandColors[brandLabel] ?? "bg-muted text-muted-foreground") : "";
                      return (
                        <tr key={cat.id} className="border-b border-border hover:bg-muted/30">
                          <td className="p-3 font-medium">{cat.id}</td>
                          <td className="p-3">{cat.name}</td>
                          <td className="p-3 text-muted-foreground">{cat.slug}</td>
                          <td className="p-3">
                            {brandLabel ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${badgeClass}`}>
                                {brandLabel}
                                {isSub && (
                                  <span className="opacity-60 font-normal">(sub)</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <Button variant="outline" size="sm" onClick={() => handleEditCategory(cat)}>
                              Editar / Subcategorías
                            </Button>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editCategoryOpen} onOpenChange={setEditCategoryOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Categoría</DialogTitle>
            <DialogDescription>
              Modifica la categoría o administra sus subcategorías.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <Label>Nombre de la Categoría</Label>
              <div className="flex gap-2">
                <Input 
                  value={categoryNameDraft}
                  onChange={(e) => setCategoryNameDraft(e.target.value)}
                />
                <Button 
                  onClick={handleSaveCategory}
                  disabled={
                    updateCategory.isPending ||
                    (categoryNameDraft.trim() === selectedCategory?.name &&
                      normalizeCategoryImageUrl(categoryImageUrlDraft) ===
                        normalizeCategoryImageUrl(String(selectedCategory?.imageUrl ?? "")))
                  }
                >
                  {updateCategory.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Guardar
                </Button>
              </div>
            </div>

            <CategoryImageUrlInput
              label="Imagen de la categoría (URL)"
              hint="Opcional. Imagen PNG (.png). Si no cargas una, se muestra el icono por defecto."
              value={categoryImageUrlDraft}
              onChange={setCategoryImageUrlDraft}
              iconName={(selectedCategory as { icon?: string })?.icon ?? "HelpCircle"}
            />

            <div className="border-t pt-4 space-y-4">
              <h3 className="font-semibold text-lg">Subcategorías</h3>
              
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input 
                  placeholder="Nombre de subcategoría" 
                  value={newSubcatName}
                  onChange={(e) => setNewSubcatName(e.target.value)}
                />
                <Input 
                  placeholder="Slug (ej: limpieza_hogar)" 
                  value={newSubcatSlug}
                  onChange={(e) => setNewSubcatSlug(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                />
                <Button 
                  className="sm:col-span-3 lg:col-span-1 lg:justify-self-end"
                  onClick={handleCreateSubcategory}
                  disabled={
                    createSubcategory.isPending ||
                    !newSubcatName.trim() ||
                    !newSubcatSlug.trim() ||
                    !newSubcatIcon.trim()
                  }
                >
                  {createSubcategory.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Crear Subcategoría
                </Button>
              </div>
              <SubcategoryIconPicker
                value={newSubcatIcon}
                onChange={setNewSubcatIcon}
                takenIconNames={takenForNewSubcategory}
                disabled={createSubcategory.isPending}
              />
              <CategoryImageUrlInput
                value={newSubcatImageUrl}
                onChange={setNewSubcatImageUrl}
                iconName={newSubcatIcon || "HelpCircle"}
                disabled={createSubcategory.isPending}
              />

              {isLoadingSubcategories ? (
                <div className="py-4 text-center text-sm text-muted-foreground">Cargando subcategorías…</div>
              ) : subcategories.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">No hay subcategorías en esta categoría.</div>
              ) : (
                <div className="space-y-3">
                  {editingSubcatId != null ? (
                    <div className="rounded-lg border border-primary/30 bg-muted/20 p-4 space-y-3">
                      <p className="text-sm font-semibold text-foreground">Editar subcategoría</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Nombre</Label>
                          <Input
                            value={editingSubcatName}
                            onChange={(e) => setEditingSubcatName(e.target.value)}
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Slug (solo lectura)</Label>
                          <Input
                            value={subcategories.find((s) => s.id === editingSubcatId)?.slug ?? ""}
                            readOnly
                            className="h-9 bg-muted/50"
                          />
                        </div>
                      </div>
                      <SubcategoryIconPicker
                        value={editingSubcatIcon}
                        onChange={setEditingSubcatIcon}
                        takenIconNames={iconsTakenByOtherSubs}
                        disabled={updateSubcategory.isPending}
                      />
                      <CategoryImageUrlInput
                        value={editingSubcatImageUrl}
                        onChange={setEditingSubcatImageUrl}
                        iconName={editingSubcatIcon || "HelpCircle"}
                        disabled={updateSubcategory.isPending}
                      />
                      <div className="flex flex-wrap gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          onClick={() => {
                            setEditingSubcatId(null);
                            setEditingSubcatIcon("");
                            setEditingSubcatImageUrl("");
                          }}
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          onClick={() => editingSubcatId != null && handleSaveSubcategory(editingSubcatId)}
                          disabled={updateSubcategory.isPending || !editingSubcatName.trim()}
                        >
                          {updateSubcategory.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Guardar cambios
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <div className="rounded-md border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-2 w-14">Icono</th>
                          <th className="text-left p-2">Nombre</th>
                          <th className="text-left p-2">Slug</th>
                          <th className="text-right p-2">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subcategories.map((sub: Subcategory) => (
                          <tr
                            key={sub.id}
                            className={`border-b ${editingSubcatId === sub.id ? "bg-primary/5" : ""}`}
                          >
                            <td className="p-2 align-middle">
                              <span className="inline-flex rounded-md border border-border bg-background p-1.5">
                                <CategoryVisual
                                  iconName={sub.icon ?? "HelpCircle"}
                                  imageUrl={sub.imageUrl}
                                  className="h-4 w-4 text-foreground"
                                  imgClassName="h-5 w-5"
                                />
                              </span>
                            </td>
                            <td className="p-2 align-middle font-medium">{sub.name}</td>
                            <td className="p-2 text-muted-foreground align-middle">{sub.slug}</td>
                            <td className="p-2 text-right align-middle">
                              <Button
                                size="sm"
                                variant="ghost"
                                type="button"
                                onClick={() => {
                                  setEditingSubcatId(sub.id);
                                  setEditingSubcatName(sub.name);
                                  const used = new Set(
                                    subcategories
                                      .filter((x) => x.id !== sub.id)
                                      .map((x) => (x.icon ?? "").trim())
                                      .filter(Boolean)
                                  );
                                  const cur = (sub.icon ?? "").trim();
                                  setEditingSubcatIcon(cur || firstAvailableSubcategoryIcon(used));
                                  setEditingSubcatImageUrl(String(sub.imageUrl ?? "").trim());
                                }}
                              >
                                Editar
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Interpreta `createdAt` del API (ISO) o legado Firestore en caché del cliente. */
function parseAdminAuditCreatedAt(raw: unknown): Date | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === "object" && raw !== null && "toDate" in raw && typeof (raw as { toDate?: () => Date }).toDate === "function") {
    const d = (raw as { toDate: () => Date }).toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  const o = raw as { seconds?: number; _seconds?: number; nanoseconds?: number };
  const sec = o?.seconds ?? o?._seconds;
  if (typeof sec === "number" && !Number.isNaN(sec)) {
    const d = new Date(sec * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Título en español para una fila del historial de auditoría admin (resumen / pestaña overview). */
function adminAuditEventTitle(it: { action: string; meta?: unknown }): string {
  const metaObj = it.meta && typeof it.meta === "object" ? (it.meta as Record<string, unknown>) : null;
  const field = String(metaObj?.field ?? "").trim();

  if (it.action === "account_change_request_approved" || it.action === "account_change_request_rejected") {
    const verb = it.action === "account_change_request_approved" ? "aprobado" : "rechazado";
    if (field === "vehicle") {
      return `Cambio de datos de vehículo: ${verb}`;
    }
    const cuentaCampo =
      field === "email"
        ? "correo"
        : field === "name"
          ? "nombre"
          : field === "phone"
            ? "teléfono"
            : "";
    if (cuentaCampo) {
      return `Cambio de datos de cuenta (${cuentaCampo}): ${verb}`;
    }
    return `Cambio de datos de cuenta: ${verb}`;
  }

  if (it.action === "subscription_payment_approved") return "Mensualidad / comprobante de pago aprobado";
  if (it.action === "subscription_payment_rejected") return "Mensualidad / comprobante de pago rechazado";
  if (it.action === "associate_onboarding_approved") return "Documento de identificación aprobado";
  if (it.action === "associate_onboarding_rejected") return "Documento de identificación rechazado";
  return it.action;
}

function adminAuditEventDetailLines(it: { action: string; meta?: unknown }): string[] {
  const meta = it.meta && typeof it.meta === "object" ? (it.meta as Record<string, unknown>) : null;

  if (it.action === "associate_onboarding_approved" || it.action === "associate_onboarding_rejected") {
    const dk = String(meta?.documentKind ?? "").trim();
    if (dk === "identification" || dk === "") {
      const lines = ["Tipo: aprobación o rechazo de documento (identificación oficial del asociado)."];
      if (it.action === "associate_onboarding_rejected") {
        const reason = String(meta?.reason ?? "").trim();
        if (reason) lines.push(`Motivo: ${reason}`);
      }
      return lines;
    }
    return [];
  }

  if (
    it.action === "subscription_payment_approved" ||
    it.action === "subscription_payment_rejected"
  ) {
    return formatSubscriptionPaymentAuditSummary(meta);
  }
  return [];
}

/** Resumen legible para admins de una propuesta `field: vehicle`. */
function formatVehicleChangeProposalSummary(
  proposal: unknown,
  categoriesForLabels: Array<{ id: number; name?: string | null; slug?: string | null }>,
): string {
  if (!proposal || typeof proposal !== "object") return "";
  const p = proposal as {
    categoryId?: number;
    goBrands?: string[];
    vehicle?: {
      brand?: string | null;
      model?: string | null;
      license_plate?: string | null;
      vehicle_type?: string | null;
    };
  };
  const catRow =
    typeof p.categoryId === "number" ? categoriesForLabels.find((c) => c.id === p.categoryId) : undefined;
  const catLabel = String(catRow?.name ?? catRow?.slug ?? (p.categoryId != null ? `categoría #${p.categoryId}` : "")).trim();
  const v = p.vehicle ?? {};
  const unit = [v.brand, v.model]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  const plate = String(v.license_plate ?? "").trim();
  const vt = String(v.vehicle_type ?? "").trim();
  const head = [catLabel || null, vt || null, unit || null, plate || null].filter(Boolean).join(" · ");
  const brands =
    Array.isArray(p.goBrands) && p.goBrands.length > 0 ? `Roles Go: ${p.goBrands.join(", ")}` : "";
  return [head, brands].filter(Boolean).join("\n");
}

/** Pestañas solo para administrador (no Soporte TI). */
const TI_FORBIDDEN_TABS = ["overview", "estadisticas", "recargas", "saldo", "payouts", "services", "promotional-codes", "roles"] as const;

export default function AdminPanel() {
  const { user, isLoading: authLoading } = useAuth();
  const canPanel = canAccessAdminPanel(user);
  const canStats = userCan(user, "admin.stats");
  const canOverview = userCan(user, "admin.overview");
  const canUsers = userCan(user, "admin.users.view");
  const canUsersCreate = userCan(user, "admin.users.create");
  const canUsersEdit = userCan(user, "admin.users.edit");
  const canProviders = userCan(user, "admin.providers.view");
  const canBookings = userCan(user, "admin.bookings.view");
  const canPromo = userCan(user, "admin.promo_codes");
  const canCategories = userCan(user, "admin.categories");
  const canServices = userCan(user, "admin.services");
  const canRolesTab = userCan(user, "admin.roles.view");
  const canSettings = userCan(user, "admin.settings.view");
  const fullAdmin = canStats;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: adminCategoriesRaw = [] } = useAdminCategories();
  const { data: mobilityFares } = usePlatformMobilityFares({ enabled: fullAdmin });
  const patchMobilityFares = usePatchPlatformMobilityFares();
  const { data: packFares } = usePlatformPackFares({ enabled: fullAdmin });
  const patchPackFares = usePatchPlatformPackFares();
  const { data: subscriptionFees } = usePlatformSubscriptionFees({ enabled: fullAdmin });
  const patchSubscriptionFees = usePatchPlatformSubscriptionFees();
  // Comisión oculta: mantenemos variables por compatibilidad con JSX existente,
  // pero la UI no mostrará ni editará comisión.
  const patchPlatformCommission = useMemo(
    () => ({ isPending: false, mutateAsync: async (_p: number) => ({}) }),
    []
  );
  // Comisión deshabilitada: se oculta la UI de comisión (no tomamos comisiones).
  const [commissionEditOpen, setCommissionEditOpen] = useState(false);
  const [commissionConfirmOpen, setCommissionConfirmOpen] = useState(false);
  const [commissionDraftPercent, setCommissionDraftPercent] = useState(10);
  const [commissionPendingPercent, setCommissionPendingPercent] = useState<number | null>(null);
  const [mobilityFaresDraft, setMobilityFaresDraft] = useState<any>(null);
  const [packFaresDraft, setPackFaresDraft] = useState<any>(null);
  const [subscriptionFeesDraft, setSubscriptionFeesDraft] = useState<Partial<Record<string, number | string>> | null>(
    null
  );
  const [location, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const tab = p.get("tab");
      if (tab === "estadisticas") return "estadisticas";
      /** Pestañas financieras ocultas: enviar a estadísticas */
      if (tab === "recargas" || tab === "saldo" || tab === "payouts") return "estadisticas";
      if (tab === "services") return "services";
      if (tab === "promotional-codes") return "promotional-codes";
      if (tab === "store-payments") return "store-payments";
      if (tab === "go-cancellations") return "go-cancellations";
      if (tab === "users" || tab === "roles") return tab;
    }
    return "overview";
  });
  const [promoCreateModalOpen, setPromoCreateModalOpen] = useState(false);
  const [userRegisterOpen, setUserRegisterOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const p = new URLSearchParams(window.location.search);
    return p.get("tab") === "users" && p.get("register") === "1";
  });
  const [editUserOpen, setEditUserOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const p = new URLSearchParams(window.location.search);
    return p.get("tab") === "users" && !!p.get("editUser") && p.get("register") !== "1";
  });
  const [editUserId, setEditUserId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search);
    return p.get("tab") === "users" && p.get("register") !== "1" ? p.get("editUser") : null;
  });
  const [userPage, setUserPage] = useState(1);
  const [providersPage, setProvidersPage] = useState(1);
  /** Carga documentos de verificación al abrir el visor desde la pestaña Asociados (sin ir a editar). */
  const [providerDocsFetchId, setProviderDocsFetchId] = useState<number | null>(null);
  const [overviewPendingProvidersPage, setOverviewPendingProvidersPage] = useState(1);
  const [overviewRecentBookingsPage, setOverviewRecentBookingsPage] = useState(1);
  const [adminTransfersPage, setAdminTransfersPage] = useState(1);

  useEffect(() => {
    if (mobilityFares?.fares && mobilityFaresDraft == null) setMobilityFaresDraft(mobilityFares.fares);
  }, [mobilityFares?.fares, mobilityFaresDraft]);
  useEffect(() => {
    const pf = (packFares as any)?.fares;
    if (pf && packFaresDraft == null) setPackFaresDraft(pf);
  }, [(packFares as any)?.fares, packFaresDraft]);
  useEffect(() => {
    const cur = (subscriptionFees as any)?.feesBySlug as Record<string, number> | undefined;
    if (cur && subscriptionFeesDraft == null) setSubscriptionFeesDraft(cur);
  }, [(subscriptionFees as any)?.feesBySlug, subscriptionFeesDraft]);

  // Abrir pestaña Recargas y leer highlight desde la URL o desde evento (clic en notificación)
  const [highlightedTransferId, setHighlightedTransferId] = useState<number | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !canAccessAdminPanel(user)) {
      setLocation("/");
    }
  }, [authLoading, user, setLocation]);

  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const q = new URLSearchParams(search);
    const tab = q.get("tab");
    if (tab === "estadisticas") setActiveTab("estadisticas");
    if (tab === "recargas" || tab === "saldo" || tab === "payouts") {
      setActiveTab("estadisticas");
      q.set("tab", "estadisticas");
      window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
    }
    if (tab === "services") setActiveTab("services");
    if (tab === "promotional-codes") setActiveTab("promotional-codes");
    if (tab === "go-cancellations") setActiveTab("go-cancellations");
    if (tab === "users") setActiveTab("users");
    if (tab === "roles") setActiveTab("roles");
    if (tab === "users" && q.get("register") === "1") {
      setActiveTab("users");
      setUserRegisterOpen(true);
      setEditUserOpen(false);
      setEditUserId(null);
    } else if (tab === "users" && q.get("editUser")) {
      setActiveTab("users");
      setUserRegisterOpen(false);
      setEditUserId(q.get("editUser"));
      setEditUserOpen(true);
    } else if (tab === "users") {
      setUserRegisterOpen(false);
      setEditUserOpen(false);
      setEditUserId(null);
    }
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
      if (!canStats) return;
      const detail = (e as CustomEvent<{ transferId?: number | null }>).detail;
      setActiveTab("estadisticas");
      if (typeof window !== "undefined" && window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", "estadisticas");
        window.history.replaceState(null, "", url.pathname + url.search);
      }
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
      if (!canStats) return;
      setActiveTab("estadisticas");
      if (typeof window !== "undefined" && window.history.replaceState) {
        const params = new URLSearchParams(window.location.search);
        params.set("tab", "estadisticas");
        window.history.replaceState(null, "", `/admin?${params.toString()}`);
      }
    };
    window.addEventListener("admin-open-payouts", handler);
    return () => window.removeEventListener("admin-open-payouts", handler);
  }, [user]);

  /** Si quedó una pestaña financiera oculta activa, volver a estadísticas */
  useEffect(() => {
    if (!fullAdmin) return;
    if (!["recargas", "saldo", "payouts"].includes(activeTab)) return;
    setActiveTab("estadisticas");
    if (typeof window !== "undefined" && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "estadisticas");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }, [fullAdmin, activeTab]);

  const [userFilters, setUserFilters] = useState({ role: "", name: "", email: "", lastName: "" });
  const [transferStatusFilter, setTransferStatusFilter] = useState<TransferStatusFilter>("");
  useEffect(() => {
    setAdminTransfersPage(1);
  }, [transferStatusFilter]);

  // Servicios (admin-only): gestión de marcas (Fix Go / Man Go / etc.) y proveedores dentro de marca
  const [selectedBrandCategoryId, setSelectedBrandCategoryId] = useState<number | null>(null);
  const [brandProviderSearch, setBrandProviderSearch] = useState("");
  const [brandProviderMinRating, setBrandProviderMinRating] = useState<number>(0);
  const [brandProviderSort, setBrandProviderSort] = useState<"rating_desc" | "rating_asc" | "name_asc" | "active_desc">("rating_desc");
  const [brandProviderSubcategoryId, setBrandProviderSubcategoryId] = useState<string>("");
  const [brandProviderSubcategoryOpen, setBrandProviderSubcategoryOpen] = useState(false);
  const [brandProviderSubcategoryQuery, setBrandProviderSubcategoryQuery] = useState("");

  // Proveedores -> Servicios activos (staff)
  const [activeServicesSearch, setActiveServicesSearch] = useState("");
  const [activeServicesBrandSlug, setActiveServicesBrandSlug] = useState<string>("");

  const [brandConfirmOpen, setBrandConfirmOpen] = useState(false);
  const [brandConfirmAction, setBrandConfirmAction] = useState<null | { categoryId: number; brandName: string; nextActive: boolean }>(null);
  const [providerConfirmOpen, setProviderConfirmOpen] = useState(false);
  const [providerConfirmAction, setProviderConfirmAction] = useState<null | { providerId: number; name: string; nextActive: boolean }>(null);

  const [pulseBrandId, setPulseBrandId] = useState<number | null>(null);
  const [pulseProviderId, setPulseProviderId] = useState<number | null>(null);

  const [roleHideRole, setRoleHideRole] = useState<string>("tiSupport");
  const [roleHideSlugsDraft, setRoleHideSlugsDraft] = useState<string[]>([]);
  const [roleHideConfirmOpen, setRoleHideConfirmOpen] = useState(false);
  const [roleHidePending, setRoleHidePending] = useState<null | { role: string; hiddenSlugs: string[] }>(null);

  const { data: roleVisibilityData } = useQuery({
    queryKey: ["admin-category-visibility-by-role"],
    queryFn: () => fetchWithAuth("/api/admin/category-visibility/by-role"),
    enabled: fullAdmin && activeTab === "services",
    staleTime: 15_000,
  });

  useEffect(() => {
    const map = (roleVisibilityData as any)?.byRole as Record<string, string[]> | undefined;
    if (!map) return;
    setRoleHideSlugsDraft(map[roleHideRole] ?? []);
  }, [roleVisibilityData, roleHideRole]);

  const patchRoleVisibilityMutation = useMutation({
    mutationFn: async (args: { role: string; hiddenSlugs: string[] }) =>
      patchWithAuth("/api/admin/category-visibility/by-role", { role: args.role, hiddenSlugs: args.hiddenSlugs }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-category-visibility-by-role"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/category-visibility"] });
      toast({ title: "Guardado", description: "Se actualizó la visibilidad por rol." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message || "No se pudo guardar.", variant: "destructive" });
    },
  });

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
    enabled: canPanel,
  });
  const roles = filterVisibleCatalogRoles((rolesData ?? []) as { code: string; name: string }[]);

  const openUserRegister = () => {
    setActiveTab("users");
    setUserRegisterOpen(true);
    if (typeof window !== "undefined" && window.history.replaceState) {
      const u = new URL(window.location.href);
      u.searchParams.set("tab", "users");
      u.searchParams.set("register", "1");
      window.history.replaceState(null, "", u.pathname + u.search);
    }
  };

  const closeUserRegister = () => {
    setUserRegisterOpen(false);
    if (typeof window !== "undefined" && window.history.replaceState) {
      const u = new URL(window.location.href);
      u.searchParams.set("tab", "users");
      u.searchParams.delete("register");
      window.history.replaceState(null, "", u.pathname + u.search);
    }
  };

  const openEditUserModal = (userId: string) => {
    setActiveTab("users");
    setUserRegisterOpen(false);
    setEditUserId(userId);
    setEditUserOpen(true);
    if (typeof window !== "undefined" && window.history.replaceState) {
      const u = new URL(window.location.href);
      u.searchParams.set("tab", "users");
      u.searchParams.delete("register");
      u.searchParams.set("editUser", userId);
      window.history.replaceState(null, "", u.pathname + u.search);
    }
  };

  const closeEditUserModal = () => {
    setEditUserOpen(false);
    setEditUserId(null);
    if (typeof window !== "undefined" && window.history.replaceState) {
      const u = new URL(window.location.href);
      u.searchParams.set("tab", "users");
      u.searchParams.delete("editUser");
      window.history.replaceState(null, "", u.pathname + u.search);
    }
  };

  const handleEditUserClick = async (u: { id: string; role?: string }) => {
    if (isAssociateUserRole(u.role)) {
      try {
        const detail = await fetchAdminJson<AdminUserDetail>(`/api/admin/users/${u.id}`);
        const providerId = detail.providerId;
        if (providerId != null && providerId > 0) {
          setLocation(adminProviderEditHref(providerId, "/admin?tab=users"));
          return;
        }
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Error",
          description:
            e instanceof Error ? e.message : "No se pudo abrir la ficha del asociado.",
        });
        return;
      }
    }
    openEditUserModal(u.id);
  };

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
    enabled: canPanel && canUsers,
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

  const { data: adminActiveServicesData, isLoading: adminActiveServicesLoading } = useQuery({
    queryKey: ["admin-active-services", activeServicesSearch, activeServicesBrandSlug],
    queryFn: () => {
      const params = new URLSearchParams();
      if (activeServicesSearch.trim()) params.set("search", activeServicesSearch.trim());
      if (activeServicesBrandSlug) params.set("brandSlug", activeServicesBrandSlug);
      const qs = params.toString();
      return fetchWithAuth(`/api/admin/services/active${qs ? `?${qs}` : ""}`);
    },
    enabled: canPanel && canProviders && activeTab === "providers",
    staleTime: 10_000,
  });
  const activeProviderRows: AdminActiveProviderRow[] = adminActiveServicesData?.providers ?? [];

  const { data: providerDocsDetail, isLoading: providerDocsLoading } = useQuery({
    queryKey: ["admin-provider-detail-docs", providerDocsFetchId],
    queryFn: () => fetchAdminProviderDetail(providerDocsFetchId!),
    enabled: providerDocsFetchId != null && providerDocsFetchId > 0,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!providerDocsFetchId || !providerDocsDetail?.verificationDocuments) return;
    const vd = providerDocsDetail.verificationDocuments;
    const credTitle =
      vd.providerCategorySlug === "transport" ? "Licencia de conducir" : "Documento profesional";
    const slides = [
      { id: "avatar", title: "Foto de perfil", src: vd.avatar ?? null },
      { id: "id", title: "Identificación", src: vd.userIdentification ?? null },
      { id: "credential", title: credTitle, src: vd.professionalCredentialUrl ?? null },
    ];
    const revieweeName = providerDocsDetail.user
      ? `${providerDocsDetail.user.name ?? ""} ${providerDocsDetail.user.lastName ?? ""}`.trim()
      : "";
    setAssocImageDialog((prev) => ({
      ...prev,
      slides,
      revieweeName: revieweeName || prev.revieweeName,
    }));
  }, [providerDocsFetchId, providerDocsDetail]);

  const { data: serviceBrandsData, isLoading: serviceBrandsLoading } = useQuery({
    queryKey: ["admin-service-brands"],
    queryFn: () => fetchWithAuth("/api/admin/service-brands"),
    enabled: fullAdmin && (activeTab === "services" || activeTab === "settings"),
    staleTime: 30_000,
  });
  const serviceBrands: AdminServiceBrand[] = serviceBrandsData?.brands ?? [];
  const brandUiHiddenBySlug = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const b of serviceBrands) {
      m.set(String(b.slug ?? "").trim().toLowerCase(), b.uiHidden);
    }
    return m;
  }, [serviceBrands]);
  const visibleSubscriptionFeeSlugs = useMemo(
    () =>
      SUBSCRIPTION_FEE_ADMIN_SLUGS.filter((slug) =>
        isSubscriptionFeeVisibleInAdminSettings(slug, brandUiHiddenBySlug),
      ),
    [brandUiHiddenBySlug],
  );
  const selectedBrand = (serviceBrands ?? []).find((b) => b.categoryId === selectedBrandCategoryId) ?? null;

  const { data: brandSubcategoriesData } = useQuery({
    queryKey: ["admin-brand-subcategories", selectedBrandCategoryId],
    queryFn: async () => {
      if (selectedBrandCategoryId == null) return [];
      return fetchWithAuth(`/api/subcategories?categoryId=${encodeURIComponent(String(selectedBrandCategoryId))}`);
    },
    enabled: fullAdmin && activeTab === "services" && selectedBrandCategoryId != null,
    staleTime: 30_000,
  });
  const brandSubcategories =
    ((brandSubcategoriesData as any) ?? []) as Array<{ id: number; name: string; slug?: string }>;

  const brandProviderSubcategoryName = useMemo(() => {
    if (!brandProviderSubcategoryId) return "Todas";
    const id = Number(brandProviderSubcategoryId);
    const found = brandSubcategories.find((s) => Number(s.id) === id);
    return found?.name ?? "Todas";
  }, [brandProviderSubcategoryId, brandSubcategories]);

  const brandSubcategoriesDisplayed = useMemo(() => {
    const q = brandProviderSubcategoryQuery.trim().toLowerCase();
    const list = brandSubcategories ?? [];
    if (!q) return list.slice(0, 30);
    return list.filter((s) => String(s.name ?? "").toLowerCase().includes(q)).slice(0, 30);
  }, [brandSubcategories, brandProviderSubcategoryQuery]);

  useEffect(() => {
    if (!brandProviderSubcategoryOpen) setBrandProviderSubcategoryQuery("");
  }, [brandProviderSubcategoryOpen]);

  useEffect(() => {
    // Al cambiar de marca, resetear filtro de subcategoría.
    setBrandProviderSubcategoryId("");
    setBrandProviderSubcategoryOpen(false);
    setBrandProviderSubcategoryQuery("");
  }, [selectedBrandCategoryId]);

  const { data: brandProvidersData, isLoading: brandProvidersLoading } = useQuery({
    queryKey: [
      "admin-service-brand-providers",
      selectedBrandCategoryId,
      brandProviderSearch,
      brandProviderMinRating,
      brandProviderSort,
      brandProviderSubcategoryId,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (brandProviderSearch.trim()) params.set("search", brandProviderSearch.trim());
      if (brandProviderMinRating > 0) params.set("minRating", String(brandProviderMinRating));
      if (brandProviderSort) params.set("sort", brandProviderSort);
      if (brandProviderSubcategoryId) params.set("subcategoryId", brandProviderSubcategoryId);
      return fetchWithAuth(`/api/admin/service-brands/${selectedBrandCategoryId}/providers?${params.toString()}`);
    },
    enabled: fullAdmin && activeTab === "services" && selectedBrandCategoryId != null,
    staleTime: 10_000,
  });
  const brandProviders: AdminBrandProviderRow[] = brandProvidersData?.providers ?? [];

  const seedBaseCategoriesMutation = useMutation({
    mutationFn: () => postWithAuth("/api/admin/catalog/seed-categories"),
    onSuccess: (data: { message?: string; created?: string[] }) => {
      queryClient.invalidateQueries({ queryKey: ADMIN_CATEGORIES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["admin-service-brands"] });
      toast({
        title: "Categorías sincronizadas",
        description: data.message ?? "Sincronización completada.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Error",
        description: err.message || "No se pudieron sincronizar las categorías base.",
        variant: "destructive",
      });
    },
  });

  const toggleBrandMutation = useMutation({
    mutationFn: async (args: { categoryId: number; isActive: boolean }) =>
      patchWithAuth(`/api/admin/service-brands/${args.categoryId}`, { isActive: args.isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-service-brands"] });
      // Refrescar catálogo público de inmediato (Explore / listados)
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services/:id"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/category-visibility"] });
      if (selectedBrandCategoryId != null) {
        queryClient.invalidateQueries({ queryKey: ["admin-service-brand-providers", selectedBrandCategoryId] });
      }
      const label = brandConfirmAction?.brandName ? `"${brandConfirmAction.brandName}"` : "la marca";
      const action = brandConfirmAction?.nextActive ? "activada" : "desactivada";
      toast({ title: "Acción aplicada", description: `Se ha ${action} ${label}.` });
      setPulseBrandId(brandConfirmAction?.categoryId ?? null);
      setTimeout(() => setPulseBrandId(null), 650);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message || "No se pudo actualizar la marca.", variant: "destructive" });
    },
  });

  const toggleProviderServicesMutation = useMutation({
    mutationFn: async (args: { providerId: number; isActive: boolean }) =>
      patchWithAuth(`/api/admin/providers/${args.providerId}/services`, { isActive: args.isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-service-brands"] });
      // Refrescar catálogo público de inmediato (Explore / listados)
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services/:id"] });
      if (selectedBrandCategoryId != null) {
        queryClient.invalidateQueries({
          queryKey: ["admin-service-brand-providers", selectedBrandCategoryId, brandProviderSearch, brandProviderMinRating, brandProviderSort],
        });
      }
      const label = providerConfirmAction?.name ? `"${providerConfirmAction.name}"` : "el asociado";
      const action = providerConfirmAction?.nextActive ? "activado" : "desactivado";
      toast({ title: "Acción aplicada", description: `Se ha ${action} ${label}.` });
      setPulseProviderId(providerConfirmAction?.providerId ?? null);
      setTimeout(() => setPulseProviderId(null), 650);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message || "No se pudo actualizar el asociado.", variant: "destructive" });
    },
  });

  type AdminVerifyingStatusItem = {
    userId: string;
    name: string;
    email?: string | null;
    avatar?: string | null;
    requestType?: "onboarding" | "renewal";
    user_identification?: string | null;
    professionalCredentialUrl?: string | null;
    identification_verified: "pending" | "verified" | "rejected";
    transacction_date: string | null;
    transacction_verified: "pending" | "verified" | "rejected";
    transacction_code?: string | null;
    subscriptionMonths?: number | null;
    subscriptionMonthlyUsd?: number | null;
    subscriptionTotalUsd?: number | null;
    promotionalCode?: string | null;
    promotionalDiscountPercent?: number | null;
    subscriptionOriginalTotalUsd?: number | null;
    subscriptionDiscountedTotalUsd?: number | null;
    providerCategorySlug?: string | null;
    visibilitySubscriptionEndsAt?: string | null;
    prefundPromoAwaitingDossier?: boolean;
    prefundPromoCode?: string | null;
    prefundPromoMonths?: number | null;
  };

  const credentialSlideTitle = (assoc: AdminVerifyingStatusItem) =>
    assoc.providerCategorySlug === "transport" ? "Licencia de conducir" : "Documento profesional";

  const associateVerificationSlides = (assoc: AdminVerifyingStatusItem) =>
    [
      { id: "avatar", title: "Foto de perfil", src: assoc.avatar ?? null },
      { id: "id", title: "Identificación", src: assoc.user_identification ?? null },
      { id: "credential", title: credentialSlideTitle(assoc), src: assoc.professionalCredentialUrl ?? null },
    ] as const;

  const { data: adminVerifyingStatusData, isLoading: adminVerifyingStatusLoading } = useQuery({
    queryKey: ["admin-verifying-status-pending"],
    queryFn: () => fetchWithAuth("/api/admin/verifying-status/pending"),
    enabled: fullAdmin && activeTab === "overview",
  });
  const pendingAssociates: AdminVerifyingStatusItem[] = adminVerifyingStatusData?.items ?? [];

  type AdminAccountChangeRequest = {
    id: number;
    userId: string;
    field: "email" | "name" | "phone" | "vehicle";
    reason: string;
    status: "pending" | "approved" | "rejected";
    createdAt: string | Date;
    proposal?: unknown;
    user?: { id: string; name?: string; lastName?: string; email?: string; phone?: string; role?: string } | null;
  };

  const { data: adminAccountChangeReqData, isLoading: adminAccountChangeReqLoading } = useQuery({
    queryKey: ["admin-account-change-requests-pending"],
    queryFn: () => fetchWithAuth("/api/admin/account-change-requests/pending"),
    enabled: fullAdmin && activeTab === "overview",
  });
  const pendingAccountChangeRequests: AdminAccountChangeRequest[] = adminAccountChangeReqData?.requests ?? [];

  const [auditLogPage, setAuditLogPage] = useState(1);
  const AUDIT_LOG_PAGE_SIZE = 5;
  const [auditDateFromDraft, setAuditDateFromDraft] = useState("");
  const [auditDateToDraft, setAuditDateToDraft] = useState("");
  const [auditDateFrom, setAuditDateFrom] = useState("");
  const [auditDateTo, setAuditDateTo] = useState("");

  const { data: adminAuditLogData, isLoading: adminAuditLogLoading } = useQuery({
    queryKey: ["admin-audit-log", auditDateFrom, auditDateTo],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("limit", auditDateFrom || auditDateTo ? "400" : "120");
      if (auditDateFrom) params.set("from", auditDateFrom);
      if (auditDateTo) params.set("to", auditDateTo);
      const qs = params.toString();
      return fetchWithAuth(`/api/admin/audit-log?${qs}`);
    },
    enabled: fullAdmin && activeTab === "overview",
  });
  const auditItems: Array<{
    id: string;
    action: string;
    adminUserId: string;
    adminName?: string | null;
    adminEmail?: string | null;
    affectedUserId: string;
    affectedUserName?: string | null;
    affectedUserEmail?: string | null;
    createdAt: any;
    meta?: any;
  }> = adminAuditLogData?.items ?? [];

  const resolveAccountChangeRequestMutation = useMutation({
    mutationFn: async (args: { id: number; action: "approve" | "reject"; reason?: string }) =>
      patchWithAuth(`/api/admin/account-change-requests/${args.id}`, { action: args.action, reason: args.reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-account-change-requests-pending"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit-log"] });
      toast({ title: "Actualizado", description: "La petición fue procesada correctamente." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message || "No se pudo procesar la petición.", variant: "destructive" });
    },
  });

  const updateVerifyingStatusMutation = useMutation({
    mutationFn: async (args: {
      userId: string;
      step: "identification" | "transaction";
      action: "approve" | "reject";
      reason?: string;
    }) => {
      return patchWithAuth(`/api/admin/verifying-status/${args.userId}/${args.step}`, {
        action: args.action,
        reason: args.reason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-verifying-status-pending"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit-log"] });
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

  const [rejectModal, setRejectModal] = useState<{
    open: boolean;
    userId: string;
    userName: string;
    step: "identification" | "transaction" | "account_change";
    requestId?: number;
    reason: string;
  }>({ open: false, userId: "", userName: "", step: "transaction", reason: "" });

  const [assocImageDialog, setAssocImageDialog] = useState<{
    open: boolean;
    userId: string;
    revieweeName: string;
    slides: { id: string; title: string; src: string | null }[];
    initialIndex: number;
  }>({ open: false, userId: "", revieweeName: "", slides: [], initialIndex: 0 });

  const { data: adminBookingsData, isLoading: adminBookingsLoading } = useQuery({
    queryKey: ["admin-bookings"],
    queryFn: () => fetchWithAuth("/api/admin/bookings"),
    enabled: canPanel && canBookings && activeTab === "bookings",
  });
  const adminBookings: AdminBookingItem[] = adminBookingsData?.bookings ?? [];
  const [bookingSubTab, setBookingSubTab] = useState<"pending" | "in_progress" | "ready" | "history">("pending");
  const [bookingPageBySubTab, setBookingPageBySubTab] = useState<Record<"pending" | "in_progress" | "ready" | "history", number>>({
    pending: 1,
    in_progress: 1,
    ready: 1,
    history: 1,
  });
  const [bookingEdits, setBookingEdits] = useState<
    Record<number, { scheduleDate?: string; scheduleTime?: string; status?: string }>
  >({});
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

  if (authLoading) {
    return <AccessGateLoading message="Cargando panel de administración…" />;
  }
  if (!user || !canAccessAdminPanel(user)) {
    return <AccessGateLoading message="Redirigiendo al inicio…" />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header: compacto en móvil */}
      <div className="bg-background border-b border-border px-4 sm:px-6 py-3 sm:py-4">
        <div className="container mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Shield className="h-6 w-6 sm:h-8 sm:w-8 text-mango-orange shrink-0" />
            <div className="min-w-0">
              <h1 className="text-base sm:text-2xl font-bold leading-snug">Panel de Administración</h1>
              <p className="text-muted-foreground text-xs sm:text-sm">Applia</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {fullAdmin ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 h-9 sm:px-3 px-2"
                onClick={() => {
                  setActiveTab("promotional-codes");
                  setPromoCreateModalOpen(true);
                  if (typeof window !== "undefined" && window.history.replaceState) {
                    const url = new URL(window.location.href);
                    url.searchParams.set("tab", "promotional-codes");
                    window.history.replaceState(null, "", url.pathname + url.search);
                  }
                }}
              >
                <Ticket className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Crear código</span>
              </Button>
            ) : null}
            <Button variant="outline" size="icon" className="h-9 w-9">
              <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <Avatar className="h-8 w-8 sm:h-10 sm:w-10">
              <AvatarFallback className="text-sm">
                {(user?.firstName?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
              </AvatarFallback>
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
              <TabsList className="inline-flex w-max h-auto flex-nowrap gap-1 rounded-xl border border-border/60 bg-muted/25 p-1 md:border-border/50 md:bg-muted/20 md:flex md:flex-wrap md:w-auto">
                {fullAdmin && (
                  <TabsTrigger value="estadisticas" className="shrink-0 gap-1">
                    <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4 opacity-80" />
                    <span className="hidden min-[380px]:inline">Estadísticas</span>
                    <span className="min-[380px]:hidden">Stats</span>
                  </TabsTrigger>
                )}
                {canOverview && (
                  <TabsTrigger value="overview" className="shrink-0 text-xs sm:text-sm px-2.5 sm:px-3">
                    <span className="sm:hidden">Asociados</span>
                    <span className="hidden sm:inline">Gestión de asociados</span>
                  </TabsTrigger>
                )}
                {fullAdmin && (
                  <TabsTrigger value="store-payments" className="shrink-0 text-xs sm:text-sm px-2.5 sm:px-3">
                    Pagos tiendas
                  </TabsTrigger>
                )}
                {fullAdmin && (
                  <TabsTrigger value="go-cancellations" className="shrink-0 text-xs sm:text-sm px-2.5 sm:px-3">
                    Cancelaciones Go
                  </TabsTrigger>
                )}
                {canUsers && (
                  <TabsTrigger value="users" className="shrink-0 text-xs sm:text-sm px-2.5 sm:px-3">Usuarios</TabsTrigger>
                )}
                {canProviders && (
                  <TabsTrigger value="providers" className="shrink-0 text-xs sm:text-sm px-2.5 sm:px-3">
                    <span className="sm:hidden">Asoc.</span>
                    <span className="hidden sm:inline">Asociados</span>
                  </TabsTrigger>
                )}
                {canBookings && (
                  <TabsTrigger value="bookings" className="shrink-0 text-xs sm:text-sm px-2.5 sm:px-3">Reservas</TabsTrigger>
                )}
                {canPromo && (
                  <TabsTrigger value="promotional-codes" className="shrink-0 gap-1.5">
                    <Ticket className="h-4 w-4 shrink-0 opacity-80" />
                    Códigos
                  </TabsTrigger>
                )}
                {canCategories && (
                  <TabsTrigger value="categories" className="shrink-0">Categorías</TabsTrigger>
                )}
                {canServices && (
                  <TabsTrigger value="services" className="gap-1.5 shrink-0">
                    <Layers className="h-4 w-4 shrink-0" />
                    Servicios
                  </TabsTrigger>
                )}
                {canRolesTab && (
                  <TabsTrigger value="roles" className="shrink-0">Roles</TabsTrigger>
                )}
                {canSettings && (
                  <TabsTrigger value="settings" className="shrink-0">Configuración</TabsTrigger>
                )}
              </TabsList>
            </div>
          </div>

          <TabsContent value="estadisticas" className="min-w-0">
            <AdminStatisticsPanel enabled={fullAdmin} />
          </TabsContent>

          <TabsContent value="promotional-codes" className="min-w-0">
            <AdminPromotionalCodesPanel
              enabled={fullAdmin && activeTab === "promotional-codes"}
              createModalOpen={promoCreateModalOpen}
              onCreateModalOpenChange={setPromoCreateModalOpen}
            />
          </TabsContent>

          <TabsContent value="store-payments" className="min-w-0">
            <AdminStoreSubscriptionPaymentsPanel enabled={fullAdmin && activeTab === "store-payments"} />
          </TabsContent>

          <TabsContent value="go-cancellations" className="min-w-0">
            <AdminGoCancellationsPanel enabled={fullAdmin && activeTab === "go-cancellations"} />
          </TabsContent>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 gap-6">
              {/* Pending Approvals */}
              <Card>
                <CardHeader>
                  <CardTitle>Gestión de asociados</CardTitle>
                  <CardDescription>Verificaciones pendientes y peticiones de cambio de datos de cuenta</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="rounded-lg border border-border/60 p-3 space-y-3 bg-muted/10">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">Peticiones de cuenta y vehículo Go</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Solicitudes para permitir editar correo, nombre o teléfono (una vez), y cambios de vehículo
                            en Go (taxi / delivery) con datos propuestos.
                          </p>
                        </div>
                      </div>

                      {adminAccountChangeReqLoading ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">Cargando peticiones…</div>
                      ) : pendingAccountChangeRequests.length === 0 ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">No hay peticiones pendientes.</div>
                      ) : (
                        <div className="space-y-3">
                          {pendingAccountChangeRequests.map((r) => {
                            const u = r.user ?? null;
                            const who =
                              (u?.name || u?.lastName
                                ? `${u?.name ?? ""} ${u?.lastName ?? ""}`.trim()
                                : u?.email) || r.userId;
                            const fieldLabel =
                              r.field === "email"
                                ? "correo"
                                : r.field === "name"
                                  ? "nombre"
                                  : r.field === "phone"
                                    ? "número de teléfono"
                                    : r.field === "vehicle"
                                      ? "vehículo (Go)"
                                      : r.field === "recovery_questions"
                                        ? "preguntas de recuperación"
                                        : r.field;
                            const vehicleSummary =
                              r.field === "vehicle"
                                ? formatVehicleChangeProposalSummary(r.proposal, adminCategoriesRaw)
                                : "";
                            return (
                              <div key={r.id} className="rounded-lg border bg-background p-3 space-y-2">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="font-medium truncate">
                                      Petición de cambio de {fieldLabel}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {who}
                                      {u?.email ? ` · ${u.email}` : ""}
                                      {u?.phone ? ` · ${u.phone}` : ""}
                                    </p>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-green-600"
                                      disabled={resolveAccountChangeRequestMutation.isPending}
                                      onClick={() => resolveAccountChangeRequestMutation.mutate({ id: r.id, action: "approve" })}
                                    >
                                      Aprobar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-red-600"
                                      disabled={resolveAccountChangeRequestMutation.isPending}
                                      onClick={() =>
                                        setRejectModal({
                                          open: true,
                                          userId: r.userId,
                                          userName: who,
                                          step: "account_change",
                                          requestId: r.id,
                                          reason: "",
                                        })
                                      }
                                    >
                                      Rechazar
                                    </Button>
                                  </div>
                                </div>
                                {vehicleSummary ? (
                                  <p className="whitespace-pre-wrap rounded-md border border-border/50 bg-muted/40 p-2 text-xs text-foreground">
                                    {vehicleSummary}
                                  </p>
                                ) : null}
                                <p className="text-sm text-muted-foreground break-words">{r.reason}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

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
                              // Permitir al admin corregir/revertir un rechazo anterior sin depender de que el usuario re-subiera.
                              const identEnabled =
                                assoc.identification_verified === "pending" || assoc.identification_verified === "rejected";
                              const txEnabled =
                                assoc.transacction_verified === "pending" || assoc.transacction_verified === "rejected";
                              const reqLabel = assoc.requestType === "renewal" ? "Renovación" : "Nuevo asociado";
                              const reqBadgeVariant = assoc.requestType === "renewal" ? "secondary" : "default";
                              const showIdentificationCard =
                                assoc.requestType !== "renewal" && assoc.identification_verified !== "verified";
                              return (
                                <div key={assoc.userId} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <Avatar>
                                        <AvatarFallback>{assoc.name?.[0] ?? "A"}</AvatarFallback>
                                      </Avatar>
                                      <div className="min-w-0">
                                        <p className="font-medium truncate">{assoc.name}</p>
                                        {assoc.email ? <p className="text-sm text-muted-foreground truncate">{assoc.email}</p> : null}
                                      </div>
                                    </div>
                                    <Badge
                                      className={
                                        assoc.requestType === "renewal"
                                          ? "shrink-0 border-transparent bg-indigo-600/15 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200"
                                          : "shrink-0 border-transparent bg-emerald-600/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
                                      }
                                      variant={reqBadgeVariant}
                                    >
                                      {reqLabel}
                                    </Badge>
                                  </div>

                                  {showIdentificationCard ? (
                                  <div className="rounded-lg border border-border/60 p-3 space-y-3 bg-muted/10">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                      <div className="min-w-0 flex-1">
                                        <p className="font-medium">Verificación de identificación</p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                          Estado: {stateLabel(assoc.identification_verified)}
                                        </p>
                                      </div>
                                      <Badge
                                        className="shrink-0"
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

                                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <Button
                                            variant="outline"
                                            size="icon"
                                            className="shrink-0"
                                            disabled={!assoc.avatar}
                                            onClick={() =>
                                              setAssocImageDialog({
                                                open: true,
                                                userId: assoc.userId,
                                                revieweeName: assoc.name?.trim() || "—",
                                                initialIndex: 0,
                                                slides: [...associateVerificationSlides(assoc)],
                                              })
                                            }
                                          >
                                            <Eye className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="icon"
                                            className="shrink-0"
                                            disabled={!assoc.user_identification}
                                            onClick={() =>
                                              setAssocImageDialog({
                                                open: true,
                                                userId: assoc.userId,
                                                revieweeName: assoc.name?.trim() || "—",
                                                initialIndex: 1,
                                                slides: [...associateVerificationSlides(assoc)],
                                              })
                                            }
                                          >
                                            <FileText className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="icon"
                                            className="shrink-0"
                                            disabled={!assoc.professionalCredentialUrl}
                                            onClick={() =>
                                              setAssocImageDialog({
                                                open: true,
                                                userId: assoc.userId,
                                                revieweeName: assoc.name?.trim() || "—",
                                                initialIndex: 2,
                                                slides: [...associateVerificationSlides(assoc)],
                                              })
                                            }
                                            title={
                                              assoc.providerCategorySlug === "transport"
                                                ? "Ver licencia de conducir"
                                                : "Ver documento profesional"
                                            }
                                          >
                                            <Shield className="h-4 w-4" />
                                          </Button>
                                        </div>

                                        <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0 sm:gap-2">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="min-w-0 justify-center text-green-600"
                                            disabled={!identEnabled || updateVerifyingStatusMutation.isPending}
                                            onClick={() =>
                                              updateVerifyingStatusMutation.mutate({
                                                userId: assoc.userId,
                                                step: "identification",
                                                action: "approve",
                                              })
                                            }
                                          >
                                            <CheckCircle className="h-4 w-4 shrink-0 sm:mr-1" />
                                            <span className="truncate">Aprobar</span>
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="min-w-0 justify-center text-red-600"
                                            disabled={!identEnabled || updateVerifyingStatusMutation.isPending}
                                            onClick={() =>
                                              setRejectModal({
                                                open: true,
                                                userId: assoc.userId,
                                                userName: assoc.name?.trim() || "—",
                                                step: "identification",
                                                reason: "",
                                              })
                                            }
                                          >
                                            <XCircle className="h-4 w-4 shrink-0 sm:mr-1" />
                                            <span className="truncate">Rechazar</span>
                                          </Button>
                                        </div>
                                      </div>
                                  </div>
                                  ) : null}

                                  {assoc.prefundPromoAwaitingDossier ? (
                                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
                                      <p className="font-medium">Mes(es) gratis por código (antes del expediente)</p>
                                      <p className="mt-1 text-xs leading-relaxed opacity-95">
                                        Canjeó el código{" "}
                                        <span className="font-mono font-semibold">{assoc.prefundPromoCode ?? "—"}</span>
                                        {typeof assoc.prefundPromoMonths === "number" && assoc.prefundPromoMonths > 0
                                          ? ` (${assoc.prefundPromoMonths} mes${assoc.prefundPromoMonths === 1 ? "" : "es"})`
                                          : null}
                                        . La cuota de visibilidad puede estar activa por el canje; aún falta completar o
                                        verificar la documentación para cerrar el alta en el panel.
                                      </p>
                                    </div>
                                  ) : null}

                                  <div className="rounded-lg border border-border/60 p-3 space-y-3 bg-muted/10">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                      <div className="min-w-0 flex-1">
                                        <p className="font-medium">
                                          Suscripción{" "}
                                          {typeof assoc.subscriptionMonths === "number" && assoc.subscriptionMonths > 1
                                            ? `(${assoc.subscriptionMonths} meses)`
                                            : "(1 mes)"}{" "}
                                          (
                                          {typeof assoc.subscriptionTotalUsd === "number" &&
                                          Number.isFinite(assoc.subscriptionTotalUsd)
                                            ? `${assoc.subscriptionTotalUsd.toFixed(2)} USD`
                                            : typeof assoc.subscriptionMonthlyUsd === "number" &&
                                                Number.isFinite(assoc.subscriptionMonthlyUsd)
                                              ? `${Number(assoc.subscriptionMonthlyUsd).toFixed(2)} USD`
                                              : "15.00 USD"}
                                          {assoc.promotionalCode &&
                                          typeof assoc.subscriptionOriginalTotalUsd === "number" ? (
                                            <span className="text-muted-foreground font-normal">
                                              {" "}
                                              (antes {assoc.subscriptionOriginalTotalUsd.toFixed(2)} USD)
                                            </span>
                                          ) : null}
                                          )
                                        </p>
                                        <p className="break-words text-xs text-muted-foreground mt-1">
                                          Fecha:{" "}
                                          {assoc.transacction_date
                                            ? new Date(assoc.transacction_date).toLocaleDateString("es-EC")
                                            : "—"}{" "}
                                          · Comprobante:{" "}
                                          {assoc.transacction_code?.startsWith("MES-GRATIS:")
                                            ? `Ticket promocional — ${assoc.transacction_code.replace(/^MES-GRATIS:/, "").trim()}`
                                            : (assoc.transacction_code ?? "—")}
                                          {assoc.promotionalCode ? (
                                            <>
                                              {" "}
                                              · Código promo:{" "}
                                              <span className="font-mono font-medium text-foreground">
                                                {assoc.promotionalCode}
                                              </span>
                                              {typeof assoc.promotionalDiscountPercent === "number"
                                                ? ` (−${assoc.promotionalDiscountPercent}%)`
                                                : null}
                                            </>
                                          ) : null}
                                          {assoc.visibilitySubscriptionEndsAt ? (
                                            <>
                                              {" "}
                                              · Vence:{" "}
                                              {new Date(assoc.visibilitySubscriptionEndsAt).toLocaleString("es-EC", {
                                                dateStyle: "medium",
                                                timeStyle: "short",
                                              })}
                                            </>
                                          ) : null}
                                        </p>
                                      </div>
                                      <Badge
                                        className="shrink-0"
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

                                    <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:flex sm:justify-end sm:gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="min-w-0 justify-center text-green-600"
                                        disabled={!txEnabled || updateVerifyingStatusMutation.isPending}
                                        onClick={() =>
                                          updateVerifyingStatusMutation.mutate({
                                            userId: assoc.userId,
                                            step: "transaction",
                                            action: "approve",
                                          })
                                        }
                                      >
                                        <CheckCircle className="h-4 w-4 shrink-0 sm:mr-1" />
                                        <span className="truncate">Aprobar suscripción</span>
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="min-w-0 justify-center text-red-600"
                                        disabled={!txEnabled || updateVerifyingStatusMutation.isPending}
                                        onClick={() =>
                                          setRejectModal({
                                            open: true,
                                            userId: assoc.userId,
                                            userName: assoc.name?.trim() || "—",
                                            step: "transaction",
                                            reason: "",
                                          })
                                        }
                                      >
                                        <XCircle className="h-4 w-4 shrink-0 sm:mr-1" />
                                        <span className="truncate">Rechazar suscripción</span>
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

                    <div className="rounded-lg border border-border/60 p-3 space-y-3 bg-muted/10">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">Historial de auditoría</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Registro de acciones sensibles (pagos, verificación de documentos de identificación,
                            cambios de cuenta o vehículo). Cada evento muestra fecha y hora exactas. Filtro opcional por
                            rango de días (UTC): inicio del día «Desde» y fin del día «Hasta», ambos inclusivos.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 rounded-md border border-border/50 bg-background/80 p-3 sm:flex-row sm:flex-wrap sm:items-end">
                        <div className="grid flex-1 gap-1 min-w-[140px]">
                          <label className="text-xs font-medium text-muted-foreground" htmlFor="audit-from">
                            Desde
                          </label>
                          <Input
                            id="audit-from"
                            type="date"
                            className="text-sm"
                            value={auditDateFromDraft}
                            onChange={(e) => setAuditDateFromDraft(e.target.value)}
                          />
                        </div>
                        <div className="grid flex-1 gap-1 min-w-[140px]">
                          <label className="text-xs font-medium text-muted-foreground" htmlFor="audit-to">
                            Hasta
                          </label>
                          <Input
                            id="audit-to"
                            type="date"
                            className="text-sm"
                            value={auditDateToDraft}
                            onChange={(e) => setAuditDateToDraft(e.target.value)}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setAuditDateFrom(auditDateFromDraft.trim());
                              setAuditDateTo(auditDateToDraft.trim());
                              setAuditLogPage(1);
                            }}
                          >
                            Aplicar filtro
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAuditDateFromDraft("");
                              setAuditDateToDraft("");
                              setAuditDateFrom("");
                              setAuditDateTo("");
                              setAuditLogPage(1);
                            }}
                          >
                            Limpiar fechas
                          </Button>
                        </div>
                      </div>

                      {adminAuditLogLoading ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">Cargando historial…</div>
                      ) : auditItems.length === 0 ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">Sin eventos recientes.</div>
                      ) : (
                        (() => {
                          const totalPages = Math.max(1, Math.ceil(auditItems.length / AUDIT_LOG_PAGE_SIZE));
                          const safePage = Math.min(totalPages, Math.max(1, auditLogPage));
                          const start = (safePage - 1) * AUDIT_LOG_PAGE_SIZE;
                          const end = start + AUDIT_LOG_PAGE_SIZE;
                          const paged = auditItems.slice(start, end);
                          return (
                            <>
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs text-muted-foreground">
                                  Página {safePage} de {totalPages} · {auditItems.length} eventos
                                </p>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={safePage <= 1}
                                    onClick={() => setAuditLogPage((p) => Math.max(1, p - 1))}
                                  >
                                    <ChevronLeft className="h-4 w-4" />
                                    Anterior
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={safePage >= totalPages}
                                    onClick={() => setAuditLogPage((p) => Math.min(totalPages, p + 1))}
                                  >
                                    Siguiente
                                    <ChevronRight className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <div className="space-y-2">
                                {paged.map((it) => {
                            const d = parseAdminAuditCreatedAt(it.createdAt);
                            const fechaHoraLabel = d
                              ? d.toLocaleString("es-EC", {
                                  weekday: "long",
                                  day: "numeric",
                                  month: "long",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                })
                              : "Fecha/hora no disponible";
                            const actionLabel = adminAuditEventTitle(it);
                            const detailLines = adminAuditEventDetailLines(it);
                            return (
                              <div key={it.id} className="rounded-lg border bg-background p-3 text-sm">
                                <p className="font-medium">{actionLabel}</p>
                                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Fecha y hora
                                </p>
                                <p className="text-sm font-medium text-foreground tabular-nums">{fechaHoraLabel}</p>
                                <p className="text-xs text-muted-foreground mt-2 break-words">
                                  Admin: {(it.adminName ?? it.adminUserId) || "—"}
                                  {it.adminEmail ? ` (${it.adminEmail})` : ""} · Usuario:{" "}
                                  {(it.affectedUserName ?? it.affectedUserId) || "—"}
                                  {it.affectedUserEmail ? ` (${it.affectedUserEmail})` : ""}
                                </p>
                                {detailLines.length > 0 ? (
                                  <ul className="mt-2 space-y-0.5 list-none text-xs text-foreground/90">
                                    {detailLines.map((line) => (
                                      <li key={line}>{line}</li>
                                    ))}
                                  </ul>
                                ) : null}
                              </div>
                            );
                                })}
                              </div>
                            </>
                          );
                        })()
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="users" className="min-w-0">
            {userRegisterOpen ? (
              <AdminRegisterUserForm
                showCard
                title="Registrar usuario"
                description="Mismo flujo que el registro público: datos de cuenta, foto opcional y rol del catálogo (cliente, asociado, central, admin, Soporte TI o roles personalizados)."
                onSuccess={() => {
                  closeUserRegister();
                  queryClient.invalidateQueries({ queryKey: ["admin-users"] });
                }}
                onCancel={closeUserRegister}
              />
            ) : (
            <Card className="min-w-0 overflow-hidden">
              <CardHeader className="p-4 sm:p-6 space-y-1 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-lg sm:text-xl">Gestión de Usuarios</CardTitle>
                  <CardDescription className="text-sm">Lista real de usuarios con filtros y paginación (10 por página)</CardDescription>
                </div>
                {canUsersCreate && (
                  <Button type="button" className="shrink-0" onClick={openUserRegister}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Registrar usuario
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4 min-w-0 p-4 sm:p-6 pt-0">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                    className="flex w-full items-center justify-center gap-2 sm:w-auto"
                  >
                    <Search className="h-4 w-4 shrink-0" />
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
                    <div className="space-y-3">
                      {usersList.map((u: { id: string; name?: string; lastName?: string; email?: string; role?: string; createdAt?: string }) => (
                        <div
                          key={u.id}
                          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar className="h-10 w-10 shrink-0">
                              <AvatarFallback>{(u.name || u.email || "?")[0]}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">
                                {[u.name, u.lastName].filter(Boolean).join(" ") || "—"}
                              </p>
                              <p className="text-sm text-muted-foreground truncate">{u.email ?? "—"}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end sm:gap-3">
                            <Badge
                              variant={hasAdminRole({ role: u.role }) ? "default" : "secondary"}
                              className="max-w-full truncate"
                            >
                              {u.role ?? "—"}
                            </Badge>
                            <p className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap tabular-nums">
                              {u.createdAt && isValidDate(u.createdAt)
                                ? toDate(u.createdAt).toLocaleDateString()
                                : "—"}
                            </p>
                            {canUsersEdit && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="shrink-0"
                                onClick={() => void handleEditUserClick(u)}
                              >
                                Editar
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Total: {usersTotal} usuario{usersTotal !== 1 ? "s" : ""} · Página {userPage} de {usersTotalPages}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 sm:flex-none"
                          disabled={userPage <= 1}
                          onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Anterior
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 sm:flex-none"
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
            )}
          </TabsContent>

          <TabsContent value="providers">
            <Card>
              <CardHeader>
                <CardTitle>Asociados con servicios activos</CardTitle>
                <CardDescription>Una fila por asociado; sus fichas activas agrupadas por marca</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div className="sm:col-span-2">
                    <Label>Buscar</Label>
                    <Input
                      placeholder="Asociado, servicio o correo…"
                      value={activeServicesSearch}
                      onChange={(e) => {
                        setProvidersPage(1);
                        setActiveServicesSearch(e.target.value);
                      }}
                    />
                  </div>
                  <div>
                    <Label>Marca</Label>
                    <Select
                      value={activeServicesBrandSlug || "all"}
                      onValueChange={(v) => {
                        setProvidersPage(1);
                        setActiveServicesBrandSlug(v === "all" ? "" : v);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {ADMIN_PROVIDER_LIST_BRAND_FILTERS.filter((f) => f.id).map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {adminActiveServicesLoading ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">Cargando asociados…</div>
                ) : activeProviderRows.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">No hay asociados que coincidan con el filtro.</div>
                ) : (
                  <div className="space-y-4">
                    {(() => {
                      const pageSize = USERS_PAGE_SIZE;
                      const providerList: AdminActiveProviderRow[] = activeProviderRows;
                      const totalPages = Math.max(1, Math.ceil(providerList.length / pageSize));
                      const safePage = Math.min(totalPages, Math.max(1, providersPage));
                      const start = (safePage - 1) * pageSize;
                      const end = start + pageSize;
                      const paged = providerList.slice(start, end);

                      return (
                        <>
                          <div className="space-y-4">
                            {paged.map((p) => (
                              <div
                                key={p.providerId}
                                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border border-border rounded-lg bg-card"
                              >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <Avatar>
                                    <AvatarFallback>{(p.userName || p.userEmail || "A")[0] ?? "A"}</AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium truncate">{p.userName || "—"}</p>
                                    <p className="text-xs text-muted-foreground truncate">{p.userEmail || "—"}</p>
                                    {p.providerProfession ? (
                                      <p className="text-xs text-muted-foreground truncate">{p.providerProfession}</p>
                                    ) : null}
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                      {p.services.map((svc) => (
                                        <Badge key={svc.id} variant="outline" className="text-xs font-normal max-w-full truncate">
                                          {svc.categoryDisplayName ? `${svc.categoryDisplayName}: ` : ""}
                                          {svc.title || "Servicio"}
                                        </Badge>
                                      ))}
                                    </div>
                                    {(p.goBrandLabels.length > 0 || p.hasVehicle) && (
                                      <p className="text-xs text-muted-foreground mt-1.5">
                                        Go:{" "}
                                        {p.goBrandLabels.length > 0
                                          ? p.goBrandLabels.join(" · ")
                                          : p.hasVehicle
                                            ? "Car Go (vehículo registrado)"
                                            : ""}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 sm:gap-4 justify-between sm:justify-end">
                                  <Badge variant={p.providerVerified ? "default" : "secondary"}>
                                    {p.providerVerified ? "Asociado verificado" : "Asociado no verificado"}
                                  </Badge>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setProviderDocsFetchId(p.providerId);
                                      setAssocImageDialog({
                                        open: true,
                                        userId: p.userId,
                                        revieweeName: p.userName?.trim() || "—",
                                        slides: [],
                                        initialIndex: 0,
                                      });
                                    }}
                                  >
                                    <FileText className="h-3.5 w-3.5 mr-1" />
                                    Ver documentos
                                  </Button>
                                  <Button size="sm" variant="default" asChild>
                                    <Link
                                      href={`/admin/providers/${p.providerId}?return=${encodeURIComponent("/admin?tab=providers")}`}
                                    >
                                      Editar
                                    </Link>
                                  </Button>
                                  {canUsersEdit && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => openEditUserModal(p.userId)}
                                    >
                                      Usuario
                                    </Button>
                                  )}
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

          <TabsContent value="services">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="min-w-0">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-1.5"
                  >
                    <CardTitle>Servicios (marcas)</CardTitle>
                    <CardDescription>
                      Activa o desactiva qué marcas de servicios se muestran en la app. Solo administración.
                    </CardDescription>
                  </motion.div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={seedBaseCategoriesMutation.isPending}
                    onClick={() => seedBaseCategoriesMutation.mutate()}
                  >
                    {seedBaseCategoriesMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sincronizando…
                      </>
                    ) : (
                      "Sincronizar categorías base"
                    )}
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {serviceBrandsLoading ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">Cargando marcas…</div>
                  ) : serviceBrands.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">No hay marcas disponibles.</div>
                  ) : (
                    <div className="space-y-2">
                      {serviceBrands.map((b) => {
                        // “Activa/Inactiva” debe reflejar si la marca está habilitada en la app (chips Fix/Man/Pro).
                        // Pack/Shop/Car se muestran aquí aunque estén ocultas en UI pública.
                        const isBrandActive = !b.uiHidden;
                        const selected = selectedBrandCategoryId === b.categoryId;
                        const isPulsing = pulseBrandId === b.categoryId;
                        const isBusy = toggleBrandMutation.isPending && brandConfirmAction?.categoryId === b.categoryId;
                        return (
                          <motion.div
                            key={b.categoryId}
                            layout
                            initial={false}
                            animate={
                              isPulsing
                                ? { scale: 1.01, boxShadow: "0 0 0 6px rgba(249,115,22,0.12)" }
                                : { scale: 1, boxShadow: "0 0 0 0px rgba(249,115,22,0)" }
                            }
                            transition={{ type: "spring", stiffness: 280, damping: 22 }}
                            className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 border border-border rounded-lg bg-card transition-colors ${
                              selected ? "border-primary/40 bg-primary/5" : ""
                            } ${isBusy ? "opacity-80" : ""}`}
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold truncate">{b.displayName || b.name}</p>
                                <Badge variant={isBrandActive ? "default" : "secondary"}>
                                  {isBrandActive ? "Activa" : "Inactiva"}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Servicios: {b.activeServices} activos · {b.inactiveServices} inactivos · {b.totalServices} total
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2 sm:justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedBrandCategoryId(b.categoryId);
                                }}
                              >
                                Ver usuarios
                              </Button>
                              {isBrandActive ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600"
                                  disabled={toggleBrandMutation.isPending}
                                  onClick={() => {
                                    setBrandConfirmAction({ categoryId: b.categoryId, brandName: b.displayName || b.name, nextActive: false });
                                    setBrandConfirmOpen(true);
                                  }}
                                >
                                  {isBusy ? (
                                    <>
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      Desactivando…
                                    </>
                                  ) : (
                                    "Desactivar servicio"
                                  )}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-green-600"
                                  disabled={toggleBrandMutation.isPending}
                                  onClick={() => {
                                    setBrandConfirmAction({ categoryId: b.categoryId, brandName: b.displayName || b.name, nextActive: true });
                                    setBrandConfirmOpen(true);
                                  }}
                                >
                                  {isBusy ? (
                                    <>
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      Activando…
                                    </>
                                  ) : (
                                    "Activar servicio"
                                  )}
                                </Button>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle>
                    {selectedBrand ? `Usuarios de ${selectedBrand.displayName || selectedBrand.name}` : "Usuarios por marca"}
                  </CardTitle>
                  <CardDescription>
                    {selectedBrandCategoryId == null
                      ? "Selecciona una marca para ver sus usuarios."
                      : "Filtra por nombre/correo y estrellas. El botón Activar/Desactivar aplica al servicio del asociado (no a su cuenta)."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedBrandCategoryId != null && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <Label>Buscar</Label>
                        <Input
                          placeholder="Nombre o correo…"
                          value={brandProviderSearch}
                          onChange={(e) => setBrandProviderSearch(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Ordenar</Label>
                        <Select value={brandProviderSort} onValueChange={(v) => setBrandProviderSort(v as any)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="rating_desc">Estrellas ↓</SelectItem>
                            <SelectItem value="rating_asc">Estrellas ↑</SelectItem>
                            <SelectItem value="name_asc">Nombre A–Z</SelectItem>
                            <SelectItem value="active_desc">Activos primero</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-3">
                        <Label>Subcategoría</Label>
                        <Popover
                          open={brandProviderSubcategoryOpen}
                          onOpenChange={setBrandProviderSubcategoryOpen}
                          modal={false}
                        >
                          <PopoverAnchor asChild>
                            <Button
                              type="button"
                              variant="outline"
                              role="combobox"
                              aria-expanded={brandProviderSubcategoryOpen}
                              className={cn("w-full justify-between font-normal", "text-left")}
                              onClick={() => setBrandProviderSubcategoryOpen(true)}
                            >
                              <span className={cn("truncate", !brandProviderSubcategoryId && "text-foreground")}>
                                {brandProviderSubcategoryName}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
                            </Button>
                          </PopoverAnchor>
                          <PopoverContent
                            className="w-[var(--radix-popover-trigger-width)] min-w-[min(100vw-2rem,22rem)] p-0"
                            align="start"
                            onOpenAutoFocus={(e) => e.preventDefault()}
                          >
                            <Command shouldFilter={false}>
                              <CommandInput
                                placeholder="Buscar subcategoría…"
                                value={brandProviderSubcategoryQuery}
                                onValueChange={setBrandProviderSubcategoryQuery}
                              />
                              <CommandList>
                                <CommandEmpty>Sin resultados.</CommandEmpty>
                                <CommandGroup>
                                  <CommandItem
                                    value="__all__"
                                    onSelect={() => {
                                      setBrandProviderSubcategoryId("");
                                      setBrandProviderSubcategoryOpen(false);
                                    }}
                                  >
                                    <Check className={cn("mr-2 h-4 w-4", !brandProviderSubcategoryId ? "opacity-100" : "opacity-0")} />
                                    Todas
                                  </CommandItem>
                                  {brandSubcategoriesDisplayed.map((s) => (
                                    <CommandItem
                                      key={s.id}
                                      value={String(s.id)}
                                      onSelect={() => {
                                        setBrandProviderSubcategoryId(String(s.id));
                                        setBrandProviderSubcategoryOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          brandProviderSubcategoryId === String(s.id) ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      <span className="truncate">{s.name}</span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="sm:col-span-3">
                        <Label>Mínimo de estrellas: {brandProviderMinRating}</Label>
                        <Slider
                          value={[brandProviderMinRating]}
                          min={0}
                          max={5}
                          step={1}
                          onValueChange={(v) => setBrandProviderMinRating(v[0] ?? 0)}
                        />
                      </div>
                    </div>
                  )}

                  {selectedBrandCategoryId == null ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">Selecciona una marca para continuar.</div>
                  ) : brandProvidersLoading ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">Cargando usuarios…</div>
                  ) : brandProviders.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">No hay usuarios con esos filtros.</div>
                  ) : (
                    <div className="space-y-2">
                      {brandProviders.map((p) => {
                        const isActive = p.activeServices > 0;
                        const isPulsing = pulseProviderId === p.providerId;
                        const isBusy =
                          toggleProviderServicesMutation.isPending && providerConfirmAction?.providerId === p.providerId;
                        return (
                          <motion.div
                            key={p.providerId}
                            layout
                            initial={false}
                            animate={
                              isPulsing
                                ? { scale: 1.01, boxShadow: "0 0 0 6px rgba(249,115,22,0.12)" }
                                : { scale: 1, boxShadow: "0 0 0 0px rgba(249,115,22,0)" }
                            }
                            transition={{ type: "spring", stiffness: 280, damping: 22 }}
                            className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 border border-border rounded-lg bg-card ${
                              isBusy ? "opacity-80" : ""
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback className="text-xs">{p.name?.[0] ?? "U"}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{p.name}</p>
                                  <p className="text-xs text-muted-foreground truncate">{p.email ?? "—"}</p>
                                </div>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-1">
                                  <Star className="h-4 w-4 text-yellow-500" />
                                  <span className="text-sm font-medium">{Number(p.rating ?? 5).toFixed(1)}</span>
                                  <span className="text-xs text-muted-foreground">({p.ratingCount ?? 0})</span>
                                </div>
                                <Badge variant={p.verified ? "default" : "secondary"}>
                                  {p.verified ? "Verificado" : "No verificado"}
                                </Badge>
                                <Badge variant={isActive ? "default" : "secondary"}>
                                  {isActive ? "Activo" : "Inactivo"}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {p.activeServices} activos · {p.inactiveServices} inactivos
                                </span>
                              </div>
                            </div>

                            <div className="flex gap-2 sm:justify-end">
                              {isActive ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600"
                                  disabled={toggleProviderServicesMutation.isPending}
                                  onClick={() => {
                                    setProviderConfirmAction({ providerId: p.providerId, name: p.name, nextActive: false });
                                    setProviderConfirmOpen(true);
                                  }}
                                >
                                  {isBusy ? (
                                    <>
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      Desactivando…
                                    </>
                                  ) : (
                                    "Desactivar servicio"
                                  )}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-green-600"
                                  disabled={toggleProviderServicesMutation.isPending}
                                  onClick={() => {
                                    setProviderConfirmAction({ providerId: p.providerId, name: p.name, nextActive: true });
                                    setProviderConfirmOpen(true);
                                  }}
                                >
                                  {isBusy ? (
                                    <>
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      Activando…
                                    </>
                                  ) : (
                                    "Activar servicio"
                                  )}
                                </Button>
                              )}
                              <Button size="sm" variant="outline" asChild>
                                <Link href={`/admin/users/${p.userId}/edit`}>Ver perfil</Link>
                              </Button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Visibilidad por rol</CardTitle>
                <CardDescription>
                  Oculta marcas activas para un rol específico (no afecta a <strong>admin</strong>). Ejemplo: que{" "}
                  <strong>Soporte TI</strong> no vea <strong>Delivery / Shop Go / Servicio de Taxi</strong>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div className="md:col-span-1">
                    <Label>Rol</Label>
                    <Select value={roleHideRole} onValueChange={(v) => setRoleHideRole(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roles
                          .filter((r) => r.code !== "admin")
                          .map((r) => (
                            <SelectItem key={String(r.code)} value={String(r.code)}>
                              {String(r.name ?? r.code)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2 flex flex-wrap gap-2 justify-start md:justify-end">
                    <Button
                      type="button"
                      className="bg-primary hover:bg-primary/90"
                      disabled={patchRoleVisibilityMutation.isPending}
                      onClick={() => {
                        setRoleHidePending({ role: roleHideRole, hiddenSlugs: roleHideSlugsDraft });
                        setRoleHideConfirmOpen(true);
                      }}
                    >
                      {patchRoleVisibilityMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Guardando…
                        </>
                      ) : (
                        "Guardar"
                      )}
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
                  <p className="text-xs text-muted-foreground mb-3">
                    Marca lo que quieres ocultar para el rol seleccionado. Si desmarcas todo, ese rol vuelve a ver todas las marcas permitidas globalmente.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {DEFAULT_CATEGORIES.map((c) => {
                      const checked = roleHideSlugsDraft.includes(c.slug);
                      const label = getCategoryDisplayName(c as any);
                      return (
                        <label key={c.slug} className="flex items-start gap-3 rounded-md border border-border/60 bg-card px-3 py-2">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 accent-primary"
                            checked={checked}
                            onChange={(e) => {
                              const on = e.target.checked;
                              setRoleHideSlugsDraft((prev) => {
                                const set = new Set(prev);
                                if (on) set.add(c.slug);
                                else set.delete(c.slug);
                                return Array.from(set);
                              });
                            }}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{label}</p>
                            <p className="text-[11px] text-muted-foreground truncate">slug: {c.slug}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
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

                        const edits = bookingEdits[id] ?? {};
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
                              <div className="flex flex-col items-end shrink-0">
                                <Badge variant={badgeVariant}>{statusLabel(String(b.status ?? ""))}</Badge>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                          <Tabs
                            value={bookingSubTab}
                            onValueChange={(v) => {
                              setBookingSubTab(v as "pending" | "in_progress" | "ready" | "history");
                            }}
                            className="w-full"
                          >
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
                            const pageSize = BOOKINGS_PAGE_SIZE;
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
                                <div className="flex flex-col gap-3 border-t pt-4 mt-4 sm:flex-row sm:items-center sm:justify-between">
                                  <p className="text-xs sm:text-sm text-muted-foreground">
                                    {activeList.length} reserva{activeList.length !== 1 ? "s" : ""} · Página{" "}
                                    {safePage} de {totalPages}
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="flex-1 sm:flex-none"
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
                                      className="flex-1 sm:flex-none"
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
                            Esto puede afectar el flujo normal del servicio si cambias estados como «Completada» o «Cancelada».
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

            <AdminCargoGoRidesPanel enabled={canPanel && canBookings && activeTab === "bookings"} />
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

          <TabsContent value="categories">
            <AdminCategoriesTab />
          </TabsContent>

          {canRolesTab && (
            <TabsContent value="roles">
              <AdminRolesPanel />
            </TabsContent>
          )}

          <TabsContent value="settings">
            <div className="grid grid-cols-1 gap-6">
              <Card className="border-border bg-card shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    Suscripción mensual por categoría
                  </CardTitle>
                  <CardDescription>
                    Define cuánto cuesta la mensualidad de visibilidad (USD) para cada categoría (Man Go, Car Go, Marketplace, Pro Go).
                    Delivery usa la misma tarifa que Car Go.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!fullAdmin ? (
                    <p className="text-sm text-muted-foreground">Solo administrador puede editar mensualidades.</p>
                  ) : serviceBrandsLoading && serviceBrands.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Cargando estado de servicios…</p>
                  ) : visibleSubscriptionFeeSlugs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No hay categorías activas en Servicios. Activa una marca en la pestaña Servicios para configurar su mensualidad aquí.
                    </p>
                  ) : (
                    <>
                      {visibleSubscriptionFeeSlugs.length < SUBSCRIPTION_FEE_ADMIN_SLUGS.length ? (
                        <p className="text-xs text-muted-foreground">
                          Las mensualidades de servicios desactivados en la pestaña Servicios no se muestran aquí; la tarifa guardada no se modifica.
                        </p>
                      ) : null}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {visibleSubscriptionFeeSlugs.map((slug) => {
                            const label = subscriptionFeeAdminLabel(slug);
                            const hint = subscriptionFeeAdminHint(slug);
                            const v = subscriptionFeesDraft?.[slug];
                            return (
                              <div key={slug} className="rounded-xl border border-border bg-muted/20 p-4">
                                <p className="font-semibold text-foreground">{label}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">Slug: {slug}</p>
                                {hint ? (
                                  <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
                                ) : null}
                                <div className="mt-3 space-y-1">
                                  <Label>Mensualidad (USD)</Label>
                                  <Input
                                    inputMode="decimal"
                                    value={usdAmountInputDisplay(v)}
                                    placeholder="15"
                                    onChange={(e) => {
                                      const sanitized = sanitizeDecimalUsdInput(e.target.value);
                                      setSubscriptionFeesDraft((prev) => {
                                        const next = { ...(prev ?? {}) };
                                        if (sanitized === "") delete next[slug];
                                        else {
                                          const n = parseDecimalUsdInputToNumber(sanitized);
                                          if (n !== undefined) next[slug] = n;
                                          else if (isTrailingDecimalUsdIncomplete(sanitized)) next[slug] = sanitized;
                                        }
                                        return next;
                                      });
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={patchSubscriptionFees.isPending || !subscriptionFeesDraft}
                          onClick={async () => {
                            if (!subscriptionFeesDraft) return;
                            try {
                              const serverMap = (subscriptionFees as any)?.feesBySlug as
                                | Record<string, number>
                                | undefined;
                              const feesBySlug: Record<string, number> = {};
                              for (const sl of SUBSCRIPTION_FEE_ADMIN_SLUGS) {
                                const raw = subscriptionFeesDraft[sl];
                                const n = coerceUsdDraftValueToNumber(raw);
                                feesBySlug[sl] = n !== undefined
                                  ? n
                                  : Number.isFinite(Number(serverMap?.[sl]))
                                    ? Number(serverMap![sl])
                                    : 15;
                              }
                              await patchSubscriptionFees.mutateAsync(feesBySlug);
                              toast({ title: "Guardado", description: "Mensualidades por categoría actualizadas." });
                            } catch (e) {
                              toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar", variant: "destructive" });
                            }
                          }}
                        >
                          Guardar mensualidades
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!subscriptionFeesDraft}
                          onClick={() => setSubscriptionFeesDraft({})}
                        >
                          Resetear a default (15)
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Si una categoría no tiene valor, se usa <strong className="text-foreground">15 USD</strong> por defecto.
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border bg-card shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    Movilidad (Taxi y Delivery)
                  </CardTitle>
                  <CardDescription>
                    Configura tarifas de referencia (base y por kilómetro) para Taxi y Delivery.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {!fullAdmin ? (
                    <p className="text-sm text-muted-foreground">Solo administrador puede editar tarifas.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <div className="rounded-xl border border-border bg-muted/20 p-4">
                          <p className="font-semibold text-foreground">Taxi (movilidad)</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Auto: base día/noche + por km · Moto/Camioneta: base + por km. Pet Car suma un extra.
                          </p>
                          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label>Auto · Base día</Label>
                              <Input
                                value={usdAmountInputDisplay(mobilityFaresDraft?.auto?.baseDayUsd)}
                                onChange={(e) => patchMobilityFareField(setMobilityFaresDraft, "auto", "baseDayUsd", e.target.value)}
                                inputMode="decimal"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Auto · Base noche</Label>
                              <Input
                                value={usdAmountInputDisplay(mobilityFaresDraft?.auto?.baseNightUsd)}
                                onChange={(e) => patchMobilityFareField(setMobilityFaresDraft, "auto", "baseNightUsd", e.target.value)}
                                inputMode="decimal"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Auto · USD por km</Label>
                              <Input
                                value={usdAmountInputDisplay(mobilityFaresDraft?.auto?.perKmUsd)}
                                onChange={(e) => patchMobilityFareField(setMobilityFaresDraft, "auto", "perKmUsd", e.target.value)}
                                inputMode="decimal"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Pet Car · Extra</Label>
                              <Input
                                value={usdAmountInputDisplay(mobilityFaresDraft?.auto?.petExtraUsd)}
                                onChange={(e) => patchMobilityFareField(setMobilityFaresDraft, "auto", "petExtraUsd", e.target.value)}
                                inputMode="decimal"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Moto · Base</Label>
                              <Input
                                value={usdAmountInputDisplay(mobilityFaresDraft?.moto?.baseUsd)}
                                onChange={(e) => patchMobilityFareField(setMobilityFaresDraft, "moto", "baseUsd", e.target.value)}
                                inputMode="decimal"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Moto · USD por km</Label>
                              <Input
                                value={usdAmountInputDisplay(mobilityFaresDraft?.moto?.perKmUsd)}
                                onChange={(e) => patchMobilityFareField(setMobilityFaresDraft, "moto", "perKmUsd", e.target.value)}
                                inputMode="decimal"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Camioneta · Base</Label>
                              <Input
                                value={usdAmountInputDisplay(mobilityFaresDraft?.camioneta?.baseUsd)}
                                onChange={(e) => patchMobilityFareField(setMobilityFaresDraft, "camioneta", "baseUsd", e.target.value)}
                                inputMode="decimal"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Camioneta · USD por km</Label>
                              <Input
                                value={usdAmountInputDisplay(mobilityFaresDraft?.camioneta?.perKmUsd)}
                                onChange={(e) => patchMobilityFareField(setMobilityFaresDraft, "camioneta", "perKmUsd", e.target.value)}
                                inputMode="decimal"
                              />
                            </div>
                          </div>
                          <div className="mt-4">
                            <Button
                              disabled={patchMobilityFares.isPending || !mobilityFaresDraft}
                              onClick={async () => {
                                try {
                                  await patchMobilityFares.mutateAsync(
                                    mergeMobilityDraftForPatch(mobilityFaresDraft, (mobilityFares as any)?.fares)
                                  );
                                  toast({ title: "Guardado", description: "Tarifas de Taxi actualizadas." });
                                } catch (e) {
                                  toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar", variant: "destructive" });
                                }
                              }}
                            >
                              Guardar Taxi
                            </Button>
                          </div>
                        </div>

                        <div className="rounded-xl border border-border bg-muted/20 p-4">
                          <p className="font-semibold text-foreground">Delivery</p>
                          <p className="mt-1 text-sm text-muted-foreground">Base + por km por tipo de vehículo.</p>
                          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label>Moto · Base</Label>
                              <Input
                                value={usdAmountInputDisplay(packFaresDraft?.moto?.baseUsd)}
                                onChange={(e) => patchPackFareField(setPackFaresDraft, "moto", "baseUsd", e.target.value)}
                                inputMode="decimal"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Moto · USD por km</Label>
                              <Input
                                value={usdAmountInputDisplay(packFaresDraft?.moto?.perKmUsd)}
                                onChange={(e) => patchPackFareField(setPackFaresDraft, "moto", "perKmUsd", e.target.value)}
                                inputMode="decimal"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Auto · Base</Label>
                              <Input
                                value={usdAmountInputDisplay(packFaresDraft?.auto?.baseUsd)}
                                onChange={(e) => patchPackFareField(setPackFaresDraft, "auto", "baseUsd", e.target.value)}
                                inputMode="decimal"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Auto · USD por km</Label>
                              <Input
                                value={usdAmountInputDisplay(packFaresDraft?.auto?.perKmUsd)}
                                onChange={(e) => patchPackFareField(setPackFaresDraft, "auto", "perKmUsd", e.target.value)}
                                inputMode="decimal"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Camioneta · Base</Label>
                              <Input
                                value={usdAmountInputDisplay(packFaresDraft?.camioneta?.baseUsd)}
                                onChange={(e) => patchPackFareField(setPackFaresDraft, "camioneta", "baseUsd", e.target.value)}
                                inputMode="decimal"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Camioneta · USD por km</Label>
                              <Input
                                value={usdAmountInputDisplay(packFaresDraft?.camioneta?.perKmUsd)}
                                onChange={(e) => patchPackFareField(setPackFaresDraft, "camioneta", "perKmUsd", e.target.value)}
                                inputMode="decimal"
                              />
                            </div>
                          </div>
                          <div className="mt-4">
                            <Button
                              disabled={patchPackFares.isPending || !packFaresDraft}
                              onClick={async () => {
                                try {
                                  await patchPackFares.mutateAsync(
                                    mergePackDraftForPatch(packFaresDraft, (packFares as any)?.fares)
                                  );
                                  toast({ title: "Guardado", description: "Tarifas de Delivery actualizadas." });
                                } catch (e) {
                                  toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar", variant: "destructive" });
                                }
                              }}
                            >
                              Guardar Delivery
                            </Button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <AdminVerificationDocumentDialog
          key={assocImageDialog.open ? assocImageDialog.userId : "closed"}
          open={assocImageDialog.open}
          onOpenChange={(o) => {
            setAssocImageDialog((s) => ({ ...s, open: o }));
            if (!o) setProviderDocsFetchId(null);
          }}
          userId={assocImageDialog.userId}
          revieweeName={assocImageDialog.revieweeName}
          slides={assocImageDialog.slides}
          initialIndex={assocImageDialog.initialIndex}
          loading={providerDocsFetchId != null && providerDocsLoading}
        />

        <Dialog
          open={rejectModal.open}
          onOpenChange={(o) => {
            if (!o) setRejectModal({ open: false, userId: "", userName: "", step: "transaction", reason: "" });
          }}
        >
          <DialogContent className="sm:max-w-lg border-border bg-card text-foreground">
            <DialogHeader>
              <DialogTitle>
                {rejectModal.step === "transaction"
                  ? "Rechazar suscripción"
                  : rejectModal.step === "identification"
                    ? "Rechazar identificación"
                    : "Rechazar cambio de datos"}
              </DialogTitle>
              <DialogDescription>
                Este motivo se enviará al usuario en la notificación. Sé claro y específico.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Usuario: <span className="font-medium text-foreground">{rejectModal.userName || rejectModal.userId}</span>
              </p>
              <div className="space-y-2">
                <Label>Motivo del rechazo</Label>
                <Textarea
                  value={rejectModal.reason}
                  onChange={(e) => setRejectModal((s) => ({ ...s, reason: e.target.value }))}
                  placeholder="Ej: El comprobante no coincide con la fecha / La foto del documento está borrosa / Falta el lado posterior, etc."
                  className="min-h-[120px]"
                />
                <p className="text-xs text-muted-foreground">
                  Mínimo 3 caracteres. Evita datos sensibles.
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRejectModal({ open: false, userId: "", userName: "", step: "transaction", reason: "" })}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={
                  (rejectModal.step === "account_change"
                    ? resolveAccountChangeRequestMutation.isPending
                    : updateVerifyingStatusMutation.isPending) || rejectModal.reason.trim().length < 3
                }
                onClick={() => {
                  const reason = rejectModal.reason.trim();
                  const userId = rejectModal.userId;
                  const step = rejectModal.step;
                  const requestId = rejectModal.requestId;
                  setRejectModal({ open: false, userId: "", userName: "", step: "transaction", reason: "" });
                  if (step === "account_change") {
                    if (typeof requestId === "number" && requestId > 0) {
                      resolveAccountChangeRequestMutation.mutate({ id: requestId, action: "reject", reason });
                    } else {
                      toast({ title: "Error", description: "No se encontró el id de la petición.", variant: "destructive" });
                    }
                    return;
                  }
                  updateVerifyingStatusMutation.mutate({ userId, step, action: "reject", reason });
                }}
              >
                Rechazar y notificar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={commissionEditOpen} onOpenChange={setCommissionEditOpen}>
          <DialogContent className="sm:max-w-md border-border bg-card text-foreground">
            <DialogHeader>
              <DialogTitle>Comisión de plataforma</DialogTitle>
              <DialogDescription>
                Porcentaje que retiene Applia sobre el monto acordado cuando el cliente completa el pago y el servicio se marca como finalizado (entre 1% y 50%).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-2">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="commission-slider" className="text-sm font-medium">
                    Retención plataforma
                  </Label>
                  <span className="text-lg font-bold tabular-nums text-primary">{commissionDraftPercent}%</span>
                </div>
                <Slider
                  id="commission-slider"
                  min={1}
                  max={50}
                  step={1}
                  value={[commissionDraftPercent]}
                  onValueChange={(v) => setCommissionDraftPercent(v[0] ?? 10)}
                  className="w-full"
                />
                <p className="text-sm text-muted-foreground">
                  El asociado recibirá <strong className="text-foreground">{100 - commissionDraftPercent}%</strong> en cada
                  liquidación (después de comisión).
                </p>
              </div>
            </div>
            <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setCommissionEditOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                className="w-full sm:w-auto bg-primary hover:bg-primary/90"
                onClick={() => {
                  const p = Math.min(50, Math.max(1, Math.round(commissionDraftPercent)));
                  setCommissionPendingPercent(p);
                  setCommissionEditOpen(false);
                  setCommissionConfirmOpen(true);
                }}
              >
                Revisar y confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirmación: Activar/Desactivar marca */}
        <AlertDialog
          open={brandConfirmOpen}
          onOpenChange={(o) => {
            setBrandConfirmOpen(o);
            if (!o) setBrandConfirmAction(null);
          }}
        >
          <AlertDialogContent className="border-border bg-card text-foreground">
            <AlertDialogHeader>
              <AlertDialogTitle>¿Estás seguro de esta acción?</AlertDialogTitle>
              <AlertDialogDescription>
                {brandConfirmAction ? (
                  <>
                    Vas a <strong>{brandConfirmAction.nextActive ? "activar" : "desactivar"}</strong> la marca{" "}
                    <strong>{brandConfirmAction.brandName}</strong>. Esto afectará qué marcas aparecen como activas en la app.
                  </>
                ) : (
                  "Confirma la acción para continuar."
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-border">Cancelar</AlertDialogCancel>
              <Button
                variant="default"
                className="bg-primary hover:bg-primary/90"
                disabled={!brandConfirmAction || toggleBrandMutation.isPending}
                onClick={() => {
                  if (!brandConfirmAction) return;
                  setBrandConfirmOpen(false);
                  toggleBrandMutation.mutate({ categoryId: brandConfirmAction.categoryId, isActive: brandConfirmAction.nextActive });
                }}
              >
                {toggleBrandMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Aplicando…
                  </>
                ) : (
                  "Confirmar"
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Confirmación: Activar/Desactivar asociado */}
        <AlertDialog
          open={providerConfirmOpen}
          onOpenChange={(o) => {
            setProviderConfirmOpen(o);
            if (!o) setProviderConfirmAction(null);
          }}
        >
          <AlertDialogContent className="border-border bg-card text-foreground">
            <AlertDialogHeader>
              <AlertDialogTitle>¿Estás seguro de esta acción?</AlertDialogTitle>
              <AlertDialogDescription>
                {providerConfirmAction ? (
                  <>
                    Vas a <strong>{providerConfirmAction.nextActive ? "activar" : "desactivar"}</strong> al asociado{" "}
                    <strong>{providerConfirmAction.name}</strong>. Esto activará/desactivará sus servicios.
                  </>
                ) : (
                  "Confirma la acción para continuar."
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-border">Cancelar</AlertDialogCancel>
              <Button
                variant="default"
                className="bg-primary hover:bg-primary/90"
                disabled={!providerConfirmAction || toggleProviderServicesMutation.isPending}
                onClick={() => {
                  if (!providerConfirmAction) return;
                  setProviderConfirmOpen(false);
                  toggleProviderServicesMutation.mutate({
                    providerId: providerConfirmAction.providerId,
                    isActive: providerConfirmAction.nextActive,
                  });
                }}
              >
                {toggleProviderServicesMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Aplicando…
                  </>
                ) : (
                  "Confirmar"
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Confirmación: Guardar visibilidad por rol */}
        <AlertDialog
          open={roleHideConfirmOpen}
          onOpenChange={(o) => {
            setRoleHideConfirmOpen(o);
            if (!o) setRoleHidePending(null);
          }}
        >
          <AlertDialogContent className="border-border bg-card text-foreground">
            <AlertDialogHeader>
              <AlertDialogTitle>¿Confirmas estos cambios?</AlertDialogTitle>
              <AlertDialogDescription>
                {roleHidePending ? (
                  <>
                    Se actualizará la visibilidad de marcas para el rol <strong>{roleHidePending.role}</strong>.
                    <br />
                    Marcas ocultas:{" "}
                    <strong>{roleHidePending.hiddenSlugs.length > 0 ? roleHidePending.hiddenSlugs.join(", ") : "ninguna"}</strong>.
                  </>
                ) : (
                  "Confirma la acción para continuar."
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-border">Cancelar</AlertDialogCancel>
              <Button
                variant="default"
                className="bg-primary hover:bg-primary/90"
                disabled={!roleHidePending || patchRoleVisibilityMutation.isPending}
                onClick={() => {
                  if (!roleHidePending) return;
                  setRoleHideConfirmOpen(false);
                  patchRoleVisibilityMutation.mutate(roleHidePending);
                }}
              >
                {patchRoleVisibilityMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Guardando…
                  </>
                ) : (
                  "Confirmar"
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={commissionConfirmOpen}
          onOpenChange={(open) => {
            if (!open) {
              setCommissionConfirmOpen(false);
              setCommissionPendingPercent(null);
            }
          }}
        >
          <AlertDialogContent className="border-border bg-card text-foreground">
            <AlertDialogHeader>
              <AlertDialogTitle>¿Aplicar el nuevo porcentaje?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    La plataforma pasará a retener{" "}
                    <strong className="text-foreground">{commissionPendingPercent ?? "—"}%</strong> y el asociado recibirá{" "}
                    <strong className="text-foreground">
                      {commissionPendingPercent != null ? 100 - commissionPendingPercent : "—"}%
                    </strong>
                    .
                  </p>
                  <p>
                    Los movimientos y reservas ya liquidadas no se modifican; el cambio aplica a{" "}
                    <span className="font-medium text-foreground">nuevas finalizaciones</span> de servicio.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-border">Volver</AlertDialogCancel>
              <Button
                className="bg-primary hover:bg-primary/90"
                disabled={patchPlatformCommission.isPending || commissionPendingPercent == null}
                onClick={async () => {
                  if (commissionPendingPercent == null) return;
                  try {
                    await patchPlatformCommission.mutateAsync(commissionPendingPercent);
                    toast({
                      title: "Comisión actualizada",
                      description: `Plataforma ${commissionPendingPercent}%, asociado ${100 - commissionPendingPercent}%.`,
                    });
                    setCommissionConfirmOpen(false);
                    setCommissionPendingPercent(null);
                  } catch (e) {
                    toast({
                      title: "No se pudo guardar",
                      description: e instanceof Error ? e.message : "Intenta de nuevo.",
                      variant: "destructive",
                    });
                  }
                }}
              >
                {patchPlatformCommission.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Guardando…
                  </>
                ) : (
                  "Sí, aplicar"
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AdminEditUserDialog
          open={editUserOpen}
          userId={editUserId}
          onOpenChange={(open) => {
            if (open) setEditUserOpen(true);
            else closeEditUserModal();
          }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
          }}
        />

      </div>
    </div>
  );
}

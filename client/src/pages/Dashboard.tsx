import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DollarSign,
  FileText,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Download,
  Filter,
  CheckCircle,
  Clock,
  XCircle,
  Receipt,
  Banknote,
  Settings,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useWalletTransfers, useCurrentProvider } from "@/hooks/use-mango-data";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { downloadInvoicePdf, getTransferTypeLabel } from "@/lib/invoice-pdf";
import { SubscriptionInvoicesPanel } from "@/components/subscription/SubscriptionInvoicesPanel";
import { SubscriptionInvoiceRow } from "@/components/subscription/SubscriptionInvoiceRow";
import type { SubscriptionInvoiceListItem } from "@shared/subscription-invoice";
import { useProviderSubscriptionMonthlyUsd } from "@/hooks/use-provider-subscription-monthly-usd";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { QuickSettingsPanel } from "@/components/settings/QuickSettingsPanel";
import {
  canAccessAssociateActivityDashboard,
  hasFullAdminRole,
} from "@/lib/auth-utils";
import { normalizeRoleCode } from "@shared/roles";
import { cn } from "@/lib/utils";

const SHOW_DASHBOARD_KPI_CARDS = false;
const SHOW_DASHBOARD_HEADER_ACTIONS = false;

/** Monto del único movimiento de activación de visibilidad de servicios en este panel. */
const ACTIVATION_VISIBILITY_USD = 15;

const ACTIVATION_MOVEMENT_LABEL = "Abono por activar servicios visibles";

/**
 * Historial de pago único: cargo de verificación / activación para que tus servicios sean visibles (cuota mensual).
 */
function isActivationVisibilityTransfer(t: {
  transferType?: string;
  amount?: unknown;
  description?: string | null;
}): boolean {
  const tt = String(t.transferType ?? "").toLowerCase();
  if (tt === "verification_fee") return true;
  const amt = typeof t.amount === "number" ? t.amount : parseFloat(String(t.amount ?? ""));
  if (!Number.isFinite(amt) || Math.abs(amt - ACTIVATION_VISIBILITY_USD) > 0.02) return false;
  const desc = (t.description ?? "").toLowerCase();
  return (
    desc.includes("verific") ||
    desc.includes("visibil") ||
    desc.includes("activ") ||
    tt.includes("verif")
  );
}

function movementDisplayLabel(t: { transferType?: string }): string {
  if (String(t.transferType ?? "").toLowerCase() === "verification_fee") return ACTIVATION_MOVEMENT_LABEL;
  return getTransferTypeLabel(String(t.transferType ?? ""));
}

export default function Dashboard() {
  const [timeRange, setTimeRange] = useState("6m");
  const [dashboardSettingsOpen, setDashboardSettingsOpen] = useState(false);
  const [locationPath, setLocation] = useLocation();

  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { data: providerProfile, isLoading: providerLoading } = useCurrentProvider();
  const { monthlyUsd } = useProviderSubscriptionMonthlyUsd({
    enabled: isAuthenticated && canAccessAssociateActivityDashboard(user, !!providerProfile),
  });

  const hasProvider =
    !!providerProfile || !!(user as { provider?: unknown } | null)?.provider;
  const allowed = canAccessAssociateActivityDashboard(user, hasProvider);

  const earlyAllowed =
    hasFullAdminRole(user ?? null) ||
    normalizeRoleCode(user?.role) === "professional" ||
    !!(user as { provider?: unknown } | null)?.provider;

  const stillResolving =
    isAuthenticated && !earlyAllowed && providerLoading;

  useEffect(() => {
    if (authLoading || stillResolving) return;
    if (isAuthenticated && !allowed) {
      setLocation("/");
    }
  }, [authLoading, stillResolving, isAuthenticated, allowed, setLocation]);

  const { data: kpis } = useQuery({
    queryKey: ["/api/reports/kpis", String(user?.id ?? "")],
    enabled: !!user?.id && allowed && isAuthenticated && SHOW_DASHBOARD_KPI_CARDS,
    retry: false,
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/reports/kpis", {
        headers: {
          "x-user-id": String(user?.id ?? ""),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudieron cargar KPIs");
      }
      return res.json() as Promise<{
        totalIncome: number;
        totalExpenses: number;
        completedServices: number;
        pendingBookings: number;
        activeClients?: number;
        monthlyGrowth?: number;
        averageRating?: number;
      }>;
    },
  });

  const formattedIncome = (() => {
    const n = Number(kpis?.totalIncome ?? 0);
    return `$${Math.round(n).toLocaleString("en-US")}`;
  })();

  const monthlyGrowth = Number(kpis?.monthlyGrowth ?? 0);
  const incomeChange =
    Number.isFinite(monthlyGrowth) && monthlyGrowth !== 0
      ? `${monthlyGrowth >= 0 ? "+" : ""}${monthlyGrowth.toFixed(1)}%`
      : undefined;
  const incomeTrend = monthlyGrowth >= 0 ? "up" : "down";

  const kpiCards: Array<{
    title: string;
    value: string;
    change?: string;
    trend?: "up" | "down";
    icon: typeof DollarSign;
    color: string;
    bgColor: string;
  }> = [
    {
      title: "Ingresos Totales",
      value: formattedIncome,
      change: incomeChange,
      trend: incomeTrend,
      icon: DollarSign,
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
    {
      title: "Servicios Completados",
      value: String(kpis?.completedServices ?? 0),
      icon: CheckCircle,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Pendientes",
      value: String(kpis?.pendingBookings ?? 0),
      icon: Clock,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
  ];

  const { data: walletTransfersData, isLoading: transfersLoading } = useWalletTransfers({
    page: 1,
    limit: 200,
    enabled: isAuthenticated && allowed,
  });

  const activationTransfers = useMemo(() => {
    const raw = walletTransfersData?.transfers ?? [];
    const filtered = raw.filter(isActivationVisibilityTransfer);
    return filtered.sort((a, b) => {
      const da = parseTransferDateForSort(a.createdAt)?.getTime() ?? 0;
      const db = parseTransferDateForSort(b.createdAt)?.getTime() ?? 0;
      return db - da;
    });
  }, [walletTransfersData?.transfers]);

  /** Misma fuente que el panel de asociados: facturas de suscripción / verificación (mensualidad). */
  const { data: invoiceList, isLoading: invoicesLoading } = useQuery({
    queryKey: ["/api/invoices", "list"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/invoices", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("No se pudieron cargar las facturas");
      return res.json() as Promise<SubscriptionInvoiceListItem[]>;
    },
    enabled: isAuthenticated && allowed,
  });

  const verificationInvoiceRows = useMemo(
    () => (Array.isArray(invoiceList) ? invoiceList : []).filter((inv) => inv.type === "verification"),
    [invoiceList],
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="badge-success">
            <CheckCircle className="mr-1 h-3 w-3" />
            Completado
          </Badge>
        );
      case "pending_approval":
        return (
          <Badge className="badge-warning">
            <Clock className="mr-1 h-3 w-3" />
            Pendiente
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="badge-danger">
            <XCircle className="mr-1 h-3 w-3" />
            Rechazado
          </Badge>
        );
      case "pending":
        return (
          <Badge className="badge-warning">
            <Clock className="mr-1 h-3 w-3" />
            Pendiente
          </Badge>
        );
      case "cancelled":
        return (
          <Badge className="badge-danger">
            <XCircle className="mr-1 h-3 w-3" />
            Cancelado
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat("es-EC", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);

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
    if (
      typeof value === "object" &&
      value !== null &&
      "toDate" in value &&
      typeof (value as { toDate: () => Date }).toDate === "function"
    ) {
      const d = (value as { toDate: () => Date }).toDate();
      return Number.isFinite(d.getTime()) ? d : null;
    }
    const d = new Date(String(value));
    return Number.isFinite(d.getTime()) ? d : null;
  }

  function parseTransferDateForSort(value: unknown): Date | null {
    return parseTransferDate(value);
  }

  const getTransferMeta = (t: any) => {
    const type = t.transferType as string | undefined;
    const status = t.status as "pending_approval" | "completed" | "rejected" | undefined;
    const isPending = status === "pending_approval";

    const isActivation = String(type ?? "").toLowerCase() === "verification_fee" || isActivationVisibilityTransfer(t);

    const isCredit =
      status === "completed" &&
      (type === "recharge" || type === "service_payment");
    const isDebit =
      status === "completed" && (type === "withdrawal" || type === "payment" || type === "verification_fee");

    let amountColor = "text-foreground";
    if (isPending) {
      amountColor = "text-muted-foreground";
    } else if (isActivation && status === "completed") {
      amountColor = "text-foreground";
    } else if (isCredit) {
      amountColor = "text-emerald-600";
    } else if (isDebit) {
      amountColor = "text-red-600";
    }

    const label = movementDisplayLabel(t);

    const createdAt = parseTransferDate(t.createdAt);
    const dateStr = createdAt ? format(createdAt, "dd MMM yyyy HH:mm", { locale: es }) : "";

    return { isCredit, isDebit, isPending, amountColor, label, dateStr };
  };


  if (authLoading || stillResolving) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto max-w-lg px-4 py-20 text-center">
        <p className="mb-4 text-muted-foreground">Inicia sesión para ver esta página.</p>
        <Button asChild>
          <Link href="/login">Iniciar sesión</Link>
        </Button>
      </div>
    );
  }

  if (!allowed) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <section className="border-b border-border bg-gradient-to-r from-primary/20 via-background to-accent/20">
        <div className="container mx-auto max-w-7xl px-3 min-[400px]:px-4 py-5 sm:py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
          >
            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold leading-tight min-[380px]:text-2xl sm:text-3xl">
                Mi <span className="text-gradient-primary">actividad</span>
              </h1>
              <p className="mt-1.5 text-sm leading-snug text-muted-foreground sm:text-base">
                Resumen, historial y factura del abono de USD {ACTIVATION_VISIBILITY_USD} para activar la visibilidad de
                tus servicios
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 md:justify-end">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 border-border"
                onClick={() => setDashboardSettingsOpen(true)}
                aria-label="Abrir configuración"
                title="Configuración"
              >
                <Settings className="h-5 w-5" aria-hidden />
              </Button>
              {SHOW_DASHBOARD_HEADER_ACTIONS && (
                <>
                  <Button variant="outline" className="border-primary/50 text-primary">
                    <Download className="mr-2 h-4 w-4" />
                    Exportar Reporte
                  </Button>
                  <Button className="bg-accent hover:bg-accent/90">
                    <CreditCard className="mr-2 h-4 w-4" />
                    Gestionar Pagos
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {SHOW_DASHBOARD_KPI_CARDS && (
        <section className="py-8">
          <div className="container mx-auto max-w-7xl px-4">
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
            >
              {kpiCards.map((kpi, index) => (
                <motion.div key={index} variants={itemVariants}>
                  <Card className="card-industrial transition-all duration-300 hover:border-primary/50">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className={`rounded-lg p-3 ${kpi.bgColor}`}>
                          <kpi.icon className={`h-6 w-6 ${kpi.color}`} />
                        </div>
                        {kpi.change ? (
                          <Badge
                            variant="outline"
                            className={
                              kpi.trend === "up"
                                ? "border-accent/50 text-accent"
                                : "border-warning/50 text-warning"
                            }
                          >
                            {kpi.trend === "up" ? (
                              <ArrowUpRight className="mr-1 h-3 w-3" />
                            ) : (
                              <ArrowDownRight className="mr-1 h-3 w-3" />
                            )}
                            {kpi.change}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-4">
                        <p className="font-display text-3xl font-bold">{kpi.value}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{kpi.title}</p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>
      )}

      <Sheet open={dashboardSettingsOpen} onOpenChange={setDashboardSettingsOpen}>
        <SheetContent side="right" className="w-full max-w-md overflow-y-auto sm:max-w-lg">
          <SheetHeader className="space-y-1.5 pr-8 text-left">
            <SheetTitle>Configuración</SheetTitle>
            <SheetDescription>Preferencias y accesos; sin salir del panel.</SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <QuickSettingsPanel
              returnPath={locationPath.startsWith("/") ? locationPath : "/dashboard"}
              onNavigate={() => setDashboardSettingsOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      <section className="py-4 pb-16 sm:py-6">
        <div className="container mx-auto min-w-0 max-w-7xl px-3 min-[400px]:px-4">
          <Tabs defaultValue="overview" className="space-y-4 sm:space-y-6">
            <div className="flex max-w-full min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div
                className="w-full min-w-0 -mx-0.5 overflow-x-auto overscroll-x-contain px-0.5 pb-1 touch-pan-x md:overflow-visible md:pb-0 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-track]:bg-muted/50 [&::-webkit-scrollbar]:h-1.5"
                role="region"
                aria-label="Pestañas del panel"
              >
                <TabsList className="inline-flex h-auto min-h-10 w-max max-w-none flex-nowrap gap-0.5 border border-border bg-card p-1">
                  <TabsTrigger
                    value="overview"
                    className="shrink-0 px-2.5 py-2 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-[380px]:text-sm sm:px-3"
                  >
                    <BarChart3 className="h-4 w-4 max-[420px]:hidden sm:mr-2" />
                    Resumen
                  </TabsTrigger>
                  <TabsTrigger
                    value="transactions"
                    className="shrink-0 px-2.5 py-2 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-[380px]:text-sm sm:px-3"
                  >
                    <Receipt className="h-4 w-4 max-[420px]:hidden sm:mr-2" />
                    Transacciones
                  </TabsTrigger>
                  <TabsTrigger
                    value="invoices"
                    className="shrink-0 px-2.5 py-2 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-[380px]:text-sm sm:px-3"
                  >
                    <FileText className="h-4 w-4 max-[420px]:hidden sm:mr-2" />
                    Facturas
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex w-full min-w-0 gap-2 md:w-auto md:shrink-0 md:justify-end">
                <Select value={timeRange} onValueChange={setTimeRange}>
                  <SelectTrigger className="input-industrial h-10 min-w-0 flex-1 text-left text-xs sm:flex-initial sm:text-sm md:w-[168px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">Últimos 7 días</SelectItem>
                    <SelectItem value="30d">Últimos 30 días</SelectItem>
                    <SelectItem value="6m">Últimos 6 meses</SelectItem>
                    <SelectItem value="1y">Último año</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" type="button" aria-label="Filtros (próximamente)">
                  <Filter className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-1">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <Card className="card-industrial overflow-hidden">
                    <CardHeader className="flex flex-col gap-3 space-y-1.5 p-4 text-center sm:flex-row sm:items-center sm:justify-between sm:p-6 sm:text-left">
                      <div className="min-w-0">
                        <CardTitle className="flex items-center justify-center gap-2 text-base font-semibold leading-snug min-[380px]:text-lg sm:justify-start sm:text-xl md:text-2xl">
                          <Receipt className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
                          <span className="text-balance">Historial de pago</span>
                        </CardTitle>
                        <CardDescription className="text-xs text-balance sm:text-sm">
                          Pagos de suscripción de visibilidad: monto, fecha de aprobación y si usaste código promocional.
                        </CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="px-3 pb-4 pt-0 sm:px-6 sm:pb-6">
                      {transfersLoading || invoicesLoading ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-10">
                          <Receipt className="h-8 w-8 animate-pulse text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">Cargando…</p>
                        </div>
                      ) : activationTransfers.length === 0 && verificationInvoiceRows.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
                          <Receipt className="h-8 w-8 opacity-60" />
                          <p className="max-w-md text-center text-sm">
                            Aún no hay un pago registrado. Cuando completes el abono de activación, verás aquí el
                            movimiento y podrás descargar la factura en la pestaña Facturas.
                          </p>
                        </div>
                      ) : verificationInvoiceRows.length > 0 ? (
                        <div className="space-y-3">
                          {verificationInvoiceRows.map((inv) => (
                            <SubscriptionInvoiceRow
                              key={`overview-ver-${inv.reportId ?? inv.id}`}
                              invoice={inv}
                              monthlyUsdFallback={monthlyUsd}
                              userForInvoice={
                                user
                                  ? {
                                      firstName: user.firstName,
                                      lastName: user.lastName,
                                      name: (user as { name?: string }).name,
                                      email: user.email,
                                    }
                                  : null
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <motion.div className="space-y-5">
                          {activationTransfers.map((t: any) => {
                            const { amountColor, label, dateStr } = getTransferMeta(t);
                            return (
                              <div
                                key={t.id}
                                className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-background/50 p-3 transition-colors hover:border-primary/30 min-[380px]:gap-4 min-[380px]:p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5"
                              >
                                <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
                                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 sm:mt-0 sm:h-10 sm:w-10">
                                    <Banknote className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
                                  </div>
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <p className="break-words text-sm font-medium text-foreground sm:text-base">
                                      {label}
                                    </p>
                                    <p className="hyphens-auto break-words text-xs text-muted-foreground sm:text-sm">
                                      {t.description ||
                                        `Pago único (USD ${ACTIVATION_VISIBILITY_USD}) para activar la visibilidad de tus servicios.`}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex w-full min-w-0 flex-col gap-3 border-t border-border/60 pt-3 sm:max-w-[50%] sm:w-auto sm:items-end sm:border-0 sm:pt-0">
                                  <div className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1 sm:w-auto sm:flex-col sm:items-end sm:text-right">
                                    <p
                                      className={`text-sm font-bold tabular-nums sm:text-base ${amountColor}`}
                                    >
                                      {formatAmount(t.amount)}
                                    </p>
                                    <p className="text-right text-[11px] text-muted-foreground break-all sm:break-normal sm:text-xs">
                                      {dateStr}
                                    </p>
                                  </div>
                                  <div className="flex w-full flex-col gap-2 min-[400px]:flex-row min-[400px]:flex-wrap min-[400px]:justify-end sm:w-auto">
                                    <Badge
                                      variant="secondary"
                                      className="w-full shrink-0 justify-center gap-1 py-1.5 text-xs min-[400px]:w-auto sm:py-1"
                                    >
                                      <FileText className="h-3 w-3 shrink-0" />
                                      Comprobante
                                    </Badge>
                                    <div className="flex w-full justify-center min-[400px]:w-auto min-[400px]:justify-end">
                                      {getStatusBadge(t.status)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </motion.div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              </div>
            </TabsContent>

            <TabsContent value="transactions">
              <Card className="card-industrial">
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-base min-[380px]:text-lg sm:text-2xl">Transacciones</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Historial del abono de USD {ACTIVATION_VISIBILITY_USD} (visibilidad de servicios)
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6">
                  {transfersLoading ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
                      <Receipt className="h-8 w-8 animate-pulse" />
                      <p className="text-sm">Cargando…</p>
                    </div>
                  ) : activationTransfers.length === 0 ? (
                    <div className="py-10 text-center text-muted-foreground">
                      <Receipt className="mx-auto mb-3 h-10 w-10 opacity-60" />
                      <p>No hay transacciones para mostrar.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {activationTransfers.map((t: any) => {
                        const { amountColor, label, dateStr } = getTransferMeta(t);
                        return (
                          <div
                            key={t.id}
                            className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-background/40 p-3 min-[380px]:p-4 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                                <Banknote className="h-4 w-4 text-primary" />
                              </div>
                              <div className="min-w-0 flex-1 space-y-1">
                                <p className="break-words text-sm font-medium">{label}</p>
                                <p className="break-words text-xs text-muted-foreground">
                                  {t.description ||
                                    `Abono único para servicios visibles (USD ${ACTIVATION_VISIBILITY_USD}).`}
                                </p>
                              </div>
                            </div>
                            <div className="flex w-full shrink-0 flex-row flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3 sm:w-auto sm:flex-col sm:items-end sm:border-0 sm:pt-0">
                              <div className="min-w-0 text-left sm:text-right">
                                <p className={`text-sm font-semibold tabular-nums ${amountColor}`}>
                                  {formatAmount(t.amount)}
                                </p>
                                <p className="text-[11px] text-muted-foreground break-all sm:break-normal sm:text-xs">
                                  {dateStr}
                                </p>
                              </div>
                              <div className="ml-auto sm:ml-0">{getStatusBadge(t.status)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="invoices">
              <SubscriptionInvoicesPanel cardClassName="card-industrial" enabled={allowed} />
            </TabsContent>
          </Tabs>
        </div>
      </section>
    </div>
  );
}

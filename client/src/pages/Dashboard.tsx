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
  Receipt,
  Settings,
  Loader2,
  ClipboardList,
} from "lucide-react";
import {
  buildAssociateDashboardActivity,
  filterActivityByListTab,
  type AssociateDashboardActivityItem,
} from "@shared/associate-dashboard-activity";
import { AssociateActivityDetailSheet } from "@/components/dashboard/AssociateActivityDetailSheet";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useWalletTransfers, useCurrentProvider, useBookingsByProvider, useBookings } from "@/hooks/use-mango-data";
import { useAuth } from "@/hooks/use-auth";
import { SubscriptionInvoicesPanel } from "@/components/subscription/SubscriptionInvoicesPanel";
import type { SubscriptionInvoiceListItem } from "@shared/subscription-invoice";
import { AssociateActivityFeed } from "@/components/dashboard/AssociateActivityFeed";
import { fetchMobilityRideHistoryForUser } from "@/lib/mobility-ride-history-api";
import { normalizeProviderCategorySlug } from "@shared/default-categories";
import {
  dashboardActivityPageSubtitle,
  dashboardActivityTransactionsDescription,
  dashboardClientDetailHint,
  dashboardOverviewDescription,
  dashboardProfessionalDetailHint,
  dashboardServiceHistoryDescription,
  resolveDashboardActivityViewer,
} from "@shared/dashboard-activity-copy";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { QuickSettingsPanel } from "@/components/settings/QuickSettingsPanel";
import { canAccessActivityDashboard, hasFullAdminRole } from "@/lib/auth-utils";
import { userCanActAsAssociate } from "@/lib/user-permissions";
import { normalizeRoleCode } from "@shared/roles";

const SHOW_DASHBOARD_KPI_CARDS = false;
const SHOW_DASHBOARD_HEADER_ACTIONS = false;

export default function Dashboard() {
  const [timeRange, setTimeRange] = useState("6m");
  const [dashboardSettingsOpen, setDashboardSettingsOpen] = useState(false);
  const [activityDetailItem, setActivityDetailItem] = useState<AssociateDashboardActivityItem | null>(null);
  const [activityDetailOpen, setActivityDetailOpen] = useState(false);
  const [locationPath, setLocation] = useLocation();

  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { data: providerProfile, isLoading: providerLoading } = useCurrentProvider();
  const hasProvider =
    !!providerProfile || !!(user as { provider?: unknown } | null)?.provider;
  const allowed = canAccessActivityDashboard(user, hasProvider);
  const viewer = resolveDashboardActivityViewer(hasProvider);
  const isClientOnly = viewer === "client_only";
  const showProfessionalHint = hasProvider;
  const showClientHint = isClientOnly || viewer === "both";

  const earlyAllowed =
    hasFullAdminRole(user ?? null) ||
    userCanActAsAssociate(user) ||
    !!(user as { provider?: unknown } | null)?.provider ||
    normalizeRoleCode(user?.role) === "client";

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
    enabled: isAuthenticated && allowed && !isClientOnly,
  });

  const verificationInvoiceRows = useMemo(
    () => (Array.isArray(invoiceList) ? invoiceList : []).filter((inv) => inv.type === "verification"),
    [invoiceList],
  );

  const { data: providerBookings, isLoading: providerBookingsLoading } = useBookingsByProvider();
  const { data: clientBookings, isLoading: clientBookingsLoading } = useBookings({
    enabled: isAuthenticated && allowed,
  });

  const { data: mobilityDriverHistory, isLoading: mobilityDriverLoading } = useQuery({
    queryKey: ["/api/mobility/rides/history", "dashboard", "driver", String(user?.id ?? "")],
    enabled: isAuthenticated && allowed && !!user?.id && hasProvider,
    queryFn: () => fetchMobilityRideHistoryForUser(80, "driver"),
    staleTime: 60_000,
  });

  const { data: mobilityRiderHistory, isLoading: mobilityRiderLoading } = useQuery({
    queryKey: ["/api/mobility/rides/history", "dashboard", "rider", String(user?.id ?? "")],
    enabled: isAuthenticated && allowed && !!user?.id,
    queryFn: () => fetchMobilityRideHistoryForUser(80, "rider"),
    staleTime: 60_000,
  });

  const completedBookingsAsProvider = useMemo(
    () =>
      hasProvider
        ? (Array.isArray(providerBookings) ? providerBookings : []).filter(
            (b: { status?: string }) => String(b.status ?? "").toLowerCase() === "completed",
          )
        : [],
    [providerBookings, hasProvider],
  );

  const completedBookingsAsClient = useMemo(
    () =>
      (Array.isArray(clientBookings) ? clientBookings : []).filter(
        (b: { status?: string }) => String(b.status ?? "").toLowerCase() === "completed",
      ),
    [clientBookings],
  );

  const mobilityAsDriver = useMemo(
    () => (mobilityDriverHistory ?? []).filter((r) => r.outcome === "completed"),
    [mobilityDriverHistory],
  );

  const mobilityAsRider = useMemo(
    () => (mobilityRiderHistory ?? []).filter((r) => r.outcome === "completed"),
    [mobilityRiderHistory],
  );

  const providerCategorySlug = normalizeProviderCategorySlug(
    (providerProfile as { category?: string; categorySlug?: string } | null)?.categorySlug ??
      (providerProfile as { category?: string } | null)?.category,
  );

  const activityItems = useMemo(
    () =>
      buildAssociateDashboardActivity(
        {
          transfers: walletTransfersData?.transfers ?? [],
          completedBookingsAsProvider,
          completedBookingsAsClient,
          mobilityAsDriver,
          mobilityAsRider,
          verificationInvoices: verificationInvoiceRows,
          providerCategorySlug,
        },
        {
          includeSubscriptions: !isClientOnly,
          includeWalletTransactions: true,
        },
      ),
    [
      walletTransfersData?.transfers,
      completedBookingsAsProvider,
      completedBookingsAsClient,
      mobilityAsDriver,
      mobilityAsRider,
      verificationInvoiceRows,
      providerCategorySlug,
      isClientOnly,
    ],
  );

  const serviceHistoryItems = useMemo(
    () => filterActivityByListTab(activityItems, "services"),
    [activityItems],
  );

  const transactionItems = useMemo(
    () => filterActivityByListTab(activityItems, "transactions"),
    [activityItems],
  );

  const overviewItems = useMemo(() => activityItems.slice(0, 8), [activityItems]);

  const activityLoading =
    transfersLoading ||
    (isClientOnly ? false : invoicesLoading) ||
    providerBookingsLoading ||
    clientBookingsLoading ||
    (hasProvider && mobilityDriverLoading) ||
    mobilityRiderLoading;

  const serviceEmptyMessage = isClientOnly
    ? "Aún no tienes servicios completados como cliente."
    : "Aún no hay servicios registrados en tu historial.";

  const transactionEmptyMessage = isClientOnly
    ? "Aún no tienes pagos registrados (viajes Car Go o cargos en wallet)."
    : "Aún no hay transacciones de mensualidad o pagos Car Go.";

  const openActivityDetail = (item: AssociateDashboardActivityItem) => {
    setActivityDetailItem(item);
    setActivityDetailOpen(true);
  };

  const handleActivityDetailOpenChange = (open: boolean) => {
    setActivityDetailOpen(open);
    if (!open) {
      window.setTimeout(() => setActivityDetailItem(null), 220);
    }
  };

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

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat("es-EC", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);

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
                {dashboardActivityPageSubtitle(viewer)}
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
                    value="services"
                    className="shrink-0 px-2.5 py-2 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-[380px]:text-sm sm:px-3"
                  >
                    <ClipboardList className="h-4 w-4 max-[420px]:hidden sm:mr-2" />
                    Historial
                  </TabsTrigger>
                  <TabsTrigger
                    value="transactions"
                    className="shrink-0 px-2.5 py-2 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-[380px]:text-sm sm:px-3"
                  >
                    <Receipt className="h-4 w-4 max-[420px]:hidden sm:mr-2" />
                    Transacciones
                  </TabsTrigger>
                  {!isClientOnly ? (
                    <TabsTrigger
                      value="invoices"
                      className="shrink-0 px-2.5 py-2 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-[380px]:text-sm sm:px-3"
                    >
                      <FileText className="h-4 w-4 max-[420px]:hidden sm:mr-2" />
                      Facturas
                    </TabsTrigger>
                  ) : null}
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
              {(showProfessionalHint || showClientHint) && (
                <div className="space-y-2">
                  {showProfessionalHint ? (
                    <p className="rounded-xl border border-border/80 bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                      {dashboardProfessionalDetailHint()}{" "}
                      <Link href="/professional-dashboard" className="font-medium text-primary underline-offset-2 hover:underline">
                        Ir al panel profesional
                      </Link>
                    </p>
                  ) : null}
                  {showClientHint ? (
                    <p className="rounded-xl border border-border/80 bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                      {dashboardClientDetailHint()}{" "}
                      <Link href="/bookings" className="font-medium text-primary underline-offset-2 hover:underline">
                        Mis reservas
                      </Link>
                    </p>
                  ) : null}
                </div>
              )}
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
                          <span className="text-balance">Actividad reciente</span>
                        </CardTitle>
                        <CardDescription className="text-xs text-balance sm:text-sm">
                          {dashboardOverviewDescription(viewer)}
                        </CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="px-3 pb-4 pt-0 sm:px-6 sm:pb-6">
                      {activityLoading ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-10">
                          <Receipt className="h-8 w-8 animate-pulse text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">Cargando…</p>
                        </div>
                      ) : (
                        <AssociateActivityFeed
                          items={overviewItems}
                          formatUsd={formatAmount}
                          emptyMessage={serviceEmptyMessage}
                          onSelectItem={openActivityDetail}
                        />
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              </div>
            </TabsContent>

            <TabsContent value="services">
              <Card className="card-industrial">
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-base min-[380px]:text-lg sm:text-2xl">
                    Historial de servicios
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    {dashboardServiceHistoryDescription(viewer)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6">
                  {activityLoading ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
                      <ClipboardList className="h-8 w-8 animate-pulse" />
                      <p className="text-sm">Cargando…</p>
                    </div>
                  ) : (
                    <AssociateActivityFeed
                      items={serviceHistoryItems}
                      formatUsd={formatAmount}
                      emptyMessage={serviceEmptyMessage}
                      onSelectItem={openActivityDetail}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="transactions">
              <Card className="card-industrial">
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-base min-[380px]:text-lg sm:text-2xl">Transacciones</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    {dashboardActivityTransactionsDescription(viewer)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6">
                  {activityLoading ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
                      <Receipt className="h-8 w-8 animate-pulse" />
                      <p className="text-sm">Cargando…</p>
                    </div>
                  ) : (
                    <AssociateActivityFeed
                      items={transactionItems}
                      formatUsd={formatAmount}
                      emptyMessage={transactionEmptyMessage}
                      onSelectItem={openActivityDetail}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {!isClientOnly ? (
              <TabsContent value="invoices">
                <SubscriptionInvoicesPanel cardClassName="card-industrial" enabled={allowed} />
              </TabsContent>
            ) : null}
          </Tabs>
        </div>
      </section>

      <AssociateActivityDetailSheet
        item={activityDetailItem}
        open={activityDetailOpen}
        onOpenChange={handleActivityDetailOpenChange}
        formatUsd={formatAmount}
      />
    </div>
  );
}

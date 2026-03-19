import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calendar,
  FileText,
  CreditCard,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  PieChart,
  BarChart3,
  Download,
  Filter,
  Eye,
  CheckCircle,
  Clock,
  XCircle,
  Building2,
  Receipt,
  Banknote
} from "lucide-react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useWalletTransfers } from "@/hooks/use-mango-data";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { downloadInvoicePdf, getTransferTypeLabel, type TransferForInvoice } from "@/lib/invoice-pdf";

const monthlyData = [
  { month: "Ene", income: 12400, expenses: 8200 },
  { month: "Feb", income: 15800, expenses: 9100 },
  { month: "Mar", income: 18200, expenses: 8500 },
  { month: "Abr", income: 14500, expenses: 7800 },
  { month: "May", income: 19200, expenses: 9200 },
  { month: "Jun", income: 22800, expenses: 10500 },
];

const servicesByCategory = [
  { category: "Servicios Legales", count: 45, percentage: 29 },
  { category: "Consultoría Financiera", count: 38, percentage: 24 },
  { category: "Mantenimiento", count: 35, percentage: 22 },
  { category: "Servicios Técnicos", count: 38, percentage: 25 },
];

export default function Dashboard() {
  const [timeRange, setTimeRange] = useState("6m");
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [overviewPage, setOverviewPage] = useState(1);

  const { user } = useAuth();

  // Ocultar la sección KPI que se ve en la imagen (Ingresos Totales / Servicios Completados / Pendientes),
  // para que no se muestre como "panel económico" al público.
  const SHOW_DASHBOARD_KPI_CARDS = false;
  const SHOW_DASHBOARD_HEADER_ACTIONS = false;

  const {
    data: kpis,
    isLoading: kpisLoading,
    isError: kpisError,
  } = useQuery({
    queryKey: ["/api/reports/kpis", String(user?.id ?? "")],
    enabled: !!user?.id,
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

  const { data: overviewTransfersData, isLoading: overviewLoading } = useWalletTransfers({
    page: overviewPage,
    limit: 10,
  });
  const overviewTransfers = overviewTransfersData?.transfers ?? [];
  const overviewTotal = overviewTransfersData?.total ?? 0;
  const overviewTotalPages = Math.max(1, Math.ceil(overviewTotal / 10));

  const { data: pagedTransfersData, isLoading: pagedLoading } = useWalletTransfers({
    page: transactionsPage,
    limit: 10,
  });
  const pagedTransfers = pagedTransfersData?.transfers ?? [];
  const pagedTotal = pagedTransfersData?.total ?? 0;
  const pagedTotalPages = Math.max(1, Math.ceil(pagedTotal / 10));

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="badge-success"><CheckCircle className="w-3 h-3 mr-1" />Completado</Badge>;
      case "pending_approval":
        return <Badge className="badge-warning"><Clock className="w-3 h-3 mr-1" />Pendiente</Badge>;
      case "rejected":
        return <Badge className="badge-danger"><XCircle className="w-3 h-3 mr-1" />Rechazado</Badge>;
      case "pending":
        return <Badge className="badge-warning"><Clock className="w-3 h-3 mr-1" />Pendiente</Badge>;
      case "cancelled":
        return <Badge className="badge-danger"><XCircle className="w-3 h-3 mr-1" />Cancelado</Badge>;
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

  function InvoicesTabContent() {
    const [page, setPage] = useState(1);
    const { data, isLoading } = useWalletTransfers({ page, limit: 10 });
    const transfers = (data?.transfers ?? []) as Array<TransferForInvoice & { id: number; status?: string }>;
    const total = data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / 10));

    if (isLoading) {
      return (
        <Card className="card-industrial">
          <CardHeader>
            <CardTitle>Facturas</CardTitle>
            <CardDescription>Transacciones y descarga de facturas en PDF</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
            <Receipt className="w-8 h-8 opacity-60 animate-pulse" />
            <p className="text-sm">Cargando transacciones…</p>
          </CardContent>
        </Card>
      );
    }

    if (transfers.length === 0) {
      return (
        <Card className="card-industrial">
          <CardHeader>
            <CardTitle>Facturas</CardTitle>
            <CardDescription>Transacciones y descarga de facturas en PDF</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
            <FileText className="w-8 h-8 opacity-60" />
            <p className="text-sm">Aún no tienes transacciones para facturar.</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="card-industrial">
        <CardHeader>
          <CardTitle>Facturas</CardTitle>
          <CardDescription>Descarga una factura en PDF por cada transacción</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {transfers.map((t) => {
            const label = getTransferTypeLabel(t.transferType);
            const parsedDate = parseTransferDate(t.createdAt);
            const dateStr = parsedDate ? format(parsedDate, "dd MMM yyyy HH:mm", { locale: es }) : "—";
            const status = t.status;
            return (
              <div
                key={t.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border border-border rounded-lg bg-card"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Receipt className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-sm">{label}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.description || "Sin descripción"}</p>
                    <p className="text-xs text-muted-foreground">{dateStr}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="font-semibold text-sm">{formatAmount(t.amount)}</p>
                  <Badge
                    variant={
                      status === "completed"
                        ? "default"
                        : status === "rejected"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {status === "pending_approval" ? "Pendiente" : status === "completed" ? "Completado" : "Rechazado"}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      user &&
                      downloadInvoicePdf(
                        {
                          id: t.id,
                          amount: t.amount,
                          transferType: t.transferType,
                          description: t.description,
                          createdAt: t.createdAt ?? null,
                          status: t.status,
                        },
                        {
                          firstName: user.firstName,
                          lastName: user.lastName,
                          name: (user as { name?: string }).name,
                          email: user.email,
                        }
                      )
                    }
                    disabled={!user}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Generar factura
                  </Button>
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">
              Página {page} de {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getTransferMeta = (t: any) => {
    const type = t.transferType as "service_payment" | "recharge" | "withdrawal" | "payment" | undefined;
    const status = t.status as "pending_approval" | "completed" | "rejected" | undefined;
    const isPending = status === "pending_approval";

    // Créditos (verde): recarga o ingreso por servicio completado.
    const isCredit =
      status === "completed" && (type === "recharge" || type === "service_payment");
    // Débitos (rojo): retiros completados o pago por servicio (cliente).
    const isDebit = status === "completed" && (type === "withdrawal" || type === "payment");

    let amountColor = "text-foreground";
    if (isPending) {
      amountColor = "text-muted-foreground";
    } else if (isCredit) {
      amountColor = "text-emerald-600";
    } else if (isDebit) {
      amountColor = "text-red-600";
    }

    let label = "Transacción";
    if (type === "recharge") label = "Recarga de saldo";
    if (type === "service_payment") label = "Pago de servicio";
    if (type === "payment") label = "Pago por servicio";
    if (type === "withdrawal") label = "Retiro de fondos";

    const createdAt = parseTransferDate(t.createdAt);
    const dateStr = createdAt
      ? format(createdAt, "dd MMM yyyy HH:mm", { locale: es })
      : "";

    return { isCredit, isDebit, isPending, amountColor, label, dateStr };
  };

  /** Convierte createdAt de la API (Date, ISO string, Firestore Timestamp) a Date válido o null. */
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <section className="bg-gradient-to-r from-primary/20 via-background to-accent/20 border-b border-border">
        <div className="container px-4 py-8 mx-auto max-w-7xl">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
          >
            <div>
              <h1 className="text-3xl font-display font-bold">
                Panel <span className="text-gradient-primary">Económico</span>
              </h1>
              <p className="text-muted-foreground mt-1">
                Bienvenido a tu centro de control financiero y gestión
              </p>
            </div>
            <div className="flex gap-3 justify-center md:justify-end flex-wrap">
              {SHOW_DASHBOARD_HEADER_ACTIONS && (
                <>
                  <Button variant="outline" className="border-primary/50 text-primary">
                    <Download className="w-4 h-4 mr-2" />
                    Exportar Reporte
                  </Button>
                  <Button className="bg-accent hover:bg-accent/90">
                    <CreditCard className="w-4 h-4 mr-2" />
                    Gestionar Pagos
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* KPI Cards */}
      {SHOW_DASHBOARD_KPI_CARDS && (
      <section className="py-8">
        <div className="container px-4 mx-auto max-w-7xl">
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {kpiCards.map((kpi, index) => (
              <motion.div key={index} variants={itemVariants}>
                <Card className="card-industrial hover:border-primary/50 transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className={`p-3 rounded-lg ${kpi.bgColor}`}>
                        <kpi.icon className={`w-6 h-6 ${kpi.color}`} />
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
                            <ArrowUpRight className="w-3 h-3 mr-1" />
                          ) : (
                            <ArrowDownRight className="w-3 h-3 mr-1" />
                          )}
                          {kpi.change}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-4">
                      <p className="text-3xl font-bold font-display">{kpi.value}</p>
                      <p className="text-sm text-muted-foreground mt-1">{kpi.title}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>
      )}

      {/* Main Content */}
      <section className="py-6 pb-16">
        <div className="container px-4 mx-auto max-w-7xl">
          <Tabs defaultValue="overview" className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 max-w-full overflow-hidden">
              <div className="w-full max-w-full overflow-x-auto md:overflow-visible [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-muted/50 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
                <TabsList className="bg-card border border-border inline-flex w-max flex-nowrap h-10 p-1">
                  <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shrink-0 px-3">
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Resumen
                  </TabsTrigger>
                  <TabsTrigger value="transactions" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shrink-0 px-3">
                    <Receipt className="w-4 h-4 mr-2" />
                    Transacciones
                  </TabsTrigger>
                  <TabsTrigger value="invoices" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shrink-0 px-3">
                    <FileText className="w-4 h-4 mr-2" />
                    Facturación
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex gap-2">
                <Select value={timeRange} onValueChange={setTimeRange}>
                  <SelectTrigger className="w-[140px] input-industrial">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">Últimos 7 días</SelectItem>
                    <SelectItem value="30d">Últimos 30 días</SelectItem>
                    <SelectItem value="6m">Últimos 6 meses</SelectItem>
                    <SelectItem value="1y">Último año</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon">
                  <Filter className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <TabsContent value="overview" className="space-y-6">
              {/* Ocultamos los gráficos de "Ingresos vs Gastos" y "Servicios por Categoría" */}
              <div className="grid lg:grid-cols-1 gap-6">

              {/* Recent Transactions */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Card className="card-industrial overflow-hidden">
                  <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-center sm:text-left">
                    <div>
                      <CardTitle className="flex items-center justify-center sm:justify-start gap-2">
                        <Receipt className="w-5 h-5 text-primary shrink-0" />
                        Transacciones y Facturas Recientes
                      </CardTitle>
                      <CardDescription>
                        Últimas 10 transacciones y facturas (ordenadas por fecha)
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {overviewLoading ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-3">
                        <Receipt className="w-8 h-8 text-muted-foreground animate-pulse" />
                        <p className="text-sm text-muted-foreground">Cargando transacciones y facturas…</p>
                      </div>
                    ) : overviewTransfers.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
                        <Receipt className="w-8 h-8 opacity-60" />
                        <p className="text-sm">Aún no tienes transacciones para mostrar.</p>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {overviewTransfers.map((t: any) => {
                          const { amountColor, label, dateStr } = getTransferMeta(t);
                          return (
                        <div 
                            key={t.id}
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 sm:p-5 rounded-lg bg-background/50 border border-border hover:border-primary/30 transition-colors min-w-0"
                        >
                          <div className="flex items-start sm:items-center gap-4 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                              <Banknote className="w-5 h-5 text-primary" />
                            </div>
                            <div className="min-w-0 space-y-1.5">
                              <p className="font-medium truncate text-foreground">{label}</p>
                              <p className="text-sm text-muted-foreground truncate">
                                {t.description || "Sin descripción"}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-x-4 gap-y-2 shrink-0 border-t border-border/60 pt-3 sm:border-0 sm:pt-0 sm:gap-4">
                            <div className="text-right">
                              <p className={`font-bold ${amountColor}`}>
                                {formatAmount(t.amount)}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">{dateStr}</p>
                            </div>
                            <div className="w-full sm:w-auto flex justify-center sm:justify-end gap-2 items-center">
                              <Badge variant="secondary" className="gap-1">
                                <FileText className="w-3 h-3" />
                                Factura
                              </Badge>
                              {getStatusBadge(t.status)}
                            </div>
                          </div>
                        </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-6 flex items-center justify-between pt-2">
                      <p className="text-xs text-muted-foreground">
                        Página {overviewPage} de {overviewTotalPages}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={overviewPage <= 1}
                          onClick={() => setOverviewPage((p) => Math.max(1, p - 1))}
                        >
                          Anterior
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={overviewPage >= overviewTotalPages}
                          onClick={() =>
                            setOverviewPage((p) => Math.min(overviewTotalPages, p + 1))
                          }
                        >
                          Siguiente
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
              </div>
            </TabsContent>

            <TabsContent value="transactions">
              <Card className="card-industrial">
                <CardHeader>
                  <CardTitle>Todas las Transacciones</CardTitle>
                  <CardDescription>Historial completo de transacciones</CardDescription>
                </CardHeader>
                <CardContent>
                  {pagedLoading ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
                      <Receipt className="w-8 h-8 animate-pulse" />
                      <p className="text-sm">Cargando transacciones…</p>
                    </div>
                  ) : pagedTransfers.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <Receipt className="w-10 h-10 mx-auto mb-3 opacity-60" />
                      <p>No hay transacciones para mostrar.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {pagedTransfers.map((t: any) => {
                        const { amountColor, label, dateStr } = getTransferMeta(t);
                        return (
                          <div
                            key={t.id}
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 border border-border rounded-lg bg-background/40"
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <Banknote className="w-4 h-4 text-primary" />
                              </div>
                              <div className="min-w-0 space-y-1">
                                <p className="font-medium text-sm truncate">{label}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {t.description || "Sin descripción"}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <p className={`font-semibold text-sm ${amountColor}`}>
                                {formatAmount(t.amount)}
                              </p>
                              <p className="text-xs text-muted-foreground">{dateStr}</p>
                              <div>{getStatusBadge(t.status)}</div>
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex items-center justify-between pt-2">
                        <p className="text-xs text-muted-foreground">
                          Página {transactionsPage} de {pagedTotalPages}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={transactionsPage <= 1}
                            onClick={() => setTransactionsPage((p) => Math.max(1, p - 1))}
                          >
                            Anterior
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={transactionsPage >= pagedTotalPages}
                            onClick={() =>
                              setTransactionsPage((p) => Math.min(pagedTotalPages, p + 1))
                            }
                          >
                            Siguiente
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="invoices">
              <InvoicesTabContent />
            </TabsContent>
          </Tabs>
        </div>
      </section>
    </div>
  );
}


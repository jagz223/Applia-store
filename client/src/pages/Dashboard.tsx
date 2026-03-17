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
  Users, 
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
import { useWalletTransfers } from "@/hooks/use-mango-data";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// Mock data for dashboard
const kpiData = [
  {
    title: "Ingresos Totales",
    value: "$45,280",
    change: "+12.5%",
    trend: "up",
    icon: DollarSign,
    color: "text-accent",
    bgColor: "bg-accent/10",
  },
  {
    title: "Servicios Completados",
    value: "156",
    change: "+8.2%",
    trend: "up",
    icon: CheckCircle,
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    title: "Clientes Activos",
    value: "89",
    change: "+15.3%",
    trend: "up",
    icon: Users,
    color: "text-secondary",
    bgColor: "bg-secondary/10",
  },
  {
    title: "Pendientes",
    value: "23",
    change: "-5.1%",
    trend: "down",
    icon: Clock,
    color: "text-warning",
    bgColor: "bg-warning/10",
  },
];

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

  const { data: recentTransfersData, isLoading: recentLoading } = useWalletTransfers({
    page: 1,
    limit: 5,
  });
  const recentTransfers = recentTransfersData?.transfers ?? [];

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
              <Button variant="outline" className="border-primary/50 text-primary">
                <Download className="w-4 h-4 mr-2" />
                Exportar Reporte
              </Button>
              <Button className="bg-accent hover:bg-accent/90">
                <CreditCard className="w-4 h-4 mr-2" />
                Gestionar Pagos
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* KPI Cards */}
      <section className="py-8">
        <div className="container px-4 mx-auto max-w-7xl">
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {kpiData.map((kpi, index) => (
              <motion.div key={index} variants={itemVariants}>
                <Card className="card-industrial hover:border-primary/50 transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className={`p-3 rounded-lg ${kpi.bgColor}`}>
                        <kpi.icon className={`w-6 h-6 ${kpi.color}`} />
                      </div>
                      <Badge variant="outline" className={kpi.trend === "up" ? "border-accent/50 text-accent" : "border-warning/50 text-warning"}>
                        {kpi.trend === "up" ? (
                          <ArrowUpRight className="w-3 h-3 mr-1" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3 mr-1" />
                        )}
                        {kpi.change}
                      </Badge>
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
              {/* Charts Row */}
              <div className="grid lg:grid-cols-3 gap-6">
                {/* Income Chart */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="lg:col-span-2"
                >
                  <Card className="card-industrial">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-primary" />
                        Ingresos vs Gastos
                      </CardTitle>
                      <CardDescription>
                        Evolución mensual de tu actividad financiera
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px] flex items-end justify-between gap-2 px-4">
                        {monthlyData.map((data, index) => (
                          <div key={index} className="flex-1 flex flex-col items-center gap-2">
                            <div className="w-full flex flex-col gap-1">
                              <div 
                                className="w-full bg-accent/60 rounded-t-sm transition-all hover:bg-accent"
                                style={{ height: `${(data.income / 25000) * 200}px` }}
                                title={`Ingresos: $${data.income.toLocaleString()}`}
                              ></div>
                              <div 
                                className="w-full bg-primary/60 rounded-t-sm transition-all hover:bg-primary"
                                style={{ height: `${(data.expenses / 25000) * 200}px` }}
                                title={`Gastos: $${data.expenses.toLocaleString()}`}
                              ></div>
                            </div>
                            <span className="text-xs text-muted-foreground">{data.month}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-border">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-accent"></div>
                          <span className="text-sm text-muted-foreground">Ingresos</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-primary"></div>
                          <span className="text-sm text-muted-foreground">Gastos</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Services by Category */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <Card className="card-industrial h-full">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <PieChart className="w-5 h-5 text-primary" />
                        Servicios por Categoría
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {servicesByCategory.map((cat, index) => (
                        <div key={index} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>{cat.category}</span>
                            <span className="text-muted-foreground">{cat.count} ({cat.percentage}%)</span>
                          </div>
                          <Progress value={cat.percentage} className="h-2" />
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </motion.div>
              </div>

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
                        Transacciones Recientes
                      </CardTitle>
                      <CardDescription>
                        Últimas 5 transacciones del período seleccionado
                      </CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" asChild className="shrink-0">
                      <Link href="/payments">Ver todas</Link>
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {recentLoading ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-3">
                        <Receipt className="w-8 h-8 text-muted-foreground animate-pulse" />
                        <p className="text-sm text-muted-foreground">Cargando transacciones…</p>
                      </div>
                    ) : recentTransfers.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
                        <Receipt className="w-8 h-8 opacity-60" />
                        <p className="text-sm">Aún no tienes transacciones.</p>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {recentTransfers.map((t: any) => {
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
                            <div className="w-full sm:w-auto flex justify-center sm:justify-end">
                              {getStatusBadge(t.status)}
                            </div>
                          </div>
                        </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
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
              <Card className="card-industrial">
                <CardHeader>
                  <CardTitle>Facturación Automática</CardTitle>
                  <CardDescription>Gestión de facturas y comprobantes</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Sistema de facturación electrónica en desarrollo</p>
                    <p className="text-sm mt-2">Compatible con SRI Ecuador</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </section>
    </div>
  );
}


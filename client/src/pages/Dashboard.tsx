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

const recentTransactions = [
  { id: 1, client: "Carlos Mendoza", service: "Consulta Legal", amount: 150, status: "completed", date: "22 Feb 2026" },
  { id: 2, client: "María García", service: "Asesoría Financiera", amount: 200, status: "pending", date: "21 Feb 2026" },
  { id: 3, client: "Roberto Sánchez", service: "Mantenimiento", amount: 85, status: "completed", date: "20 Feb 2026" },
  { id: 4, client: "Ana López", service: "Consulta Técnica", amount: 120, status: "completed", date: "19 Feb 2026" },
  { id: 5, client: "Pedro Torres", service: " Auditoría", amount: 350, status: "cancelled", date: "18 Feb 2026" },
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
            <div className="flex gap-3">
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
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <TabsList className="bg-card border border-border">
                <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Resumen
                </TabsTrigger>
                <TabsTrigger value="transactions" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Receipt className="w-4 h-4 mr-2" />
                  Transacciones
                </TabsTrigger>
                <TabsTrigger value="invoices" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <FileText className="w-4 h-4 mr-2" />
                  Facturación
                </TabsTrigger>
              </TabsList>

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
                <Card className="card-industrial">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Receipt className="w-5 h-5 text-primary" />
                        Transacciones Recientes
                      </CardTitle>
                      <CardDescription>
                        Últimas 5 transacciones del período seleccionado
                      </CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href="/payments">Ver todas</Link>
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {recentTransactions.map((transaction) => (
                        <div 
                          key={transaction.id}
                          className="flex items-center justify-between p-4 rounded-lg bg-background/50 border border-border hover:border-primary/30 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <Banknote className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{transaction.client}</p>
                              <p className="text-sm text-muted-foreground">{transaction.service}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="font-bold">${transaction.amount}</p>
                              <p className="text-xs text-muted-foreground">{transaction.date}</p>
                            </div>
                            {getStatusBadge(transaction.status)}
                          </div>
                        </div>
                      ))}
                    </div>
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
                  <div className="text-center py-12 text-muted-foreground">
                    <Receipt className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Vista detallada de transacciones en desarrollo</p>
                  </div>
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


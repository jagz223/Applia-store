import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  CreditCard, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight, 
  Shield, 
  Lock, 
  CheckCircle, 
  Clock,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  RefreshCw,
  Building2,
  Globe,
  Smartphone,
  Copy,
  ExternalLink,
  FileText,
  Send,
  History,
  Gift,
  Users
} from "lucide-react";
import { motion } from "framer-motion";

// Mock payment data
const transactions = [
  { id: 1, type: "in", amount: 450, currency: "USD", status: "completed", description: "Pago por servicio - Carlos Mendoza", date: "22 Feb 2026", method: "stripe" },
  { id: 2, type: "out", amount: 150, currency: "USD", status: "completed", description: "Transferencia a cuenta bancaria", date: "21 Feb 2026", method: "bank" },
  { id: 3, type: "secure", amount: 300, currency: "USD", status: "pending", description: "Pago seguro — Servicio Legal", date: "20 Feb 2026", method: "secure" },
  { id: 4, type: "in", amount: 200, currency: "USD", status: "completed", description: "Pago por servicio - María García", date: "19 Feb 2026", method: "paypal" },
  { id: 5, type: "out", amount: 85, currency: "USD", status: "completed", description: "Retiro a Saldo Genfeb", date: "18 Feb 2026", method: "wallet" },
];

const securePaymentItems = [
  { id: 1, service: "Consulta Legal", client: "Carlos Mendoza", amount: 300, status: "held", date: "20 Feb 2026", releaseDate: "27 Feb 2026" },
  { id: 2, service: "Asesoría Financiera", client: "Ana López", amount: 500, status: "released", date: "15 Feb 2026", releaseDate: "18 Feb 2026" },
  { id: 3, service: "Mantenimiento", client: "Roberto Sánchez", amount: 150, status: "disputed", date: "10 Feb 2026", releaseDate: "-" },
];

const paymentMethods = [
  { id: "stripe", name: "Stripe", icon: CreditCard, color: "text-purple-500", bg: "bg-purple-500/10" },
  { id: "paypal", name: "PayPal", icon: Globe, color: "text-blue-500", bg: "bg-blue-500/10" },
  { id: "bank", name: "Transferencia", icon: Building2, color: "text-primary", bg: "bg-primary/10" },
  { id: "wallet", name: "Saldo Genfeb", icon: Wallet, color: "text-accent", bg: "bg-accent/10" },
];

export default function Payments() {
  const [activeTab, setActiveTab] = useState("overview");
  const [showAddCard, setShowAddCard] = useState(false);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="badge-success"><CheckCircle className="w-3 h-3 mr-1" />Completado</Badge>;
      case "pending":
        return <Badge className="badge-warning"><Clock className="w-3 h-3 mr-1" />Pendiente</Badge>;
      case "held":
        return <Badge className="badge-info"><Shield className="w-3 h-3 mr-1" />Pago seguro</Badge>;
      case "released":
        return <Badge className="badge-success"><CheckCircle className="w-3 h-3 mr-1" />Liberado</Badge>;
      case "disputed":
        return <Badge className="badge-danger"><AlertTriangle className="w-3 h-3 mr-1" />Disputado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const totalIn = transactions.filter(t => t.type === "in" && t.status === "completed").reduce((sum, t) => sum + t.amount, 0);
  const totalOut = transactions.filter(t => t.type === "out" && t.status === "completed").reduce((sum, t) => sum + t.amount, 0);
  const secureHeldTotal = securePaymentItems.filter(e => e.status === "held").reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <section className="bg-gradient-to-r from-accent/20 via-background to-primary/20 border-b border-border">
        <div className="container px-4 py-8 mx-auto max-w-7xl">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
          >
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-accent/20">
                  <CreditCard className="w-6 h-6 text-accent" />
                </div>
                <h1 className="text-3xl font-display font-bold">
                  Centro de <span className="text-gradient-economic">Pagos</span>
                </h1>
              </div>
              <p className="text-muted-foreground">
                Gestiona tus pagos y transacciones con el sistema de pagos seguros
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="border-primary/50 text-primary">
                <RefreshCw className="w-4 h-4 mr-2" />
                Sincronizar
              </Button>
              <Button className="bg-accent hover:bg-accent/90">
                <Send className="w-4 h-4 mr-2" />
                Nuevo Pago
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Balance Cards */}
      <section className="py-8">
        <div className="container px-4 mx-auto max-w-7xl">
          <div className="grid md:grid-cols-3 gap-6">
            {/* Available Balance */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="card-industrial border-accent/30">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 rounded-lg bg-accent/10">
                      <Wallet className="w-5 h-5 text-accent" />
                    </div>
                    <Badge variant="outline" className="border-accent/50 text-accent">Disponible</Badge>
                  </div>
                  <p className="text-3xl font-bold font-display">$2,450.00</p>
                  <p className="text-sm text-muted-foreground">Saldo disponible para retiro</p>
                  <div className="flex gap-2 mt-4">
                    <Button className="flex-1 bg-accent hover:bg-accent/90" size="sm">
                      Retirar
                    </Button>
                    <Button variant="outline" size="sm" className="border-border">
                      <CreditCard className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Fondos en pago seguro */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="card-industrial border-primary/30">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Shield className="w-5 h-5 text-primary" />
                    </div>
                    <Badge variant="outline" className="border-primary/50 text-primary">Pago seguro</Badge>
                  </div>
                  <p className="text-3xl font-bold font-display">${secureHeldTotal}.00</p>
                  <p className="text-sm text-muted-foreground">Fondos en pagos seguros</p>
                  <div className="flex gap-2 mt-4">
                    <Button className="flex-1 bg-primary hover:bg-primary/90" size="sm">
                      Ver Detalles
                    </Button>
                    <Button variant="outline" size="sm" className="border-border">
                      <FileText className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Pending */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="card-industrial border-warning/30">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 rounded-lg bg-warning/10">
                      <Clock className="w-5 h-5 text-warning" />
                    </div>
                    <Badge variant="outline" className="border-warning/50 text-warning">Pendiente</Badge>
                  </div>
                  <p className="text-3xl font-bold font-display">$850.00</p>
                  <p className="text-sm text-muted-foreground">Por procesar</p>
                  <div className="flex gap-2 mt-4">
                    <Button className="flex-1 bg-warning hover:bg-warning/90 text-black" size="sm">
                      Procesar
                    </Button>
                    <Button variant="outline" size="sm" className="border-border">
                      <History className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Payment Methods & Transactions */}
      <section className="py-6 pb-16">
        <div className="container px-4 mx-auto max-w-7xl">
          <Tabs defaultValue="transactions" className="space-y-6">
            <TabsList className="bg-card border border-border">
              <TabsTrigger value="transactions" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <History className="w-4 h-4 mr-2" />
                Transacciones
              </TabsTrigger>
              <TabsTrigger value="secure" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Shield className="w-4 h-4 mr-2" />
                Pagos seguros
              </TabsTrigger>
              <TabsTrigger value="methods" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <CreditCard className="w-4 h-4 mr-2" />
                Métodos de Pago
              </TabsTrigger>
            </TabsList>

            <TabsContent value="transactions">
              <Card className="card-industrial">
                <CardHeader>
                  <CardTitle>Historial de Transacciones</CardTitle>
                  <CardDescription>Todas tus transacciones recientes</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {transactions.map((tx) => (
                      <div 
                        key={tx.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-background/50 border border-border hover:border-primary/30 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-lg ${tx.type === 'in' ? 'bg-accent/10' : tx.type === 'out' ? 'bg-primary/10' : 'bg-warning/10'}`}>
                            {tx.type === 'in' ? (
                              <ArrowDownRight className="w-5 h-5 text-accent" />
                            ) : tx.type === 'out' ? (
                              <ArrowUpRight className="w-5 h-5 text-primary" />
                            ) : (
                              <Shield className={`w-5 h-5 ${tx.type === 'secure' ? 'text-primary' : 'text-warning'}`} />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{tx.description}</p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span>{tx.date}</span>
                              <span>•</span>
                              <span className="capitalize">{tx.method}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <p className={`font-bold ${tx.type === 'in' ? 'text-accent' : 'text-foreground'}`}>
                            {tx.type === 'in' ? '+' : '-'}${tx.amount}
                          </p>
                          {getStatusBadge(tx.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="secure">
              <Card className="card-industrial">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-primary" />
                    Pagos seguros
                  </CardTitle>
                  <CardDescription>
                    Los fondos se liberan después de confirmar el servicio
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {securePaymentItems.map((item) => (
                      <div 
                        key={item.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-background/50 border border-border"
                      >
                        <div className="flex items-center gap-4">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <Lock className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{item.service}</p>
                            <p className="text-sm text-muted-foreground">Cliente: {item.client}</p>
                            <p className="text-xs text-muted-foreground">Fecha de retención: {item.date}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg">${item.amount}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.status === "released" 
                              ? `Liberado: ${item.releaseDate}`
                              : item.status === "held" 
                                ? `Liberación: ${item.releaseDate}`
                                : "En disputa"
                            }
                          </p>
                          {getStatusBadge(item.status)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-start gap-3">
                      <Shield className="w-5 h-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium">¿Cómo funcionan los pagos seguros?</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          El cliente paga por adelantado y el dinero se retiene de forma segura. 
                          Una vez que confirmas la realización del servicio, el fondo se libera a tu cuenta.
                          Si hay alguna disputa, nuestro equipo mediador intervendrá.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="methods">
              <div className="grid lg:grid-cols-2 gap-6">
                <Card className="card-industrial">
                  <CardHeader>
                    <CardTitle>Métodos de Pago Vinculados</CardTitle>
                    <CardDescription>Gestiona tus métodos de pago registrados</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {paymentMethods.map((method) => (
                      <div 
                        key={method.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-background/50 border border-border hover:border-primary/30 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-lg ${method.bg}`}>
                            <method.icon className={`w-5 h-5 ${method.color}`} />
                          </div>
                          <div>
                            <p className="font-medium">{method.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {method.id === "stripe" && "•••• •••• •••• 4242"}
                              {method.id === "paypal" && "user@email.com"}
                              {method.id === "bank" && "Banco Pichincha •••• 8901"}
                              {method.id === "wallet" && "Saldo Genfeb"}
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="text-muted-foreground">
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}

                    <Button 
                      variant="outline" 
                      className="w-full border-dashed border-primary/50 text-primary hover:bg-primary/10"
                      onClick={() => setShowAddCard(!showAddCard)}
                    >
                      <CreditCard className="w-4 h-4 mr-2" />
                      Agregar Método de Pago
                    </Button>
                  </CardContent>
                </Card>

                <Card className="card-industrial">
                  <CardHeader>
                    <CardTitle>Agregar Nueva Tarjeta</CardTitle>
                    <CardDescription>Ingresa los datos de tu tarjeta</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Número de Tarjeta</Label>
                      <Input placeholder="1234 5678 9012 3456" className="input-industrial" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Fecha de Vencimiento</Label>
                        <Input placeholder="MM/YY" className="input-industrial" />
                      </div>
                      <div className="space-y-2">
                        <Label>CVC</Label>
                        <Input placeholder="123" className="input-industrial" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Nombre del Titular</Label>
                      <Input placeholder="NOMBRE APELLIDO" className="input-industrial" />
                    </div>
                    <Button className="w-full bg-accent hover:bg-accent/90">
                      <Lock className="w-4 h-4 mr-2" />
                      Agregar Tarjeta
                    </Button>
                    <p className="text-xs text-center text-muted-foreground">
                      <Lock className="w-3 h-3 inline mr-1" />
                      Tus datos están protegidos con cifrado SSL
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>
    </div>
  );
}

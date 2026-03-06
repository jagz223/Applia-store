import { Link } from "wouter";
import { useShowBecomePro } from "@/hooks/use-show-become-pro";
import { useCategories } from "@/hooks/use-mango-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowRight, 
  Search, 
  Shield, 
  Clock, 
  Users, 
  Star,
  CheckCircle,
  MapPin,
  Calendar,
  CreditCard,
  MessageSquare,
  Vault,
  Briefcase,
  Wrench,
  Scale,
  TrendingUp,
  Home,
  ChevronRight,
  Play
} from "lucide-react";
import { motion } from "framer-motion";

export default function HomePage() {
  const showBecomePro = useShowBecomePro();
  const { data: categories, isLoading } = useCategories();

  const features = [
    {
      icon: Calendar,
      title: "Reserva Inteligente",
      description: "Calendario dinámico sincronizado con geolocalización. Reserva en máximo 3 clics.",
      color: "text-primary",
      bgColor: "bg-primary/10"
    },
    {
      icon: CreditCard,
      title: "Pagos Escrow",
      description: "Pagos seguros con Stripe/PayPal. El dinero se libera tras confirmar el servicio.",
      color: "text-accent",
      bgColor: "bg-accent/10"
    },
    {
      icon: Vault,
      title: "Bóveda Segura",
      description: "Almacenamiento cifrado de documentos y contratos con AES-256.",
      color: "text-secondary",
      bgColor: "bg-secondary/10"
    },
    {
      icon: MessageSquare,
      title: "Chat en Vivo",
      description: "Comunicación en tiempo real entre clientes y profesionales.",
      color: "text-primary",
      bgColor: "bg-primary/10"
    },
    {
      icon: TrendingUp,
      title: "Panel Económico",
      description: "Dashboard avanzado con KPIs financieros y facturación automática.",
      color: "text-accent",
      bgColor: "bg-accent/10"
    },
    {
      icon: Shield,
      title: "Seguridad Industrial",
      description: "Plataforma protegida con estándares de alta seguridad.",
      color: "text-secondary",
      bgColor: "bg-secondary/10"
    }
  ];

  const serviceCategories = [
    { name: "Servicios Técnicos", icon: Wrench, count: 245, color: "text-primary" },
    { name: "Servicios Legales", icon: Scale, count: 128, color: "text-secondary" },
    { name: "Consultoría Financiera", icon: TrendingUp, count: 96, color: "text-accent" },
    { name: "Mantenimiento", icon: Home, count: 187, color: "text-primary" },
  ];

  const stats = [
    { value: "10,000+", label: "Usuarios Activos" },
    { value: "2,500+", label: "Profesionales" },
    { value: "50,000+", label: "Servicios Realizados" },
    { value: "4.9", label: "Calificación Promedio" },
  ];

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

  return (
    <div className="flex flex-col min-h-screen overflow-x-hidden">
      
      {/* HERO SECTION */}
      <section className="relative overflow-hidden pt-8 pb-20 md:pt-16 md:pb-32">
        {/* Background decorations */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-background to-accent/10"></div>
        <div className="absolute top-20 right-10 -z-10 h-[400px] w-[400px] bg-primary/20 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-20 left-10 -z-10 h-[300px] w-[300px] bg-accent/20 blur-[100px] rounded-full"></div>
        <div className="absolute inset-0 -z-10 grid-pattern opacity-30"></div>
        
        <div className="container px-4 sm:px-6 lg:px-8 mx-auto max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            
            {/* Hero Text */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="space-y-8"
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-bold text-primary shadow-lg shadow-primary/10"
              >
                <span className="flex h-2.5 w-2.5 rounded-full bg-primary animate-pulse"></span>
                Ecosystem GENFECORP
              </motion.div>
              
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-display font-bold text-foreground leading-[1.1]">
                La plataforma de <span className="text-gradient-primary">servicios</span> más avanzada
              </h1>
              
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-lg">
                Conecta con profesionales verificados para servicios técnicos, legales, financieros y mantenimiento. 
                Todo en un solo lugar con la garantía de GenFeb S.A.S.
              </p>

              {/* Quick Search */}
              <div className="p-4 rounded-xl bg-card/80 backdrop-blur border border-border">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <input 
                      type="text"
                      placeholder="¿Qué servicio necesitas?"
                      className="w-full h-12 pl-10 pr-4 rounded-lg bg-background border border-border focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div className="relative sm:w-48">
                    <MapPin className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <input 
                      type="text"
                      placeholder="Ubicación"
                      className="w-full h-12 pl-10 pr-4 rounded-lg bg-background border border-border focus:border-primary focus:outline-none"
                    />
                  </div>
                  <Button className="h-12 px-8 bg-primary hover:bg-primary/90">
                   Buscar
                  </Button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/explore">
                  <Button size="lg" className="h-14 px-8 rounded-full text-lg shadow-xl shadow-primary/25 hover:scale-105 transition-all duration-300 btn-shine btn-glow">
                    Explorar Servicios <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/booking">
                  <Button size="lg" variant="outline" className="h-14 px-8 rounded-full text-lg border-2 border-accent text-accent hover:bg-accent hover:text-white transition-all duration-300">
                    <Calendar className="mr-2 h-5 w-5" />
                    Reservar Ahora
                  </Button>
                </Link>
              </div>

              {/* Trust indicators */}
              <div className="flex flex-wrap items-center gap-6 pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-5 w-5 text-accent" />
                  <span>Profesionales verificados</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Shield className="h-5 w-5 text-accent" />
                  <span>Pagos seguros Escrow</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-5 w-5 text-accent" />
                  <span>+10,000 usuarios</span>
                </div>
              </div>
            </motion.div>

            {/* Hero Visual */}
            <motion.div 
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="relative hidden lg:block"
            >
              <div className="relative w-full aspect-square max-w-[500px] mx-auto">
                {/* Main circle */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 blur-3xl"></div>
                
                {/* Floating cards */}
                <motion.div 
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute top-10 right-0 card-industrial p-4 w-48"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-accent/10">
                      <CreditCard className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Pago Escrow</p>
                      <p className="font-bold text-accent">$450</p>
                    </div>
                  </div>
                  <div className="h-2 bg-accent/20 rounded-full overflow-hidden">
                    <div className="h-full bg-accent w-3/4 rounded-full"></div>
                  </div>
                </motion.div>

                <motion.div 
                  animate={{ y: [0, 10, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                  className="absolute bottom-20 left-0 card-industrial p-4 w-52"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Shield className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Documentos</p>
                      <p className="font-bold">Cifrados AES-256</p>
                    </div>
                  </div>
                </motion.div>

                <motion.div 
                  animate={{ y: [0, -15, 0] }}
                  transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 card-industrial p-6 w-64"
                >
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-3 glow-primary">
                      <Star className="w-8 h-8 text-primary" />
                    </div>
                    <p className="text-2xl font-bold font-display">4.9</p>
                    <p className="text-sm text-muted-foreground">Calificación promedio</p>
                    <div className="flex justify-center gap-1 mt-2">
                      {[1,2,3,4,5].map((s) => (
                        <Star key={s} className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                      ))}
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* STATS SECTION */}
      <section className="py-12 border-y border-border bg-card/50">
        <div className="container px-4 mx-auto max-w-7xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <motion.div 
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                viewport={{ once: true }}
                className="text-center"
              >
                <p className="text-3xl md:text-4xl font-display font-bold text-gradient-primary">
                  {stat.value}
                </p>
                <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section className="py-20">
        <div className="container px-4 mx-auto max-w-7xl">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="outline" className="mb-4 border-primary/50 text-primary">
              Características
            </Badge>
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
              Todo lo que necesitas en una plataforma
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Descubre las herramientas que hacen de GenFeb la mejor opción para gestionar tus servicios
            </p>
          </motion.div>

          <motion.div 
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {features.map((feature, index) => (
              <motion.div key={index} variants={itemVariants}>
                <Card className="card-industrial h-full group hover:border-primary/50 transition-all duration-300">
                  <CardContent className="p-6">
                    <div className={`p-3 rounded-xl ${feature.bgColor} w-fit mb-4 group-hover:scale-110 transition-transform`}>
                      <feature.icon className={`w-6 h-6 ${feature.color}`} />
                    </div>
                    <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CATEGORIES SECTION */}
      <section className="py-20 bg-card/30">
        <div className="container px-4 mx-auto max-w-7xl">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="outline" className="mb-4 border-accent/50 text-accent">
              Categorías
            </Badge>
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
              Explora todos los servicios
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Encuentra el profesional perfecto para cualquier necesidad
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {serviceCategories.map((category, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <Link href="/explore">
                  <Card className="card-industrial cursor-pointer group hover:border-primary/50 transition-all duration-300">
                    <CardContent className="p-6 text-center">
                      <div className={`p-4 rounded-xl ${category.color} bg-primary/10 w-fit mx-auto mb-4 group-hover:scale-110 transition-transform`}>
                        <category.icon className="w-8 h-8" />
                      </div>
                      <h3 className="text-lg font-bold mb-1">{category.name}</h3>
                      <p className="text-sm text-muted-foreground">{category.count} profesionales</p>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link href="/explore">
              <Button variant="outline" size="lg" className="border-primary/50 text-primary hover:bg-primary hover:text-white">
                Ver todas las categorías
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-background to-accent/20 -z-10"></div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/20 blur-[150px] rounded-full -z-10"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent/20 blur-[150px] rounded-full -z-10"></div>
        
        <div className="container px-4 mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Badge variant="outline" className="mb-4 border-primary/50 text-primary">
              Comienza hoy
            </Badge>
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
              ¿Listo para transformar tu negocio?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Únete a miles de profesionales y clientes que ya están usando GenFeb S.A.S.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register">
                <Button size="lg" className="h-14 px-8 rounded-full text-lg bg-primary hover:bg-primary/90">
                  Crear Cuenta Gratis
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              {showBecomePro && (
                <Link href="/become-pro">
                  <Button size="lg" variant="outline" className="h-14 px-8 rounded-full text-lg border-accent text-accent hover:bg-accent hover:text-white">
                    <Briefcase className="mr-2 h-5 w-5" />
                    Convertirse en Profesional
                  </Button>
                </Link>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* FOOTER CTA */}
      <section className="py-12 border-t border-border">
        <div className="container px-4 mx-auto max-w-7xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <img src="/logo GenFeb.jpg" alt="GENFEB Logo" className="h-10 w-auto" />
              <div>
                <p className="font-bold">GenFeb S.A.S.</p>
                <p className="text-sm text-muted-foreground">Eje central del ecosistema GENFECORP</p>
              </div>
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <Link href="/about" className="hover:text-foreground transition-colors">Acerca de</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">Términos</Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">Privacidad</Link>
              <Link href="/contact" className="hover:text-foreground transition-colors">Contacto</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

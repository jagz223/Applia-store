import { Link } from "wouter";
import { useCategories } from "@/hooks/use-mango-data";
import { Button } from "@/components/ui/button";
import { ArrowRight, Search, Zap, Shield, Heart, Star, CheckCircle, Users } from "lucide-react";
import { motion } from "framer-motion";
import * as Icons from "lucide-react";

export default function Home() {
  const { data: categories, isLoading } = useCategories();

  const CategoryIcon = ({ name }: { name: string }) => {
    const IconComponent = (Icons as any)[name] || Icons.HelpCircle;
    return <IconComponent className="h-7 w-7" />;
  };

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
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 via-background to-secondary/5"></div>
        <div className="absolute top-20 right-10 -z-10 h-[400px] w-[400px] bg-primary/20 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-20 left-10 -z-10 h-[300px] w-[300px] bg-secondary/20 blur-[100px] rounded-full"></div>
        <div className="absolute inset-0 -z-10 pattern-dots opacity-30"></div>
        
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
                Tu plataforma de servicios #1
              </motion.div>
              
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-display font-bold text-foreground leading-[1.1]">
                Encuentra al <span className="gradient-text">profesional</span> perfecto
              </h1>
              
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-lg">
                Conecta con expertos verificados para cualquier tarea. Desde reparaciones del hogar hasta servicios digitales.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/explore">
                  <Button size="lg" className="h-14 px-8 rounded-full text-lg shadow-xl shadow-primary/30 hover:scale-105 transition-all duration-300 btn-shine btn-glow">
                    Explorar Servicios <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/become-pro">
                  <Button size="lg" variant="outline" className="h-14 px-8 rounded-full text-lg border-2 border-secondary text-secondary hover:bg-secondary hover:text-white transition-all duration-300">
                    Ofrecer Servicios
                  </Button>
                </Link>
              </div>

              {/* Trust indicators */}
              <div className="flex flex-wrap items-center gap-6 pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-5 w-5 text-secondary" />
                  <span>Profesionales verificados</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Shield className="h-5 w-5 text-secondary" />
                  <span>Pagos seguros</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-5 w-5 text-secondary" />
                  <span>+1,000 usuarios</span>
                </div>
              </div>
            </motion.div>

            {/* Hero Visual */}
            <motion.div 
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="relative hidden lg:block"
            >
              <div className="relative z-10 grid grid-cols-2 gap-5">
                <div className="space-y-5 translate-y-10">
                  <motion.div 
                    whileHover={{ rotate: 0, scale: 1.02 }}
                    className="rounded-3xl overflow-hidden shadow-2xl shadow-primary/20 rotate-[-4deg] ring-4 ring-white"
                  >
                    <img 
                      src="https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=400&h=500&fit=crop" 
                      alt="Profesional" 
                      className="w-full h-64 object-cover"
                    />
                  </motion.div>
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="glass-card p-5 rounded-2xl max-w-[220px] ml-auto"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-green-100 text-green-600 rounded-xl"><Shield className="h-5 w-5" /></div>
                      <span className="font-bold">100% Verificados</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Todos los proveedores pasan por un proceso de verificación.</p>
                  </motion.div>
                </div>

                <div className="space-y-5">
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="glass-card p-5 rounded-2xl max-w-[220px]"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-amber-100 text-amber-600 rounded-xl"><Star className="h-5 w-5 fill-current" /></div>
                      <span className="font-bold">4.9/5 Estrellas</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Calificación promedio de nuestros profesionales.</p>
                  </motion.div>
                  <motion.div 
                    whileHover={{ rotate: 0, scale: 1.02 }}
                    className="rounded-3xl overflow-hidden shadow-2xl shadow-secondary/20 rotate-[4deg] ring-4 ring-white"
                  >
                    <img 
                      src="https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400&h=500&fit=crop" 
                      alt="Servicio" 
                      className="w-full h-64 object-cover"
                    />
                  </motion.div>
                </div>
              </div>

              {/* Decorative blob */}
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-accent/40 rounded-full blur-3xl"></div>
              <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-secondary/40 rounded-full blur-3xl"></div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CATEGORIES SECTION */}
      <section className="py-20 md:py-28 bg-gradient-to-b from-muted/50 to-background relative">
        <div className="absolute inset-0 pattern-grid opacity-50"></div>
        <div className="container px-4 sm:px-6 lg:px-8 mx-auto max-w-7xl relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center max-w-2xl mx-auto mb-16"
          >
            <span className="text-primary font-bold text-sm uppercase tracking-wider">Categorías</span>
            <h2 className="text-3xl md:text-5xl font-display font-bold mt-3 mb-5">Servicios Populares</h2>
            <p className="text-muted-foreground text-lg">Explora nuestras categorías más solicitadas y encuentra al experto ideal.</p>
          </motion.div>

          <motion.div 
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5"
          >
            {isLoading ? (
              [...Array(6)].map((_, i) => (
                <div key={i} className="h-40 bg-muted animate-pulse rounded-3xl"></div>
              ))
            ) : (
              categories?.slice(0, 6).map((cat, index) => (
                <motion.div key={cat.id} variants={itemVariants}>
                  <Link href={`/explore?category=${cat.id}`}>
                    <div className="group relative flex flex-col items-center justify-center p-6 bg-white dark:bg-card rounded-3xl border border-border/50 shadow-lg shadow-black/5 hover:shadow-2xl hover:shadow-primary/20 hover:-translate-y-2 transition-all duration-300 cursor-pointer h-40 overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:to-secondary/5 transition-all duration-500"></div>
                      <div className="relative z-10">
                        <div className="mb-4 p-4 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 text-primary group-hover:from-primary group-hover:to-primary group-hover:text-white transition-all duration-300 shadow-lg shadow-primary/10">
                          <CategoryIcon name={cat.icon} />
                        </div>
                        <span className="font-bold text-center group-hover:text-primary transition-colors block">{cat.name}</span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))
            )}
          </motion.div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-20 md:py-28 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-accent/10 blur-[150px] rounded-full"></div>
        
        <div className="container px-4 sm:px-6 lg:px-8 mx-auto max-w-7xl relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center max-w-2xl mx-auto mb-16"
          >
            <span className="text-secondary font-bold text-sm uppercase tracking-wider">Proceso</span>
            <h2 className="text-3xl md:text-5xl font-display font-bold mt-3 mb-5">Cómo funciona Mango</h2>
            <p className="text-muted-foreground text-lg">Consigue ayuda profesional en solo 3 pasos simples.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12 relative">
            {/* Connection line */}
            <div className="hidden md:block absolute top-20 left-[25%] right-[25%] h-1 bg-gradient-to-r from-primary via-secondary to-accent rounded-full opacity-30"></div>

            {[
              { icon: Search, title: "Busca", desc: "Explora cientos de servicios y perfiles profesionales para encontrar el match perfecto.", color: "primary", num: "01" },
              { icon: Zap, title: "Reserva", desc: "Selecciona un servicio, elige una fecha conveniente y reserva de forma segura.", color: "secondary", num: "02" },
              { icon: Heart, title: "Disfruta", desc: "Relájate mientras nuestro profesional verificado completa el trabajo a tu satisfacción.", color: "accent", num: "03" },
            ].map((step, i) => (
              <motion.div 
                key={step.num}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.2 }}
                className="flex flex-col items-center text-center"
              >
                <div className="relative mb-8">
                  <div className={`w-28 h-28 rounded-3xl bg-gradient-to-br from-${step.color} to-${step.color}/70 flex items-center justify-center shadow-2xl shadow-${step.color}/30 text-white rotate-3 hover:rotate-0 transition-transform duration-300`}>
                    <step.icon className="h-12 w-12" />
                  </div>
                  <div className="absolute -top-3 -right-3 w-10 h-10 bg-foreground text-background rounded-xl flex items-center justify-center font-bold text-sm shadow-lg">
                    {step.num}
                  </div>
                </div>
                <h3 className="text-2xl font-bold font-display mb-4">{step.title}</h3>
                <p className="text-muted-foreground max-w-xs leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="py-20 md:py-28">
        <div className="container px-4 sm:px-6 lg:px-8 mx-auto max-w-7xl">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-[3rem] animated-gradient p-1"
          >
            <div className="bg-foreground/95 dark:bg-background/95 rounded-[2.8rem] p-10 md:p-20 text-center relative">
              <div className="absolute inset-0 pattern-dots opacity-10"></div>
              <div className="relative z-10 max-w-3xl mx-auto space-y-8">
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-display font-bold text-white dark:text-foreground">
                  ¿Listo para comenzar?
                </h2>
                <p className="text-lg md:text-xl text-white/80 dark:text-muted-foreground max-w-xl mx-auto">
                  Únete a miles de usuarios y profesionales en Mango. Ya sea que necesites un servicio o lo ofrezcas, tenemos un lugar para ti.
                </p>
                <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
                  <Link href="/explore">
                    <Button size="lg" className="h-14 px-10 text-lg rounded-full bg-white text-foreground hover:bg-white/90 font-bold shadow-xl btn-shine">
                      Encontrar Servicio
                    </Button>
                  </Link>
                  <Link href="/become-pro">
                    <Button size="lg" variant="outline" className="h-14 px-10 text-lg rounded-full border-2 border-white text-white hover:bg-white/10">
                      Unirse como Pro
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

    </div>
  );
}

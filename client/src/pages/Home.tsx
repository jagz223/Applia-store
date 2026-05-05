import { Link, useLocation } from "wouter";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useShowBecomePro } from "@/hooks/use-show-become-pro";
import { api } from "@shared/routes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCategories, useCategoryVisibility, useCurrentProvider, useSubcategories } from "@/hooks/use-mango-data";
import { isCarGoProvider } from "@shared/provider-car-go";
import { providerHasGoBrand } from "@shared/provider-go";
import { effectiveHiddenCategorySlugs, getCategoryDisplayName } from "@shared/default-categories";
import { cn } from "@/lib/utils";
import { hasAdminRole } from "@/lib/auth-utils";
import { 
  ArrowRight, 
  Search, 
  Shield, 
  Users, 
  Star,
  CheckCircle,
  MapPin,
  Calendar,
  MessageSquare,
  Vault,
  Briefcase,
  Wrench,
  TrendingUp,
  Home,
  ChevronRight,
  Car,
  Store,
  Package,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { HomeVideoCarousel } from "@/components/home/HomeVideoCarousel";
import { CategoryIcon } from "@/components/CategoryIcon";
import { DEFAULT_SUBCATEGORIES } from "@shared/default-subcategories";

type HomeServiceCategory = {
  name: string;
  slug: "technical" | "professional" | "maintenance" | "transport" | "marketplace" | "delivery";
  icon: LucideIcon;
  countKey: "fixGo" | "proGo" | "manGo" | "carGo" | "shopGo" | "packGo";
  color: string;
  href: string;
};

type HomeFeature = {
  icon: LucideIcon;
  title: string;
  description: string;
  color: string;
  bgColor: string;
  /** Si true, no se muestra a usuarios sin sesión (vista pública). */
  hideForGuests?: boolean;
};

export default function HomePage() {
  const { user, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();
  const showBecomePro = useShowBecomePro();
  const { data: providerProfile, isLoading: providerProfileLoading } = useCurrentProvider();
  const { data: categories = [] } = useCategories();
  const { data: visibility } = useCategoryVisibility();
  const hiddenSlugs = useMemo(() => new Set(effectiveHiddenCategorySlugs(visibility?.hiddenSlugs)), [visibility]);

  // Subcategories for the 3 service categories
  const technicalCat = useMemo(() => categories.find((c: any) => c.slug === "technical"), [categories]);
  const professionalCat = useMemo(() => categories.find((c: any) => c.slug === "professional"), [categories]);
  const maintenanceCat = useMemo(() => categories.find((c: any) => c.slug === "maintenance"), [categories]);
  const { data: technicalSubs = [] } = useSubcategories((technicalCat as any)?.id ?? null);
  const { data: professionalSubs = [] } = useSubcategories((professionalCat as any)?.id ?? null);
  const { data: maintenanceSubs = [] } = useSubcategories((maintenanceCat as any)?.id ?? null);
  const subsByCategorySlug = useMemo(() => ({
    technical: technicalSubs,
    professional: professionalSubs,
    maintenance: maintenanceSubs,
  }), [technicalSubs, professionalSubs, maintenanceSubs]);

  const mobilityAllowed = {
    transport: !hiddenSlugs.has("transport"),
    marketplace: !hiddenSlugs.has("marketplace"),
    delivery: !hiddenSlugs.has("delivery"),
  };

  // Flat list: all subcategories + mobility cards (same size)
  const allHomeServiceItems = useMemo(() => {
    const items: { key: string; name: string; icon: string; parentName: string; href: string }[] = [];
    for (const { slug, subs } of [
      { slug: "technical", subs: technicalSubs },
      { slug: "professional", subs: professionalSubs },
      { slug: "maintenance", subs: maintenanceSubs },
    ]) {
      const cat = categories.find((c: any) => c.slug === slug);
      if (!cat) continue;
      for (const sub of subs) {
        const def = DEFAULT_SUBCATEGORIES.find((s) => s.slug === (sub as any).slug);
        items.push({
          key: `sub-${(sub as any).id}`,
          name: (sub as any).name,
          icon: def?.icon ?? "HelpCircle",
          parentName: (cat as any).name,
          href: `/explore?providerCategoryId=${(cat as any).id}&subcategoryId=${(sub as any).id}`,
        });
      }
    }
    if (mobilityAllowed.transport) {
      const cat = categories.find((c: any) => c.slug === "transport");
      items.push({ key: "transport", name: (cat as any)?.name ?? "Servicios de transporte", icon: "Car", parentName: "Conductores disponibles", href: "/go/cargo" });
    }
    if (mobilityAllowed.delivery) {
      const cat = categories.find((c: any) => c.slug === "delivery");
      items.push({ key: "delivery", name: (cat as any)?.name ?? "Delivery", icon: "Package", parentName: "Conductores disponibles", href: "/go/pack" });
    }
    return items;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [technicalSubs, professionalSubs, maintenanceSubs, categories, mobilityAllowed.transport, mobilityAllowed.delivery]);

  const anyMobilityAllowed = mobilityAllowed.transport || mobilityAllowed.marketplace || mobilityAllowed.delivery;
  const isCarGoDriver = useMemo(() => !!(providerProfile && isCarGoProvider(providerProfile, categories)), [providerProfile, categories]);
  const [goQuickOpen, setGoQuickOpen] = useState(false);
  const [associateIntroOpen, setAssociateIntroOpen] = useState(false);
  const [goDriverPickOpen, setGoDriverPickOpen] = useState(false);

  const heroAssociateKind = useMemo(() => {
    if (isAuthenticated && providerProfileLoading) return "loading" as const;

    if (isAuthenticated && hasAdminRole(user)) return "admin_panel" as const;

    const hasProvider = !!providerProfile;
    const isCargoBrand = hasProvider && isCarGoProvider(providerProfile, categories);
    const isPackBrand = hasProvider && providerHasGoBrand(providerProfile, "delivery", categories);

    if (!hasProvider) return "intro_become" as const;

    if (isCargoBrand && isPackBrand) return "go_both" as const;
    if (isCargoBrand) return "go_cargo" as const;
    if (isPackBrand) return "go_pack" as const;

    return "professional_panel" as const;
  }, [isAuthenticated, providerProfileLoading, providerProfile, categories]);

  const becomeHref = showBecomePro ? "/become-pro" : "/register";
  const { data: homeCounts, isLoading: homeCountsLoading, isError: homeCountsError } = useQuery({
    queryKey: [api.categories.homeAssociateCounts.path],
    queryFn: async () => {
      const res = await fetch(api.categories.homeAssociateCounts.path);
      if (!res.ok) throw new Error("No se pudieron cargar los conteos");
      return api.categories.homeAssociateCounts.responses[200].parse(await res.json());
    },
  });
  // Oculta el panel de búsqueda en la home por ahora.
  // Se reutilizará en una iteración futura.
  const SHOW_HOME_SEARCH_PANEL = false;
  // Oculta el panel de estadísticas (KPIs) en la home por ahora.
  const SHOW_HOME_STATS_SECTION = false;
  // Oculta links del footer (Acerca de / Términos / Privacidad / Contacto).
  const SHOW_HOME_FOOTER_LINKS = false;
  /** Carrusel de vídeos en la home. Desactivado por ahora; en el futuro enlazar a lista configurable (CMS / config). */
  const SHOW_HOME_VIDEO_CAROUSEL = false;

  const features: HomeFeature[] = [
    {
      icon: Calendar,
      title: "Reserva Inteligente",
      description: "Calendario dinámico sincronizado con geolocalización. Reserva en máximo 3 clics.",
      color: "text-primary",
      bgColor: "bg-primary/10"
    },
    {
      icon: Vault,
      title: "Documentos en la plataforma",
      description: "Comprobantes y facturas asociados a tus reservas, con acceso protegido desde tu cuenta.",
      color: "text-secondary",
      bgColor: "bg-secondary/10"
    },
    {
      icon: MessageSquare,
      title: "Chat en Vivo",
      description: "Comunicación en tiempo real entre clientes y asociados.",
      color: "text-primary",
      bgColor: "bg-primary/10"
    },
    {
      icon: TrendingUp,
      title: "Mi actividad",
      description: "Resumen de reservas, ingresos y comprobantes desde tu cuenta.",
      color: "text-accent",
      bgColor: "bg-accent/10",
      hideForGuests: true,
    },
    {
      icon: Shield,
      title: "Seguridad Industrial",
      description: "Plataforma protegida con estándares de alta seguridad.",
      color: "text-secondary",
      bgColor: "bg-secondary/10"
    }
  ];

  const serviceCategories = useMemo((): HomeServiceCategory[] => {
    /** Listado filtrado en Explorar por categoría de asociado (incluye todas las subcategorías, p. ej. legal y consultoría). */
    const exploreHrefForProviderSlug = (slug: "technical" | "professional" | "maintenance") => {
      const cat = categories.find((c) => String((c as { slug?: string }).slug ?? "") === slug);
      const id = cat && typeof (cat as { id?: number }).id === "number" ? (cat as { id: number }).id : null;
      return id != null ? `/explore?providerCategoryId=${id}` : "/explore";
    };

    const all: HomeServiceCategory[] = [
      {
        name: getCategoryDisplayName({ slug: "technical" }),
        slug: "technical",
        icon: Wrench,
        countKey: "fixGo",
        color: "text-primary",
        href: exploreHrefForProviderSlug("technical"),
      },
      {
        name: getCategoryDisplayName({ slug: "professional" }),
        slug: "professional",
        icon: Briefcase,
        countKey: "proGo",
        color: "text-secondary",
        href: exploreHrefForProviderSlug("professional"),
      },
      {
        name: getCategoryDisplayName({ slug: "maintenance" }),
        slug: "maintenance",
        icon: Home,
        countKey: "manGo",
        color: "text-primary",
        href: exploreHrefForProviderSlug("maintenance"),
      },
    ];

    if (mobilityAllowed.transport) {
      all.push({
        name: getCategoryDisplayName({ slug: "transport" }),
        slug: "transport",
        icon: Car,
        countKey: "carGo",
        color: "text-primary",
        href: "/go/cargo",
      });
    }
    if (mobilityAllowed.marketplace) {
      all.push({
        name: getCategoryDisplayName({ slug: "marketplace" }),
        slug: "marketplace",
        icon: Store,
        countKey: "shopGo",
        color: "text-secondary",
        href: "/go/shop",
      });
    }
    if (mobilityAllowed.delivery) {
      all.push({
        name: getCategoryDisplayName({ slug: "delivery" }),
        slug: "delivery",
        icon: Package,
        countKey: "packGo",
        color: "text-primary",
        href: "/go/pack",
      });
    }

    return all;
  }, [categories, mobilityAllowed.delivery, mobilityAllowed.marketplace, mobilityAllowed.transport]);

  const stats = [
    { value: "10,000+", label: "Usuarios Activos" },
    { value: "2,500+", label: "Asociados" },
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

  const visibleFeatures = features.filter((f) => !f.hideForGuests || isAuthenticated);

  return (
    <div className="relative flex flex-col min-h-screen overflow-x-hidden">
      
      {/* HERO SECTION — mismas fuentes / gradiente / fondo que service-hub */}
      <section className="relative overflow-hidden pt-8 pb-16 md:pt-14 md:pb-24">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 via-background to-secondary/5" />
        <div className="pointer-events-none absolute top-20 right-10 -z-10 h-[400px] w-[400px] rounded-full bg-primary/20 blur-[120px]" />
        <div className="pointer-events-none absolute bottom-20 left-10 -z-10 h-[300px] w-[300px] rounded-full bg-secondary/20 blur-[100px]" />
        <div className="absolute inset-0 -z-10 pattern-dots opacity-30" />

        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
            {/* Columna texto */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, ease: "easeOut" }}
              className="space-y-8"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
                className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 font-marketing text-sm font-bold text-primary shadow-lg shadow-primary/10"
              >
                <span className="flex h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-primary" aria-hidden />
                Tu plataforma de servicios #1
              </motion.div>

              <h1 className="font-hero text-4xl font-bold leading-[1.1] text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
                Encuentra al <span className="text-gradient-hero">profesional</span> perfecto
              </h1>

              <p className="font-marketing max-w-lg text-lg leading-relaxed text-muted-foreground md:text-xl">
                Conecta con expertos verificados para cualquier tarea. Desde reparaciones del hogar hasta servicios digitales.
              </p>

              {SHOW_HOME_SEARCH_PANEL && (
                <div className="rounded-2xl border border-border bg-card/90 p-4 backdrop-blur">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="¿Qué servicio necesitas?"
                        className="h-12 w-full rounded-xl border border-border bg-background pl-10 pr-4 focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div className="relative sm:w-48">
                      <MapPin className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Ubicación"
                        className="h-12 w-full rounded-xl border border-border bg-background pl-10 pr-4 focus:border-primary focus:outline-none"
                      />
                    </div>
                    <Button className="h-12 shrink-0 rounded-xl px-8">Buscar</Button>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-4 sm:flex-row">
                <Link href="/explore" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className="font-marketing h-14 w-full rounded-full px-8 text-lg shadow-xl shadow-primary/30 transition-all duration-300 hover:scale-105 sm:w-auto btn-shine btn-glow"
                  >
                    Explorar Servicios
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                {heroAssociateKind === "loading" ? (
                  <Button
                    size="lg"
                    variant="outline"
                    disabled
                    className="font-marketing h-14 w-full rounded-full border-2 border-secondary px-8 text-lg text-secondary sm:w-auto"
                  >
                    Cargando…
                  </Button>
                ) : heroAssociateKind === "intro_become" ? (
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    className="font-marketing h-14 w-full rounded-full border-2 border-secondary px-8 text-lg text-secondary transition-all duration-300 hover:bg-secondary hover:text-secondary-foreground sm:w-auto"
                    onClick={() => setAssociateIntroOpen(true)}
                  >
                    Ofrecer servicios
                  </Button>
                ) : heroAssociateKind === "admin_panel" ? (
                  <Link href="/admin" className="w-full sm:w-auto">
                    <Button
                      size="lg"
                      variant="outline"
                      className="font-marketing h-14 w-full rounded-full border-2 border-secondary px-8 text-lg text-secondary transition-all duration-300 hover:bg-secondary hover:text-secondary-foreground sm:w-auto"
                    >
                      Ir al panel de administración
                    </Button>
                  </Link>
                ) : heroAssociateKind === "professional_panel" ? (
                  <Link href="/professional-dashboard" className="w-full sm:w-auto">
                    <Button
                      size="lg"
                      variant="outline"
                      className="font-marketing h-14 w-full rounded-full border-2 border-secondary px-8 text-lg text-secondary transition-all duration-300 hover:bg-secondary hover:text-secondary-foreground sm:w-auto"
                    >
                      Ir a panel de asociados
                    </Button>
                  </Link>
                ) : heroAssociateKind === "go_cargo" ? (
                  <Link href="/go/cargo/driver" className="w-full sm:w-auto">
                    <Button
                      size="lg"
                      variant="outline"
                      className="font-marketing h-14 w-full rounded-full border-2 border-secondary px-8 text-lg text-secondary transition-all duration-300 hover:bg-secondary hover:text-secondary-foreground sm:w-auto"
                    >
                      Ir a vista Car Go
                    </Button>
                  </Link>
                ) : heroAssociateKind === "go_pack" ? (
                  <Link href="/go/pack/driver" className="w-full sm:w-auto">
                    <Button
                      size="lg"
                      variant="outline"
                      className="font-marketing h-14 w-full rounded-full border-2 border-secondary px-8 text-lg text-secondary transition-all duration-300 hover:bg-secondary hover:text-secondary-foreground sm:w-auto"
                    >
                      Ir a vista Pack Go
                    </Button>
                  </Link>
                ) : (
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    className="font-marketing h-14 w-full rounded-full border-2 border-secondary px-8 text-lg text-secondary transition-all duration-300 hover:bg-secondary hover:text-secondary-foreground sm:w-auto"
                    onClick={() => setGoDriverPickOpen(true)}
                  >
                    Ir a Car Go / Pack Go
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-4 font-marketing text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 shrink-0 text-secondary" aria-hidden />
                  <span>Profesionales verificados</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 shrink-0 text-secondary" aria-hidden />
                  <span>+1.000 usuarios</span>
                </div>
              </div>
            </motion.div>

            {/* Columna visual — rejilla 2 columnas como service-hub */}
            <motion.div
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.65, delay: 0.15 }}
              className="relative mx-auto hidden w-full max-w-xl md:mx-0 md:block md:max-w-none"
            >
              <div className="relative z-10 grid grid-cols-2 gap-5">
                <div className="space-y-5 translate-y-10">
                  <motion.div
                    whileHover={{ rotate: 0, scale: 1.02 }}
                    className="-rotate-2 overflow-hidden rounded-3xl shadow-2xl shadow-primary/20 ring-4 ring-white dark:ring-background sm:-rotate-[4deg]"
                  >
                    <img
                      src="https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=400&h=500&fit=crop"
                      alt="Profesional de servicios"
                      className="h-56 w-full object-cover sm:h-64"
                      width={400}
                      height={500}
                      loading="eager"
                      decoding="async"
                    />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.55 }}
                    className="glass-card ml-auto max-w-[220px] rounded-2xl p-5"
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <div className="rounded-xl bg-green-100 p-2 text-green-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                        <Shield className="h-5 w-5" aria-hidden />
                      </div>
                      <span className="font-bold text-foreground">100% Verificados</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Todos los proveedores pasan por un proceso de verificación.
                    </p>
                  </motion.div>
                </div>

                <div className="space-y-5">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.45 }}
                    className="glass-card max-w-[220px] rounded-2xl p-5"
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <div className="rounded-xl bg-amber-100 p-2 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                        <Star className="h-5 w-5 fill-current" aria-hidden />
                      </div>
                      <span className="font-bold text-foreground">4.9/5 Estrellas</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Calificación promedio de nuestros profesionales.
                    </p>
                  </motion.div>
                  <motion.div
                    whileHover={{ rotate: 0, scale: 1.02 }}
                    className="rotate-2 overflow-hidden rounded-3xl shadow-2xl shadow-secondary/20 ring-4 ring-white dark:ring-background sm:rotate-[4deg]"
                  >
                    <img
                      src="https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400&h=500&fit=crop"
                      alt="Servicio profesional"
                      className="h-56 w-full object-cover sm:h-64"
                      width={400}
                      height={500}
                      loading="lazy"
                      decoding="async"
                    />
                  </motion.div>
                </div>
              </div>

              <div className="pointer-events-none absolute -right-10 -top-10 z-0 h-40 w-40 rounded-full bg-accent/40 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-10 -left-10 z-0 h-32 w-32 rounded-full bg-secondary/40 blur-3xl" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* STATS SECTION */}
      {SHOW_HOME_STATS_SECTION && (
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
      )}

      {/* CATEGORIES SECTION */}
      <section className="py-10 sm:py-14 bg-card/30">
        <div className="container px-4 mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-8 sm:mb-12"
          >
            <Badge variant="outline" className="mb-3 sm:mb-4 border-accent/50 text-accent">
              Categorías
            </Badge>
            <h2 className="font-hero text-2xl font-bold tracking-tight text-foreground sm:text-3xl md:text-4xl mb-2 sm:mb-4">
              Explora todos los servicios
            </h2>
            <p className="text-sm sm:text-lg text-muted-foreground max-w-2xl mx-auto">
              Encuentra el asociado perfecto para cualquier necesidad
            </p>
          </motion.div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 max-w-5xl mx-auto">
            {allHomeServiceItems.map((item, index) => (
              <motion.div
                key={item.key}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                viewport={{ once: true }}
              >
                <Link href={item.href}>
                  <Card className="cursor-pointer group hover:border-primary/50 transition-all duration-300 h-full card-industrial">
                    <CardContent className="p-3 sm:p-5 text-center flex flex-col items-center gap-2 h-full justify-center min-h-[110px]">
                      <div className="p-2.5 rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                        <CategoryIcon name={item.icon} className="w-5 h-5 sm:w-6 sm:h-6" />
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-semibold leading-tight">{item.name}</p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{item.parentName}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>


          <div className="text-center mt-8 sm:mt-10">
            <Link href="/explore">
              <Button
                variant="outline"
                size="lg"
                className="border-primary/50 text-primary hover:bg-primary hover:text-white"
              >
                Ver todas las categorías
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {SHOW_HOME_VIDEO_CAROUSEL ? <HomeVideoCarousel /> : null}

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
            {visibleFeatures.map((feature, index) => (
              <motion.div key={feature.title} variants={itemVariants}>
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
              Únete a miles de asociados y clientes que ya están usando GenFeb.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register">
                <Button size="lg" className="h-14 px-8 rounded-full text-lg bg-primary hover:bg-primary/90">
                  Crear Cuenta Gratis
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              {showBecomePro && (
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="h-14 px-8 rounded-full text-lg border-accent text-accent hover:bg-accent hover:text-white"
                  onClick={() => setAssociateIntroOpen(true)}
                >
                  <Briefcase className="mr-2 h-5 w-5" />
                  Convertirse en Asociado
                </Button>
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
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/25 shrink-0"
                aria-hidden
              >
                <Shield className="h-6 w-6" />
              </span>
              <div>
                <p className="font-bold">GenFeb</p>
                <p className="text-sm text-muted-foreground">Eje central del ecosistema GENFECORP</p>
              </div>
            </div>
            {SHOW_HOME_FOOTER_LINKS && (
              <div className="flex gap-6 text-sm text-muted-foreground">
                <Link href="/about" className="hover:text-foreground transition-colors">Acerca de</Link>
                <Link href="/terms" className="hover:text-foreground transition-colors">Términos</Link>
                <Link href="/privacy" className="hover:text-foreground transition-colors">Privacidad</Link>
                <Link href="/contact" className="hover:text-foreground transition-colors">Contacto</Link>
              </div>
            )}
          </div>
        </div>
      </section>

      <Dialog open={associateIntroOpen} onOpenChange={setAssociateIntroOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Únete como asociado GenFeb</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-1 text-left text-base text-muted-foreground">
                <p>
                  Aquí podrás registrarte como asociado, crear tu perfil y publicar los servicios que ofreces. Los
                  clientes podrán reservarte, chatear contigo y dejarte valoraciones.
                </p>
                <p>
                  El proceso te pedirá datos de tu actividad y, cuando corresponda, pasos de verificación para generar
                  confianza en la plataforma.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setAssociateIntroOpen(false)}>
              Cerrar
            </Button>
            <Button
              type="button"
              onClick={() => {
                setAssociateIntroOpen(false);
                setLocation(becomeHref);
              }}
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={goDriverPickOpen} onOpenChange={setGoDriverPickOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vista conductores Go</DialogTitle>
            <DialogDescription>
              Tienes Car Go y Pack Go en tu perfil. Elige el panel de conductor al que quieres entrar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 pt-1">
            {mobilityAllowed.transport ? (
              <Button
                type="button"
                className="w-full justify-start gap-2"
                onClick={() => {
                  setGoDriverPickOpen(false);
                  setLocation("/go/cargo/driver");
                }}
              >
                <Car className="h-4 w-4 shrink-0" aria-hidden />
                Car Go (conducir)
              </Button>
            ) : null}
            {mobilityAllowed.delivery ? (
              <Button
                type="button"
                variant="secondary"
                className="w-full justify-start gap-2"
                onClick={() => {
                  setGoDriverPickOpen(false);
                  setLocation("/go/pack/driver");
                }}
              >
                <Package className="h-4 w-4 shrink-0" aria-hidden />
                Pack Go (conductor)
              </Button>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setGoDriverPickOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Botón flotante hacia módulos Go: solo conductores con categoría Car Go. */}
      {isCarGoDriver && anyMobilityAllowed && typeof document !== "undefined"
        ? createPortal(
                <div className="fixed bottom-5 right-5 z-[450]">
                  {goQuickOpen ? (
                    <div className="w-[280px] rounded-2xl border border-border bg-background/95 p-3 shadow-xl backdrop-blur">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">Movilidad y envíos</p>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => setGoQuickOpen(false)}
                          aria-label="Cerrar"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Car Go (conducir), Shop Go y Pack Go.
                      </p>
                      <div className="mt-3 grid gap-2">
                        {mobilityAllowed.transport ? (
                        <Button
                          className="w-full justify-start gap-2 rounded-xl"
                          variant="default"
                          onClick={() => {
                            setGoQuickOpen(false);
                            setLocation("/go/cargo/driver");
                          }}
                        >
                          <Car className="h-4 w-4" /> Car Go (conducir)
                        </Button>
                        ) : null}
                        {mobilityAllowed.marketplace ? (
                        <Button
                          className="w-full justify-start gap-2 rounded-xl"
                          variant="secondary"
                          onClick={() => {
                            setGoQuickOpen(false);
                            setLocation("/go/shop");
                          }}
                        >
                          <Store className="h-4 w-4" /> Shop Go
                        </Button>
                        ) : null}
                        {mobilityAllowed.delivery ? (
                        <Button
                          className="w-full justify-start gap-2 rounded-xl"
                          variant="secondary"
                          onClick={() => {
                            setGoQuickOpen(false);
                            setLocation("/go/pack/driver");
                          }}
                        >
                          <Package className="h-4 w-4" /> Pack Go
                        </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <Button className="h-12 rounded-full px-5 shadow-xl" onClick={() => setGoQuickOpen(true)}>
                      Ir a movilidad y módulos Go
                    </Button>
                  )}
                </div>,
                document.body
              )
        : null}
    </div>
  );
}

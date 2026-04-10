import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useShowBecomePro } from "@/hooks/use-show-become-pro";
import { hasAdminRole } from "@/lib/auth-utils";
import { Button } from "@/components/ui/button";
import { useCurrentProvider, useMyServices, useWallet, useCategories } from "@/hooks/use-mango-data";
import { getCategoryDisplayName } from "@shared/default-categories";
import { useExploreCategoryDisplayName } from "@/contexts/ExploreCategoryContext";
import { 
  Briefcase, 
  Calendar, 
  Home, 
  LayoutDashboard, 
  LogOut, 
  Menu, 
  PlusCircle,
  Search, 
  User,
  Shield,
  Vault,
  CreditCard,
  MessageSquare,
  Globe,
  Settings,
  ChevronDown,
  List,
  Pencil,
  Loader2,
  Wrench,
  PackageOpen,
  Package,
  Store,
  Car,
  Banknote,
  Star,
  Smartphone,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import { NotificationBell } from "@/components/NotificationBell";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";

/** Oculta los enlaces/botones "Crear servicio" sin eliminar el código. Cambiar a true para mostrar de nuevo. */
const SHOW_CREATE_SERVICE = false;
/** Oculta el área de "Payments" (en un futuro se podrá configurar). */
const SHOW_PAYMENTS = false;

export function Navigation() {
  const { user, logout, isAuthenticated } = useAuth();
  const showBecomePro = useShowBecomePro();
  const { data: providerProfile } = useCurrentProvider();
  const { data: myServices = [], isLoading: myServicesLoading } = useMyServices({ enabled: !!providerProfile || (user as { role?: string } | null)?.role === "professional" });
  const { data: walletData } = useWallet({ enabled: isAuthenticated });
  const walletBalance = typeof walletData?.wallet === "number" ? walletData.wallet : 0;
  const userRating =
    typeof (walletData as { rating?: number } | undefined)?.rating === "number"
      ? (walletData as { rating: number }).rating
      : 5;
  const formatWallet = (n: number) =>
    new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  const [location] = useLocation();
  const { exploreCategoryDisplayName: exploreCategoryFromContext } = useExploreCategoryDisplayName();
  const { data: categories = [] } = useCategories();
  const exploreCategoryFromUrl = (() => {
    const pathname = location.split("?")[0];
    const search = pathname === "/explore"
      ? (location.includes("?") ? location.split("?")[1] : (typeof window !== "undefined" ? window.location.search.slice(1) : ""))
      : "";
    if (pathname !== "/explore" || !search) return null;
    const params = new URLSearchParams(search.startsWith("?") ? search : search);
    const categoryId = params.get("providerCategoryId");
    if (!categoryId) return null;
    const id = Number(categoryId);
    if (Number.isNaN(id)) return null;
    const cat = categories.find((c) => c.id === id);
    return cat ? getCategoryDisplayName(cat) : null;
  })();
  const exploreCategoryDisplayName = exploreCategoryFromContext ?? exploreCategoryFromUrl;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [myServicesOpen, setMyServicesOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (isDownloading) {
      const timer = setTimeout(() => setIsDownloading(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isDownloading]);

  const handleDownloadClick = () => {
    setIsDownloading(true);
  };

  const isActive = (path: string) => location === path || location.startsWith(path + '/');

  /** Mostrar opciones de profesional si tiene perfil de proveedor o rol professional (por si el perfil no carga). */
  const isProfessional = !!providerProfile || (user as { role?: string } | null)?.role === "professional";
  /** Panel "Mis servicios" visible solo si tiene al menos un servicio activo (condición distinta a Crear servicio). */
  const activeServices = myServices.filter((s) => s.isActive !== false);
  const hasActiveServices = activeServices.length > 0;
  const activeService = activeServices[0] ?? null;

  const getServiceIcon = (service: any) => {
    const iconName = service?.category?.icon ?? service?.category?.type ?? service?.category?.slug;
    const name = String(iconName ?? "").toLowerCase();

    // Preferimos `category.icon` si el backend lo trae (lucide name).
    if (typeof iconName === "string") {
      switch (iconName.toLowerCase()) {
        case "wrench":
          return <Wrench className="h-5 w-5" />;
        case "home":
          return <Home className="h-5 w-5" />;
        case "briefcase":
          return <Briefcase className="h-5 w-5" />;
        case "package":
          return <Package className="h-5 w-5" />;
        case "store":
          return <Store className="h-5 w-5" />;
        case "car":
          return <Car className="h-5 w-5" />;
      }
    }

    // Fallback por slug/type si falta el icon.
    switch (name) {
      case "technical":
        return <Wrench className="h-5 w-5" />;
      case "maintenance":
        return <Home className="h-5 w-5" />;
      case "professional":
        return <Briefcase className="h-5 w-5" />;
      case "delivery":
        return <Package className="h-5 w-5" />;
      case "marketplace":
        return <Store className="h-5 w-5" />;
      case "transport":
        return <Car className="h-5 w-5" />;
      default:
        return <Wrench className="h-5 w-5" />;
    }
  };

  const getServiceBrand = (service: any) => {
    const category = service?.category;
    const brand = getCategoryDisplayName(category);
    return brand || category?.name || "Servicio";
  };

  const NavLinks = () => (
    <>
      <Link href="/" className={`text-sm font-medium transition-colors hover:text-primary ${isActive('/') ? 'text-primary' : 'text-muted-foreground'}`}>
        Inicio
      </Link>
      <Link href="/explore" className={`text-sm font-medium transition-colors hover:text-primary ${isActive('/explore') ? 'text-primary' : 'text-muted-foreground'}`}>
        Explorar
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={`text-sm font-medium transition-colors hover:text-primary flex items-center gap-1 ${isActive('/services') || isActive('/booking') ? 'text-primary' : 'text-muted-foreground'}`}>
            Servicios <ChevronDown className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="bg-card border-border">
          <DropdownMenuItem>
            <Link href="/explore" className="flex items-center gap-2 w-full">
              <Briefcase className="h-4 w-4" />
              <span>Todos los Servicios</span>
            </Link>
          </DropdownMenuItem>
          {isAuthenticated && (
            <DropdownMenuItem>
              <Link href="/booking" className="flex items-center gap-2 w-full">
                <Calendar className="h-4 w-4" />
                <span>Reservas</span>
              </Link>
            </DropdownMenuItem>
          )}
          {SHOW_CREATE_SERVICE && isProfessional && (
            <DropdownMenuItem>
              <Link href="/create-service" className="flex items-center gap-2 w-full">
                <PlusCircle className="h-4 w-4" />
                <span>Crear servicio</span>
              </Link>
            </DropdownMenuItem>
          )}
          {isProfessional && !myServicesLoading && hasActiveServices && (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setMyServicesOpen(true);
              }}
            >
              <List className="h-4 w-4" />
              <span>Mi Servicio</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <Link href="/categories" className="flex items-center gap-2 w-full">
              <Search className="h-4 w-4" />
              <span>Categorías</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {isAuthenticated && (
        <>
          <Link href="/vault" className={`text-sm font-medium transition-colors hover:text-primary ${isActive('/vault') ? 'text-primary' : 'text-muted-foreground'}`}>
            Documentos
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`text-sm font-medium transition-colors hover:text-primary flex items-center gap-1 ${isActive('/recharge') || isActive('/movimientos') ? 'text-primary' : 'text-muted-foreground'}`}>
                Movimientos <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-card border-border">
              <DropdownMenuItem asChild>
                <Link href="/recharge" className="flex items-center gap-2 w-full">
                  <Banknote className="h-4 w-4" />
                  <span>Recargar Saldo Genfeb</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/movimientos" className="flex items-center gap-2 w-full">
                  <CreditCard className="h-4 w-4" />
                  <span>Historial de movimientos</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </>
  );

  return (
    <>
    <nav className="sticky top-0 z-50 w-full border-b border-primary/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-14 min-[400px]:h-16 max-w-7xl items-center justify-between gap-1 px-2 min-[400px]:px-4 sm:px-6 lg:px-8 mx-auto min-w-0">
        
        {/* Logo & Desktop Nav */}
        <div className="flex items-center gap-8">
          <Link href={exploreCategoryDisplayName ? "/explore" : "/"} className="flex items-center gap-1.5 min-[400px]:gap-2 shrink-0">
            <img
              src="/favicon.png"
              alt=""
              className="h-7 w-7 min-[400px]:h-8 min-[400px]:w-8 shrink-0 bg-white object-contain"
              width={32}
              height={32}
              decoding="async"
              aria-hidden
            />
            <span className="sr-only">GenFeb, inicio</span>
            <span className="hidden text-xl font-bold font-display text-primary sm:inline-block tracking-wider">
              {exploreCategoryDisplayName ?? <>GENFEB</>}
            </span>
          </Link>
          <div className="hidden lg:flex items-center gap-6">
            <NavLinks />
          </div>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-1 min-[400px]:gap-2 sm:gap-3 shrink-0 min-w-0">
          
          {/* Language Selector */}
          <Button variant="ghost" size="sm" className="hidden sm:flex items-center gap-2 text-muted-foreground hover:text-primary">
                <Globe className="h-4 w-4" />
                <span>ES</span>
              </Button>

          {/* Saldo Genfeb en cabecera (importe + valoración) */}
          {isAuthenticated && (
            <div
              className="flex items-center gap-1.5 min-w-0 px-2 py-1.5 min-[400px]:gap-2 min-[400px]:px-2.5 min-[400px]:py-1.5 rounded-md min-[400px]:rounded-lg bg-primary/10 border border-primary/20 text-primary max-w-[100%]"
              title="Saldo Genfeb y valoración"
            >
              <Banknote className="h-4 w-4 min-[400px]:h-4 min-[400px]:w-4 shrink-0" aria-hidden />
              <span className="text-sm min-[400px]:text-sm font-semibold tabular-nums truncate max-w-[5.5rem] min-[400px]:max-w-[7rem] sm:max-w-[8rem]">
                {walletData === undefined ? "—" : formatWallet(walletBalance)}
              </span>
              <span className="mx-0.5 min-[400px]:mx-1 h-3 min-[400px]:h-4 w-px bg-primary/30 shrink-0 hidden min-[400px]:block" aria-hidden />
              <span className="hidden min-[400px]:flex items-center gap-0.5 text-xs sm:text-sm font-semibold tabular-nums shrink-0">
                <Star className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500 fill-amber-500" aria-hidden />
                <span className="text-foreground">{Number(userRating).toFixed(1)}</span>
              </span>
            </div>
          )}
          
          {isAuthenticated && <NotificationBell />}
          
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Button 
              variant="ghost" 
              size="sm" 
              className={`hidden sm:flex items-center gap-2 transition-colors ${isDownloading ? 'text-green-500 bg-green-500/10' : 'text-mango-orange hover:bg-mango-orange/10'}`}
              asChild
              onClick={handleDownloadClick}
            >
              <a href="/Genfeb.apk" download="Genfeb.apk">
                <AnimatePresence mode="wait">
                  {isDownloading ? (
                    <motion.div
                      key="check"
                      initial={{ scale: 0, rotate: -45 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0 }}
                      className="flex items-center gap-2"
                    >
                      <Check className="h-4 w-4" />
                      <span className="hidden md:inline">¡Listo!</span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="phone"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="flex items-center gap-2"
                    >
                      <Smartphone className="h-4 w-4" />
                      <span className="hidden md:inline">Descargar App</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </a>
            </Button>
          </motion.div>
          
          {isAuthenticated ? (
            <>
              {isProfessional ? (
                 <Button variant="ghost" className="hidden sm:flex items-center gap-2 text-primary" asChild>
                   <Link href="/professional-dashboard">
                     <Briefcase className="h-4 w-4" />
                     <span>Panel Asociado</span>
                   </Link>
                 </Button>
              ) : showBecomePro ? (
                <Button variant="outline" className="hidden sm:flex border-primary text-primary hover:bg-primary/10" asChild>
                  <Link href="/become-pro">Convertirse en Asociado</Link>
                </Button>
              ) : (
                 <Button variant="ghost" className="hidden sm:flex items-center gap-2 text-primary" asChild>
                   <Link href="/dashboard">
                     <LayoutDashboard className="h-4 w-4" />
                     <span>Dashboard</span>
                   </Link>
                 </Button>
              )}
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 bg-card border-border" align="end">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium text-foreground">Mi Cuenta</p>
                      <p className="text-xs text-muted-foreground">{user?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {isProfessional && (
                    <DropdownMenuItem asChild>
                      <Link href="/professional-dashboard" className="flex items-center">
                        <Briefcase className="mr-2 h-4 w-4" />
                        Panel Asociado
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard" className="flex items-center">
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      Panel de Control
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/bookings" className="flex items-center">
                      <Calendar className="mr-2 h-4 w-4" />
                      Mis Reservas
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/vault" className="flex items-center">
                      <Vault className="mr-2 h-4 w-4" />
                      Mis documentos
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/recharge" className="flex items-center">
                      <Banknote className="mr-2 h-4 w-4" />
                      Recargar Saldo Genfeb
                    </Link>
                  </DropdownMenuItem>
                  {SHOW_PAYMENTS && (
                    <DropdownMenuItem asChild>
                      <Link href="/payments" className="flex items-center">
                        <CreditCard className="mr-2 h-4 w-4" />
                        Pagos
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link href="/chat" className="flex items-center">
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Mensajes
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="flex items-center">
                      <Settings className="mr-2 h-4 w-4" />
                      Configuración
                    </Link>
                  </DropdownMenuItem>
                  {hasAdminRole(user) && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href="/admin" className="flex items-center">
                          <Shield className="mr-2 h-4 w-4" />
                          Admin Panel
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/admin/create-role" className="flex items-center">
                          <Shield className="mr-2 h-4 w-4" />
                          Crear rol
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => logout()}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Cerrar Sesión
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button variant="ghost" size="icon" className="hidden sm:flex text-muted-foreground hover:text-primary" title="Configuración" asChild>
                <Link href="/settings"><Settings className="h-5 w-5" /></Link>
              </Button>
              <Button variant="ghost" className="text-muted-foreground hover:text-primary" asChild>
                <Link href="/login">Iniciar Sesión</Link>
              </Button>
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25" asChild>
                <Link href="/register">Registrarse</Link>
              </Button>
            </>
          )}

          {/* Mobile Menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] bg-card border-l border-border">
              {/* Saldo en menú móvil */}
              {isAuthenticated && (
                <div className="flex items-center gap-2 mt-6 mb-2 px-1 py-3 rounded-xl bg-primary/10 border border-primary/20">
                  <Banknote className="h-5 w-5 text-primary shrink-0" />
                  <span className="text-base font-semibold text-primary tabular-nums">
                    {walletData === undefined ? "—" : formatWallet(walletBalance)}
                  </span>
                  <span className="mx-1 h-5 w-px bg-primary/30" aria-hidden />
                  <span className="flex items-center gap-1 text-base font-semibold tabular-nums">
                    <Star className="h-5 w-5 text-amber-500 fill-amber-500" aria-hidden />
                    <span className="text-foreground">{Number(userRating).toFixed(1)}</span>
                  </span>
                </div>
              )}
              <div className="flex flex-col gap-4 mt-4">
                <Link href="/" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                  Inicio
                </Link>
                <Link href="/explore" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                  Explorar Servicios
                </Link>
                {isAuthenticated && (
                  <>
                    <Link href="/booking" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                      Reservar
                    </Link>
                    <Link href="/bookings" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                      Mis Reservas
                    </Link>
                  </>
                )}
                {isProfessional && (
                  <>
                    <Link href="/professional-dashboard" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                      Panel Asociado
                    </Link>
                    {SHOW_CREATE_SERVICE && (
                      <Link href="/create-service" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                        Crear servicio
                      </Link>
                    )}
                    {!myServicesLoading && hasActiveServices && (
                      <button
                        type="button"
                        className="text-lg font-medium text-left w-full hover:text-primary transition-colors"
                        onClick={() => {
                          setMobileOpen(false);
                          setMyServicesOpen(true);
                        }}
                      >
                        Mi Servicio
                      </button>
                    )}
                  </>
                )}
                {isAuthenticated && (
                  <>
                    <Link href="/vault" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                      Mis documentos
                    </Link>
                    <Link href="/recharge" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                      Recargar Saldo Genfeb
                    </Link>
                    <Link href="/movimientos" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                      Historial de movimientos
                    </Link>
                  </>
                )}
                <Link href="/dashboard" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                  Mi Panel
                </Link>
                {SHOW_PAYMENTS && (
                  <Link href="/payments" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                    Pagos
                  </Link>
                )}
                <Link href="/chat" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                  Mensajes
                </Link>
                {!isAuthenticated && (
                  <>
                    <Link href="/settings" className="text-lg font-medium text-muted-foreground" onClick={() => setMobileOpen(false)}>
                      Configuración
                    </Link>
                    <div className="flex flex-col gap-2 mt-4">
                      <Button variant="outline" asChild className="w-full">
                        <Link href="/login" onClick={() => setMobileOpen(false)}>Iniciar Sesión</Link>
                      </Button>
                      <Button asChild className="w-full">
                        <Link href="/register" onClick={() => setMobileOpen(false)}>Registrarse</Link>
                      </Button>
                    </div>
                  </>
                )}
                
                <motion.div 
                  className="border-t border-border mt-6 pt-6"
                  whileTap={{ scale: 0.98 }}
                >
                  <a 
                    href="/Genfeb.apk" 
                    download="Genfeb.apk"
                    className={`flex items-center gap-3 p-4 rounded-xl border transition-all duration-300 shadow-sm ${
                      isDownloading 
                        ? 'bg-green-500/10 text-green-600 border-green-500/30' 
                        : 'bg-mango-orange/10 text-mango-orange border-mango-orange/20 hover:bg-mango-orange/20'
                    }`}
                    onClick={() => {
                      handleDownloadClick();
                      setTimeout(() => setMobileOpen(false), 1500);
                    }}
                  >
                    <div className="flex shrink-0">
                      <AnimatePresence mode="wait">
                        {isDownloading ? (
                          <motion.div
                            key="check-mobile"
                            initial={{ scale: 0, rotate: -45 }}
                            animate={{ scale: 1, rotate: 0 }}
                          >
                            <Check className="h-6 w-6 text-green-500" />
                          </motion.div>
                        ) : (
                          <motion.div
                            key="smartphone-mobile"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                          >
                            <Smartphone className="h-6 w-6" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold opacity-70">
                        {isDownloading ? 'Iniciando descarga...' : 'App para Android'}
                      </span>
                      <span className="font-bold text-lg">
                        {isDownloading ? '¡Éxito!' : 'Descargar APK'}
                      </span>
                    </div>
                  </a>
                </motion.div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>

    {/* Panel Mi Servicio */}
    <Sheet open={myServicesOpen} onOpenChange={setMyServicesOpen}>
      <SheetContent
        side="left"
        // En móviles (ej. 344x) evita que el panel se vea “demasiado largo” (se queda fijo arriba).
        className="w-[360px] max-w-[92vw] bg-white border-r border-border overflow-y-auto rounded-r-xl shadow-lg top-0 bottom-auto h-auto max-h-[calc(100vh-1rem)] p-0"
      >
        <div className="p-6">
          <div className="pb-4 border-b border-border/80">
            <h2 className="text-xl font-bold text-foreground tracking-tight">Mi Servicio</h2>
            <p className="text-sm text-muted-foreground mt-1">Tu publicación destacada</p>
          </div>

          <div className="mt-5 space-y-4">
            {myServicesLoading ? (
              <Card className="rounded-xl border border-border/60 bg-white shadow-sm overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
                    <div className="flex-1 min-w-0 space-y-2">
                      <Skeleton className="h-5 w-[75%]" />
                      <Skeleton className="h-4 w-[50%]" />
                      <Skeleton className="h-4 w-[90%] mt-3" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : activeService == null ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <div className="rounded-full bg-muted/60 p-6 mb-4">
                  <PackageOpen className="h-12 w-12 text-muted-foreground" />
                </div>
                <p className="text-base font-medium text-foreground mb-1">Aún no has creado servicios</p>
                <p className="text-sm text-muted-foreground mb-6 max-w-[260px]">
                  ¡Empieza ahora y publica tu primer servicio para que los clientes puedan reservarlo!
                </p>
                {SHOW_CREATE_SERVICE && (
                  <Button className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm" asChild>
                    <Link href="/create-service" onClick={() => setMyServicesOpen(false)}>
                      <PlusCircle className="h-4 w-4 mr-2" />
                      Crear servicio
                    </Link>
                  </Button>
                )}
              </div>
            ) : (
              <TooltipProvider delayDuration={300}>
                <Card className="rounded-xl border border-border/60 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                        {getServiceIcon(activeService)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-base text-foreground truncate">{activeService.title ?? "—"}</h3>

                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <Badge
                            variant="outline"
                            className="bg-amber-500/15 text-amber-700 dark:text-amber-400 dark:bg-amber-500/20 border-amber-500/30 font-semibold"
                          >
                            {activeService.price ?? "—"} USD/h
                          </Badge>
                          <span className="text-xs text-muted-foreground">{getServiceBrand(activeService)}</span>
                        </div>

                        {activeService.subcategory?.name && (
                          <div className="text-xs text-muted-foreground mt-1">Subcategoría: {activeService.subcategory.name}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                              asChild
                            >
                              <Link href={`/edit-service/${activeService.id}`} onClick={() => setMyServicesOpen(false)}>
                                <Pencil className="h-4 w-4" />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Editar</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>

                    <div className="mt-3 text-sm text-muted-foreground break-words leading-relaxed">
                      {activeService.description ? activeService.description : "—"}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/service/${activeService.id}`} onClick={() => setMyServicesOpen(false)}>
                          Ver en el sitio
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TooltipProvider>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
    </>
  );
}

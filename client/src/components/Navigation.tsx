import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useShowBecomePro } from "@/hooks/use-show-become-pro";
import { useAssociateOnboardingIncomplete } from "@/hooks/use-associate-onboarding-incomplete";
import { hasAdminRole, canAccessAssociateActivityDashboard } from "@/lib/auth-utils";
import { Button } from "@/components/ui/button";
import { useCurrentProvider, useMyServices, useWallet, useCategories, useCategoryVisibility } from "@/hooks/use-mango-data";
import { isCarGoProvider } from "@shared/provider-car-go";
import { PROVIDER_WALLET_FLOOR_USD } from "@shared/wallet-limits";
import { FEATURE_WALLET_RECHARGE_UI_ENABLED, FEATURE_OFF_PLATFORM_COMMISSION_ENABLED } from "@shared/feature-flags";
import { effectiveHiddenCategorySlugs, getCategoryDisplayName } from "@shared/default-categories";
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
  AlertTriangle,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useEffect, useMemo } from "react";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggleHeaderButton } from "@/components/ThemeToggle";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/contexts/ThemeContext";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";

/** Oculta los enlaces/botones "Crear servicio" sin eliminar el código. Cambiar a true para mostrar de nuevo. */
const SHOW_CREATE_SERVICE = false;
/** Oculta el área de "Payments" (en un futuro se podrá configurar). */
const SHOW_PAYMENTS = false;

function MobileDarkModePreference() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3 py-3">
      <div className="min-w-0">
        <Label htmlFor="nav-mobile-dark" className="text-base font-medium text-foreground cursor-pointer">
          Modo oscuro
        </Label>
        <p className="text-xs text-muted-foreground mt-0.5">Igual que en escritorio — se guarda en el navegador</p>
      </div>
      <Switch
        id="nav-mobile-dark"
        checked={theme === "dark"}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        aria-label={theme === "dark" ? "Desactivar modo oscuro" : "Activar modo oscuro"}
      />
    </div>
  );
}

export function Navigation() {
  const { user, logout, isAuthenticated } = useAuth();
  const showBecomePro = useShowBecomePro();
  const { data: providerProfile } = useCurrentProvider();
  /** Incluir `user.provider`: si el perfil remoto aún no cargó, igual debemos pedir /api/me/services. */
  const shouldFetchMyServices =
    isAuthenticated &&
    (!!providerProfile ||
      !!(user as { provider?: unknown } | null)?.provider ||
      (user as { role?: string } | null)?.role === "professional");
  const { data: myServices = [], isLoading: myServicesLoading } = useMyServices({
    enabled: shouldFetchMyServices,
  });
  const { data: walletData } = useWallet({ enabled: isAuthenticated && FEATURE_WALLET_RECHARGE_UI_ENABLED });
  const walletBalance = typeof walletData?.wallet === "number" ? walletData.wallet : 0;
  const providerWalletFloorUsd =
    typeof (walletData as { providerWalletFloorUsd?: number })?.providerWalletFloorUsd === "number"
      ? (walletData as { providerWalletFloorUsd: number }).providerWalletFloorUsd
      : PROVIDER_WALLET_FLOOR_USD;
  const isProviderDebtCapped = !!(walletData as { isProviderDebtCapped?: boolean })?.isProviderDebtCapped;
  const userRating = FEATURE_WALLET_RECHARGE_UI_ENABLED
    ? typeof (walletData as { rating?: number } | undefined)?.rating === "number"
      ? (walletData as { rating: number }).rating
      : 5
    : user != null && typeof (user as { rating?: unknown }).rating === "number"
      ? (user as unknown as { rating: number }).rating
      : 5;
  const formatWallet = (n: number) =>
    new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  const formatWalletDetailed = (n: number) =>
    new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const [location] = useLocation();
  const { exploreCategoryDisplayName: exploreCategoryFromContext } = useExploreCategoryDisplayName();
  const { data: categories = [] } = useCategories();
  const { data: visibility } = useCategoryVisibility();
  const hiddenSlugs = useMemo(() => new Set(effectiveHiddenCategorySlugs(visibility?.hiddenSlugs)), [visibility]);
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
  const hasProviderForDashboard =
    !!providerProfile || !!(user as { provider?: unknown } | null)?.provider;
  const canAccessActivityDashboard = canAccessAssociateActivityDashboard(user, hasProviderForDashboard);
  /** Panel "Mis servicios" visible solo si tiene al menos un servicio activo (condición distinta a Crear servicio). */
  const activeServices = myServices.filter((s) => s.isActive !== false);
  /** Cualquier servicio propio (aunque esté inactivo) para poder abrir el panel y editar. */
  const hasMyServiceNav = activeServices.length > 0 || myServices.length > 0;
  const panelService = activeServices[0] ?? myServices[0] ?? null;

  const isAdmin = (user as { role?: string } | null)?.role === "admin";
  /** Conductor Car Go (verificado o no): acceso a vista driver (recibir) en Go. */
  const isCarGoDriver = !!providerProfile && isCarGoProvider(providerProfile, categories);
  const isVerifiedCarGoDriver = providerProfile?.isVerified === true && isCarGoDriver;
  const canSeeMobility = !hiddenSlugs.has("transport");
  const { incomplete: associateOnboardingIncomplete, associatePanelHref } = useAssociateOnboardingIncomplete();
  const associateNavPath = location.split("?")[0];
  const showAssociateOnboardingBanner =
    isAuthenticated && associateOnboardingIncomplete && associateNavPath !== "/become-pro";
  /** Panel / continuar alta: perfil proveedor, rol professional, o onboarding marcado en localStorage. */
  const showAssociatePanelButton = !isVerifiedCarGoDriver && (isProfessional || associateOnboardingIncomplete);

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
          {canSeeMobility && (isAdmin || (isProfessional && !myServicesLoading && isCarGoDriver)) && (
            <DropdownMenuItem asChild>
              <Link href="/go/taxi/driver" className="flex items-center gap-2 w-full">
                <Car className="h-4 w-4" />
                <span>Driver!</span>
              </Link>
            </DropdownMenuItem>
          )}
          {isProfessional && !myServicesLoading && hasMyServiceNav && !isVerifiedCarGoDriver && (
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
          {FEATURE_WALLET_RECHARGE_UI_ENABLED && (
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
                    <span>Añadir saldo</span>
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
          )}
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
            <span
              className="flex h-7 w-7 min-[400px]:h-8 min-[400px]:w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background p-0.5 ring-1 ring-border"
              aria-hidden
            >
              <img
                src="/genfeb-logo-new.png"
                alt=""
                className="h-full w-full object-contain"
                width={32}
                height={32}
                decoding="async"
              />
            </span>
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

          <ThemeToggleHeaderButton className="hidden lg:flex" />

          {/* Saldo Genfeb en cabecera (importe + valoración) — oculto si no hay UI de wallet */}
          {isAuthenticated && FEATURE_WALLET_RECHARGE_UI_ENABLED && (
            <div
              className="flex items-center gap-1.5 min-w-0 px-2 py-1.5 min-[400px]:gap-2 min-[400px]:px-2.5 min-[400px]:py-1.5 rounded-md min-[400px]:rounded-lg bg-primary/10 border border-primary/20 text-primary max-w-[100%]"
              title="Saldo GenFeb y valoración"
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
          {isAuthenticated && !FEATURE_WALLET_RECHARGE_UI_ENABLED && (
            <div
              className="hidden min-[400px]:flex items-center gap-1 rounded-md px-2 py-1.5 bg-primary/10 border border-primary/20 text-primary"
              title="Valoración"
            >
              <Star className="h-4 w-4 text-amber-500 fill-amber-500 shrink-0" aria-hidden />
              <span className="text-sm font-semibold tabular-nums text-foreground">{Number(userRating).toFixed(1)}</span>
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
              {showAssociatePanelButton ? (
                 <Button variant="ghost" className="hidden sm:flex items-center gap-2 text-primary" asChild>
                   <Link href={associatePanelHref}>
                     <Briefcase className="h-4 w-4" />
                     <span>Panel Asociado</span>
                   </Link>
                 </Button>
              ) : showBecomePro && !isProfessional && !associateOnboardingIncomplete ? (
                <Button variant="outline" className="hidden sm:flex border-primary text-primary hover:bg-primary/10" asChild>
                  <Link href="/become-pro">Convertirse en Asociado</Link>
                </Button>
              ) : canAccessActivityDashboard ? (
                 <Button variant="ghost" className="hidden sm:flex items-center gap-2 text-primary" asChild>
                   <Link href="/dashboard">
                     <LayoutDashboard className="h-4 w-4" />
                     <span>Dashboard</span>
                   </Link>
                 </Button>
              ) : null}
              
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
                  {showAssociatePanelButton && (
                    <DropdownMenuItem asChild>
                      <Link href={associatePanelHref} className="flex items-center">
                        <Briefcase className="mr-2 h-4 w-4" />
                        Panel Asociado
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {canAccessActivityDashboard && (
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard" className="flex items-center">
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      Panel de Control
                    </Link>
                  </DropdownMenuItem>
                  )}
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
                  {FEATURE_WALLET_RECHARGE_UI_ENABLED && (
                    <DropdownMenuItem asChild>
                      <Link href="/recharge" className="flex items-center">
                        <Banknote className="mr-2 h-4 w-4" />
                        Añadir saldo
                      </Link>
                    </DropdownMenuItem>
                  )}
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
              {isAuthenticated && FEATURE_WALLET_RECHARGE_UI_ENABLED && (
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
              {isAuthenticated && !FEATURE_WALLET_RECHARGE_UI_ENABLED && (
                <div className="flex items-center gap-2 mt-6 mb-2 px-1 py-3 rounded-xl bg-primary/10 border border-primary/20">
                  <Star className="h-5 w-5 text-amber-500 fill-amber-500 shrink-0" aria-hidden />
                  <span className="text-base font-semibold tabular-nums text-foreground">{Number(userRating).toFixed(1)}</span>
                </div>
              )}
              <div className="mt-4 lg:hidden">
                <MobileDarkModePreference />
              </div>
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
                {showAssociatePanelButton && (
                  <>
                    <Link href={associatePanelHref} className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                      Panel Asociado
                    </Link>
                    {SHOW_CREATE_SERVICE && (
                      <Link href="/create-service" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                        Crear servicio
                      </Link>
                    )}
                    {!myServicesLoading && hasMyServiceNav && (
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
                {canSeeMobility && (isAdmin || (isProfessional && isCarGoDriver && !myServicesLoading)) && (
                  <Link
                    href="/go/taxi/driver"
                    className="text-lg font-medium flex items-center gap-2 hover:text-primary transition-colors"
                    onClick={() => setMobileOpen(false)}
                  >
                    <Car className="h-5 w-5 shrink-0" />
                    Driver!
                  </Link>
                )}
                {isAuthenticated && (
                  <>
                    <Link href="/vault" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                      Mis documentos
                    </Link>
                    {FEATURE_WALLET_RECHARGE_UI_ENABLED && (
                      <>
                        <Link href="/recharge" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                          Añadir saldo
                        </Link>
                        <Link href="/movimientos" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                          Historial de movimientos
                        </Link>
                      </>
                    )}
                  </>
                )}
                {canAccessActivityDashboard && (
                <Link href="/dashboard" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                  Mi Panel
                </Link>
                )}
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
      {showAssociateOnboardingBanner && (
        <div className="border-t border-primary/20 bg-muted/50 dark:border-primary/30 dark:bg-muted/40">
          <div className="container max-w-7xl mx-auto px-2 min-[400px]:px-4 sm:px-6 lg:px-8 py-2">
            <Alert className="rounded-lg border-border bg-card py-2 text-card-foreground shadow-sm sm:py-3 dark:bg-card/90 [&>svg]:text-secondary">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              <AlertTitle className="text-sm font-medium text-foreground">Registro de asociado sin terminar</AlertTitle>
              <AlertDescription className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span>Puedes continuar donde lo dejaste y completar tu perfil como asociado.</span>
                <Button size="sm" className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90" asChild>
                  <Link href="/become-pro">Continuar registro</Link>
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        </div>
      )}
    </nav>

    {/* Panel Mi Servicio */}
    <Sheet open={myServicesOpen} onOpenChange={setMyServicesOpen}>
      <SheetContent
        side="left"
        // En móviles (ej. 344x) evita que el panel se vea “demasiado largo” (se queda fijo arriba).
        className="w-[360px] max-w-[92vw] bg-card border-r border-border overflow-y-auto rounded-r-xl shadow-lg top-0 bottom-auto h-auto max-h-[calc(100vh-1rem)] p-0"
      >
        <div className="p-6">
          <div className="pb-4 border-b border-border/80">
            <h2 className="text-xl font-bold text-foreground tracking-tight">Mi Servicio</h2>
            <p className="text-sm text-muted-foreground mt-1">Tu publicación destacada</p>
          </div>

          {providerProfile && FEATURE_WALLET_RECHARGE_UI_ENABLED ? (
            <div className="mt-5 rounded-xl border border-border/70 bg-muted/30 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Cartera GenFeb</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-2.5">
                  <p className="text-[10px] font-medium text-muted-foreground">Saldo actual</p>
                  <p
                    className={cn(
                      "mt-0.5 text-base font-bold tabular-nums leading-tight",
                      walletBalance < 0 && "text-amber-600 dark:text-amber-400"
                    )}
                  >
                    {walletData === undefined ? "—" : formatWalletDetailed(walletBalance)}
                  </p>
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2.5 dark:bg-amber-500/10">
                  <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                    <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" aria-hidden />
                    Máx. saldo negativo
                  </p>
                  <p className="mt-0.5 text-base font-bold tabular-nums leading-tight text-foreground">
                    {walletData === undefined ? "—" : formatWalletDetailed(providerWalletFloorUsd)}
                  </p>
                </div>
              </div>
              {FEATURE_OFF_PLATFORM_COMMISSION_ENABLED ? (
                isProviderDebtCapped ? (
                  <p className="mt-3 text-[11px] leading-snug text-amber-950 dark:text-amber-100 border-t border-amber-500/25 pt-3">
                    Llegaste al límite de deuda: no podrás aceptar más servicios pagados en efectivo o transferencia hasta
                    recargar (donde aplique). Podrás seguir con pago en Saldo GenFeb.
                  </p>
                ) : (
                  <p className="mt-3 text-[10px] text-muted-foreground leading-snug">
                    Con efectivo o transferencia, GenFeb retiene comisión; el saldo no puede bajar de este piso.
                  </p>
                )
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 space-y-4">
            {myServicesLoading ? (
              <Card className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
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
            ) : panelService == null ? (
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
                <Card className="rounded-xl border border-border/60 bg-card shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                        {getServiceIcon(panelService)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-base text-foreground truncate">{panelService.title ?? "—"}</h3>

                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <span className="text-xs text-muted-foreground">{getServiceBrand(panelService)}</span>
                        </div>

                        {panelService.subcategory?.name && (
                          <div className="text-xs text-muted-foreground mt-1">Subcategoría: {panelService.subcategory.name}</div>
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
                              <Link href={`/edit-service/${panelService.id}`} onClick={() => setMyServicesOpen(false)}>
                                <Pencil className="h-4 w-4" />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Editar</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>

                    <div className="mt-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Descripción</p>
                      <div
                        className="max-h-36 sm:max-h-44 overflow-y-auto overscroll-contain rounded-md border border-border/50 bg-muted/15 px-2.5 py-2 text-sm text-muted-foreground break-words leading-relaxed [scrollbar-gutter:stable]"
                        tabIndex={0}
                        role="region"
                        aria-label="Descripción del servicio"
                      >
                        {panelService.description ? panelService.description : "—"}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/service/${panelService.id}`} onClick={() => setMyServicesOpen(false)}>
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

import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useShowBecomePro } from "@/hooks/use-show-become-pro";
import { useAssociateOnboardingIncomplete } from "@/hooks/use-associate-onboarding-incomplete";
import {
  hasAdminRole,
  canAccessActivityDashboard,
  canAccessPromocionesPanel,
  canAccessCentralDashboard,
} from "@/lib/auth-utils";
import { userCanActAsAssociate } from "@/lib/user-permissions";
import { isGoVehicleProvider } from "@shared/provider-car-go";
import { isCentralRole } from "@shared/roles";
import { Button } from "@/components/ui/button";
import { useCurrentProvider, useMyServices, useWallet, useCategories, useCategoryVisibility, useProviderVehicle } from "@/hooks/use-mango-data";
import { isCarGoProvider } from "@shared/provider-car-go";
import { providerHasGoBrand, type ProviderGoRef } from "@shared/provider-go";
import { FEATURE_WALLET_RECHARGE_UI_ENABLED } from "@shared/feature-flags";
import { effectiveHiddenCategorySlugs, getCategoryDisplayName } from "@shared/default-categories";
import { useExploreCategoryDisplayName } from "@/contexts/ExploreCategoryContext";
import { 
  Briefcase, 
  Calendar, 
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
  Car,
  Banknote,
  Star,
  Smartphone,
  AlertTriangle,
  Building2,
  Ticket,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  const actsAsAssociate =
    !!providerProfile ||
    !!(user as { provider?: unknown } | null)?.provider ||
    userCanActAsAssociate(user);
  const shouldFetchMyServices = isAuthenticated && actsAsAssociate;
  const { data: myServices = [], isLoading: myServicesLoading } = useMyServices({
    enabled: shouldFetchMyServices,
  });
  const { data: walletData } = useWallet({ enabled: isAuthenticated && FEATURE_WALLET_RECHARGE_UI_ENABLED });
  const walletBalance = typeof walletData?.wallet === "number" ? walletData.wallet : 0;
  const userRating = FEATURE_WALLET_RECHARGE_UI_ENABLED
    ? typeof (walletData as { rating?: number } | undefined)?.rating === "number"
      ? (walletData as { rating: number }).rating
      : 5
    : user != null && typeof (user as { rating?: unknown }).rating === "number"
      ? (user as unknown as { rating: number }).rating
      : 5;
  const formatWallet = (n: number) =>
    new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
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
  const navbarBrandLabel = exploreCategoryDisplayName?.trim() || "GENFEB";
  const [mobileOpen, setMobileOpen] = useState(false);
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

  /** Asociado: perfil proveedor o permisos/rol de asociado en el catálogo. */
  const isProfessional = actsAsAssociate;
  const hasProviderForDashboard =
    !!providerProfile || !!(user as { provider?: unknown } | null)?.provider;
  const isGoAssociateDriver =
    !!providerProfile && isGoVehicleProvider(providerProfile, categories);
  const canAccessActivityDashboardNav = canAccessActivityDashboard(user, hasProviderForDashboard);
  const showPromocionesNav =
    isAuthenticated &&
    canAccessPromocionesPanel(user, hasProviderForDashboard, {
      isGoVehicleProvider: isGoAssociateDriver,
    });
  /** Asociado con perfil: siempre puede abrir Mis servicios (aunque la suscripción de catálogo haya vencido). */
  const showMyServicesNav = isProfessional && hasProviderForDashboard;

  const { data: providerVehicle, isLoading: providerVehicleLoading } = useProviderVehicle({
    enabled: isAuthenticated && isProfessional && !!providerProfile,
  });
  const canUseGoDriverConducir =
    isProfessional &&
    !!providerProfile &&
    !!providerVehicle &&
    typeof providerVehicle.vehicle_type === "string" &&
    providerHasGoBrand(providerProfile as ProviderGoRef, "transport", categories) &&
    providerHasGoBrand(providerProfile as ProviderGoRef, "delivery", categories);

  const isAdmin = (user as { role?: string } | null)?.role === "admin";
  const showCentralNav = canAccessCentralDashboard(user);
  const isCentralUser = isCentralRole((user as { role?: string } | null)?.role);
  const homeNavHref = isCentralUser ? "/central" : "/";
  const homeNavLabel = isCentralUser ? "Ir a tu Central" : "Inicio";
  /** Conductor Car Go (verificado o no): acceso a vista driver (recibir) en Go. */
  const isCarGoDriver = !!providerProfile && isCarGoProvider(providerProfile, categories);
  const isVerifiedCarGoDriver = providerProfile?.isVerified === true && isCarGoDriver;
  const canSeeMobility = !hiddenSlugs.has("transport");
  const { incomplete: associateOnboardingIncomplete, associatePanelHref } = useAssociateOnboardingIncomplete();
  const associateNavPath = location.split("?")[0];
  const showAssociateOnboardingBanner =
    isAuthenticated &&
    associateOnboardingIncomplete &&
    associateNavPath !== "/become-pro" &&
    !hasAdminRole(user);
  /** Panel / continuar alta: perfil proveedor, rol professional, o onboarding marcado en localStorage. */
  const showAssociatePanelButton = !isVerifiedCarGoDriver && (isProfessional || associateOnboardingIncomplete);
  /** Acceso al panel de actividad del asociado para drivers (ahora permitido). */
  const showAssociateActivityForDriver = isVerifiedCarGoDriver;
  const associateActivityHref = "/professional-dashboard";

  const NavLinks = () => (
    <div className="flex items-center gap-6 flex-nowrap">
      <Link href={homeNavHref} className={`text-sm font-medium whitespace-nowrap transition-colors hover:text-primary ${isActive(homeNavHref) || (homeNavHref === '/' && isActive('/')) ? 'text-primary' : 'text-muted-foreground'}`}>
        {homeNavLabel}
      </Link>
      <Link href="/explore" className={`text-sm font-medium whitespace-nowrap transition-colors hover:text-primary ${isActive('/explore') ? 'text-primary' : 'text-muted-foreground'}`}>
        Explorar
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={`text-sm font-medium whitespace-nowrap transition-colors hover:text-primary flex items-center gap-1 ${isActive("/my-services") || isActive("/services") || isActive("/booking") ? "text-primary" : "text-muted-foreground"}`}>
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
          {canSeeMobility &&
            (isAdmin || (isProfessional && !myServicesLoading && !providerVehicleLoading && (isCarGoDriver || canUseGoDriverConducir))) && (
            <DropdownMenuItem asChild>
              <Link href="/go/driver" className="flex items-center gap-2 w-full">
                <Car className="h-4 w-4" />
                <span>Conducir</span>
              </Link>
            </DropdownMenuItem>
          )}
          {showMyServicesNav && (
            <DropdownMenuItem asChild>
              <Link href="/my-services" className="flex items-center gap-2 w-full">
                <List className="h-4 w-4" />
                <span>Mis servicios</span>
              </Link>
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
      {showPromocionesNav && (
        <Link
          href="/promociones"
          className={`text-sm font-medium whitespace-nowrap transition-colors hover:text-primary ${isActive("/promociones") ? "text-primary" : "text-muted-foreground"}`}
        >
          Promociones
        </Link>
      )}
      {isAuthenticated && (
        <>
          <Link href="/vault" className={`text-sm font-medium whitespace-nowrap transition-colors hover:text-primary ${isActive('/vault') ? 'text-primary' : 'text-muted-foreground'}`}>
            Documentos
          </Link>
          {FEATURE_WALLET_RECHARGE_UI_ENABLED && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`text-sm font-medium whitespace-nowrap transition-colors hover:text-primary flex items-center gap-1 ${isActive('/recharge') || isActive('/movimientos') ? 'text-primary' : 'text-muted-foreground'}`}>
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
    </div>
  );

  return (
    <>
    <nav className="sticky top-0 z-50 w-full border-b border-primary/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 min-[400px]:h-16 w-full max-w-[100rem] min-w-0 items-center justify-between gap-2 px-2 min-[400px]:px-4 sm:px-5 xl:px-6">
        
        {/* Marca + enlaces (agrupados como el diseño original) */}
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4 lg:gap-8">
          <Link
            href={exploreCategoryDisplayName ? "/explore" : "/"}
            className="flex w-max shrink-0 items-center gap-1.5 min-[400px]:gap-2"
            title={navbarBrandLabel}
          >
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
            <span className="inline-block whitespace-nowrap text-left text-sm font-bold font-display text-primary tracking-wider min-[400px]:text-base lg:text-lg xl:text-xl">
              {navbarBrandLabel}
            </span>
          </Link>
          <div className="hidden lg:flex min-w-0 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <NavLinks />
          </div>
        </div>

        {/* Acciones derecha */}
        <div className="flex shrink-0 items-center gap-1 min-[400px]:gap-1.5 sm:gap-2 lg:justify-end">
          
          {/* Language Selector */}
          <Button variant="ghost" size="sm" className="hidden sm:flex items-center gap-1.5 px-2 text-muted-foreground hover:text-primary" title="Idioma: español">
                <Globe className="h-4 w-4 shrink-0" />
                <span className="hidden xl:inline">ES</span>
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
          
            <Button 
              variant="ghost" 
              size="sm" 
              className={`hidden lg:flex xl:hidden items-center gap-2 transition-colors ${isDownloading ? 'text-green-500 bg-green-500/10' : 'text-mango-orange hover:bg-mango-orange/10'}`}
              asChild
              onClick={handleDownloadClick}
            >
              <a href="/Genfeb.apk" download="Genfeb.apk" title="Descargar app Android">
                <Smartphone className="h-4 w-4" />
              </a>
            </Button>
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Button 
              variant="ghost" 
              size="sm" 
              className={`hidden xl:flex items-center gap-2 transition-colors ${isDownloading ? 'text-green-500 bg-green-500/10' : 'text-mango-orange hover:bg-mango-orange/10'}`}
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
              ) : showAssociateActivityForDriver ? (
                <Button variant="ghost" className="hidden sm:flex items-center gap-2 text-primary" asChild>
                  <Link href={associateActivityHref}>
                    <Briefcase className="h-4 w-4" />
                    <span>Panel Asociado</span>
                  </Link>
                </Button>
              ) : showBecomePro && !isProfessional && !associateOnboardingIncomplete ? (
                <Button variant="outline" className="hidden sm:flex border-primary text-primary hover:bg-primary/10" asChild>
                  <Link href="/become-pro">Convertirse en Asociado</Link>
                </Button>
              ) : canAccessActivityDashboardNav ? (
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
                  {showAssociateActivityForDriver && (
                    <DropdownMenuItem asChild>
                      <Link href={associateActivityHref} className="flex items-center">
                        <Briefcase className="mr-2 h-4 w-4" />
                        Panel Asociado
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {canAccessActivityDashboardNav && (
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard" className="flex items-center">
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      Panel de Control
                    </Link>
                  </DropdownMenuItem>
                  )}
                  {showPromocionesNav && (
                    <DropdownMenuItem asChild>
                      <Link href="/promociones" className="flex items-center">
                        <Ticket className="mr-2 h-4 w-4" />
                        Promociones
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
                  {showCentralNav && (
                    <DropdownMenuItem asChild>
                      <Link href="/central" className="flex items-center">
                        <Building2 className="mr-2 h-4 w-4" />
                        Central
                      </Link>
                    </DropdownMenuItem>
                  )}
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
                <Link href={homeNavHref} className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                  {homeNavLabel}
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
                    {showPromocionesNav && (
                      <Link href="/promociones" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                        Promociones
                      </Link>
                    )}
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
                  </>
                )}
                {showMyServicesNav && (
                  <Link href="/my-services" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                    Mis servicios
                  </Link>
                )}
                {canSeeMobility &&
                  (isAdmin ||
                    (isProfessional && !myServicesLoading && !providerVehicleLoading && (isCarGoDriver || canUseGoDriverConducir))) && (
                  <Link
                    href="/go/driver"
                    className="text-lg font-medium flex items-center gap-2 hover:text-primary transition-colors"
                    onClick={() => setMobileOpen(false)}
                  >
                    <Car className="h-5 w-5 shrink-0" />
                    Conducir
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
                {canAccessActivityDashboardNav && (
                <Link href="/dashboard" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                  Mi Panel
                </Link>
                )}
                {showAssociateActivityForDriver && (
                  <Link href={associateActivityHref} className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                    Panel Asociado
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
                {isAuthenticated && (
                  <Link href="/settings" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                    Configuración
                  </Link>
                )}
                {showCentralNav && (
                  <Link href="/central" className="text-lg font-medium flex items-center gap-2" onClick={() => setMobileOpen(false)}>
                    <Building2 className="h-5 w-5 shrink-0" />
                    Central
                  </Link>
                )}
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
    </>
  );
}

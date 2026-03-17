import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useShowBecomePro } from "@/hooks/use-show-become-pro";
import { hasAdminRole } from "@/lib/auth-utils";
import { Button } from "@/components/ui/button";
import { useCurrentProvider, useMyServices, useDeleteService, useWallet } from "@/hooks/use-mango-data";
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
  Trash2,
  Loader2,
  Wrench,
  PackageOpen,
  Wallet,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { NotificationBell } from "@/components/NotificationBell";

/** Oculta los enlaces/botones "Crear servicio" sin eliminar el código. Cambiar a true para mostrar de nuevo. */
const SHOW_CREATE_SERVICE = false;

export function Navigation() {
  const { user, logout, isAuthenticated } = useAuth();
  const showBecomePro = useShowBecomePro();
  const { data: providerProfile } = useCurrentProvider();
  const { data: myServices = [], isLoading: myServicesLoading } = useMyServices({ enabled: !!providerProfile || (user as { role?: string } | null)?.role === "professional" });
  const deleteService = useDeleteService();
  const { data: walletData } = useWallet({ enabled: isAuthenticated });
  const walletBalance = typeof walletData?.wallet === "number" ? walletData.wallet : 0;
  const formatWallet = (n: number) =>
    new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [myServicesOpen, setMyServicesOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<number | null>(null);

  const isActive = (path: string) => location === path || location.startsWith(path + '/');

  /** Mostrar opciones de profesional si tiene perfil de proveedor o rol professional (por si el perfil no carga). */
  const isProfessional = !!providerProfile || (user as { role?: string } | null)?.role === "professional";
  /** Panel "Mis servicios" visible solo si tiene al menos un servicio activo (condición distinta a Crear servicio). */
  const activeServices = myServices.filter((s) => s.isActive !== false);
  const hasActiveServices = activeServices.length > 0;

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
          <DropdownMenuItem>
            <Link href="/booking" className="flex items-center gap-2 w-full">
              <Calendar className="h-4 w-4" />
              <span>Reservas</span>
            </Link>
          </DropdownMenuItem>
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
              <span>Mis servicios</span>
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
      <Link href="/vault" className={`text-sm font-medium transition-colors hover:text-primary ${isActive('/vault') ? 'text-primary' : 'text-muted-foreground'}`}>
        Bóveda
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
              <Wallet className="h-4 w-4" />
              <span>Recargar</span>
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
  );

  return (
    <>
    <nav className="sticky top-0 z-50 w-full border-b border-primary/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 mx-auto">
        
        {/* Logo & Desktop Nav */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            {/* Using static logo import as requested */}
            <img src="/logo GenFeb.jpg" alt="GENFEB Logo" className="h-8 w-auto object-contain" />
            <span className="hidden text-xl font-bold font-display text-primary sm:inline-block tracking-wider">
              GENFEB<span className="text-accent">.S.A.S</span>
            </span>
          </Link>
          <div className="hidden lg:flex items-center gap-6">
            <NavLinks />
          </div>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-3">
          
          {/* Language Selector */}
          <Button variant="ghost" size="sm" className="hidden sm:flex items-center gap-2 text-muted-foreground hover:text-primary">
                <Globe className="h-4 w-4" />
                <span>ES</span>
              </Button>

          {/* Wallet balance - visible desktop y móvil (icono en header) */}
          {isAuthenticated && (
            <div
              className="flex items-center gap-1.5 min-w-0 px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary"
              title="Saldo de tu wallet"
            >
              <Wallet className="h-4 w-4 sm:h-4 w-4 shrink-0" aria-hidden />
              <span className="text-sm font-semibold tabular-nums truncate max-w-[80px] sm:max-w-[100px]">
                {walletData === undefined ? "—" : formatWallet(walletBalance)}
              </span>
            </div>
          )}
          
          {isAuthenticated && <NotificationBell />}
          
          {isAuthenticated ? (
            <>
              {isProfessional ? (
                 <Button variant="ghost" className="hidden sm:flex items-center gap-2 text-primary" asChild>
                   <Link href="/professional-dashboard">
                     <Briefcase className="h-4 w-4" />
                     <span>Panel profesional</span>
                   </Link>
                 </Button>
              ) : showBecomePro ? (
                <Button variant="outline" className="hidden sm:flex border-primary text-primary hover:bg-primary/10" asChild>
                  <Link href="/become-pro">Convertirse en Profesional</Link>
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
                        Panel profesional
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
                      Bóveda Segura
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/recharge" className="flex items-center">
                      <Wallet className="mr-2 h-4 w-4" />
                      Recargar wallet
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/payments" className="flex items-center">
                      <CreditCard className="mr-2 h-4 w-4" />
                      Pagos
                    </Link>
                  </DropdownMenuItem>
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
              {/* Wallet en menú móvil */}
              {isAuthenticated && (
                <div className="flex items-center gap-2 mt-6 mb-2 px-1 py-3 rounded-xl bg-primary/10 border border-primary/20">
                  <Wallet className="h-5 w-5 text-primary shrink-0" />
                  <span className="text-base font-semibold text-primary tabular-nums">
                    {walletData === undefined ? "—" : formatWallet(walletBalance)}
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
                <Link href="/booking" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                  Reservas
                </Link>
                {isProfessional && (
                  <>
                    <Link href="/professional-dashboard" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                      Panel profesional
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
                        Mis servicios
                      </button>
                    )}
                  </>
                )}
                <Link href="/vault" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                  Bóveda Segura
                </Link>
                <Link href="/recharge" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                  Recargar wallet
                </Link>
                <Link href="/movimientos" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                  Historial de movimientos
                </Link>
                <Link href="/dashboard" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                  Mi Panel
                </Link>
                <Link href="/payments" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                  Pagos
                </Link>
                <Link href="/chat" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                  Mensajes
                </Link>
                <div className="border-t border-border my-4"></div>
                {!isAuthenticated && (
                  <>
                    <Button variant="outline" asChild>
                      <Link href="/login" onClick={() => setMobileOpen(false)}>Iniciar Sesión</Link>
                    </Button>
                    <Button asChild>
                      <Link href="/register" onClick={() => setMobileOpen(false)}>Registrarse</Link>
                    </Button>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>

    {/* Panel Mis servicios */}
    <Sheet open={myServicesOpen} onOpenChange={setMyServicesOpen}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-white border-l border-border overflow-y-auto rounded-l-xl shadow-lg"
      >
        <div className="pb-4 border-b border-border/80">
          <h2 className="text-xl font-bold text-foreground tracking-tight">Mis servicios</h2>
          <p className="text-sm text-muted-foreground mt-1">Gestiona y edita tus publicaciones</p>
        </div>

        <div className="mt-5 space-y-4">
          {myServicesLoading ? (
            <>
              {[1, 2, 3].map((i) => (
                <Card key={i} className="rounded-xl border border-border/60 bg-white shadow-sm overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
                      <div className="flex-1 min-w-0 space-y-2">
                        <Skeleton className="h-5 w-[75%]" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          ) : myServices.filter((s) => s.isActive !== false).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="rounded-full bg-muted/60 p-6 mb-4">
                <PackageOpen className="h-12 w-12 text-muted-foreground" />
              </div>
              <p className="text-base font-medium text-foreground mb-1">Aún no has creado servicios</p>
              <p className="text-sm text-muted-foreground mb-6 max-w-[260px]">¡Empieza ahora y publica tu primer servicio para que los clientes puedan reservarlo!</p>
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
              <ul className="space-y-4">
                {myServices
                  .filter((s) => s.isActive !== false)
                  .map((s) => (
                    <Card
                      key={s.id}
                      className="rounded-xl border border-border/60 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                            <Wrench className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-bold text-base text-foreground truncate">{s.title}</h3>
                            <Badge
                              variant="outline"
                              className="mt-2 bg-amber-500/15 text-amber-700 dark:text-amber-400 dark:bg-amber-500/20 border-amber-500/30 font-semibold"
                            >
                              {s.price ?? "—"}
                            </Badge>
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
                                  <Link href={`/edit-service/${s.id}`} onClick={() => setMyServicesOpen(false)}>
                                    <Pencil className="h-4 w-4" />
                                  </Link>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Editar</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-transform hover:scale-110"
                                  onClick={() => setServiceToDelete(s.id)}
                                  disabled={deleteService.isPending}
                                >
                                  {deleteService.isPending && deleteService.variables === s.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Eliminar</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </ul>
            </TooltipProvider>
          )}
        </div>
      </SheetContent>
    </Sheet>

    <AlertDialog open={serviceToDelete != null} onOpenChange={(open) => !open && setServiceToDelete(null)}>
      <AlertDialogContent className="rounded-xl border border-border bg-card shadow-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar este servicio?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción no se puede deshacer. El servicio dejará de estar visible para los clientes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (serviceToDelete != null) {
                deleteService.mutate(serviceToDelete);
                setServiceToDelete(null);
              }
            }}
          >
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

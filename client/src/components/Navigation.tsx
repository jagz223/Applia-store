import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useCurrentProvider } from "@/hooks/use-mango-data";
import { 
  Briefcase, 
  Calendar, 
  Home, 
  LayoutDashboard, 
  LogOut, 
  Menu, 
  Search, 
  User,
  Shield,
  Vault,
  CreditCard,
  MessageSquare,
  Globe,
  Settings,
  ChevronDown
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
import { useState } from "react";

export function Navigation() {
  const { user, logout, isAuthenticated } = useAuth();
  const { data: providerProfile } = useCurrentProvider();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (path: string) => location === path || location.startsWith(path + '/');

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
          <button className={`text-sm font-medium transition-colors hover:text-primary flex items-center gap-1 ${isActive('/payments') || isActive('/dashboard') ? 'text-primary' : 'text-muted-foreground'}`}>
            Mi Cuenta <ChevronDown className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="bg-card border-border">
          <DropdownMenuLabel className="text-muted-foreground">Gestión</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <Link href="/dashboard" className="flex items-center gap-2 w-full">
              <LayoutDashboard className="h-4 w-4" />
              <span>Panel de Control</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Link href="/payments" className="flex items-center gap-2 w-full">
              <CreditCard className="h-4 w-4" />
              <span>Pagos</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Link href="/chat" className="flex items-center gap-2 w-full">
              <MessageSquare className="h-4 w-4" />
              <span>Mensajes</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <Link href="/settings" className="flex items-center gap-2 w-full">
              <Settings className="h-4 w-4" />
              <span>Configuración</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  return (
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="hidden sm:flex items-center gap-2 text-muted-foreground hover:text-primary">
                <Globe className="h-4 w-4" />
                <span>ES</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-card border-border">
              <DropdownMenuItem className="flex items-center gap-2">
                <span>🇪🇸</span> <span>Español (Ecuador)</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex items-center gap-2">
                <span>🇺🇸</span> <span>English</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex items-center gap-2">
                <span>🇵🇹</span> <span>Português</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {isAuthenticated ? (
            <>
              {providerProfile ? (
                 <Button variant="ghost" className="hidden sm:flex items-center gap-2 text-primary" asChild>
                   <Link href="/dashboard">
                     <LayoutDashboard className="h-4 w-4" />
                     <span>Dashboard</span>
                   </Link>
                 </Button>
              ) : (
                <Button variant="outline" className="hidden sm:flex border-primary text-primary hover:bg-primary/10" asChild>
                  <Link href="/become-pro">Convertirse en Profesional</Link>
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
              <div className="flex flex-col gap-4 mt-8">
                <Link href="/" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                  Inicio
                </Link>
                <Link href="/explore" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                  Explorar Servicios
                </Link>
                <Link href="/booking" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                  Reservas
                </Link>
                <Link href="/vault" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                  Bóveda Segura
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
  );
}

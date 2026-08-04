import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { hasAdminRole } from "@/lib/auth-utils";
import { Button } from "@/components/ui/button";
import {
  LogOut,
  Menu,
  User,
  Shield,
  Settings,
  ShoppingBag,
  Store,
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
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggleHeaderButton } from "@/components/ThemeToggle";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/contexts/ThemeContext";

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
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (path: string) => location === path || location.startsWith(path + "/");
  const showAdmin = hasAdminRole(user);
  const tiendaHref = "/tienda";
  const tiendaActive = isActive("/tienda");

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-primary/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 min-[400px]:h-16 w-full max-w-[100rem] min-w-0 items-center justify-between gap-2 px-2 min-[400px]:px-4 sm:px-5 xl:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4 lg:gap-8">
          <Link href="/" className="flex w-max shrink-0 items-center gap-1.5 min-[400px]:gap-2" title="GENFEB">
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
              GENFEB
            </span>
          </Link>
          <div className="hidden lg:flex min-w-0 items-center gap-6">
            <Link
              href="/"
              className={`text-sm font-medium whitespace-nowrap transition-colors hover:text-primary ${
                isActive("/") && location.split("?")[0] === "/" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              Inicio
            </Link>
            <Link
              href={tiendaHref}
              className={`text-sm font-medium whitespace-nowrap transition-colors hover:text-primary ${
                tiendaActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              Tienda
            </Link>
            {showAdmin && (
              <Link
                href="/admin"
                className={`text-sm font-medium whitespace-nowrap transition-colors hover:text-primary ${
                  isActive("/admin") ? "text-primary" : "text-muted-foreground"
                }`}
              >
                Admin
              </Link>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 min-[400px]:gap-1.5 sm:gap-2">
          <ThemeToggleHeaderButton className="hidden lg:flex" />
          {isAuthenticated && <NotificationBell />}

          {isAuthenticated ? (
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
                  <Link href={tiendaHref} className="flex items-center">
                    <Store className="mr-2 h-4 w-4" />
                    Tienda
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/pedidos-tienda" className="flex items-center">
                    <ShoppingBag className="mr-2 h-4 w-4" />
                    Mis pedidos
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="flex items-center">
                    <Settings className="mr-2 h-4 w-4" />
                    Configuración
                  </Link>
                </DropdownMenuItem>
                {showAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/admin" className="flex items-center">
                        <Shield className="mr-2 h-4 w-4" />
                        Admin Panel
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

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="flex h-full w-[300px] min-h-0 flex-col overflow-hidden bg-card border-l border-border p-0"
            >
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
                <div className="mt-4">
                  <MobileDarkModePreference />
                </div>
                <div className="mt-4 flex flex-col gap-4">
                  <Link href="/" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                    Inicio
                  </Link>
                  <Link href={tiendaHref} className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                    Tienda
                  </Link>
                  {isAuthenticated && (
                    <>
                      <Link href="/pedidos-tienda" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                        Mis pedidos
                      </Link>
                      <Link href="/settings" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                        Configuración
                      </Link>
                    </>
                  )}
                  {showAdmin && (
                    <Link href="/admin" className="text-lg font-medium" onClick={() => setMobileOpen(false)}>
                      Admin
                    </Link>
                  )}
                  {!isAuthenticated && (
                    <div className="mt-4 flex flex-col gap-2">
                      <Button variant="outline" asChild className="w-full">
                        <Link href="/login" onClick={() => setMobileOpen(false)}>
                          Iniciar Sesión
                        </Link>
                      </Button>
                      <Button asChild className="w-full">
                        <Link href="/register" onClick={() => setMobileOpen(false)}>
                          Registrarse
                        </Link>
                      </Button>
                    </div>
                  )}
                  {isAuthenticated && (
                    <Button
                      variant="outline"
                      className="mt-4 w-full"
                      onClick={() => {
                        setMobileOpen(false);
                        logout();
                      }}
                    >
                      Cerrar Sesión
                    </Button>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}

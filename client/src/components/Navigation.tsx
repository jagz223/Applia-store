import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { isClientRole } from "@/lib/auth-utils";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  User,
  Settings,
  ShoppingBag,
  Store,
} from "lucide-react";import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState, useMemo, type ReactNode } from "react";import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggleHeaderButton } from "@/components/ThemeToggle";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/contexts/ThemeContext";
import { getPrimaryStoreVitrinaHref, usePrimaryStore } from "@/hooks/use-primary-store";
import {
  getMyStoreChatNavHref,
  getMyStoreNavHref,
  getStoreAdminChatHref,
  useMyStaffStore,
  useMyStore,
} from "@/hooks/use-my-store";import { cn } from "@/lib/utils";

function MobileDarkModePreference() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/50 px-3.5 py-3">
      <div className="min-w-0">
        <Label htmlFor="nav-mobile-dark" className="cursor-pointer text-sm font-semibold text-foreground">
          Modo oscuro
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">Se guarda en este navegador</p>
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

function NavPill({
  href,
  active,
  children,
  onClick,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

type NavSection = "home" | "tienda" | "chat" | "admin";

function resolveNavSection(
  location: string,
  options: { storeChatHref: string | null; storeAdminHref: string | null },
): NavSection | null {
  const path = location.split("?")[0];
  if (path === "/") return "home";
  if (
    options.storeChatHref &&
    (path === options.storeChatHref || path.startsWith(`${options.storeChatHref}/`))
  ) {
    return "chat";
  }
  if (
    options.storeAdminHref &&
    (path === options.storeAdminHref || path.startsWith(`${options.storeAdminHref}/`))
  ) {
    return "admin";
  }
  if (path.startsWith("/tienda")) return "tienda";
  return null;
}

export function Navigation() {
  const { user, logout, isAuthenticated } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const showMyOrders = isAuthenticated && isClientRole(user);
  const { data: primaryStore } = usePrimaryStore();
  const { data: myStore } = useMyStore(isAuthenticated);
  const { data: staffStore } = useMyStaffStore(isAuthenticated);
  const storeAdminHref =
    getMyStoreNavHref(myStore) ??
    (staffStore?.store.slug ? getMyStoreNavHref(staffStore.store) : null);
  const storeChatHref =
    getMyStoreChatNavHref(myStore) ??
    (staffStore?.store.slug ? getStoreAdminChatHref(staffStore.store.slug) : null);
  const showStoreStaffNav = Boolean(storeAdminHref);
  const tiendaHref = getPrimaryStoreVitrinaHref(primaryStore);

  const navSection = useMemo(
    () => resolveNavSection(location, { storeChatHref, storeAdminHref }),
    [location, storeChatHref, storeAdminHref],
  );

  const homeActive = navSection === "home";
  const tiendaActive = navSection === "tienda";
  const chatActive = navSection === "chat";
  const adminActive = navSection === "admin";
  const isActive = (path: string) => location === path || location.startsWith(path + "/");

  return (
    <header className="sticky top-0 z-50 w-full shrink-0">
      <nav className="border-b border-border/60 bg-card/95 shadow-[0_1px_0_0_hsl(var(--secondary)/0.18)] backdrop-blur-md supports-[backdrop-filter]:bg-card/90">
        <div className="mx-auto flex h-16 w-full max-w-[100rem] min-w-0 items-center justify-between gap-3 px-3 min-[400px]:px-5 sm:px-6 xl:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3 lg:gap-8">
            <Link href={tiendaHref} className="group flex shrink-0 items-center gap-2.5" title="Applia Store">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-[1.03]">
                <ShoppingBag className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <span className="leading-tight">
                <span className="block text-base font-bold tracking-tight text-foreground min-[400px]:text-lg">
                  Applia
                </span>
                <span className="hidden text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-secondary dark:text-primary min-[400px]:block">
                  Store
                </span>
              </span>
            </Link>

            <div className="hidden items-center gap-1 rounded-full bg-muted/60 p-1 lg:flex">
              <NavPill href="/" active={homeActive}>
                Inicio
              </NavPill>
              <NavPill href={tiendaHref} active={tiendaActive}>
                Tienda
              </NavPill>
              {showStoreStaffNav && storeAdminHref ? (
                <NavPill href={storeAdminHref} active={adminActive}>
                  Panel de administración
                </NavPill>
              ) : null}
              {showStoreStaffNav && storeChatHref ? (
                <NavPill href={storeChatHref} active={chatActive}>
                  Chat
                </NavPill>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ThemeToggleHeaderButton className="hidden lg:inline-flex" />
            {isAuthenticated ? <NotificationBell /> : null}

            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Abrir menú de cuenta"
                  >
                    <User className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-60 overflow-hidden rounded-xl border border-border bg-popover p-0 text-popover-foreground shadow-lg"
                  align="end"
                  sideOffset={10}
                >
                  <div className="bg-primary px-4 py-4 text-primary-foreground">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15 ring-1 ring-primary-foreground/25">
                        <User className="h-5 w-5" />
                      </span>
                      <DropdownMenuLabel className="min-w-0 flex-1 p-0 font-normal">
                        <p className="text-sm font-semibold">Mi cuenta</p>
                        <p className="mt-0.5 truncate text-xs text-primary-foreground/75">{user?.email}</p>
                      </DropdownMenuLabel>
                    </div>
                  </div>

                  <div className="py-1">
                    <DropdownMenuItem
                      asChild
                      className="cursor-pointer rounded-none px-4 py-2.5 focus:bg-secondary/10 focus:text-secondary"
                    >
                      <Link href={tiendaHref} className="flex w-full items-center justify-between gap-2">
                        <span className="flex items-center gap-2.5">
                          <Store className="h-4 w-4 text-primary" />
                          Tienda
                        </span>
                      </Link>
                    </DropdownMenuItem>
                    {showStoreStaffNav && storeAdminHref ? (
                      <DropdownMenuItem
                        asChild
                        className="cursor-pointer rounded-none px-4 py-2.5 focus:bg-secondary/10 focus:text-secondary"
                      >
                        <Link href={storeAdminHref} className="flex w-full items-center justify-between gap-2">
                          <span className="flex items-center gap-2.5">
                            <LayoutDashboard className="h-4 w-4 text-primary" />
                            Panel de administración
                          </span>
                        </Link>
                      </DropdownMenuItem>
                    ) : null}
                    {showStoreStaffNav && storeChatHref ? (
                      <DropdownMenuItem
                        asChild
                        className="cursor-pointer rounded-none px-4 py-2.5 focus:bg-secondary/10 focus:text-secondary"
                      >
                        <Link href={storeChatHref} className="flex w-full items-center justify-between gap-2">
                          <span className="flex items-center gap-2.5">
                            <MessageCircle className="h-4 w-4 text-primary" />
                            Chat
                          </span>
                        </Link>
                      </DropdownMenuItem>
                    ) : null}
                    {showMyOrders ? (
                      <DropdownMenuItem
                        asChild
                        className="cursor-pointer rounded-none px-4 py-2.5 focus:bg-secondary/10 focus:text-secondary"
                      >
                        <Link href="/pedidos-tienda" className="flex w-full items-center justify-between gap-2">
                          <span className="flex items-center gap-2.5">
                            <ShoppingBag className="h-4 w-4 text-secondary" />
                            Mis pedidos
                          </span>
                        </Link>
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      asChild
                      className="cursor-pointer rounded-none px-4 py-2.5 focus:bg-secondary/10 focus:text-secondary"
                    >
                      <Link href="/settings" className="flex w-full items-center justify-between gap-2">
                        <span className="flex items-center gap-2.5">
                          <Settings className="h-4 w-4" />
                          Configuración
                        </span>
                      </Link>
                    </DropdownMenuItem>
                  </div>

                  <div className="border-t border-border bg-muted/40 p-2">
                    <DropdownMenuItem
                      onClick={() => logout()}
                      className="cursor-pointer justify-center rounded-lg px-3 py-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Cerrar sesión
                    </DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <Button variant="ghost" className="rounded-full text-muted-foreground" asChild>
                  <Link href="/login">Entrar</Link>
                </Button>
                <Button className="rounded-full bg-secondary px-4 text-secondary-foreground hover:bg-secondary/90" asChild>
                  <Link href="/register">Crear cuenta</Link>
                </Button>
              </div>
            )}

            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full lg:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="flex h-full w-[min(100%,19rem)] min-h-0 flex-col overflow-hidden border-l border-border bg-card p-0"
              >
                <div className="border-b border-border/60 px-5 py-5">
                  <p className="text-lg font-bold tracking-tight">Applia</p>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-secondary">Store</p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-5">
                  <MobileDarkModePreference />
                  <div className="mt-5 flex flex-col gap-2">
                    <NavPill href="/" active={homeActive} onClick={() => setMobileOpen(false)}>
                      Inicio
                    </NavPill>
                    <NavPill href={tiendaHref} active={tiendaActive} onClick={() => setMobileOpen(false)}>
                      Tienda
                    </NavPill>
                    {showStoreStaffNav && storeAdminHref ? (
                      <NavPill href={storeAdminHref} active={adminActive} onClick={() => setMobileOpen(false)}>
                        Panel de administración
                      </NavPill>
                    ) : null}
                    {showStoreStaffNav && storeChatHref ? (
                      <NavPill href={storeChatHref} active={chatActive} onClick={() => setMobileOpen(false)}>
                        Chat
                      </NavPill>
                    ) : null}
                    {isAuthenticated ? (
                      <>
                        {showMyOrders ? (
                          <NavPill
                            href="/pedidos-tienda"
                            active={isActive("/pedidos-tienda")}
                            onClick={() => setMobileOpen(false)}
                          >
                            Mis pedidos
                          </NavPill>
                        ) : null}
                        <NavPill href="/settings" active={isActive("/settings")} onClick={() => setMobileOpen(false)}>
                          Configuración
                        </NavPill>
                      </>
                    ) : null}
                    {!isAuthenticated ? (
                      <div className="mt-3 flex flex-col gap-2">
                        <Button variant="outline" asChild className="w-full rounded-full">
                          <Link href="/login" onClick={() => setMobileOpen(false)}>
                            Entrar
                          </Link>
                        </Button>
                        <Button asChild className="w-full rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/90">
                          <Link href="/register" onClick={() => setMobileOpen(false)}>
                            Crear cuenta
                          </Link>
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        className="mt-3 w-full rounded-full"
                        onClick={() => {
                          setMobileOpen(false);
                          logout();
                        }}
                      >
                        Cerrar sesión
                      </Button>
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>
    </header>
  );
}

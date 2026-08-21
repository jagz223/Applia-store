import { useEffect, type ReactNode } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Package, Tags, Percent, Ticket, Settings2, ClipboardList, Coins, Leaf, Images, Users, MessageSquare, BarChart3, CreditCard } from "lucide-react";
import {
  getVisibleStoreAdminSections,
  type StoreAdminSectionId,
  storeAdminSectionPath,
} from "@shared/store-admin-sections";
import { storeDeliveryNotificationsKey, useStoreDeliveryNotifications } from "@/hooks/use-store-orders";
import { useSocket } from "@/hooks/use-socket";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StoreAdminDeliveryRatePrompt } from "@/components/store/StoreAdminDeliveryRatePrompt";

const SECTION_ICONS: Record<StoreAdminSectionId, typeof Package> = {
  productos: Package,
  categorias: Tags,
  ingredientes: Leaf,
  promociones: Percent,
  codigos: Ticket,
  ordenes: ClipboardList,
  banners_popups: Images,
  moneda: Coins,
  metodos_pago: CreditCard,
  configuracion: Settings2,
  chat_sucursales: MessageSquare,
  usuarios: Users,
  estadisticas: BarChart3,
};

type StoreAdminLayoutProps = {
  slug: string;
  storeName: string;
  storeId?: number;
  activeSection: StoreAdminSectionId;
  employeeOnly?: boolean;
  canManageStaff?: boolean;
  children: ReactNode;
};

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold leading-none text-destructive-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function StoreAdminLayout({
  slug,
  storeName,
  storeId = 0,
  activeSection,
  employeeOnly = false,
  canManageStaff = true,
  children,
}: StoreAdminLayoutProps) {
  const base = `/tienda/${encodeURIComponent(slug)}/admin`;
  const queryClient = useQueryClient();
  const { socket } = useSocket();
  const { data: deliveryNotifications } = useStoreDeliveryNotifications(storeId, storeId > 0);
  const navSections = getVisibleStoreAdminSections({
    employeeOnly,
    includeStaff: canManageStaff,
  });

  useEffect(() => {
    if (!socket || storeId <= 0) return;
    const handler = (payload: { storeId?: number }) => {
      if (payload?.storeId != null && Number(payload.storeId) !== storeId) return;
      void queryClient.invalidateQueries({ queryKey: storeDeliveryNotificationsKey(storeId) });
      void queryClient.invalidateQueries({ queryKey: ["/api/stores", storeId, "orders"] });
    };
    const onNewOrder = (payload: { storeId?: number }) => {
      if (payload?.storeId != null && Number(payload.storeId) !== storeId) return;
      void queryClient.invalidateQueries({ queryKey: ["/api/stores", storeId, "orders"] });
    };
    socket.on("store:order:delivery:updated", handler);
    socket.on("store:order:new", onNewOrder);
    return () => {
      socket.off("store:order:delivery:updated", handler);
      socket.off("store:order:new", onNewOrder);
    };
  }, [socket, storeId, queryClient]);

  const ordersUnread = deliveryNotifications?.totalUnread ?? 0;

  return (
    <div
      className={cn(
        "min-h-[calc(100dvh-4rem)]",
        "bg-[radial-gradient(ellipse_at_12%_0%,hsl(var(--secondary)/0.12),transparent_45%),radial-gradient(ellipse_at_90%_10%,hsl(var(--primary)/0.05),transparent_40%),hsl(var(--background))]",
      )}
    >
      <div className="border-b border-border/60 bg-card/95 backdrop-blur-md supports-[backdrop-filter]:bg-card/90">
        <div className="container flex flex-wrap items-center gap-3 px-4 py-3.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 shrink-0 gap-1.5 rounded-full px-3 text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link href={`/tienda/${encodeURIComponent(slug)}`}>
              <ArrowLeft className="h-4 w-4" />
              Vitrina
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-secondary dark:text-primary">
              {employeeOnly ? "Panel de empleado" : "Administración"}
            </p>
            <h1 className="truncate font-display text-lg font-bold tracking-tight text-foreground sm:text-xl">
              {storeName}
            </h1>
          </div>
        </div>
      </div>

      <div className="container flex flex-col gap-4 px-4 py-5 md:flex-row md:gap-6 md:py-6">
        <nav
          className="shrink-0 md:sticky md:top-6 md:w-56 md:self-start lg:w-64"
          aria-label="Secciones de la tienda"
        >
          <ul className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin md:flex-col md:space-y-1 md:overflow-visible md:pb-0">
            {navSections.map((section) => {
              const Icon = SECTION_ICONS[section.id];
              const href = `${base}/${storeAdminSectionPath(section.id)}`;
              const active = activeSection === section.id;
              const badgeCount = section.id === "ordenes" ? ordersUnread : 0;
              return (
                <li key={section.id} className="shrink-0 md:shrink">
                  <Link
                    href={href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-full px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap md:rounded-2xl",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground md:bg-transparent",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                    <span className="truncate">{section.label}</span>
                    <NavBadge count={badgeCount} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 md:border-l md:border-border/50 md:pl-6">{children}</main>
      </div>
      {!employeeOnly && storeId > 0 ? <StoreAdminDeliveryRatePrompt storeId={storeId} /> : null}
    </div>
  );
}

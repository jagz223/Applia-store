import { useEffect, type ReactNode } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Package, Tags, Percent, Ticket, Settings2, ClipboardList, Coins } from "lucide-react";
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
  promociones: Percent,
  codigos: Ticket,
  ordenes: ClipboardList,
  moneda: Coins,
  configuracion: Settings2,
};

type StoreAdminLayoutProps = {
  slug: string;
  storeName: string;
  storeId?: number;
  activeSection: StoreAdminSectionId;
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

export function StoreAdminLayout({ slug, storeName, storeId = 0, activeSection, children }: StoreAdminLayoutProps) {
  const base = `/tienda/${encodeURIComponent(slug)}/admin`;
  const queryClient = useQueryClient();
  const { socket } = useSocket();
  const { data: deliveryNotifications } = useStoreDeliveryNotifications(storeId, storeId > 0);

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
    <div className="min-h-[calc(100vh-4rem)] bg-muted/20">
      <div className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex flex-wrap items-center gap-3 py-3 px-4">
          <Button variant="ghost" size="sm" className="gap-1.5 shrink-0" asChild>
            <Link href={`/tienda/${encodeURIComponent(slug)}`}>
              <ArrowLeft className="h-4 w-4" />
              Vitrina
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Administración</p>
            <h1 className="font-semibold text-foreground truncate">{storeName}</h1>
          </div>
        </div>
      </div>

      <div className="container flex flex-col md:flex-row gap-0 md:gap-6 px-4 py-6">
        <nav
          className="md:w-56 lg:w-64 shrink-0 md:sticky md:top-6 md:self-start"
          aria-label="Secciones de la tienda"
        >
          <ul className="flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0 md:space-y-1 scrollbar-thin">
            {getVisibleStoreAdminSections().map((section) => {
              const Icon = SECTION_ICONS[section.id];
              const href = `${base}/${storeAdminSectionPath(section.id)}`;
              const active = activeSection === section.id;
              const badgeCount = section.id === "ordenes" ? ordersUnread : 0;
              return (
                <li key={section.id} className="shrink-0 md:shrink">
                  <Link
                    href={href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
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

        <main className="flex-1 min-w-0 pt-4 md:pt-0 border-t md:border-t-0 border-border">{children}</main>
      </div>
      {storeId > 0 ? <StoreAdminDeliveryRatePrompt storeId={storeId} /> : null}
    </div>
  );
}

import { useEffect } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Loader2, Lock } from "lucide-react";
import {
  STORE_ADMIN_SECTIONS,
  STORE_ADMIN_SECTIONS_HIDDEN,
  STORE_ADMIN_EMPLOYEE_SECTIONS,
  normalizeStoreAdminSection,
  storeAdminSectionPath,
  type StoreAdminSectionId,
} from "@shared/store-admin-sections";
import { useAuth } from "@/hooks/use-auth";
import { useStoreBySlug } from "@/hooks/use-my-store";
import { usePrimaryStore } from "@/hooks/use-primary-store";
import { StoreAdminLayout } from "@/components/store/StoreAdminLayout";
import { StoreAdminProductsPanel } from "@/components/store/StoreAdminProductsPanel";
import { StoreAdminCategoriesPanel } from "@/components/store/StoreAdminCategoriesPanel";
import { StoreAdminPromotionsPanel } from "@/components/store/StoreAdminPromotionsPanel";
import { StoreAdminConfigPanel } from "@/components/store/StoreAdminConfigPanel";
import { StoreAdminPaymentMethodsPanel } from "@/components/store/StoreAdminPaymentMethodsPanel";
import { StoreAdminCurrencyPanel } from "@/components/store/StoreAdminCurrencyPanel";
import { StoreAdminOrdersPanel } from "@/components/store/StoreAdminOrdersPanel";
import { StoreAdminIngredientsPanel } from "@/components/store/StoreAdminIngredientsPanel";
import { StoreAdminShowcaseAdsPanel } from "@/components/store/StoreAdminShowcaseAdsPanel";
import { StoreAdminStaffPanel } from "@/components/store/StoreAdminStaffPanel";
import { StoreBranchCoordinationChatPanel } from "@/components/store/StoreBranchCoordinationChatPanel";
import { StoreAdminComingSoon } from "@/components/store/StoreAdminComingSoon";
import { StoreAdminStatsPanel } from "@/components/store/StoreAdminStatsPanel";
import type { StoreFulfillmentMode } from "@shared/store-fulfillment";
import type { StoreCurrencyExtra } from "@shared/store-currency-schema";
import type { StoreBranch, StoreDeliveryFares, StoreLocation } from "@shared/store-schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasAdminRole } from "@/lib/auth-utils";

function sectionPanel(
  section: StoreAdminSectionId,
  store: {
    id: number;
    slug: string;
    fulfillmentOptions?: StoreFulfillmentMode[];
    deliveryFares?: StoreDeliveryFares;
    location?: StoreLocation | null;
    branches?: StoreBranch[] | null;
    currencyExtras?: StoreCurrencyExtra[];
    currencyVisualId?: string;
    currencyAcceptedPaymentIds?: string[];
    whatsappPhone?: string | null;
    casheaEnabled?: boolean;
  },
  access: {
    canFilterOrdersByBranch: boolean;
    employeeBranchId: string | null;
    isEmployee: boolean;
    canManageStaff: boolean;
  },
) {
  if (section === "productos") {
    return (
      <StoreAdminProductsPanel
        storeId={store.id}
        currencyAcceptedPaymentIds={store.currencyAcceptedPaymentIds}
        currencyExtras={store.currencyExtras}
        currencyVisualId={store.currencyVisualId}
      />
    );
  }
  if (section === "categorias") return <StoreAdminCategoriesPanel storeId={store.id} />;
  if (section === "ingredientes") return <StoreAdminIngredientsPanel />;
  if (section === "promociones") return <StoreAdminPromotionsPanel storeId={store.id} />;
  if (section === "ordenes") {
    return (
      <StoreAdminOrdersPanel
        storeId={store.id}
        storeLocation={store.location ?? null}
        branches={store.branches ?? []}
        canFilterOrdersByBranch={access.canFilterOrdersByBranch}
        employeeBranchId={access.employeeBranchId}
      />
    );
  }
  if (section === "banners_popups") {
    return <StoreAdminShowcaseAdsPanel storeId={store.id} />;
  }
  if (section === "moneda") {
    return (
      <StoreAdminCurrencyPanel
        storeId={store.id}
        slug={store.slug}
        initialExtras={store.currencyExtras ?? []}
        initialVisualCurrencyId={store.currencyVisualId}
        initialAcceptedPaymentIds={store.currencyAcceptedPaymentIds}
      />
    );
  }
  if (section === "metodos_pago") {
    return (
      <StoreAdminPaymentMethodsPanel
        storeId={store.id}
        slug={store.slug}
        initialWhatsappPhone={store.whatsappPhone}
        initialCasheaEnabled={store.casheaEnabled}
      />
    );
  }
  if (section === "configuracion") {
    return (
      <StoreAdminConfigPanel
        storeId={store.id}
        slug={store.slug}
        initialFulfillmentOptions={store.fulfillmentOptions ?? []}
        initialDeliveryFares={store.deliveryFares}
        initialLocation={store.location ?? null}
        initialBranches={store.branches}
        initialWhatsappPhone={store.whatsappPhone}
      />
    );
  }
  if (section === "usuarios") {
    return (
      <StoreAdminStaffPanel
        storeId={store.id}
        branches={store.branches ?? []}
        canManageStaff={access.canManageStaff}
      />
    );
  }
  if (section === "chat_sucursales") {
    return (
      <StoreBranchCoordinationChatPanel
        storeId={store.id}
        branches={store.branches ?? []}
        employeeBranchId={access.employeeBranchId}
        canPickBranchForCustomerChat={access.canFilterOrdersByBranch}
      />
    );
  }
  if (section === "estadisticas") {
    return <StoreAdminStatsPanel storeId={store.id} branches={store.branches ?? []} />;
  }
  const meta = STORE_ADMIN_SECTIONS.find((s) => s.id === section);
  return <StoreAdminComingSoon title={meta?.label ?? "Sección"} />;
}

export default function StoreAdmin() {
  const { user, isAuthenticated } = useAuth();
  const isAdmin = hasAdminRole(user);
  const [, params] = useRoute("/tienda/:slug/admin/:section?");
  const slug = params?.slug ?? "";
  const sectionParam = params?.section;
  const activeSection = normalizeStoreAdminSection(sectionParam);
  const [, setLocation] = useLocation();

  const { data, isLoading, error } = useStoreBySlug(slug, isAuthenticated && Boolean(slug));
  const { data: primaryStore } = usePrimaryStore(isAdmin);

  const employeeOnly = Boolean(data?.isEmployee && !data?.isOwner && !isAdmin);
  const defaultSection: StoreAdminSectionId = employeeOnly ? "ordenes" : "productos";

  // Admin de plataforma: el panel siempre es el de PRIMARY_STORE_ID.
  useEffect(() => {
    if (!isAdmin || !primaryStore?.slug || !slug) return;
    if (slug === primaryStore.slug) return;
    const suffix = sectionParam ? `/${sectionParam}` : "";
    setLocation(`/tienda/${encodeURIComponent(primaryStore.slug)}/admin${suffix}`, { replace: true });
  }, [isAdmin, primaryStore?.slug, slug, sectionParam, setLocation]);

  useEffect(() => {
    if (!slug || !data?.store) return;
    if (isAdmin && primaryStore?.slug && slug !== primaryStore.slug) return;
    if (!sectionParam) {
      setLocation(`/tienda/${encodeURIComponent(slug)}/admin/${storeAdminSectionPath(defaultSection)}`, {
        replace: true,
      });
      return;
    }
    if (STORE_ADMIN_SECTIONS_HIDDEN.some((id) => sectionParam === storeAdminSectionPath(id) || sectionParam === id)) {
      setLocation(`/tienda/${encodeURIComponent(slug)}/admin/${storeAdminSectionPath(defaultSection)}`, {
        replace: true,
      });
      return;
    }
    if (employeeOnly) {
      const match = STORE_ADMIN_SECTIONS.find((s) => s.path === sectionParam || s.id === sectionParam);
      const sectionId = match?.id ?? defaultSection;
      if (!STORE_ADMIN_EMPLOYEE_SECTIONS.includes(sectionId)) {
        setLocation(`/tienda/${encodeURIComponent(slug)}/admin/${storeAdminSectionPath("ordenes")}`, {
          replace: true,
        });
      }
    }
  }, [
    slug,
    sectionParam,
    setLocation,
    employeeOnly,
    data?.store,
    defaultSection,
    isAdmin,
    primaryStore?.slug,
  ]);

  const redirectingToPrimary =
    isAdmin && Boolean(primaryStore?.slug) && Boolean(slug) && slug !== primaryStore!.slug;

  if (!isAuthenticated) {
    return (
      <div className="container max-w-md py-16 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Acceso restringido</CardTitle>
            <CardDescription>Inicia sesión para administrar la tienda.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href={`/login?next=/tienda/${encodeURIComponent(slug)}/admin`}>Iniciar sesión</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || redirectingToPrimary || (!sectionParam && slug)) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data?.store) {
    return (
      <div className="container max-w-md py-16 px-4">
        <Card>
          <CardHeader>
            <CardTitle>No se pudo abrir el panel</CardTitle>
            <CardDescription>{(error as Error | undefined)?.message ?? "Tienda no encontrada."}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { store, isOwner, canManageStore, canManageStaff, canFilterOrdersByBranch, isEmployee, employeeBranchId } = data;
  const canManage = Boolean(canManageStore ?? (isOwner || isAdmin));

  if (!canManage) {
    return (
      <div className="container max-w-md py-16 px-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Acceso restringido
            </CardTitle>
            <CardDescription>No tienes permiso para administrar esta tienda.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href={`/tienda/${encodeURIComponent(slug)}`}>Volver a la tienda</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <StoreAdminLayout
      slug={slug}
      storeName={store.name}
      storeId={store.id}
      activeSection={activeSection}
      employeeOnly={employeeOnly}
      canManageStaff={Boolean(canManageStaff ?? (isOwner || isAdmin))}
    >
      {sectionPanel(activeSection, store, {
        canFilterOrdersByBranch: Boolean(canFilterOrdersByBranch ?? (isOwner || isAdmin)),
        employeeBranchId: employeeBranchId ?? null,
        isEmployee: Boolean(isEmployee),
        canManageStaff: Boolean(canManageStaff ?? (isOwner || isAdmin)),
      })}
    </StoreAdminLayout>
  );
}

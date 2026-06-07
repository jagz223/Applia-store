import { useEffect } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Loader2, Lock } from "lucide-react";
import {
  STORE_ADMIN_SECTIONS,
  normalizeStoreAdminSection,
  storeAdminSectionPath,
  type StoreAdminSectionId,
} from "@shared/store-admin-sections";
import { useAuth } from "@/hooks/use-auth";
import { useStoreBySlug } from "@/hooks/use-my-store";
import { StoreAdminLayout } from "@/components/store/StoreAdminLayout";
import { StoreAdminProductsPanel } from "@/components/store/StoreAdminProductsPanel";
import { StoreAdminCategoriesPanel } from "@/components/store/StoreAdminCategoriesPanel";
import { StoreAdminPromotionsPanel } from "@/components/store/StoreAdminPromotionsPanel";
import { StoreAdminConfigPanel } from "@/components/store/StoreAdminConfigPanel";
import { StoreAdminComingSoon } from "@/components/store/StoreAdminComingSoon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function sectionPanel(
  section: StoreAdminSectionId,
  store: {
    id: number;
    slug: string;
    name: string;
    description?: string | null;
    rubro?: string | null;
    coverImageUrl?: string | null;
  },
) {
  if (section === "productos") return <StoreAdminProductsPanel storeId={store.id} />;
  if (section === "categorias") return <StoreAdminCategoriesPanel storeId={store.id} />;
  if (section === "promociones") return <StoreAdminPromotionsPanel storeId={store.id} />;
  if (section === "configuracion") {
    return (
      <StoreAdminConfigPanel
        storeId={store.id}
        slug={store.slug}
        initialName={store.name}
        initialDescription={store.description ?? null}
        initialRubro={store.rubro ?? null}
        initialCoverImageUrl={store.coverImageUrl ?? null}
      />
    );
  }
  const meta = STORE_ADMIN_SECTIONS.find((s) => s.id === section);
  return <StoreAdminComingSoon title={meta?.label ?? "Sección"} />;
}

export default function StoreAdmin() {
  const { isAuthenticated } = useAuth();
  const [, params] = useRoute("/tienda/:slug/admin/:section?");
  const slug = params?.slug ?? "";
  const sectionParam = params?.section;
  const activeSection = normalizeStoreAdminSection(sectionParam);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!slug) return;
    if (!sectionParam) {
      setLocation(`/tienda/${encodeURIComponent(slug)}/admin/${storeAdminSectionPath("productos")}`, {
        replace: true,
      });
    }
  }, [slug, sectionParam, setLocation]);

  const { data, isLoading, error } = useStoreBySlug(slug, isAuthenticated && Boolean(slug));

  if (!isAuthenticated) {
    return (
      <div className="container max-w-md py-16 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Acceso restringido</CardTitle>
            <CardDescription>Inicia sesión para administrar tu tienda.</CardDescription>
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

  if (isLoading || (!sectionParam && slug)) {
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

  const { store, isOwner, visibilityActive } = data;

  if (!isOwner) {
    return (
      <div className="container max-w-md py-16 px-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Solo el dueño
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

  if (!visibilityActive) {
    return (
      <div className="container max-w-md py-16 px-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Tienda inactiva
            </CardTitle>
            <CardDescription>
              Activa la mensualidad de tu tienda para acceder al panel de administración.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/tienda/${encodeURIComponent(slug)}/pago`}>Ir a pago</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/tienda/${encodeURIComponent(slug)}`}>Volver</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (store.hasPendingSubscriptionPayment && !visibilityActive) {
    return (
      <div className="container max-w-md py-16 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Comprobante en revisión</CardTitle>
            <CardDescription>
              El panel se habilitará cuando el equipo valide tu pago de mensualidad.
            </CardDescription>
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
    <StoreAdminLayout slug={slug} storeName={store.name} activeSection={activeSection}>
      {sectionPanel(activeSection, store)}
    </StoreAdminLayout>
  );
}

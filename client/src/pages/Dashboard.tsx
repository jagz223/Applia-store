import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Loader2, Store } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { hasAdminRole } from "@/lib/auth-utils";
import {
  fetchPrimaryStore,
  getPrimaryStoreVitrinaHref,
} from "@/hooks/use-primary-store";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const isAdmin = isAuthenticated && hasAdminRole(user);
  const [needsStoreSetup, setNeedsStoreSetup] = useState(false);
  const [checkingStore, setCheckingStore] = useState(false);

  /** Clientes van directo a la vitrina principal. */
  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      setLocation("/tienda");
      return;
    }
  }, [authLoading, isAdmin, setLocation]);

  const resolveTienda = async () => {
    setCheckingStore(true);
    setNeedsStoreSetup(false);
    try {
      const store = await fetchPrimaryStore();
      if (store?.slug) {
        setLocation(getPrimaryStoreVitrinaHref(store));
        return;
      }
      setNeedsStoreSetup(true);
    } catch {
      setNeedsStoreSetup(true);
    } finally {
      setCheckingStore(false);
    }
  };

  if (authLoading || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <section className="border-b border-border bg-gradient-to-r from-primary/20 via-background to-accent/20">
        <div className="container mx-auto max-w-7xl px-4 py-8">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Dashboard</h1>
          <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
            Accede a la vitrina y administra la tienda.
          </p>
        </div>
      </section>

      <section className="container mx-auto max-w-lg px-4 py-12">
        <div className="flex flex-col items-center gap-4">
          <Button
            type="button"
            size="lg"
            className="min-w-[12rem] gap-2"
            onClick={() => void resolveTienda()}
            disabled={checkingStore}
          >
            {checkingStore ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <Store className="h-5 w-5" aria-hidden />
            )}
            Tienda
          </Button>

          {needsStoreSetup && (
            <Button type="button" size="lg" variant="outline" className="min-w-[12rem]" asChild>
              <Link href="/tienda/crear">Llenar información de la tienda</Link>
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

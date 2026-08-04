import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { hasAdminRole } from "@/lib/auth-utils";

type PrimaryStore = {
  id: number;
  name: string;
  slug: string;
};

async function fetchPrimaryStore(): Promise<PrimaryStore | null> {
  const res = await fetch("/api/stores/primary");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? "No se pudo cargar la tienda");
  }
  const data = (await res.json()) as { store: PrimaryStore | null };
  return data.store;
}

/**
 * Entrada a la tienda: redirige a la vitrina principal.
 * Admin/dueño ven la misma vitrina con panel de configuración (en StorePage).
 */
export default function StoreEntry() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const isAdmin = isAuthenticated && hasAdminRole(user);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = await fetchPrimaryStore();
        if (cancelled) return;
        if (store?.slug) {
          setLocation(`/tienda/${encodeURIComponent(store.slug)}`);
          return;
        }
        setEmpty(true);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "No se pudo abrir la tienda");
        setEmpty(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setLocation]);

  if (empty) {
    return (
      <div className="flex min-h-[50vh] flex-1 flex-col items-center justify-center gap-4 px-4">
        <p className="text-center text-muted-foreground text-base">
          {error ?? "no hay articulos aún"}
        </p>
        {isAdmin && (
          <Button asChild>
            <Link href="/tienda/crear">Llenar información de la tienda</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] flex-1 items-center justify-center">
      <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" aria-hidden />
    </div>
  );
}

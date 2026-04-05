import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { hasAdminRole } from "@/lib/auth-utils";
import { AlertCircle } from "lucide-react";
import { useCurrentProvider } from "@/hooks/use-mango-data";

/**
 * Aviso global para profesionales cuyo proveedor aún no está verificado por la plataforma.
 * Staff (admin / Soporte TI) no debe verlo aunque tenga fila de proveedor en BD.
 */
export function ProfessionalVerificationBanner() {
  const { user, isAuthenticated, isLoading } = useAuth();

  const { data: currentProvider } = useCurrentProvider();
  
  if (isLoading || !isAuthenticated || !user) return null;
  if (hasAdminRole(user)) return null;

  const provider = currentProvider || user.provider;
  const isPro = user.role === "professional" || provider != null;
  if (!isPro || !provider) return null;

  if (provider.isVerified === true) return null;

  return (
    <div
      role="status"
      className="w-full border-b border-amber-500/40 bg-amber-500/15 px-4 py-2.5 text-sm text-foreground"
    >
      <div className="container max-w-6xl mx-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-start gap-2 min-w-0">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-700 mt-0.5" aria-hidden />
          <p className="leading-snug text-amber-950 dark:text-amber-100 font-medium">
            no está verificado, por lo que su servicio no será visible
          </p>
        </div>
        <Button size="sm" variant="default" className="shrink-0 w-fit sm:w-auto" asChild>
          <Link href="/professional/verify">verificar</Link>
        </Button>
      </div>
    </div>
  );
}

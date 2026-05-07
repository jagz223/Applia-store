import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { hasAdminRole } from "@/lib/auth-utils";
import { storeVerifyReturnPath } from "@/lib/verify-return-path";
import { AlertCircle } from "lucide-react";
import { useCategories, useCurrentProvider, useVerifyingStatusMe } from "@/hooks/use-mango-data";
import { isCarGoProvider } from "@shared/provider-car-go";
import { useMemo } from "react";

/**
 * Aviso global para profesionales cuyo proveedor aún no está verificado por la plataforma.
 * Staff (admin / Soporte TI) no debe verlo aunque tenga fila de proveedor en BD.
 */
export function ProfessionalVerificationBanner() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { data: currentProvider } = useCurrentProvider();
  const [location] = useLocation();
  const pathOnly = location.split("?")[0];

  const provider = currentProvider || user?.provider;
  const { data: categories = [] } = useCategories();
  const isCarGo = useMemo(() => isCarGoProvider(provider ?? undefined, categories), [provider, categories]);
  const isPro = user != null && (user.role === "professional" || provider != null);
  const unverified = provider != null && provider.isVerified !== true;

  const fetchVerifyingStatus =
    isAuthenticated &&
    !isLoading &&
    user != null &&
    !hasAdminRole(user) &&
    isPro &&
    unverified &&
    !pathOnly.startsWith("/edit-service");

  const { data: verifyingStatus, isLoading: verifyingStatusLoading } = useVerifyingStatusMe(fetchVerifyingStatus);

  if (isLoading || !isAuthenticated || !user) return null;
  if (hasAdminRole(user)) return null;

  if (pathOnly.startsWith("/edit-service")) return null;

  if (!isPro || !provider) return null;
  if (provider.isVerified === true) return null;

  const inReview =
    verifyingStatus != null &&
    (verifyingStatus.identification_verified === "pending" ||
      verifyingStatus.transacction_verified === "pending");

  if (verifyingStatusLoading) return null;

  if (inReview) {
    return (
      <div
        role="status"
        className="w-full border-b border-sky-500/35 bg-sky-500/10 px-4 py-2.5 text-sm text-foreground"
      >
        <div className="container max-w-6xl mx-auto flex items-start gap-2 min-w-0">
          <AlertCircle className="h-5 w-5 shrink-0 text-sky-800 dark:text-sky-200 mt-0.5" aria-hidden />
          <p className="leading-snug text-sky-950 dark:text-sky-50 font-medium">
            {isCarGo
              ? "Tu solicitud de verificación está en revisión. Cuando sea aprobada, los clientes podrán usar tus servicios de movilidad con normalidad."
              : "Tu solicitud de verificación está en revisión. Cuando sea aprobada, tu servicio podrá mostrarse con normalidad en el sitio."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="w-full border-b border-amber-500/40 bg-amber-500/15 px-4 py-2.5 text-sm text-foreground"
    >
      <div className="container max-w-6xl mx-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-start gap-2 min-w-0">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-700 mt-0.5" aria-hidden />
          <p className="leading-snug text-amber-950 dark:text-amber-100 font-medium">
            {isCarGo
              ? "Aún no estás verificado; los clientes no podrán usar tus servicios de movilidad hasta completar la verificación."
              : "Aún no estás verificado; tu servicio no será visible para los clientes hasta completar la verificación."}
          </p>
        </div>
        <Button size="sm" variant="default" className="shrink-0 w-fit sm:w-auto" asChild>
          <Link href="/professional/verify" onClick={() => storeVerifyReturnPath()}>
            Verificar
          </Link>
        </Button>
      </div>
    </div>
  );
}

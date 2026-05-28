import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { hasAdminRole } from "@/lib/auth-utils";
import { userCanActAsAssociate } from "@/lib/user-permissions";
import { storeVerifyReturnPath } from "@/lib/verify-return-path";
import { AlertCircle } from "lucide-react";
import { useCategories, useCurrentProvider, useVerifyingStatusMe } from "@/hooks/use-mango-data";
import { useMemo } from "react";
import {
  getVerificationBannerKind,
  VERIFICATION_IN_REVIEW_BY_KIND,
  VERIFICATION_PENDING_BY_KIND,
} from "@/components/professional-verification-banner-messages";
import { cn } from "@/lib/utils";

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
  const bannerKind = useMemo(() => getVerificationBannerKind(provider ?? undefined, categories), [provider, categories]);
  const isPro = user != null && (provider != null || userCanActAsAssociate(user));
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

  const inReviewCopy = VERIFICATION_IN_REVIEW_BY_KIND[bannerKind];
  const pendingCopy = VERIFICATION_PENDING_BY_KIND[bannerKind];

  if (inReview) {
    return (
      <div
        role="status"
        className={cn(
          "w-full border-b text-xs sm:text-sm",
          "border-sky-200 bg-sky-50 text-sky-950",
          "dark:border-sky-500/35 dark:bg-sky-950/55 dark:text-sky-50",
          "max-md:py-1.5 max-md:px-3 sm:py-2.5 sm:px-4"
        )}
      >
        <div className="container mx-auto flex max-w-6xl min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="flex min-w-0 items-start gap-2 sm:gap-2.5">
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300 sm:h-5 sm:w-5"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="font-medium leading-snug">
                <span className="md:hidden">{inReviewCopy.compact}</span>
                <span className="hidden md:inline">{inReviewCopy.full}</span>
              </p>
              <p className="mt-1.5 text-[11px] font-normal leading-snug text-sky-900/85 dark:text-sky-100/85 sm:text-xs">
                Si subiste un archivo por error, en Verificación puedes sustituirlo: como máximo una vez más por
                tipo de documento (identificación y documento profesional) mientras siga en revisión. Si el equipo
                rechaza los archivos, podrás enviar todo de nuevo sin ese límite.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0 touch-manipulation self-start border-sky-300 bg-white/80 text-sky-950 hover:bg-sky-100 dark:border-sky-500/50 dark:bg-sky-950/40 dark:text-sky-50 dark:hover:bg-sky-900/60 sm:self-center"
            asChild
          >
            <Link href="/professional/verify" onClick={() => storeVerifyReturnPath()}>
              Ir a verificación
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      className={cn(
        "w-full border-b text-xs sm:text-sm",
        "border-amber-200 bg-amber-50 text-amber-950",
        "dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-50",
        "max-md:py-1.5 max-md:px-3 sm:py-2.5 sm:px-4"
      )}
    >
      <div className="container mx-auto flex max-w-6xl min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex min-w-0 items-start gap-2 sm:gap-2.5">
          <AlertCircle
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300 sm:h-5 sm:w-5"
            aria-hidden
          />
          <p className="min-w-0 font-medium leading-snug">
            <span className="md:hidden">{pendingCopy.compact}</span>
            <span className="hidden md:inline">{pendingCopy.full}</span>
          </p>
        </div>
        <Button
          size="sm"
          variant="default"
          className="h-8 shrink-0 touch-manipulation self-start bg-teal-600 px-3 text-xs text-white hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600 sm:h-9 sm:self-center sm:text-sm"
          asChild
        >
          <Link href="/professional/verify" onClick={() => storeVerifyReturnPath()}>
            Verificar
          </Link>
        </Button>
      </div>
    </div>
  );
}

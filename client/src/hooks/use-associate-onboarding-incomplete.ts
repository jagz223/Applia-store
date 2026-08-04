import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentProvider } from "@/hooks/use-mango-data";
import { userCanActAsAssociate } from "@/lib/user-permissions";
import {
  clearAssociateOnboardingStarted,
  readAssociateOnboardingStarted,
  subscribeAssociateOnboardingBump,
} from "@/lib/associate-onboarding-storage";

/**
 * Usuario que debe terminar `/become-pro`: rol/permisos de asociado sin perfil de proveedor,
 * o quien haya abierto el formulario (marca en localStorage) y aún no tenga perfil.
 */
export function useAssociateOnboardingIncomplete() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: providerProfile, isLoading: providerLoading, isFetching: providerFetching } = useCurrentProvider();
  const [startedFlag, setStartedFlag] = useState(false);

  useEffect(() => {
    const bump = () => setStartedFlag(readAssociateOnboardingStarted());
    bump();
    const unsubBump = subscribeAssociateOnboardingBump(bump);
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === "applia_associate_onboarding_started") bump();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsubBump();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const actsAsAssociate = userCanActAsAssociate(user);

  /**
   * `/api/auth/me` suele traer `user.provider` en cuanto existe fila de proveedor.
   * `/api/providers/me` puede ir detrás (caché null + refetch): sin esto el banner «registro sin terminar»
   * parpadea un frame y desaparece al recargar.
   */
  const embeddedProviderId = Number((user as { provider?: { id?: unknown } } | null)?.provider?.id);
  const hasEmbeddedProvider = Number.isFinite(embeddedProviderId) && embeddedProviderId > 0;
  const hasProviderRecord = providerProfile != null || hasEmbeddedProvider;

  /** Profesional sin fila aún resuelta: esperar a que termine el fetch (incl. refetch con isLoading ya false). */
  const providerStillResolving =
    isAuthenticated &&
    actsAsAssociate &&
    !hasProviderRecord &&
    (providerLoading || providerFetching);

  useEffect(() => {
    if (hasProviderRecord) clearAssociateOnboardingStarted();
  }, [hasProviderRecord]);

  const incomplete = useMemo(() => {
    if (!isAuthenticated || authLoading) return false;
    if (providerLoading) return false;
    if (providerStillResolving) return false;
    if (hasProviderRecord) return false;
    return actsAsAssociate || startedFlag;
  }, [
    isAuthenticated,
    authLoading,
    providerLoading,
    hasProviderRecord,
    actsAsAssociate,
    startedFlag,
    providerStillResolving,
  ]);

  const associatePanelHref = incomplete ? "/become-pro" : "/professional-dashboard";

  return {
    incomplete,
    associatePanelHref,
    loading: authLoading || providerLoading || providerStillResolving,
  };
}

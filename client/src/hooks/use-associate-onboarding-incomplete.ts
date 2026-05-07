import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentProvider } from "@/hooks/use-mango-data";
import {
  clearAssociateOnboardingStarted,
  readAssociateOnboardingStarted,
  subscribeAssociateOnboardingBump,
} from "@/lib/associate-onboarding-storage";

/**
 * Usuario que debe terminar `/become-pro`: rol professional sin perfil de proveedor,
 * o cualquier rol que haya abierto el formulario de asociado (marca en localStorage) y aún no tenga perfil.
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
      if (e.key === null || e.key === "genfeb_associate_onboarding_started") bump();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsubBump();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const role = String((user as { role?: string } | null)?.role ?? "").toLowerCase();
  const isProfessionalRole = role === "professional";

  const hasProvider = providerProfile != null;

  useEffect(() => {
    if (hasProvider) clearAssociateOnboardingStarted();
  }, [hasProvider]);

  const incomplete = useMemo(() => {
    if (!isAuthenticated || authLoading) return false;
    if (providerLoading) return false;
    if (hasProvider) return false;
    return isProfessionalRole || startedFlag;
  }, [isAuthenticated, authLoading, providerLoading, hasProvider, isProfessionalRole, startedFlag]);

  const associatePanelHref = incomplete ? "/become-pro" : "/professional-dashboard";

  return {
    incomplete,
    associatePanelHref,
    loading: authLoading || providerLoading,
  };
}

import { useAuth } from "@/hooks/use-auth";
import { shouldShowBecomeProCTA } from "@/lib/auth-utils";

/**
 * Hook que centraliza la visibilidad del CTA "Convertirse en Profesional".
 * Retorna true solo cuando el usuario NO es profesional ni admin.
 */
export function useShowBecomePro(): boolean {
  const { user } = useAuth();
  return shouldShowBecomeProCTA(user ?? null);
}

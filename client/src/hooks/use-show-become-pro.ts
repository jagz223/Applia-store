import { useAuth } from "@/hooks/use-auth";
import { shouldShowBecomeProCTA } from "@/lib/auth-utils";

/**
 * Hook que centraliza la visibilidad del CTA "Convertirse en Profesional".
 * Admin puede verlo si aún no tiene perfil de proveedor.
 */
export function useShowBecomePro(): boolean {
  const { user } = useAuth();
  return shouldShowBecomeProCTA(user ?? null);
}

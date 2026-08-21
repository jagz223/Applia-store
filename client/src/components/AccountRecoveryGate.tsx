import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

const ALLOWED_PREFIXES = [
  "/account-recovery/",
  "/forgot-password",
  "/login",
  "/register",
];

function isAllowedPath(pathname: string): boolean {
  return ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

/**
 * Redirige a configuración de preguntas si el usuario autenticado aún no las tiene.
 */
export function AccountRecoveryGate() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;
    const pathname = (location.split("?")[0] ?? location) || "/";
    if (isAllowedPath(pathname)) return;
    const configured = (user as { recoveryQuestionsConfigured?: boolean }).recoveryQuestionsConfigured === true;
    if (!configured) {
      const next = encodeURIComponent(pathname + (location.includes("?") ? location.slice(location.indexOf("?")) : ""));
      setLocation(`/account-recovery/setup?next=${next}`);
    }
  }, [isLoading, isAuthenticated, user, location, setLocation]);

  return null;
}

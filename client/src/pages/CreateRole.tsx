import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { hasFullAdminRole } from "@/lib/auth-utils";
import { AccessGateLoading } from "@/components/AccessGateLoading";

/** Ruta legada: redirige al panel de roles (gestión integrada en pestaña Roles). */
export default function CreateRole() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (authLoading) return;
    if (!hasFullAdminRole(user)) {
      setLocation("/");
      return;
    }
    setLocation("/admin?tab=roles");
  }, [authLoading, user, setLocation]);

  return <AccessGateLoading message="Redirigiendo a gestión de roles…" />;
}

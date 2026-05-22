import { useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { hasAdminRole } from "@/lib/auth-utils";
import { AccessGateLoading } from "@/components/AccessGateLoading";
import { fetchAdminJson } from "@/lib/admin-api";
import {
  adminProviderEditHref,
  adminUsersTabEditHref,
  isAssociateUserRole,
  type AdminUserDetail,
} from "@/lib/admin-user-edit";

/** Ruta legacy: redirige al modal en Usuarios o a la ficha de asociado. */
export default function EditUser() {
  const [, params] = useRoute("/admin/users/:id/edit");
  const id = params?.id ?? "";
  const { user: currentUser, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (authLoading) return;
    if (!hasAdminRole(currentUser)) {
      setLocation("/");
      return;
    }
    if (!id) {
      setLocation("/admin?tab=users");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const detail = await fetchAdminJson<AdminUserDetail>(`/api/admin/users/${id}`);
        if (cancelled) return;

        const providerId = detail.providerId;
        if (isAssociateUserRole(detail.role) && providerId != null && providerId > 0) {
          setLocation(adminProviderEditHref(providerId, "/admin?tab=users"));
          return;
        }
        setLocation(adminUsersTabEditHref(id));
      } catch {
        if (!cancelled) {
          toast({
            variant: "destructive",
            title: "Error",
            description: "No se pudo cargar el usuario.",
          });
          setLocation("/admin?tab=users");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, authLoading, currentUser, setLocation, toast]);

  return (
    <div className="container max-w-2xl py-12 px-4 flex justify-center items-center min-h-[200px]">
      {authLoading ? (
        <AccessGateLoading message="Cargando sesión…" className="min-h-0" />
      ) : (
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}

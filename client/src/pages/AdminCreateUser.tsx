import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { hasAdminRole } from "@/lib/auth-utils";
import { AccessGateLoading } from "@/components/AccessGateLoading";
import { AdminRegisterUserForm } from "@/components/admin/AdminRegisterUserForm";

export default function AdminCreateUser() {
  const { user: currentUser, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (authLoading) return;
    if (!hasAdminRole(currentUser)) {
      setLocation("/");
    }
  }, [authLoading, currentUser, setLocation]);

  if (authLoading) {
    return <AccessGateLoading message="Cargando sesión…" />;
  }
  if (!hasAdminRole(currentUser)) {
    return <AccessGateLoading message="Redirigiendo al inicio…" />;
  }

  return (
    <div className="container py-8 px-4">
      <div className="mb-6 max-w-2xl mx-auto">
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" asChild>
          <Link href="/admin?tab=users" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver a usuarios
          </Link>
        </Button>
      </div>
      <AdminRegisterUserForm
        onSuccess={() => setLocation("/admin?tab=users")}
        onCancel={() => setLocation("/admin?tab=users")}
        description="Registro con el mismo flujo que «Crear cuenta», asignando cualquier rol del catálogo (cliente, asociado, central, admin, Soporte TI o roles personalizados)."
      />
    </div>
  );
}

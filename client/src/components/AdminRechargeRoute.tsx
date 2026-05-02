import type { ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";

type Props = { children: ReactNode };

/** Solo administradores pueden abrir flujos de recarga (rutas /recharge*). */
export function AdminRechargeRoute({ children }: Props) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground" role="status">
        Cargando…
      </div>
    );
  }
  if ((user as { role?: string } | null)?.role !== "admin") {
    return <Redirect to="/" />;
  }
  return <>{children}</>;
}

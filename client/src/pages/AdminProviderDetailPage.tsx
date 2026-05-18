import { useEffect } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { hasAdminRole, hasFullAdminRole } from "@/lib/auth-utils";
import { AdminProviderDetailPanel } from "@/components/admin/AdminProviderDetailPanel";

const DEFAULT_RETURN = "/admin?tab=providers";

function resolveReturnHref(): string {
  if (typeof window === "undefined") return DEFAULT_RETURN;
  const q = new URLSearchParams(window.location.search).get("return");
  if (!q || !q.startsWith("/admin")) return DEFAULT_RETURN;
  return q;
}

export default function AdminProviderDetailPage() {
  const [, params] = useRoute("/admin/providers/:providerId");
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const providerId = parseInt(params?.providerId ?? "0", 10);
  const returnHref = resolveReturnHref();

  useEffect(() => {
    if (authLoading) return;
    if (!hasAdminRole(user)) setLocation("/");
  }, [authLoading, user, setLocation]);

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasAdminRole(user)) {
    return null;
  }

  if (!Number.isFinite(providerId) || providerId <= 0) {
    return (
      <div className="container mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">Asociado no válido.</p>
        <Button asChild variant="outline">
          <Link href={DEFAULT_RETURN}>Volver al panel</Link>
        </Button>
      </div>
    );
  }

  return (
    <AdminProviderDetailPanel
      providerId={providerId}
      canEdit={hasFullAdminRole(user)}
      returnHref={returnHref}
    />
  );
}

import { Link } from "wouter";
import { LogIn, Home, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Vista mostrada cuando un usuario autenticado intenta acceder a una ruta
 * solo para invitados (p. ej. registro). Mensaje y acciones en un solo componente (DRY).
 */
export function AlreadyAuthenticatedView() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-mango-orange/20 via-background to-mango-green/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <LogIn className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl font-bold">
            Ya tienes una cuenta
          </CardTitle>
          <CardDescription>
            Has iniciado sesión. Si deseas crear otra cuenta, cierra sesión primero. Puedes ir al inicio o a tu panel de control.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button variant="default" className="w-full" asChild>
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Ir al inicio
            </Link>
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <Link href="/dashboard">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Mi panel de control
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

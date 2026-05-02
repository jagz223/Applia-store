import { Link } from "wouter";
import { Bell, ChevronRight, Shield, User } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeAppearanceCard } from "@/components/ThemeAppearanceCard";

type QuickSettingsPanelProps = {
  /** Ruta para volver desde /settings (solo path, ej. `/go/cargo`). */
  returnPath: string;
  onNavigate?: () => void;
};

const linkCls =
  "flex items-center justify-between w-full rounded-lg border border-border bg-muted/25 px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/45 active:scale-[0.99]";

export function QuickSettingsPanel({ returnPath, onNavigate }: QuickSettingsPanelProps) {
  const safeReturn =
    typeof returnPath === "string" && returnPath.startsWith("/") ? returnPath : "/dashboard";
  const settingsHref = `/settings?return=${encodeURIComponent(safeReturn)}`;

  return (
    <div className="space-y-4">
      <ThemeAppearanceCard />

      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 shrink-0" aria-hidden /> Cuenta
          </CardTitle>
          <CardDescription>Mismo contenido que en Configuración del sitio; aquí puedes abrir sin ir al inicio.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Link href={settingsHref} onClick={onNavigate} className={linkCls}>
            <span>Editar perfil y datos de pago</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
          <Link href="/notifications" onClick={onNavigate} className={linkCls}>
            <span className="inline-flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" aria-hidden />
              Notificaciones
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
          <Link href="/politics" onClick={onNavigate} className={linkCls}>
            <span className="inline-flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" aria-hidden />
              Legal y políticas
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

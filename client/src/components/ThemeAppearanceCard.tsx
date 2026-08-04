import { Palette } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

/** Bloque coherente con Configuración: apariencia y tema persistente localmente. */
export function ThemeAppearanceCard({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <Card className={cn("border-primary/15", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Palette className="h-5 w-5 text-primary shrink-0" aria-hidden />
          Apariencia
        </CardTitle>
        <CardDescription>Tema del sitio — se guarda en este navegador</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
          <div className="min-w-0 space-y-0.5">
            <Label htmlFor="applia-dark-mode-switch" className="text-sm font-medium text-foreground cursor-pointer">
              Modo oscuro
            </Label>
            <p className="text-xs text-muted-foreground leading-snug">
              Modo claro: Voyager (Carto). Modo oscuro: Alidade Smooth Dark (Stadia Maps)
            </p>
          </div>
          <Switch
            id="applia-dark-mode-switch"
            checked={theme === "dark"}
            onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
            aria-label={theme === "dark" ? "Cambiar a modo claro" : "Activar modo oscuro"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

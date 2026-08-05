import { Palette } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

/** Preferencia de tema claro/oscuro (local al navegador). */
export function ThemeAppearanceCard({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <section
      className={cn(
        "rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-sm backdrop-blur-sm",
        className,
      )}
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Palette className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold tracking-tight text-foreground">Tema</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Elige cómo se ve Applia Store en este dispositivo.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor="applia-dark-mode-switch" className="cursor-pointer text-sm font-semibold text-foreground">
            Modo oscuro
          </Label>
          <p className="text-xs text-muted-foreground leading-snug">
            {theme === "dark" ? "Activo ahora" : "Desactivado — modo claro"}
          </p>
        </div>
        <Switch
          id="applia-dark-mode-switch"
          checked={theme === "dark"}
          onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
          aria-label={theme === "dark" ? "Cambiar a modo claro" : "Activar modo oscuro"}
        />
      </div>
    </section>
  );
}

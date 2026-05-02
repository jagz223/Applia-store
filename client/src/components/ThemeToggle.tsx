import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

/** Compacto para la barra superior en escritorio. */
export function ThemeToggleHeaderButton({
  className,
  variant = "outline",
}: {
  className?: string;
  variant?: "outline" | "ghost";
}) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className={cn("gap-2 shrink-0 border-border", className)}
      onClick={toggleTheme}
      title={isDark ? "Activar modo claro" : "Activar modo oscuro"}
      aria-pressed={isDark}
      aria-label={isDark ? "Activar modo claro" : "Activar modo oscuro"}
    >
      {isDark ? <Sun className="h-4 w-4 shrink-0" aria-hidden /> : <Moon className="h-4 w-4 shrink-0" aria-hidden />}
      <span className="hidden xl:inline text-sm">{isDark ? "Claro" : "Oscuro"}</span>
    </Button>
  );
}

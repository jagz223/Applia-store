import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

/** Botón de tema circular suave para la barra. */
export function ThemeToggleHeaderButton({
  className,
}: {
  className?: string;
  variant?: "outline" | "ghost";
}) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? "Activar modo claro" : "Activar modo oscuro"}
      aria-pressed={isDark}
      aria-label={isDark ? "Activar modo claro" : "Activar modo oscuro"}
      className={cn(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/70 text-foreground transition-colors",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40",
        className,
      )}
    >
      {isDark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
    </button>
  );
}

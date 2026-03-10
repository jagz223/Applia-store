import * as LucideIcons from "lucide-react";

export interface CategoryIconProps {
  /** Nombre del icono Lucide (ej: "Wrench", "Scale"). */
  name: string;
  className?: string;
}

/**
 * Renderiza el icono de una categoría por nombre (Lucide).
 * Útil para categorías con campo `icon` en BD.
 */
export function CategoryIcon({ name, className = "h-4 w-4" }: CategoryIconProps) {
  const IconComponent =
    (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name] ??
    LucideIcons.HelpCircle;
  return <IconComponent className={className} />;
}

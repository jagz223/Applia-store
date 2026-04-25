import { useEffect, type ReactNode, useMemo } from "react";
import { useLocation } from "wouter";
import { useCategoryVisibility } from "@/hooks/use-mango-data";
import { effectiveHiddenCategorySlugs } from "@shared/default-categories";
import { AccessGateLoading } from "@/components/AccessGateLoading";

type Props = {
  slug: "transport" | "marketplace" | "delivery";
  children: ReactNode;
};

/** Bloquea acceso a rutas Go cuando la categoría está oculta por rol. */
export function GoCategoryGate({ slug, children }: Props) {
  const { data: visibility, isLoading } = useCategoryVisibility();
  const hidden = useMemo(() => new Set(effectiveHiddenCategorySlugs(visibility?.hiddenSlugs)), [visibility]);
  const blocked = hidden.has(slug);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (blocked) setLocation("/");
  }, [isLoading, blocked, setLocation]);

  if (isLoading) return <AccessGateLoading message="Cargando…" />;
  if (blocked) return <AccessGateLoading message="Redirigiendo…" />;
  return <>{children}</>;
}


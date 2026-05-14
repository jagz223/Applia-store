import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useCategories, useCategoryVisibility, useSubcategories } from "@/hooks/use-mango-data";
import { effectiveHiddenCategorySlugs, getCategoryDisplayName } from "@shared/default-categories";
import { DEFAULT_SUBCATEGORIES } from "@shared/default-subcategories";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { api } from "@shared/routes";

/** Máximo 50 (API); cubre todas las subcategorías visibles para ordenar la cuadrícula. */
const CATEGORIES_POPULAR_SUB_LIMIT = 50;

export default function Categories() {
  const { data: categories = [] } = useCategories();
  const { data: visibility } = useCategoryVisibility();
  const hiddenSlugs = useMemo(
    () => new Set(effectiveHiddenCategorySlugs(visibility?.hiddenSlugs)),
    [visibility]
  );

  const getCat = (slug: string) => categories.find((c: any) => c.slug === slug);

  const technicalCat = getCat("technical");
  const professionalCat = getCat("professional");
  const maintenanceCat = getCat("maintenance");
  const transportCat = getCat("transport");

  const { data: technicalSubs = [] } = useSubcategories((technicalCat as any)?.id ?? null);
  const { data: professionalSubs = [] } = useSubcategories((professionalCat as any)?.id ?? null);
  const { data: maintenanceSubs = [] } = useSubcategories((maintenanceCat as any)?.id ?? null);

  const { data: monthlyPopularSubcategories } = useQuery({
    queryKey: [api.categories.monthlyPopularSubcategories.path, CATEGORIES_POPULAR_SUB_LIMIT],
    queryFn: async () => {
      const res = await fetch(api.categories.monthlyPopularSubcategories.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: CATEGORIES_POPULAR_SUB_LIMIT }),
      });
      if (!res.ok) throw new Error("No se pudieron cargar las subcategorías populares");
      return api.categories.monthlyPopularSubcategories.responses[200].parse(await res.json());
    },
    staleTime: 60_000,
  });

  const popularityBySubcategoryId = useMemo(() => {
    const m = new Map<number, number>();
    for (const row of monthlyPopularSubcategories?.items ?? []) {
      m.set(row.subcategoryId, row.count);
    }
    return m;
  }, [monthlyPopularSubcategories]);

  const allItems = useMemo(() => {
    const items: { key: string; name: string; icon: string; parentName: string; href: string }[] = [];

    for (const { cat, subs } of [
      { cat: technicalCat, subs: technicalSubs },
      { cat: professionalCat, subs: professionalSubs },
      { cat: maintenanceCat, subs: maintenanceSubs },
    ]) {
      if (!cat) continue;
      const catId = (cat as any).id;
      const parentName = getCategoryDisplayName(cat as any);
      for (const sub of subs) {
        const def = DEFAULT_SUBCATEGORIES.find((s) => s.slug === (sub as any).slug);
        items.push({
          key: `sub-${(sub as any).id}`,
          name: (sub as any).name,
          icon: def?.icon ?? "HelpCircle",
          parentName,
          href: `/explore?providerCategoryId=${catId}&subcategoryId=${(sub as any).id}`,
        });
      }
    }

    // Mobility cards (same size)
    if (transportCat && !hiddenSlugs.has("transport")) {
      items.push({ key: "transport", name: (transportCat as any).name, icon: "Car", parentName: "Conductores disponibles", href: "/go/taxi" });
    }

    return items;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [technicalSubs, professionalSubs, maintenanceSubs, technicalCat, professionalCat, maintenanceCat, transportCat, hiddenSlugs]);

  const popularMonthLabel = useMemo(() => {
    const key = monthlyPopularSubcategories?.monthKey;
    if (!key || !/^\d{4}-\d{2}$/.test(key)) return null;
    const [y, m] = key.split("-").map((x) => Number(x));
    if (!y || !m) return null;
    try {
      return new Intl.DateTimeFormat("es-EC", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(Date.UTC(y, m - 1, 4))
      );
    } catch {
      return key;
    }
  }, [monthlyPopularSubcategories?.monthKey]);

  const displayItems = useMemo(() => {
    const subs = allItems.filter((i) => i.key.startsWith("sub-"));
    const other = allItems.filter((i) => !i.key.startsWith("sub-"));
    const items = monthlyPopularSubcategories?.items;
    if (!items?.length) return allItems;
    const rank = new Map<number, number>();
    items.forEach((it, idx) => rank.set(it.subcategoryId, idx));
    subs.sort((a, b) => {
      const idA = Number(String(a.key).replace(/^sub-/, ""));
      const idB = Number(String(b.key).replace(/^sub-/, ""));
      const ra = rank.has(idA) ? rank.get(idA)! : 900 + idA;
      const rb = rank.has(idB) ? rank.get(idB)! : 900 + idB;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name, "es");
    });
    return [...subs, ...other];
  }, [allItems, monthlyPopularSubcategories]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      <section className="container mx-auto px-4 py-10 max-w-7xl">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-display font-bold text-foreground mb-2">Servicios por categoría</h2>
          <p className="text-muted-foreground text-sm">Haz clic en un servicio para explorar</p>
          {popularMonthLabel && (monthlyPopularSubcategories?.items?.length ?? 0) > 0 ? (
            <p className="text-xs sm:text-sm text-secondary font-medium max-w-2xl mx-auto mt-2">
              Orden por demanda: subcategorías con más reservas confirmadas o completadas en {popularMonthLabel}.
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {displayItems.map((item, index) => {
            const subcategoryIdForStats = item.key.startsWith("sub-")
              ? Number(String(item.key).replace(/^sub-/, ""))
              : NaN;
            const monthlyBookingCount = Number.isFinite(subcategoryIdForStats)
              ? popularityBySubcategoryId.get(subcategoryIdForStats)
              : undefined;
            return (
            <motion.div
              key={item.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Link href={item.href}>
                <Card className="cursor-pointer group hover:border-primary/50 transition-all duration-300 h-full">
                  <CardContent className="p-3 sm:p-5 text-center flex flex-col items-center gap-2 h-full justify-center min-h-[110px]">
                    <div className="p-2.5 rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                      <CategoryIcon name={item.icon} className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div className="min-w-0 w-full">
                      <p className="text-xs sm:text-sm font-semibold leading-tight">{item.name}</p>
                      {item.parentName ? (
                        <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                          {item.parentName}
                        </p>
                      ) : null}
                      {monthlyBookingCount != null && monthlyBookingCount > 0 ? (
                        <p className="text-[10px] sm:text-xs text-secondary tabular-nums font-medium mt-0.5 leading-snug">
                          {monthlyBookingCount} reserva{monthlyBookingCount === 1 ? "" : "s"} confirmada
                          {monthlyBookingCount === 1 ? "" : "s"} o completada{monthlyBookingCount === 1 ? "" : "s"} este mes
                        </p>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

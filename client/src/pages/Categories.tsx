import { useMemo } from "react";
import { Link } from "wouter";
import { useCategories, useCategoryVisibility, useSubcategories } from "@/hooks/use-mango-data";
import { DEFAULT_CATEGORIES, effectiveHiddenCategorySlugs } from "@shared/default-categories";
import { DEFAULT_SUBCATEGORIES } from "@shared/default-subcategories";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";

const providerSlugs = new Set(DEFAULT_CATEGORIES.map((c) => c.slug));

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
  const deliveryCat = getCat("delivery");

  const { data: technicalSubs = [] } = useSubcategories((technicalCat as any)?.id ?? null);
  const { data: professionalSubs = [] } = useSubcategories((professionalCat as any)?.id ?? null);
  const { data: maintenanceSubs = [] } = useSubcategories((maintenanceCat as any)?.id ?? null);

  const allItems = useMemo(() => {
    const items: { key: string; name: string; icon: string; parentName: string; href: string }[] = [];

    for (const { cat, subs } of [
      { cat: technicalCat, subs: technicalSubs },
      { cat: professionalCat, subs: professionalSubs },
      { cat: maintenanceCat, subs: maintenanceSubs },
    ]) {
      if (!cat) continue;
      const catId = (cat as any).id;
      const parentName = (cat as any).name;
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
      items.push({ key: "transport", name: (transportCat as any).name, icon: "Car", parentName: "Conductores disponibles", href: "/go/cargo" });
    }
    if (deliveryCat && !hiddenSlugs.has("delivery")) {
      items.push({ key: "delivery", name: (deliveryCat as any).name, icon: "Package", parentName: "Conductores disponibles", href: "/go/pack" });
    }

    return items;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [technicalSubs, professionalSubs, maintenanceSubs, technicalCat, professionalCat, maintenanceCat, transportCat, deliveryCat, hiddenSlugs]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      <section className="container mx-auto px-4 py-10 max-w-7xl">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-display font-bold text-foreground mb-2">Servicios por categoría</h2>
          <p className="text-muted-foreground text-sm">Haz clic en un servicio para explorar</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {allItems.map((item, index) => (
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
                    <div>
                      <p className="text-xs sm:text-sm font-semibold leading-tight">{item.name}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{item.parentName}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { CategoryIcon } from "@/components/CategoryIcon";

import { motion } from "framer-motion";

export interface SubcategoryItem {
  id: number;
  name: string;
  slug?: string;
}

export interface ExploreCategoryCardsProps {
  /** Lista de categorías de proveedor (con id, name, icon, slug). */
  categories: Array<{ id: number | null; name: string } & { slug?: string; icon?: string }>;
  /** Subcategorías por categoryId (ej. Servicios Profesionales -> Servicios Legales, Consultoría Financiera). */
  subcategoriesByCategoryId?: Record<number, SubcategoryItem[]>;
  /** Se llama al hacer clic en una carta. La visibilidad la define el admin, no el número de asociados. */
  onSelectCategory: (categoryId: number) => void;
  /** Se llama al hacer clic en una subcategoría (categoryId, subcategoryId). */
  onSelectSubcategory?: (categoryId: number, subcategoryId: number) => void;
}

export function ExploreCategoryCards({
  categories,
  onSelectCategory,
}: ExploreCategoryCardsProps) {
  return (
    <section className="container mx-auto px-4 py-10 max-w-7xl">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-display font-bold text-foreground mb-2">Servicios por categoría</h2>
        <p className="text-muted-foreground text-sm">
          Haz clic en una categoría para explorar; si no hay ofertas verás un aviso en la siguiente pantalla
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-4 md:gap-6">
        {categories.map((cat, index) => {
          const iconName = (cat as { icon?: string }).icon ?? "HelpCircle";
          return (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card
                className="card-industrial cursor-pointer group hover:border-primary/50 transition-all duration-300"
                onClick={() => cat.id != null && onSelectCategory(cat.id as number)}
              >
                <CardContent className="p-6 text-center">
                  <div className="p-4 rounded-xl text-primary bg-primary/10 w-fit mx-auto mb-4 group-hover:scale-110 transition-transform">
                    <CategoryIcon name={iconName} className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold mb-1">{cat.name}</h3>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { CategoryIcon } from "@/components/CategoryIcon";
import { motion } from "framer-motion";

export interface ExploreCategoryCardsProps {
  /** Lista de categorías de proveedor (con id, name, icon, slug). */
  categories: Array<{ id: number | null; name: string } & { slug?: string; icon?: string }>;
  /** Disponibilidad por id de categoría (si tiene al menos un profesional). */
  availability: Record<string, boolean> | undefined;
  /** Se llama al hacer clic en una carta disponible. */
  onSelectCategory: (categoryId: number) => void;
}

export function ExploreCategoryCards({ categories, availability, onSelectCategory }: ExploreCategoryCardsProps) {
  return (
    <section className="container mx-auto px-4 py-10 max-w-7xl">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-display font-bold text-foreground mb-2">Servicios por categoría</h2>
        <p className="text-muted-foreground text-sm">
          Haz clic en una categoría para ver los servicios de sus profesionales
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-4 md:gap-6">
        {categories.map((cat, index) => {
          const available = availability?.[String(cat.id)] === true;
          const iconName = (cat as { icon?: string }).icon ?? "HelpCircle";
          return (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card
                className={
                  available
                    ? "card-industrial cursor-pointer group hover:border-primary/50 transition-all duration-300"
                    : "card-industrial opacity-50 pointer-events-none transition-all duration-300"
                }
                onClick={() => available && cat.id != null && onSelectCategory(cat.id as number)}
              >
                <CardContent className="p-6 text-center">
                  <div
                    className={
                      available
                        ? "p-4 rounded-xl text-primary bg-primary/10 w-fit mx-auto mb-4 group-hover:scale-110 transition-transform"
                        : "p-4 rounded-xl text-muted-foreground bg-muted w-fit mx-auto mb-4"
                    }
                  >
                    <CategoryIcon name={iconName} className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold mb-1">{cat.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {available ? "Disponible" : "Sin profesionales"}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

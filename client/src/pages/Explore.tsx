import { useState, useMemo } from "react";
import { useCategories, useServices, useProviderCategoryAvailability } from "@/hooks/use-mango-data";
import { DEFAULT_CATEGORIES } from "@shared/default-categories";
import { ServiceCard } from "@/components/ServiceCard";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Sparkles, X, ArrowLeft } from "lucide-react";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

const providerSlugs = new Set(DEFAULT_CATEGORIES.map((c) => c.slug));

function CategoryIcon({ name }: { name: string }) {
  const IconComponent = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name] ?? Icons.HelpCircle;
  return <IconComponent className="h-4 w-4" />;
}

export default function Explore() {
  const [search, setSearch] = useState("");
  const params = new URLSearchParams(window.location.search);
  const initialProviderCategoryId = params.get("providerCategoryId");
  const parsedId = initialProviderCategoryId ? Number(initialProviderCategoryId) : undefined;
  const [selectedProviderCategoryId, setSelectedProviderCategoryId] = useState<number | undefined>(
    !Number.isNaN(parsedId) ? parsedId : undefined
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(
    params.get("categoryId") || undefined
  );

  const { data: categories = [] } = useCategories();
  const { data: availability } = useProviderCategoryAvailability();
  const providerCategories = useMemo(
    () => categories.filter((c) => (c as { slug?: string }).slug && providerSlugs.has((c as { slug: string }).slug)),
    [categories]
  );

  const { data: services, isLoading } = useServices({
    categoryId: selectedCategoryId,
    search: search || undefined,
    providerCategoryId: selectedProviderCategoryId,
  });

  const selectedCategoryData = categories?.find((c) => String(c.id) === selectedCategoryId);
  const selectedProviderCategoryData = providerCategories.find(
    (c) => c.id === selectedProviderCategoryId
  );

  const showCategoryCards = selectedProviderCategoryId == null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      <div className="bg-white dark:bg-card border-b border-border/50 sticky top-16 z-40 backdrop-blur-xl bg-white/80 dark:bg-card/80">
        <div className="container mx-auto px-4 py-6 max-w-7xl">
          <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground flex items-center gap-3">
                <Sparkles className="h-7 w-7 text-primary" />
                Explorar Servicios
              </h1>
              <p className="text-muted-foreground mt-1">Encuentra el profesional perfecto para tu proyecto</p>
            </div>
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Buscar servicios..."
                className="pl-12 h-12 rounded-2xl border-border/50 bg-muted/50 shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-base"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-6">
            <button
              onClick={() => setSelectedCategoryId(undefined)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${
                !selectedCategoryId
                  ? "bg-primary text-white shadow-lg shadow-primary/30"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
              }`}
            >
              Todos
            </button>
            {categories?.map((cat) => (
              <button
                key={cat.id}
                onClick={() =>
                  setSelectedCategoryId(selectedCategoryId === String(cat.id) ? undefined : String(cat.id))
                }
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${
                  selectedCategoryId === String(cat.id)
                    ? "bg-primary text-white shadow-lg shadow-primary/30"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                }`}
              >
                <CategoryIcon name={(cat as { icon?: string }).icon ?? "HelpCircle"} />
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showCategoryCards && (
        <section className="container mx-auto px-4 py-10 max-w-7xl">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-display font-bold text-foreground mb-2">Servicios por categoría</h2>
            <p className="text-muted-foreground text-sm">
              Haz clic en una categoría para ver los servicios de sus profesionales
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-4 md:gap-6">
            {providerCategories.map((cat, index) => {
              const available = availability?.[String(cat.id)] === true;
              const iconName = (cat as { icon?: string }).icon ?? "HelpCircle";
              const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[iconName] ?? Icons.HelpCircle;
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
                    onClick={() => available && setSelectedProviderCategoryId(cat.id as number)}
                  >
                    <CardContent className="p-6 text-center">
                      <div
                        className={
                          available
                            ? "p-4 rounded-xl text-primary bg-primary/10 w-fit mx-auto mb-4 group-hover:scale-110 transition-transform"
                            : "p-4 rounded-xl text-muted-foreground bg-muted w-fit mx-auto mb-4"
                        }
                      >
                        <Icon className="w-8 h-8" />
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
      )}

      {selectedProviderCategoryId != null && (
        <div className="container mx-auto px-4 py-4 max-w-7xl">
          <Button
            variant="ghost"
            className="mb-4 gap-2"
            onClick={() => setSelectedProviderCategoryId(undefined)}
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a categorías
          </Button>
          {selectedProviderCategoryData && (
            <h2 className="text-xl font-display font-bold text-foreground mb-4">
              Servicios en {selectedProviderCategoryData.name}
            </h2>
          )}
        </div>
      )}

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {(selectedCategoryId || search || selectedProviderCategoryId != null) && (
          <div className="mb-6 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-muted-foreground">Filtros:</span>
            {selectedProviderCategoryData && (
              <Badge variant="secondary" className="gap-1 pr-1">
                {selectedProviderCategoryData.name}
                <button
                  onClick={() => setSelectedProviderCategoryId(undefined)}
                  className="ml-1 p-0.5 hover:bg-muted rounded-full"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {selectedCategoryData && (
              <Badge variant="secondary" className="gap-1 pr-1">
                {selectedCategoryData.name}
                <button
                  onClick={() => setSelectedCategoryId(undefined)}
                  className="ml-1 p-0.5 hover:bg-muted rounded-full"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {search && (
              <Badge variant="secondary" className="gap-1 pr-1">
                &quot;{search}&quot;
                <button onClick={() => setSearch("")} className="ml-1 p-0.5 hover:bg-muted rounded-full">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-primary h-auto py-1"
              onClick={() => {
                setSearch("");
                setSelectedCategoryId(undefined);
                setSelectedProviderCategoryId(undefined);
              }}
            >
              Limpiar todo
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground">Cargando servicios...</p>
          </div>
        ) : services?.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-20 bg-white dark:bg-card rounded-3xl border border-dashed border-border shadow-lg"
          >
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
              <Search className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-2xl font-bold font-display mb-3">No se encontraron servicios</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Intenta ajustar tus filtros o términos de búsqueda.
            </p>
            <Button
              className="rounded-full px-8"
              onClick={() => {
                setSearch("");
                setSelectedCategoryId(undefined);
                setSelectedProviderCategoryId(undefined);
              }}
            >
              Mostrar todos
            </Button>
          </motion.div>
        ) : (
          <>
            <p className="text-muted-foreground mb-6">{services?.length} servicios encontrados</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {services?.map((service, index) => (
                <motion.div
                  key={service.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <ServiceCard service={service} />
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

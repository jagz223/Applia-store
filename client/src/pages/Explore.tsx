import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useExploreCategoryDisplayName } from "@/contexts/ExploreCategoryContext";
import { useCategories, useServices, useSubcategories } from "@/hooks/use-mango-data";
import { DEFAULT_CATEGORIES, HIDDEN_CATEGORY_SLUGS_IN_UI, getCategoryDisplayName } from "@shared/default-categories";
import { ServiceCard } from "@/components/ServiceCard";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Sparkles, X, ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CategoryIcon } from "@/components/CategoryIcon";
import { motion } from "framer-motion";

const providerSlugs = new Set(DEFAULT_CATEGORIES.map((c) => c.slug));
const hiddenSlugs = new Set(HIDDEN_CATEGORY_SLUGS_IN_UI);

export default function Explore() {
  const [, setLocation] = useLocation();
  const { setExploreCategoryDisplayName } = useExploreCategoryDisplayName();
  const [search, setSearch] = useState("");
  const params = new URLSearchParams(window.location.search);
  const initialProviderCategoryId = params.get("providerCategoryId");
  const initialSubcategoryId = params.get("subcategoryId");
  const parsedCatId = initialProviderCategoryId ? Number(initialProviderCategoryId) : undefined;
  const parsedSubId = initialSubcategoryId ? Number(initialSubcategoryId) : undefined;
  const [selectedProviderCategoryId, setSelectedProviderCategoryId] = useState<number | undefined>(
    !Number.isNaN(parsedCatId) ? parsedCatId : undefined
  );
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<number | undefined>(
    !Number.isNaN(parsedSubId) ? parsedSubId : undefined
  );
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  const { data: categories = [] } = useCategories();
  const providerCategories = useMemo(
    () =>
      categories.filter(
        (c) => {
          const slug = (c as { slug?: string }).slug;
          return slug && providerSlugs.has(slug) && !hiddenSlugs.has(slug);
        }
      ),
    [categories]
  );
  const { data: subcategories = [] } = useSubcategories(selectedProviderCategoryId ?? null);
  const { data: services, isLoading } = useServices({
    search: search || undefined,
    providerCategoryId: selectedProviderCategoryId,
    subcategoryId: selectedSubcategoryId,
  });

  const selectedProviderCategoryData = providerCategories.find(
    (c) => c.id === selectedProviderCategoryId
  );
  const selectedSubcategoryData = subcategories.find((s) => s.id === selectedSubcategoryId);

  const setProviderCategory = (id: number | undefined) => {
    setSelectedProviderCategoryId(id);
    setSelectedSubcategoryId(undefined);
    if (id == null) setLocation("/explore");
    else setLocation(`/explore?providerCategoryId=${id}`);
  };

  const setSubcategory = (id: number | undefined) => {
    setSelectedSubcategoryId(id);
    const base = selectedProviderCategoryId != null ? `providerCategoryId=${selectedProviderCategoryId}` : "";
    const sub = id != null ? `subcategoryId=${id}` : "";
    const query = [base, sub].filter(Boolean).join("&");
    setLocation(query ? `/explore?${query}` : "/explore");
  };

  const hasCategorySelected = selectedProviderCategoryId != null && selectedProviderCategoryData;
  const categoryDisplayName = hasCategorySelected ? getCategoryDisplayName(selectedProviderCategoryData!) : null;

  useEffect(() => {
    setExploreCategoryDisplayName(categoryDisplayName);
    return () => setExploreCategoryDisplayName(null);
  }, [categoryDisplayName, setExploreCategoryDisplayName]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      {/* Vista cuando hay categoría seleccionada: encabezado centrado en la categoría */}
      {hasCategorySelected ? (
        <div className="bg-white dark:bg-card border-b border-border/50 sticky top-16 z-40 backdrop-blur-xl bg-white/80 dark:bg-card/80">
          <div className="container mx-auto px-4 py-6 max-w-7xl">
            <Button
              variant="ghost"
              className="mb-4 gap-2 -ml-2"
              onClick={() => setLocation("/categories")}
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a categorías
            </Button>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">
                  {categoryDisplayName}
                </h1>
                <p className="text-muted-foreground mt-1">
                  Servicios en {categoryDisplayName}
                  {selectedSubcategoryData ? ` · ${selectedSubcategoryData.name}` : ""}
                </p>
              </div>
              <div className="relative w-full md:w-80">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  placeholder="Buscar en esta categoría..."
                  className="pl-12 h-11 rounded-2xl border-border/50 bg-muted/50"
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
            {/* Subcategorías (Pro Go): 2 botones visibles */}
            {subcategories.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground mr-1">Subcategorías:</span>
                {subcategories.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setSubcategory(selectedSubcategoryId === sub.id ? undefined : sub.id)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${
                      selectedSubcategoryId === sub.id
                        ? "bg-primary text-white shadow-lg shadow-primary/30"
                        : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {sub.name}
                  </button>
                ))}
                {selectedSubcategoryId != null && (
                  <button
                    type="button"
                    onClick={() => setSubcategory(undefined)}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground px-2"
                  >
                    Ver todas
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Vista sin categoría: Explorar Servicios con filtros */
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
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setFiltersExpanded((v) => !v)}
                className="md:hidden flex items-center justify-between w-full py-2 pr-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                aria-expanded={filtersExpanded}
              >
                <span className="text-sm font-medium text-muted-foreground">Tipo de servicio:</span>
                <span className="shrink-0 text-muted-foreground">
                  {filtersExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </span>
              </button>
              <div
                className={`flex flex-wrap items-center gap-2 overflow-hidden transition-[max-height,opacity] duration-300 ease-out md:!max-h-none md:!opacity-100 ${
                  filtersExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
                } md:flex`}
              >
                <span className="text-sm font-medium text-muted-foreground mr-1 hidden md:inline">Tipo de servicio:</span>
                <button
                  onClick={() => setProviderCategory(undefined)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${
                    selectedProviderCategoryId == null
                      ? "bg-primary text-white shadow-lg shadow-primary/30"
                      : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Todos
                </button>
                {providerCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => cat.id != null && setProviderCategory(cat.id as number)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${
                      selectedProviderCategoryId === cat.id
                        ? "bg-primary text-white shadow-lg shadow-primary/30"
                        : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <CategoryIcon name={(cat as { icon?: string }).icon ?? "HelpCircle"} className="h-4 w-4" />
                    {getCategoryDisplayName(cat)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {(search || selectedProviderCategoryId != null || selectedSubcategoryId != null) && (
          <div className="mb-6 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-muted-foreground">Filtros:</span>
            {selectedProviderCategoryData && (
              <Badge variant="secondary" className="gap-1 pr-1">
                {getCategoryDisplayName(selectedProviderCategoryData)}
                <button
                  onClick={() => setProviderCategory(undefined)}
                  className="ml-1 p-0.5 hover:bg-muted rounded-full"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {selectedSubcategoryData && (
              <Badge variant="secondary" className="gap-1 pr-1">
                {selectedSubcategoryData.name}
                <button
                  onClick={() => setSubcategory(undefined)}
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
                setProviderCategory(undefined);
                setSelectedSubcategoryId(undefined);
                setLocation("/explore");
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
            <h3 className="text-2xl font-bold font-display mb-3">
              {hasCategorySelected ? `No hay servicios en ${categoryDisplayName}` : "No se encontraron servicios"}
            </h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {hasCategorySelected ? "Prueba otra subcategoría o quita filtros." : "Intenta ajustar tus filtros o términos de búsqueda."}
            </p>
            <Button
              className="rounded-full px-8"
              onClick={() => {
                setSearch("");
                setProviderCategory(undefined);
                setSelectedSubcategoryId(undefined);
                setLocation("/explore");
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

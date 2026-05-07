import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useExploreCategoryDisplayName } from "@/contexts/ExploreCategoryContext";
import { useCategories, useCategoryVisibility, useServices, useSubcategories } from "@/hooks/use-mango-data";
import { DEFAULT_CATEGORIES, effectiveHiddenCategorySlugs } from "@shared/default-categories";
import { ServiceListItem } from "@/components/ServiceListItem";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Sparkles, X, ArrowLeft, ChevronDown, ChevronUp, Bookmark, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CategoryIcon } from "@/components/CategoryIcon";
import { motion } from "framer-motion";

const providerSlugs = new Set(DEFAULT_CATEGORIES.map((c) => c.slug));

export default function Explore() {
  const [, setLocation] = useLocation();
  const searchQs = useSearch();
  /** Query string sincronizada con wouter (incluye deep-links y navegación interna desde la home). */
  const qp = useMemo(() => new URLSearchParams(searchQs || ""), [searchQs]);
  /** Si el usuario llegó desde /categories, el botón atrás vuelve allí; si no, a /explore (todos los servicios). */
  const exploreFrom = qp.get("from");
  const providerCategoryFromUrl = qp.get("providerCategoryId");
  const subcategoryFromUrl = qp.get("subcategoryId");
  const parsedCatUrl = providerCategoryFromUrl ? Number(providerCategoryFromUrl) : NaN;
  const parsedSubUrl = subcategoryFromUrl ? Number(subcategoryFromUrl) : NaN;

  const { setExploreCategoryDisplayName } = useExploreCategoryDisplayName();
  const [search, setSearch] = useState("");
  const [selectedProviderCategoryId, setSelectedProviderCategoryId] = useState<number | undefined>(
    !Number.isNaN(parsedCatUrl) ? parsedCatUrl : undefined
  );
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<number | undefined>(
    !Number.isNaN(parsedSubUrl) ? parsedSubUrl : undefined
  );
  /** Panel de filtros (chips): expandido; al guardar o al bajar con scroll se pliega; al subir cerca del tope se despliega de nuevo */
  const [filtersPanelExpanded, setFiltersPanelExpanded] = useState(true);
  const prevScrollY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const prev = prevScrollY.current;
      const collapseAt = 110;
      const expandBelow = 56;
      if (prev <= collapseAt && y > collapseAt) setFiltersPanelExpanded(false);
      if (prev >= expandBelow && y < expandBelow) setFiltersPanelExpanded(true);
      prevScrollY.current = y;
    };
    prevScrollY.current = window.scrollY;
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const { data: categories = [] } = useCategories();
  const { data: visibility } = useCategoryVisibility();
  const hiddenSlugs = useMemo(
    () => new Set(effectiveHiddenCategorySlugs(visibility?.hiddenSlugs)),
    [visibility]
  );
  const providerCategories = useMemo(
    () =>
      categories.filter(
        (c) => {
          const slug = (c as { slug?: string }).slug;
          return slug && providerSlugs.has(slug) && !hiddenSlugs.has(slug);
        }
      ),
    [categories, hiddenSlugs]
  );
  const { data: subcategories = [] } = useSubcategories(selectedProviderCategoryId ?? null);
  const servicesQuery = useServices({
    search: search || undefined,
    providerCategoryId: selectedProviderCategoryId,
    subcategoryId: selectedSubcategoryId,
  });
  const { data: services, isLoading, refetch } = servicesQuery;

  useEffect(() => {
    // En cada entrada a /explore queremos traer datos frescos (sin depender solo del caché).
    // React Query ya refetchará con cambios de params, pero esto cubre el caso de volver a la vista.
    refetch();
  }, [refetch]);

  /** Al cambiar la URL (deep link o mismo patrín /explore?… desde la SPA), mantener filtros alineados. */
  useEffect(() => {
    if (!Number.isNaN(parsedCatUrl)) {
      setSelectedProviderCategoryId(parsedCatUrl);
    } else {
      setSelectedProviderCategoryId(undefined);
    }
    if (!Number.isNaN(parsedSubUrl)) {
      setSelectedSubcategoryId(parsedSubUrl);
    } else {
      setSelectedSubcategoryId(undefined);
    }
  }, [parsedCatUrl, parsedSubUrl]);

  /** Categorías con flujo propio: movilidad/tienda/delivery se abren en esta sección. */
  useEffect(() => {
    if (!providerCategoryFromUrl) return;
    const id = Number(providerCategoryFromUrl);
    if (Number.isNaN(id) || categories.length === 0) return;
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    const slug = (cat as { slug?: string }).slug;
    if (slug && hiddenSlugs.has(slug)) return;
    const fromQs = exploreFrom === "categories" ? "?from=categories" : "";
    if (slug === "transport") return setLocation(`/go/taxi${fromQs}`);
    if (slug === "marketplace") return setLocation(`/go/shop${fromQs}`);
    if (slug === "delivery") return setLocation(`/go/delivery${fromQs}`);
  }, [categories, providerCategoryFromUrl, exploreFrom, setLocation, hiddenSlugs]);

  const verifiedServices = useMemo(
    () => (services ?? []).filter((s) => Boolean(s?.provider?.isVerified)),
    [services]
  );

  const selectedProviderCategoryData = providerCategories.find(
    (c) => c.id === selectedProviderCategoryId
  );
  const selectedSubcategoryData = subcategories.find((s) => s.id === selectedSubcategoryId);

  const setProviderCategory = (id: number | undefined) => {
    setSelectedSubcategoryId(undefined);
    if (id == null) {
      setSelectedProviderCategoryId(undefined);
      setLocation("/explore");
      return;
    }
    const cat = providerCategories.find((c) => c.id === id);
    /** Movilidad/tienda/delivery: abrir esta sección, no el listado de Explorar. */
    const slug = (cat as { slug?: string } | undefined)?.slug;
    if (slug === "transport") {
      const fromQs = exploreFrom === "categories" ? "?from=categories" : "";
      setLocation(`/go/taxi${fromQs}`);
      return;
    }
    if (slug === "marketplace") {
      const fromQs = exploreFrom === "categories" ? "?from=categories" : "";
      setLocation(`/go/shop${fromQs}`);
      return;
    }
    if (slug === "delivery") {
      const fromQs = exploreFrom === "categories" ? "?from=categories" : "";
      setLocation(`/go/delivery${fromQs}`);
      return;
    }
    setSelectedProviderCategoryId(id);
    const fromQs = exploreFrom === "categories" ? "&from=categories" : "";
    setLocation(`/explore?providerCategoryId=${id}${fromQs}`);
  };

  const setSubcategory = (id: number | undefined) => {
    setSelectedSubcategoryId(id);
    const base = selectedProviderCategoryId != null ? `providerCategoryId=${selectedProviderCategoryId}` : "";
    const sub = id != null ? `subcategoryId=${id}` : "";
    let query = [base, sub].filter(Boolean).join("&");
    if (exploreFrom === "categories") {
      query += (query ? "&" : "") + "from=categories";
    }
    setLocation(query ? `/explore?${query}` : "/explore");
  };

  const hasCategorySelected = selectedProviderCategoryId != null && selectedProviderCategoryData;
  const categoryDisplayName = hasCategorySelected ? ((selectedProviderCategoryData as any)?.name ?? "") : null;

  useEffect(() => {
    setExploreCategoryDisplayName(categoryDisplayName);
    return () => setExploreCategoryDisplayName(null);
  }, [categoryDisplayName, setExploreCategoryDisplayName]);

  useEffect(() => {
    setFiltersPanelExpanded(true);
    prevScrollY.current = window.scrollY;
  }, [hasCategorySelected]);

  const filterSummaryLabel = useMemo(() => {
    const parts: string[] = [];
    if (selectedProviderCategoryData) parts.push((selectedProviderCategoryData as any)?.name ?? "");
    else parts.push("Todos");
    if (selectedSubcategoryData) parts.push(selectedSubcategoryData.name);
    if (search.trim()) parts.push(`"${search.trim()}"`);
    return parts.join(" · ");
  }, [selectedProviderCategoryData, selectedSubcategoryData, search]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      {/* Vista cuando hay categoría seleccionada: encabezado centrado en la categoría */}
      {hasCategorySelected ? (
        <div className="border-b border-border/50 sticky top-16 z-40 backdrop-blur-xl bg-background/90 dark:bg-background/92 shadow-sm transition-shadow duration-300">
          <div className={`container mx-auto px-4 max-w-7xl ${filtersPanelExpanded ? "py-6" : "py-3"}`}>
            <Button
              variant="ghost"
              className="mb-4 gap-2 -ml-2"
              onClick={() => setLocation(exploreFrom === "categories" ? "/categories" : "/explore")}
            >
              <ArrowLeft className="h-4 w-4" />
              {exploreFrom === "categories" ? "Volver a categorías" : "Volver a Explorar"}
            </Button>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">
                  {categoryDisplayName}
                </h1>
              </div>
              <div className="relative w-full md:w-80 shrink-0">
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
            <motion.div
              initial={false}
              animate={
                filtersPanelExpanded
                  ? { height: "auto", opacity: 1 }
                  : { height: 0, opacity: 0 }
              }
              transition={{ duration: 0.38, ease: [0.33, 1, 0.68, 1] }}
              className="overflow-hidden"
            >
              <p className="text-muted-foreground mt-1">
                Servicios en {categoryDisplayName}
                {selectedSubcategoryData ? ` · ${selectedSubcategoryData.name}` : ""}
              </p>
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
            </motion.div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {filtersPanelExpanded ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-2 rounded-full shadow-sm"
                  onClick={() => setFiltersPanelExpanded(false)}
                >
                  <Bookmark className="h-4 w-4" />
                  Guardar vista
                </Button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: [0.33, 1, 0.68, 1] }}
                  className="flex flex-wrap items-center gap-2 w-full justify-between"
                >
                  <p className="text-xs sm:text-sm text-muted-foreground truncate max-w-[min(100%,28rem)]">
                    <span className="font-medium text-foreground/80">Vista guardada:</span>{" "}
                    {categoryDisplayName}
                    {selectedSubcategoryData ? ` · ${selectedSubcategoryData.name}` : ""}
                    {search.trim() ? ` · "${search.trim()}"` : ""}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 rounded-full shrink-0"
                    onClick={() => setFiltersPanelExpanded(true)}
                  >
                    <Layers className="h-4 w-4" />
                    Mostrar filtros
                  </Button>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Vista sin categoría: Explorar Servicios con filtros */
        <div className="border-b border-border/50 sticky top-16 z-40 backdrop-blur-xl bg-background/90 dark:bg-background/92 shadow-sm transition-shadow duration-300">
          <div className={`container mx-auto px-4 max-w-7xl ${filtersPanelExpanded ? "py-6" : "py-3"}`}>
            <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground flex items-center gap-3">
                  <Sparkles className="h-7 w-7 text-primary shrink-0" />
                  Explorar Servicios
                </h1>
              </div>
              <div className="relative w-full md:w-96 shrink-0">
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
            <motion.div
              initial={false}
              animate={
                filtersPanelExpanded
                  ? { height: "auto", opacity: 1 }
                  : { height: 0, opacity: 0 }
              }
              transition={{ duration: 0.38, ease: [0.33, 1, 0.68, 1] }}
              className="overflow-hidden"
            >
              <p className="text-muted-foreground mt-1">Encuentra el asociado perfecto para tu proyecto</p>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setFiltersPanelExpanded((v) => !v)}
                  className="md:hidden flex items-center justify-between w-full py-2 pr-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  aria-expanded={filtersPanelExpanded}
                >
                  <span className="text-sm font-medium text-muted-foreground">Tipo de servicio:</span>
                  <span className="shrink-0 text-muted-foreground">
                    {filtersPanelExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  </span>
                </button>
                <div className="flex flex-wrap items-center gap-2 md:flex">
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
                      {(cat as any).name}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {filtersPanelExpanded ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-2 rounded-full shadow-sm"
                  onClick={() => setFiltersPanelExpanded(false)}
                >
                  <Bookmark className="h-4 w-4" />
                  Guardar vista
                </Button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: [0.33, 1, 0.68, 1] }}
                  className="flex flex-wrap items-center gap-2 w-full justify-between"
                >
                  <p className="text-xs sm:text-sm text-muted-foreground truncate max-w-[min(100%,28rem)]">
                    <span className="font-medium text-foreground/80">Vista guardada:</span> {filterSummaryLabel}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 rounded-full shrink-0"
                    onClick={() => setFiltersPanelExpanded(true)}
                  >
                    <Layers className="h-4 w-4" />
                    Mostrar filtros
                  </Button>
                </motion.div>
              )}
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
                {(selectedProviderCategoryData as any)?.name}
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
        ) : verifiedServices.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-20 bg-muted/30 dark:bg-card rounded-3xl border border-dashed border-border shadow-lg"
          >
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
              <Search className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-2xl font-bold font-display mb-3">
              {hasCategorySelected ? "Sin servicios disponibles" : "No se encontraron servicios"}
            </h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {hasCategorySelected
                ? `En ${categoryDisplayName} no hay ofertas publicadas en este momento. Prueba otra categoría o revisa más tarde.`
                : "Intenta ajustar tus filtros o términos de búsqueda."}
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
            <p className="text-muted-foreground mb-6">{verifiedServices.length} servicios encontrados</p>
            <div className="flex flex-col gap-4">
              {verifiedServices.map((service, index) => (
                <motion.div
                  key={service.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <ServiceListItem service={service} />
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { useMemo } from "react";
import { useLocation } from "wouter";
import { useCategories, useCategoryVisibility, useSubcategories } from "@/hooks/use-mango-data";
import { DEFAULT_CATEGORIES, effectiveHiddenCategorySlugs } from "@shared/default-categories";
import { ExploreCategoryCards } from "@/components/ExploreCategoryCards";

const providerSlugs = new Set(DEFAULT_CATEGORIES.map((c) => c.slug));

export default function Categories() {
  const [, setLocation] = useLocation();
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
  const professionalCategory = useMemo(
    () => providerCategories.find((c) => (c as { slug?: string }).slug === "professional"),
    [providerCategories]
  );
  const { data: subcategoriesProfessional = [] } = useSubcategories(professionalCategory?.id ?? null);
  const subcategoriesByCategoryId = useMemo(() => {
    if (!professionalCategory?.id || subcategoriesProfessional.length === 0) return {};
    return { [professionalCategory.id]: subcategoriesProfessional };
  }, [professionalCategory?.id, subcategoriesProfessional]);

  const handleSelectCategory = (categoryId: number) => {
    const cat = providerCategories.find((c) => c.id === categoryId);
    const slug = (cat as { slug?: string } | undefined)?.slug;
    /** Movilidad/tienda/delivery: abrir esta sección en lugar del listado normal. */
    if (slug === "transport") return setLocation("/go/cargo?from=categories");
    if (slug === "marketplace") return setLocation("/go/shop?from=categories");
    if (slug === "delivery") return setLocation("/go/pack?from=categories");
    setLocation(`/explore?providerCategoryId=${categoryId}&from=categories`);
  };

  const handleSelectSubcategory = (categoryId: number, subcategoryId: number) => {
    setLocation(
      `/explore?providerCategoryId=${categoryId}&subcategoryId=${subcategoryId}&from=categories`
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      <ExploreCategoryCards
        categories={providerCategories}
        subcategoriesByCategoryId={subcategoriesByCategoryId}
        onSelectCategory={handleSelectCategory}
        onSelectSubcategory={handleSelectSubcategory}
      />
    </div>
  );
}

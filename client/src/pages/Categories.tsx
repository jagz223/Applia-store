import { useMemo } from "react";
import { useLocation } from "wouter";
import { useCategories, useCategoryVisibility, useProviderCategoryAvailability, useSubcategories } from "@/hooks/use-mango-data";
import { DEFAULT_CATEGORIES, effectiveHiddenCategorySlugs } from "@shared/default-categories";
import { ExploreCategoryCards } from "@/components/ExploreCategoryCards";
import { useAuth } from "@/hooks/use-auth";

const providerSlugs = new Set(DEFAULT_CATEGORIES.map((c) => c.slug));

export default function Categories() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { data: categories = [] } = useCategories();
  const { data: visibility } = useCategoryVisibility({ enabled: isAuthenticated });
  const hiddenSlugs = useMemo(
    () =>
      new Set(effectiveHiddenCategorySlugs(isAuthenticated ? visibility?.hiddenSlugs : undefined)),
    [isAuthenticated, visibility]
  );
  const { data: availability } = useProviderCategoryAvailability();
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
    setLocation(`/explore?providerCategoryId=${categoryId}`);
  };

  const handleSelectSubcategory = (categoryId: number, subcategoryId: number) => {
    setLocation(`/explore?providerCategoryId=${categoryId}&subcategoryId=${subcategoryId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      <ExploreCategoryCards
        categories={providerCategories}
        subcategoriesByCategoryId={subcategoriesByCategoryId}
        availability={availability}
        onSelectCategory={handleSelectCategory}
        onSelectSubcategory={handleSelectSubcategory}
      />
    </div>
  );
}

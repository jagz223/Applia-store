import { useMemo } from "react";
import { useLocation } from "wouter";
import { useCategories, useProviderCategoryAvailability, useSubcategories } from "@/hooks/use-mango-data";
import { DEFAULT_CATEGORIES, HIDDEN_CATEGORY_SLUGS_IN_UI } from "@shared/default-categories";
import { ExploreCategoryCards } from "@/components/ExploreCategoryCards";

const providerSlugs = new Set(DEFAULT_CATEGORIES.map((c) => c.slug));
const hiddenSlugs = new Set(HIDDEN_CATEGORY_SLUGS_IN_UI);

export default function Categories() {
  const [, setLocation] = useLocation();
  const { data: categories = [] } = useCategories();
  const { data: availability } = useProviderCategoryAvailability();
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

import { useMemo } from "react";
import { useLocation } from "wouter";
import { useCategories, useProviderCategoryAvailability } from "@/hooks/use-mango-data";
import { DEFAULT_CATEGORIES } from "@shared/default-categories";
import { ExploreCategoryCards } from "@/components/ExploreCategoryCards";

const providerSlugs = new Set(DEFAULT_CATEGORIES.map((c) => c.slug));

export default function Categories() {
  const [, setLocation] = useLocation();
  const { data: categories = [] } = useCategories();
  const { data: availability } = useProviderCategoryAvailability();
  const providerCategories = useMemo(
    () =>
      categories.filter(
        (c) => (c as { slug?: string }).slug && providerSlugs.has((c as { slug: string }).slug)
      ),
    [categories]
  );

  const handleSelectCategory = (categoryId: number) => {
    setLocation(`/explore?providerCategoryId=${categoryId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      <ExploreCategoryCards
        categories={providerCategories}
        availability={availability}
        onSelectCategory={handleSelectCategory}
      />
    </div>
  );
}

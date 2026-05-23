import { useEffect, useState } from "react";
import { CategoryIcon } from "@/components/CategoryIcon";
import { cn } from "@/lib/utils";
import { categoryIconImageUrlForDisplay } from "@shared/category-icon-image";

export interface CategoryVisualProps {
  iconName: string;
  imageUrl?: string | null;
  className?: string;
  imgClassName?: string;
}

/** Muestra imagen PNG de categoría/subcategoría si hay URL válida; si no, icono Lucide. */
export function CategoryVisual({ iconName, imageUrl, className = "h-4 w-4", imgClassName }: CategoryVisualProps) {
  const [failed, setFailed] = useState(false);
  const url = categoryIconImageUrlForDisplay(imageUrl);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        className={cn("object-contain", imgClassName ?? className)}
        onError={() => setFailed(true)}
      />
    );
  }

  return <CategoryIcon name={iconName} className={className} />;
}

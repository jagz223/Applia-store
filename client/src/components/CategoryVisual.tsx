import { useEffect, useState } from "react";
import { CategoryIcon } from "@/components/CategoryIcon";
import { cn } from "@/lib/utils";
import { categoryIconImageUrlForDisplay, isHostedCategoryIconUrl } from "@shared/category-icon-image";
import { verifyCategoryIconTransparencyOnly } from "@/lib/category-icon-image-verify";

export interface CategoryVisualProps {
  iconName: string;
  imageUrl?: string | null;
  className?: string;
  imgClassName?: string;
}

/** Muestra imagen de categoría/subcategoría si es PNG con transparencia; si no, icono Lucide. */
export function CategoryVisual({ iconName, imageUrl, className = "h-4 w-4", imgClassName }: CategoryVisualProps) {
  const [failed, setFailed] = useState(false);
  const [transparencyOk, setTransparencyOk] = useState<boolean | null>(null);
  const url = categoryIconImageUrlForDisplay(imageUrl);

  useEffect(() => {
    setFailed(false);
    if (!url) {
      setTransparencyOk(null);
      return;
    }
    let cancelled = false;
    setTransparencyOk(null);
    if (isHostedCategoryIconUrl(url)) {
      setTransparencyOk(true);
      return;
    }
    void verifyCategoryIconTransparencyOnly(url).then((result) => {
      if (cancelled) return;
      setTransparencyOk(result.ok);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const showImage = Boolean(url) && !failed && transparencyOk === true;

  if (showImage) {
    return (
      <img
        src={url ?? undefined}
        alt=""
        className={cn("object-contain", imgClassName ?? className)}
        onError={() => setFailed(true)}
      />
    );
  }

  return <CategoryIcon name={iconName} className={className} />;
}

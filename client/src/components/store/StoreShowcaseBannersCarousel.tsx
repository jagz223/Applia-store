import { useEffect, useState } from "react";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import type { StoreShowcaseAd } from "@/hooks/use-store-showcase";
import {
  resolveShowcaseAdClickUrl,
  resolveShowcaseAdImageUrl,
} from "@/lib/store-showcase-ad-media";
import { cn } from "@/lib/utils";

/** Altura del carrusel de banners en vitrina (y vista previa admin). */
export const STORE_SHOWCASE_BANNER_FRAME_CLASS = "h-36 sm:h-44";

const AUTO_SLIDE_MS = 4500;

export function StoreShowcaseBannersCarousel({ banners }: { banners: StoreShowcaseAd[] }) {
  const slides = banners
    .map((ad) => ({
      ad,
      imageUrl: resolveShowcaseAdImageUrl(ad),
      clickUrl: resolveShowcaseAdClickUrl(ad),
    }))
    .filter((s) => Boolean(s.imageUrl));

  const [api, setApi] = useState<CarouselApi | null>(null);
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setIndex(api.selectedScrollSnap());
    setCount(api.scrollSnapList().length);
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", () => {
      setCount(api.scrollSnapList().length);
      onSelect();
    });
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  useEffect(() => {
    if (!api || slides.length <= 1) return;
    const id = window.setInterval(() => {
      api.scrollNext();
    }, AUTO_SLIDE_MS);
    return () => window.clearInterval(id);
  }, [api, slides.length]);

  if (slides.length === 0) return null;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-sm",
        STORE_SHOWCASE_BANNER_FRAME_CLASS,
      )}
    >
      <Carousel opts={{ loop: true }} setApi={setApi} className="h-full">
        <CarouselContent className="h-full ml-0">
          {slides.map(({ ad, imageUrl, clickUrl }) => (
            <CarouselItem key={ad.id} className="h-full basis-full pl-0">
              <div className="h-full w-full">
                {clickUrl ? (
                  <a href={clickUrl} target="_blank" rel="noreferrer" className="block h-full w-full">
                    <img src={imageUrl!} alt="" className="h-full w-full object-cover" />
                  </a>
                ) : (
                  <img src={imageUrl!} alt="" className="h-full w-full object-cover" />
                )}
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      {count > 1 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center justify-center gap-1.5">
          {Array.from({ length: count }).map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ir al banner ${i + 1}`}
              aria-current={i === index}
              className={cn(
                "pointer-events-auto h-2 w-2 rounded-full transition-colors",
                i === index ? "bg-white shadow-sm" : "bg-white/50 hover:bg-white/80",
              )}
              onClick={() => api?.scrollTo(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

/** Tamaño sugerido de arte para banners (ancho × alto). */
export const STORE_SHOWCASE_BANNER_SIZE_HINT = "1300 × 225 px";

/**
 * Marco del banner en vitrina (y previews admin): proporción 1300×225.
 * Tope de ancho 1300px. `object-cover` recorta al centro si hace falta.
 */
export const STORE_SHOWCASE_BANNER_FRAME_CLASS =
  "aspect-[1300/225] w-full max-w-[1300px]";

const AUTO_SLIDE_MS = 4500;

function BannerSlide({
  imageUrl,
  clickUrl,
}: {
  imageUrl: string;
  clickUrl: string | null;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-sm",
        STORE_SHOWCASE_BANNER_FRAME_CLASS,
      )}
    >
      {clickUrl ? (
        <a href={clickUrl} target="_blank" rel="noreferrer" className="absolute inset-0 block">
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        </a>
      ) : (
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
    </div>
  );
}

export function StoreShowcaseBannersCarousel({ banners }: { banners: StoreShowcaseAd[] }) {
  const slides = banners
    .map((ad) => ({
      ad,
      imageUrl: resolveShowcaseAdImageUrl(ad),
      clickUrl: resolveShowcaseAdClickUrl(ad),
    }))
    .filter((s): s is typeof s & { imageUrl: string } => Boolean(s.imageUrl));

  const [api, setApi] = useState<CarouselApi | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const multi = slides.length > 1;

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setIndex(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api]);

  useEffect(() => {
    if (!api || !multi) return;
    api.reInit();
  }, [api, multi, slides.length]);

  useEffect(() => {
    if (!api || !multi || paused) return;
    const id = window.setInterval(() => {
      if (api.canScrollNext()) {
        api.scrollNext();
      } else {
        api.scrollTo(0);
      }
    }, AUTO_SLIDE_MS);
    return () => window.clearInterval(id);
  }, [api, multi, paused, index]);

  if (slides.length === 0) return null;

  if (!multi) {
    const only = slides[0]!;
    return (
      <div className="relative mx-auto w-full max-w-[1300px]">
        <BannerSlide imageUrl={only.imageUrl} clickUrl={only.clickUrl} />
      </div>
    );
  }

  return (
    <div
      className="relative mx-auto w-full max-w-[1300px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
    >
      <Carousel
        opts={{ loop: true, align: "start", duration: 28 }}
        setApi={setApi}
        className="w-full"
      >
        <CarouselContent className="-ml-0">
          {slides.map(({ ad, imageUrl, clickUrl }) => (
            <CarouselItem key={ad.id} className="basis-full pl-0">
              <BannerSlide imageUrl={imageUrl} clickUrl={clickUrl} />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      <button
        type="button"
        aria-label="Banner anterior"
        className={cn(
          "absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center",
          "rounded-full border border-white/30 bg-black/40 text-white shadow-sm backdrop-blur-sm",
          "transition hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        onClick={() => api?.scrollPrev()}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Banner siguiente"
        className={cn(
          "absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center",
          "rounded-full border border-white/30 bg-black/40 text-white shadow-sm backdrop-blur-sm",
          "transition hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        onClick={() => api?.scrollNext()}
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>

      <div className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex items-center justify-center gap-1.5">
        {slides.map((s, i) => (
          <button
            key={s.ad.id}
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
    </div>
  );
}

import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import type { StoreShowcaseAd } from "@/hooks/use-store-showcase";
import {
  resolveShowcaseAdClickUrl,
  resolveShowcaseAdImageUrl,
} from "@/lib/store-showcase-ad-media";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function StoreShowcasePopupsModal({
  open,
  onOpenChange,
  popups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  popups: StoreShowcaseAd[];
}) {
  const slides = popups
    .filter((p) => p.kind === "popup")
    .map((ad) => ({
      ad,
      imageUrl: resolveShowcaseAdImageUrl(ad),
      clickUrl: resolveShowcaseAdClickUrl(ad),
    }))
    .filter((s) => Boolean(s.imageUrl));

  if (slides.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-none w-full border-none bg-transparent p-0 shadow-none"
        overlayClassName="bg-background/80 backdrop-blur-sm"
      >
        <div className="mx-auto flex w-full max-w-3xl items-center justify-center p-4">
          <div className="w-full overflow-hidden rounded-2xl">
            <Carousel opts={{ loop: true }}>
              <CarouselContent>
                {slides.map(({ ad, imageUrl, clickUrl }) => (
                  <CarouselItem key={ad.id} className="h-auto">
                    <div className="flex items-center justify-center">
                      {clickUrl ? (
                        <a href={clickUrl} target="_blank" rel="noreferrer">
                          <img
                            src={imageUrl!}
                            alt=""
                            className="max-h-[80dvh] max-w-[95vw] object-contain"
                          />
                        </a>
                      ) : (
                        <img
                          src={imageUrl!}
                          alt=""
                          className="max-h-[80dvh] max-w-[95vw] object-contain"
                        />
                      )}
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

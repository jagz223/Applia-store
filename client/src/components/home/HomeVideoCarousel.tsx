/**
 * Carrusel de vídeos para la home. La página puede pasar `videos` cuando exista
 * configuración remota o estática; si no, usa los MP4 por defecto en `public/assets/videos/`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

type HomeVideoCarouselProps = {
  videos?: Array<{
    src: string;
    poster?: string;
    label?: string;
  }>;
};

export function HomeVideoCarousel({ videos }: HomeVideoCarouselProps) {
  const items = useMemo(
    () =>
      videos?.length
        ? videos
        : [
            { src: "/assets/videos/home-1.mp4" },
            { src: "/assets/videos/home-2.mp4" },
          ],
    [videos],
  );

  const [api, setApi] = useState<CarouselApi | null>(null);
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(items.length);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);

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
    // Solo reproducir el video visible para evitar audio/CPU extra.
    for (let i = 0; i < videoRefs.current.length; i++) {
      const el = videoRefs.current[i];
      if (!el) continue;
      if (i === index) {
        // autoplay puede fallar si el navegador decide bloquearlo; por eso es best-effort.
        void el.play().catch(() => undefined);
      } else {
        el.pause();
        try {
          el.currentTime = 0;
        } catch {
          // ignore
        }
      }
    }
  }, [index]);

  return (
    <section className="pb-10 sm:pb-14 bg-card/30">
      <div className="container px-4 mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-5xl mx-auto"
        >
          <div className="flex items-center justify-between gap-3 mb-3 sm:mb-4">
            <div>
              <p className="mt-2 text-sm sm:text-base text-muted-foreground">
                Mira cómo funciona GenFeb en segundos.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              {Array.from({ length: count }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => api?.scrollTo(i)}
                  aria-label={`Ir al video ${i + 1}`}
                  className={cn(
                    "h-2.5 w-2.5 rounded-full transition-colors",
                    i === index ? "bg-primary" : "bg-muted",
                  )}
                />
              ))}
            </div>
          </div>

          <div className="relative max-w-5xl mx-auto">
            <Carousel
              setApi={(a) => setApi(a)}
              opts={{ loop: true, align: "start" }}
              className="w-full"
            >
              <CarouselContent className="-ml-3">
                {items.map((v, i) => (
                  <CarouselItem key={v.src} className="pl-3">
                    <div className="card-industrial overflow-hidden rounded-2xl border border-border bg-background">
                      <div className="relative w-full aspect-video bg-black">
                        <video
                          ref={(el) => {
                            videoRefs.current[i] = el;
                          }}
                          className="absolute inset-0 h-full w-full object-cover"
                          src={v.src}
                          poster={v.poster}
                          muted
                          playsInline
                          loop
                          controls
                          preload="metadata"
                        />
                        {v.label ? (
                          <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-background/80 px-3 py-1 text-xs font-semibold text-foreground backdrop-blur">
                            {v.label}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>

              <div className="hidden md:block">
                <CarouselPrevious className="left-3 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur border-border" />
                <CarouselNext className="right-3 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur border-border" />
              </div>
            </Carousel>

            <div className="mt-3 flex items-center justify-center gap-2 sm:hidden">
              {Array.from({ length: count }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => api?.scrollTo(i)}
                  aria-label={`Ir al video ${i + 1}`}
                  className={cn(
                    "h-2.5 w-2.5 rounded-full transition-colors",
                    i === index ? "bg-primary" : "bg-muted",
                  )}
                />
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}


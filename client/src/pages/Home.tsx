import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, ShoppingBag, Flame } from "lucide-react";
import { useEffect, useRef } from "react";
import { getPrimaryStoreVitrinaHref, usePrimaryStore } from "@/hooks/use-primary-store";
import { cn } from "@/lib/utils";

const HERO_BURGER =
  "https://static.vecteezy.com/system/resources/previews/047/827/646/non_2x/delicious-fast-food-burger-hamburger-cheeseburger-transparent-background-free-png.png";

/** Imagen anterior del bloque Destacado (se veía mejor ahí). */
const FEATURED_BURGER =
  "https://png.pngtree.com/png-clipart/20231017/original/pngtree-burger-food-png-free-download-png-image_13329458.png";

/** Velocidad media en px/s (sube/baja). */
const BURGER_FLOAT_SPEED_PX_PER_SEC = 7;
/** Recorrido máximo hacia arriba (px). */
const BURGER_FLOAT_AMPLITUDE_PX = 10;

/**
 * Flotado a velocidad media ~speedPxPerSec, con rebote suave (seno):
 * en los extremos la velocidad llega a 0 y vuelve a arrancar.
 */
function useSoftSpeedFloat(speedPxPerSec: number, amplitudePx: number) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Un tramo (0 → amp) dura amplitude/speed; el ciclo completo es ida y vuelta.
    const halfPeriodSec = amplitudePx / Math.max(speedPxPerSec, 0.001);
    const periodSec = halfPeriodSec * 2;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const t = (now - start) / 1000;
      // 0 → amp → 0 con derivada 0 en los extremos (rebote suave)
      const y = (amplitudePx / 2) * (1 - Math.cos((Math.PI * 2 * t) / periodSec));
      el.style.transform = `translate3d(0, ${-y}px, 0)`;
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [speedPxPerSec, amplitudePx]);

  return ref;
}

export default function HomePage() {
  const { data: primaryStore } = usePrimaryStore();
  const tiendaHref = getPrimaryStoreVitrinaHref(primaryStore);
  const burgerFloatRef = useSoftSpeedFloat(
    BURGER_FLOAT_SPEED_PX_PER_SEC,
    BURGER_FLOAT_AMPLITUDE_PX,
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-background">
      {/* Hero Burgee-style: tipografía enorme + burger PNG sin fondo */}
      <section className="relative isolate min-h-[calc(100dvh-4rem)] overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_35%,hsl(var(--secondary)/0.16),transparent_55%),radial-gradient(ellipse_at_15%_85%,hsl(var(--primary)/0.06),transparent_45%)]"
        />

        <div className="relative mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[100rem] flex-col px-4 pt-6 min-[400px]:px-6 sm:px-8 lg:px-10 lg:pt-4">
          {/* CTAs superiores estilo Burgee */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="relative z-20 flex flex-wrap items-center justify-end gap-2"
          >
            <Link
              href={tiendaHref}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/80 px-4 py-2",
                "text-sm font-semibold text-foreground backdrop-blur-sm transition-colors hover:bg-muted",
              )}
            >
              <ShoppingBag className="h-4 w-4 text-secondary dark:text-primary" />
              Menú
            </Link>
            <Link
              href={tiendaHref}
              className={cn(
                "inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2",
                "text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20",
                "transition-opacity hover:opacity-95",
              )}
            >
              Pedir ahora
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>

          {/* Escena central: texto detrás + burger delante */}
          <div className="relative flex flex-1 flex-col items-center justify-center pb-8 pt-4 lg:pb-12">
            <motion.div
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8 }}
              className={cn(
                "pointer-events-none absolute left-1/2 top-[8%] z-0 w-[120%] max-w-none -translate-x-1/2 select-none text-center",
                "font-display font-extrabold uppercase leading-[0.8] tracking-[-0.055em]",
                "text-foreground/[0.08] dark:text-foreground/[0.11]",
              )}
            >
              <p className="text-[clamp(4rem,15vw,11rem)]">Smoky</p>
              <p className="text-[clamp(4rem,15vw,11rem)]">Cheesy</p>
              <p className="text-[clamp(4rem,15vw,11rem)]">Burger</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 28, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.75, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10 w-[min(92vw,28rem)] sm:w-[min(78vw,34rem)] lg:w-[min(52vw,40rem)]"
            >
              {/* Sombra estática: animar filtros baja el FPS */}
              <div
                aria-hidden
                className="pointer-events-none absolute bottom-[6%] left-1/2 h-[18%] w-[70%] -translate-x-1/2 rounded-[100%] bg-black/25 blur-2xl dark:bg-black/40"
              />
              {/* Float manual: N px/s con requestAnimationFrame */}
              <div
                ref={burgerFloatRef}
                className="will-change-transform [backface-visibility:hidden] [transform:translateZ(0)]"
              >
                <img
                  src={HERO_BURGER}
                  alt="Hamburguesa"
                  className="relative w-full"
                  decoding="async"
                  fetchPriority="high"
                  draggable={false}
                />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.28 }}
              className="relative z-20 mt-2 max-w-lg text-center lg:mt-0 lg:absolute lg:bottom-16 lg:left-0 lg:max-w-sm lg:text-left"
            >
              <p className="font-display text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
                Applia
              </p>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.22em] text-secondary dark:text-primary sm:text-sm">
                Store
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Buena, jugosa y lista pa&apos; pedir. Comida rápida con sabor, sin vueltas.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Bento promocional debajo del hero */}
      <section className="px-4 pb-14 pt-2 min-[400px]:px-6 sm:px-8 lg:px-10">
        <div className="mx-auto grid w-full max-w-[100rem] gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45 }}
            className="relative overflow-hidden rounded-[1.75rem] bg-secondary p-6 text-secondary-foreground dark:bg-primary dark:text-primary-foreground md:col-span-2 lg:col-span-2 lg:min-h-[14rem]"
          >
            <div className="relative z-10 flex h-full max-w-md flex-col justify-between gap-6">
              <div>
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] opacity-90">
                  <Flame className="h-3.5 w-3.5" />
                  Destacado
                </p>
                <h2 className="mt-3 font-display text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
                  Sabor que se nota en cada bocado
                </h2>
                <p className="mt-2 text-sm leading-relaxed opacity-90 sm:text-base">
                  Hamburguesas y Pepitos listos para comer acá o por delivery.
                </p>
              </div>
              <Link
                href={tiendaHref}
                className={cn(
                  "inline-flex w-fit items-center gap-2 rounded-full bg-primary-foreground/95 px-5 py-2.5",
                  "text-sm font-semibold text-foreground transition-opacity hover:opacity-90",
                  "dark:bg-background dark:text-foreground",
                )}
              >
                Ver el menú
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <img
              src={FEATURED_BURGER}
              alt=""
              aria-hidden
              className="pointer-events-none absolute -bottom-8 -right-6 w-[min(55%,16rem)] rotate-6 drop-shadow-xl sm:w-[min(48%,20rem)] lg:-right-2 lg:w-64"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, delay: 0.06 }}
            className="flex flex-col justify-between rounded-[1.75rem] bg-primary p-6 text-primary-foreground"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground/70">
                Promo
              </p>
              <h3 className="mt-3 font-display text-xl font-bold leading-snug sm:text-2xl">
                Pide hoy y disfrúta de una buena comida
              </h3>
            </div>
            <Link
              href={tiendaHref}
              className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline"
            >
              Ir a la tienda
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="rounded-[1.75rem] border border-border/70 bg-card p-6 md:col-span-2 lg:col-span-3"
          >
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h3 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  Descubre las mejores hamburguesas del menú
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Entra a la tienda, escoge tu combo y listo.
                </p>
              </div>
              <Link
                href={tiendaHref}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-full bg-secondary px-5 py-2.5",
                  "text-sm font-semibold text-secondary-foreground dark:bg-primary dark:text-primary-foreground",
                  "transition-opacity hover:opacity-95",
                )}
              >
                Explorar
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

import { Link } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { getPrimaryStoreVitrinaHref, usePrimaryStore } from "@/hooks/use-primary-store";
import {
  CELOSIAS_BRAND_NAME,
  CELOSIAS_HERO_IMAGE,
  CELOSIAS_HISTORY,
  CELOSIAS_HOME_CATEGORIES,
  CELOSIAS_LOGO_SRC,
  CELOSIAS_TAGLINE,
} from "@/lib/celosias-brand";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const { data: primaryStore } = usePrimaryStore();
  const tiendaHref = getPrimaryStoreVitrinaHref(primaryStore);
  const reduceMotion = useReducedMotion();

  const fadeUp = (delay = 0) =>
    reduceMotion
      ? undefined
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] },
        };

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-white text-neutral-900 dark:bg-background dark:text-foreground">
      <section className="mx-auto w-full max-w-[88rem] px-4 pt-6 min-[400px]:px-6 sm:px-8 lg:px-10 lg:pt-8">
        <motion.div
          {...(reduceMotion
            ? {}
            : {
                initial: { opacity: 0, y: 12 },
                animate: { opacity: 1, y: 0 },
                transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
              })}
          className="relative overflow-hidden rounded-[1.75rem] sm:rounded-[2rem] lg:rounded-[2.25rem]"
        >
          <div className="relative aspect-[16/11] w-full sm:aspect-[21/10] lg:aspect-[2.35/1]">
              <img
                src={CELOSIAS_HERO_IMAGE}
                alt="Acabados y espacios con cerámica y porcelanato"
                className="absolute inset-0 h-full w-full object-cover"
                decoding="async"
                fetchPriority="high"
              />
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-[hsl(220,70%,12%)]/75 via-[hsl(220,70%,16%)]/25 to-transparent"
              />

              {/* Motivo geométrico intencional: esquina superior izquierda */}
              <div
                aria-hidden
                className="absolute left-5 top-5 z-[2] h-[4.75rem] w-[4.75rem] sm:left-8 sm:top-8 sm:h-28 sm:w-28 lg:left-10 lg:top-10"
              >
                <span className="absolute inset-0 border-2 border-white/90" />
                <span className="absolute left-0 top-0 h-8 w-8 bg-white sm:h-11 sm:w-11" />
                <span className="absolute bottom-0 right-0 h-3.5 w-3.5 bg-[hsl(220,70%,22%)] sm:h-4 sm:w-4" />
              </div>

              <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-start gap-4 p-5 sm:p-8 lg:flex-row lg:items-end lg:justify-between lg:p-10">
                <div className="max-w-2xl">
                  {/* Marcador editorial alineado al título */}
                  <span
                    aria-hidden
                    className="mb-4 block h-2.5 w-2.5 bg-white sm:mb-5 sm:h-3 sm:w-3"
                  />
                  <img
                    src={CELOSIAS_LOGO_SRC}
                    alt=""
                    aria-hidden
                    className="mb-4 h-10 w-auto max-w-[11rem] object-contain brightness-0 invert sm:h-12 sm:max-w-[14rem]"
                    decoding="async"
                  />
                  <h1 className="font-display text-[clamp(1.85rem,4.5vw,3.75rem)] font-semibold uppercase leading-[0.95] tracking-[0.04em] text-white">
                    {CELOSIAS_BRAND_NAME}
                  </h1>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <Link
                    href={tiendaHref}
                    className="inline-flex items-center gap-2 rounded-full bg-[hsl(0,72%,42%)] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-white transition-opacity hover:opacity-90 sm:text-sm"
                  >
                    Ver catálogo
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/acerca-de"
                    className="inline-flex items-center rounded-full border border-white/40 bg-white/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-sm transition-colors hover:bg-white/20 sm:text-sm"
                  >
                    Acerca de nosotros
                  </Link>
                </div>
              </div>
            </div>
        </motion.div>

        <motion.p
          {...fadeUp(0.12)}
          className="mx-auto mt-12 max-w-2xl text-center text-[0.95rem] leading-relaxed text-neutral-600 dark:text-muted-foreground sm:mt-14 sm:text-base"
        >
          {CELOSIAS_HISTORY.lead} {CELOSIAS_TAGLINE}: calidad, variedad y entrega oportuna para obra y
          acabados.
        </motion.p>

        <motion.div
          {...fadeUp(0.18)}
          className="mt-8 flex flex-wrap justify-center gap-2 sm:mt-10"
        >
          {CELOSIAS_HOME_CATEGORIES.map((cat) => (
            <Link
              key={cat.name}
              href={tiendaHref}
              className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-medium uppercase tracking-[0.12em] text-neutral-700 transition-colors hover:border-[hsl(220,70%,22%)] hover:text-[hsl(220,70%,22%)] dark:border-border dark:bg-card dark:text-foreground"
            >
              {cat.name}
            </Link>
          ))}
        </motion.div>
      </section>

      <section className="mx-auto w-full max-w-[88rem] px-4 py-16 min-[400px]:px-6 sm:px-8 lg:px-10 lg:py-24">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 sm:mb-10">
          <h2 className="font-display text-2xl font-semibold uppercase tracking-[0.16em] text-[hsl(220,70%,22%)] dark:text-foreground sm:text-3xl">
            Nuestros productos
          </h2>
          <Link
            href={tiendaHref}
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(0,72%,42%)] transition-opacity hover:opacity-80"
          >
            Ver todo
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:gap-5">
          {CELOSIAS_HOME_CATEGORIES.map((cat, i) => (
            <motion.div
              key={cat.name}
              {...(reduceMotion
                ? {}
                : {
                    initial: { opacity: 0, y: 16 },
                    whileInView: { opacity: 1, y: 0 },
                    viewport: { once: true, margin: "-40px" },
                    transition: { duration: 0.45, delay: Math.min(i * 0.05, 0.25) },
                  })}
            >
              <Link
                href={tiendaHref}
                className="group block overflow-hidden rounded-[1.25rem] sm:rounded-[1.5rem]"
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-neutral-100 dark:bg-muted">
                  <img
                    src={cat.image}
                    alt={cat.name}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                    loading="lazy"
                    decoding="async"
                  />
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent"
                  />
                  <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-2 p-3.5 sm:p-5">
                    <span className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-white sm:text-base">
                      {cat.name}
                    </span>
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors",
                        "group-hover:bg-[hsl(220,70%,22%)]",
                      )}
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      <footer className="mt-auto border-t border-neutral-200 bg-neutral-50 px-4 py-12 text-center dark:border-border dark:bg-card/40">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-[hsl(220,70%,22%)] dark:text-foreground sm:text-base">
          Barquisimeto · desde 1996
        </p>
        <p className="mt-2 text-sm text-neutral-500 dark:text-muted-foreground">
          Cerámicas, porcelanatos y sanitarios · {CELOSIAS_BRAND_NAME}
        </p>
      </footer>
    </div>
  );
}

import { Link } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { getPrimaryStoreVitrinaHref, usePrimaryStore } from "@/hooks/use-primary-store";
import {
  CELOSIAS_ABOUT_IMAGES,
  CELOSIAS_BRAND_NAME,
  CELOSIAS_HISTORY,
  CELOSIAS_LEGAL_NAME,
  CELOSIAS_MISSION,
  CELOSIAS_TAGLINE,
  CELOSIAS_VALUES,
  CELOSIAS_VISION,
} from "@/lib/celosias-brand";

export default function AboutPage() {
  const { data: primaryStore } = usePrimaryStore();
  const tiendaHref = getPrimaryStoreVitrinaHref(primaryStore);
  const reduceMotion = useReducedMotion();

  const fade = (delay = 0) =>
    reduceMotion
      ? undefined
      : {
          initial: { opacity: 0, y: 20 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
        };

  const historyLead = CELOSIAS_HISTORY.body.split("\n\n")[0] ?? CELOSIAS_HISTORY.body;

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden bg-[#F7F8FA] text-[hsl(220,70%,16%)] dark:bg-background dark:text-foreground">
      {/* Hero tipográfico */}
      <section className="mx-auto w-full max-w-[88rem] px-4 pt-10 min-[400px]:px-6 sm:px-8 lg:px-10 lg:pt-16">
        <motion.p
          {...fade(0)}
          className="mb-4 text-center text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-[hsl(0,72%,42%)]"
        >
          Acerca de nosotros
        </motion.p>
        <motion.h1
          {...fade(0.05)}
          className="text-center font-display text-[clamp(2.1rem,7.5vw,5.75rem)] font-bold uppercase leading-[0.92] tracking-[-0.02em] text-[hsl(220,70%,18%)] dark:text-foreground"
        >
          Descubre nuestro camino
        </motion.h1>
      </section>

      {/* Grid asimétrico editorial */}
      <section className="mx-auto grid w-full max-w-[88rem] grid-cols-1 gap-10 px-4 py-12 min-[400px]:px-6 sm:px-8 md:grid-cols-12 md:gap-8 md:py-16 lg:px-10 lg:gap-12 lg:py-20">
        <motion.div {...fade(0.1)} className="md:col-span-6 lg:col-span-5">
          <div className="overflow-hidden bg-neutral-200 dark:bg-muted">
            <img
              src={CELOSIAS_ABOUT_IMAGES.texture}
              alt="Detalle de acabados en porcelanato"
              className="aspect-square w-full object-cover"
              decoding="async"
              fetchPriority="high"
            />
          </div>
          <p className="mt-4 max-w-sm text-[0.7rem] font-medium uppercase leading-relaxed tracking-[0.14em] text-neutral-500 dark:text-muted-foreground">
            Calidad y durabilidad en cada línea · {CELOSIAS_TAGLINE}
          </p>
        </motion.div>

        <div className="flex flex-col md:col-span-6 md:pt-6 lg:col-span-7 lg:pl-8 lg:pt-10">
          <motion.p
            {...fade(0.15)}
            className="max-w-md text-sm leading-relaxed text-neutral-600 dark:text-muted-foreground sm:text-[0.95rem]"
          >
            {historyLead}
          </motion.p>

          <motion.h2
            {...fade(0.2)}
            className="mt-10 font-display text-[clamp(1.5rem,3.5vw,2.75rem)] font-bold uppercase leading-[1.05] tracking-[0.04em] text-[hsl(220,70%,18%)] dark:text-foreground sm:mt-14"
          >
            Redefiniendo
            <br />
            la excelencia
          </motion.h2>

          <motion.div {...fade(0.25)} className="mt-10 max-w-md sm:mt-14 sm:ml-auto">
            <p className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[hsl(0,72%,42%)]">
              Desde 1996
            </p>
            <div className="overflow-hidden bg-neutral-200 dark:bg-muted">
              <img
                src={CELOSIAS_ABOUT_IMAGES.space}
                alt="Espacio con acabados contemporáneos"
                className="aspect-[4/5] w-full object-cover sm:aspect-[3/4]"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-neutral-400 dark:text-muted-foreground">
                Acerca
              </p>
              <p className="text-right text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-neutral-400 dark:text-muted-foreground">
                {CELOSIAS_LEGAL_NAME}
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Bloque collage: tipografía + producto */}
      <section className="relative mx-auto w-full max-w-[88rem] px-4 py-8 min-[400px]:px-6 sm:px-8 lg:px-10 lg:py-16">
        <div className="relative grid items-center gap-8 lg:grid-cols-12 lg:gap-6">
          <div className="relative z-10 flex gap-2 sm:gap-3 lg:col-span-3">
            {[CELOSIAS_ABOUT_IMAGES.detail, CELOSIAS_ABOUT_IMAGES.bathroom, CELOSIAS_ABOUT_IMAGES.craft].map(
              (src, i) => (
                <motion.div
                  key={src}
                  {...(reduceMotion
                    ? {}
                    : {
                        initial: { opacity: 0, y: 16 },
                        whileInView: { opacity: 1, y: 0 },
                        viewport: { once: true },
                        transition: { duration: 0.45, delay: i * 0.08 },
                      })}
                  className="aspect-square flex-1 overflow-hidden bg-neutral-200 dark:bg-muted"
                >
                  <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                </motion.div>
              ),
            )}
          </div>

          <div className="relative lg:col-span-9">
            <p
              aria-hidden
              className="pointer-events-none select-none font-display text-[clamp(2.5rem,10vw,7.5rem)] font-bold uppercase leading-[0.85] tracking-[-0.03em] text-[hsl(220,70%,18%)]/10 dark:text-foreground/10"
            >
              Especialistas
              <br />
              en acabados
            </p>

            <div className="relative z-10 mt-[-2.5rem] flex flex-col items-start gap-8 sm:mt-[-4rem] sm:flex-row sm:items-end sm:justify-between lg:mt-[-5rem]">
              <motion.div
                {...(reduceMotion
                  ? {}
                  : {
                      initial: { opacity: 0, scale: 0.96 },
                      whileInView: { opacity: 1, scale: 1 },
                      viewport: { once: true },
                      transition: { duration: 0.55 },
                    })}
                className="mx-auto w-full max-w-[16rem] sm:mx-0 sm:max-w-[18rem]"
              >
                <img
                  src={CELOSIAS_ABOUT_IMAGES.detail}
                  alt="Detalle de cerámica"
                  className="w-full object-contain drop-shadow-2xl"
                  loading="lazy"
                  decoding="async"
                />
              </motion.div>

              <div className="max-w-sm">
                <p className="text-sm leading-relaxed text-neutral-600 dark:text-muted-foreground">
                  {CELOSIAS_MISSION.body}
                </p>
                <Link
                  href={tiendaHref}
                  className="mt-6 inline-flex items-center gap-2 border border-[hsl(220,70%,22%)] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(220,70%,22%)] transition-colors hover:border-[hsl(0,72%,42%)] hover:text-[hsl(0,72%,42%)] dark:border-border dark:text-foreground"
                >
                  Explorar más
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Misión / Visión / Valores — tipográficos, sin cards pesadas */}
      <section className="mx-auto grid w-full max-w-[88rem] gap-12 border-t border-neutral-200 px-4 py-16 min-[400px]:px-6 sm:px-8 md:grid-cols-3 md:gap-8 lg:px-10 lg:py-24 dark:border-border">
        {[
          { ...CELOSIAS_MISSION, eyebrow: "01" },
          { ...CELOSIAS_VISION, eyebrow: "02" },
          { ...CELOSIAS_VALUES, eyebrow: "03" },
        ].map((item) => (
          <div key={item.title}>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[hsl(0,72%,42%)]">
              {item.eyebrow}
            </p>
            <h3 className="mt-3 font-display text-xl font-bold uppercase tracking-[0.08em] text-[hsl(220,70%,18%)] dark:text-foreground sm:text-2xl">
              {item.title}
            </h3>
            <p className="mt-4 text-sm leading-relaxed text-neutral-600 dark:text-muted-foreground">
              {item.body}
            </p>
          </div>
        ))}
      </section>

      {/* CTA + pie editorial */}
      <section className="mx-auto flex w-full max-w-[88rem] flex-col gap-8 border-t border-neutral-200 px-4 py-12 min-[400px]:px-6 sm:flex-row sm:items-end sm:justify-between sm:px-8 lg:px-10 dark:border-border">
        <div>
          <p className="font-display text-lg font-bold uppercase tracking-[0.1em] text-[hsl(220,70%,18%)] dark:text-foreground sm:text-xl">
            No te pierdas nuestro catálogo
          </p>
          <p className="mt-2 max-w-md text-sm text-neutral-500 dark:text-muted-foreground">
            {CELOSIAS_HISTORY.lead} Cerámicas, porcelanatos y sanitarios.
          </p>
        </div>
        <Link
          href={tiendaHref}
          className="inline-flex shrink-0 items-center gap-2 bg-[hsl(220,70%,18%)] px-6 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white transition-opacity hover:opacity-90 dark:bg-primary dark:text-primary-foreground"
        >
          Ir a la tienda
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </section>

      <footer className="mt-auto overflow-hidden border-t border-neutral-200 px-2 pb-2 pt-6 dark:border-border sm:pt-8">
        <p className="text-center text-[0.65rem] uppercase tracking-[0.2em] text-neutral-400 dark:text-muted-foreground">
          Barquisimeto, Lara · Venezuela · {CELOSIAS_BRAND_NAME}
        </p>
        <p
          aria-hidden
          className="mt-4 select-none whitespace-nowrap text-center font-display text-[clamp(2.8rem,14vw,11rem)] font-bold uppercase leading-none tracking-[-0.04em] text-[hsl(220,70%,18%)] dark:text-foreground"
        >
          Celosías
        </p>
      </footer>
    </div>
  );
}

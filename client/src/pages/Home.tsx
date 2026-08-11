import { Link } from "wouter";
import { Instagram, MessageCircle } from "lucide-react";
import { getPrimaryStoreVitrinaHref, usePrimaryStore } from "@/hooks/use-primary-store";
import { cn } from "@/lib/utils";

type FeaturedDish = {
  id: string;
  name: string;
  image: string;
};

const HERO_DISH = {
  category: "Italian",
  name: "Pasta ai Funghi",
  description:
    "Pasta con champiñones, hierbas frescas y el sabor de casa Baguette. Un clásico italiano listo para pedir.",
  image:
    "https://png.pngtree.com/png-clipart/20231016/original/pngtree-delicious-chicken-spaghetti-png-image_13325645.png",
};

const CAROUSEL_DISHES: FeaturedDish[] = [
  {
    id: "spaghetti",
    name: "Spaghetti Classico",
    image:
      "https://static.vecteezy.com/system/resources/previews/049/159/898/non_2x/italian-food-spaghetti-top-view-transparent-png.png",
  },
  {
    id: "carbonara",
    name: "Spaghetti Carbonara",
    image:
      "https://static.vecteezy.com/system/resources/previews/056/615/020/non_2x/spaghetti-carbonara-top-view-isolate-on-transparent-background-png.png",
  },
  {
    id: "carbonara-basil",
    name: "Carbonara Basilico",
    image:
      "https://static.vecteezy.com/system/resources/previews/056/615/179/non_2x/a-spaghetti-carbonara-top-view-isolate-on-transparent-background-png.png",
  },
  {
    id: "spicy-chicken",
    name: "Spicy Chicken Pasta",
    image:
      "https://static.vecteezy.com/system/resources/previews/068/622/935/non_2x/delicious-spicy-chicken-spaghetti-pasta-in-a-bowl-overhead-shot-png.png",
  },
  {
    id: "chicken-1",
    name: "Chicken Spaghetti",
    image:
      "https://png.pngtree.com/png-clipart/20231016/original/pngtree-delicious-chicken-spaghetti-png-image_13325643.png",
  },
  {
    id: "funghi",
    name: "Pasta ai Funghi",
    image:
      "https://png.pngtree.com/png-clipart/20231016/original/pngtree-delicious-chicken-spaghetti-png-image_13325645.png",
  },
  {
    id: "mushroom",
    name: "Mushroom Pasta",
    image:
      "https://png.pngtree.com/png-clipart/20231016/original/pngtree-delicious-chicken-spaghetti-png-image_13325641.png",
  },
  {
    id: "funghi-extra",
    name: "Pasta ai Funghi",
    image:
      "https://png.pngtree.com/png-clipart/20231016/original/pngtree-delicious-chicken-spaghetti-png-image_13325645.png",
  },
];

/** Placeholders — reemplazar cuando tengamos datos finales de Baguette. */
const ABOUT = {
  logoSrc: "/baguette-logo.png",
  instagramUrl: "https://instagram.com/",
  instagramHandle: "@baguette",
  whatsappUrl: "https://wa.me/",
  whatsappLabel: "WhatsApp",
  address: "Barquisimeto, Venezuela",
  addressLine2: "Av. Venezuela esquina calle 33",
  /** Embed genérico; se puede sustituir por la ubicación real de la tienda. */
  mapsEmbedUrl:
    "https://maps.google.com/maps?q=Caracas&t=&z=14&ie=UTF8&iwloc=&output=embed",
};

export default function HomePage() {
  const { data: primaryStore } = usePrimaryStore();
  const tiendaHref = getPrimaryStoreVitrinaHref(primaryStore);

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-background text-foreground">
      <section className="relative isolate flex min-h-[calc(100dvh-4rem)] flex-col overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_75%_40%,hsl(var(--secondary)/0.18),transparent_55%)]"
        />

        <div className="relative mx-auto grid w-full max-w-[100rem] flex-1 grid-cols-1 items-center gap-6 px-4 pb-6 pt-8 min-[400px]:px-6 sm:px-8 lg:grid-cols-2 lg:gap-10 lg:px-10 lg:pb-4 lg:pt-6">
          <div className="relative z-20 order-2 max-w-xl lg:order-1">
            <p className="font-display text-lg font-medium tracking-wide text-muted-foreground sm:text-xl">
              {HERO_DISH.category}
            </p>
            <h1 className="mt-1 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl xl:text-7xl">
              {HERO_DISH.name}
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              {HERO_DISH.description}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4 sm:gap-6">
              <Link
                href={tiendaHref}
                className={cn(
                  "inline-flex items-center justify-center rounded-full bg-primary px-7 py-3",
                  "text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20",
                  "transition-opacity hover:opacity-90",
                )}
              >
                Order Food
              </Link>
            </div>
          </div>

          <div className="relative order-1 mx-auto flex aspect-square w-full max-w-[22rem] items-center justify-center sm:max-w-[26rem] lg:order-2 lg:max-w-none lg:w-full">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-[6%] rounded-full border border-foreground/15"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-[14%] rounded-full border border-foreground/12"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-[22%] rounded-full border border-foreground/10"
            />

            <img
              src={HERO_DISH.image}
              alt={HERO_DISH.name}
              className="relative z-20 w-[72%] max-w-[28rem] drop-shadow-2xl"
              decoding="async"
              fetchPriority="high"
              draggable={false}
            />
          </div>
        </div>

        <div className="relative z-20 w-full px-3 pb-8 min-[400px]:px-5 sm:px-8 lg:px-10">
          <div className="relative mx-auto w-full max-w-[100rem] overflow-hidden rounded-[1.5rem] bg-secondary px-3 py-4 sm:rounded-[1.75rem] sm:px-5 sm:py-5">
            <div className="flex justify-center gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-4 [&::-webkit-scrollbar]:hidden">
              {CAROUSEL_DISHES.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex w-[7.25rem] shrink-0 flex-col items-center gap-2.5 rounded-2xl bg-white px-2.5 py-3 text-center shadow-md sm:w-[8.5rem] sm:px-3 sm:py-3.5",
                    "text-black",
                  )}
                >
                  <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[#f4f4f4] sm:h-[4.5rem] sm:w-[4.5rem]">
                    <img
                      src={item.image}
                      alt=""
                      className="h-[90%] w-[90%] object-contain"
                      draggable={false}
                    />
                  </span>
                  <span className="line-clamp-2 min-h-[2.4rem] text-[0.7rem] font-bold leading-tight sm:text-xs">
                    {item.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Quiénes somos — franja compacta */}
      <section className="border-t border-border/60 bg-muted/30 px-3 py-8 min-[400px]:px-5 sm:px-8 sm:py-9 lg:px-10">
        <div className="mx-auto flex w-full max-w-[100rem] flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
          <div className="flex min-w-0 items-center gap-4">
            <img
              src={ABOUT.logoSrc}
              alt="Baguette"
              className="h-28 w-28 shrink-0 object-contain sm:h-32 sm:w-32"
            />
            <div className="min-w-0">
              <p className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Baguette
              </p>
              <p className="truncate text-sm text-muted-foreground sm:text-base">
                Cocina italiana · Baguette
              </p>
            </div>
          </div>

          <div className="min-w-0 text-sm leading-relaxed text-muted-foreground sm:text-base lg:max-w-[16rem]">
            <p className="font-medium text-foreground">{ABOUT.address}</p>
            <p>{ABOUT.addressLine2}</p>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center lg:flex-col lg:items-stretch">
            <a
              href={ABOUT.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="inline-flex h-11 min-w-[11rem] items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-background"
            >
              <Instagram className="h-4 w-4" />
              {ABOUT.instagramHandle}
            </a>
            <a
              href={ABOUT.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp"
              className="inline-flex h-11 min-w-[11rem] items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-background"
            >
              <MessageCircle className="h-4 w-4" />
              {ABOUT.whatsappLabel}
            </a>
          </div>

          <div className="h-48 w-full shrink-0 overflow-hidden rounded-2xl border border-border bg-card sm:h-40 lg:w-[28rem] xl:w-[32rem]">
            <iframe
              title="Mapa Baguette"
              src={ABOUT.mapsEmbedUrl}
              className="h-full w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </div>
      </section>
    </div>
  );
}

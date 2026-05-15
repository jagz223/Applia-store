import { useState } from "react";
import { Star } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { RATING_STAR_HINTS } from "@/lib/rating-ui";

type Props = {
  stars: number;
  onChange: (stars: number) => void;
  ariaLabel?: string;
};

export function RatingStarsPicker({ stars, onChange, ariaLabel = "Selecciona de 1 a 5 estrellas" }: Props) {
  const [hoverStars, setHoverStars] = useState<number | null>(null);
  const displayStars = hoverStars ?? stars;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.1 }}
      className="space-y-3"
    >
      <motion.div
        className="flex items-center justify-center gap-1 sm:gap-1.5"
        onMouseLeave={() => setHoverStars(null)}
        role="group"
        aria-label={ariaLabel}
      >
        {[1, 2, 3, 4, 5].map((v) => {
          const active = v <= displayStars;
          return (
            <button
              key={v}
              type="button"
              className="rounded-xl p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onMouseEnter={() => setHoverStars(v)}
              onFocus={() => setHoverStars(v)}
              onBlur={() => setHoverStars(null)}
              onClick={() => onChange(v)}
              aria-label={`${v} ${v === 1 ? "estrella" : "estrellas"}`}
              aria-pressed={v <= stars}
            >
              <motion.span
                animate={{ scale: active ? 1.08 : 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
                className="inline-flex"
              >
                <Star
                  className={cn(
                    "h-9 w-9 sm:h-10 sm:w-10 transition-colors duration-150",
                    active
                      ? "fill-amber-400 text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.35)]"
                      : "text-muted-foreground/35",
                  )}
                />
              </motion.span>
            </button>
          );
        })}
      </motion.div>

      <p
        className={cn(
          "min-h-[1.25rem] text-center text-sm font-medium transition-colors",
          displayStars >= 4 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
        )}
        aria-live="polite"
      >
        {RATING_STAR_HINTS[displayStars]}
      </p>
    </motion.div>
  );
}

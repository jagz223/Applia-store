import { type ServiceWithProvider } from "@shared/schema";
import { getCategoryDisplayName } from "@shared/default-categories";
import {
  isCatalogCredentialCategorySlug,
  isProfessionalListingCategorySlug,
  isTradeListingCategorySlug,
  resolveCertificationsText,
  resolvePreparationLevel,
} from "@shared/provider-preparation";
import { Link } from "wouter";
import { Star, ArrowRight, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { getProviderUserAvatarUrl } from "@/lib/user-avatar";

interface ServiceCardProps {
  service: ServiceWithProvider;
}

export function ServiceCard({ service }: ServiceCardProps) {
  const avatarUrl = getProviderUserAvatarUrl(service.provider);
  const categorySlug = String((service.category as { slug?: string } | undefined)?.slug ?? "");
  const preparationSnippet = resolvePreparationLevel(
    service.provider as { preparationLevel?: string | null; coursesCompleted?: string | null }
  );
  const certificationsSnippet = resolveCertificationsText(
    service.provider as { certifications?: string | null }
  );
  const showPreparationInCard = isTradeListingCategorySlug(categorySlug) && preparationSnippet.length > 0;
  const showCertificationsInCard =
    isCatalogCredentialCategorySlug(categorySlug) && certificationsSnippet.length > 0;
  const hasCredentialSnippets = showPreparationInCard || showCertificationsInCard;
  const showProfessionalOfferLabel = isProfessionalListingCategorySlug(categorySlug);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -8 }}
      transition={{ duration: 0.3 }}
    >
      <Link href={`/service/${service.id}`}>
        <div className="group relative flex flex-col overflow-hidden rounded-3xl bg-white dark:bg-card border border-border/30 shadow-lg shadow-black/5 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/15 cursor-pointer h-full">
          {/* Avatar (no imagen del servicio) */}
          <div className="relative aspect-[4/3] overflow-hidden bg-muted/40 flex items-center justify-center">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted/60">
                <User className="h-24 w-24 text-muted-foreground" strokeWidth={1.1} />
              </div>
            )}
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            
            {/* Category / subcategory badges */}
            <div className="absolute top-4 left-4 flex flex-wrap gap-1.5">
              <Badge className="bg-card/95 dark:bg-card text-foreground backdrop-blur-md shadow-lg font-bold border-0 px-3 py-1">
                {getCategoryDisplayName(service.category) || "Servicio"}
              </Badge>
              {service.subcategory?.name && (
                <Badge variant="secondary" className="bg-muted/95 dark:bg-muted/90 text-muted-foreground backdrop-blur-md shadow-lg border-0 px-2.5 py-0.5 text-xs">
                  {service.subcategory.name}
                </Badge>
              )}
            </div>

          </div>

          {/* Content */}
          <div className="flex flex-1 flex-col p-5">
            {/* Provider info */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm shadow-lg overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">
                  {service.provider?.user?.firstName} {service.provider?.user?.lastName?.[0]}.
                </p>
                <div className="flex items-center gap-1.5 text-amber-500">
                  <Star className="h-3.5 w-3.5 fill-current" />
                  <span className="text-xs font-bold text-foreground">
                    {Number((service.provider?.user as { rating?: number } | undefined)?.rating ?? 5).toFixed(1)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({Number((service.provider?.user as { ratingCount?: number } | undefined)?.ratingCount ?? 0)})
                  </span>
                </div>
              </div>
            </div>

            {/* Title */}
            {showProfessionalOfferLabel ? (
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary/85">Título de la oferta</p>
            ) : null}
            <h3 className="mb-2 text-lg font-bold font-display leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2">
              {service.title}
            </h3>

            {/* Description */}
            <p
              className={`text-sm text-muted-foreground line-clamp-2 flex-1 ${hasCredentialSnippets ? "mb-2" : "mb-4"}`}
            >
              {service.description}
            </p>
            {hasCredentialSnippets ? (
              <div className="mb-4 space-y-2">
                {showPreparationInCard ? (
                  <p className="text-xs text-muted-foreground line-clamp-2 border-l-2 border-primary/35 pl-2">
                    <span className="font-medium text-foreground">Preparación: </span>
                    {preparationSnippet}
                  </p>
                ) : null}
                {showCertificationsInCard ? (
                  <p className="text-xs text-muted-foreground line-clamp-2 border-l-2 border-primary/35 pl-2">
                    <span className="font-medium text-foreground">Certificaciones: </span>
                    {certificationsSnippet}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Footer */}
            <div className="mt-auto flex items-center justify-end pt-4 border-t border-border/50">
              <div className="flex items-center gap-2 rounded-full bg-secondary/10 px-4 py-2.5 text-sm font-bold text-secondary group-hover:bg-secondary group-hover:text-white transition-all duration-300">
                Ver más
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

import type { ServiceWithProvider } from "@shared/schema";
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
import { useProviderCompletedCount } from "@/hooks/use-mango-data";
import { getProviderUserAvatarUrl } from "@/lib/user-avatar";

interface ServiceListItemProps {
  service: ServiceWithProvider;
}

function getProviderName(service: ServiceWithProvider) {
  const u = (service.provider as any)?.user as
    | { firstName?: string; lastName?: string; name?: string }
    | undefined;
  if (!u) return "Asociado";
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.name || "Asociado";
}

export function ServiceListItem({ service }: ServiceListItemProps) {
  const categoryName = getCategoryDisplayName(service.category) || "Servicio";
  const providerUser = (service.provider as any)?.user as
    | { profileImageUrl?: string | null; rating?: number | string; ratingCount?: number | string }
    | undefined;

  const providerName = getProviderName(service);
  const avatarUrl = getProviderUserAvatarUrl(service.provider);
  const rating = Number(providerUser?.rating ?? 5);
  const reviewCount = Number(providerUser?.ratingCount ?? 0);

  const providerId = Number((service.provider as any)?.id);
  const {
    data: completedCount,
    isLoading: completedCountLoading,
  } = useProviderCompletedCount(Number.isFinite(providerId) ? providerId : undefined);

  const categorySlug = String((service.category as { slug?: string } | undefined)?.slug ?? "");
  const preparationSnippet = resolvePreparationLevel(service.provider as { preparationLevel?: string | null; coursesCompleted?: string | null });
  const certificationsSnippet = resolveCertificationsText(
    service.provider as { certifications?: string | null }
  );
  const showPreparationInList =
    isTradeListingCategorySlug(categorySlug) && preparationSnippet.length > 0;
  const showCertificationsInList =
    isCatalogCredentialCategorySlug(categorySlug) && certificationsSnippet.length > 0;
  const showProfessionalOfferLabel = isProfessionalListingCategorySlug(categorySlug);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <Link href={`/service/${service.id}`}>
        <div className="w-full border border-border/60 rounded-3xl bg-white dark:bg-card shadow-sm hover:border-primary/40 transition-colors overflow-hidden cursor-pointer">
          <div className="flex items-start justify-between gap-4 p-5">
            <div className="flex items-start gap-4 min-w-0">
              <div
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-muted/60 border border-border/50 flex items-center justify-center shrink-0 overflow-hidden"
                aria-hidden
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-12 h-12 sm:w-14 sm:h-14 text-muted-foreground" strokeWidth={1.25} />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-foreground">{providerName}</p>
                  {categoryName && (
                    <Badge variant="secondary" className="bg-muted text-muted-foreground">
                      {categoryName}
                    </Badge>
                  )}
                  {service.subcategory?.name && (
                    <Badge variant="outline" className="text-muted-foreground">
                      {service.subcategory.name}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 text-amber-500 mt-1">
                  <Star className="h-4 w-4 fill-current" />
                  <span className="text-sm font-bold text-foreground">{rating.toFixed(1)}</span>
                  <span className="text-xs text-muted-foreground">({reviewCount} reseñas)</span>
                  {completedCountLoading ? (
                    <span className="text-xs text-muted-foreground">· ... completados</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">· {completedCount ?? 0} servicios completados</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end justify-center gap-3 shrink-0 self-stretch">
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>

          <div className="px-5 pb-5">
            {showProfessionalOfferLabel ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-primary/85 mb-1">Título de la oferta</p>
            ) : null}
            <p className="font-display font-bold text-foreground mb-1 line-clamp-1">{service.title}</p>
            <p className="text-sm text-muted-foreground line-clamp-2">{service.description}</p>
            {showPreparationInList ? (
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2 border-l-2 border-primary/35 pl-2.5">
                <span className="font-medium text-foreground">Preparación: </span>
                {preparationSnippet}
              </p>
            ) : null}
            {showCertificationsInList ? (
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2 border-l-2 border-primary/35 pl-2.5">
                <span className="font-medium text-foreground">Certificaciones: </span>
                {certificationsSnippet}
              </p>
            ) : null}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}


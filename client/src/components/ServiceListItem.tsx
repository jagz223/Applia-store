import type { ServiceWithProvider } from "@shared/schema";
import { getCategoryDisplayName } from "@shared/default-categories";
import { Link } from "wouter";
import { Star, ArrowRight, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { useProviderCompletedCount } from "@/hooks/use-mango-data";

interface ServiceListItemProps {
  service: ServiceWithProvider;
}

function getProviderName(service: ServiceWithProvider) {
  const u = (service.provider as any)?.user as
    | { firstName?: string; lastName?: string; name?: string }
    | undefined;
  if (!u) return "Profesional";
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.name || "Profesional";
}

export function ServiceListItem({ service }: ServiceListItemProps) {
  const categoryName = getCategoryDisplayName(service.category) || "Servicio";
  const providerUser = (service.provider as any)?.user as
    | { profileImageUrl?: string | null; rating?: number | string; ratingCount?: number | string }
    | undefined;

  const providerName = getProviderName(service);
  const avatarUrl = providerUser?.profileImageUrl ?? null;
  const rating = Number(providerUser?.rating ?? 5);
  const reviewCount = Number(providerUser?.ratingCount ?? 0);

  const priceNum = Number(service.price ?? 0);

  const providerId = Number((service.provider as any)?.id);
  const {
    data: completedCount,
    isLoading: completedCountLoading,
  } = useProviderCompletedCount(Number.isFinite(providerId) ? providerId : undefined);

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
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-6 h-6 text-primary" />
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

            <div className="flex flex-col items-end gap-3 shrink-0">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">desde</p>
                <p className="text-lg font-bold text-primary">${Number.isFinite(priceNum) ? priceNum.toFixed(0) : "0"}</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>

          <div className="px-5 pb-5">
            <p className="font-display font-bold text-foreground mb-1 line-clamp-1">{service.title}</p>
            <p className="text-sm text-muted-foreground line-clamp-2">{service.description}</p>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}


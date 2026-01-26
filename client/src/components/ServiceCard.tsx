import { type ServiceWithProvider } from "@shared/schema";
import { Link } from "wouter";
import { Star, ArrowRight, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

interface ServiceCardProps {
  service: ServiceWithProvider;
}

export function ServiceCard({ service }: ServiceCardProps) {
  const imageSrc = service.imageUrl || `https://images.unsplash.com/photo-1581092921461-eab62e97a783?w=500&h=300&fit=crop`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -8 }}
      transition={{ duration: 0.3 }}
    >
      <Link href={`/service/${service.id}`}>
        <div className="group relative flex flex-col overflow-hidden rounded-3xl bg-white dark:bg-card border border-border/30 shadow-lg shadow-black/5 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/15 cursor-pointer h-full">
          {/* Image Container */}
          <div className="relative aspect-[4/3] overflow-hidden">
            <img
              src={imageSrc}
              alt={service.title}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            
            {/* Category badge */}
            <div className="absolute top-4 left-4">
              <Badge className="bg-white/95 text-foreground backdrop-blur-md shadow-lg font-bold border-0 px-3 py-1">
                {service.category?.name || "Servicio"}
              </Badge>
            </div>

            {/* Price tag */}
            <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
              <div className="bg-primary text-white px-4 py-2 rounded-xl font-bold shadow-lg">
                ${Number(service.price).toFixed(0)}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex flex-1 flex-col p-5">
            {/* Provider info */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm shadow-lg overflow-hidden">
                {service.provider?.user?.profileImageUrl ? (
                  <img src={service.provider.user.profileImageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  (service.provider?.user?.firstName?.[0] || "P").toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">
                  {service.provider?.user?.firstName} {service.provider?.user?.lastName?.[0]}.
                </p>
                <div className="flex items-center gap-1.5 text-amber-500">
                  <Star className="h-3.5 w-3.5 fill-current" />
                  <span className="text-xs font-bold text-foreground">
                    {Number(service.provider?.rating || 0).toFixed(1)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({service.provider?.reviewCount || 0})
                  </span>
                </div>
              </div>
            </div>

            {/* Title */}
            <h3 className="mb-2 text-lg font-bold font-display leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2">
              {service.title}
            </h3>

            {/* Description */}
            <p className="mb-4 text-sm text-muted-foreground line-clamp-2 flex-1">
              {service.description}
            </p>

            {/* Footer */}
            <div className="mt-auto flex items-center justify-between pt-4 border-t border-border/50">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Desde</span>
                <span className="text-2xl font-bold text-primary">
                  ${Number(service.price).toFixed(0)}
                </span>
              </div>
              
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

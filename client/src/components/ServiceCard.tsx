import { type ServiceWithProvider } from "@shared/schema";
import { Link } from "wouter";
import { Star, Clock, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ServiceCardProps {
  service: ServiceWithProvider;
}

export function ServiceCard({ service }: ServiceCardProps) {
  // Use service image if available, fallback to a nice placeholder
  const imageSrc = service.imageUrl || `https://images.unsplash.com/photo-1581092921461-eab62e97a783?w=500&h=300&fit=crop`;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl bg-card border border-border/50 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-primary/20">
      {/* Image Container */}
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <img
          src={imageSrc}
          alt={service.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute top-3 left-3">
          <Badge variant="secondary" className="bg-white/90 text-foreground backdrop-blur-sm shadow-sm font-semibold">
            {service.category?.name || "Service"}
          </Badge>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-amber-500">
            <Star className="h-4 w-4 fill-current" />
            <span className="text-sm font-bold text-foreground">
              {Number(service.provider.rating || 0).toFixed(1)}
            </span>
            <span className="text-xs text-muted-foreground">
              ({service.provider.reviewCount || 0})
            </span>
          </div>
        </div>

        <h3 className="mb-2 text-lg font-bold font-display leading-tight text-foreground group-hover:text-primary transition-colors line-clamp-2">
          {service.title}
        </h3>

        <p className="mb-4 text-sm text-muted-foreground line-clamp-2 flex-1">
          {service.description}
        </p>

        <div className="mt-auto flex items-center justify-between border-t border-border/50 pt-4">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Starting at</span>
            <span className="text-xl font-bold text-primary">
              ${Number(service.price).toFixed(0)}
            </span>
          </div>
          
          <Link href={`/service/${service.id}`}>
            <button className="flex items-center gap-2 rounded-full bg-secondary/10 px-4 py-2 text-sm font-semibold text-secondary transition-colors group-hover:bg-secondary group-hover:text-white">
              Details
              <ArrowRight className="h-4 w-4" />
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Ticket, Copy, Sparkles, Clock, ShieldCheck, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentProvider } from "@/hooks/use-mango-data";
import { hasAdminRole, canAccessPromocionesPanel } from "@/lib/auth-utils";
import { isGoVehicleProvider } from "@shared/provider-car-go";
import { useCategories } from "@/hooks/use-mango-data";
import { normalizeRoleCode } from "@shared/roles";
import {
  usePublicPromotionalCodes,
  publicPromoUrgencyStyles,
} from "@/hooks/use-public-promotional-codes";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

const PROMOS_PAGE_SIZE = 5;

export default function Promociones() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const searchQs = useSearch();
  const highlightPromoId = useMemo(() => {
    const raw = new URLSearchParams(searchQs).get("promo");
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [searchQs]);
  const { toast } = useToast();
  const { data: categories = [] } = useCategories();
  const { data: providerProfile, isLoading: providerLoading } = useCurrentProvider();

  const hasProvider =
    !!providerProfile || !!(user as { provider?: unknown } | null)?.provider;
  const isGoAssociateDriver =
    !!providerProfile && isGoVehicleProvider(providerProfile, categories);
  const canAccess =
    isAuthenticated &&
    canAccessPromocionesPanel(user, hasProvider, { isGoVehicleProvider: isGoAssociateDriver });

  /** Esperar /api/auth/me (y perfil proveedor si aplica) antes de redirigir — evita mandar a login en F5. */
  const accessPending =
    authLoading ||
    (isAuthenticated &&
      !hasAdminRole(user) &&
      normalizeRoleCode(user?.role) !== "professional" &&
      !hasProvider &&
      !isGoAssociateDriver &&
      providerLoading);

  const { data: promos = [], isLoading, isError, error } = usePublicPromotionalCodes(
    canAccess && !accessPending,
    highlightPromoId,
  );

  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(promos.length / PROMOS_PAGE_SIZE));
  const pagePromos = useMemo(() => {
    const start = (page - 1) * PROMOS_PAGE_SIZE;
    return promos.slice(start, start + PROMOS_PAGE_SIZE);
  }, [promos, page]);

  const rangeStart = promos.length === 0 ? 0 : (page - 1) * PROMOS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PROMOS_PAGE_SIZE, promos.length);

  useEffect(() => {
    setPage(1);
  }, [promos.length]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!highlightPromoId || isLoading) return;
    const el = document.getElementById(`promo-card-${highlightPromoId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightPromoId, isLoading, promos]);

  useEffect(() => {
    if (accessPending) return;
    if (!isAuthenticated) {
      setLocation("/login");
      return;
    }
    if (!canAccess) {
      setLocation("/");
    }
  }, [accessPending, isAuthenticated, canAccess, setLocation]);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast({
        title: "Código copiado",
        description: `Pega ${code} al pagar tu mensualidad.`,
      });
    } catch {
      toast({
        title: "No se pudo copiar",
        variant: "destructive",
      });
    }
  };

  if (accessPending || !canAccess) {
    return (
      <div className="container max-w-3xl py-16 flex justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8 sm:py-12 px-4 sm:px-6">
      <div className="mb-8 space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-mango-orange/15 flex items-center justify-center">
            <Ticket className="h-6 w-6 text-mango-orange" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Promociones</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Códigos activos para tu suscripción — un solo uso por cuenta.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Cargando promociones…</span>
        </div>
      ) : isError ? (
        <p className="text-destructive text-center py-8">{(error as Error).message}</p>
      ) : promos.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No hay promociones públicas activas en este momento.</p>
            <p className="text-sm mt-2">Vuelve pronto — te avisaremos con una notificación.</p>
          </CardContent>
        </Card>
      ) : (
        <>
        <ul className="grid gap-5 sm:gap-6">
          {pagePromos.map((promo) => {
            const isExpired = promo.isExpired === true;
            const styles = isExpired
              ? { banner: "bg-muted text-muted-foreground border-border", badge: "bg-muted", ring: "ring-border/40" }
              : publicPromoUrgencyStyles[promo.expiryBanner.tone];
            return (
              <li key={promo.id} id={`promo-card-${promo.id}`}>
                <Card
                  className={cn(
                    "overflow-hidden border-2 transition-shadow",
                    !isExpired && "hover:shadow-lg",
                    styles.ring,
                    "ring-2",
                    isExpired && "opacity-55 saturate-[0.65] bg-muted/30",
                  )}
                >
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle
                          className={cn(
                            "text-lg flex items-center gap-2",
                            isExpired && "text-muted-foreground",
                          )}
                        >
                          <Sparkles
                            className={cn(
                              "h-5 w-5 shrink-0",
                              isExpired ? "text-muted-foreground" : "text-mango-orange",
                            )}
                          />
                          {promo.benefitDescription}
                        </CardTitle>
                        <CardDescription className="mt-1.5 flex flex-wrap items-center gap-2">
                          {isExpired ? (
                            <Badge variant="outline" className="text-muted-foreground border-dashed">
                              Ya expiró
                            </Badge>
                          ) : null}
                          <Badge
                            variant="secondary"
                            className={cn("font-mono tracking-wider", isExpired && "opacity-80")}
                          >
                            {promo.code}
                          </Badge>
                          {promo.singleUsePerAccount ? (
                            <span className="inline-flex items-center gap-1 text-xs">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Un solo uso por cuenta
                            </span>
                          ) : null}
                        </CardDescription>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0 gap-1.5"
                        disabled={isExpired}
                        onClick={() => void copyCode(promo.code)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {isExpired ? "No disponible" : "Copiar código"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div
                      className={cn(
                        "rounded-xl border px-4 py-3 flex items-start gap-3",
                        styles.banner,
                      )}
                    >
                      <Clock className="h-5 w-5 shrink-0 mt-0.5" />
                      <div>
                        <p className={cn("font-semibold text-base leading-snug", promo.expiryBanner.isCountdown && "tabular-nums")}>
                          {promo.expiryBanner.headline}
                        </p>
                        {promo.expiryBanner.subline ? (
                          <p className="text-sm opacity-90 mt-0.5">{promo.expiryBanner.subline}</p>
                        ) : null}
                      </div>
                    </div>
                    <p className={cn("text-xs text-muted-foreground", isExpired && "italic")}>
                      {isExpired
                        ? "Esta promoción ya no está activa. Revisa las demás tarjetas si hay alguna vigente."
                        : "Aplica el código al pagar la mensualidad de tu servicio en GenFeb."}
                      {hasProvider ? (
                        <>
                          {" "}
                          <Link href="/professional-dashboard" className="text-primary underline-offset-2 hover:underline">
                            Ir a tu panel asociado
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>

        {promos.length > PROMOS_PAGE_SIZE ? (
          <div className="mt-8 space-y-3">
            <p className="text-center text-sm text-muted-foreground">
              Mostrando {rangeStart}–{rangeEnd} de {promos.length} promociones
            </p>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    className={cn(page <= 1 && "pointer-events-none opacity-50")}
                    onClick={(e) => {
                      e.preventDefault();
                      if (page > 1) setPage(page - 1);
                    }}
                  />
                </PaginationItem>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <PaginationItem key={p}>
                    <PaginationLink
                      href="#"
                      isActive={p === page}
                      onClick={(e) => {
                        e.preventDefault();
                        setPage(p);
                      }}
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    className={cn(page >= totalPages && "pointer-events-none opacity-50")}
                    onClick={(e) => {
                      e.preventDefault();
                      if (page < totalPages) setPage(page + 1);
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        ) : null}
        </>
      )}
    </div>
  );
}

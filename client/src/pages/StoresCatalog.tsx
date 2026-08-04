import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Loader2, Search, Store, X } from "lucide-react";
import { STORE_RUBROS } from "@shared/store-rubros";
import { useStoresCatalog } from "@/hooks/use-stores-catalog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PLACEHOLDER_SRC = "/placeholder-store.svg";
const ALL_RUBROS = "__all__";

function StoreCatalogCard({
  name,
  slug,
  description,
  rubroLabel,
  coverImageUrl,
}: {
  name: string;
  slug: string;
  description?: string | null;
  rubroLabel?: string | null;
  coverImageUrl?: string | null;
}) {
  const hasCover = Boolean(coverImageUrl?.trim());

  return (
    <Link
      href={`/tienda/${encodeURIComponent(slug)}`}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl h-full"
    >
      <Card className="overflow-hidden border-border transition-shadow hover:shadow-md h-full">
        <CardContent className="p-0 flex flex-col h-full">
          <div className="relative aspect-square w-full bg-muted/40 overflow-hidden shrink-0">
            {hasCover ? (
              <img
                src={coverImageUrl!}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <>
                <img
                  src={PLACEHOLDER_SRC}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/70 group-hover:text-muted-foreground transition-colors">
                  <Store className="h-14 w-14" strokeWidth={1.25} aria-hidden />
                </div>
              </>
            )}
          </div>
          <div className="p-3 flex flex-col flex-1 gap-1.5 min-h-0">
            {rubroLabel ? (
              <Badge variant="secondary" className="w-fit text-[10px] font-normal">
                {rubroLabel}
              </Badge>
            ) : null}
            <p className="text-sm font-semibold leading-snug line-clamp-2 text-foreground group-hover:text-primary transition-colors">
              {name}
            </p>
            {description?.trim() ? (
              <p className="text-xs text-muted-foreground line-clamp-2">{description.trim()}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function StoresCatalogPage() {
  const [searchInput, setSearchInput] = useState("");
  const [rubroFilter, setRubroFilter] = useState<string>(ALL_RUBROS);

  const filters = useMemo(
    () => ({
      q: searchInput.trim() || undefined,
      rubro: rubroFilter !== ALL_RUBROS ? rubroFilter : undefined,
    }),
    [searchInput, rubroFilter],
  );

  const { data: stores = [], isLoading, error, isFetching } = useStoresCatalog(filters);

  const hasActiveFilters = Boolean(searchInput.trim()) || rubroFilter !== ALL_RUBROS;

  function clearFilters() {
    setSearchInput("");
    setRubroFilter(ALL_RUBROS);
  }

  return (
    <div className="container max-w-6xl py-8 px-4">
      <header className="mb-6 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Tiendas</h1>
        <p className="text-muted-foreground text-sm">
          Explora tiendas activas en Applia. Busca por nombre o filtra por rubro.
        </p>
      </header>

      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Buscar tiendas…"
            value={searchInput}
            className="pl-9"
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <Select value={rubroFilter} onValueChange={setRubroFilter}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="Rubro" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_RUBROS}>Todos los rubros</SelectItem>
            {STORE_RUBROS.map((rubro) => (
              <SelectItem key={rubro.id} value={rubro.id}>
                {rubro.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasActiveFilters ? (
          <Button type="button" variant="outline" className="gap-1.5 shrink-0" onClick={clearFilters}>
            <X className="h-4 w-4" />
            Limpiar
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="text-center text-destructive py-12">{(error as Error).message}</p>
      ) : stores.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 px-6 text-center">
          <Store className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">
            {hasActiveFilters ? "No hay tiendas con esos criterios" : "Aún no hay tiendas activas"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {hasActiveFilters
              ? "Prueba otro nombre o rubro."
              : "Cuando los dueños activen su mensualidad, aparecerán aquí."}
          </p>
          {hasActiveFilters ? (
            <Button type="button" variant="outline" className="mt-4" onClick={clearFilters}>
              Quitar filtros
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <p className={cn("text-xs text-muted-foreground mb-4", isFetching && "opacity-70")}>
            {stores.length} tienda{stores.length === 1 ? "" : "s"}
            {isFetching ? " · actualizando…" : ""}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {stores.map((store) => (
              <StoreCatalogCard
                key={store.id}
                name={store.name}
                slug={store.slug}
                description={store.description}
                rubroLabel={store.rubroLabel}
                coverImageUrl={store.coverImageUrl}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

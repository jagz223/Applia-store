import { useMemo, useState } from "react";
import { Eye, Image as ImageIcon, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { normalizeBannerCategoryVisibility } from "@shared/store-showcase-ads-schema";
import {
  useDeleteStoreShowcaseAd,
  useStoreShowcaseAds,
  type StoreShowcaseAdSummary,
} from "@/hooks/use-store-showcase-ads";
import {
  resolveShowcaseAdClickUrl,
  resolveShowcaseAdImageUrl,
} from "@/lib/store-showcase-ad-media";
import { StoreShowcaseAdFormDialog } from "@/components/store/StoreShowcaseAdFormDialog";
import { StoreShowcaseAdDetailDialog } from "@/components/store/StoreShowcaseAdDetailDialog";
import { STORE_SHOWCASE_BANNER_SIZE_HINT } from "@/components/store/StoreShowcaseBannersCarousel";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { storeAdminSectionCardClass } from "@/components/store/store-admin-ui";
import { cn } from "@/lib/utils";

type AdKind = "banner" | "popup";

function bannerVisibilityLabel(ad: StoreShowcaseAdSummary): string {
  const { categoryVisibilityMode, categoryIds } = normalizeBannerCategoryVisibility(
    ad.categoryVisibilityMode,
    ad.categoryIds,
  );
  if (categoryVisibilityMode === "all") return "Todas las categorías";
  if (categoryVisibilityMode === "exclude") {
    const n = categoryIds.length;
    return n === 1 ? "Todas menos 1 categoría" : `Todas menos ${n} categorías`;
  }
  const n = categoryIds.length;
  return n === 1 ? "Solo en 1 categoría" : `Solo en ${n} categorías`;
}

function AdThumbnail({ imageUrl }: { imageUrl: string | null }) {
  if (!imageUrl) {
    return (
      <div
        className="flex h-14 w-24 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-muted-foreground"
        aria-hidden
      >
        <ImageIcon className="h-5 w-5" />
      </div>
    );
  }
  return (
    <img
      src={imageUrl}
      alt=""
      referrerPolicy="no-referrer"
      className="h-14 w-24 shrink-0 rounded-md border border-border object-cover bg-muted/30"
    />
  );
}

function AdList({
  kind,
  items,
  busy,
  onPreview,
  onEdit,
  onDelete,
}: {
  kind: AdKind;
  items: StoreShowcaseAdSummary[];
  busy: boolean;
  onPreview: (ad: StoreShowcaseAdSummary) => void;
  onEdit: (ad: StoreShowcaseAdSummary) => void;
  onDelete: (ad: StoreShowcaseAdSummary) => void;
}) {
  const sorted = useMemo(
    () => items.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [items],
  );
  const isBanner = kind === "banner";

  if (sorted.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
        No hay {kind === "banner" ? "banners" : "pop ups"} todavía. Agrega el primero.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {sorted.map((ad) => {
          const imageUrl = resolveShowcaseAdImageUrl(ad);
          const clickUrl = resolveShowcaseAdClickUrl(ad);
          return (
            <div
              key={ad.id}
              className="flex gap-3 rounded-2xl border border-border/60 bg-card/60 p-3"
            >
              <AdThumbnail imageUrl={imageUrl} />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="truncate text-sm font-medium">
                  {clickUrl ? "Con link" : "Solo imagen"}
                </p>
                {isBanner ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {bannerVisibilityLabel(ad)}
                  </p>
                ) : null}
                {clickUrl ? (
                  <p className="truncate text-xs text-muted-foreground">{clickUrl}</p>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full px-2.5"
                    disabled={busy}
                    onClick={() => onPreview(ad)}
                    aria-label="Vista previa"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full px-2.5"
                    disabled={busy}
                    onClick={() => onEdit(ad)}
                    aria-label="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full px-2.5 text-destructive hover:text-destructive"
                    disabled={busy}
                    onClick={() => onDelete(ad)}
                    aria-label="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-border/60 md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[8.5rem]">Imagen</TableHead>
              {isBanner ? <TableHead className="w-[12rem]">Alcance</TableHead> : null}
              <TableHead>Enlace</TableHead>
              <TableHead className="w-[9rem] text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((ad) => {
              const imageUrl = resolveShowcaseAdImageUrl(ad);
              const clickUrl = resolveShowcaseAdClickUrl(ad);
              return (
                <TableRow key={ad.id}>
                  <TableCell>
                    <AdThumbnail imageUrl={imageUrl} />
                  </TableCell>
                  {isBanner ? (
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {bannerVisibilityLabel(ad)}
                      </span>
                    </TableCell>
                  ) : null}
                  <TableCell className="max-w-[20rem]">
                    {clickUrl ? (
                      <span className="truncate text-sm">{clickUrl}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Sin link</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 rounded-full"
                        disabled={busy}
                        onClick={() => onPreview(ad)}
                        aria-label="Vista previa"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 rounded-full"
                        disabled={busy}
                        onClick={() => onEdit(ad)}
                        aria-label="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 rounded-full text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => onDelete(ad)}
                        aria-label="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export function StoreShowcaseAdsConfigCard({ storeId }: { storeId: number }) {
  const { toast } = useToast();
  const { data, error, isLoading } = useStoreShowcaseAds(storeId);
  const deleteMutation = useDeleteStoreShowcaseAd(storeId);

  const banners = data?.banners ?? [];
  const popups = data?.popups ?? [];

  const [tab, setTab] = useState<AdKind>("banner");
  const [formOpen, setFormOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<StoreShowcaseAdSummary | null>(null);
  const [previewAd, setPreviewAd] = useState<StoreShowcaseAdSummary | null>(null);
  const [deleteOpenFor, setDeleteOpenFor] = useState<StoreShowcaseAdSummary | null>(null);

  const busy = deleteMutation.isPending;

  function openCreate() {
    setEditingAd(null);
    setFormOpen(true);
  }

  function openEdit(ad: StoreShowcaseAdSummary) {
    setEditingAd(ad);
    setFormOpen(true);
  }

  return (
    <Card className={cn(storeAdminSectionCardClass, "overflow-hidden")}>
      <CardHeader className="space-y-1.5 px-4 pt-5 sm:px-6">
        <CardTitle className="font-display text-xl tracking-tight">Contenido de vitrina</CardTitle>
        <CardDescription className="text-sm leading-snug">
          Administra banners del carrusel y pop ups emergentes. Puedes ver, editar o eliminar cada
          imagen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-5 sm:px-6">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v === "popup" ? "popup" : "banner")}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList className="h-auto w-full justify-start gap-1 rounded-full p-1 sm:w-auto">
              <TabsTrigger value="banner" className="flex-1 rounded-full sm:flex-none">
                Banners
              </TabsTrigger>
              <TabsTrigger value="popup" className="flex-1 rounded-full sm:flex-none">
                Pop ups
              </TabsTrigger>
            </TabsList>
            <Button
              type="button"
              className="h-11 shrink-0 gap-2 rounded-full font-semibold"
              disabled={busy}
              onClick={openCreate}
            >
              <Plus className="h-4 w-4" />
              Agregar {tab === "banner" ? "banner" : "pop up"}
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : (
            <>
              <TabsContent value="banner" className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Carrusel arriba del filtro. Puedes limitar por categoría; “solo en…” no aparece en
                  Todas. Tamaño sugerido: {STORE_SHOWCASE_BANNER_SIZE_HINT}.
                </p>
                <AdList
                  kind="banner"
                  items={banners}
                  busy={busy}
                  onPreview={setPreviewAd}
                  onEdit={openEdit}
                  onDelete={setDeleteOpenFor}
                />
              </TabsContent>
              <TabsContent value="popup" className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Emergente al volver a la tienda luego de al menos 1 hora.
                </p>
                <AdList
                  kind="popup"
                  items={popups}
                  busy={busy}
                  onPreview={setPreviewAd}
                  onEdit={openEdit}
                  onDelete={setDeleteOpenFor}
                />
              </TabsContent>
            </>
          )}
        </Tabs>

        {error ? (
          <p className="text-sm text-destructive">
            No se pudieron cargar los banners y pop ups.
          </p>
        ) : null}
      </CardContent>

      <StoreShowcaseAdFormDialog
        storeId={storeId}
        kind={editingAd?.kind ?? tab}
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditingAd(null);
        }}
        ad={editingAd}
      />

      <StoreShowcaseAdDetailDialog
        ad={previewAd}
        open={previewAd != null}
        onOpenChange={(o) => {
          if (!o) setPreviewAd(null);
        }}
      />

      <AlertDialog
        open={deleteOpenFor != null}
        onOpenChange={(o) => {
          if (!o) setDeleteOpenFor(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar {deleteOpenFor?.kind === "banner" ? "banner" : "popup"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará del carrusel de la vitrina.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !deleteOpenFor}
              onClick={async () => {
                if (!deleteOpenFor) return;
                try {
                  await deleteMutation.mutateAsync({
                    kind: deleteOpenFor.kind,
                    adId: deleteOpenFor.id,
                  });
                  toast({ title: "Eliminado" });
                  setDeleteOpenFor(null);
                } catch (e) {
                  toast({
                    variant: "destructive",
                    title: "No se pudo eliminar",
                    description: e instanceof Error ? e.message : "Error desconocido",
                  });
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

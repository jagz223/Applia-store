import { useEffect, useId, useMemo, useState } from "react";
import { Image as ImageIcon, Loader2, MonitorPlay } from "lucide-react";
import type {
  InsertStoreShowcaseAdItem,
  StoreShowcaseBannerCategoryVisibilityMode,
} from "@shared/store-showcase-ads-schema";
import { normalizeBannerCategoryVisibility } from "@shared/store-showcase-ads-schema";
import {
  useCreateStoreShowcaseAd,
  useUpdateStoreShowcaseAd,
  type StoreShowcaseAdSummary,
} from "@/hooks/use-store-showcase-ads";
import { useStoreCategories } from "@/hooks/use-store-categories";
import { uploadStoreShowcaseAdImage } from "@/lib/firebase-client";
import { revokeBlobPreview } from "@/lib/store-image-draft";
import { isLikelyImageUrl, resolveShowcaseAdImageUrl } from "@/lib/store-showcase-ad-media";
import { useToast } from "@/hooks/use-toast";
import {
  StoreEntityMultiPicker,
  type SelectedEntity,
} from "@/components/store/StoreEntityMultiPicker";
import {
  storeAdminDialogBodyClass,
  storeAdminDialogContentClass,
  storeAdminDialogFooterClass,
  storeAdminDialogHeaderClass,
  storeAdminDialogShellClass,
  storeAdminFieldClass,
} from "@/components/store/store-admin-ui";
import {
  STORE_SHOWCASE_BANNER_FRAME_CLASS,
  STORE_SHOWCASE_BANNER_SIZE_HINT,
} from "@/components/store/StoreShowcaseBannersCarousel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type AdKind = "banner" | "popup";

type FormState = {
  imageSourceUrl: string;
  clickUrl: string;
  pendingImageFile: File | null;
  filePreviewUrl: string | null;
  categoryVisibilityMode: StoreShowcaseBannerCategoryVisibilityMode;
  selectedCategories: SelectedEntity[];
};

function emptyForm(): FormState {
  return {
    imageSourceUrl: "",
    clickUrl: "",
    pendingImageFile: null,
    filePreviewUrl: null,
    categoryVisibilityMode: "all",
    selectedCategories: [],
  };
}

function formPreviewUrl(form: FormState, existingImageUrl: string | null): string | null {
  if (form.filePreviewUrl) return form.filePreviewUrl;
  const url = form.imageSourceUrl.trim();
  if (url && isLikelyImageUrl(url)) return url;
  if (existingImageUrl?.trim() && !form.pendingImageFile && !url) return existingImageUrl.trim();
  return null;
}

export function StoreShowcaseAdFormDialog({
  storeId,
  kind,
  open,
  onOpenChange,
  ad,
}: {
  storeId: number;
  kind: AdKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ad?: StoreShowcaseAdSummary | null;
}) {
  const { toast } = useToast();
  const id = useId();
  const isEdit = ad != null;
  const isBanner = kind === "banner";
  const createMutation = useCreateStoreShowcaseAd(storeId);
  const updateMutation = useUpdateStoreShowcaseAd(storeId);
  const saving = createMutation.isPending || updateMutation.isPending;
  const { data: categories = [], isLoading: categoriesLoading } = useStoreCategories(
    storeId,
    open && isBanner,
  );

  const [form, setForm] = useState<FormState>(emptyForm);
  const [originalPreviewOpen, setOriginalPreviewOpen] = useState(false);
  const [vitrinaPreviewOpen, setVitrinaPreviewOpen] = useState(false);
  const existingImageUrl = ad ? resolveShowcaseAdImageUrl(ad) : null;
  const previewUrl = formPreviewUrl(form, existingImageUrl);
  const canSubmit = useMemo(() => {
    if (!previewUrl) return false;
    if (!isBanner) return true;
    if (form.categoryVisibilityMode === "all") return true;
    return form.selectedCategories.length > 0;
  }, [previewUrl, isBanner, form.categoryVisibilityMode, form.selectedCategories.length]);
  const urlLooksLikeImage = !form.pendingImageFile && isLikelyImageUrl(form.imageSourceUrl);
  const urlEnteredButInvalid =
    Boolean(form.imageSourceUrl.trim()) && !form.pendingImageFile && !urlLooksLikeImage;

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ id: c.id, name: c.name })),
    [categories],
  );

  useEffect(() => {
    if (!open) return;
    if (ad) {
      const visibility = normalizeBannerCategoryVisibility(
        ad.categoryVisibilityMode,
        ad.categoryIds,
      );
      const selectedCategories =
        visibility.categoryVisibilityMode === "all"
          ? []
          : visibility.categoryIds.map((cid) => {
              const found = categories.find((c) => c.id === cid);
              return { id: cid, name: found?.name ?? `Categoría #${cid}` };
            });
      setForm({
        imageSourceUrl: "",
        clickUrl: ad.linkUrl?.trim() ?? "",
        pendingImageFile: null,
        filePreviewUrl: null,
        categoryVisibilityMode: visibility.categoryVisibilityMode,
        selectedCategories,
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, ad, categories]);

  useEffect(() => {
    return () => {
      revokeBlobPreview(form.filePreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit() {
    const imageFromUrl = form.imageSourceUrl.trim();
    const clickUrl = form.clickUrl.trim();

    if (!form.pendingImageFile && !isLikelyImageUrl(imageFromUrl) && !existingImageUrl) {
      toast({
        variant: "destructive",
        title: "Imagen requerida",
        description: "Sube un archivo o pega un enlace válido de imagen.",
      });
      return;
    }

    if (
      isBanner &&
      form.categoryVisibilityMode !== "all" &&
      form.selectedCategories.length === 0
    ) {
      toast({
        variant: "destructive",
        title: "Categorías requeridas",
        description: "Selecciona al menos una categoría para este modo.",
      });
      return;
    }

    try {
      let imageUrl: string | null = existingImageUrl;
      if (form.pendingImageFile) {
        imageUrl = await uploadStoreShowcaseAdImage(storeId, kind, form.pendingImageFile);
      } else if (isLikelyImageUrl(imageFromUrl)) {
        imageUrl = imageFromUrl;
      }

      const visibility = isBanner
        ? normalizeBannerCategoryVisibility(
            form.categoryVisibilityMode,
            form.selectedCategories.map((c) => c.id),
          )
        : { categoryVisibilityMode: "all" as const, categoryIds: [] as number[] };

      if (isEdit && ad) {
        await updateMutation.mutateAsync({
          kind,
          adId: ad.id,
          body: {
            imageUrl,
            linkUrl: clickUrl || null,
            ...(isBanner
              ? {
                  categoryVisibilityMode: visibility.categoryVisibilityMode,
                  categoryIds: visibility.categoryIds,
                }
              : {}),
          },
        });
        toast({ title: kind === "banner" ? "Banner actualizado" : "Popup actualizado" });
      } else {
        const payload: InsertStoreShowcaseAdItem = {
          kind,
          imageUrl,
          linkUrl: clickUrl || null,
          ...(isBanner
            ? {
                categoryVisibilityMode: visibility.categoryVisibilityMode,
                categoryIds: visibility.categoryIds,
              }
            : {}),
        };
        await createMutation.mutateAsync(payload);
        toast({ title: kind === "banner" ? "Banner creado" : "Popup creado" });
      }

      revokeBlobPreview(form.filePreviewUrl);
      onOpenChange(false);
    } catch (e) {
      toast({
        variant: "destructive",
        title: isEdit
          ? kind === "banner"
            ? "No se pudo actualizar el banner"
            : "No se pudo actualizar el popup"
          : kind === "banner"
            ? "No se pudo crear el banner"
            : "No se pudo crear el popup",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  const kindLabel = kind === "banner" ? "banner" : "popup";

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setOriginalPreviewOpen(false);
          setVitrinaPreviewOpen(false);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        layer="elevated"
        overlayClassName={storeAdminDialogShellClass}
        className={storeAdminDialogContentClass()}
      >
        <DialogHeader className={storeAdminDialogHeaderClass}>
          <DialogTitle>
            {isEdit ? `Editar ${kindLabel}` : `Agregar ${kindLabel}`}
          </DialogTitle>
          <DialogDescription>
            {kind === "banner"
              ? `Carrusel de la vitrina. Puedes limitar en qué categorías se muestra. Sugerido: ${STORE_SHOWCASE_BANNER_SIZE_HINT}.`
              : "Se muestra como popup al volver a la vitrina luego de al menos 1 hora."}
          </DialogDescription>
        </DialogHeader>

        <div className={storeAdminDialogBodyClass}>
          <div className="space-y-2">
            <Label>Vista previa</Label>
            {kind === "banner" ? (
              <div className="space-y-2">
                {previewUrl ? (
                  <button
                    type="button"
                    className={cn(
                      "relative flex w-full items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-muted/30 p-2",
                      "min-h-[7.5rem] cursor-zoom-in transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                    onClick={() => setOriginalPreviewOpen(true)}
                    aria-label="Ver imagen en proporciones originales"
                  >
                    <img
                      src={previewUrl}
                      alt=""
                      className="max-h-[min(40dvh,16rem)] max-w-full object-contain"
                    />
                  </button>
                ) : (
                  <div className="flex min-h-[7.5rem] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-border/60 bg-muted/30 text-muted-foreground">
                    <ImageIcon className="h-6 w-6" aria-hidden />
                    <p className="text-xs">Sube un archivo o pega un enlace</p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Toca la imagen para verla a tamaño original.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full gap-2 rounded-full"
                  disabled={!previewUrl}
                  onClick={() => setVitrinaPreviewOpen(true)}
                >
                  <MonitorPlay className="h-4 w-4" aria-hidden />
                  Vista en vitrina
                </Button>
              </div>
            ) : (
              <div className="flex w-full items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-muted/30 p-3">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt=""
                    className="max-h-[min(50dvh,20rem)] max-w-full object-contain"
                  />
                ) : (
                  <div className="flex h-40 w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                    <ImageIcon className="h-6 w-6" aria-hidden />
                    <p className="text-xs">Sube un archivo o pega un enlace</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${id}-file`}>Subir imagen</Label>
            <Input
              id={`${id}-file`}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={saving}
              className={storeAdminFieldClass}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0] ?? null;
                setForm((prev) => {
                  revokeBlobPreview(prev.filePreviewUrl);
                  return {
                    ...prev,
                    pendingImageFile: file,
                    filePreviewUrl: file ? URL.createObjectURL(file) : null,
                    imageSourceUrl: file ? "" : prev.imageSourceUrl,
                  };
                });
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${id}-image-url`}>Enlace de imagen</Label>
            <Input
              id={`${id}-image-url`}
              value={form.imageSourceUrl}
              disabled={saving || Boolean(form.pendingImageFile)}
              placeholder="https://.../imagen.jpg"
              className={storeAdminFieldClass}
              onChange={(e) => {
                const imageSourceUrl = e.target.value;
                setForm((prev) => {
                  if (prev.filePreviewUrl) revokeBlobPreview(prev.filePreviewUrl);
                  return {
                    ...prev,
                    imageSourceUrl,
                    pendingImageFile: null,
                    filePreviewUrl: null,
                  };
                });
              }}
            />
            {isEdit && existingImageUrl && !form.pendingImageFile && !form.imageSourceUrl.trim() ? (
              <p className="text-xs text-muted-foreground">
                Se mantiene la imagen actual si no subes otra ni pegas una URL nueva.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Pega la URL de una imagen para previsualizarla.
              </p>
            )}
            {urlEnteredButInvalid ? (
              <p className="text-xs text-destructive">
                Ese enlace no parece una imagen. Usa una URL que termine en .jpg, .png, .webp, etc.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${id}-click`}>Link al hacer clic (opcional)</Label>
            <Input
              id={`${id}-click`}
              value={form.clickUrl}
              disabled={saving}
              placeholder="https://..."
              className={storeAdminFieldClass}
              onChange={(e) => setForm((prev) => ({ ...prev, clickUrl: e.target.value }))}
            />
          </div>

          {isBanner ? (
            <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
              <div className="space-y-2">
                <Label>Visibilidad por categoría</Label>
                <Select
                  value={form.categoryVisibilityMode}
                  disabled={saving}
                  onValueChange={(v) => {
                    const mode = v as StoreShowcaseBannerCategoryVisibilityMode;
                    setForm((prev) => ({
                      ...prev,
                      categoryVisibilityMode: mode,
                      selectedCategories: mode === "all" ? [] : prev.selectedCategories,
                    }));
                  }}
                >
                  <SelectTrigger className={cn(storeAdminFieldClass, "h-11")}>
                    <SelectValue placeholder="Elige el modo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">En todas las categorías</SelectItem>
                    <SelectItem value="exclude">En todas, menos las seleccionadas</SelectItem>
                    <SelectItem value="include">Solo en las categorías seleccionadas</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  En el filtro global de la vitrina no se muestran los banners de “solo en…”.
                </p>
              </div>

              {form.categoryVisibilityMode !== "all" ? (
                <StoreEntityMultiPicker
                  label={
                    form.categoryVisibilityMode === "exclude"
                      ? "Categorías excluidas"
                      : "Categorías incluidas"
                  }
                  placeholder="Buscar y agregar categoría"
                  emptyHint="No hay más categorías"
                  selected={form.selectedCategories}
                  onChange={(next) => setForm((prev) => ({ ...prev, selectedCategories: next }))}
                  options={categoryOptions}
                  isLoading={categoriesLoading}
                  disabled={saving}
                  popoverLayer="modal"
                />
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className={storeAdminDialogFooterClass}>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-full sm:w-auto"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="h-11 w-full rounded-full sm:w-auto"
            disabled={!canSubmit || saving}
            onClick={() => void handleSubmit()}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isEdit ? "Guardar" : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={originalPreviewOpen} onOpenChange={setOriginalPreviewOpen}>
      <DialogContent
        layer="priority"
        overlayClassName={storeAdminDialogShellClass}
        className={storeAdminDialogContentClass("sm:max-w-3xl")}
      >
        <DialogHeader className={storeAdminDialogHeaderClass}>
          <DialogTitle>Imagen original</DialogTitle>
          <DialogDescription>
            Proporciones reales del archivo, sin recorte de vitrina.
          </DialogDescription>
        </DialogHeader>
        <div className={cn(storeAdminDialogBodyClass, "flex items-center justify-center")}>
          {previewUrl ? (
            <img
              src={previewUrl}
              alt=""
              className="max-h-[min(75dvh,36rem)] max-w-full object-contain"
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={vitrinaPreviewOpen} onOpenChange={setVitrinaPreviewOpen}>
      <DialogContent
        layer="priority"
        overlayClassName={storeAdminDialogShellClass}
        className={storeAdminDialogContentClass("sm:max-w-3xl")}
      >
        <DialogHeader className={storeAdminDialogHeaderClass}>
          <DialogTitle>Vista en vitrina</DialogTitle>
          <DialogDescription>
            Así se verá en el carrusel ({STORE_SHOWCASE_BANNER_SIZE_HINT}), con recorte centrado si
            hace falta.
          </DialogDescription>
        </DialogHeader>
        <div className={storeAdminDialogBodyClass}>
          <div
            className={cn(
              "relative mx-auto overflow-hidden rounded-2xl border border-border/60 bg-muted/30",
              STORE_SHOWCASE_BANNER_FRAME_CLASS,
            )}
          >
            {previewUrl ? (
              <img src={previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

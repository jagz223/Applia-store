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
import {
  resolveStoreImageDraftToAsset,
  revokeBlobPreview,
  singularDraftFromSavedFields,
  type StoreImageDraft,
} from "@/lib/store-image-draft";
import { resolveShowcaseAdImageUrl } from "@/lib/store-showcase-ad-media";
import { useToast } from "@/hooks/use-toast";
import {
  StoreEntityMultiPicker,
  type SelectedEntity,
} from "@/components/store/StoreEntityMultiPicker";
import { StoreCoverPhotoPicker } from "@/components/store/StoreCoverPhotoPicker";
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

const BANNER_ASPECT = 21 / 9;

type FormState = {
  clickUrl: string;
  imageDraft: StoreImageDraft | null;
  categoryVisibilityMode: StoreShowcaseBannerCategoryVisibilityMode;
  selectedCategories: SelectedEntity[];
};

function emptyForm(): FormState {
  return {
    clickUrl: "",
    imageDraft: null,
    categoryVisibilityMode: "all",
    selectedCategories: [],
  };
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
  const previewUrl = form.imageDraft?.previewUrl ?? null;
  const canSubmit = useMemo(() => {
    if (!previewUrl) return false;
    if (!isBanner) return true;
    if (form.categoryVisibilityMode === "all") return true;
    return form.selectedCategories.length > 0;
  }, [previewUrl, isBanner, form.categoryVisibilityMode, form.selectedCategories.length]);

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
        clickUrl: ad.linkUrl?.trim() ?? "",
        imageDraft: singularDraftFromSavedFields({
          displayUrl: resolveShowcaseAdImageUrl(ad),
          originalUrl: ad.imageOriginalUrl,
          transform: ad.imageTransform,
        }),
        categoryVisibilityMode: visibility.categoryVisibilityMode,
        selectedCategories,
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, ad, categories]);

  useEffect(() => {
    return () => {
      if (form.imageDraft) {
        revokeBlobPreview(form.imageDraft.previewUrl);
        revokeBlobPreview(form.imageDraft.originalPreviewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit() {
    const clickUrl = form.clickUrl.trim();

    if (!form.imageDraft) {
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
      const asset = await resolveStoreImageDraftToAsset(form.imageDraft, (file, variant) =>
        uploadStoreShowcaseAdImage(storeId, kind, file, variant),
      );
      if (!asset) {
        toast({
          variant: "destructive",
          title: "Imagen incompleta",
          description: "Recorta o selecciona una imagen válida.",
        });
        return;
      }

      const visibility = isBanner
        ? normalizeBannerCategoryVisibility(
            form.categoryVisibilityMode,
            form.selectedCategories.map((c) => c.id),
          )
        : { categoryVisibilityMode: "all" as const, categoryIds: [] as number[] };

      const imageFields = {
        imageUrl: asset.displayUrl,
        imageOriginalUrl: asset.originalUrl || null,
        imageTransform: asset.transform,
      };

      if (isEdit && ad) {
        await updateMutation.mutateAsync({
          kind,
          adId: ad.id,
          body: {
            ...imageFields,
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
          ...imageFields,
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

      if (form.imageDraft) {
        revokeBlobPreview(form.imageDraft.previewUrl);
        revokeBlobPreview(form.imageDraft.originalPreviewUrl);
      }
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
          {isBanner && previewUrl ? (
            <div className="space-y-2">
              <Label>Vista previa</Label>
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
          ) : null}

          {!isBanner && previewUrl ? (
            <div className="flex w-full items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-muted/30 p-3">
              <img
                src={previewUrl}
                alt=""
                className="max-h-[min(50dvh,20rem)] max-w-full object-contain"
              />
            </div>
          ) : null}

          {!previewUrl ? (
            <div className="flex min-h-[5rem] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-border/60 bg-muted/30 text-muted-foreground">
              <ImageIcon className="h-6 w-6" aria-hidden />
              <p className="text-xs">Sube un archivo o pega un enlace</p>
            </div>
          ) : null}

          <StoreCoverPhotoPicker
            label="Imagen"
            draft={form.imageDraft}
            disabled={saving}
            aspectRatio={BANNER_ASPECT}
            previewAspectClass="aspect-[21/9]"
            onDraftChange={(imageDraft) => setForm((prev) => ({ ...prev, imageDraft }))}
          />

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

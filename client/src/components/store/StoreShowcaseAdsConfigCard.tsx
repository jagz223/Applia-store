import { useEffect, useId, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Loader2, Plus, Trash2, Image as ImageIcon } from "lucide-react";
import type { InsertStoreShowcaseAdItem } from "@shared/store-showcase-ads-schema";
import {
  useCreateStoreShowcaseAd,
  useDeleteStoreShowcaseAd,
  useStoreShowcaseAds,
  type StoreShowcaseAdSummary,
} from "@/hooks/use-store-showcase-ads";
import { uploadStoreShowcaseAdImage } from "@/lib/firebase-client";
import { revokeBlobPreview } from "@/lib/store-image-draft";
import {
  isLikelyImageUrl,
  resolveShowcaseAdClickUrl,
  resolveShowcaseAdImageUrl,
} from "@/lib/store-showcase-ad-media";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { cn } from "@/lib/utils";
import { storeAdminFieldClass } from "@/components/store/store-admin-ui";
import { STORE_SHOWCASE_BANNER_FRAME_CLASS } from "@/components/store/StoreShowcaseBannersCarousel";

type AdKind = "banner" | "popup";

type AdFormState = {
  imageSourceUrl: string;
  clickUrl: string;
  pendingImageFile: File | null;
  filePreviewUrl: string | null;
};

function emptyFormState(): AdFormState {
  return {
    imageSourceUrl: "",
    clickUrl: "",
    pendingImageFile: null,
    filePreviewUrl: null,
  };
}

function formPreviewUrl(form: AdFormState): string | null {
  if (form.filePreviewUrl) return form.filePreviewUrl;
  const url = form.imageSourceUrl.trim();
  if (url && isLikelyImageUrl(url)) return url;
  return null;
}

export function StoreShowcaseAdsConfigCard({ storeId }: { storeId: number }) {
  const { toast } = useToast();
  const { data, error } = useStoreShowcaseAds(storeId);
  const createMutation = useCreateStoreShowcaseAd(storeId);
  const deleteMutation = useDeleteStoreShowcaseAd(storeId);

  const banners = data?.banners ?? [];
  const popups = data?.popups ?? [];

  const [bannerForm, setBannerForm] = useState<AdFormState>(emptyFormState);
  const [popupForm, setPopupForm] = useState<AdFormState>(emptyFormState);
  const [deleteOpenFor, setDeleteOpenFor] = useState<{ kind: AdKind; adId: number } | null>(null);

  useEffect(() => {
    return () => {
      revokeBlobPreview(bannerForm.filePreviewUrl);
      revokeBlobPreview(popupForm.filePreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setBannerForm((prev) => {
      revokeBlobPreview(prev.filePreviewUrl);
      return emptyFormState();
    });
    setPopupForm((prev) => {
      revokeBlobPreview(prev.filePreviewUrl);
      return emptyFormState();
    });
  }, [storeId]);

  const bannerCanSubmit = useMemo(() => Boolean(formPreviewUrl(bannerForm)), [bannerForm]);
  const popupCanSubmit = useMemo(() => Boolean(formPreviewUrl(popupForm)), [popupForm]);

  async function handleCreate(kind: AdKind) {
    const form = kind === "banner" ? bannerForm : popupForm;
    const imageFromUrl = form.imageSourceUrl.trim();
    const clickUrl = form.clickUrl.trim();

    if (!form.pendingImageFile && !isLikelyImageUrl(imageFromUrl)) {
      toast({
        variant: "destructive",
        title: "Imagen requerida",
        description: "Sube un archivo o pega un enlace válido de imagen para previsualizar.",
      });
      return;
    }

    try {
      let imageUrl: string | null = null;
      if (form.pendingImageFile) {
        imageUrl = await uploadStoreShowcaseAdImage(storeId, kind, form.pendingImageFile);
      } else {
        imageUrl = imageFromUrl;
      }

      const payload: InsertStoreShowcaseAdItem = {
        kind,
        imageUrl,
        linkUrl: clickUrl || null,
      };

      await createMutation.mutateAsync(payload);
      toast({ title: kind === "banner" ? "Banner creado" : "Popup creado" });

      if (kind === "banner") {
        revokeBlobPreview(bannerForm.filePreviewUrl);
        setBannerForm(emptyFormState());
      } else {
        revokeBlobPreview(popupForm.filePreviewUrl);
        setPopupForm(emptyFormState());
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: kind === "banner" ? "No se pudo crear el banner" : "No se pudo crear el popup",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  const deleting = deleteMutation.isPending;

  return (
    <div className="space-y-8">
      <AdSection
        title="Banners"
        description="Se muestran como carrusel arriba del filtro de la vitrina."
        sizeHint="Se sugiere un tamaño de: 1200 × 300 px (recomendado) o 1600 × 400 px."
        previewKind="banner"
        items={banners}
        form={bannerForm}
        setForm={setBannerForm}
        canSubmit={bannerCanSubmit}
        saving={createMutation.isPending}
        deleting={deleting}
        onSubmit={() => handleCreate("banner")}
        onDelete={(adId) => setDeleteOpenFor({ kind: "banner", adId })}
      />

      <AdSection
        title="Pop ups"
        description="Se muestran como carrusel emergente cuando el cliente vuelve luego de al menos 1 hora."
        previewKind="popup"
        items={popups}
        form={popupForm}
        setForm={setPopupForm}
        canSubmit={popupCanSubmit}
        saving={createMutation.isPending}
        deleting={deleting}
        onSubmit={() => handleCreate("popup")}
        onDelete={(adId) => setDeleteOpenFor({ kind: "popup", adId })}
        className="border-t border-border/60 pt-8"
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
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting || !deleteOpenFor}
              onClick={async () => {
                if (!deleteOpenFor) return;
                try {
                  await deleteMutation.mutateAsync({
                    kind: deleteOpenFor.kind,
                    adId: deleteOpenFor.adId,
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

      {error ? (
        <p className="text-sm text-destructive">No se pudo cargar los datos de banners y popups.</p>
      ) : null}
    </div>
  );
}

function AdSection({
  title,
  description,
  sizeHint,
  previewKind,
  items,
  form,
  setForm,
  canSubmit,
  saving,
  deleting,
  onSubmit,
  onDelete,
  className,
}: {
  title: string;
  description: string;
  sizeHint?: string;
  previewKind: AdKind;
  items: StoreShowcaseAdSummary[];
  form: AdFormState;
  setForm: Dispatch<SetStateAction<AdFormState>>;
  canSubmit: boolean;
  saving: boolean;
  deleting: boolean;
  onSubmit: () => Promise<void>;
  onDelete: (adId: number) => void;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
        {sizeHint ? <p className="text-sm font-medium text-red-600">{sizeHint}</p> : null}
      </div>

      <AdHorizontalList items={items} onDelete={onDelete} deleting={deleting} />

      <AdCreateForm
        previewKind={previewKind}
        form={form}
        setForm={setForm}
        onSubmit={onSubmit}
        canSubmit={canSubmit}
        saving={saving}
      />
    </section>
  );
}

function AdHorizontalList({
  items,
  onDelete,
  deleting,
}: {
  items: StoreShowcaseAdSummary[];
  onDelete: (adId: number) => void;
  deleting: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay elementos en este carrusel aún. Agrega uno debajo.
      </p>
    );
  }

  const sorted = items.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

  return (
    <div
      className={cn(
        "flex gap-3 overflow-x-auto overscroll-x-contain pb-1",
        "scroll-smooth [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5",
        "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30",
      )}
    >
      {sorted.map((ad) => {
        const imageUrl = resolveShowcaseAdImageUrl(ad);
        const clickUrl = resolveShowcaseAdClickUrl(ad);
        return (
          <div
            key={ad.id}
            className="relative h-28 w-52 shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-muted/30"
          >
            {imageUrl ? (
              <img src={imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
                Sin imagen
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6">
              <p className="min-w-0 truncate text-[11px] text-white/90">
                {clickUrl ? "Con link" : "Solo imagen"}
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-7 gap-1 rounded-full px-2 text-xs"
                disabled={deleting}
                onClick={() => onDelete(ad.id)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Eliminar
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AdCreateForm({
  previewKind,
  form,
  setForm,
  onSubmit,
  canSubmit,
  saving,
}: {
  previewKind: AdKind;
  form: AdFormState;
  setForm: Dispatch<SetStateAction<AdFormState>>;
  onSubmit: () => Promise<void>;
  canSubmit: boolean;
  saving: boolean;
}) {
  const id = useId();
  const previewUrl = formPreviewUrl(form);
  const urlLooksLikeImage = !form.pendingImageFile && isLikelyImageUrl(form.imageSourceUrl);
  const urlEnteredButInvalid =
    Boolean(form.imageSourceUrl.trim()) && !form.pendingImageFile && !urlLooksLikeImage;
  const isBannerPreview = previewKind === "banner";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit();
      }}
      className="space-y-4 rounded-2xl border border-border/60 bg-card/50 p-4"
    >
      <div className="space-y-2">
        <Label>Vista previa</Label>
        {isBannerPreview ? (
          <div
            className={cn(
              "relative w-full overflow-hidden rounded-2xl border border-border/60 bg-muted/30",
              STORE_SHOWCASE_BANNER_FRAME_CLASS,
            )}
          >
            {previewUrl ? (
              <img src={previewUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <ImageIcon className="h-6 w-6" aria-hidden />
                <p className="text-xs">Sube un archivo o pega un enlace de imagen</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex w-full items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-muted/30 p-3">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt=""
                className="max-h-[min(70dvh,32rem)] max-w-full object-contain"
              />
            ) : (
              <div className="flex h-40 w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <ImageIcon className="h-6 w-6" aria-hidden />
                <p className="text-xs">Sube un archivo o pega un enlace de imagen</p>
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
                // Si elige archivo, limpiamos URL de imagen para no mezclar fuentes.
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
        <p className="text-xs text-muted-foreground">
          Pega la URL de una imagen para previsualizarla antes de agregar.
        </p>
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
        <p className="text-xs text-muted-foreground">
          Si se define, al tocar el banner/popup se abrirá este enlace.
        </p>
      </div>

      <Button type="submit" className="w-full gap-2 rounded-full" disabled={!canSubmit || saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
        Agregar
      </Button>
    </form>
  );
}

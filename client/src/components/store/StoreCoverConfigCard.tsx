import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useUpdateStore } from "@/hooks/use-store-settings";
import { useToast } from "@/hooks/use-toast";
import {
  StoreCoverPhotoPicker,
  StoreCoverPreviewPanels,
} from "@/components/store/StoreCoverPhotoPicker";
import { uploadStoreCoverImage } from "@/lib/firebase-client";
import {
  resolveStoreImageDraftToAsset,
  revokeBlobPreview,
  singularDraftFromSavedFields,
  type StoreImageDraft,
} from "@/lib/store-image-draft";
import type { StoreImageTransform } from "@shared/store-image-asset";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { storeAdminSectionCardClass } from "@/components/store/store-admin-ui";

const COVER_ASPECT = 21 / 9;

type StoreCoverConfigCardProps = {
  storeId: number;
  slug: string;
  initialCoverImageUrl?: string | null;
  initialCoverImageOriginalUrl?: string | null;
  initialCoverImageTransform?: StoreImageTransform | null;
  disabled?: boolean;
};

export function StoreCoverConfigCard({
  storeId,
  slug,
  initialCoverImageUrl,
  initialCoverImageOriginalUrl,
  initialCoverImageTransform,
  disabled,
}: StoreCoverConfigCardProps) {
  const { toast } = useToast();
  const updateStore = useUpdateStore(storeId, slug);
  const [draft, setDraft] = useState<StoreImageDraft | null>(() =>
    singularDraftFromSavedFields({
      displayUrl: initialCoverImageUrl,
      originalUrl: initialCoverImageOriginalUrl,
      transform: initialCoverImageTransform,
    }),
  );
  const [savedKey, setSavedKey] = useState(
    () =>
      `${initialCoverImageUrl ?? ""}|${initialCoverImageOriginalUrl ?? ""}|${JSON.stringify(initialCoverImageTransform ?? null)}`,
  );
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    const key = `${initialCoverImageUrl ?? ""}|${initialCoverImageOriginalUrl ?? ""}|${JSON.stringify(initialCoverImageTransform ?? null)}`;
    if (key === savedKey) return;
    const current = draftRef.current;
    if (current?.pendingDisplayFile || current?.pendingOriginalFile) return;
    setSavedKey(key);
    if (current) {
      revokeBlobPreview(current.previewUrl);
      revokeBlobPreview(current.originalPreviewUrl);
    }
    setDraft(
      singularDraftFromSavedFields({
        displayUrl: initialCoverImageUrl,
        originalUrl: initialCoverImageOriginalUrl,
        transform: initialCoverImageTransform,
      }),
    );
  }, [
    initialCoverImageUrl,
    initialCoverImageOriginalUrl,
    initialCoverImageTransform,
    savedKey,
  ]);

  const dirty = Boolean(draft?.pendingDisplayFile || draft?.pendingOriginalFile) ||
    (draft?.savedDisplayUrl ?? null) !== (initialCoverImageUrl ?? null) ||
    (draft == null && Boolean(initialCoverImageUrl));

  async function handleSave() {
    try {
      if (!draft) {
        await updateStore.mutateAsync({
          coverImageUrl: null,
          coverImageOriginalUrl: null,
          coverImageTransform: null,
        });
        setSavedKey("|null|null");
        toast({ title: "Portada actualizada" });
        return;
      }
      const asset = await resolveStoreImageDraftToAsset(draft, (file, variant) =>
        uploadStoreCoverImage(storeId, file, variant),
      );
      if (!asset) {
        toast({
          variant: "destructive",
          title: "Imagen incompleta",
          description: "Recorta o selecciona una imagen válida.",
        });
        return;
      }
      await updateStore.mutateAsync({
        coverImageUrl: asset.displayUrl,
        coverImageOriginalUrl: asset.originalUrl || null,
        coverImageTransform: asset.transform,
      });
      revokeBlobPreview(draft.previewUrl);
      revokeBlobPreview(draft.originalPreviewUrl);
      const next = singularDraftFromSavedFields({
        displayUrl: asset.displayUrl,
        originalUrl: asset.originalUrl,
        transform: asset.transform,
      });
      setDraft(next);
      setSavedKey(
        `${asset.displayUrl}|${asset.originalUrl}|${JSON.stringify(asset.transform)}`,
      );
      toast({ title: "Portada actualizada" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "No se pudo guardar la portada",
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  }

  return (
    <Card className={storeAdminSectionCardClass}>
      <CardHeader>
        <CardTitle>Portada de la tienda</CardTitle>
        <CardDescription>
          Imagen principal del catálogo y la vitrina (marco 21:9).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <StoreCoverPhotoPicker
          label="Imagen de portada"
          draft={draft}
          onDraftChange={setDraft}
          disabled={disabled || updateStore.isPending}
          aspectRatio={COVER_ASPECT}
          previewAspectClass="aspect-[21/9]"
        />
        <StoreCoverPreviewPanels previewUrl={draft?.previewUrl ?? null} />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={disabled || updateStore.isPending || !dirty}
            onClick={() => void handleSave()}
          >
            {updateStore.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Guardar portada
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

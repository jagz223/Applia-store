import { useRef, useState } from "react";
import { ImagePlus, Link2, Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  SquareImageCropDialog,
  type SquareImageCropConfirmResult,
} from "@/components/store/SquareImageCropDialog";
import {
  applyCropResultToDraft,
  draftHasEditableOriginal,
  draftOriginalSource,
  emptyDraftFromOriginalFile,
  emptyDraftFromRemoteUrl,
  isLikelyImageUrl,
  revokeBlobPreview,
  type StoreImageDraft,
} from "@/lib/store-image-draft";
import { SQUARE_CROP_MAX_FILE_BYTES } from "@/lib/square-image-crop";
import { cn } from "@/lib/utils";

type StoreCoverPhotoPickerProps = {
  draft: StoreImageDraft | null;
  onDraftChange: (draft: StoreImageDraft | null) => void;
  disabled?: boolean;
  label?: string;
  aspectRatio?: number;
  enableFrameCrop?: boolean;
  previewAspectClass?: string;
};

export function StoreCoverPhotoPicker({
  draft,
  onDraftChange,
  disabled,
  label = "Foto de la tienda",
  aspectRatio = 4 / 3,
  enableFrameCrop = true,
  previewAspectClass = "aspect-[4/3]",
}: StoreCoverPhotoPickerProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropFileName, setCropFileName] = useState("imagen.png");
  const [cropMimeType, setCropMimeType] = useState<string | undefined>("image/png");
  const [cropOpen, setCropOpen] = useState(false);
  const [pendingOriginalDraft, setPendingOriginalDraft] = useState<StoreImageDraft | null>(null);

  const previewUrl = draft?.previewUrl ?? null;
  const unsaved = Boolean(draft?.pendingDisplayFile || draft?.pendingOriginalFile);

  function replaceDraft(next: StoreImageDraft | null) {
    if (draft) {
      if (!next || draft.previewUrl !== next.previewUrl) revokeBlobPreview(draft.previewUrl);
      if (
        draft.originalPreviewUrl &&
        (!next ||
          (draft.originalPreviewUrl !== next.originalPreviewUrl &&
            draft.originalPreviewUrl !== next.previewUrl))
      ) {
        revokeBlobPreview(draft.originalPreviewUrl);
      }
    }
    onDraftChange(next);
  }

  function handleRemove() {
    if (disabled) return;
    replaceDraft(null);
    setUrlInput("");
  }

  function openCropper(src: string, fileName: string, mimeType: string | undefined, base: StoreImageDraft) {
    setPendingOriginalDraft(base);
    setCropSrc(src);
    setCropFileName(fileName);
    setCropMimeType(mimeType);
    setCropOpen(true);
  }

  function closeCropper(keepPendingOriginal = false) {
    if (!keepPendingOriginal && cropSrc?.startsWith("blob:")) {
      const keep =
        pendingOriginalDraft?.originalPreviewUrl === cropSrc ||
        draft?.originalPreviewUrl === cropSrc ||
        draft?.previewUrl === cropSrc;
      if (!keep) revokeBlobPreview(cropSrc);
    }
    if (!keepPendingOriginal) setPendingOriginalDraft(null);
    setCropOpen(false);
    setCropSrc(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function applyCropResult(result: SquareImageCropConfirmResult) {
    const base =
      pendingOriginalDraft ?? draft ?? emptyDraftFromRemoteUrl(cropSrc ?? "");
    replaceDraft(applyCropResultToDraft(base, result));
    closeCropper(true);
    setPendingOriginalDraft(null);
  }

  function applyWithoutCrop(file: File) {
    const originalPreviewUrl = URL.createObjectURL(file);
    replaceDraft({
      previewUrl: originalPreviewUrl,
      originalPreviewUrl,
      pendingOriginalFile: file,
      pendingDisplayFile: file,
    });
    setUrlInput("");
  }

  async function handleFile(file: File | null) {
    if (!file || disabled) return;
    if (!file.type.startsWith("image/")) {
      toast({
        variant: "destructive",
        title: "Archivo inválido",
        description: "Selecciona una imagen JPG, PNG, WebP o GIF.",
      });
      return;
    }
    if (file.size > SQUARE_CROP_MAX_FILE_BYTES) {
      toast({
        variant: "destructive",
        title: "Archivo muy grande",
        description: "Máximo 200 MB por imagen.",
      });
      return;
    }
    if (!enableFrameCrop) {
      applyWithoutCrop(file);
      return;
    }
    const base = emptyDraftFromOriginalFile(file);
    openCropper(
      base.originalPreviewUrl!,
      file.name || "imagen.png",
      file.type || undefined,
      base,
    );
  }

  async function handleAddUrl() {
    const trimmed = urlInput.trim();
    if (!trimmed || disabled) return;
    if (!isLikelyImageUrl(trimmed)) {
      toast({
        variant: "destructive",
        title: "URL inválida",
        description: "Ingresa un enlace http o https a una imagen.",
      });
      return;
    }
    setUrlLoading(true);
    try {
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("No se pudo cargar la imagen desde esa URL."));
        img.src = trimmed;
      });
      if (!enableFrameCrop) {
        replaceDraft(emptyDraftFromRemoteUrl(trimmed));
        setUrlInput("");
        return;
      }
      const fromUrl = trimmed.split("?")[0]?.split("/").pop() || "imagen.png";
      const safeName = /\.(png|jpe?g|webp|gif)$/i.test(fromUrl) ? fromUrl : "imagen.png";
      const base = emptyDraftFromRemoteUrl(trimmed);
      openCropper(
        trimmed,
        safeName,
        safeName.toLowerCase().endsWith(".png")
          ? "image/png"
          : safeName.toLowerCase().endsWith(".webp")
            ? "image/webp"
            : undefined,
        base,
      );
      setUrlInput("");
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo previsualizar",
        description: e instanceof Error ? e.message : "Verifica que la URL sea pública.",
      });
    } finally {
      setUrlLoading(false);
    }
  }

  function handleRecrop() {
    if (!draft) return;
    if (!draftHasEditableOriginal(draft)) {
      toast({
        variant: "destructive",
        title: "Sin original",
        description: "Esta imagen se guardó sin original. Vuelve a subir el archivo para recortar.",
      });
      return;
    }
    const src = draftOriginalSource(draft);
    if (!src) return;
    const fileName =
      draft.pendingOriginalFile?.name ??
      (/\.png(\?|$)/i.test(src)
        ? "imagen.png"
        : /\.webp(\?|$)/i.test(src)
          ? "imagen.webp"
          : "imagen.png");
    openCropper(src, fileName, draft.pendingOriginalFile?.type, draft);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="max-w-md">
          {previewUrl ? (
            <div
              className={cn(
                "relative rounded-lg border border-border overflow-hidden bg-muted/30",
                previewAspectClass,
              )}
            >
              <img src={previewUrl} alt="" className="h-full w-full object-cover" />
              {unsaved ? (
                <span className="absolute bottom-2 left-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  Sin guardar
                </span>
              ) : null}
              <button
                type="button"
                className="absolute top-2 right-2 rounded-full bg-background/90 p-1.5 shadow hover:bg-background disabled:opacity-50"
                aria-label="Quitar vista previa"
                disabled={disabled}
                onClick={handleRemove}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={disabled}
              className={cn(
                "w-full rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-2",
                previewAspectClass,
                "text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors",
                disabled && "opacity-60 pointer-events-none",
              )}
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus className="h-8 w-8" />
              <span className="text-sm">Subir imagen</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 max-w-md">
        <Input
          type="url"
          placeholder="https://… enlace a imagen"
          value={urlInput}
          disabled={disabled || urlLoading}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleAddUrl();
            }
          }}
        />
        <Button
          type="button"
          className="shrink-0 gap-1.5"
          disabled={disabled || urlLoading || !urlInput.trim()}
          onClick={() => void handleAddUrl()}
        >
          {urlLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Previsualizar URL
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {previewUrl ? "Cambiar archivo" : "Elegir archivo"}
        </Button>
        {enableFrameCrop && previewUrl ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={handleRecrop}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Recortar
          </Button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />

      <p className="text-xs text-muted-foreground">
        {enableFrameCrop
          ? "Al subir se abre el recorte. Los cambios se aplican al pulsar «Guardar»."
          : "Sube un archivo o pega una URL para ver la vista previa. Los cambios se aplican al pulsar «Guardar»."}{" "}
        JPG, PNG, WebP o GIF. Máximo 200 MB por archivo.
      </p>

      {enableFrameCrop ? (
        <SquareImageCropDialog
          open={cropOpen}
          onOpenChange={(open) => {
            if (!open) closeCropper();
            else setCropOpen(true);
          }}
          imageSrc={cropSrc}
          fileName={cropFileName}
          fileMimeType={cropMimeType}
          aspectRatio={aspectRatio}
          initialTransform={pendingOriginalDraft?.transform ?? draft?.transform ?? null}
          onConfirm={applyCropResult}
        />
      ) : null}
    </div>
  );
}

export function StoreCoverPreviewPanels({ previewUrl }: { previewUrl: string | null }) {
  if (!previewUrl) return null;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
      <p className="text-sm font-medium">Así se verá</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">En la vitrina</p>
          <div className="relative aspect-[21/9] max-h-32 w-full overflow-hidden rounded-lg border border-border bg-muted/30">
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">En el catálogo de tiendas</p>
          <div className="relative aspect-square max-w-[140px] overflow-hidden rounded-lg border border-border bg-muted/30">
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          </div>
        </div>
      </div>
    </div>
  );
}

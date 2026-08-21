import { useRef, useState } from "react";
import { ImageIcon, ImagePlus, Link2, Loader2, Pencil, X } from "lucide-react";
import { STORE_PRODUCT_MAX_IMAGES } from "@shared/store-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { SquareImageCropDialog } from "@/components/store/SquareImageCropDialog";
import {
  isLikelyImageUrl,
  revokeBlobPreview,
  type StoreImageDraft,
} from "@/lib/store-image-draft";
import { SQUARE_CROP_MAX_FILE_BYTES } from "@/lib/square-image-crop";
import { cn } from "@/lib/utils";

export function StoreProductPhotosPicker({
  drafts,
  onChange,
  disabled,
}: {
  drafts: StoreImageDraft[];
  onChange: (drafts: StoreImageDraft[]) => void;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropFileName, setCropFileName] = useState("producto.jpg");
  const [cropOpen, setCropOpen] = useState(false);

  const draft = drafts[0] ?? null;
  const hasImage = draft != null;

  function clearDraft() {
    if (draft) revokeBlobPreview(draft.previewUrl);
    onChange([]);
  }

  function openCropper(src: string, fileName: string) {
    setCropSrc(src);
    setCropFileName(fileName);
    setCropOpen(true);
  }

  function closeCropper() {
    if (cropSrc?.startsWith("blob:") && cropSrc !== draft?.previewUrl) {
      revokeBlobPreview(cropSrc);
    }
    setCropOpen(false);
    setCropSrc(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function applyCroppedFile(file: File) {
    if (draft) revokeBlobPreview(draft.previewUrl);
    onChange([{ previewUrl: URL.createObjectURL(file), pendingFile: file }]);
    closeCropper();
  }

  function handleFileSelect(files: FileList | null) {
    if (!files?.length || disabled) return;
    const file = files[0];
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
        description: "Máximo 5 MB por imagen.",
      });
      return;
    }
    openCropper(URL.createObjectURL(file), file.name.replace(/\.\w+$/, "") + ".jpg");
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
      openCropper(trimmed, "producto-url.jpg");
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

  function handleReplace() {
    inputRef.current?.click();
  }

  function handleEditCrop() {
    if (!draft) return;
    openCropper(draft.previewUrl, draft.pendingFile?.name ?? "producto.jpg");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label>Foto del producto</Label>
        <span className="text-xs text-muted-foreground">
          {hasImage ? 1 : 0}/{STORE_PRODUCT_MAX_IMAGES}
        </span>
      </div>

      {hasImage ? (
        <div className="space-y-3">
          <div className="relative mx-auto max-w-[200px] aspect-square rounded-lg border border-border overflow-hidden bg-muted/30">
            <img src={draft.previewUrl} alt="" className="h-full w-full object-cover" />
            {draft.pendingFile ? (
              <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                Sin guardar
              </span>
            ) : null}
            <button
              type="button"
              className="absolute top-1 right-1 rounded-full bg-background/90 p-1 shadow hover:bg-background disabled:opacity-50"
              aria-label="Quitar foto"
              disabled={disabled}
              onClick={clearDraft}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={disabled}
              onClick={handleReplace}
            >
              <ImagePlus className="mr-2 h-4 w-4" />
              Cambiar foto
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={disabled}
              onClick={handleEditCrop}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Recortar de nuevo
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "mx-auto flex aspect-square w-full max-w-[200px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border",
            "text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary",
            disabled && "pointer-events-none opacity-60",
          )}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="h-8 w-8" />
          <span className="text-xs px-2 text-center leading-tight">Subir foto cuadrada</span>
        </button>
      )}

      {hasImage ? (
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Vista previa en vitrina</p>
          <div className="max-w-[160px]">
            <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted/30">
              <img src={draft.previewUrl} alt="" className="h-full w-full object-cover" />
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-4 flex items-center gap-3 text-muted-foreground">
          <ImageIcon className="h-8 w-8 shrink-0" />
          <p className="text-xs">
            Sube una foto cuadrada para ver cómo se verá el producto en la vitrina.
          </p>
        </div>
      )}

      {!hasImage ? (
        <div className="flex flex-col sm:flex-row gap-2">
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
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      <p className="text-xs text-muted-foreground">
        Al subir se abre el recorte cuadrado. Se guarda al pulsar «Guardar» o «Crear».
        JPG, PNG, WebP o GIF. Máximo 5 MB.
      </p>

      <SquareImageCropDialog
        open={cropOpen}
        onOpenChange={(open) => {
          if (!open) closeCropper();
          else setCropOpen(true);
        }}
        imageSrc={cropSrc}
        fileName={cropFileName}
        onConfirm={applyCroppedFile}
      />
    </div>
  );
}

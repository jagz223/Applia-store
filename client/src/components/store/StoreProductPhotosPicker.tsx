import { useRef, useState } from "react";
import { ImageIcon, ImagePlus, Link2, Loader2, Pencil, X } from "lucide-react";
import { STORE_PRODUCT_MAX_IMAGES } from "@shared/store-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { SquareImageCropDialog } from "@/components/store/SquareImageCropDialog";
import { StoreProductDualImage } from "@/components/store/StoreProductDualImage";
import {
  isLikelyImageUrl,
  revokeBlobPreview,
  type StoreImageDraft,
} from "@/lib/store-image-draft";
import { SQUARE_CROP_MAX_FILE_BYTES } from "@/lib/square-image-crop";
import { cn } from "@/lib/utils";

const SLOT_LABELS = ["Foto principal", "Segunda imagen"] as const;

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
  const [cropFileName, setCropFileName] = useState("producto.png");
  const [cropOpen, setCropOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState(0);

  const primary = drafts[0] ?? null;
  const secondary = drafts[1] ?? null;
  const count = drafts.filter(Boolean).length;

  function setSlot(index: number, next: StoreImageDraft | null) {
    if (next == null) {
      if (index === 0) {
        if (drafts[0]) revokeBlobPreview(drafts[0].previewUrl);
        // Si había segunda, pasa a ser principal
        onChange(drafts.slice(1));
        return;
      }
      if (drafts[index]) revokeBlobPreview(drafts[index]!.previewUrl);
      onChange(drafts.filter((_, i) => i !== index));
      return;
    }
    if (index === 1 && drafts.length === 0) {
      revokeBlobPreview(next.previewUrl);
      toast({
        variant: "destructive",
        title: "Falta la foto principal",
        description: "Sube primero la imagen principal y luego la segunda.",
      });
      return;
    }
    if (drafts[index]) revokeBlobPreview(drafts[index]!.previewUrl);
    const copy = [...drafts];
    copy[index] = next;
    onChange(copy.slice(0, STORE_PRODUCT_MAX_IMAGES));
  }

  function openCropper(index: number, src: string, fileName: string) {
    setEditingIndex(index);
    setCropSrc(src);
    setCropFileName(fileName);
    setCropOpen(true);
  }

  function closeCropper() {
    const currentPreview = drafts[editingIndex]?.previewUrl;
    if (cropSrc?.startsWith("blob:") && cropSrc !== currentPreview) {
      revokeBlobPreview(cropSrc);
    }
    setCropOpen(false);
    setCropSrc(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function applyCroppedFile(file: File) {
    setSlot(editingIndex, {
      previewUrl: URL.createObjectURL(file),
      pendingFile: file,
    });
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
    openCropper(editingIndex, URL.createObjectURL(file), file.name || "producto.png");
  }

  async function handleAddUrl(index: number) {
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
      const fromUrl = trimmed.split("?")[0]?.split("/").pop() || "producto.png";
      const safeName = /\.(png|jpe?g|webp|gif)$/i.test(fromUrl) ? fromUrl : "producto.png";
      openCropper(index, trimmed, safeName);
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

  function renderSlot(index: 0 | 1) {
    const draft = drafts[index] ?? null;
    const label = SLOT_LABELS[index];
    const lockedSecondary = index === 1 && !primary;

    return (
      <div key={index} className="space-y-2 rounded-xl border border-border/70 bg-muted/10 p-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm">{label}</Label>
          {index === 1 ? (
            <span className="text-[10px] text-muted-foreground">Esquina inferior derecha</span>
          ) : null}
        </div>

        {draft ? (
          <div className="space-y-2">
            <div className="relative mx-auto max-w-[160px] aspect-square rounded-lg border border-border overflow-hidden bg-background">
              <img src={draft.previewUrl} alt="" className="h-full w-full object-cover" />
              {draft.pendingFile ? (
                <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  Sin guardar
                </span>
              ) : null}
              <button
                type="button"
                className="absolute top-1 right-1 rounded-full bg-background/90 p-1 shadow hover:bg-background disabled:opacity-50"
                aria-label={`Quitar ${label.toLowerCase()}`}
                disabled={disabled}
                onClick={() => setSlot(index, null)}
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
                onClick={() => {
                  setEditingIndex(index);
                  inputRef.current?.click();
                }}
              >
                <ImagePlus className="mr-2 h-4 w-4" />
                Cambiar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={disabled}
                onClick={() =>
                  openCropper(
                    index,
                    draft.previewUrl,
                    draft.pendingFile?.name ??
                      (/\.png(\?|$)/i.test(draft.previewUrl)
                        ? "producto.png"
                        : /\.webp(\?|$)/i.test(draft.previewUrl)
                          ? "producto.webp"
                          : "producto.png"),
                  )
                }
              >
                <Pencil className="mr-2 h-4 w-4" />
                Recortar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              disabled={disabled || lockedSecondary}
              className={cn(
                "mx-auto flex aspect-square w-full max-w-[160px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border",
                "text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary",
                (disabled || lockedSecondary) && "pointer-events-none opacity-60",
              )}
              onClick={() => {
                setEditingIndex(index);
                inputRef.current?.click();
              }}
            >
              <ImagePlus className="h-7 w-7" />
              <span className="text-xs px-2 text-center leading-tight">
                {lockedSecondary ? "Primero sube la principal" : "Subir foto cuadrada"}
              </span>
            </button>
            {!lockedSecondary ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  type="url"
                  placeholder="https://… enlace a imagen"
                  value={editingIndex === index ? urlInput : ""}
                  disabled={disabled || urlLoading}
                  onFocus={() => setEditingIndex(index)}
                  onChange={(e) => {
                    setEditingIndex(index);
                    setUrlInput(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleAddUrl(index);
                    }
                  }}
                />
                <Button
                  type="button"
                  className="shrink-0 gap-1.5"
                  disabled={disabled || urlLoading || !urlInput.trim()}
                  onClick={() => {
                    setEditingIndex(index);
                    void handleAddUrl(index);
                  }}
                >
                  {urlLoading && editingIndex === index ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                  URL
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label>Fotos del producto</Label>
        <span className="text-xs text-muted-foreground">
          {count}/{STORE_PRODUCT_MAX_IMAGES}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {renderSlot(0)}
        {renderSlot(1)}
      </div>

      {primary ? (
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Vista previa en vitrina</p>
          <div className="max-w-[180px]">
            <StoreProductDualImage
              primaryUrl={primary.previewUrl}
              secondaryUrl={secondary?.previewUrl}
              frameClassName="aspect-square rounded-lg border border-border"
              secondaryClassName="h-10 w-10"
            />
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-4 flex items-center gap-3 text-muted-foreground">
          <ImageIcon className="h-8 w-8 shrink-0" />
          <p className="text-xs">
            La foto principal se ve grande; la segunda aparece como cuadrito abajo a la derecha.
          </p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      <p className="text-xs text-muted-foreground">
        Al subir se abre el recorte cuadrado. Se guarda al pulsar «Guardar» o «Crear». JPG, PNG, WebP
        o GIF. Máximo 5 MB por imagen.
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

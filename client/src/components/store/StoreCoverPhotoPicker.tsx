import { useRef, useState } from "react";
import { ImagePlus, Link2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { isLikelyImageUrl, revokeBlobPreview } from "@/lib/store-image-draft";
import { cn } from "@/lib/utils";

type StoreCoverPhotoPickerProps = {
  previewUrl: string | null;
  onPreviewChange: (url: string | null, pendingFile?: File | null) => void;
  disabled?: boolean;
  label?: string;
};

export function StoreCoverPhotoPicker({
  previewUrl,
  onPreviewChange,
  disabled,
  label = "Foto de la tienda",
}: StoreCoverPhotoPickerProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);

  function applyPreview(url: string | null, file?: File | null) {
    onPreviewChange(url, file ?? null);
  }

  function handleRemove() {
    if (disabled) return;
    revokeBlobPreview(previewUrl);
    applyPreview(null, null);
    setUrlInput("");
  }

  async function handleFile(file: File | null) {
    if (!file || disabled) return;
    revokeBlobPreview(previewUrl);
    const blobUrl = URL.createObjectURL(file);
    applyPreview(blobUrl, file);
    setUrlInput("");
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
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("No se pudo cargar la imagen desde esa URL."));
        img.src = trimmed;
      });
      revokeBlobPreview(previewUrl);
      applyPreview(trimmed, null);
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

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="max-w-md">
          {previewUrl ? (
            <div className="relative aspect-[4/3] rounded-lg border border-border overflow-hidden bg-muted/30">
              <img src={previewUrl} alt="" className="h-full w-full object-cover" />
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
                "aspect-[4/3] w-full rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-2",
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
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />

      <p className="text-xs text-muted-foreground">
        Sube un archivo o pega una URL para ver la vista previa. Los cambios se aplican al pulsar «Guardar».
        JPG, PNG, WebP o GIF. Máximo 5 MB por archivo.
      </p>
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

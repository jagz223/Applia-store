import { useRef, useState } from "react";
import { ImageIcon, ImagePlus, Link2, Loader2, X } from "lucide-react";
import { STORE_PRODUCT_MAX_IMAGES } from "@shared/store-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  isLikelyImageUrl,
  revokeBlobPreview,
  type StoreImageDraft,
} from "@/lib/store-image-draft";
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

  const slotsLeft = STORE_PRODUCT_MAX_IMAGES - drafts.length;

  function removeAt(index: number) {
    const removed = drafts[index];
    if (removed) revokeBlobPreview(removed.previewUrl);
    onChange(drafts.filter((_, i) => i !== index));
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length || slotsLeft <= 0 || disabled) return;
    const next = [...drafts];
    for (const file of Array.from(files).slice(0, slotsLeft)) {
      next.push({ previewUrl: URL.createObjectURL(file), pendingFile: file });
    }
    onChange(next.slice(0, STORE_PRODUCT_MAX_IMAGES));
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleAddUrl() {
    const trimmed = urlInput.trim();
    if (!trimmed || disabled || slotsLeft <= 0) return;
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
      onChange([...drafts, { previewUrl: trimmed }].slice(0, STORE_PRODUCT_MAX_IMAGES));
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

  const firstPreview = drafts[0]?.previewUrl ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label>Fotos del producto</Label>
        <span className="text-xs text-muted-foreground">
          {drafts.length}/{STORE_PRODUCT_MAX_IMAGES}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {drafts.map((draft, index) => (
          <div
            key={`${draft.previewUrl}-${index}`}
            className="relative aspect-square rounded-lg border border-border overflow-hidden bg-muted/30"
          >
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
              onClick={() => removeAt(index)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {slotsLeft > 0 ? (
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "aspect-square rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-1",
              "text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors",
              disabled && "opacity-60 pointer-events-none",
            )}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="h-6 w-6" />
            <span className="text-[10px] px-1 text-center leading-tight">Añadir</span>
          </button>
        ) : null}
      </div>

      {firstPreview ? (
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Vista previa en vitrina</p>
          <div className="max-w-[160px]">
            <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted/30">
              <img src={firstPreview} alt="" className="h-full w-full object-cover" />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              La primera foto es la principal en la vitrina.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-4 flex items-center gap-3 text-muted-foreground">
          <ImageIcon className="h-8 w-8 shrink-0" />
          <p className="text-xs">Añade fotos para ver cómo se verá el producto en la vitrina.</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          type="url"
          placeholder="https://… enlace a imagen"
          value={urlInput}
          disabled={disabled || urlLoading || slotsLeft <= 0}
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
          disabled={disabled || urlLoading || slotsLeft <= 0 || !urlInput.trim()}
          onClick={() => void handleAddUrl()}
        >
          {urlLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Previsualizar URL
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {drafts.length === 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Subir foto (máx. {STORE_PRODUCT_MAX_IMAGES})
        </Button>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Las fotos se guardan al pulsar «{disabled ? "…" : "Guardar"}» o «Crear» en el formulario.
        JPG, PNG, WebP o GIF. Máximo 5 MB por archivo.
      </p>
    </div>
  );
}

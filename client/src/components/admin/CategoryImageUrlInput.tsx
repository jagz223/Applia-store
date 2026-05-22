import { useRef, useState } from "react";
import { CategoryVisual } from "@/components/CategoryVisual";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useCategoryImageUrlValidation } from "@/hooks/use-category-image-url-validation";
import { uploadCategoryIconImage } from "@/lib/firebase-client";
import { verifyCategoryIconFile } from "@/lib/category-icon-image-verify";
import { cn } from "@/lib/utils";
import { Loader2, Upload } from "lucide-react";

type CategoryImageUrlInputProps = {
  label?: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  iconName: string;
  disabled?: boolean;
  showPreview?: boolean;
  inputClassName?: string;
};

export function CategoryImageUrlInput({
  label = "Imagen del icono (opcional)",
  hint = "Sube un PNG desde tu equipo o pega una URL que termine en .png. Debe tener fondo transparente real (sin blanco, gris ni cuadrícula).",
  value,
  onChange,
  iconName,
  disabled,
  showPreview = true,
  inputClassName,
}: CategoryImageUrlInputProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { status, message, displayUrl } = useCategoryImageUrlValidation(value);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const check = await verifyCategoryIconFile(file);
      if (!check.ok) {
        toast({
          variant: "destructive",
          title: "Imagen no válida",
          description: check.message,
        });
        return;
      }
      const url = await uploadCategoryIconImage(file);
      onChange(url);
      toast({
        title: "Imagen subida",
        description: "Icono PNG guardado. Pulsa Guardar en la categoría para aplicar los cambios.",
      });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Error al subir",
        description: e instanceof Error ? e.message : "No se pudo subir la imagen.",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,.png"
        className="hidden"
        disabled={disabled || uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={disabled || uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          Subir PNG
        </Button>
        <span className="text-xs text-muted-foreground sm:px-1">o URL</span>
        <Input
          placeholder="https://…/icono.png"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || uploading}
          className={cn("h-9 flex-1", inputClassName, status === "error" && "border-destructive")}
        />
      </div>

      <p className="text-[11px] text-muted-foreground">Máximo 2 MB. Solo formato PNG.</p>

      {status === "checking" && value.trim() ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Comprobando imagen…
        </p>
      ) : null}
      {status === "error" && message ? (
        <p className="text-xs font-medium text-destructive">{message}</p>
      ) : null}
      {showPreview ? (
        <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 p-2">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CategoryVisual
              iconName={iconName}
              imageUrl={displayUrl}
              className="h-6 w-6"
              imgClassName="h-8 w-8"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {displayUrl ? "Vista previa (PNG válido)" : "Vista previa: icono por defecto"}
          </span>
        </div>
      ) : null}
    </div>
  );
}

import { useMemo, useState } from "react";
import { AlertCircle, Loader2, Shirt, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type StoreAdminTryOnPanelProps = {
  storeId: number;
};

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_MB = 10;

const RESOLUTION_HINT =
  "Resolución recomendada: cuerpo ≥ 1080×1440 px (lado corto ≥ 1000 px); prenda ≥ 800–1000 px en el lado corto.";

async function fileToPayload(file: File): Promise<{ base64: string; mimeType: string }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Usa JPG, PNG o WebP.");
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    throw new Error(`La imagen no debe superar ${MAX_MB} MB.`);
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { base64: btoa(binary), mimeType: file.type };
}

function ImagePickSlot({
  label,
  hint,
  previewUrl,
  onPick,
  disabled,
  errorHighlight,
}: {
  label: string;
  hint: string;
  previewUrl: string | null;
  onPick: (file: File) => void;
  disabled?: boolean;
  errorHighlight?: boolean;
}) {
  const inputId = useMemo(() => `tryon-${label.replace(/\s+/g, "-").toLowerCase()}`, [label]);

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <label
        htmlFor={inputId}
        className={cn(
          "flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center transition-colors",
          "hover:border-primary/40 hover:bg-muted/50",
          errorHighlight && "border-destructive/60 bg-destructive/5",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="" className="max-h-52 w-full object-contain" />
        ) : (
          <>
            <Upload className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">{hint}</p>
          </>
        )}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function detectErrorImageKind(message: string): "person" | "garment" | null {
  const t = message.toLowerCase();
  if (t.includes("foto de cuerpo") || t.includes("foto de tu cuerpo")) return "person";
  if (t.includes("foto de la prenda")) return "garment";
  return null;
}

export function StoreAdminTryOnPanel({ storeId }: StoreAdminTryOnPanelProps) {
  const { toast } = useToast();
  const [personFile, setPersonFile] = useState<File | null>(null);
  const [garmentFile, setGarmentFile] = useState<File | null>(null);
  const [personPreview, setPersonPreview] = useState<string | null>(null);
  const [garmentPreview, setGarmentPreview] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const errorKind = errorMessage ? detectErrorImageKind(errorMessage) : null;

  const setPerson = (file: File) => {
    setPersonFile(file);
    setPersonPreview(URL.createObjectURL(file));
    setResultUrl(null);
    setErrorMessage(null);
  };

  const setGarment = (file: File) => {
    setGarmentFile(file);
    setGarmentPreview(URL.createObjectURL(file));
    setResultUrl(null);
    setErrorMessage(null);
  };

  const onGenerate = async () => {
    if (!personFile || !garmentFile) {
      const msg = "Sube la foto de cuerpo completo y la foto de la prenda.";
      setErrorMessage(msg);
      toast({
        title: "Faltan imágenes",
        description: msg,
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    setResultUrl(null);
    setErrorMessage(null);
    try {
      const person = await fileToPayload(personFile);
      const garment = await fileToPayload(garmentFile);
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/stores/${storeId}/try-on`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          personImageBase64: person.base64,
          personMimeType: person.mimeType,
          garmentImageBase64: garment.base64,
          garmentMimeType: garment.mimeType,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        resultImageUrl?: string;
      };
      if (!res.ok) {
        throw new Error(data.message || "No se pudo generar la simulación.");
      }
      if (!data.resultImageUrl) {
        throw new Error("La API no devolvió imagen de resultado.");
      }
      setResultUrl(data.resultImageUrl);
      toast({ title: "Simulación lista" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      setErrorMessage(msg);
      toast({
        title: "Error en simulación",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shirt className="h-5 w-5" />
            Simulación de ropa
          </CardTitle>
          <CardDescription>
            Sube una foto de cuerpo completo (o de cintura hacia arriba) y la foto de una prenda.
            La IA genera cómo te quedaría. Motor: Genlook (créditos gratis al registrarte en
            platform.genlook.app; configura GENLOOK_API_KEY en el servidor).{" "}
            {RESOLUTION_HINT}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <ImagePickSlot
              label="Foto de tu cuerpo"
              hint="Cuerpo completo o cintura hacia arriba · ≥ 1080×1440 px"
              previewUrl={personPreview}
              onPick={setPerson}
              disabled={loading}
              errorHighlight={errorKind === "person"}
            />
            <ImagePickSlot
              label="Foto de la prenda"
              hint="Flat-lay, maniquí o producto · lado corto ≥ 800–1000 px"
              previewUrl={garmentPreview}
              onPick={setGarment}
              disabled={loading}
              errorHighlight={errorKind === "garment"}
            />
          </div>

          {errorMessage ? (
            <div
              role="alert"
              className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p className="leading-relaxed">{errorMessage}</p>
            </div>
          ) : null}

          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={loading || !personFile || !garmentFile}
            onClick={() => void onGenerate()}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generando… (puede tardar ~10–30 s)
              </>
            ) : (
              "Generar simulación"
            )}
          </Button>

          {resultUrl ? (
            <div className="space-y-2">
              <Label>Resultado</Label>
              <div className="overflow-hidden rounded-xl border border-border bg-muted/20 p-3">
                <img
                  src={resultUrl}
                  alt="Resultado de simulación de ropa"
                  className="mx-auto max-h-[min(70vh,640px)] w-full object-contain"
                />
              </div>
              <a
                href={resultUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                Abrir imagen en pestaña nueva
              </a>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

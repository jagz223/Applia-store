import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { STORE_RUBROS, getStoreRubroLabel, isStoreRubroId } from "@shared/store-rubros";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  StoreCoverPhotoPicker,
  StoreCoverPreviewPanels,
} from "@/components/store/StoreCoverPhotoPicker";
import { useUpdateStore } from "@/hooks/use-store-settings";
import { useToast } from "@/hooks/use-toast";
import { uploadStoreCoverImage } from "@/lib/firebase-client";
import { revokeBlobPreview } from "@/lib/store-image-draft";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type StoreAdminConfigPanelProps = {
  storeId: number;
  slug: string;
  initialName: string;
  initialDescription: string | null;
  initialRubro: string | null;
  initialCoverImageUrl: string | null;
};

const NO_RUBRO = "__none__";

function StoreProfileCatalogPreview({
  name,
  description,
  rubro,
  coverImageUrl,
}: {
  name: string;
  description: string;
  rubro: string | null;
  coverImageUrl: string | null;
}) {
  const rubroLabel = getStoreRubroLabel(rubro);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2 max-w-xs">
      <p className="text-xs font-medium text-muted-foreground">Vista en el catálogo de tiendas</p>
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <div className="relative aspect-square bg-muted/40">
          {coverImageUrl ? (
            <img src={coverImageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Sin portada</div>
          )}
        </div>
        <div className="p-2.5 space-y-1">
          <p className="text-sm font-semibold line-clamp-2">{name.trim() || "Nombre de la tienda"}</p>
          {rubroLabel ? (
            <Badge variant="secondary" className="text-[10px] font-normal">
              {rubroLabel}
            </Badge>
          ) : null}
          {description.trim() ? (
            <p className="text-xs text-muted-foreground line-clamp-2">{description.trim()}</p>
          ) : (
            <p className="text-xs text-muted-foreground italic">Sin descripción</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function StoreAdminConfigPanel({
  storeId,
  slug,
  initialName,
  initialDescription,
  initialRubro,
  initialCoverImageUrl,
}: StoreAdminConfigPanelProps) {
  const { toast } = useToast();
  const updateStore = useUpdateStore(slug);

  const [savedName, setSavedName] = useState(initialName);
  const [savedDescription, setSavedDescription] = useState(initialDescription ?? "");
  const [savedRubro, setSavedRubro] = useState(initialRubro);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [rubro, setRubro] = useState<string | null>(initialRubro);

  const [savedUrl, setSavedUrl] = useState(initialCoverImageUrl);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialCoverImageUrl);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  useEffect(() => {
    setSavedName(initialName);
    setSavedDescription(initialDescription ?? "");
    setSavedRubro(initialRubro);
    setName(initialName);
    setDescription(initialDescription ?? "");
    setRubro(initialRubro);
    setSavedUrl(initialCoverImageUrl);
    setPreviewUrl(initialCoverImageUrl);
    setPendingFile(null);
  }, [initialName, initialDescription, initialRubro, initialCoverImageUrl]);

  const profileDirty =
    name.trim() !== savedName.trim() ||
    description.trim() !== savedDescription.trim() ||
    (rubro ?? null) !== (savedRubro ?? null);

  const coverDirty = pendingFile != null || (previewUrl ?? null) !== (savedUrl ?? null);

  function handlePreviewChange(url: string | null, file?: File | null) {
    if (previewUrl?.startsWith("blob:") && previewUrl !== url) {
      revokeBlobPreview(previewUrl);
    }
    setPreviewUrl(url);
    setPendingFile(file ?? null);
  }

  function discardCoverChanges() {
    if (previewUrl?.startsWith("blob:")) revokeBlobPreview(previewUrl);
    setPreviewUrl(savedUrl);
    setPendingFile(null);
  }

  function discardProfileChanges() {
    setName(savedName);
    setDescription(savedDescription);
    setRubro(savedRubro);
  }

  async function handleSaveProfile() {
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      toast({ variant: "destructive", title: "Nombre inválido", description: "Mínimo 2 caracteres." });
      return;
    }
    try {
      const store = await updateStore.mutateAsync({
        name: trimmedName,
        description: description.trim() || null,
        rubro: rubro && isStoreRubroId(rubro) ? rubro : null,
      });
      setSavedName(store.name ?? trimmedName);
      setSavedDescription(store.description ?? "");
      setSavedRubro(store.rubro ?? null);
      setName(store.name ?? trimmedName);
      setDescription(store.description ?? "");
      setRubro(store.rubro ?? null);
      toast({
        title: "Información guardada",
        description: "Nombre, descripción y rubro actualizados en el catálogo.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo guardar",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  async function handleSaveCover() {
    try {
      let coverImageUrl: string | null = previewUrl;
      if (pendingFile) {
        coverImageUrl = await uploadStoreCoverImage(storeId, pendingFile);
      }
      const store = await updateStore.mutateAsync({ coverImageUrl });
      const next = store.coverImageUrl ?? null;
      if (previewUrl?.startsWith("blob:")) revokeBlobPreview(previewUrl);
      setSavedUrl(next);
      setPreviewUrl(next);
      setPendingFile(null);
      toast({
        title: coverImageUrl ? "Foto guardada" : "Foto eliminada",
        description: "La portada ya está visible en el catálogo y la vitrina.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo guardar",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  const saving = updateStore.isPending;
  const previewCover = previewUrl ?? savedUrl;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Información de la tienda</CardTitle>
          <CardDescription>
            Nombre, descripción y rubro visibles en el catálogo de tiendas y la vitrina.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="store-name">Nombre</Label>
                <Input
                  id="store-name"
                  value={name}
                  maxLength={120}
                  disabled={saving}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="store-description">Descripción</Label>
                <Textarea
                  id="store-description"
                  value={description}
                  rows={4}
                  maxLength={500}
                  disabled={saving}
                  placeholder="Cuéntale a los visitantes qué vendes o qué te hace especial…"
                  onChange={(e) => setDescription(e.target.value)}
                />
                <p className="text-xs text-muted-foreground text-right">{description.length}/500</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="store-rubro">Rubro</Label>
                <Select
                  value={rubro ?? NO_RUBRO}
                  disabled={saving}
                  onValueChange={(v) => setRubro(v === NO_RUBRO ? null : v)}
                >
                  <SelectTrigger id="store-rubro">
                    <SelectValue placeholder="Selecciona un rubro" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_RUBRO}>Sin rubro</SelectItem>
                    {STORE_RUBROS.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <StoreProfileCatalogPreview
              name={name}
              description={description}
              rubro={rubro}
              coverImageUrl={previewCover}
            />
          </div>

          {profileDirty ? (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
              <Button type="button" disabled={saving} onClick={() => void handleSaveProfile()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Guardar información
              </Button>
              <Button type="button" variant="outline" disabled={saving} onClick={discardProfileChanges}>
                Descartar
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Portada</CardTitle>
          <CardDescription>Foto principal en el catálogo y banner de la vitrina.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <StoreCoverPhotoPicker
            previewUrl={previewUrl}
            disabled={saving}
            onPreviewChange={handlePreviewChange}
          />

          <StoreCoverPreviewPanels previewUrl={previewUrl} />

          {coverDirty ? (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
              <Button type="button" disabled={saving} onClick={() => void handleSaveCover()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Guardar portada
              </Button>
              <Button type="button" variant="outline" disabled={saving} onClick={discardCoverChanges}>
                Descartar
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

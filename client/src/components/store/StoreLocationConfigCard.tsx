import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, MapPin } from "lucide-react";
import type { StoreLocation } from "@shared/store-schema";
import { SingleLocationPicker, type PickedLocation } from "@/components/taxi/SingleLocationPicker";
import { useUpdateStore } from "@/hooks/use-store-settings";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { storeAdminSectionCardClass } from "@/components/store/store-admin-ui";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function toPickedLocation(location: StoreLocation | null): PickedLocation | null {
  if (!location) return null;
  return { lat: location.lat, lon: location.lon, label: location.label };
}

function locationsEqual(a: PickedLocation | null, b: PickedLocation | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.lat === b.lat && a.lon === b.lon && a.label.trim() === b.label.trim();
}

function locationFingerprint(location: StoreLocation | PickedLocation | null | undefined): string {
  if (!location) return "";
  return `${location.lat}|${location.lon}|${location.label.trim()}`;
}

type StoreLocationConfigCardProps = {
  slug: string;
  initialLocation: StoreLocation | null;
  disabled?: boolean;
};

export function StoreLocationConfigCard({
  slug,
  initialLocation,
  disabled,
}: StoreLocationConfigCardProps) {
  const { toast } = useToast();
  const updateStore = useUpdateStore(slug);
  const serverFingerprintRef = useRef(locationFingerprint(initialLocation));

  const [savedLocation, setSavedLocation] = useState<PickedLocation | null>(
    toPickedLocation(initialLocation),
  );
  const [location, setLocation] = useState<PickedLocation | null>(toPickedLocation(initialLocation));

  useEffect(() => {
    const fingerprint = locationFingerprint(initialLocation);
    if (fingerprint === serverFingerprintRef.current) return;
    serverFingerprintRef.current = fingerprint;
    const next = toPickedLocation(initialLocation);
    setSavedLocation(next);
    setLocation(next);
  }, [initialLocation]);

  const dirty = !locationsEqual(location, savedLocation);

  function discardChanges() {
    setLocation(savedLocation);
  }

  async function handleSave() {
    if (!location) {
      toast({
        variant: "destructive",
        title: "Ubicación obligatoria",
        description: "Selecciona un punto en el mapa o usa tu ubicación actual.",
      });
      return;
    }
    try {
      const payload: StoreLocation = {
        lat: location.lat,
        lon: location.lon,
        label: location.label.trim(),
      };
      const store = await updateStore.mutateAsync({ location: payload });
      const persisted = store.location ?? payload;
      const next = toPickedLocation(persisted);
      serverFingerprintRef.current = locationFingerprint(persisted);
      setSavedLocation(next);
      setLocation(next);
      toast({
        title: "Ubicación guardada",
        description: "La dirección de tu tienda quedó registrada.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo guardar",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  async function handleClear() {
    try {
      await updateStore.mutateAsync({ location: null });
      serverFingerprintRef.current = "";
      setSavedLocation(null);
      setLocation(null);
      toast({ title: "Ubicación eliminada" });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo eliminar",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  const saving = updateStore.isPending;

  return (
    <Card className={cn(storeAdminSectionCardClass, "overflow-hidden")}>
      <CardHeader className="space-y-1.5 px-4 pt-5 sm:px-6">
        <CardTitle className="flex items-center gap-2 font-display text-xl tracking-tight">
          <MapPin className="h-5 w-5" />
          Ubicación de la tienda
        </CardTitle>
        <CardDescription className="text-sm leading-snug">
          Indica dónde está tu negocio. Puedes usar tu ubicación actual o señalar un punto en el mapa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-5 sm:px-6">
        <SingleLocationPicker
          value={location}
          onChange={setLocation}
          fieldLabel="Dirección de la tienda"
          mapSize="default"
        />

        {savedLocation ? (
          <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
            <span className="line-clamp-2">{savedLocation.label}</span>
            <a
              href={`https://www.google.com/maps?q=${savedLocation.lat},${savedLocation.lon}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline shrink-0"
            >
              Ver en mapa <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Aún no has registrado la ubicación de la tienda.</p>
        )}

        <div className="flex flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row sm:flex-wrap sm:items-center">
          {dirty ? (
            <>
              <Button
                type="button"
                disabled={saving || disabled}
                className="h-11 rounded-full font-semibold"
                onClick={() => void handleSave()}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Guardar ubicación
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saving || disabled}
                className="h-11 rounded-full"
                onClick={discardChanges}
              >
                Descartar
              </Button>
            </>
          ) : null}
          {savedLocation ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-full border-destructive/35 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={saving || disabled}
              onClick={() => void handleClear()}
            >
              Quitar ubicación
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

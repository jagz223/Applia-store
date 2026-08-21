import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import {
  STORE_BRANCH_MAX,
  STORE_PRIMARY_BRANCH_ID,
  defaultStoreBranchName,
  normalizeStoreBranches,
  type StoreBranch,
  type StoreLocation,
} from "@shared/store-schema";
import { SingleLocationPicker, type PickedLocation } from "@/components/taxi/SingleLocationPicker";
import { useUpdateStore } from "@/hooks/use-store-settings";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { storeAdminFieldClass, storeAdminSectionCardClass } from "@/components/store/store-admin-ui";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function toPickedLocation(location: StoreLocation | null): PickedLocation | null {
  if (!location) return null;
  return { lat: location.lat, lon: location.lon, label: location.label };
}

function toStoreLocation(picked: PickedLocation): StoreLocation {
  return { lat: picked.lat, lon: picked.lon, label: picked.label.trim() };
}

function newBranchId(): string {
  return `br_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function branchFingerprint(branch: StoreBranch): string {
  const loc = branch.location;
  return `${branch.id}|${branch.name.trim()}|${loc ? `${loc.lat}|${loc.lon}|${loc.label.trim()}` : ""}`;
}

function branchesFingerprint(branches: StoreBranch[]): string {
  return branches.map(branchFingerprint).join("||");
}

type StoreLocationConfigCardProps = {
  storeId: number;
  slug: string;
  initialLocation: StoreLocation | null;
  initialBranches?: StoreBranch[] | null;
  disabled?: boolean;
};

export function StoreLocationConfigCard({
  storeId,
  slug,
  initialLocation,
  initialBranches,
  disabled,
}: StoreLocationConfigCardProps) {
  const { toast } = useToast();
  const updateStore = useUpdateStore(storeId, slug);
  const [savedBranches, setSavedBranches] = useState<StoreBranch[]>(() =>
    normalizeStoreBranches(initialBranches, initialLocation),
  );
  const [draftBranches, setDraftBranches] = useState<StoreBranch[]>(savedBranches);
  const [activeTab, setActiveTab] = useState(STORE_PRIMARY_BRANCH_ID);
  const serverFingerprintRef = useRef(branchesFingerprint(savedBranches));

  useEffect(() => {
    const next = normalizeStoreBranches(initialBranches, initialLocation);
    const fingerprint = branchesFingerprint(next);
    if (fingerprint === serverFingerprintRef.current) return;
    serverFingerprintRef.current = fingerprint;
    setSavedBranches(next);
    setDraftBranches(next);
    setActiveTab((prev) => (next.some((b) => b.id === prev) ? prev : STORE_PRIMARY_BRANCH_ID));
  }, [initialLocation, initialBranches]);

  const dirty = branchesFingerprint(draftBranches) !== branchesFingerprint(savedBranches);
  const active = draftBranches.find((b) => b.id === activeTab) ?? draftBranches[0];
  const isPrimary = active?.id === STORE_PRIMARY_BRANCH_ID;
  const activePicked = toPickedLocation(active?.location ?? null);

  const tabItems = useMemo(() => draftBranches, [draftBranches]);

  function discardChanges() {
    setDraftBranches(savedBranches);
    setActiveTab((prev) =>
      savedBranches.some((b) => b.id === prev) ? prev : STORE_PRIMARY_BRANCH_ID,
    );
  }

  function addBranch() {
    if (draftBranches.length >= STORE_BRANCH_MAX) return;
    const id = newBranchId();
    const next: StoreBranch = {
      id,
      name: defaultStoreBranchName(draftBranches.length),
      location: null,
    };
    setDraftBranches((prev) => [...prev, next]);
    setActiveTab(id);
  }

  function removeActiveBranch() {
    if (!active || isPrimary) return;
    setDraftBranches((prev) => prev.filter((b) => b.id !== active.id));
    setActiveTab(STORE_PRIMARY_BRANCH_ID);
  }

  async function handleSave() {
    for (const branch of draftBranches) {
      if (branch.id !== STORE_PRIMARY_BRANCH_ID && !branch.location) {
        toast({
          variant: "destructive",
          title: "Ubicación obligatoria",
          description: `Selecciona el punto de «${branch.name.trim() || "la sucursal extra"}» en el mapa.`,
        });
        setActiveTab(branch.id);
        return;
      }
      if (!branch.name.trim()) {
        toast({
          variant: "destructive",
          title: "Nombre obligatorio",
          description: "Cada sucursal necesita un nombre.",
        });
        setActiveTab(branch.id);
        return;
      }
    }

    const payload = draftBranches.map((b) => ({
      id: b.id,
      name: b.name.trim() || defaultStoreBranchName(0),
      location: b.location,
    }));

    try {
      const store = await updateStore.mutateAsync({
        location: payload[0]?.location ?? null,
        branches: payload,
      });
      const persisted = normalizeStoreBranches(store.branches, store.location ?? null);
      serverFingerprintRef.current = branchesFingerprint(persisted);
      setSavedBranches(persisted);
      setDraftBranches(persisted);
      setActiveTab((prev) => (persisted.some((b) => b.id === prev) ? prev : STORE_PRIMARY_BRANCH_ID));
      toast({
        title: "Sucursales guardadas",
        description: "Las ubicaciones de tus sucursales quedaron registradas.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo guardar",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  async function handleClearPrimary() {
    const next = draftBranches.map((b) =>
      b.id === STORE_PRIMARY_BRANCH_ID ? { ...b, location: null } : b,
    );
    setDraftBranches(next);
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
          La primera pestaña es tu sucursal principal. Agrega sucursales extra si tienes más locales.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-5 sm:px-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <TabsList className="flex h-auto min-w-0 flex-1 flex-wrap justify-start gap-1 p-1">
              {tabItems.map((branch, index) => (
                <TabsTrigger
                  key={branch.id}
                  value={branch.id}
                  className="min-w-[6.5rem] rounded-full"
                >
                  {branch.name.trim() || defaultStoreBranchName(index)}
                </TabsTrigger>
              ))}
            </TabsList>
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0 rounded-full"
              disabled={disabled || saving || draftBranches.length >= STORE_BRANCH_MAX}
              onClick={addBranch}
            >
              <Plus className="mr-2 h-4 w-4" />
              Agregar sucursal
            </Button>
          </div>

          {tabItems.map((branch, index) => (
            <TabsContent key={branch.id} value={branch.id} className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor={`branch-name-${branch.id}`}>Nombre de la sucursal</Label>
                <Input
                  id={`branch-name-${branch.id}`}
                  className={storeAdminFieldClass}
                  value={branch.name}
                  maxLength={80}
                  disabled={disabled || saving}
                  onChange={(e) =>
                    setDraftBranches((prev) =>
                      prev.map((b) => (b.id === branch.id ? { ...b, name: e.target.value } : b)),
                    )
                  }
                />
              </div>

              <SingleLocationPicker
                value={toPickedLocation(branch.location)}
                onChange={(next) =>
                  setDraftBranches((prev) =>
                    prev.map((b) =>
                      b.id === branch.id
                        ? { ...b, location: next ? toStoreLocation(next) : null }
                        : b,
                    ),
                  )
                }
                fieldLabel={
                  branch.id === STORE_PRIMARY_BRANCH_ID
                    ? "Dirección de la sucursal principal"
                    : "Dirección de la sucursal"
                }
                mapSize="default"
              />

              {branch.location ? (
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="line-clamp-2">{branch.location.label}</span>
                  <a
                    href={`https://www.google.com/maps?q=${branch.location.lat},${branch.location.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
                  >
                    Ver en mapa <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {index === 0
                    ? "Aún no has registrado la ubicación de esta sucursal."
                    : "Esta sucursal extra necesita una ubicación para guardarse."}
                </p>
              )}
            </TabsContent>
          ))}
        </Tabs>

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
                Guardar sucursales
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
          {isPrimary && activePicked ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-full border-destructive/35 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={saving || disabled}
              onClick={() => void handleClearPrimary()}
            >
              Quitar ubicación
            </Button>
          ) : null}
          {!isPrimary && active ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-full border-destructive/35 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={saving || disabled}
              onClick={removeActiveBranch}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Quitar sucursal
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

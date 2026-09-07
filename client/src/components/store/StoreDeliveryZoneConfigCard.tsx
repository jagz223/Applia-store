import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import {
  STORE_PRIMARY_BRANCH_ID,
  defaultStoreBranchName,
  normalizeStoreBranches,
  type StoreBranch,
  type StoreDeliveryAvoidSegment,
  type StoreLocation,
} from "@shared/store-schema";
import { StoreDeliveryPerimeterMap } from "@/components/store/StoreDeliveryPerimeterMap";
import { StoreDeliveryAvoidSegmentsMap } from "@/components/store/StoreDeliveryAvoidSegmentsMap";
import { useUpdateStore } from "@/hooks/use-store-settings";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { storeAdminSectionCardClass } from "@/components/store/store-admin-ui";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ZoneTool = "perimeter" | "avoid";

function perimeterFingerprint(points: Array<{ lat: number; lon: number }> | null | undefined): string {
  return (points ?? []).map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join("|");
}

function avoidFingerprint(segments: StoreDeliveryAvoidSegment[] | null | undefined): string {
  return (segments ?? [])
    .map((s) => {
      const path = (s.path ?? []).map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join("~");
      return `${s.id}:${s.a.lat.toFixed(6)},${s.a.lon.toFixed(6)}>${s.b.lat.toFixed(6)},${s.b.lon.toFixed(6)}#${path}`;
    })
    .join("|");
}

function branchesZoneFingerprint(branches: StoreBranch[]): string {
  return branches
    .map(
      (b) =>
        `${b.id}:p=${perimeterFingerprint(b.deliveryPerimeter)}:a=${avoidFingerprint(b.deliveryAvoidSegments)}`,
    )
    .join("||");
}

type StoreDeliveryZoneConfigCardProps = {
  storeId: number;
  slug: string;
  initialLocation: StoreLocation | null;
  initialBranches?: StoreBranch[] | null;
  disabled?: boolean;
};

export function StoreDeliveryZoneConfigCard({
  storeId,
  slug,
  initialLocation,
  initialBranches,
  disabled,
}: StoreDeliveryZoneConfigCardProps) {
  const { toast } = useToast();
  const updateStore = useUpdateStore(storeId, slug);
  const [savedBranches, setSavedBranches] = useState<StoreBranch[]>(() =>
    normalizeStoreBranches(initialBranches, initialLocation),
  );
  const [draftBranches, setDraftBranches] = useState<StoreBranch[]>(savedBranches);
  const [activeTab, setActiveTab] = useState(STORE_PRIMARY_BRANCH_ID);
  const [tool, setTool] = useState<ZoneTool>("perimeter");
  const serverFingerprintRef = useRef(branchesZoneFingerprint(savedBranches));

  useEffect(() => {
    const next = normalizeStoreBranches(initialBranches, initialLocation);
    const fingerprint = branchesZoneFingerprint(next);
    if (fingerprint === serverFingerprintRef.current) return;
    serverFingerprintRef.current = fingerprint;
    setSavedBranches(next);
    setDraftBranches(next);
    setActiveTab((prev) => (next.some((b) => b.id === prev) ? prev : STORE_PRIMARY_BRANCH_ID));
  }, [initialLocation, initialBranches]);

  const dirty =
    branchesZoneFingerprint(draftBranches) !== branchesZoneFingerprint(savedBranches);
  const tabItems = useMemo(() => draftBranches, [draftBranches]);
  const saving = updateStore.isPending;

  function updateBranchPerimeter(branchId: string, points: Array<{ lat: number; lon: number }>) {
    setDraftBranches((prev) =>
      prev.map((b) =>
        b.id === branchId
          ? { ...b, deliveryPerimeter: points.length > 0 ? points : null }
          : b,
      ),
    );
  }

  function updateBranchAvoidSegments(branchId: string, segments: StoreDeliveryAvoidSegment[]) {
    setDraftBranches((prev) =>
      prev.map((b) =>
        b.id === branchId
          ? { ...b, deliveryAvoidSegments: segments.length > 0 ? segments : null }
          : b,
      ),
    );
  }

  function discardChanges() {
    setDraftBranches(savedBranches);
    setActiveTab((prev) =>
      savedBranches.some((b) => b.id === prev) ? prev : STORE_PRIMARY_BRANCH_ID,
    );
  }

  async function handleSave() {
    for (const branch of draftBranches) {
      const peri = branch.deliveryPerimeter ?? [];
      if (peri.length > 0 && peri.length < 3) {
        toast({
          variant: "destructive",
          title: "Perímetro incompleto",
          description: `«${branch.name}» necesita al menos 3 puntos, o limpia el mapa.`,
        });
        setActiveTab(branch.id);
        setTool("perimeter");
        return;
      }
    }

    const payload = draftBranches.map((b) => {
      const peri = b.deliveryPerimeter ?? [];
      const avoids = b.deliveryAvoidSegments ?? [];
      return {
        id: b.id,
        name: b.name.trim() || defaultStoreBranchName(0),
        location: b.location,
        deliveryPerimeter: peri.length >= 3 ? peri : null,
        deliveryAvoidSegments: avoids.length > 0 ? avoids : null,
      };
    });

    try {
      const store = await updateStore.mutateAsync({
        location: payload[0]?.location ?? null,
        branches: payload,
      });
      const persisted = normalizeStoreBranches(store.branches, store.location ?? null);
      serverFingerprintRef.current = branchesZoneFingerprint(persisted);
      setSavedBranches(persisted);
      setDraftBranches(persisted);
      setActiveTab((prev) => (persisted.some((b) => b.id === prev) ? prev : STORE_PRIMARY_BRANCH_ID));
      toast({
        title: "Zona de delivery guardada",
        description: "Perímetro y tramos a evitar quedaron actualizados.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo guardar",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  return (
    <Card className={cn(storeAdminSectionCardClass, "overflow-hidden")}>
      <CardHeader className="space-y-1.5 px-4 pt-5 sm:px-6">
        <CardTitle className="font-display text-xl tracking-tight">Zona de delivery</CardTitle>
        <CardDescription className="text-sm leading-snug">
          Define el perímetro de cobertura y los tramos que la ruta preferirá evitar. Sin perímetro
          no hay restricción de zona; los tramos no bloquean el pedido, solo desvían la ruta si hay
          alternativa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-5 sm:px-6">
        {draftBranches.every((b) => !b.location) ? (
          <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Configura primero la ubicación de al menos una sucursal en Configuraciones de tienda.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={tool === "perimeter" ? "default" : "outline"}
            className="h-10 rounded-full"
            onClick={() => setTool("perimeter")}
          >
            Perímetro
          </Button>
          <Button
            type="button"
            variant={tool === "avoid" ? "default" : "outline"}
            className="h-10 rounded-full"
            onClick={() => setTool("avoid")}
          >
            Tramos a evitar
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex h-auto min-w-0 flex-wrap justify-start gap-1 p-1">
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

          {tabItems.map((branch) => {
            const peri = branch.deliveryPerimeter ?? [];
            const avoids = branch.deliveryAvoidSegments ?? [];
            return (
              <TabsContent key={branch.id} value={branch.id} className="mt-4 space-y-3">
                {!branch.location ? (
                  <p className="text-sm text-muted-foreground">
                    Esta sucursal aún no tiene ubicación en el mapa.
                  </p>
                ) : null}

                {tool === "perimeter" ? (
                  <>
                    <StoreDeliveryPerimeterMap
                      branchLocation={branch.location}
                      points={peri}
                      disabled={disabled || saving || !branch.location}
                      onChange={(points) => updateBranchPerimeter(branch.id, points)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-full"
                        disabled={disabled || saving || peri.length === 0}
                        onClick={() =>
                          updateBranchPerimeter(
                            branch.id,
                            peri.length <= 1 ? [] : peri.slice(0, -1),
                          )
                        }
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Deshacer punto
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-full text-destructive hover:text-destructive"
                        disabled={disabled || saving || peri.length === 0}
                        onClick={() => updateBranchPerimeter(branch.id, [])}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Limpiar
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <StoreDeliveryAvoidSegmentsMap
                      branchLocation={branch.location}
                      perimeterPoints={peri.length >= 3 ? peri : null}
                      segments={avoids}
                      disabled={disabled || saving || !branch.location}
                      onChange={(next) => updateBranchAvoidSegments(branch.id, next)}
                    />
                    {avoids.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 rounded-full text-destructive hover:text-destructive"
                          disabled={disabled || saving}
                          onClick={() => updateBranchAvoidSegments(branch.id, [])}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Limpiar todos
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </TabsContent>
            );
          })}
        </Tabs>

        {dirty ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
            <Button
              type="button"
              className="h-11 rounded-full font-semibold"
              disabled={saving || disabled}
              onClick={() => void handleSave()}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Guardar zona
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-full"
              disabled={saving}
              onClick={discardChanges}
            >
              Descartar
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

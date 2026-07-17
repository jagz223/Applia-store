import { useQuery } from "@tanstack/react-query";
const DAY = 1000 * 60 * 60 * 24;

async function fetchVehiclesDbMakes(): Promise<string[]> {
  const r = await fetch("/api/vehiclesdb/makes");
  if (!r.ok) throw new Error("No se pudieron cargar las marcas (VehiclesDB)");
  const j = (await r.json()) as unknown;
  if (!Array.isArray(j)) return [];
  return j.map((x) => String(x ?? "").trim()).filter(Boolean);
}

async function fetchVehiclesDbModels(makeName: string): Promise<string[]> {
  const enc = encodeURIComponent(makeName.trim());
  const r = await fetch(`/api/vehiclesdb/models?make=${enc}`);
  if (!r.ok) throw new Error("No se pudieron cargar los modelos (VehiclesDB)");
  const j = (await r.json()) as unknown;
  if (!Array.isArray(j)) return [];
  return j.map((x) => String(x ?? "").trim()).filter(Boolean);
}

export function useNhtsaMakes() {
  return useQuery({
    queryKey: ["vehiclesdb", "makes"],
    queryFn: fetchVehiclesDbMakes,
    staleTime: DAY,
    gcTime: DAY * 7,
    retry: 1,
  });
}

export function useNhtsaModelsForMake(makeName: string | undefined | null) {
  const name = makeName?.trim();
  return useQuery({
    queryKey: ["vehiclesdb", "models", name],
    queryFn: () => fetchVehiclesDbModels(name!),
    enabled: Boolean(name),
    staleTime: DAY,
    gcTime: DAY * 7,
    retry: 1,
  });
}

export function useNhtsaYearsForMakeModel(
  makeName: string | undefined | null,
  modelName: string | undefined | null
) {
  const make = makeName?.trim();
  const model = modelName?.trim();
  return useQuery({
    queryKey: ["api", "vehicle-years", make, model],
    queryFn: async () => {
      const url = `/api/vehicle-years?make=${encodeURIComponent(make!)}&model=${encodeURIComponent(model!)}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error("No se pudieron cargar los años");
      const j = (await r.json()) as unknown;
      if (!Array.isArray(j)) return [];
      return j.map((x) => Number(x)).filter((n) => Number.isFinite(n));
    },
    enabled: Boolean(make && model),
    staleTime: DAY,
    gcTime: DAY * 7,
    retry: 0,
  });
}

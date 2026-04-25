import { useQuery } from "@tanstack/react-query";
import { fetchAllMakes, fetchModelsForMake, fetchYearsForMakeAndModel } from "@/lib/nhtsa-vpic";

const DAY = 1000 * 60 * 60 * 24;

export function useNhtsaMakes() {
  return useQuery({
    queryKey: ["nhtsa", "makes"],
    queryFn: fetchAllMakes,
    staleTime: DAY,
    gcTime: DAY * 7,
  });
}

export function useNhtsaModelsForMake(makeName: string | undefined | null) {
  const name = makeName?.trim();
  return useQuery({
    queryKey: ["nhtsa", "models", name],
    queryFn: () => fetchModelsForMake(name!),
    enabled: Boolean(name),
    staleTime: DAY,
    gcTime: DAY * 7,
  });
}

export function useNhtsaYearsForMakeModel(
  makeName: string | undefined | null,
  modelName: string | undefined | null
) {
  const make = makeName?.trim();
  const model = modelName?.trim();
  return useQuery({
    queryKey: ["nhtsa", "years", make, model],
    queryFn: () => fetchYearsForMakeAndModel(make!, model!),
    enabled: Boolean(make && model),
    staleTime: DAY,
    gcTime: DAY * 7,
  });
}

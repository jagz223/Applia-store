/** NHTSA vPIC API (EE. UU.), sin API key. https://vpic.nhtsa.dot.gov/api/ */

const BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";

export type NhtsaResults<T> = {
  Count: number;
  Message: string;
  SearchCriteria?: string;
  Results: T[];
};

export async function fetchAllMakes(): Promise<string[]> {
  const r = await fetch(`${BASE}/getallmakes?format=json`);
  if (!r.ok) throw new Error("No se pudieron cargar las marcas");
  const j = (await r.json()) as NhtsaResults<{ Make_ID: number; Make_Name: string }>;
  const names = j.Results.map((x) => String(x.Make_Name ?? "").trim()).filter(Boolean);
  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

export async function fetchModelsForMake(makeName: string): Promise<string[]> {
  const enc = encodeURIComponent(makeName.trim());
  const r = await fetch(`${BASE}/getmodelsformake/${enc}?format=json`);
  if (!r.ok) throw new Error("No se pudieron cargar los modelos");
  const j = (await r.json()) as NhtsaResults<{ Model_Name: string }>;
  const names = j.Results.map((x) => String(x.Model_Name ?? "").trim()).filter(Boolean);
  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

/** Año modelo más antiguo que permitimos consultar (inclusive). */
export const NHTSA_YEAR_MIN = 1995;
const YEAR_CHECK_CONCURRENCY = 4;
const FETCH_RETRIES = 2;
const RETRY_MS = 120;

function modelMatchesSelection(apiName: string, selectedNorm: string): boolean {
  const n = apiName.trim().toLowerCase();
  const s = selectedNorm.trim().toLowerCase();
  if (!s || !n) return false;
  if (n === s) return true;
  // Variantes vPIC: "Corolla" vs "Corolla LE", "Camry" vs "Camry Hybrid", etc.
  if (s.length >= 4 && n.includes(s)) return true;
  if (n.startsWith(`${s} `) || n.startsWith(`${s}(`)) return true;
  return false;
}

/** Años en que existe el par marca+modelo (vPIC GetModelsForMakeYear por año). */
export async function fetchYearsForMakeAndModel(make: string, model: string): Promise<number[]> {
  const encMake = encodeURIComponent(make.trim());
  const modelNorm = model.trim().toLowerCase();
  const maxY = new Date().getFullYear() + 1;
  const years: number[] = [];
  for (let y = maxY; y >= NHTSA_YEAR_MIN; y--) years.push(y);

  const modelInResults = (results: { Model_Name?: string }[]) => {
    const names = results.map((x) => String(x.Model_Name ?? "").trim());
    return names.some((n) => modelMatchesSelection(n, modelNorm));
  };

  const fetchYearJson = async (y: number): Promise<NhtsaResults<{ Model_Name?: string }> | null> => {
    const url = `${BASE}/GetModelsForMakeYear/make/${encMake}/modelyear/${y}?format=json`;
    for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
      try {
        const r = await fetch(url);
        if (!r.ok) {
          if (attempt < FETCH_RETRIES) {
            await new Promise((res) => setTimeout(res, RETRY_MS * (attempt + 1)));
          }
          continue;
        }
        return (await r.json()) as NhtsaResults<{ Model_Name?: string }>;
      } catch {
        if (attempt < FETCH_RETRIES) {
          await new Promise((res) => setTimeout(res, RETRY_MS * (attempt + 1)));
        }
      }
    }
    return null;
  };

  const checkYear = async (y: number): Promise<number | null> => {
    const j = await fetchYearJson(y);
    if (!j) return null;
    return modelInResults(j.Results ?? []) ? y : null;
  };

  const valid: number[] = [];
  for (let i = 0; i < years.length; i += YEAR_CHECK_CONCURRENCY) {
    const chunk = years.slice(i, i + YEAR_CHECK_CONCURRENCY);
    const settled = await Promise.all(chunk.map((y) => checkYear(y)));
    settled.forEach((v, idx) => {
      if (v != null) valid.push(chunk[idx]!);
    });
  }
  return valid.sort((a, b) => b - a);
}

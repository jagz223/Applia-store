/** NHTSA vPIC API (EE. UU.), sin API key. https://vpic.nhtsa.dot.gov/api/ */

const BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";

export type NhtsaResults<T> = {
  Count: number;
  Message: string;
  SearchCriteria?: string;
  Results: T[];
};

// Timeout por request. NHTSA/vPIC a veces "se cuelga" en móvil/red lenta;
// necesitamos cortar rápido para que el UI no quede en spinner eterno.
const FETCH_TIMEOUT_MS = 3000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function fetchAllMakes(): Promise<string[]> {
  const r = await fetchWithTimeout(`${BASE}/getallmakes?format=json`);
  if (!r.ok) throw new Error("No se pudieron cargar las marcas");
  const j = (await r.json()) as NhtsaResults<{ Make_ID: number; Make_Name: string }>;
  const names = j.Results.map((x) => String(x.Make_Name ?? "").trim()).filter(Boolean);
  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

export async function fetchModelsForMake(makeName: string): Promise<string[]> {
  const enc = encodeURIComponent(makeName.trim());
  const r = await fetchWithTimeout(`${BASE}/getmodelsformake/${enc}?format=json`);
  if (!r.ok) throw new Error("No se pudieron cargar los modelos");
  const j = (await r.json()) as NhtsaResults<{ Model_Name: string }>;
  const names = j.Results.map((x) => String(x.Model_Name ?? "").trim()).filter(Boolean);
  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

/** Año modelo más antiguo que permitimos consultar (inclusive). */
export const NHTSA_YEAR_MIN = 1995;
const YEAR_CHECK_CONCURRENCY = 6;
const FETCH_RETRIES = 0;
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
  const startedAt = Date.now();
  const overallTimeoutMs = 25000;
  const COARSE_STEP_YEARS = 5;

  const modelInResults = (results: { Model_Name?: string }[]) => {
    const names = results.map((x) => String(x.Model_Name ?? "").trim());
    return names.some((n) => modelMatchesSelection(n, modelNorm));
  };

  const fetchYearJson = async (y: number): Promise<NhtsaResults<{ Model_Name?: string }> | null> => {
    const url = `${BASE}/GetModelsForMakeYear/make/${encMake}/modelyear/${y}?format=json`;
    for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
      try {
        const r = await fetchWithTimeout(url);
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

  // 1) Búsqueda coarse para estimar el rango de años (reduce llamadas).
  const coarseYears: number[] = [];
  for (let y = maxY; y >= NHTSA_YEAR_MIN; y -= COARSE_STEP_YEARS) coarseYears.push(y);
  if (coarseYears.length === 0 || coarseYears[coarseYears.length - 1] !== NHTSA_YEAR_MIN) {
    coarseYears.push(NHTSA_YEAR_MIN);
  }

  const foundCoarse = new Set<number>();
  for (let i = 0; i < coarseYears.length; i += YEAR_CHECK_CONCURRENCY) {
    const chunk = coarseYears.slice(i, i + YEAR_CHECK_CONCURRENCY);
    const settled = await Promise.all(chunk.map((y) => checkYear(y)));
    settled.forEach((v) => {
      if (v != null) foundCoarse.add(v);
    });
    if (Date.now() - startedAt > overallTimeoutMs) break;
  }

  if (foundCoarse.size === 0) return [];

  const foundArray = Array.from(foundCoarse);
  const minFound = Math.min(...foundArray);
  const maxFound = Math.max(...foundArray);

  // 2) Refine: revisar todos los años dentro del rango estimado.
  const refineStart = Math.max(NHTSA_YEAR_MIN, minFound - COARSE_STEP_YEARS);
  const refineEnd = Math.min(maxY, maxFound + COARSE_STEP_YEARS);

  const valid = new Set<number>(foundCoarse);
  for (let y = refineEnd; y >= refineStart; ) {
    if (Date.now() - startedAt > overallTimeoutMs) break;

    const chunk: number[] = [];
    for (let k = 0; k < YEAR_CHECK_CONCURRENCY && y >= refineStart; k++, y--) {
      chunk.push(y);
    }

    const settled = await Promise.all(chunk.map((yy) => checkYear(yy)));
    settled.forEach((v) => {
      if (v != null) valid.add(v);
    });
  }

  return Array.from(valid).sort((a, b) => b - a);
}

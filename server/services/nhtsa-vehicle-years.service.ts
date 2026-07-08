/**
 * NHTSA vPIC - años por marca+modelo (make+model -> years[])
 *
 * vPIC no expone un endpoint directo de "years for model", así que derivamos
 * el set de años consultando GetModelsForMakeYear por rangos de años, pero:
 * - cacheamos el resultado en memoria
 * - limitamos tiempo total para no colgar el UI
 *
 * Esto es 100% gratuito.
 */

type NhtsaResults<T> = {
  Count: number;
  Message: string;
  SearchCriteria?: string;
  Results: T[];
};

const BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";
const FETCH_TIMEOUT_MS = 4500;

/** Año mínimo que ofrecemos para Car Go. */
const YEAR_MIN = 1980;
const YEAR_CHECK_CONCURRENCY = 6;
const COARSE_STEP_YEARS = 5;
const OVERALL_TIMEOUT_MS = 35000;

type CacheEntry = { years: number[]; cachedAt: number };
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 días

function normalize(v: string) {
  return v
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function modelMatchesSelection(apiName: string, selectedNorm: string): boolean {
  const n = normalize(apiName);
  const s = normalize(selectedNorm);
  if (!s || !n) return false;
  if (n === s) return true;
  if (s.length >= 3 && n.includes(s)) return true;
  if (n.startsWith(`${s} `) || n.startsWith(`${s}(`)) return true;
  return false;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function fetchYearJson(encMake: string, y: number): Promise<NhtsaResults<{ Model_Name?: string }> | null> {
  const url = `${BASE}/GetModelsForMakeYear/make/${encMake}/modelyear/${y}?format=json`;
  try {
    const r = await fetchWithTimeout(url);
    if (!r.ok) return null;
    return (await r.json()) as NhtsaResults<{ Model_Name?: string }>;
  } catch {
    return null;
  }
}

export class NhtsaVehicleYearsService {
  private cache = new Map<string, CacheEntry>();

  private key(make: string, model: string) {
    return `${normalize(make)}::${normalize(model)}`;
  }

  async getYearsForMakeModel(make: string, model: string): Promise<number[]> {
    const makeT = String(make ?? "").trim();
    const modelT = String(model ?? "").trim();
    if (!makeT || !modelT) return [];

    const k = this.key(makeT, modelT);
    const cached = this.cache.get(k);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.years;

    const startedAt = Date.now();
    const maxY = new Date().getFullYear() + 1;
    const encMake = encodeURIComponent(makeT.trim());
    const modelNorm = modelT.trim().toLowerCase();

    const modelInResults = (results: { Model_Name?: string }[]) => {
      const names = results.map((x) => String(x.Model_Name ?? "").trim());
      return names.some((n) => modelMatchesSelection(n, modelNorm));
    };

    const checkYear = async (y: number): Promise<number | null> => {
      const j = await fetchYearJson(encMake, y);
      if (!j) return null;
      return modelInResults(j.Results ?? []) ? y : null;
    };

    // 1) coarse: cada 5 años.
    const coarseYears: number[] = [];
    for (let y = maxY; y >= YEAR_MIN; y -= COARSE_STEP_YEARS) coarseYears.push(y);
    if (coarseYears.length === 0 || coarseYears[coarseYears.length - 1] !== YEAR_MIN) coarseYears.push(YEAR_MIN);

    const foundCoarse = new Set<number>();
    for (let i = 0; i < coarseYears.length; i += YEAR_CHECK_CONCURRENCY) {
      const chunk = coarseYears.slice(i, i + YEAR_CHECK_CONCURRENCY);
      const settled = await Promise.all(chunk.map((yy) => checkYear(yy)));
      settled.forEach((v) => {
        if (v != null) foundCoarse.add(v);
      });
      if (Date.now() - startedAt > OVERALL_TIMEOUT_MS) break;
    }
    if (foundCoarse.size === 0) {
      this.cache.set(k, { years: [], cachedAt: Date.now() });
      return [];
    }

    const arr = Array.from(foundCoarse);
    const minFound = Math.min(...arr);
    const maxFound = Math.max(...arr);
    const refineStart = Math.max(YEAR_MIN, minFound - COARSE_STEP_YEARS);
    const refineEnd = Math.min(maxY, maxFound + COARSE_STEP_YEARS);

    // 2) refine: revisar años dentro del rango estimado.
    const valid = new Set<number>(foundCoarse);
    for (let y = refineEnd; y >= refineStart; ) {
      if (Date.now() - startedAt > OVERALL_TIMEOUT_MS) break;
      const chunk: number[] = [];
      for (let k2 = 0; k2 < YEAR_CHECK_CONCURRENCY && y >= refineStart; k2++, y--) chunk.push(y);
      const settled = await Promise.all(chunk.map((yy) => checkYear(yy)));
      settled.forEach((v) => {
        if (v != null) valid.add(v);
      });
    }

    const years = Array.from(valid).sort((a, b) => b - a);
    this.cache.set(k, { years, cachedAt: Date.now() });
    return years;
  }
}

export const nhtsaVehicleYearsService = new NhtsaVehicleYearsService();


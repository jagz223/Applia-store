/**
 * API Ninjas - Vehicle years resolver (make+model -> years[])
 *
 * Usa /v1/cartrims para obtener rangos de producción por trim y generación,
 * y deriva un set de años disponibles sin hacer llamadas año-por-año.
 *
 * Requiere variable de entorno:
 * - API_NINJAS_KEY (se envía en header X-Api-Key)
 */

type CarTrimRow = {
  make?: string;
  model?: string;
  generation_year_begin?: string | null;
  generation_year_end?: string | null;
  trim_start_production_year?: number | null;
  trim_end_production_year?: number | null;
};

const API_BASE = "https://api.api-ninjas.com/v1";
const TIMEOUT_MS = 9000;

function normalizeText(input: string): string {
  return input
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function clampYear(y: number): number | null {
  if (!Number.isFinite(y)) return null;
  const yi = Math.trunc(y);
  if (yi < 1900 || yi > new Date().getFullYear() + 1) return null;
  return yi;
}

function addYearRange(out: Set<number>, startRaw: unknown, endRaw: unknown) {
  const start = clampYear(typeof startRaw === "string" ? Number(startRaw) : (startRaw as any));
  const endCandidate =
    endRaw == null || endRaw === "" ? null : clampYear(typeof endRaw === "string" ? Number(endRaw) : (endRaw as any));

  if (start == null) return;
  const end = endCandidate ?? new Date().getFullYear() + 1;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  for (let y = lo; y <= hi; y++) out.add(y);
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function readResponseBodySafe(r: Response): Promise<string> {
  try {
    const text = await r.text();
    return text?.trim() ? text.trim() : "";
  } catch {
    return "";
  }
}

type CacheEntry = { years: number[]; cachedAt: number };
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 días

class ApiNinjasVehicleYearsService {
  private cache = new Map<string, CacheEntry>();

  private cacheKey(make: string, model: string) {
    return `${normalizeText(make)}::${normalizeText(model)}`;
  }

  async getYearsForMakeModel(make: string, model: string): Promise<number[]> {
    const makeT = String(make ?? "").trim();
    const modelT = String(model ?? "").trim();
    if (!makeT || !modelT) return [];

    const key = this.cacheKey(makeT, modelT);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.years;

    const apiKey = process.env.API_NINJAS_KEY;
    if (!apiKey) {
      throw new Error("Falta API_NINJAS_KEY en el servidor");
    }

    // Paginar trims. Ninjas permite limit 1..100 y offset.
    const limit = 100;
    const maxPages = 12; // 1200 filas máximo para evitar abuso/latencia extrema
    const yearsSet = new Set<number>();

    for (let page = 0; page < maxPages; page++) {
      const offset = page * limit;
      const url = `${API_BASE}/cartrims?make=${encodeURIComponent(makeT)}&model=${encodeURIComponent(modelT)}&limit=${limit}&offset=${offset}`;
      const r = await fetchWithTimeout(url, {
        headers: {
          "X-Api-Key": apiKey,
          Accept: "application/json",
          "User-Agent": "genfeb/api-ninjas",
        },
      });

      if (r.status === 401 || r.status === 403) {
        throw new Error("API Ninjas rechazó la autenticación (revisa API_NINJAS_KEY/plan)");
      }
      if (!r.ok) {
        const body = await readResponseBodySafe(r);
        const suffix = body ? `: ${body.slice(0, 600)}` : "";
        throw new Error(`API Ninjas error (${r.status})${suffix}`);
      }

      const rows = (await r.json()) as unknown;
      if (!Array.isArray(rows) || rows.length === 0) break;

      for (const raw of rows as CarTrimRow[]) {
        addYearRange(yearsSet, raw.generation_year_begin, raw.generation_year_end);
        addYearRange(yearsSet, raw.trim_start_production_year, raw.trim_end_production_year);
      }

      if (rows.length < limit) break;
    }

    const years = Array.from(yearsSet).sort((a, b) => b - a);
    this.cache.set(key, { years, cachedAt: Date.now() });
    return years;
  }
}

export const apiNinjasVehicleYearsService = new ApiNinjasVehicleYearsService();


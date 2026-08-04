/**
 * VehiclesDB (open edition) - catálogo de marcas/modelos global.
 *
 * Nota importante:
 * - La capa open (open catalogue) NO trae lista de años model-year; solo nameplate + disponibilidad/popularity.
 * - Para "años" seguimos usando vPIC/NHTSA (ver hooks/use-nhtsa-vpic.ts).
 *
 * Este servicio carga una proyección pequeña desde GitHub una vez y cachea en memoria.
 */

type VehiclesDbProjection = {
  makes: Array<{
    name: string;
    slug: string;
    kinds: string[];
    models: Array<{
      name: string;
      slug: string;
      kind: string;
      body_type?: string;
      global_decile?: number;
      availability?: string[];
      regions?: string[];
    }>;
  }>;
};

type VehiclesDbCache = {
  makeNames: string[];
  // key: normalized (nombre o slug) -> make object
  makeByKey: Map<string, { name: string; slug: string }>;
  // key: makeKey (normalized) -> unique model names (sorted)
  modelsByMakeKey: Map<string, string[]>;
};

const VEHICLES_DB_URL = "https://raw.githubusercontent.com/vehiclesdb/vehiclesdb/main/dist/vehicles.json";

function normalizeText(input: string): string {
  // Quita espacios, baja a minúsculas y normaliza acentos para que el matching sea más tolerante.
  return input
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

async function loadVehiclesDbProjection(): Promise<VehiclesDbProjection> {
  const r = await fetch(VEHICLES_DB_URL, {
    headers: {
      // Explicitamos UA para algunas infraestructuras que bloquean fetch sin headers.
      "User-Agent": "applia/vehiclesdb",
    },
  });
  if (!r.ok) {
    throw new Error(`VehiclesDB: no se pudo cargar catálogo (${r.status})`);
  }
  return (await r.json()) as VehiclesDbProjection;
}

class VehiclesDbService {
  private cache: VehiclesDbCache | null = null;
  private loading: Promise<VehiclesDbCache> | null = null;

  private async ensureLoaded(): Promise<VehiclesDbCache> {
    if (this.cache) return this.cache;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      const data = await loadVehiclesDbProjection();
      const makeByKey = new Map<string, { name: string; slug: string }>();
      const modelsByMakeKey = new Map<string, string[]>();

      const makeNames: string[] = [];

      for (const make of data.makes ?? []) {
        const makeName = String(make.name ?? "").trim();
        const makeSlug = String(make.slug ?? "").trim();
        if (!makeName) continue;

        makeNames.push(makeName);

        const makeKeyFromName = normalizeText(makeName);
        const makeKeyFromSlug = makeSlug ? normalizeText(makeSlug) : makeKeyFromName;

        const makeRow = { name: makeName, slug: makeSlug };
        makeByKey.set(makeKeyFromName, makeRow);
        if (makeSlug) makeByKey.set(makeKeyFromSlug, makeRow);

        const modelNames = Array.from(
          new Set(
            (make.models ?? [])
              .map((m) => String(m?.name ?? "").trim())
              .filter(Boolean),
          ),
        );
        modelNames.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
        // La lista se indexa por ambos keys (nombre y slug) para poder responder si el cliente envía cualquiera.
        modelsByMakeKey.set(makeKeyFromName, modelNames);
        if (makeSlug) modelsByMakeKey.set(makeKeyFromSlug, modelNames);
      }

      const uniqueMakeNames = Array.from(new Set(makeNames)).sort((a, b) =>
        a.localeCompare(b, "es", { sensitivity: "base" }),
      );

      const built: VehiclesDbCache = { makeNames: uniqueMakeNames, makeByKey, modelsByMakeKey };
      this.cache = built;
      return built;
    })();

    return this.loading;
  }

  async getMakeNames(): Promise<string[]> {
    const c = await this.ensureLoaded();
    return c.makeNames;
  }

  async getModelNamesForMake(make: string): Promise<string[]> {
    const c = await this.ensureLoaded();
    const key = normalizeText(make);
    return c.modelsByMakeKey.get(key) ?? [];
  }
}

export const vehiclesDbService = new VehiclesDbService();


import { z } from "zod";

/** Países disponibles en el selector de ubicación de tiendas (español). */
export const STORE_COUNTRIES = [
  "Ecuador",
  "Colombia",
  "Perú",
  "Chile",
  "Argentina",
  "México",
  "Bolivia",
  "Paraguay",
  "Uruguay",
  "Venezuela",
  "Brasil",
  "Panamá",
  "Costa Rica",
  "Guatemala",
  "Honduras",
  "El Salvador",
  "Nicaragua",
  "República Dominicana",
  "Cuba",
  "Puerto Rico",
  "Estados Unidos",
  "Canadá",
  "España",
  "Portugal",
  "Francia",
  "Alemania",
  "Italia",
  "Reino Unido",
] as const;

export type StoreCountry = (typeof STORE_COUNTRIES)[number];

/** Ciudades sugeridas para Ecuador (selector opcional). */
export const ECUADOR_CITIES = [
  "Quito",
  "Guayaquil",
  "Cuenca",
  "Santo Domingo",
  "Machala",
  "Durán",
  "Manta",
  "Portoviejo",
  "Loja",
  "Ambato",
  "Esmeraldas",
  "Quevedo",
  "Riobamba",
  "Milagro",
  "Ibarra",
  "Latacunga",
  "Babahoyo",
  "Tulcán",
  "Azogues",
  "Salinas",
] as const;

export type EcuadorCity = (typeof ECUADOR_CITIES)[number];

export const storeCountrySchema = z
  .string()
  .trim()
  .min(2, "El país debe tener al menos 2 caracteres")
  .max(80, "El país no puede superar 80 caracteres")
  .refine((value) => (STORE_COUNTRIES as readonly string[]).includes(value), {
    message: "País no válido. Selecciónalo de la lista.",
  });

export const storeCitySchema = z
  .string()
  .trim()
  .min(1, "La ciudad debe tener al menos 1 carácter")
  .max(120, "La ciudad no puede superar 120 caracteres");

/** Variantes en inglés u otros idiomas → nombre en español del selector. */
const COUNTRY_ALIASES: Record<string, StoreCountry> = {
  ecuador: "Ecuador",
  colombia: "Colombia",
  peru: "Perú",
  perú: "Perú",
  chile: "Chile",
  argentina: "Argentina",
  mexico: "México",
  méxico: "México",
  bolivia: "Bolivia",
  paraguay: "Paraguay",
  uruguay: "Uruguay",
  venezuela: "Venezuela",
  brazil: "Brasil",
  brasil: "Brasil",
  panama: "Panamá",
  panamá: "Panamá",
  "costa rica": "Costa Rica",
  guatemala: "Guatemala",
  honduras: "Honduras",
  "el salvador": "El Salvador",
  nicaragua: "Nicaragua",
  "dominican republic": "República Dominicana",
  "república dominicana": "República Dominicana",
  cuba: "Cuba",
  "puerto rico": "Puerto Rico",
  "united states": "Estados Unidos",
  "united states of america": "Estados Unidos",
  usa: "Estados Unidos",
  "estados unidos": "Estados Unidos",
  canada: "Canadá",
  canadá: "Canadá",
  spain: "España",
  españa: "España",
  portugal: "Portugal",
  france: "Francia",
  francia: "Francia",
  germany: "Alemania",
  alemania: "Alemania",
  italy: "Italia",
  italia: "Italia",
  "united kingdom": "Reino Unido",
  "reino unido": "Reino Unido",
  uk: "Reino Unido",
};

export function normalizeStoreCountry(raw: string | null | undefined): StoreCountry | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const alias = COUNTRY_ALIASES[lower];
  if (alias) return alias;
  const exact = STORE_COUNTRIES.find((c) => c.toLowerCase() === lower);
  return exact ?? null;
}

export function getStoreCitySuggestions(country: string | null | undefined): readonly string[] {
  if (country === "Ecuador") return ECUADOR_CITIES;
  return [];
}

/** Etiqueta legible: «Quito, Ecuador». */
export function formatStoreLocationLabel(
  country: string | null | undefined,
  city: string | null | undefined,
): string | null {
  const c = city?.trim();
  const co = country?.trim();
  if (c && co) return `${c}, ${co}`;
  if (c) return c;
  if (co) return co;
  return null;
}

export function resolveStoreLocationLabel(
  country: string | null | undefined,
  city: string | null | undefined,
): string | null {
  return formatStoreLocationLabel(country, city);
}

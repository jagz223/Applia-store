import { TRANSPORT_BRAND_SLUGS, MARKETPLACE_CATEGORY_SLUG } from "./default-categories";

export type TransportBrandSlug = (typeof TRANSPORT_BRAND_SLUGS)[number];

const TRANSPORT_BRAND_SET = new Set<string>(TRANSPORT_BRAND_SLUGS);

/** Quita `marketplace` y cualquier slug que no sea marca de transporte o envíos. */
export function sanitizeTransportBrands(raw: unknown): TransportBrandSlug[] {
  if (!Array.isArray(raw)) return [];
  const out: TransportBrandSlug[] = [];
  for (const item of raw) {
    const s = String(item ?? "").trim().toLowerCase();
    if (s === MARKETPLACE_CATEGORY_SLUG) continue;
    if (TRANSPORT_BRAND_SET.has(s) && !out.includes(s as TransportBrandSlug)) {
      out.push(s as TransportBrandSlug);
    }
  }
  return out;
}

/** goBrands por defecto al registrarse como conductor de taxi o envíos. */
export function defaultGoBrandsForProviderCategory(slug: string | null | undefined): TransportBrandSlug[] {
  const s = String(slug ?? "").trim().toLowerCase();
  if (s === "transport") return ["transport", "delivery"];
  if (s === "delivery") return ["delivery"];
  return [];
}

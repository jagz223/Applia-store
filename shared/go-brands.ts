import { CAR_GO_BRAND_SLUGS, MARKETPLACE_CATEGORY_SLUG } from "./default-categories";

export type CarGoBrandSlug = (typeof CAR_GO_BRAND_SLUGS)[number];

const CAR_GO_BRAND_SET = new Set<string>(CAR_GO_BRAND_SLUGS);

/** Quita `marketplace` y cualquier slug que no sea marca Car Go. */
export function sanitizeCarGoBrands(raw: unknown): CarGoBrandSlug[] {
  if (!Array.isArray(raw)) return [];
  const out: CarGoBrandSlug[] = [];
  for (const item of raw) {
    const s = String(item ?? "").trim().toLowerCase();
    if (s === MARKETPLACE_CATEGORY_SLUG) continue;
    if (CAR_GO_BRAND_SET.has(s) && !out.includes(s as CarGoBrandSlug)) {
      out.push(s as CarGoBrandSlug);
    }
  }
  return out;
}

/** goBrands por defecto al registrarse como conductor Car Go / Delivery. */
export function defaultGoBrandsForProviderCategory(slug: string | null | undefined): CarGoBrandSlug[] {
  const s = String(slug ?? "").trim().toLowerCase();
  if (s === "transport") return ["transport", "delivery"];
  if (s === "delivery") return ["delivery"];
  return [];
}

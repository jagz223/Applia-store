/**
 * Directorio admin de asociados con servicios activos: agrupación por proveedor,
 * filtros de marca unificados (Go movilidad) y criterios de pertenencia (SOLID: reglas en un solo lugar).
 */
import {
  CAR_GO_BRAND_SLUGS,
  getCategoryDisplayName,
  MAN_GO_CATEGORY_SLUG,
  normalizeProviderCategorySlug,
} from "./default-categories";
import { providerHasGoBrand, type CategorySlugRow, type ProviderGoRef } from "./provider-go";
import {
  getProviderCategoryIds,
  slugForCategoryId,
  type ProviderCategorySlots,
} from "./provider-category-membership";
import { serviceBelongsToBrand, serviceListingCategorySlug } from "./service-belongs-to-brand";

/** Filtro unificado Car Go + Delivery en el listado admin. */
export const ADMIN_PROVIDER_LIST_BRAND_FILTER_GO_MOBILITY = "go-mobility" as const;

export type AdminProviderListBrandFilterId =
  | ""
  | typeof MAN_GO_CATEGORY_SLUG
  | "professional"
  | typeof ADMIN_PROVIDER_LIST_BRAND_FILTER_GO_MOBILITY;

export const ADMIN_PROVIDER_LIST_BRAND_FILTERS: ReadonlyArray<{
  id: AdminProviderListBrandFilterId;
  label: string;
}> = [
  { id: "", label: "Todas" },
  { id: MAN_GO_CATEGORY_SLUG, label: "Man Go" },
  { id: "professional", label: "Pro Go" },
  { id: ADMIN_PROVIDER_LIST_BRAND_FILTER_GO_MOBILITY, label: "Go (Car · Delivery)" },
];

export type AdminActiveServiceSnapshot = {
  id: number;
  title: string;
  categoryId?: number | null;
  categorySlug?: string | null;
  categoryDisplayName?: string | null;
};

export type AdminActiveProviderDirectoryRow = {
  providerId: number;
  userId: string;
  userName: string;
  userEmail: string | null;
  providerVerified: boolean;
  providerProfession: string | null;
  hasVehicle: boolean;
  goBrandLabels: string[];
  services: AdminActiveServiceSnapshot[];
};

type CategoryRow = CategorySlugRow & { name?: string | null };

const MOBILITY_SLUG_SET = new Set<string>(CAR_GO_BRAND_SLUGS);

function categoryIdForSlug(slug: string, categories: readonly CategoryRow[]): number | null {
  const target = normalizeProviderCategorySlug(slug);
  const row = categories.find((c) => normalizeProviderCategorySlug(c.slug) === target);
  const id = Number(row?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function providerHasCategorySlug(
  provider: ProviderCategorySlots,
  slug: string,
  categories: readonly CategoryRow[],
): boolean {
  const target = normalizeProviderCategorySlug(slug);
  for (const cid of getProviderCategoryIds(provider)) {
    if (slugForCategoryId(cid, categories) === target) return true;
  }
  return normalizeProviderCategorySlug(provider.category) === target;
}

function serviceMatchesMobilityGo(
  s: AdminActiveServiceSnapshot,
  categories: readonly CategoryRow[],
): boolean {
  const slug = serviceListingCategorySlug(
    { categoryId: s.categoryId, category: s.categorySlug ? { slug: s.categorySlug } : null },
    categories,
  );
  return MOBILITY_SLUG_SET.has(slug);
}

function providerHasMobilityGoPresence(
  provider: ProviderGoRef & ProviderCategorySlots,
  services: readonly AdminActiveServiceSnapshot[],
  categories: readonly CategoryRow[],
  hasVehicle: boolean,
): boolean {
  if (hasVehicle) return true;
  for (const slug of CAR_GO_BRAND_SLUGS) {
    if (providerHasGoBrand(provider, slug, categories)) return true;
    if (providerHasCategorySlug(provider, slug, categories)) return true;
  }
  return services.some((s) => serviceMatchesMobilityGo(s, categories));
}

function providerMatchesCatalogBrandFilter(
  filterSlug: string,
  provider: ProviderCategorySlots,
  services: readonly AdminActiveServiceSnapshot[],
  categories: readonly CategoryRow[],
): boolean {
  if (providerHasCategorySlug(provider, filterSlug, categories)) return true;
  const brandId = categoryIdForSlug(filterSlug, categories);
  if (brandId == null) return false;
  return services.some((s) => serviceBelongsToBrand(s, brandId, categories));
}

/** Normaliza `brandSlug` de query (legacy por categoría Go) al id de filtro del directorio. */
export function normalizeAdminProviderListBrandFilterId(brandSlug: string): string {
  const raw = String(brandSlug ?? "").trim();
  if (!raw) return "";
  const slug = normalizeProviderCategorySlug(raw);
  if (slug === ADMIN_PROVIDER_LIST_BRAND_FILTER_GO_MOBILITY) return slug;
  if (MOBILITY_SLUG_SET.has(slug)) return ADMIN_PROVIDER_LIST_BRAND_FILTER_GO_MOBILITY;
  return slug;
}

export function providerMatchesAdminListBrandFilter(args: {
  filterId: string;
  provider: ProviderGoRef & ProviderCategorySlots;
  services: readonly AdminActiveServiceSnapshot[];
  categories: readonly CategoryRow[];
  hasVehicle: boolean;
}): boolean {
  const filterId = normalizeAdminProviderListBrandFilterId(args.filterId);
  if (!filterId) return true;

  if (filterId === ADMIN_PROVIDER_LIST_BRAND_FILTER_GO_MOBILITY) {
    return providerHasMobilityGoPresence(
      args.provider,
      args.services,
      args.categories,
      args.hasVehicle,
    );
  }

  if (filterId === MAN_GO_CATEGORY_SLUG || filterId === "professional") {
    return providerMatchesCatalogBrandFilter(filterId, args.provider, args.services, args.categories);
  }

  return providerMatchesCatalogBrandFilter(filterId, args.provider, args.services, args.categories);
}

export function providerMatchesAdminDirectorySearch(
  row: Pick<AdminActiveProviderDirectoryRow, "userName" | "userEmail" | "providerProfession" | "services">,
  search: string,
): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    row.userName,
    row.userEmail ?? "",
    row.providerProfession ?? "",
    ...row.services.map((s) => `${s.title} ${s.categoryDisplayName ?? ""} ${s.categorySlug ?? ""}`),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function collectProviderGoBrandLabels(
  provider: ProviderGoRef & ProviderCategorySlots,
  categories: readonly CategoryRow[],
  hasVehicle: boolean,
): string[] {
  const labels = new Set<string>();
  for (const slug of CAR_GO_BRAND_SLUGS) {
    if (providerHasGoBrand(provider, slug, categories)) {
      labels.add(getCategoryDisplayName({ slug }));
    }
  }
  if (providerHasCategorySlug(provider, "marketplace", categories)) {
    labels.add(getCategoryDisplayName({ slug: "marketplace" }));
  }
  for (const cid of getProviderCategoryIds(provider)) {
    const slug = slugForCategoryId(cid, categories);
    if (MOBILITY_SLUG_SET.has(slug)) {
      labels.add(getCategoryDisplayName({ slug }));
    }
  }
  if (hasVehicle && labels.size === 0) {
    labels.add(getCategoryDisplayName({ slug: "transport" }));
  }
  return [...labels].sort((a, b) => a.localeCompare(b, "es"));
}

export type AdminActiveProviderFlatInput = {
  providerId: number;
  userId: string;
  userName: string;
  userEmail: string | null;
  providerVerified: boolean;
  providerProfession: string | null;
  provider: ProviderGoRef & ProviderCategorySlots;
  hasVehicle: boolean;
  service: AdminActiveServiceSnapshot;
};

export function buildAdminActiveProviderDirectory(
  flat: readonly AdminActiveProviderFlatInput[],
  options: {
    search?: string;
    brandFilterId?: string;
    categories: readonly CategoryRow[];
  },
): AdminActiveProviderDirectoryRow[] {
  type Agg = AdminActiveProviderDirectoryRow & {
    provider: ProviderGoRef & ProviderCategorySlots;
  };

  const byProvider = new Map<number, Agg>();

  for (const row of flat) {
    const pid = row.providerId;
    if (!Number.isFinite(pid) || pid <= 0) continue;

    let agg = byProvider.get(pid);
    if (!agg) {
      agg = {
        providerId: pid,
        userId: row.userId,
        userName: row.userName,
        userEmail: row.userEmail,
        providerVerified: row.providerVerified,
        providerProfession: row.providerProfession,
        hasVehicle: row.hasVehicle,
        goBrandLabels: [],
        services: [],
        provider: row.provider,
      };
      byProvider.set(pid, agg);
    }
    if (row.hasVehicle) agg.hasVehicle = true;
    if (!agg.services.some((s) => s.id === row.service.id)) {
      agg.services.push(row.service);
    }
  }

  const search = String(options.search ?? "");
  const brandFilterId = String(options.brandFilterId ?? "");
  const categories = options.categories;
  const result: AdminActiveProviderDirectoryRow[] = [];

  for (const agg of byProvider.values()) {
    const { provider, ...base } = agg;
    const directoryRow: AdminActiveProviderDirectoryRow = {
      ...base,
      goBrandLabels: collectProviderGoBrandLabels(provider, categories, agg.hasVehicle),
      services: [...agg.services].sort((a, b) =>
        String(a.categoryDisplayName ?? "").localeCompare(String(b.categoryDisplayName ?? ""), "es"),
      ),
    };

    if (
      !providerMatchesAdminListBrandFilter({
        filterId: brandFilterId,
        provider,
        services: directoryRow.services,
        categories,
        hasVehicle: directoryRow.hasVehicle,
      })
    ) {
      continue;
    }
    if (!providerMatchesAdminDirectorySearch(directoryRow, search)) continue;
    result.push(directoryRow);
  }

  result.sort((a, b) =>
    String(a.userName || a.userEmail || "").localeCompare(String(b.userName || b.userEmail || ""), "es"),
  );
  return result;
}

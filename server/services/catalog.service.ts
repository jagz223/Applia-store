/**
 * Servicio de dominio: Catálogo (categorías, proveedores, servicios).
 * Punto único de acceso para lectura del catálogo público y creación por proveedores.
 */

import type { ICatalogStorage, ProviderUpdate, ServiceUpdate } from "../storage-contracts";
import type { IStorage } from "../storage-genfeb";
import type { Category, InsertProvider, InsertService } from "@shared/schema";
import { getGenfebStatsMonthKey } from "@shared/ecuador-calendar";
import { excludeLegacySubcategoryCategoryDocuments } from "@shared/catalog-category-utils";
import { computeListingPublished } from "@shared/professional-listing-subscription";
import { DEFAULT_CATEGORIES, filterCategoriesExcludedFromPublicApi } from "@shared/default-categories";

const CANONICAL_CATEGORY_SLUGS = new Set(
  DEFAULT_CATEGORIES.map((c) => String(c.slug ?? "").trim().toLowerCase()).filter(Boolean),
);

function canonicalCategoriesFallback(): Category[] {
  return DEFAULT_CATEGORIES.map((c, i) => ({
    id: i + 1,
    name: c.name,
    slug: c.slug,
    type: c.type,
    icon: c.icon,
    imageUrl: c.imageUrl ?? null,
  })) as Category[];
}

export class CatalogService {
  constructor(private readonly storage: IStorage) {}

  async getCategories() {
    return this.storage.getCategories();
  }

  /** Lista para UI pública: sin documentos legacy; sin `delivery` en API pública; fallback si no hay slugs canónicos (dev / datos viejos). */
  async getCategoriesForPublicCatalog(): Promise<Category[]> {
    const all = excludeLegacySubcategoryCategoryDocuments(await this.storage.getCategories());
    const filtered = filterCategoriesExcludedFromPublicApi(all);
    const hasCanonical = filtered.some((c) =>
      CANONICAL_CATEGORY_SLUGS.has(String((c as { slug?: string | null }).slug ?? "").trim().toLowerCase()),
    );
    if (hasCanonical) return filtered;
    return filterCategoriesExcludedFromPublicApi(canonicalCategoriesFallback());
  }

  async updateCategory(id: number, data: import("@shared/schema").Category) {
    return this.storage.updateCategory(id, data);
  }

  async getSubcategories(categoryId: number) {
    return this.storage.getSubcategories(categoryId);
  }

  async getSubcategoryById(id: number) {
    return this.storage.getSubcategoryById(id);
  }

  async createSubcategory(data: Omit<import("../storage-contracts").Subcategory, "id">) {
    return this.storage.createSubcategory(data);
  }

  async updateSubcategory(id: number, data: Partial<import("../storage-contracts").Subcategory>) {
    return this.storage.updateSubcategory(id, data);
  }

  async getAllProviders(profession?: string, category?: string, categoryId?: number) {
    return this.storage.getAllProviders(profession, category, categoryId);
  }

  async getProvider(id: number | null | undefined) {
    return this.storage.getProvider(id);
  }

  async getProviderByUserId(userId: string) {
    return this.storage.getProviderByUserId(userId);
  }

  async createProvider(provider: InsertProvider) {
    return this.storage.createProvider(provider);
  }

  async updateProvider(id: number, data: ProviderUpdate) {
    return this.storage.updateProvider(id, data);
  }

  async deleteProvider(id: number) {
    return this.storage.deleteProvider(id);
  }

  async getAllServices(
    categoryId?: number,
    search?: string,
    providerCategoryId?: number,
    subcategoryId?: number,
    includeUnverifiedForAdmin?: boolean
  ) {
    return this.storage.getAllServices(categoryId, search, providerCategoryId, subcategoryId, includeUnverifiedForAdmin);
  }

  async getService(id: number) {
    return this.storage.getService(id);
  }

  async createService(service: InsertService) {
    return this.storage.createService(service);
  }

  async updateService(id: number, data: ServiceUpdate) {
    return this.storage.updateService(id, data);
  }

  async deleteService(id: number) {
    return this.storage.deleteService(id);
  }

  async seedCategories() {
    return this.storage.seedCategories();
  }

  /**
   * Conteos reales de asociados por marca (Fix Go / Pro Go / Man Go) para la home.
   * Pro Go = suma de proveedores en subcategorías legal y financial (bajo categoría professional).
   * Taxi / Pedidos / Delivery = proveedores cuya categoría base coincide con el slug.
   */
  async getHomeCategoryAssociateCounts(): Promise<{
    fixGo: number;
    proGo: number;
    manGo: number;
    carGo: number;
    shopGo: number;
    packGo: number;
  }> {
    const categories = await this.storage.getCategories();
    const bySlug = (slug: string) => categories.find((c) => (c as { slug?: string }).slug === slug);
    const technical = bySlug("technical");
    const professional = bySlug("professional");
    const maintenance = bySlug("maintenance");
    const transport = bySlug("transport");
    const marketplace = bySlug("marketplace");
    const delivery = bySlug("delivery");

    const [allProviders, subcategories] = await Promise.all([
      this.storage.getAllProviders(),
      professional ? this.storage.getSubcategories(Number(professional.id)) : Promise.resolve([]),
    ]);
    const verifiedProviders = allProviders.filter((p) =>
      computeListingPublished({
        isVerifiedIdentity: (p as { isVerified?: boolean | null }).isVerified === true,
        visibilitySubscriptionEndsAt: (p as { visibilitySubscriptionEndsAt?: unknown }).visibilitySubscriptionEndsAt,
        isFullAdmin: false,
      }),
    );

    const legalSub = subcategories.find((s) => s.slug === "legal");
    const financialSub = subcategories.find((s) => s.slug === "financial");
    const tutoringSub = subcategories.find((s) => s.slug === "tutoring");

    const countByCategoryId = (catId: number | undefined) => {
      if (catId == null || Number.isNaN(Number(catId))) return 0;
      return verifiedProviders.filter((p) => (p as { categoryId?: number | null }).categoryId === catId).length;
    };

    const fixGo = countByCategoryId(technical?.id);
    const manGo = countByCategoryId(maintenance?.id);
    const carGo = countByCategoryId(transport?.id);
    const shopGo = countByCategoryId(marketplace?.id);
    const packGo = countByCategoryId(delivery?.id);

    const legalId = legalSub?.id;
    const financialId = financialSub?.id;
    const tutoringId = tutoringSub?.id;
    const proGoIds = [legalId, financialId, tutoringId].filter(
      (id): id is number => id != null && !Number.isNaN(Number(id)),
    );
    const proGo =
      proGoIds.length === 0
        ? 0
        : verifiedProviders.filter((p) => {
            const sid = (p as { subcategoryId?: number | null }).subcategoryId;
            if (sid == null || Number.isNaN(Number(sid))) return false;
            return proGoIds.includes(Number(sid));
          }).length;

    return { fixGo, proGo, manGo, carGo, shopGo, packGo };
  }

  /** Top subcategorías por reservas en el mes calendario (Ecuador), para la home. */
  async getMonthlyPopularSubcategoryBookingCountsForHome(limit: number): Promise<{
    monthKey: string;
    items: { subcategoryId: number; count: number }[];
  }> {
    const monthKey = getGenfebStatsMonthKey();
    const lim = Math.min(50, Math.max(1, Math.floor(limit)));
    const items = await this.storage.getMonthlyPopularSubcategoryBookingCounts(monthKey, lim);
    return { monthKey, items };
  }

  /**
   * Indica qué categorías (por id) tienen al menos un servicio ofertado (proveedor con al menos un servicio).
   * Una categoría solo se considera "disponible" si existe al menos un servicio cuyo proveedor pertenece a esa categoría.
   */
  async getProviderCategoryAvailability(): Promise<Record<string, boolean>> {
    const [categories, services] = await Promise.all([
      this.getCategoriesForPublicCatalog(),
      this.storage.getAllServices(),
    ]);
    const availability: Record<string, boolean> = {};
    for (const cat of categories) {
      const id = cat.id as number;
      if (id == null || Number.isNaN(Number(id))) continue;
      const slug = (cat as { slug?: string }).slug;
      availability[String(id)] = services.some((s: { provider?: { categoryId?: unknown; category?: unknown } }) => {
        const p = s?.provider;
        if (!p) return false;
        const pid = p.categoryId;
        if (pid != null && typeof pid === "number" && !Number.isNaN(pid)) return pid === id;
        const slugVal = typeof p.category === "string" ? p.category.trim() : "";
        return slug != null && slugVal === slug;
      });
    }
    return availability;
  }
}

/**
 * Servicio de dominio: Catálogo (categorías, proveedores, servicios).
 * Punto único de acceso para lectura del catálogo público y creación por proveedores.
 */

import type { ICatalogStorage, ProviderUpdate, ServiceUpdate } from "../storage-contracts";
import type { InsertProvider, InsertService } from "@shared/schema";

export class CatalogService {
  constructor(private readonly storage: ICatalogStorage) {}

  async getCategories() {
    return this.storage.getCategories();
  }

  async getSubcategories(categoryId: number) {
    return this.storage.getSubcategories(categoryId);
  }

  async getSubcategoryById(id: number) {
    return this.storage.getSubcategoryById(id);
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
   * Car Go / Shop Go / Pack Go = proveedores cuya categoría base coincide con el slug.
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
    const verifiedProviders = allProviders.filter((p) => !!(p as { isVerified?: boolean | null }).isVerified);

    const legalSub = subcategories.find((s) => s.slug === "legal");
    const financialSub = subcategories.find((s) => s.slug === "financial");

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
    const proGo =
      legalId == null && financialId == null
        ? 0
        : verifiedProviders.filter((p) => {
            const sid = (p as { subcategoryId?: number | null }).subcategoryId;
            if (sid == null || Number.isNaN(Number(sid))) return false;
            return sid === legalId || sid === financialId;
          }).length;

    return { fixGo, proGo, manGo, carGo, shopGo, packGo };
  }

  /**
   * Indica qué categorías (por id) tienen al menos un servicio ofertado (proveedor con al menos un servicio).
   * Una categoría solo se considera "disponible" si existe al menos un servicio cuyo proveedor pertenece a esa categoría.
   */
  async getProviderCategoryAvailability(): Promise<Record<string, boolean>> {
    const [categories, services] = await Promise.all([
      this.storage.getCategories(),
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

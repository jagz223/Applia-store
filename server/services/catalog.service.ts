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

  async getAllServices(categoryId?: number, search?: string, providerCategoryId?: number, subcategoryId?: number) {
    return this.storage.getAllServices(categoryId, search, providerCategoryId, subcategoryId);
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

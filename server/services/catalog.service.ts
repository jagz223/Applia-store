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

  async getAllServices(categoryId?: number, search?: string, providerCategoryId?: number) {
    return this.storage.getAllServices(categoryId, search, providerCategoryId);
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
   * Indica qué categorías (por id) tienen al menos un profesional.
   * Usa el mismo sistema de categorías que los servicios (getCategories).
   */
  async getProviderCategoryAvailability(): Promise<Record<string, boolean>> {
    const [categories, all] = await Promise.all([
      this.storage.getCategories(),
      this.storage.getAllProviders(),
    ]);
    const providers = all.filter(
      (p): p is typeof p & { id: number } =>
        typeof p.id === "number" && !Number.isNaN(p.id)
    );
    const availability: Record<string, boolean> = {};
    for (const cat of categories) {
      const id = cat.id as number;
      if (Number.isNaN(id)) continue;
      availability[String(id)] = providers.some((p) => {
        const pid = (p as { categoryId?: unknown }).categoryId;
        if (pid != null && typeof pid === "number" && !Number.isNaN(pid)) return pid === id;
        const slug = (p as { category?: unknown }).category;
        const s = typeof slug === "string" ? slug.trim() : "";
        return s === (cat as { slug?: string }).slug;
      });
    }
    return availability;
  }
}

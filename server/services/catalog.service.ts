/**
 * Servicio de dominio: Catálogo (categorías, proveedores, servicios).
 * Punto único de acceso para lectura del catálogo público y creación por proveedores.
 */

import type { ICatalogStorage } from "../storage-contracts";
import type { InsertProvider, InsertService } from "@shared/schema";

export class CatalogService {
  constructor(private readonly storage: ICatalogStorage) {}

  async getCategories() {
    return this.storage.getCategories();
  }

  async getAllProviders(profession?: string) {
    return this.storage.getAllProviders(profession);
  }

  async getProvider(id: number) {
    return this.storage.getProvider(id);
  }

  async getProviderByUserId(userId: string) {
    return this.storage.getProviderByUserId(userId);
  }

  async createProvider(provider: InsertProvider) {
    return this.storage.createProvider(provider);
  }

  async getAllServices(categoryId?: number, search?: string) {
    return this.storage.getAllServices(categoryId, search);
  }

  async getService(id: number) {
    return this.storage.getService(id);
  }

  async createService(service: InsertService) {
    return this.storage.createService(service);
  }

  async seedCategories() {
    return this.storage.seedCategories();
  }
}

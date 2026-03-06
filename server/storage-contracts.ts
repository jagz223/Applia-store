/**
 * Contratos de almacenamiento por dominio (SOLID - Interface Segregation).
 * Cada interfaz agrupa solo los métodos que un cliente (servicio) necesita.
 * El almacenamiento completo (IStorage) se define en storage-genfeb y compone estos contratos.
 */

import type {
  Category,
  Provider,
  Service,
  Booking,
  InsertCategory,
  InsertProvider,
  InsertService,
  InsertBooking,
  ProviderWithUser,
  ServiceWithProvider,
} from "@shared/schema";

/** Contrato para operaciones de usuarios (auth, listado, CRUD). */
export interface IUserStorage {
  getUserById(id: string): Promise<unknown | undefined>;
  getUserByEmail(email: string): Promise<unknown | undefined>;
  getUsers(params: {
    role?: string;
    name?: string;
    email?: string;
    lastName?: string;
    page: number;
    limit: number;
  }): Promise<{ users: unknown[]; total: number }>;
  createUser(user: unknown): Promise<unknown>;
  updateUser(id: string, data: unknown): Promise<unknown | undefined>;
  updateUserPassword(id: string, password: string): Promise<void>;
}

/** Contrato para definición de roles (catálogo de roles del sistema). */
export interface IRoleStorage {
  getRoles(): Promise<unknown[]>;
  getRoleByCode(code: string): Promise<unknown | undefined>;
  createRole(role: unknown): Promise<unknown>;
  updateRole(code: string, data: unknown): Promise<unknown | undefined>;
  deleteRole(code: string): Promise<void>;
  seedRoles(): Promise<void>;
}

/** Datos parciales para actualizar un proveedor (solo campos editables). */
export type ProviderUpdate = Partial<
  Pick<Provider, "categoryId" | "category" | "profession" | "bio" | "yearsExperience" | "hourlyRate">
>;

/** Datos parciales para actualizar un servicio (solo campos editables). */
export type ServiceUpdate = Partial<
  Pick<Service, "title" | "description" | "price" | "imageUrl" | "isActive" | "categoryId">
>;

/** Contrato para catálogo: categorías, proveedores, servicios. */
export interface ICatalogStorage {
  getCategories(): Promise<Category[]>;
  getAllProviders(profession?: string, category?: string, categoryId?: number): Promise<Provider[]>;
  getProvider(id: number | null | undefined): Promise<Provider | undefined>;
  getProviderByUserId(userId: string): Promise<Provider | undefined>;
  createProvider(provider: InsertProvider): Promise<Provider>;
  updateProvider(id: number, data: ProviderUpdate): Promise<Provider | undefined>;
  deleteProvider(id: number): Promise<boolean>;
  getAllServices(categoryId?: number, search?: string, providerCategoryId?: number): Promise<ServiceWithProvider[]>;
  getService(id: number): Promise<ServiceWithProvider | undefined>;
  createService(service: InsertService): Promise<Service>;
  updateService(id: number, data: ServiceUpdate): Promise<Service | undefined>;
  deleteService(id: number): Promise<boolean>;
  seedCategories(): Promise<void>;
}

/** Contrato para reservas (bookings). */
export interface IBookingStorage {
  getBookingsByUser(userId: string, status?: string): Promise<(Booking & { service: ServiceWithProvider })[]>;
  getBookingsByProvider(providerId: number): Promise<(Booking & { service: ServiceWithProvider; user: unknown })[]>;
  getBooking(id: number): Promise<Booking | undefined>;
  createBooking(booking: InsertBooking & { status: string }): Promise<Booking>;
  updateBookingStatus(id: number, status: string): Promise<Booking | undefined>;
}

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

/** Contrato para catálogo: categorías, proveedores, servicios. */
export interface ICatalogStorage {
  getCategories(): Promise<Category[]>;
  getAllProviders(profession?: string): Promise<Provider[]>;
  getProvider(id: number): Promise<Provider | undefined>;
  getProviderByUserId(userId: string): Promise<Provider | undefined>;
  createProvider(provider: InsertProvider): Promise<Provider>;
  getAllServices(categoryId?: number, search?: string): Promise<ServiceWithProvider[]>;
  getService(id: number): Promise<ServiceWithProvider | undefined>;
  createService(service: InsertService): Promise<Service>;
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

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
import type { InsertProviderVehicle } from "@shared/vehicle-schema";

/** Contrato para operaciones de usuarios (auth, listado, CRUD). */
export interface IUserStorage {
  getUserById(id: string, includeDeleted?: boolean): Promise<unknown | undefined>;
  getUserByEmail(email: string, includeDeleted?: boolean): Promise<unknown | undefined>;
  getUserByPhone(phone: string, includeDeleted?: boolean): Promise<unknown | undefined>;
  getUsers(params: {
    role?: string;
    name?: string;
    email?: string;
    lastName?: string;
    search?: string;
    page: number;
    limit: number;
  }): Promise<{ users: unknown[]; total: number }>;
  createUser(user: unknown): Promise<unknown>;
  updateUser(id: string, data: unknown): Promise<unknown | undefined>;
  updateUserPassword(id: string, password: string): Promise<void>;
  deleteUser(id: string): Promise<void>;
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

/** Subcategoría (pertenece a una categoría). */
export interface Subcategory {
  id: number;
  name: string;
  slug: string;
  categoryId: number;
  categorySlug?: string;
  icon?: string | null;
}

/** Datos parciales para actualizar un proveedor (solo campos editables). */
export type ProviderUpdate = Partial<
  Pick<Provider, "categoryId" | "category" | "profession" | "bio" | "yearsExperience" | "hourlyRate" | "skills"> & {
    subcategoryId?: number | null;
  }
>;

/** Datos parciales para actualizar un servicio (solo campos editables). */
export type ServiceUpdate = Partial<
  Pick<Service, "title" | "description" | "price" | "imageUrl" | "isActive" | "categoryId"> & { subcategoryId?: number | null }
>;

/** Contrato para catálogo: categorías, subcategorías, proveedores, servicios. */
export interface ICatalogStorage {
  getCategories(): Promise<Category[]>;
  getSubcategories(categoryId: number): Promise<Subcategory[]>;
  getSubcategoryById(id: number): Promise<Subcategory | undefined>;
  getAllProviders(profession?: string, category?: string, categoryId?: number): Promise<Provider[]>;
  getProvider(id: number | null | undefined): Promise<Provider | undefined>;
  getProviderByUserId(userId: string): Promise<Provider | undefined>;
  createProvider(provider: InsertProvider): Promise<Provider>;
  /** Car Go: guarda un vehículo vinculado al proveedor (colección `vehicles` en Firestore). */
  createProviderVehicle(input: {
    providerId: number;
    userId: string;
    vehicle: InsertProviderVehicle;
  }): Promise<{ id: number }>;
  /** Primer vehículo del proveedor (p. ej. icono en mapa conductor y panel Car Go). */
  getPrimaryVehicleByProviderId(
    providerId: number
  ): Promise<{
    vehicle_type: string;
    brand?: string | null;
    model?: string | null;
    license_plate?: string | null;
    model_year?: number | null;
  } | null>;
  updateProvider(id: number, data: ProviderUpdate): Promise<Provider | undefined>;
  deleteProvider(id: number): Promise<boolean>;
  /**
   * @param includeUnverifiedForAdmin Si es true (solo panel admin), incluye servicios aunque el proveedor no esté verificado en plataforma.
   */
  getAllServices(
    categoryId?: number,
    search?: string,
    providerCategoryId?: number,
    subcategoryId?: number,
    includeUnverifiedForAdmin?: boolean
  ): Promise<ServiceWithProvider[]>;
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
  createBooking(booking: InsertBooking & { status: string; providerId?: number; paymentMethod?: string }): Promise<Booking>;
  updateBookingStatus(id: number, status: string): Promise<Booking | undefined>;
  /** Actualizar costo de la reserva (solo permitido cuando status es 'pending'). */
  updateBookingCost(id: number, cost: number): Promise<Booking | undefined>;
  /** Actualizar fecha/hora de la reserva (solo permitido cuando status es 'pending'). */
  updateBookingSchedule(id: number, date: Date): Promise<Booking | undefined>;
  /**
   * Confirmación del cliente (handshake/escrow): debita wallet del cliente y acredita su propio pendingBalance
   * (monto exacto del servicio). Solo válido si booking.status === 'confirmed'. Transacción ACID.
   */
  confirmBookingByClient(bookingId: number): Promise<Booking>;
  /**
   * Completar reserva y liberar escrow: monto exacto del servicio sale del pendingBalance del cliente
   * y entra en la wallet del profesional. Solo válido si confirmedByClient === true. Transacción ACID.
   */
  completeBookingAndReleaseEscrow(bookingId: number): Promise<Booking | undefined>;
  /**
   * Cancelación por el profesional cuando el cliente ya confirmó el pago:
   * el monto retenido sale del pendingBalance del cliente y regresa íntegramente a su wallet.
   * La reserva pasa a estado 'cancelled'. Transacción ACID.
   */
  cancelBookingAndRefundClientEscrow(bookingId: number): Promise<Booking | undefined>;
}

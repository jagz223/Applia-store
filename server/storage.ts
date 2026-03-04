import {
  users,
  categories,
  providers,
  services,
  bookings,
  type User,
  type Category,
  type Provider,
  type Service,
  type Booking,
  type InsertCategory,
  type InsertProvider,
  type InsertService,
  type InsertBooking,
  type ProviderWithUser,
  type ServiceWithProvider,
} from "@shared/schema";
import { eq, and, like, desc } from "drizzle-orm";
const getDb = async () => (await import("./db")).db;

/**
 * Contrato de almacenamiento de dominio.
 * Implementaciones:
 * - DatabaseStorage: Persistente vía Drizzle/Postgres.
 * - MemoryStorage: Fallback temporal en memoria (para desarrollo/sin DB).
 */
export interface IStorage {
  getCategories(): Promise<Category[]>;
  getAllProviders(profession?: string): Promise<Provider[]>;
  getProvider(id: number): Promise<Provider | undefined>;
  getProviderByUserId(userId: string): Promise<Provider | undefined>;
  createProvider(provider: InsertProvider): Promise<Provider>;
  getAllServices(categoryId?: number, search?: string): Promise<ServiceWithProvider[]>;
  getService(id: number): Promise<ServiceWithProvider | undefined>;
  createService(service: InsertService): Promise<Service>;
  getBookingsByUser(userId: string): Promise<(Booking & { service: Service })[]>;
  getBookingsByProvider(providerId: number): Promise<(Booking & { service: Service, user: User })[]>;
  getBooking(id: number): Promise<Booking | undefined>;
  createBooking(booking: InsertBooking): Promise<Booking>;
  updateBookingStatus(id: number, status: string): Promise<Booking | undefined>;
  seedCategories(): Promise<void>;
}

/**
 * Almacenamiento basado en base de datos (Drizzle + Postgres).
 * Se carga perezosamente la instancia de db para evitar fallos de import en entornos sin DB.
 */
export class DatabaseStorage implements IStorage {
  async getCategories(): Promise<Category[]> {
    const db = await getDb();
    return await db.select().from(categories);
  }

  async getAllProviders(profession?: string): Promise<Provider[]> {
    const db = await getDb();
    let query = db.select().from(providers);
    if (profession) {
      // @ts-ignore
      query = query.where(eq(providers.profession, profession));
    }
    return await query;
  }

  async getProvider(id: number): Promise<Provider | undefined> {
    const db = await getDb();
    const [provider] = await db.select().from(providers).where(eq(providers.id, id));
    return provider;
  }

  async getProviderByUserId(userId: string): Promise<Provider | undefined> {
    const db = await getDb();
    const [provider] = await db.select().from(providers).where(eq(providers.userId, userId));
    return provider;
  }

  async createProvider(insertProvider: InsertProvider): Promise<Provider> {
    const db = await getDb();
    const [provider] = await db.insert(providers).values(insertProvider).returning();
    return provider;
  }

  async getAllServices(categoryId?: number, search?: string): Promise<ServiceWithProvider[]> {
    const db = await getDb();
    const query = db.query.services.findMany({
      where: (services, { eq, and, ilike }) => {
        const conditions = [];
        if (categoryId) conditions.push(eq(services.categoryId, categoryId));
        if (search) conditions.push(ilike(services.title, `%${search}%`));
        return and(...conditions);
      },
      with: {
        provider: {
          with: { user: true }
        },
        category: true
      }
    });
    return await query;
  }

  async getService(id: number): Promise<ServiceWithProvider | undefined> {
    const db = await getDb();
    return await db.query.services.findFirst({
      where: eq(services.id, id),
      with: {
        provider: {
          with: { user: true }
        },
        category: true
      }
    });
  }

  async createService(insertService: InsertService): Promise<Service> {
    const db = await getDb();
    const [service] = await db.insert(services).values(insertService).returning();
    return service;
  }

  async getBookingsByUser(userId: string): Promise<(Booking & { service: Service })[]> {
    const db = await getDb();
    return await db.query.bookings.findMany({
      where: eq(bookings.userId, userId),
      with: { service: true },
      orderBy: desc(bookings.date)
    });
  }

  /**
   * Lista reservas de servicios pertenecientes a un proveedor.
   * @param providerId ID del proveedor.
   * @returns Arreglo de reservas incluyendo servicio y usuario.
   * @remarks Se obtienen los servicios del proveedor y se aplica inArray sobre serviceId.
   */
  async getBookingsByProvider(providerId: number): Promise<(Booking & { service: Service, user: User })[]> {
    /**
     * Obtiene reservas asociadas a un proveedor.
     * Estrategia: obtiene servicios del proveedor y filtra reservas por esos serviceId.
     */
    const db = await getDb();
    const myServices = await db.select().from(services).where(eq(services.providerId, providerId));
    const serviceIds = myServices.map(s => s.id);
    
    if (serviceIds.length === 0) return [];

    return await db.query.bookings.findMany({
      where: (booking, { inArray }) => inArray(booking.serviceId, serviceIds),
      with: {
        service: true,
        user: true
      },
      orderBy: desc(bookings.date)
    });
  }

  async getBooking(id: number): Promise<Booking | undefined> {
    const db = await getDb();
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    return booking;
  }

  /**
   * Crea una nueva reserva en la base de datos.
   * @param insertBooking Datos validados para insertar la reserva.
   * @returns La reserva creada.
   */
  async createBooking(insertBooking: InsertBooking): Promise<Booking> {
    const db = await getDb();
    const [booking] = await db.insert(bookings).values(insertBooking).returning();
    return booking;
  }

  /**
   * Actualiza el estado de una reserva existente.
   * @param id ID de la reserva.
   * @param status Nuevo estado: pending | confirmed | completed | cancelled.
   * @returns La reserva actualizada o undefined si no existe.
   */
  async updateBookingStatus(id: number, status: string): Promise<Booking | undefined> {
    const db = await getDb();
    const [booking] = await db.update(bookings)
      .set({ status })
      .where(eq(bookings.id, id))
      .returning();
    return booking;
  }

  /**
   * Inicializa categorías base si la tabla está vacía (idempotente).
   * Útil para ambientes de desarrollo o primeras ejecuciones.
   */
  async seedCategories(): Promise<void> {
    const db = await getDb();
    const count = await db.select({ count: categories.id }).from(categories);
    if (count.length > 0) return;

    await db.insert(categories).values([
      { name: "Plumbing", slug: "plumbing", type: "technical", icon: "Wrench", imageUrl: "https://images.unsplash.com/photo-1585704032915-c3400ca199e7?auto=format&fit=crop&q=80" },
      { name: "Electrical", slug: "electrical", type: "technical", icon: "Zap", imageUrl: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&q=80" },
      { name: "Cleaning", slug: "cleaning", type: "technical", icon: "SprayCan", imageUrl: "https://images.unsplash.com/photo-1581578731117-104f2a41272c?auto=format&fit=crop&q=80" },
      { name: "Tutoring", slug: "tutoring", type: "profession", icon: "BookOpen", imageUrl: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&q=80" },
      { name: "Beauty", slug: "beauty", type: "profession", icon: "Scissors", imageUrl: "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80" },
      { name: "Moving", slug: "moving", type: "technical", icon: "Truck", imageUrl: "https://images.unsplash.com/photo-1600518464441-9154a4dea21b?auto=format&fit=crop&q=80" },
    ]);
  }
}

/**
 * Almacenamiento en memoria: útil para ejecutar sin infraestructura.
 * No persistente: los datos se pierden al reiniciar.
 */
class MemoryStorage implements IStorage {
  private _categories: Category[] = [];
  private _providers: Provider[] = [];
  private _services: Service[] = [];
  private _bookings: Booking[] = [];
  private _providerId = 1;
  private _serviceId = 1;
  private _bookingId = 1;

  async getCategories(): Promise<Category[]> {
    return this._categories;
  }

  async getAllProviders(profession?: string): Promise<Provider[]> {
    return profession ? this._providers.filter((p) => p.profession === profession) : this._providers;
  }

  async getProvider(id: number): Promise<Provider | undefined> {
    return this._providers.find((p) => p.id === id);
  }

  async getProviderByUserId(userId: string): Promise<Provider | undefined> {
    return this._providers.find((p) => p.userId === userId);
  }

  async createProvider(insertProvider: InsertProvider): Promise<Provider> {
    const provider: Provider = {
      id: this._providerId++,
      isVerified: false,
      rating: "0",
      reviewCount: 0,
      ...insertProvider,
      hourlyRate: insertProvider.hourlyRate ?? null,
    };
    this._providers.push(provider);
    return provider;
  }

  async getAllServices(categoryId?: number, search?: string): Promise<ServiceWithProvider[]> {
    let list = this._services;
    if (categoryId !== undefined) {
      list = list.filter((s) => s.categoryId === categoryId);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.title.toLowerCase().includes(q));
    }
    return list.map((s) => {
      const provider = this._providers.find((p) => p.id === s.providerId)!;
      const user = { id: provider.userId } as unknown as User;
      return { ...s, provider: { ...provider, user }, category: this._categories.find((c) => c.id === s.categoryId)! } as ServiceWithProvider;
    });
  }

  async getService(id: number): Promise<ServiceWithProvider | undefined> {
    const s = this._services.find((x) => x.id === id);
    if (!s) return undefined;
    const provider = this._providers.find((p) => p.id === s.providerId)!;
    const user = { id: provider.userId } as unknown as User;
    return { ...s, provider: { ...provider, user }, category: this._categories.find((c) => c.id === s.categoryId)! } as ServiceWithProvider;
  }

  async createService(insertService: InsertService): Promise<Service> {
    const service: Service = { id: this._serviceId++, isActive: true, ...insertService };
    this._services.push(service);
    return service;
  }

  async getBookingsByUser(userId: string): Promise<(Booking & { service: Service })[]> {
    return this._bookings
      .filter((b) => b.userId === userId)
      .sort((a, b) => +b.date - +a.date)
      .map((b) => ({ ...b, service: this._services.find((s) => s.id === b.serviceId)! }));
  }

  async getBookingsByProvider(providerId: number): Promise<(Booking & { service: Service; user: User })[]> {
    const serviceIds = this._services.filter((s) => s.providerId === providerId).map((s) => s.id);
    return this._bookings
      .filter((b) => serviceIds.includes(b.serviceId))
      .sort((a, b) => +b.date - +a.date)
      .map((b) => {
        const service = this._services.find((s) => s.id === b.serviceId)!;
        const provider = this._providers.find((p) => p.id === service.providerId)!;
        const user = { id: provider.userId } as unknown as User;
        return { ...b, service, user };
      });
  }

  async getBooking(id: number): Promise<Booking | undefined> {
    return this._bookings.find((b) => b.id === id);
  }

  async createBooking(insertBooking: InsertBooking): Promise<Booking> {
    const booking: Booking = {
      id: this._bookingId++,
      status: "pending",
      createdAt: new Date(),
      ...insertBooking,
      notes: insertBooking.notes ?? null,
    };
    this._bookings.push(booking);
    return booking;
  }

  async updateBookingStatus(id: number, status: string): Promise<Booking | undefined> {
    const b = this._bookings.find((x) => x.id === id);
    if (!b) return undefined;
    b.status = status as any;
    return b;
  }

  async seedCategories(): Promise<void> {
    if (this._categories.length > 0) return;
    const seeds: Omit<Category, "id">[] = [
      { name: "Plumbing", slug: "plumbing", type: "technical", icon: "Wrench", imageUrl: "https://images.unsplash.com/photo-1585704032915-c3400ca199e7?auto=format&fit=crop&q=80" },
      { name: "Electrical", slug: "electrical", type: "technical", icon: "Zap", imageUrl: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&q=80" },
      { name: "Cleaning", slug: "cleaning", type: "technical", icon: "SprayCan", imageUrl: "https://images.unsplash.com/photo-1581578731117-104f2a41272c?auto=format&fit=crop&q=80" },
      { name: "Tutoring", slug: "tutoring", type: "profession", icon: "BookOpen", imageUrl: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&q=80" },
      { name: "Beauty", slug: "beauty", type: "profession", icon: "Scissors", imageUrl: "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80" },
      { name: "Moving", slug: "moving", type: "technical", icon: "Truck", imageUrl: "https://images.unsplash.com/photo-1600518464441-9154a4dea21b?auto=format&fit=crop&q=80" },
    ];
    this._categories = seeds.map((c, i) => ({ id: i + 1, ...c }));
  }
}

// Select storage based on environment configuration
// ENABLE_DATABASE=true uses DatabaseStorage (PostgreSQL/Drizzle)
// Otherwise falls back to MemoryStorage for development
const useDatabase = process.env.DATABASE_URL && process.env.ENABLE_DATABASE === "true";

export const storage = useDatabase ? new DatabaseStorage() : new MemoryStorage();

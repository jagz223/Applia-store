import { 
  users, categories, providers, services, bookings,
  type User, type Category, type Provider, type Service, type Booking,
  type InsertCategory, type InsertProvider, type InsertService, type InsertBooking,
  type ProviderWithUser, type ServiceWithProvider
} from "@shared/schema";
import { db } from "./db";
import { eq, and, like, desc } from "drizzle-orm";

export interface IStorage {
  // Categories
  getCategories(): Promise<Category[]>;
  
  // Providers
  getAllProviders(profession?: string): Promise<Provider[]>;
  getProvider(id: number): Promise<Provider | undefined>;
  getProviderByUserId(userId: string): Promise<Provider | undefined>;
  createProvider(provider: InsertProvider): Promise<Provider>;
  
  // Services
  getAllServices(categoryId?: number, search?: string): Promise<ServiceWithProvider[]>;
  getService(id: number): Promise<ServiceWithProvider | undefined>;
  createService(service: InsertService): Promise<Service>;
  
  // Bookings
  getBookingsByUser(userId: string): Promise<(Booking & { service: Service })[]>;
  getBookingsByProvider(providerId: number): Promise<(Booking & { service: Service, user: User })[]>;
  createBooking(booking: InsertBooking): Promise<Booking>;
  updateBookingStatus(id: number, status: string): Promise<Booking | undefined>;

  // Seed helper
  seedCategories(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getCategories(): Promise<Category[]> {
    return await db.select().from(categories);
  }

  async getAllProviders(profession?: string): Promise<Provider[]> {
    let query = db.select().from(providers);
    if (profession) {
      // @ts-ignore
      query = query.where(eq(providers.profession, profession));
    }
    return await query;
  }

  async getProvider(id: number): Promise<Provider | undefined> {
    const [provider] = await db.select().from(providers).where(eq(providers.id, id));
    return provider;
  }

  async getProviderByUserId(userId: string): Promise<Provider | undefined> {
    const [provider] = await db.select().from(providers).where(eq(providers.userId, userId));
    return provider;
  }

  async createProvider(insertProvider: InsertProvider): Promise<Provider> {
    const [provider] = await db.insert(providers).values(insertProvider).returning();
    return provider;
  }

  async getAllServices(categoryId?: number, search?: string): Promise<ServiceWithProvider[]> {
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
    const [service] = await db.insert(services).values(insertService).returning();
    return service;
  }

  async getBookingsByUser(userId: string): Promise<(Booking & { service: Service })[]> {
    return await db.query.bookings.findMany({
      where: eq(bookings.userId, userId),
      with: { service: true },
      orderBy: desc(bookings.date)
    });
  }

  async getBookingsByProvider(providerId: number): Promise<(Booking & { service: Service, user: User })[]> {
    // We need to join bookings -> services -> providers
    // This is a bit complex with drizzle queries if not direct relation.
    // But services have providerId.
    // Let's first find all services by this provider, then bookings for those services.
    
    // Actually, let's just do a join manually or use findMany if we can filter by nested.
    // Drizzle doesn't support deep nested filtering easily in query builder without some work.
    // Easier way:
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

  async createBooking(insertBooking: InsertBooking): Promise<Booking> {
    const [booking] = await db.insert(bookings).values(insertBooking).returning();
    return booking;
  }

  async updateBookingStatus(id: number, status: string): Promise<Booking | undefined> {
    const [booking] = await db.update(bookings)
      .set({ status })
      .where(eq(bookings.id, id))
      .returning();
    return booking;
  }

  async seedCategories(): Promise<void> {
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

export const storage = new DatabaseStorage();
